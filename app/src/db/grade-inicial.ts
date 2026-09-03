import type { DiaSemana, RegraCobranca } from './tipos'

/**
 * Transcrição literal de "Agenda Atualizada.pdf" (grade seg–sex, 08h–18h,
 * sem a faixa das 12h). Fica versionada no código para poder ser revisada
 * por diff e reimportada.
 *
 * Regras da leitura:
 * - `nome: null` = célula VAGO (o horário existe, sem paciente).
 * - `regra: 'sem_rotulo'` = a célula não trazia rótulo de cobrança.
 * - Célula com dois nomes vira duas linhas no mesmo dia/hora.
 * - O rótulo embaixo de um nome vale só para aquele nome.
 */
export interface LinhaGrade {
  diaSemana: DiaSemana
  hora: string
  nome: string | null
  regra: RegraCobranca
}

const SEG = 1, TER = 2, QUA = 3, QUI = 4, SEX = 5

export const GRADE_INICIAL: LinhaGrade[] = [
  // 08:00
  { diaSemana: SEG, hora: '08:00', nome: null, regra: 'sem_rotulo' },
  { diaSemana: TER, hora: '08:00', nome: 'João Lucas Felix', regra: 'sem_rotulo' },
  { diaSemana: QUA, hora: '08:00', nome: 'João Lucas Felix', regra: 'sem_rotulo' },
  { diaSemana: QUI, hora: '08:00', nome: 'Theo Luiz', regra: 'copart20' },
  { diaSemana: SEX, hora: '08:00', nome: null, regra: 'sem_rotulo' },

  // 09:00
  { diaSemana: SEG, hora: '09:00', nome: null, regra: 'sem_rotulo' },
  { diaSemana: TER, hora: '09:00', nome: 'Heitor Gomes', regra: 'sem_rotulo' },
  { diaSemana: QUA, hora: '09:00', nome: 'Mariana Lisboa', regra: 'sem_rotulo' },
  { diaSemana: QUI, hora: '09:00', nome: 'Antony Lourenço', regra: 'copart40' },
  { diaSemana: SEX, hora: '09:00', nome: 'Bernardo Fidelis', regra: 'pos' },

  // 10:00  (quarta cai às 10:20)
  { diaSemana: SEG, hora: '10:00', nome: 'Hércules Silva', regra: 'copart40' },
  { diaSemana: TER, hora: '10:00', nome: 'Erber Filho', regra: 'sem_rotulo' },
  { diaSemana: QUA, hora: '10:20', nome: 'Salomão Rocha', regra: 'particular' },
  { diaSemana: QUI, hora: '10:00', nome: 'Erber Filho', regra: 'sem_rotulo' },
  { diaSemana: SEX, hora: '10:00', nome: 'Caio José', regra: 'sem_rotulo' },

  // 11:00
  { diaSemana: SEG, hora: '11:00', nome: 'Laura Valentina', regra: 'copart40' },
  { diaSemana: TER, hora: '11:00', nome: 'Noemi Maria Teles', regra: 'copart40' },
  { diaSemana: QUA, hora: '11:00', nome: 'Danilo Ribeiro', regra: 'copart40' },
  { diaSemana: QUA, hora: '11:00', nome: 'Gabriel Ravi', regra: 'copart40' },
  { diaSemana: QUI, hora: '11:00', nome: 'Lara Sofia', regra: 'copart40' },
  { diaSemana: SEX, hora: '11:00', nome: 'Allana Lopes', regra: 'sem_rotulo' },

  // 13:00
  { diaSemana: SEG, hora: '13:00', nome: 'Helena Reges', regra: 'copart40' },
  { diaSemana: TER, hora: '13:00', nome: 'Benicio Vieira', regra: 'sem_rotulo' },
  { diaSemana: QUA, hora: '13:00', nome: 'Benicio Vieira', regra: 'sem_rotulo' },
  { diaSemana: QUI, hora: '13:00', nome: 'Enzo Gabriel Carvalho', regra: 'copart40' },

  // 14:00
  { diaSemana: SEG, hora: '14:00', nome: 'Guilherme Oliveira', regra: 'sem_rotulo' },
  { diaSemana: TER, hora: '14:00', nome: 'Gustavo Oliveira', regra: 'sem_rotulo' },
  { diaSemana: TER, hora: '14:00', nome: 'Miguel Moreira', regra: 'sem_rotulo' },
  { diaSemana: QUA, hora: '14:00', nome: 'Miguel Moreira', regra: 'sem_rotulo' },
  { diaSemana: QUA, hora: '14:00', nome: 'José Rafael', regra: 'copart40' },
  { diaSemana: QUI, hora: '14:00', nome: 'Pedro Henrique', regra: 'sem_rotulo' },
  { diaSemana: QUI, hora: '14:00', nome: 'Rafael Cruz', regra: 'copart40' },

  // 15:00
  { diaSemana: SEG, hora: '15:00', nome: 'Enzo Gabriel Almeida', regra: 'sem_rotulo' },
  { diaSemana: TER, hora: '15:00', nome: 'Marcus Vinicius', regra: 'sem_rotulo' },
  { diaSemana: QUA, hora: '15:00', nome: 'Luis Felipe', regra: 'sem_rotulo' },
  { diaSemana: QUA, hora: '15:00', nome: 'Sofia Helena', regra: 'sem_rotulo' },
  { diaSemana: QUI, hora: '15:00', nome: 'Rafael Cruz', regra: 'copart40' },

  // 16:00
  { diaSemana: SEG, hora: '16:00', nome: 'Antonio Marcos', regra: 'copart40' },
  { diaSemana: TER, hora: '16:00', nome: 'Theo Luiz', regra: 'copart20' },
  { diaSemana: QUA, hora: '16:00', nome: 'Marcus Vinicius', regra: 'sem_rotulo' },
  { diaSemana: QUI, hora: '16:00', nome: 'Luiz Antonio (Lulu)', regra: 'sem_rotulo' },

  // 17:00
  { diaSemana: SEG, hora: '17:00', nome: 'Daniel de Souza', regra: 'sem_rotulo' },
  { diaSemana: TER, hora: '17:00', nome: 'Sofia Helena', regra: 'sem_rotulo' },
  { diaSemana: QUA, hora: '17:00', nome: 'Davi Luiz', regra: 'sem_rotulo' },
  { diaSemana: QUI, hora: '17:00', nome: 'Guilherme Voltarie', regra: 'sem_rotulo' },

  // 18:00
  { diaSemana: SEG, hora: '18:00', nome: 'Cauã Eugenio Amorim', regra: 'copart40' },
  { diaSemana: TER, hora: '18:00', nome: 'Gabriel Eugenio Amorim', regra: 'copart40' },
  { diaSemana: QUA, hora: '18:00', nome: 'Bernardo Jorge', regra: 'copart40' },
  { diaSemana: QUI, hora: '18:00', nome: 'Gabriel Eugenio Amorim', regra: 'copart40' },
]

/** As faixas de horário da grade impressa (a de 12h não existe). */
export const FAIXAS_GRADE = [
  '08:00', '09:00', '10:00', '11:00',
  '13:00', '14:00', '15:00', '16:00', '17:00', '18:00',
]
