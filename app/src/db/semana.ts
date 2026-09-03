import type { DiaSemana } from './tipos'

/**
 * Datas em horário local (America/São_Paulo no aparelho da usuária).
 * Tudo aqui trabalha com "YYYY-MM-DD" para casar com o campo `data`.
 */

export function dataParaISO(d: Date): string {
  const ano = d.getFullYear()
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

/** Meio-dia local evita que fuso/horário de verão empurre para o dia vizinho. */
export function isoParaData(iso: string): Date {
  const [a, m, d] = iso.split('-').map(Number)
  return new Date(a, m - 1, d, 12, 0, 0, 0)
}

export const hojeISO = (): string => dataParaISO(new Date())

export function somarDias(iso: string, dias: number): string {
  const d = isoParaData(iso)
  d.setDate(d.getDate() + dias)
  return dataParaISO(d)
}

/** A segunda-feira da semana que contém `iso` (fim de semana cai na semana seguinte). */
export function inicioDaSemana(iso: string): string {
  const d = isoParaData(iso)
  const dow = d.getDay() // 0 = domingo
  if (dow === 0) return somarDias(iso, 1)
  if (dow === 6) return somarDias(iso, 2)
  return somarDias(iso, 1 - dow)
}

/** As cinco datas úteis a partir de uma segunda-feira. */
export function datasDaSemana(segundaISO: string): string[] {
  return [0, 1, 2, 3, 4].map((i) => somarDias(segundaISO, i))
}

export function diaSemanaDe(iso: string): DiaSemana {
  const dow = isoParaData(iso).getDay()
  if (dow < 1 || dow > 5) throw new Error(`${iso} não é dia útil`)
  return dow as DiaSemana
}

const fmtCurta = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' })
const fmtLonga = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long' })

export const formatarCurta = (iso: string): string => fmtCurta.format(isoParaData(iso))
export const formatarLonga = (iso: string): string => fmtLonga.format(isoParaData(iso))

export function rotuloSemana(segundaISO: string): string {
  const sexta = somarDias(segundaISO, 4)
  return `${formatarCurta(segundaISO)} a ${formatarCurta(sexta)}`
}
