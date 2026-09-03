import { listarProximas } from '../db'
import { obterInscricao, url } from './inscricao'

/** Folga do lembrete: o iOS pode atrasar o push alguns minutos (SPEC §3). */
export const MINUTOS_ANTES = 15

export interface LembreteParaServidor {
  /** O id opaco da ocorrência. É a única coisa que o servidor conhece. */
  uid: string
  /** Instante do disparo, em ISO/UTC. */
  disparar_em: string
}

export interface ResultadoSync {
  enviados: number
  sincronizados: number
  removidos: number
}

/**
 * Converte as ocorrências locais em lembretes para o servidor.
 *
 * Repare no que **não** entra: nome, telefone, observações, status. O objeto é
 * montado campo a campo de propósito — serializar a ocorrência inteira mandaria
 * dado de paciente para fora do aparelho.
 */
export async function montarLembretes(diasAFrente = 30): Promise<LembreteParaServidor[]> {
  const ocorrencias = await listarProximas(diasAFrente)
  const agora = Date.now()

  return ocorrencias
    .filter((o) => o.pacienteId !== null) // slot VAGO não precisa de lembrete
    .map((o) => {
      const [ano, mes, dia] = o.data.split('-').map(Number)
      const [hora, minuto] = o.hora.split(':').map(Number)
      const inicio = new Date(ano, mes - 1, dia, hora, minuto, 0, 0)
      return {
        uid: o.id,
        disparar_em: new Date(inicio.getTime() - MINUTOS_ANTES * 60_000).toISOString(),
      }
    })
    .filter((l) => Date.parse(l.disparar_em) > agora)
    .sort((a, b) => a.disparar_em.localeCompare(b.disparar_em))
}

/**
 * Manda a lista para /api/sincronizar. Sem inscrição push ativa não há o que
 * fazer — devolve `null` em vez de erro (é o caso normal antes de ativar).
 */
export async function sincronizarLembretes(diasAFrente = 30): Promise<ResultadoSync | null> {
  const inscricao = await obterInscricao()
  if (!inscricao) return null

  const lembretes = await montarLembretes(diasAFrente)
  const resposta = await fetch(url('/api/sincronizar'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ endpoint: inscricao.endpoint, lembretes }),
  })

  if (!resposta.ok) {
    throw new Error(`Falha ao sincronizar os lembretes (${resposta.status}).`)
  }
  const corpo = (await resposta.json()) as { sincronizados?: number; removidos?: number }
  return {
    enviados: lembretes.length,
    sincronizados: corpo.sincronizados ?? 0,
    removidos: corpo.removidos ?? 0,
  }
}
