import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  db,
  diaSemanaDe,
  datasDaSemana,
  formatarCurta,
  hojeISO,
  inicioDaSemana,
  horaEmMinutos,
  marcarStatus,
  garantirOcorrencia,
  gerarOcorrencias,
  listarProximas,
  rotuloSemana,
  somarDias,
  NOME_DIA,
  NOME_REGRA,
  type DiaSemana,
  type Ocorrencia,
  type Recorrencia,
} from '../db'
import EditorSlot, { type SlotEmEdicao } from './EditorSlot'
import BotaoLembretes from './BotaoLembretes'
import Ajustes from './Ajustes'
import { IconeCheck, IconeChevronDir, IconeChevronEsq, IconeCirculo, IconeEngrenagem, IconeMais } from './icones'
import { sincronizarLembretes } from '../push/sincronizar'
import Importar from './Importar'

/** Uma célula da grade já resolvida: a recorrência + a ocorrência daquela data. */
export interface Slot {
  chave: string
  data: string
  hora: string
  recorrencia: Recorrencia | null
  ocorrencia: Ocorrencia | null
  pacienteId: string | null
  nome: string
  regra: Recorrencia['regraCobranca']
}

const DIAS: DiaSemana[] = [1, 2, 3, 4, 5]
const CURTO: Record<DiaSemana, string> = { 1: 'Seg', 2: 'Ter', 3: 'Qua', 4: 'Qui', 5: 'Sex' }

