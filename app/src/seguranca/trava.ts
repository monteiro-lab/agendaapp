import { db } from '../db/db'

/**
 * Trava de abertura do app (SPEC §11): PIN ou biometria.
 *
 * O que ela é: um **portão de tela**. Impede que alguém que pegou o iPhone
 * desbloqueado abra a agenda e leia nomes de pacientes.
 *
 * O que ela não é: criptografia dos dados. O IndexedDB continua legível para
 * quem tiver acesso técnico ao aparelho. Criptografar em repouso com chave
 * derivada do PIN quebraria o lembrete — o service worker precisa ler o nome
 * com o app fechado, sem ter como pedir o PIN.
 */

const CHAVE_CONFIG = 'trava'
const ITERACOES = 210_000

export type TipoTrava = 'nenhuma' | 'pin' | 'biometria'

interface ConfigTrava {
  tipo: TipoTrava
  /** PIN: hash PBKDF2 + sal, ambos em base64. Nunca o PIN em texto. */
  hash?: string
  sal?: string
  /** Biometria: id da credencial WebAuthn deste aparelho. */
  credencialId?: string
  /** Minutos em segundo plano antes de exigir a trava de novo. */
  minutosOciosa: number
}

const PADRAO: ConfigTrava = { tipo: 'nenhuma', minutosOciosa: 5 }

export async function lerConfig(): Promise<ConfigTrava> {
  const linha = await db.config.get(CHAVE_CONFIG)
  return { ...PADRAO, ...((linha?.valor as Partial<ConfigTrava>) ?? {}) }
}

async function gravarConfig(config: ConfigTrava): Promise<void> {
  await db.config.put({ chave: CHAVE_CONFIG, valor: config })
}

// ------------------------------------------------------------------ PIN

const paraBase64 = (b: ArrayBuffer | Uint8Array): string =>
  btoa(String.fromCharCode(...new Uint8Array(b instanceof Uint8Array ? b.buffer : b)))

/** Uint8Array com ArrayBuffer próprio — as APIs de credencial exigem isso. */
function deBase64(s: string): Uint8Array<ArrayBuffer> {
  const bruto = atob(s)
  const bytes = new Uint8Array(new ArrayBuffer(bruto.length))
  for (let i = 0; i < bruto.length; i++) bytes[i] = bruto.charCodeAt(i)
  return bytes
}

async function derivar(pin: string, sal: Uint8Array<ArrayBuffer>): Promise<string> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, [
    'deriveBits',
  ])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: sal as BufferSource, iterations: ITERACOES, hash: 'SHA-256' },
    base,
    256,
  )
  return paraBase64(bits)
}

export async function definirPin(pin: string): Promise<void> {
  if (!/^\d{4,10}$/.test(pin)) throw new Error('O PIN precisa ter de 4 a 10 dígitos.')
  const sal = crypto.getRandomValues(new Uint8Array(16))
  await gravarConfig({
    ...(await lerConfig()),
    tipo: 'pin',
    hash: await derivar(pin, sal),
    sal: paraBase64(sal),
    credencialId: undefined,
  })
}

export async function conferirPin(pin: string): Promise<boolean> {
  const config = await lerConfig()
  if (config.tipo !== 'pin' || !config.hash || !config.sal) return false
  return (await derivar(pin, deBase64(config.sal))) === config.hash
}

// ------------------------------------------------------------ biometria

export function biometriaDisponivel(): boolean {
  return typeof PublicKeyCredential !== 'undefined' && !!navigator.credentials
}

/**
 * Registra uma credencial de plataforma (Face ID / Touch ID). A chave privada
 * fica no Secure Enclave do aparelho; guardamos só o id da credencial.
 */
export async function ativarBiometria(): Promise<void> {
  if (!biometriaDisponivel()) throw new Error('Este aparelho não oferece biometria no navegador.')

  const credencial = (await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: 'Agenda de Atendimentos', id: location.hostname },
      user: {
        // Identificador local do aparelho — não é dado pessoal.
        id: crypto.getRandomValues(new Uint8Array(16)),
        name: 'agenda',
        displayName: 'Agenda',
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
      },
      timeout: 60_000,
      attestation: 'none',
    },
  })) as PublicKeyCredential | null

  if (!credencial) throw new Error('Não foi possível registrar a biometria.')

  await gravarConfig({
    ...(await lerConfig()),
    tipo: 'biometria',
    credencialId: paraBase64(credencial.rawId),
    hash: undefined,
    sal: undefined,
  })
}

export async function conferirBiometria(): Promise<boolean> {
  const config = await lerConfig()
  if (config.tipo !== 'biometria' || !config.credencialId) return false
  try {
    const resposta = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ type: 'public-key', id: deBase64(config.credencialId) }],
        userVerification: 'required',
        timeout: 60_000,
      },
    })
    return resposta !== null
  } catch {
    // Cancelou ou falhou o Face ID: continua trancado.
    return false
  }
}

// --------------------------------------------------------------- geral

export async function desativarTrava(): Promise<void> {
  await gravarConfig({ ...PADRAO })
}

export async function definirOciosidade(minutos: number): Promise<void> {
  await gravarConfig({ ...(await lerConfig()), minutosOciosa: Math.max(0, minutos) })
}

/** Momento da última liberação, para saber se já passou o tempo de ociosidade. */
const CHAVE_SESSAO = 'agenda:destravado-em'

export function marcarDestravado(): void {
  try {
    sessionStorage.setItem(CHAVE_SESSAO, String(Date.now()))
  } catch {
    // Modo privado pode recusar: nesse caso a trava aparece mais vezes.
  }
}

export async function precisaDestravar(): Promise<boolean> {
  const config = await lerConfig()
  if (config.tipo === 'nenhuma') return false
  try {
    const marca = Number(sessionStorage.getItem(CHAVE_SESSAO) ?? 0)
    if (!marca) return true
    return Date.now() - marca > config.minutosOciosa * 60_000
  } catch {
    return true
  }
}
