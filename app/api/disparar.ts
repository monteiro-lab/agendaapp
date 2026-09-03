import type { VercelRequest, VercelResponse } from '@vercel/node'
import webpush from 'web-push'
import { pool } from './_lib/db.js'
import { erroInterno, segredoConfere, segredoDoHeader } from './_lib/http.js'

/** Teto por rodada: o cron bate a cada minuto, então nunca acumula muito. */
const MAX_POR_RODADA = 200

interface LembreteVencido {
  id: string
  ocorrencia_uid: string
  inscricao_id: string
  endpoint: string
  p256dh: string
  auth: string
}

/**
 * GET /api/disparar   (header: Authorization: Bearer $DISPARAR_SECRET)
 *
 * O "despertador": pega os lembretes vencidos e manda o push com **apenas o
 * uid**. Quem monta a notificação com nome e detalhes é o service worker, lendo
 * o banco local do aparelho. Chamada pelo crontab da máquina do Postgres a cada
 * minuto (o cron da Vercel no Hobby só roda 1x/dia).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Segredo primeiro: nada de banco antes de autenticar.
  const segredo = process.env.DISPARAR_SECRET
  if (!segredo) {
    console.error('[disparar] DISPARAR_SECRET não configurado.')
    res.status(500).json({ erro: 'Falha interna.' })
    return
  }
  if (!segredoConfere(segredoDoHeader(req), segredo)) {
    res.status(401).json({ erro: 'Não autorizado.' })
    return
  }
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET')
    res.status(405).json({ erro: 'Método não permitido.' })
    return
  }

  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) {
    console.error('[disparar] chaves VAPID não configuradas.')
    res.status(500).json({ erro: 'Falha interna.' })
    return
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

  try {
    const { rows } = await pool().query<LembreteVencido>(
      `select l.id, l.ocorrencia_uid, i.id as inscricao_id, i.endpoint, i.p256dh, i.auth
         from lembretes l
         join inscricoes_push i on i.id = l.inscricao_id
        where not l.enviado
          and l.disparar_em <= now()
          -- Janela de retentativa: o push tem TTL de 15 min, então lembrete
          -- vencido há mais de 1 hora não serve mais — e sem isso um envio
          -- que falha de vez seria retentado a cada minuto, para sempre.
          and l.disparar_em > now() - interval '1 hour'
        order by l.disparar_em
        limit $1`,
      [MAX_POR_RODADA],
    )

    if (rows.length === 0) {
      res.status(200).json({ ok: true, enviados: 0, falhas: 0, inscricoesRemovidas: 0 })
      return
    }

    const enviados: string[] = []
    const mortas = new Set<string>()
    let falhas = 0

    await Promise.all(
      rows.map(async (l) => {
        try {
          await webpush.sendNotification(
            { endpoint: l.endpoint, keys: { p256dh: l.p256dh, auth: l.auth } },
            // Só o id opaco. Nenhum dado de paciente sai daqui.
            JSON.stringify({ uid: l.ocorrencia_uid }),
            { TTL: 15 * 60, urgency: 'high' },
          )
          enviados.push(l.id)
        } catch (erro) {
          const status = (erro as { statusCode?: number }).statusCode
          if (status === 404 || status === 410) {
            // Inscrição morta: o cascade leva junto os lembretes dela.
            mortas.add(l.inscricao_id)
          } else {
            falhas++
            console.error('[disparar] envio falhou', status ?? erro)
          }
        }
      }),
    )

    if (enviados.length) {
      await pool().query('update lembretes set enviado = true where id = any($1::bigint[])', [
        enviados,
      ])
    }
    if (mortas.size) {
      await pool().query('delete from inscricoes_push where id = any($1::bigint[])', [
        [...mortas],
      ])
    }

    // Faxina: lembrete já enviado e velho não serve para mais nada.
    await pool().query(
      "delete from lembretes where enviado and disparar_em < now() - interval '7 days'",
    )

    res.status(200).json({
      ok: true,
      enviados: enviados.length,
      falhas,
      inscricoesRemovidas: mortas.size,
    })
  } catch (erro) {
    erroInterno(res, 'disparar', erro)
  }
}
