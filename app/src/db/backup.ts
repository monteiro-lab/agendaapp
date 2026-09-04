import { db } from './db'
import type { Ocorrencia, Paciente, Recorrencia } from './tipos'

/** Escapa vírgula, ponto-e-vírgula, barra invertida e quebra de linha (RFC 6350). */
function escaparVCard(texto: string): string {
  return texto.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n')
}

/**
 * Monta um arquivo vCard (.vcf) só com nome + telefone dos pacientes que têm
 * telefone cadastrado — pra importar rápido no catálogo de contatos do
 * celular, sem levar observações nem o resto do backup completo.
 */
export function montarContatosVCard(pacientes: Paciente[]): string {
  const comTelefone = pacientes.filter((p) => p.telefone?.trim())
  const cartoes = comTelefone.map((p) =>
    [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${escaparVCard(p.nome)}`,
      `N:${escaparVCard(p.nome)};;;;`,
      `TEL;TYPE=CELL:${escaparVCard(p.telefone!.trim())}`,
      'END:VCARD',
    ].join('\r\n'),
  )
  return cartoes.join('\r\n') + (cartoes.length ? '\r\n' : '')
}

/**
 * Formato do arquivo de backup. Deliberadamente só os três dados-fonte —
 * a config da trava (`config`) fica de fora: é do aparelho, não da agenda.
 */
export interface BackupAgenda {
  versao: 1
  exportadoEm: string
  pacientes: Paciente[]
  recorrencias: Recorrencia[]
  ocorrencias: Ocorrencia[]
}

/**
 * Monta o backup como objeto. O arquivo nunca sai do aparelho a menos que
 * a usuária mande — não há upload automático em lugar nenhum.
 */
export async function montarBackup(): Promise<BackupAgenda> {
  const [pacientes, recorrencias, ocorrencias] = await Promise.all([
    db.pacientes.toArray(),
    db.recorrencias.toArray(),
    db.ocorrencias.toArray(),
  ])
  return { versao: 1, exportadoEm: new Date().toISOString(), pacientes, recorrencias, ocorrencias }
}

function backupValido(v: unknown): v is BackupAgenda {
  if (!v || typeof v !== 'object') return false
  const b = v as Record<string, unknown>
  return (
    b.versao === 1 &&
    Array.isArray(b.pacientes) &&
    Array.isArray(b.recorrencias) &&
    Array.isArray(b.ocorrencias)
  )
}

/**
 * Restaura um backup, substituindo tudo o que existe hoje no aparelho.
 * Não faz merge de propósito: um backup parcial misturado com dados atuais
 * poderia deixar recorrência e ocorrência referenciando ids que não existem
 * mais.
 */
export async function restaurarBackup(bruto: unknown): Promise<void> {
  if (!backupValido(bruto)) {
    throw new Error('Arquivo inválido — não parece um backup desta agenda.')
  }
  await db.transaction('rw', db.pacientes, db.recorrencias, db.ocorrencias, async () => {
    await Promise.all([db.pacientes.clear(), db.recorrencias.clear(), db.ocorrencias.clear()])
    await db.pacientes.bulkAdd(bruto.pacientes)
    await db.recorrencias.bulkAdd(bruto.recorrencias)
    await db.ocorrencias.bulkAdd(bruto.ocorrencias)
  })
}
