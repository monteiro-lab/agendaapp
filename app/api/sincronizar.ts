import type { VercelRequest, VercelResponse } from '@vercel/node'
import { pool } from './_lib/db'
import {
  apenasMetodo,
  corpoJson,
  endpointValido,
  erroInterno,
  instanteValido,
  uidValido,
} from './_lib/http'

/** Teto por sincronização: 30 dias de agenda cabem folgado. */
const MAX_LEMBRETES = 500

/**
 * POST /api/sincronizar
 * Corpo: { endpoint, lembretes: [{ uid, disparar_em }] }
 *
 * O aparelho manda **só** id opaco + instante. Faz upsert do que veio e apaga
 * os lembretes futuros que sumiram da agenda (atendimento cancelado ou movido).
 * O passado fica: já foi enviado, e apagar não muda nada.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!apenasMetodo(req, res, 'POST')) return

  const corpo = corpoJson(req)
  const endpoint = corpo.endpoint
  const lista = corpo.lembretes

  if (!endpointValido(endpoint)) {
    res.status(400).json({ erro: 'endpoint inválido.' })
    return
  }
  if (!Array.isArray(lista) || lista.length > MAX_LEMBRETES) {
    res.status(400).json({ erro: `lembretes deve ser uma lista de até ${MAX_LEMBRETES}.` })
    return
  }

  const uids: string[] = []
  const instantes: string[] = []
  for (const item of lista) {
    const l = (item ?? {}) as Record<string, unknown>
    // Rejeita em bloco: um único item malformado (ou com campo a mais que não
    // deveria existir) invalida a sincronização inteira.
    if (!uidValido(l.uid) || !instanteValido(l.disparar_em)) {
      res.status(400).json({ erro: 'lembrete inválido: use { uid, disparar_em }.' })
      return
    }
    uids.push(l.uid)
    instantes.push(new Date(l.disparar_em).toISOString())
  }

  const cliente = await pool().connect()
  try {
    await cliente.query('begin')

    const inscricao = await cliente.query<{ id: string }>(
      'select id from inscricoes_push where endpoint = $1',
      [endpoint],
    )
    if (inscricao.rowCount === 0) {
      await cliente.query('rollback')
      res.status(404).json({ erro: 'inscrição desconhecida — refaça /api/inscrever.' })
      return
    }
    const inscricaoId = inscricao.rows[0].id

    // 1) Upsert. Mudou o horário? Volta para a fila (enviado = false).
    const upsert = await cliente.query(
      `insert into lembretes (inscricao_id, ocorrencia_uid, disparar_em)
       select $1, u.uid, u.quando
         from unnest($2::text[], $3::timestamptz[]) as u(uid, quando)
       on conflict (inscricao_id, ocorrencia_uid) do update
          set disparar_em = excluded.disparar_em,
              enviado = case when lembretes.disparar_em <> excluded.disparar_em
                             then false else lembretes.enviado end`,
      [inscricaoId, uids, instantes],
    )

    // 2) O que sumiu da agenda não deve mais tocar.
    const removidos = await cliente.query(
      `delete from lembretes
        where inscricao_id = $1
          and disparar_em > now()
          and not (ocorrencia_uid = any($2::text[]))`,
      [inscricaoId, uids],
    )

    await cliente.query('commit')
    res.status(200).json({
      ok: true,
      sincronizados: upsert.rowCount ?? 0,
      removidos: removidos.rowCount ?? 0,
    })
  } catch (erro) {
    await cliente.query('rollback').catch(() => {})
    erroInterno(res, 'sincronizar', erro)
  } finally {
    cliente.release()
  }
}
