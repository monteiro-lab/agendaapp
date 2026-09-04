import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import {
  criarOcorrencia,
  criarPaciente,
  criarRecorrencia,
  desativarRecorrencia,
  garantirOcorrencia,
  limparTudo,
  listarGrade,
  listarHistoricoPaciente,
  listarPorPeriodo,
  listarRecorrenciasDoPaciente,
  marcarStatus,
  pausarRecorrencia,
  removerPaciente,
  retomarRecorrencia,
} from './crud'

beforeEach(async () => {
  await limparTudo()
})

describe('pacientes', () => {
  it('remover paciente desvincula (VAGO) em vez de apagar horários', async () => {
    const paciente = await criarPaciente({ nome: 'Mariana Lisboa' })
    const rec = await criarRecorrencia({
      pacienteId: paciente.id,
      diaSemana: 3,
      hora: '09:00',
      regraCobranca: 'sem_rotulo',
    })
    const oc = await criarOcorrencia({
      recorrenciaId: rec.id,
      pacienteId: paciente.id,
      data: '2026-09-16',
      hora: '09:00',
    })

    await removerPaciente(paciente.id)

    const recDepois = await db.recorrencias.get(rec.id)
    const ocDepois = await db.ocorrencias.get(oc.id)
    expect(recDepois?.pacienteId).toBeNull()
    expect(ocDepois?.pacienteId).toBeNull()
    expect(await db.pacientes.get(paciente.id)).toBeUndefined()
  })

  it('recusa paciente sem nome', async () => {
    await expect(criarPaciente({ nome: '   ' })).rejects.toThrow()
  })

  it('listarRecorrenciasDoPaciente só traz as ativas dele, ordenadas', async () => {
    const paciente = await criarPaciente({ nome: 'Danilo Ribeiro' })
    const outro = await criarPaciente({ nome: 'Outro Paciente' })
    const tarde = await criarRecorrencia({
      pacienteId: paciente.id,
      diaSemana: 3,
      hora: '15:00',
      regraCobranca: 'sem_rotulo',
    })
    const cedo = await criarRecorrencia({
      pacienteId: paciente.id,
      diaSemana: 1,
      hora: '08:00',
      regraCobranca: 'copart40',
    })
    const inativa = await criarRecorrencia({
      pacienteId: paciente.id,
      diaSemana: 2,
      hora: '09:00',
      regraCobranca: 'sem_rotulo',
    })
    await desativarRecorrencia(inativa.id)
    await criarRecorrencia({ pacienteId: outro.id, diaSemana: 1, hora: '10:00', regraCobranca: 'sem_rotulo' })

    const horarios = await listarRecorrenciasDoPaciente(paciente.id)

    expect(horarios.map((r) => r.id)).toEqual([cedo.id, tarde.id])
  })

  it('listarHistoricoPaciente traz só as dele, mais recente primeiro', async () => {
    const paciente = await criarPaciente({ nome: 'Gabriel Ravi' })
    const outro = await criarPaciente({ nome: 'Outro Paciente' })
    await criarOcorrencia({ recorrenciaId: null, pacienteId: paciente.id, data: '2026-09-01', hora: '10:00' })
    const maisRecente = await criarOcorrencia({
      recorrenciaId: null,
      pacienteId: paciente.id,
      data: '2026-09-20',
      hora: '10:00',
    })
    await criarOcorrencia({ recorrenciaId: null, pacienteId: outro.id, data: '2026-09-25', hora: '10:00' })

    const historico = await listarHistoricoPaciente(paciente.id)

    expect(historico).toHaveLength(2)
    expect(historico[0].id).toBe(maisRecente.id)
  })
})

describe('recorrências', () => {
  it('normaliza horário livre ("10h20" -> "10:20")', async () => {
    const rec = await criarRecorrencia({
      pacienteId: null,
      diaSemana: 3,
      hora: '10h20',
      regraCobranca: 'particular',
    })
    expect(rec.hora).toBe('10:20')
  })

  it('listarGrade só traz as ativas, ordenadas por dia e hora', async () => {
    await criarRecorrencia({ pacienteId: null, diaSemana: 2, hora: '14:00', regraCobranca: 'sem_rotulo' })
    const cedo = await criarRecorrencia({ pacienteId: null, diaSemana: 1, hora: '08:00', regraCobranca: 'sem_rotulo' })
    const inativa = await criarRecorrencia({ pacienteId: null, diaSemana: 1, hora: '07:00', regraCobranca: 'sem_rotulo' })
    await desativarRecorrencia(inativa.id)

    const grade = await listarGrade()

    expect(grade.some((r) => r.id === inativa.id)).toBe(false)
    expect(grade[0].id).toBe(cedo.id)
  })

  it('pausar e retomar altera só o campo pausadaAte', async () => {
    const rec = await criarRecorrencia({ pacienteId: null, diaSemana: 1, hora: '08:00', regraCobranca: 'sem_rotulo' })

    await pausarRecorrencia(rec.id, '2026-12-31')
    expect((await db.recorrencias.get(rec.id))?.pausadaAte).toBe('2026-12-31')

    await retomarRecorrencia(rec.id)
    expect((await db.recorrencias.get(rec.id))?.pausadaAte).toBeUndefined()
  })

  it('pausar com data inválida falha antes de gravar', async () => {
    const rec = await criarRecorrencia({ pacienteId: null, diaSemana: 1, hora: '08:00', regraCobranca: 'sem_rotulo' })
    // A validação é síncrona: lança antes de sequer criar a Promise.
    expect(() => pausarRecorrencia(rec.id, '31/12/2026')).toThrow()
    expect((await db.recorrencias.get(rec.id))?.pausadaAte).toBeUndefined()
  })
})

describe('ocorrências', () => {
  it('garantirOcorrencia é idempotente para o mesmo par recorrência+data', async () => {
    const rec = await criarRecorrencia({ pacienteId: null, diaSemana: 4, hora: '15:00', regraCobranca: 'sem_rotulo' })
    const a = await garantirOcorrencia(rec, '2026-09-17')
    const b = await garantirOcorrencia(rec, '2026-09-17')
    expect(a.id).toBe(b.id)
    expect(await db.ocorrencias.count()).toBe(1)
  })

  it('marcarStatus e listarPorPeriodo refletem a mudança', async () => {
    const oc = await criarOcorrencia({
      recorrenciaId: null,
      pacienteId: null,
      data: '2026-09-18',
      hora: '11:00',
    })
    await marcarStatus(oc.id, 'realizada')

    const [lida] = await listarPorPeriodo('2026-09-01', '2026-09-30')
    expect(lida.status).toBe('realizada')
  })
})
