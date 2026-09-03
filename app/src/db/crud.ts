import { db } from './db'
import { novoUid } from './uid'
import {
  horaEmMinutos,
  normalizarHora,
  dataValida,
  type DiaSemana,
  type Ocorrencia,
  type Paciente,
  type Recorrencia,
  type StatusOcorrencia,
} from './tipos'

// ---------------------------------------------------------------- pacientes

export async function criarPaciente(dados: Omit<Paciente, 'id'>): Promise<Paciente> {
  const nome = dados.nome.trim()
  if (!nome) throw new Error('O paciente precisa de um nome.')
  const paciente: Paciente = { ...dados, nome, id: novoUid() }
  await db.pacientes.add(paciente)
  return paciente
}

export function atualizarPaciente(id: string, mudancas: Partial<Omit<Paciente, 'id'>>) {
  return db.pacientes.update(id, mudancas)
}

export function listarPacientes(): Promise<Paciente[]> {
  return db.pacientes.orderBy('nome').toArray()
}

export function buscarPaciente(id: string): Promise<Paciente | undefined> {
  return db.pacientes.get(id)
}

/**
 * Remove o paciente e **desvincula** seus horários (viram VAGO) em vez de
 * apagá-los: a grade da semana continua existindo, só fica com o slot livre.
 */
export async function removerPaciente(id: string): Promise<void> {
  await db.transaction('rw', db.pacientes, db.recorrencias, db.ocorrencias, async () => {
    await db.recorrencias.where('pacienteId').equals(id).modify({ pacienteId: null })
    await db.ocorrencias.where('pacienteId').equals(id).modify({ pacienteId: null })
    await db.pacientes.delete(id)
  })
}

// -------------------------------------------------------------- recorrências

export async function criarRecorrencia(
  dados: Omit<Recorrencia, 'id' | 'ativa'> & { ativa?: boolean },
): Promise<Recorrencia> {
  const recorrencia: Recorrencia = {
    ...dados,
    hora: normalizarHora(dados.hora),
    ativa: dados.ativa ?? true,
    id: novoUid(),
  }
  await db.recorrencias.add(recorrencia)
  return recorrencia
}

export function atualizarRecorrencia(
  id: string,
  mudancas: Partial<Omit<Recorrencia, 'id'>>,
) {
  const normalizadas = mudancas.hora
    ? { ...mudancas, hora: normalizarHora(mudancas.hora) }
    : mudancas
  return db.recorrencias.update(id, normalizadas)
}

export function removerRecorrencia(id: string) {
  return db.recorrencias.delete(id)
}

/** Desativa sem apagar — preserva o histórico de ocorrências já geradas. */
export function desativarRecorrencia(id: string) {
  return db.recorrencias.update(id, { ativa: false })
}

/**
 * Pausa temporária (ex.: paciente de férias): a série continua ativa, mas
 * `gerarOcorrencias` não materializa datas dentro da pausa, e as que já
 * existiam (ainda não realizadas/observadas) são limpas na próxima geração.
 */
export function pausarRecorrencia(id: string, ate: string) {
  if (!dataValida(ate)) throw new Error(`Data inválida: ${ate}`)
  return db.recorrencias.update(id, { pausadaAte: ate })
}

/** Remove a pausa. `.modify` porque `.update` com `undefined` não apaga o campo. */
export function retomarRecorrencia(id: string) {
  return db.recorrencias
    .where('id')
    .equals(id)
    .modify((r) => {
      delete r.pausadaAte
    })
}

/**
 * A grade semanal: só as recorrências ativas, ordenadas por dia e horário.
 * (`ativa` é filtrado em memória porque boolean não é chave do IndexedDB.)
 */
export async function listarGrade(): Promise<Recorrencia[]> {
  const todas = await db.recorrencias.toArray()
  return todas
    .filter((r) => r.ativa)
    .sort((a, b) => a.diaSemana - b.diaSemana || horaEmMinutos(a.hora) - horaEmMinutos(b.hora))
}

