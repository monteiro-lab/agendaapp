/**
 * Permissão e inscrição Web Push.
 *
 * No iOS (16.4+) isso só funciona com o PWA instalado na tela inicial, e a
 * permissão precisa nascer de um toque do usuário — daí tudo aqui ser chamado
 * a partir do clique de um botão, nunca no carregamento.
 */

const API_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '')
const CHAVE_VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? ''

export type EstadoPush =
  | 'sem-suporte'
  | 'precisa-instalar'
  | 'sem-chave'
  | 'negada'
  | 'desligada'
  | 'ligada'

export const url = (caminho: string): string => `${API_BASE}${caminho}`

/**
 * A chave VAPID vai em base64url; o navegador quer bytes.
 * O ArrayBuffer é criado explicitamente porque `applicationServerKey` não
 * aceita um Uint8Array que possa estar sobre SharedArrayBuffer.
 */
function chaveParaBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const preenchido = base64url.padEnd(base64url.length + ((4 - (base64url.length % 4)) % 4), '=')
  const bruto = atob(preenchido.replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = new Uint8Array(new ArrayBuffer(bruto.length))
  for (let i = 0; i < bruto.length; i++) bytes[i] = bruto.charCodeAt(i)
  return bytes
}

export function estaInstalado(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

/** iOS só expõe PushManager dentro do PWA instalado. */
export function temSuporte(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export async function estadoAtual(): Promise<EstadoPush> {
  if (!temSuporte()) return estaInstalado() ? 'sem-suporte' : 'precisa-instalar'
  if (!CHAVE_VAPID) return 'sem-chave'
  if (Notification.permission === 'denied') return 'negada'
  const reg = await navigator.serviceWorker.ready
  const inscricao = await reg.pushManager.getSubscription()
  return inscricao ? 'ligada' : 'desligada'
}

export async function obterInscricao(): Promise<PushSubscription | null> {
  if (!temSuporte()) return null
  const reg = await navigator.serviceWorker.ready
  return reg.pushManager.getSubscription()
}

/**
 * Pede permissão, inscreve no serviço de push e registra no servidor.
 * Precisa ser chamada de dentro de um handler de toque.
 */
export async function ativarLembretes(): Promise<PushSubscription> {
  if (!temSuporte()) {
    throw new Error(
      estaInstalado()
        ? 'Este navegador não suporta notificações.'
        : 'Instale o app na tela inicial para ativar os lembretes.',
    )
  }
  if (!CHAVE_VAPID) throw new Error('VITE_VAPID_PUBLIC_KEY não configurada no build.')

  const permissao = await Notification.requestPermission()
  if (permissao !== 'granted') throw new Error('Permissão de notificação negada.')

  const reg = await navigator.serviceWorker.ready
  const inscricao =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: chaveParaBytes(CHAVE_VAPID),
    }))

  await registrarNoServidor(inscricao)
  return inscricao
}

/** Manda ao servidor só o que ele precisa para acordar o aparelho. */
export async function registrarNoServidor(inscricao: PushSubscription): Promise<void> {
  const bruto = inscricao.toJSON()
  const resposta = await fetch(url('/api/inscrever'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      endpoint: inscricao.endpoint,
      keys: { p256dh: bruto.keys?.p256dh, auth: bruto.keys?.auth },
    }),
  })
  if (!resposta.ok) {
    throw new Error(`Falha ao registrar a inscrição (${resposta.status}).`)
  }
}

export async function desativarLembretes(): Promise<void> {
  const inscricao = await obterInscricao()
  await inscricao?.unsubscribe()
}

/**
 * Manda um push de teste na hora, via /api/testar-push — sem passar pela
 * fila de lembretes nem esperar um atendimento real. Prova que a cadeia
 * inteira (servidor → push → service worker → notificação) funciona.
 */
export async function testarNotificacao(): Promise<void> {
  const inscricao = await obterInscricao()
  if (!inscricao) throw new Error('Ative os lembretes primeiro.')

  const resposta = await fetch(url('/api/testar-push'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ endpoint: inscricao.endpoint }),
  })
  if (!resposta.ok) {
    const corpo = (await resposta.json().catch(() => null)) as { erro?: string } | null
    throw new Error(corpo?.erro ?? `Falha ao testar (${resposta.status}).`)
  }
}
