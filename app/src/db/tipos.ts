// Tipos do banco local. Este é o único lugar do projeto onde nome, telefone e
// observações de paciente existem — nada daqui pode ir para /api/*.

/** 1 = segunda … 5 = sexta. A grade é seg–sex. */
export type DiaSemana = 1 | 2 | 3 | 4 | 5

/**
 * Rótulo informativo de cobrança; não há cálculo financeiro no escopo.
 * `sem_rotulo` = a célula da agenda original não trazia rótulo nenhum — é
 * "ainda não classificado", não um sinônimo de particular.
 */
export type RegraCobranca =
  | 'particular'
  | 'copart20'
  | 'copart40'
  | 'pos'
  | 'sem_rotulo'

export type StatusOcorrencia = 'agendada' | 'realizada' | 'cancelada' | 'remarcada'

export interface Paciente {
  id: string
  nome: string
  telefone?: string
  observacoes?: string
}

/** O padrão da grade semanal: "toda terça às 14:00, fulano". */
export interface Recorrencia {
  id: string
  /** Nulo = slot VAGO (o horário existe na grade, sem paciente). */
  pacienteId: string | null
  diaSemana: DiaSemana
  /** Hora local no formato "HH:MM". Não é só hora cheia (ex.: "10:20"). */
  hora: string
  regraCobranca: RegraCobranca
  ativa: boolean
}

/** A instância real numa data. O `id` é o UID opaco que vai para o servidor. */
export interface Ocorrencia {
  id: string
  recorrenciaId: string | null
  pacienteId: string | null
  /** Data local no formato "YYYY-MM-DD". */
  data: string
  hora: string
  status: StatusOcorrencia
  observacoes?: string
}

export const DIAS_SEMANA: DiaSemana[] = [1, 2, 3, 4, 5]

export const NOME_DIA: Record<DiaSemana, string> = {
  1: 'Segunda-feira',
  2: 'Terça-feira',
  3: 'Quarta-feira',
  4: 'Quinta-feira',
  5: 'Sexta-feira',
}

export const NOME_REGRA: Record<RegraCobranca, string> = {
  particular: 'Particular',
  copart20: 'Coparticipação 20%',
  copart40: 'Coparticipação 40%',
  pos: 'Coparticipação pós',
  sem_rotulo: 'Sem rótulo',
}

const RE_HORA = /^([01]\d|2[0-3]):([0-5]\d)$/
const RE_DATA = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

export const horaValida = (hora: string): boolean => RE_HORA.test(hora)
export const dataValida = (data: string): boolean => RE_DATA.test(data)

/** "14:00" -> 840. Útil para ordenar a grade por horário. */
export function horaEmMinutos(hora: string): number {
  if (!horaValida(hora)) throw new Error(`Hora inválida: ${hora}`)
  const [h, m] = hora.split(':').map(Number)
  return h * 60 + m
}

/** Normaliza entradas como "9:5", "10h20" ou "14" para "HH:MM". */
export function normalizarHora(entrada: string): string {
  const bruto = entrada.trim().replace(/h/i, ':')
  const [h, m = '0'] = bruto.split(':')
  const hora = `${String(Number(h)).padStart(2, '0')}:${String(Number(m)).padStart(2, '0')}`
  if (!horaValida(hora)) throw new Error(`Hora inválida: ${entrada}`)
  return hora
}

/** Ajuste local do aparelho (trava de tela). Nunca contém dado de paciente. */
export interface Config {
  chave: string
  valor: unknown
}
