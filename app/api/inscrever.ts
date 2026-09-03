import type { VercelRequest, VercelResponse } from '@vercel/node'
import { pool } from './_lib/db'
import {
  apenasMetodo,
  chaveValida,
  corpoJson,
  endpointValido,
  erroInterno,
} from './_lib/http'

/**
 * POST /api/inscrever
 * Corpo: { endpoint, keys: { p256dh, auth } }
 *
 * Guarda a inscrição Web Push do aparelho. Não recebe — e não deve receber —
 * nada além disso: nome de paciente não passa por aqui.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!apenasMetodo(req, res, 'POST')) return

  const corpo = corpoJson(req)
  const endpoint = corpo.endpoint
  const keys = (corpo.keys ?? {}) as Record<string, unknown>

  if (!endpointValido(endpoint)) {
    res.status(400).json({ erro: 'endpoint inválido.' })
    return
  }
  if (!chaveValida(keys.p256dh) || !chaveValida(keys.auth)) {
    res.status(400).json({ erro: 'chaves da inscrição inválidas.' })
    return
  }

  try {
    const { rows } = await pool().query<{ id: string }>(
      `insert into inscricoes_push (endpoint, p256dh, auth)
       values ($1, $2, $3)
       on conflict (endpoint)
       do update set p256dh = excluded.p256dh, auth = excluded.auth
       returning id`,
      [endpoint, keys.p256dh, keys.auth],
    )
    res.status(200).json({ ok: true, id: rows[0].id })
  } catch (erro) {
    erroInterno(res, 'inscrever', erro)
  }
}
