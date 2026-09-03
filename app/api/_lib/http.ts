import type { VercelRequest, VercelResponse } from '@vercel/node'
import { timingSafeEqual } from 'node:crypto'

export function apenasMetodo(
  req: VercelRequest,
  res: VercelResponse,
  metodo: 'GET' | 'POST',
): boolean {
  if (req.method === metodo) return true
  res.setHeader('Allow', metodo)
  res.status(405).json({ erro: 'Método não permitido.' })
  return false
}

/** Comparação de tempo constante — não vaza o segredo por tempo de resposta. */
export function segredoConfere(recebido: string | undefined, esperado: string): boolean {
  if (!recebido || !esperado) return false
  const a = Buffer.from(recebido)
  const b = Buffer.from(esperado)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export function segredoDoHeader(req: VercelRequest): string | undefined {
  const cabecalho = req.headers.authorization
  if (!cabecalho) return undefined
  const [tipo, valor] = cabecalho.split(' ')
  return tipo?.toLowerCase() === 'bearer' ? valor : undefined
}

/**
 * O id opaco da ocorrência: UUID v4 ou 32 hex (o fallback do cliente).
 * Validar o formato garante que só id opaco entra no servidor — nome de
 * paciente não passa nem por engano.
 */
const RE_UID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$|^[0-9a-f]{32}$/i

export const uidValido = (v: unknown): v is string => typeof v === 'string' && RE_UID.test(v)

/** Endpoint de push: precisa ser HTTPS e de tamanho sensato. */
export function endpointValido(v: unknown): v is string {
  if (typeof v !== 'string' || v.length > 1000) return false
  try {
    return new URL(v).protocol === 'https:'
  } catch {
    return false
  }
}

export const chaveValida = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= 256 && /^[A-Za-z0-9_-]+=*$/.test(v)

/** ISO-8601 dentro de uma janela plausível (até 60 dias à frente). */
export function instanteValido(v: unknown): v is string {
  if (typeof v !== 'string' || v.length > 40) return false
  const t = Date.parse(v)
  if (Number.isNaN(t)) return false
  const agora = Date.now()
  return t > agora - 7 * 864e5 && t < agora + 60 * 864e5
}

export function corpoJson(req: VercelRequest): Record<string, unknown> {
  const corpo = req.body
  if (typeof corpo === 'string') {
    try {
      return JSON.parse(corpo) as Record<string, unknown>
    } catch {
      return {}
    }
  }
  return (corpo ?? {}) as Record<string, unknown>
}

/** Nunca devolve detalhe interno ao cliente; o detalhe fica no log da função. */
export function erroInterno(res: VercelResponse, contexto: string, erro: unknown): void {
  console.error(`[${contexto}]`, erro)
  res.status(500).json({ erro: 'Falha interna.' })
}