export async function listarRecorrenciasDoDia(dia: DiaSemana): Promise<Recorrencia[]> {
  const grade = await listarGrade()
  return grade.filter((r) => r.diaSemana === dia)
}

// --------------------------------------------------------------- ocorrências

export async function criarOcorrencia(
  dados: Omit<Ocorrencia, 'id' | 'status'> & { id?: string; status?: StatusOcorrencia },
): Promise<Ocorrencia> {
  if (!dataValida(dados.data)) throw new Error(`Data inválida: ${dados.data}`)
  const ocorrencia: Ocorrencia = {
    ...dados,
    hora: normalizarHora(dados.hora),
    status: dados.status ?? 'agendada',
    id: dados.id ?? novoUid(),
  }
  await db.ocorrencias.add(ocorrencia)
  return ocorrencia
}

export function atualizarOcorrencia(
  id: string,
  mudancas: Partial<Omit<Ocorrencia, 'id'>>,
) {
  const normalizadas = mudancas.hora
    ? { ...mudancas, hora: normalizarHora(mudancas.hora) }
    : mudancas
  return db.ocorrencias.update(id, normalizadas)
}

export function marcarStatus(id: string, status: StatusOcorrencia) {
  return db.ocorrencias.update(id, { status })
}

export function removerOcorrencia(id: string) {
  return db.ocorrencias.delete(id)
}

export function buscarOcorrencia(id: string): Promise<Ocorrencia | undefined> {
  return db.ocorrencias.get(id)
}

/** Intervalo fechado, em datas "YYYY-MM-DD". */
export async function listarPorPeriodo(de: string, ate: string): Promise<Ocorrencia[]> {
  if (!dataValida(de) || !dataValida(ate)) throw new Error('Período inválido.')
  const lista = await db.ocorrencias.where('data').between(de, ate, true, true).toArray()
  return lista.sort(
    (a, b) => a.data.localeCompare(b.data) || horaEmMinutos(a.hora) - horaEmMinutos(b.hora),
  )
}

export function listarDoDia(data: string): Promise<Ocorrencia[]> {
  return listarPorPeriodo(data, data)
}

// ------------------------------------------------------------------- utilidades

/** Apaga tudo do aparelho. Usado pelo "limpar dados" e pelos testes manuais. */
export async function limparTudo(): Promise<void> {
  await db.transaction('rw', db.pacientes, db.recorrencias, db.ocorrencias, async () => {
    await Promise.all([db.pacientes.clear(), db.recorrencias.clear(), db.ocorrencias.clear()])
  })
}

/**
 * A ocorrência daquela recorrência naquela data, criando-a se ainda não existir.
 * A Tarefa 5 gera as ocorrências em lote usando a mesma chave lógica
 * (`recorrenciaId` + `data`), então marcar realizado hoje não duplica depois.
 */
export async function garantirOcorrencia(
  recorrencia: Recorrencia,
  data: string,
): Promise<Ocorrencia> {
  if (!dataValida(data)) throw new Error(`Data inválida: ${data}`)
  const existente = await db.ocorrencias
    .where('recorrenciaId')
    .equals(recorrencia.id)
    .filter((o) => o.data === data)
    .first()
  if (existente) return existente

  const nova: Ocorrencia = {
    id: novoUid(),
    recorrenciaId: recorrencia.id,
    pacienteId: recorrencia.pacienteId,
    data,
    hora: recorrencia.hora,
    status: 'agendada',
  }
  await db.ocorrencias.add(nova)
  return nova
}

/** Todas as ocorrências de uma recorrência (usado ao editar/desativar o slot). */
export function listarOcorrenciasDaRecorrencia(recorrenciaId: string): Promise<Ocorrencia[]> {
  return db.ocorrencias.where('recorrenciaId').equals(recorrenciaId).toArray()
}
