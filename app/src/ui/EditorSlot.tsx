import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  atualizarOcorrencia,
  atualizarRecorrencia,
  criarOcorrencia,
  criarPaciente,
  criarRecorrencia,
  db,
  garantirOcorrencia,
  propagarParaFuturas,
  desativarRecorrencia,
  normalizarHora,
  NOME_REGRA,
  type DiaSemana,
  type RegraCobranca,
  type StatusOcorrencia,
} from '../db'
import type { Slot } from './Agenda'
import { IconeAlerta, IconeLixeira } from './icones'

export interface SlotEmEdicao {
  data: string
  diaSemana: DiaSemana
  /** Nulo = criando um horário novo naquele dia. */
  slot: Slot | null
}

const REGRAS: RegraCobranca[] = ['sem_rotulo', 'particular', 'copart20', 'copart40', 'pos']
const STATUS: StatusOcorrencia[] = ['agendada', 'realizada', 'cancelada', 'remarcada']
const NOME_STATUS: Record<StatusOcorrencia, string> = {
  agendada: 'Agendada',
  realizada: 'Realizada',
  cancelada: 'Cancelada',
  remarcada: 'Remarcada',
}

const VAGO = '__vago__'
const NOVO = '__novo__'

export default function EditorSlot({
  em,
  aoFechar,
}: {
  em: SlotEmEdicao
  aoFechar: () => void
}) {
  const { slot, data, diaSemana } = em
  const pacientes = useLiveQuery(() => db.pacientes.orderBy('nome').toArray(), [], [])

  const [hora, setHora] = useState(slot?.hora ?? '')
  const [escolha, setEscolha] = useState(slot?.pacienteId ?? VAGO)
  const [nomeNovo, setNomeNovo] = useState('')
  const [regra, setRegra] = useState<RegraCobranca>(slot?.regra ?? 'sem_rotulo')
  const [status, setStatus] = useState<StatusOcorrencia>(slot?.ocorrencia?.status ?? 'agendada')
  const [observacoes, setObservacoes] = useState(slot?.ocorrencia?.observacoes ?? '')
  /** Só para slot recorrente: aplicar em toda semana ou só nesta data. */
  const [alcance, setAlcance] = useState<'serie' | 'data'>('serie')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    const fechaComEsc = (e: KeyboardEvent) => e.key === 'Escape' && aoFechar()
    document.addEventListener('keydown', fechaComEsc)
    return () => document.removeEventListener('keydown', fechaComEsc)
  }, [aoFechar])

  async function resolverPacienteId(): Promise<string | null> {
    if (escolha === VAGO) return null
    if (escolha === NOVO) {
      const nome = nomeNovo.trim()
      if (!nome) throw new Error('Escreva o nome do paciente.')
      const jaExiste = pacientes.find(
        (p) => p.nome.localeCompare(nome, 'pt-BR', { sensitivity: 'base' }) === 0,
      )
      if (jaExiste) return jaExiste.id
      const criado = await criarPaciente({ nome })
      return criado.id
    }
    return escolha
  }

  async function salvar() {
    setSalvando(true)
    setErro('')
    try {
      const horaNormal = normalizarHora(hora)
      const pacienteId = await resolverPacienteId()

      // 1) Horário novo no dia: vira recorrência (série) ou ocorrência avulsa.
      if (!slot) {
        if (alcance === 'serie') {
          await criarRecorrencia({ pacienteId, diaSemana, hora: horaNormal, regraCobranca: regra })
        } else {
          await criarOcorrencia({
            recorrenciaId: null,
            pacienteId,
            data,
            hora: horaNormal,
            status,
            observacoes: observacoes.trim() || undefined,
          })
        }
        aoFechar()
        return
      }

      // 2) Editando um slot existente.
      const mudaSerie = alcance === 'serie' && slot.recorrencia
      if (mudaSerie && slot.recorrencia) {
        await atualizarRecorrencia(slot.recorrencia.id, {
          pacienteId,
          hora: horaNormal,
          regraCobranca: regra,
        })
        // As ocorrências futuras já geradas precisam acompanhar a série,
        // senão o lembrete dispararia no horário antigo.
        await propagarParaFuturas(slot.recorrencia.id, { pacienteId, hora: horaNormal })
      }

      const precisaOcorrencia =
        status !== 'agendada' ||
        observacoes.trim() !== '' ||
        !!slot.ocorrencia ||
        (!mudaSerie && slot.recorrencia !== null)

      if (precisaOcorrencia) {
        const oc =
          slot.ocorrencia ??
          (slot.recorrencia ? await garantirOcorrencia(slot.recorrencia, data) : null)
        if (oc) {
          await atualizarOcorrencia(oc.id, {
            pacienteId,
            hora: horaNormal,
            status,
            observacoes: observacoes.trim() || undefined,
          })
        }
      }
      aoFechar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
      setSalvando(false)
    }
  }

  async function remover() {
    if (!slot) return
    if (slot.recorrencia && alcance === 'serie') {
      if (!confirm('Remover este horário de todas as semanas?')) return
      await desativarRecorrencia(slot.recorrencia.id)
    } else {
      if (!confirm('Cancelar este atendimento nesta data?')) return
      const oc =
        slot.ocorrencia ??
        (slot.recorrencia ? await garantirOcorrencia(slot.recorrencia, data) : null)
      if (oc) await atualizarOcorrencia(oc.id, { status: 'cancelada' })
    }
    aoFechar()
  }

  const ehSerie = slot?.recorrencia != null || !slot

  return (
    <div className="folha-fundo" onClick={aoFechar}>
      <div
        className="folha"
        role="dialog"
        aria-modal="true"
        aria-label={slot ? 'Editar horário' : 'Novo horário'}
        onClick={(e) => e.stopPropagation()}
      >
        <h3>{slot ? 'Editar horário' : 'Novo horário'}</h3>

        <label>
          Hora
          <input
            value={hora}
            onChange={(e) => setHora(e.target.value)}
            placeholder="14:00"
            inputMode="numeric"
            autoFocus={!slot}
          />
        </label>

        <label>
          Paciente
          <select value={escolha} onChange={(e) => setEscolha(e.target.value)}>
            <option value={VAGO}>VAGO (sem paciente)</option>
            {pacientes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
            <option value={NOVO}>+ novo paciente…</option>
          </select>
        </label>

        {escolha === NOVO && (
          <label>
            Nome do novo paciente
            <input
              value={nomeNovo}
              onChange={(e) => setNomeNovo(e.target.value)}
              placeholder="Nome completo"
              autoFocus
            />
          </label>
        )}

        <label>
          Cobrança
          <select value={regra} onChange={(e) => setRegra(e.target.value as RegraCobranca)}>
            {REGRAS.map((r) => (
              <option key={r} value={r}>
                {NOME_REGRA[r]}
              </option>
            ))}
          </select>
        </label>

        <label>
          Status nesta data
          <select value={status} onChange={(e) => setStatus(e.target.value as StatusOcorrencia)}>
            {STATUS.map((s) => (
              <option key={s} value={s}>
                {NOME_STATUS[s]}
              </option>
            ))}
          </select>
        </label>

        <label>
          Observações desta data
          <textarea
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            rows={2}
            placeholder="opcional"
          />
        </label>

        {ehSerie && (
          <fieldset className="alcance">
            <legend>Aplicar</legend>
            <label className="radio">
              <input
                type="radio"
                checked={alcance === 'serie'}
                onChange={() => setAlcance('serie')}
              />
              toda semana (a série)
            </label>
            <label className="radio">
              <input
                type="radio"
                checked={alcance === 'data'}
                onChange={() => setAlcance('data')}
              />
              só nesta data
            </label>
          </fieldset>
        )}

        {erro && (
          <p className="erro">
            <IconeAlerta width={16} height={16} />
            {erro}
          </p>
        )}

        <div className="folha-botoes">
          <button className="primario" onClick={() => void salvar()} disabled={salvando}>
            Salvar
          </button>
          <button onClick={aoFechar}>Cancelar</button>
          {slot && (
            <button className="perigo" onClick={() => void remover()}>
              <IconeLixeira width={16} height={16} /> Remover
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
