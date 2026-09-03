import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { criarOcorrencia, criarPaciente, criarRecorrencia, limparTudo } from './crud'
import { montarBackup, restaurarBackup } from './backup'

beforeEach(async () => {
  await limparTudo()
})

describe('backup', () => {
  it('exporta e restaura sem perder nada (round-trip)', async () => {
    const paciente = await criarPaciente({ nome: 'Noemi Maria Teles', telefone: '11988887777' })
    const rec = await criarRecorrencia({
      pacienteId: paciente.id,
      diaSemana: 2,
      hora: '11:00',
      regraCobranca: 'copart40',
    })
    await criarOcorrencia({
      recorrenciaId: rec.id,
      pacienteId: paciente.id,
      data: '2026-09-15',
      hora: '11:00',
      status: 'realizada',
    })

    const backup = await montarBackup()
    expect(backup.pacientes).toHaveLength(1)
    expect(backup.recorrencias).toHaveLength(1)
    expect(backup.ocorrencias).toHaveLength(1)

    // Simula ida e volta por um arquivo de verdade.
    const relido = JSON.parse(JSON.stringify(backup))

    await limparTudo()
    expect(await db.pacientes.count()).toBe(0)

    await restaurarBackup(relido)

    expect(await db.pacientes.count()).toBe(1)
    expect(await db.recorrencias.count()).toBe(1)
    expect(await db.ocorrencias.count()).toBe(1)
    const pacienteDeVolta = await db.pacientes.get(paciente.id)
    expect(pacienteDeVolta?.telefone).toBe('11988887777')
  })

  it('restaurar substitui os dados atuais, não faz merge', async () => {
    await criarPaciente({ nome: 'Alguém que vai sumir' })
    const backup = await montarBackup() // backup vazio (nenhum paciente ainda? não, tem 1)

    await criarPaciente({ nome: 'Outro paciente' })
    expect(await db.pacientes.count()).toBe(2)

    await restaurarBackup(backup)

    expect(await db.pacientes.count()).toBe(1)
  })

  it('recusa um arquivo que não é um backup desta agenda', async () => {
    await expect(restaurarBackup({ oi: 'não sou um backup' })).rejects.toThrow()
    await expect(restaurarBackup(null)).rejects.toThrow()
    await expect(restaurarBackup('texto qualquer')).rejects.toThrow()
  })
})
