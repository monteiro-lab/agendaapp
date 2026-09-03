import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { criarPaciente, criarRecorrencia, limparTudo, pausarRecorrencia } from './crud'
import { gerarOcorrencias, propagarParaFuturas } from './gerar'
import { hojeISO, somarDias } from './semana'

beforeEach(async () => {
  await limparTudo()
})

describe('gerarOcorrencias', () => {
  it('materializa uma recorrência ativa nos próximos 30 dias', async () => {
    const paciente = await criarPaciente({ nome: 'Heitor Gomes' })
    await criarRecorrencia({ pacienteId: paciente.id, diaSemana: 1, hora: '09:00', regraCobranca: 'sem_rotulo' })

    const resumo = await gerarOcorrencias({ diasAFrente: 30 })

    expect(resumo.criadas).toBeGreaterThan(0)
    const geradas = await db.ocorrencias.toArray()
    expect(geradas.length).toBe(resumo.criadas)
    expect(geradas.every((o) => o.status === 'agendada')).toBe(true)
  })

  it('é idempotente: rodar de novo não duplica', async () => {
    const paciente = await criarPaciente({ nome: 'Erber Filho' })
    await criarRecorrencia({ pacienteId: paciente.id, diaSemana: 2, hora: '10:00', regraCobranca: 'sem_rotulo' })

    const primeira = await gerarOcorrencias({ diasAFrente: 30 })
    const segunda = await gerarOcorrencias({ diasAFrente: 30 })

    expect(segunda.criadas).toBe(0)
    expect(segunda.jaExistiam).toBe(primeira.criadas)
    const total = await db.ocorrencias.count()
    expect(total).toBe(primeira.criadas)
  })

  it('cria também os slots VAGO (sem paciente)', async () => {
    await criarRecorrencia({ pacienteId: null, diaSemana: 1, hora: '08:00', regraCobranca: 'sem_rotulo' })

    await gerarOcorrencias({ diasAFrente: 14 })

    const geradas = await db.ocorrencias.toArray()
    expect(geradas.length).toBeGreaterThan(0)
    expect(geradas.every((o) => o.pacienteId === null)).toBe(true)
  })

  it('desativar a série remove só as ocorrências futuras intocadas', async () => {
    const paciente = await criarPaciente({ nome: 'Salomão Rocha' })
    const rec = await criarRecorrencia({
      pacienteId: paciente.id,
      diaSemana: 3,
      hora: '10:20',
      regraCobranca: 'particular',
    })
    await gerarOcorrencias({ diasAFrente: 30 })

    // Uma delas já foi realizada — não pode sumir mesmo com a série desativada.
    const primeira = await db.ocorrencias.where('recorrenciaId').equals(rec.id).first()
    if (primeira) await db.ocorrencias.update(primeira.id, { status: 'realizada' })

    await db.recorrencias.update(rec.id, { ativa: false })
    const resumo = await gerarOcorrencias({ diasAFrente: 30 })

    expect(resumo.removidasOrfas).toBeGreaterThan(0)
    const restantes = await db.ocorrencias.where('recorrenciaId').equals(rec.id).toArray()
    expect(restantes.every((o) => o.status === 'realizada')).toBe(true)
  })

  it('pausar a série não materializa datas dentro da pausa, e limpa as já geradas', async () => {
    const paciente = await criarPaciente({ nome: 'Antony Lourenço' })
    const rec = await criarRecorrencia({
      pacienteId: paciente.id,
      diaSemana: 1,
      hora: '09:00',
      regraCobranca: 'copart40',
    })
    await gerarOcorrencias({ diasAFrente: 30 })
    const antes = await db.ocorrencias.where('recorrenciaId').equals(rec.id).count()
    expect(antes).toBeGreaterThan(0)

    const pausaAte = somarDias(hojeISO(), 12)
    await pausarRecorrencia(rec.id, pausaAte)
    const resumo = await gerarOcorrencias({ diasAFrente: 30 })

    const depois = await db.ocorrencias.where('recorrenciaId').equals(rec.id).toArray()
    expect(depois.every((o) => o.data > pausaAte)).toBe(true)
    expect(resumo.removidasOrfas).toBeGreaterThan(0)
  })

  it('a pausa não apaga uma ocorrência já realizada dentro do período', async () => {
    const paciente = await criarPaciente({ nome: 'Caio José' })
    const rec = await criarRecorrencia({
      pacienteId: paciente.id,
      diaSemana: 1,
      hora: '10:00',
      regraCobranca: 'sem_rotulo',
    })
    await gerarOcorrencias({ diasAFrente: 30 })
    const pausaAte = somarDias(hojeISO(), 12)

    const dentroDaPausa = await db.ocorrencias
      .where('recorrenciaId')
      .equals(rec.id)
      .filter((o) => o.data <= pausaAte)
      .first()
    if (dentroDaPausa) await db.ocorrencias.update(dentroDaPausa.id, { status: 'realizada' })

    await pausarRecorrencia(rec.id, pausaAte)
    await gerarOcorrencias({ diasAFrente: 30 })

    if (dentroDaPausa) {
      const aindaExiste = await db.ocorrencias.get(dentroDaPausa.id)
      expect(aindaExiste?.status).toBe('realizada')
    }
  })
})

describe('propagarParaFuturas', () => {
  it('atualiza hora/paciente nas ocorrências futuras ainda não tocadas', async () => {
    const p1 = await criarPaciente({ nome: 'Bernardo Fidelis' })
    const p2 = await criarPaciente({ nome: 'Danilo Ribeiro' })
    const rec = await criarRecorrencia({ pacienteId: p1.id, diaSemana: 4, hora: '09:00', regraCobranca: 'pos' })
    await gerarOcorrencias({ diasAFrente: 30 })

    await propagarParaFuturas(rec.id, { pacienteId: p2.id, hora: '09:30' })

    const geradas = await db.ocorrencias.where('recorrenciaId').equals(rec.id).toArray()
    expect(geradas.every((o) => o.pacienteId === p2.id && o.hora === '09:30')).toBe(true)
  })

  it('não mexe numa ocorrência já realizada ou com observação', async () => {
    const p1 = await criarPaciente({ nome: 'Gabriel Ravi' })
    const p2 = await criarPaciente({ nome: 'Lara Sofia' })
    const rec = await criarRecorrencia({ pacienteId: p1.id, diaSemana: 5, hora: '11:00', regraCobranca: 'sem_rotulo' })
    await gerarOcorrencias({ diasAFrente: 30 })

    const alvo = await db.ocorrencias.where('recorrenciaId').equals(rec.id).first()
    if (alvo) await db.ocorrencias.update(alvo.id, { status: 'realizada' })

    await propagarParaFuturas(rec.id, { pacienteId: p2.id, hora: '11:30' })

    if (alvo) {
      const depois = await db.ocorrencias.get(alvo.id)
      expect(depois?.pacienteId).toBe(p1.id)
      expect(depois?.hora).toBe('11:00')
    }
  })
})