export default function Agenda() {
  const [segunda, setSegunda] = useState(() => inicioDaSemana(hojeISO()))
  const [diaAberto, setDiaAberto] = useState<DiaSemana>(() => {
    const dow = new Date().getDay()
    return dow >= 1 && dow <= 5 ? (dow as DiaSemana) : 1
  })
  const [editando, setEditando] = useState<SlotEmEdicao | null>(null)
  const [ajustesAbertos, setAjustesAbertos] = useState(false)

  const datas = useMemo(() => datasDaSemana(segunda), [segunda])
  const hoje = hojeISO()

  // Materializa os próximos 30 dias ao abrir e sempre que a grade mudar.
  const assinaturaGrade = useLiveQuery(async () => {
    const rs = await db.recorrencias.toArray()
    return rs
      .map((r) => `${r.id}:${r.diaSemana}:${r.hora}:${r.pacienteId ?? ''}:${r.ativa ? 1 : 0}`)
      .sort()
      .join('|')
  }, [], '')
  useEffect(() => {
    if (assinaturaGrade) void gerarOcorrencias({ diasAFrente: 30 })
  }, [assinaturaGrade])

  // Sempre que a agenda mudar, os lembretes do servidor precisam acompanhar.
  // A assinatura cobre a janela inteira de 30 dias, não só a semana à vista.
  const assinaturaLembretes = useLiveQuery(async () => {
    const proximas = await listarProximas(30)
    return proximas.map((o) => `${o.id}:${o.data}:${o.hora}:${o.pacienteId ?? ''}`).join('|')
  }, [], '')
  useEffect(() => {
    if (!assinaturaLembretes) return
    // Espera 2s: editar vários slots seguidos vira uma sincronização só.
    const t = setTimeout(() => {
      void sincronizarLembretes().catch((e) => console.warn('sincronização adiada:', e))
    }, 2000)
    return () => clearTimeout(t)
  }, [assinaturaLembretes])

  const dados = useLiveQuery(async () => {
    const [recorrencias, pacientes, ocorrencias] = await Promise.all([
      db.recorrencias.toArray(),
      db.pacientes.toArray(),
      db.ocorrencias.where('data').between(datas[0], datas[4], true, true).toArray(),
    ])
    return { recorrencias, pacientes, ocorrencias }
  }, [datas[0], datas[4]])

  const porDia = useMemo(() => {
    const mapa = new Map<string, Slot[]>()
    if (!dados) return mapa

    const nomePorId = new Map(dados.pacientes.map((p) => [p.id, p.nome]))
    const ocPorRecorrencia = new Map<string, Ocorrencia>()
    const avulsas: Ocorrencia[] = []
    for (const o of dados.ocorrencias) {
      if (o.recorrenciaId) ocPorRecorrencia.set(`${o.recorrenciaId}|${o.data}`, o)
      else avulsas.push(o)
    }

    for (const data of datas) {
      const dia = diaSemanaDe(data)
      const slots: Slot[] = []

      for (const r of dados.recorrencias) {
        if (!r.ativa || r.diaSemana !== dia) continue
        const oc = ocPorRecorrencia.get(`${r.id}|${data}`) ?? null
        const pacienteId = oc?.pacienteId ?? r.pacienteId
        slots.push({
          chave: r.id,
          data,
          hora: oc?.hora ?? r.hora,
          recorrencia: r,
          ocorrencia: oc,
          pacienteId,
          nome: pacienteId ? (nomePorId.get(pacienteId) ?? '—') : 'VAGO',
          regra: r.regraCobranca,
        })
      }

      for (const o of avulsas) {
        if (o.data !== data) continue
        slots.push({
          chave: o.id,
          data,
          hora: o.hora,
          recorrencia: null,
          ocorrencia: o,
          pacienteId: o.pacienteId,
          nome: o.pacienteId ? (nomePorId.get(o.pacienteId) ?? '—') : 'VAGO',
          regra: 'sem_rotulo',
        })
      }

      slots.sort(
        (a, b) => horaEmMinutos(a.hora) - horaEmMinutos(b.hora) || a.nome.localeCompare(b.nome),
      )
      mapa.set(data, slots)
    }
    return mapa
  }, [dados, datas])

  async function alternarRealizada(slot: Slot) {
    const atual =
      slot.ocorrencia ??
      (slot.recorrencia ? await garantirOcorrencia(slot.recorrencia, slot.data) : null)
    if (!atual) return
    await marcarStatus(atual.id, atual.status === 'realizada' ? 'agendada' : 'realizada')
  }

  if (dados && dados.recorrencias.length === 0) return <Importar />

  return (
    <div className="agenda">
      <header className="topo">
        <div className="semana">
          <button aria-label="Semana anterior" onClick={() => setSegunda(somarDias(segunda, -7))}>
            <IconeChevronEsq />
          </button>
          <div className="semana-rotulo">
            <strong>{rotuloSemana(segunda)}</strong>
            <button className="hoje" onClick={() => setSegunda(inicioDaSemana(hoje))}>
              hoje
            </button>
          </div>
          <button aria-label="Próxima semana" onClick={() => setSegunda(somarDias(segunda, 7))}>
            <IconeChevronDir />
          </button>
          <button
            className="ajustes-abrir"
            aria-label="Ajustes"
            onClick={() => setAjustesAbertos(true)}
          >
            <IconeEngrenagem />
          </button>
        </div>

        <BotaoLembretes />

        <nav className="abas" role="tablist">
          {DIAS.map((dia, i) => (
            <button
              key={dia}
              role="tab"
              aria-selected={dia === diaAberto}
              className={[
                'aba',
                dia === diaAberto ? 'ativa' : '',
                datas[i] === hoje ? 'e-hoje' : '',
              ].join(' ')}
              onClick={() => setDiaAberto(dia)}
            >
              <span className="aba-dia">{CURTO[dia]}</span>
              <span className="aba-data">{formatarCurta(datas[i])}</span>
            </button>
          ))}
        </nav>
      </header>

      <div className="colunas">
        {DIAS.map((dia, i) => {
          const data = datas[i]
          const slots = porDia.get(data) ?? []
          return (
            <section
              key={dia}
              className={[
                'coluna',
                dia === diaAberto ? 'aberta' : '',
                data === hoje ? 'e-hoje' : '',
              ].join(' ')}
            >
              <h2>
                {NOME_DIA[dia]} <span>{formatarCurta(data)}</span>
              </h2>

              {slots.length === 0 && <p className="sem-slots">Nada agendado.</p>}

              <ul className="slots">
                {slots.map((slot) => {
                  const status = slot.ocorrencia?.status ?? 'agendada'
                  const vago = !slot.pacienteId
                  return (
                    <li key={slot.chave} className={['slot', status, vago ? 'vago' : ''].join(' ')}>
                      <button
                        className="slot-corpo"
                        onClick={() => setEditando({ data, slot, diaSemana: dia })}
                      >
                        <span className="slot-hora">{slot.hora}</span>
                        <span className="slot-texto">
                          <span className="slot-nome">{slot.nome}</span>
                          {slot.regra !== 'sem_rotulo' && (
                            <span className="slot-regra">{NOME_REGRA[slot.regra]}</span>
                          )}
                          {status !== 'agendada' && (
                            <span className={`etiqueta ${status}`}>{status}</span>
                          )}
                        </span>
                      </button>
                      {!vago && (
                        <button
                          className="slot-marcar"
                          aria-label={
                            status === 'realizada'
                              ? 'Desmarcar realizado'
                              : 'Marcar como realizado'
                          }
                          onClick={() => void alternarRealizada(slot)}
                        >
                          {status === 'realizada' ? <IconeCheck /> : <IconeCirculo />}
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>

              <button
                className="adicionar"
                onClick={() => setEditando({ data, slot: null, diaSemana: dia })}
              >
                <IconeMais width={16} height={16} /> adicionar horário
              </button>
            </section>
          )
        })}
      </div>

      {editando && <EditorSlot em={editando} aoFechar={() => setEditando(null)} />}
      {ajustesAbertos && <Ajustes aoFechar={() => setAjustesAbertos(false)} />}
    </div>
  )
}
