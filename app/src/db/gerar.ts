import { db } from './db'
import { novoUid } from './uid'
import { horaEmMinutos, type Ocorrencia, type Recorrencia } from './tipos'
import { datasDaSemana, diaSemanaDe, hojeISO, inicioDaSemana, somarDias } from './semana'

export interface ResumoGeracao {
  criadas: number
  jaExistiam: number
  removidasOrfas: number
  de: string
  ate: string
}

/** Os dias úteis (seg–sex) do intervalo fechado [de, ate]. */
export function diasUteisNoIntervalo(de: string, ate: string): string[] {
  const dias: string[] = []
  let cursor = inicioDaSemana(de)
  while (cursor <= ate) {
    for (const data of datasDaSemana(cursor)) {
      if (data >= de && data <= ate) dias.push(data)
    }
    cursor = somarDias(cursor, 7)
  }
  return dias
}

/**
 * Materializa as recorrências ativas como ocorrências concretas dos próximos
 * `diasAFrente` dias. Cada ocorrência nasce com um `id` opaco — é esse UID que
 * a Tarefa 7 manda para o servidor, sozinho, sem nome de paciente.
 *
 * Idempotente: rodar de novo não duplica (chave lógica `recorrenciaId + data`).
 */
export async function gerarOcorrencias(
  opcoes: { diasAFrente?: number; apartirDe?: string } = {},
): Promise<ResumoGeracao> {
  const { diasAFrente = 30, apartirDe = hojeISO() } = opcoes
  const de = apartirDe
  const ate = somarDias(de, diasAFrente)

  const resumo: ResumoGeracao = { criadas: 0, jaExistiam: 0, removidasOrfas: 0, de, ate }

  await db.transaction('rw', db.recorrencias, db.ocorrencias, async () => {
    const recorrencias = await db.recorrencias.toArray()
    const noPeriodo = await db.ocorrencias.where('data').between(de, ate, true, true).toArray()

    const porRecorrencia = new Map<string, Ocorrencia>()
    for (const o of noPeriodo) {
      if (o.recorrenciaId) porRecorrencia.set(`${o.recorrenciaId}|${o.data}`, o)
    }

    const ativasPorDia = new Map<number, Recorrencia[]>()
    for (const r of recorrencias) {
      if (!r.ativa) continue
      const lista = ativasPorDia.get(r.diaSemana) ?? []
      lista.push(r)
      ativasPorDia.set(r.diaSemana, lista)
    }

    const novas: Ocorrencia[] = []
    for (const data of diasUteisNoIntervalo(de, ate)) {
      for (const r of ativasPorDia.get(diaSemanaDe(data)) ?? []) {
        if (r.pausadaAte && data <= r.pausadaAte) continue // dentro da pausa: não materializa
        if (porRecorrencia.has(`${r.id}|${data}`)) {
          resumo.jaExistiam++
          continue
        }
        novas.push({
          id: novoUid(),
          recorrenciaId: r.id,
          pacienteId: r.pacienteId,
          data,
          hora: r.hora,
          status: 'agendada',
        })
        resumo.criadas++
      }
    }
    if (novas.length) await db.ocorrencias.bulkAdd(novas)

    // Limpeza conservadora: some com o que virou órfão (série desativada) ou
    // caiu numa pausa recém-marcada, mas só o que ainda está intocado.
    // Passado e ocorrências editadas (realizada/cancelada/com observação)
    // ficam como estão.
    const idsAtivos = new Set(recorrencias.filter((r) => r.ativa).map((r) => r.id))
    const pausaPorRecorrencia = new Map(
      recorrencias.filter((r) => r.ativa && r.pausadaAte).map((r) => [r.id, r.pausadaAte!]),
    )
    const orfas = noPeriodo
      .filter((o) => {
        if (o.recorrenciaId === null || o.data < de || o.status !== 'agendada' || o.observacoes) {
          return false
        }
        const pausadaAte = pausaPorRecorrencia.get(o.recorrenciaId)
        const dentroDaPausa = pausadaAte !== undefined && o.data <= pausadaAte
        return !idsAtivos.has(o.recorrenciaId) || dentroDaPausa
      })
      .map((o) => o.id)
    if (orfas.length) {
      await db.ocorrencias.bulkDelete(orfas)
      resumo.removidasOrfas = orfas.length
    }
  })

  return resumo
}

/**
 * As ocorrências ainda por acontecer na janela, em ordem cronológica.
 * É a base do que a Tarefa 7 sincroniza como lembretes (só os UIDs saem daqui).
 */
export async function listarProximas(diasAFrente = 30, apartirDe = hojeISO()) {
  const ate = somarDias(apartirDe, diasAFrente)
  const lista = await db.ocorrencias.where('data').between(apartirDe, ate, true, true).toArray()
  return lista
    .filter((o) => o.status === 'agendada' || o.status === 'remarcada')
    .sort(
      (a, b) => a.data.localeCompare(b.data) || horaEmMinutos(a.hora) - horaEmMinutos(b.hora),
    )
}

/**
 * Propaga uma mudança da série para as ocorrências futuras já materializadas.
 * Só mexe no que ainda está `agendada` — data passada e ocorrência editada
 * (remarcada, cancelada, realizada ou com observação) ficam intactas.
 */
export async function propagarParaFuturas(
  recorrenciaId: string,
  mudancas: { hora?: string; pacienteId?: string | null },
  apartirDe: string = hojeISO(),
): Promise<number> {
  return db.ocorrencias
    .where('recorrenciaId')
    .equals(recorrenciaId)
    .filter((o) => o.data >= apartirDe && o.status === 'agendada' && !o.observacoes)
    .modify(mudancas)
}
