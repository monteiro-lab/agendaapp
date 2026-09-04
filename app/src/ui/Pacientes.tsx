import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  atualizarPaciente,
  db,
  formatarCurta,
  listarHistoricoPaciente,
  listarRecorrenciasDoPaciente,
  removerPaciente,
  NOME_DIA,
  NOME_REGRA,
  type Ocorrencia,
  type Recorrencia,
} from '../db'
import { IconeAlerta, IconeBusca, IconeCheck, IconeLixeira } from './icones'
import { useConfirmar } from './confirmar'

const normalizar = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

const NOME_STATUS_CURTO: Record<Ocorrencia['status'], string> = {
  agendada: 'Agendada',
  realizada: 'Realizada',
  cancelada: 'Cancelada',
  remarcada: 'Remarcada',
}

const MAX_HISTORICO = 60

export default function Pacientes({ aoFechar }: { aoFechar: () => void }) {
  const [selecionado, setSelecionado] = useState<string | null>(null)
  const [filtro, setFiltro] = useState('')
  const pacientes = useLiveQuery(() => db.pacientes.orderBy('nome').toArray(), [], [])

  const filtrados = useMemo(() => {
    const chave = normalizar(filtro.trim())
    if (!chave) return pacientes
    return pacientes.filter((p) => normalizar(p.nome).includes(chave))
  }, [pacientes, filtro])

  if (selecionado) {
    return <Ficha pacienteId={selecionado} aoVoltar={() => setSelecionado(null)} aoFechar={aoFechar} />
  }

  return (
    <div className="folha-fundo" onClick={aoFechar}>
      <div
        className="folha busca"
        role="dialog"
        aria-modal="true"
        aria-label="Pacientes"
        onClick={(e) => e.stopPropagation()}
      >
        <h3>Pacientes</h3>

        <label className="busca-campo">
          <IconeBusca width={18} height={18} />
          <input
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Filtrar por nome"
            autoFocus
          />
        </label>

        {filtrados.length === 0 && (
          <p className="busca-vazio">
            {pacientes.length === 0 ? 'Nenhum paciente cadastrado ainda.' : 'Ninguém encontrado com esse nome.'}
          </p>
        )}

        {filtrados.length > 0 && (
          <ul className="busca-resultados">
            {filtrados.map((p) => (
              <li key={p.id}>
                <button className="busca-resultado" onClick={() => setSelecionado(p.id)}>
                  <span className="busca-nome">{p.nome}</span>
                  {p.telefone && <span className="busca-detalhe">{p.telefone}</span>}
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

function Ficha({
  pacienteId,
  aoVoltar,
  aoFechar,
}: {
  pacienteId: string
  aoVoltar: () => void
  aoFechar: () => void
}) {
  const confirmar = useConfirmar()
  const paciente = useLiveQuery(() => db.pacientes.get(pacienteId), [pacienteId])
  const horarios = useLiveQuery(
    () => listarRecorrenciasDoPaciente(pacienteId),
    [pacienteId],
    [] as Recorrencia[],
  )
  const historico = useLiveQuery(
    () => listarHistoricoPaciente(pacienteId),
    [pacienteId],
    [] as Ocorrencia[],
  )

  const [telefone, setTelefone] = useState(paciente?.telefone ?? '')
  const [observacoes, setObservacoes] = useState(paciente?.observacoes ?? '')
  const [carregouCampos, setCarregouCampos] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [aviso, setAviso] = useState('')
  const [erro, setErro] = useState('')

  // Só carrega os campos do formulário uma vez, quando o paciente chega —
  // sem isso, cada re-render do useLiveQuery apagaria o que a usuária digitou.
  if (paciente && !carregouCampos) {
    setTelefone(paciente.telefone ?? '')
    setObservacoes(paciente.observacoes ?? '')
    setCarregouCampos(true)
  }

  async function salvar() {
    setSalvando(true)
    setErro('')
    try {
      await atualizarPaciente(pacienteId, {
        telefone: telefone.trim() || undefined,
        observacoes: observacoes.trim() || undefined,
      })
      setAviso('Salvo.')
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
    setSalvando(false)
  }

  async function remover() {
    const ok = await confirmar({
      titulo: 'Remover paciente',
      mensagem: `Remover ${paciente?.nome}? Os horários dela(e) na grade viram VAGO — não somem, e o histórico de atendimentos fica guardado.`,
      textoConfirmar: 'Remover',
      variante: 'perigo',
    })
    if (!ok) return
    await removerPaciente(pacienteId)
    aoVoltar()
  }

  if (!paciente) {
    return (
      <div className="folha-fundo" onClick={aoFechar}>
        <div className="folha" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
          <p className="ajuste-nota">Paciente não encontrado — pode já ter sido removido.</p>
          <div className="folha-botoes">
            <button onClick={aoVoltar}>Voltar</button>
          </div>
        </div>
      </div>
    )
  }

  const historicoVisivel = historico.slice(0, MAX_HISTORICO)

  return (
    <div className="folha-fundo" onClick={aoFechar}>
      <div
        className="folha"
        role="dialog"
        aria-modal="true"
        aria-label={`Ficha de ${paciente.nome}`}
        onClick={(e) => e.stopPropagation()}
      >
        <h3>{paciente.nome}</h3>

        <label>
          Telefone
          <input
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            placeholder="opcional"
            inputMode="tel"
          />
        </label>

        <label>
          Observações
          <textarea
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            rows={2}
            placeholder="opcional"
          />
        </label>

        <section className="ajuste">
          <h4>Horários fixos</h4>
          {horarios.length === 0 ? (
            <p className="ajuste-nota">Nenhum horário fixo ativo na grade.</p>
          ) : (
            <ul className="ficha-horarios">
              {horarios.map((r) => (
                <li key={r.id}>
                  <strong>{NOME_DIA[r.diaSemana]}</strong> {r.hora}
                  {r.regraCobranca !== 'sem_rotulo' && <span> · {NOME_REGRA[r.regraCobranca]}</span>}
                  {r.pausadaAte && <span> · pausado até {formatarCurta(r.pausadaAte)}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="ajuste">
          <h4>Histórico de atendimentos</h4>
          {historico.length === 0 ? (
            <p className="ajuste-nota">Nenhum atendimento registrado ainda.</p>
          ) : (
            <>
              <ul className="ficha-historico">
                {historicoVisivel.map((o) => (
                  <li key={o.id}>
                    <span>{formatarCurta(o.data)}</span>
                    <span>{o.hora}</span>
                    <span className={`etiqueta ${o.status}`}>{NOME_STATUS_CURTO[o.status]}</span>
                  </li>
                ))}
              </ul>
              {historico.length > MAX_HISTORICO && (
                <p className="ajuste-nota">
                  Mostrando os {MAX_HISTORICO} mais recentes de {historico.length}.
                </p>
              )}
            </>
          )}
        </section>

        {aviso && (
          <p className="ajuste-aviso">
            <IconeCheck width={16} height={16} />
            {aviso}
          </p>
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
          <button onClick={aoVoltar}>Voltar</button>
          <button className="perigo" onClick={() => void remover()}>
            <IconeLixeira width={16} height={16} /> Remover
          </button>
        </div>
      </div>
    </div>
  )
}
