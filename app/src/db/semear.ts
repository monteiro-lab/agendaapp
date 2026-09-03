import { db } from './db'
import { novoUid } from './uid'
import { normalizarHora, type Paciente, type Recorrencia } from './tipos'
import { GRADE_INICIAL, type LinhaGrade } from './grade-inicial'

export interface ResumoSemeadura {
  pacientesCriados: number
  pacientesReaproveitados: number
  recorrenciasCriadas: number
  recorrenciasPuladas: number
}

/** Mesma pessoa mesmo com acento/caixa/espaço diferentes. */
function chaveNome(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function chaveSlot(diaSemana: number, hora: string, pacienteId: string | null): string {
  return `${diaSemana}|${hora}|${pacienteId ?? 'VAGO'}`
}

/**
 * Semeia `pacientes` e `recorrencias` a partir da grade transcrita do PDF.
 *
 * Idempotente: rodar de novo não duplica — pacientes são reaproveitados pelo
 * nome e recorrências já existentes (mesmo dia + hora + paciente) são puladas.
 * Nada aqui sai do aparelho.
 */
export async function semearGrade(
  linhas: LinhaGrade[] = GRADE_INICIAL,
): Promise<ResumoSemeadura> {
  const resumo: ResumoSemeadura = {
    pacientesCriados: 0,
    pacientesReaproveitados: 0,
    recorrenciasCriadas: 0,
    recorrenciasPuladas: 0,
  }

  await db.transaction('rw', db.pacientes, db.recorrencias, async () => {
    const existentes = await db.pacientes.toArray()
    const porNome = new Map(existentes.map((p) => [chaveNome(p.nome), p]))

    const slotsOcupados = new Set(
      (await db.recorrencias.toArray()).map((r) =>
        chaveSlot(r.diaSemana, r.hora, r.pacienteId),
      ),
    )

    const novosPacientes: Paciente[] = []
    const novasRecorrencias: Recorrencia[] = []

    for (const linha of linhas) {
      const hora = normalizarHora(linha.hora)
      let pacienteId: string | null = null

      if (linha.nome) {
        const chave = chaveNome(linha.nome)
        const achado = porNome.get(chave)
        if (achado) {
          pacienteId = achado.id
          // conta uma vez por linha que reaproveita alguém já existente
          resumo.pacientesReaproveitados++
        } else {
          const paciente: Paciente = { id: novoUid(), nome: linha.nome.trim() }
          porNome.set(chave, paciente)
          novosPacientes.push(paciente)
          pacienteId = paciente.id
          resumo.pacientesCriados++
        }
      }

      const slot = chaveSlot(linha.diaSemana, hora, pacienteId)
      if (slotsOcupados.has(slot)) {
        resumo.recorrenciasPuladas++
        continue
      }
      slotsOcupados.add(slot)
      novasRecorrencias.push({
        id: novoUid(),
        pacienteId,
        diaSemana: linha.diaSemana,
        hora,
        regraCobranca: linha.regra,
        ativa: true,
      })
      resumo.recorrenciasCriadas++
    }

    if (novosPacientes.length) await db.pacientes.bulkAdd(novosPacientes)
    if (novasRecorrencias.length) await db.recorrencias.bulkAdd(novasRecorrencias)
  })

  return resumo
}
