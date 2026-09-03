import Dexie, { type EntityTable } from 'dexie'
import type { Config, Ocorrencia, Paciente, Recorrencia } from './tipos'

/**
 * Banco local (IndexedDB). Fonte da verdade da agenda: tudo o que tem nome de
 * paciente vive aqui e em nenhum outro lugar.
 */
export class AgendaDB extends Dexie {
  pacientes!: EntityTable<Paciente, 'id'>
  recorrencias!: EntityTable<Recorrencia, 'id'>
  ocorrencias!: EntityTable<Ocorrencia, 'id'>
  config!: EntityTable<Config, 'chave'>

  constructor() {
    super('agenda')
    this.version(1).stores({
      pacientes: 'id, nome',
      // `ativa` é boolean e boolean não é chave válida no IndexedDB — fica
      // fora dos índices e é filtrado em memória (a grade tem dezenas de linhas).
      recorrencias: 'id, pacienteId, [diaSemana+hora]',
      // `id` aqui é o ocorrencia_uid opaco.
      ocorrencias: 'id, data, [data+hora], recorrenciaId, pacienteId, status',
    })

    // v2: ajustes do aparelho (trava de tela). Não guarda dado de paciente.
    this.version(2).stores({
      config: 'chave',
    })
  }
}

export const db = new AgendaDB()
