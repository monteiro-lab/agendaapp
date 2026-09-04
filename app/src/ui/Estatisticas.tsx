import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  db,
  dataParaISO,
  listarPorPeriodo,
  listarTodasOcorrencias,
  type Ocorrencia,
} from '../db'

type Periodo = 'mes-atual' | 'mes-passado' | 'tudo'

interface Contagem {
  total: number
  agendada: number
  realizada: number
  cancelada: number
  remarcada: number
}

interface LinhaPaciente extends Contagem {
  pacienteId: string
  nome: string
}

const contagemZerada = (): Contagem => ({ total: 0, agendada: 0, realizada: 0, cancelada: 0, remarcada: 0 })

function comparecimento({ realizada, cancelada }: Contagem): string {
  const base = realizada + cancelada
  if (base === 0) return '—'
  return `${Math.round((realizada / base) * 100)}%`
}

/** Primeiro e último dia do mês que contém `referencia`, deslocado `offsetMeses` meses. */
function limitesDoMes(offsetMeses: number): { de: string; ate: string } {
  const agora = new Date()
  const ano = agora.getFullYear()
  const mes = agora.getMonth() + offsetMeses
  const primeiro = new Date(ano, mes, 1)
  const ultimo = new Date(ano, mes + 1, 0)
  return { de: dataParaISO(primeiro), ate: dataParaISO(ultimo) }
}

const ROTULO_PERIODO: Record<Periodo, string> = {
  'mes-atual': 'Este mês',
  'mes-passado': 'Mês passado',
  tudo: 'Todo o histórico',
}

export default function Estatisticas({ aoFechar }: { aoFechar: () => void }) {
  const [periodo, setPeriodo] = useState<Periodo>('mes-atual')

  const ocorrencias = useLiveQuery(
    async () => {
      if (periodo === 'tudo') return listarTodasOcorrencias()
      const { de, ate } = limitesDoMes(periodo === 'mes-atual' ? 0 : -1)
      return listarPorPeriodo(de, ate)
    },
    [periodo],
    [] as Ocorrencia[],
  )

  const pacientes = useLiveQuery(() => db.pacientes.toArray(), [], [])

  const { geral, porPaciente } = useMemo(() => {
    const nomePorId = new Map(pacientes.map((p) => [p.id, p.nome]))
    const geral = contagemZerada()
    const mapa = new Map<string, LinhaPaciente>()

    for (const o of ocorrencias) {
      if (!o.pacienteId) continue // VAGO não entra na estatística de comparecimento
      geral.total++
      geral[o.status]++

      const linha = mapa.get(o.pacienteId) ?? {
        pacienteId: o.pacienteId,
        nome: nomePorId.get(o.pacienteId) ?? '—',
        ...contagemZerada(),
      }
      linha.total++
      linha[o.status]++
      mapa.set(o.pacienteId, linha)
    }

    const porPaciente = [...mapa.values()].sort((a, b) => b.total - a.total)
    return { geral, porPaciente }
  }, [ocorrencias, pacientes])

  return (
    <div className="folha-fundo" onClick={aoFechar}>
      <div
        className="folha"
        role="dialog"
        aria-modal="true"
        aria-label="Estatísticas"
        onClick={(e) => e.stopPropagation()}
      >
        <h3>Estatísticas</h3>

        <fieldset className="alcance">
          <legend>Período</legend>
          {(Object.keys(ROTULO_PERIODO) as Periodo[]).map((p) => (
            <label className="radio" key={p}>
              <input type="radio" checked={periodo === p} onChange={() => setPeriodo(p)} />
              {ROTULO_PERIODO[p]}
            </label>
          ))}
        </fieldset>

        <section className="ajuste">
          <h4>Resumo</h4>
          {geral.total === 0 ? (
            <p className="ajuste-nota">Nenhum atendimento com paciente nesse período.</p>
          ) : (
            <ul className="estatistica-resumo">
              <li>
                <strong>{geral.total}</strong>
                <span>atendimentos</span>
              </li>
              <li>
                <strong>{geral.realizada}</strong>
                <span>realizados</span>
              </li>
              <li>
                <strong>{geral.cancelada}</strong>
                <span>cancelados</span>
              </li>
              <li>
                <strong>{geral.remarcada}</strong>
                <span>remarcados</span>
              </li>
              <li>
                <strong>{comparecimento(geral)}</strong>
                <span>comparecimento</span>
              </li>
            </ul>
          )}
          <p className="ajuste-nota">
            Comparecimento = realizados ÷ (realizados + cancelados). Agendados e
            remarcados não entram nessa conta — ainda não têm desfecho.
          </p>
        </section>

        {porPaciente.length > 0 && (
          <section className="ajuste">
            <h4>Por paciente</h4>
            <ul className="estatistica-pacientes">
              {porPaciente.map((linha) => (
                <li key={linha.pacienteId}>
                  <span className="estatistica-nome">{linha.nome}</span>
                  <span className="estatistica-detalhe">
                    {linha.total} · {comparecimento(linha)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="folha-botoes">
          <button onClick={aoFechar}>Fechar</button>
        </div>
      </div>
    </div>
  )
}
