import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, diaSemanaDe, formatarCurta, hojeISO, horaEmMinutos, type DiaSemana, type Ocorrencia } from '../db'
import { IconeBusca } from './icones'

export interface DestinoBusca {
  data: string
  diaSemana: DiaSemana
  /** A mesma chave usada em Slot: r.id se for da série, senão o.id. */
  chave: string
}

const normalizar = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

export default function Buscar({
  aoFechar,
  aoEscolher,
}: {
  aoFechar: () => void
  aoEscolher: (destino: DestinoBusca) => void
}) {
  const [termo, setTermo] = useState('')

  useEffect(() => {
    const fechaComEsc = (e: KeyboardEvent) => e.key === 'Escape' && aoFechar()
    document.addEventListener('keydown', fechaComEsc)
    return () => document.removeEventListener('keydown', fechaComEsc)
  }, [aoFechar])

  const resultados = useLiveQuery(
    async () => {
      const chave = normalizar(termo.trim())
      if (!chave) return []

      const pacientes = await db.pacientes.toArray()
      const combinam = pacientes.filter((p) => normalizar(p.nome).includes(chave))
      if (!combinam.length) return []

      const ids = combinam.map((p) => p.id)
      const hoje = hojeISO()
      const proximas = await db.ocorrencias
        .where('pacienteId')
        .anyOf(ids)
        .filter((o) => o.data >= hoje && (o.status === 'agendada' || o.status === 'remarcada'))
        .toArray()
      proximas.sort(
        (a, b) => a.data.localeCompare(b.data) || horaEmMinutos(a.hora) - horaEmMinutos(b.hora),
      )

      const proximaPorPaciente = new Map<string, Ocorrencia>()
      for (const o of proximas) {
        if (o.pacienteId && !proximaPorPaciente.has(o.pacienteId)) {
          proximaPorPaciente.set(o.pacienteId, o)
        }
      }

      return combinam
        .map((p) => ({ paciente: p, proxima: proximaPorPaciente.get(p.id) ?? null }))
        .sort((a, b) => a.paciente.nome.localeCompare(b.paciente.nome, 'pt-BR'))
    },
    [termo],
    [],
  )

  function escolher(oc: Ocorrencia) {
    aoEscolher({
      data: oc.data,
      diaSemana: diaSemanaDe(oc.data),
      chave: oc.recorrenciaId ?? oc.id,
    })
  }

  return (
    <div className="folha-fundo centro" onClick={aoFechar}>
      <div
        className="folha compacta busca"
        role="dialog"
        aria-modal="true"
        aria-label="Buscar paciente"
        onClick={(e) => e.stopPropagation()}
      >
        <label className="busca-campo">
          <IconeBusca width={18} height={18} />
          <input
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder="Nome do paciente"
            autoFocus
          />
        </label>

        {termo.trim() && resultados.length === 0 && (
          <p className="busca-vazio">Ninguém encontrado com esse nome.</p>
        )}

        {resultados.length > 0 && (
          <ul className="busca-resultados">
            {resultados.map(({ paciente, proxima }) => (
              <li key={paciente.id}>
                <button
                  className="busca-resultado"
                  onClick={() => proxima && escolher(proxima)}
                  disabled={!proxima}
                >
                  <span className="busca-nome">{paciente.nome}</span>
                  <span className="busca-detalhe">
                    {proxima
                      ? `${formatarCurta(proxima.data)} · ${proxima.hora}`
                      : 'sem horário nos próximos 30 dias'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="folha-botoes">
          <button onClick={aoFechar}>Fechar</button>
        </div>
      </div>
    </div>
  )
}
