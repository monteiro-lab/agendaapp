import type { VercelRequest, VercelResponse } from '@vercel/node'
import webpush from 'web-push'
import { pool } from './_lib/db.js'
import { apenasMetodo, corpoJson, endpointValido, erroInterno } from './_lib/http.js'

/**
 * POST /api/testar-push
 * Corpo: { endpoint }
 *
 * Manda um push de teste na hora, sem passar pela fila de lembretes e sem
 * o DISPARAR_SECRET — que não pode ir para o bundle do cliente. A "prova de
 * identidade" aqui é a mesma que /api/inscrever já usa: só quem tem aquela
 * inscrição sabe o próprio endpoint. As chaves de criptografia continuam
 * só no servidor; o cliente nunca as vê de volta.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!apenasMetodo(req, res, 'POST')) return

  const { endpoint } = corpoJson(req)
  if (!endpointValido(endpoint)) {
    res.status(400).json({ erro: 'endpoint inválido.' })
    return
  }

  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) {
    console.error('[testar-push] chaves VAPID não configuradas.')
    res.status(500).json({ erro: 'Falha interna.' })
    return
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

  try {
    const { rows } = await pool().query<{ p256dh: string; auth: string }>(
      'select p256dh, auth from inscricoes_push where endpoint = $1',
      [endpoint],
    )
    if (rows.length === 0) {
      res.status(404).json({ erro: 'inscrição desconhecida — refaça /api/inscrever.' })
      return
    }

    await webpush.sendNotification(
      { endpoint, keys: { p256dh: rows[0].p256dh, auth: rows[0].auth } },
      // "teste" é um uid que nunca existirá no Dexie: o service worker cai
      // no texto de teste específico em vez do genérico de lembrete.
      JSON.stringify({ uid: 'teste' }),
      { TTL: 60, urgency: 'high' },
    )
    res.status(200).json({ ok: true })
  } catch (erro) {
    const status = (erro as { statusCode?: number }).statusCode
    if (status === 404 || status === 410) {
      await pool().query('delete from inscricoes_push where endpoint = $1', [endpoint])
      res.status(410).json({ erro: 'Inscrição expirada — ative os lembretes de novo.' })
      return
    }
    erroInterno(res, 'testar-push', erro)
  }
}
