import { describe, expect, it } from 'vitest'
import { comLinhaDoAgora, type Slot } from './Agenda'

function slot(hora: string): Slot {
  return {
    chave: hora,
    data: '2026-09-15',
    hora,
    recorrencia: null,
    ocorrencia: null,
    pacienteId: 'p1',
    nome: 'Paciente',
    regra: 'sem_rotulo',
    pausada: false,
  }
}

describe('comLinhaDoAgora', () => {
  it('não insere nada quando não é o dia de hoje', () => {
    const slots = [slot('09:00'), slot('10:00')]
    const itens = comLinhaDoAgora(slots, false, 9 * 60 + 30)
    expect(itens).toEqual([
      { tipo: 'slot', slot: slots[0] },
      { tipo: 'slot', slot: slots[1] },
    ])
  })

  it('insere entre os horários que já passaram e os que ainda vêm', () => {
    const slots = [slot('09:00'), slot('10:00'), slot('11:00')]
    const itens = comLinhaDoAgora(slots, true, 10 * 60 + 30) // 10:30

    expect(itens.map((i) => (i.tipo === 'agora' ? 'agora' : i.slot.hora))).toEqual([
      '09:00',
      '10:00',
      'agora',
      '11:00',
    ])
  })

  it('vai para o topo quando ainda não começou nenhum horário', () => {
    const slots = [slot('09:00'), slot('10:00')]
    const itens = comLinhaDoAgora(slots, true, 8 * 60) // 08:00

    expect(itens[0]).toEqual({ tipo: 'agora' })
  })

  it('vai para o final quando o dia já terminou', () => {
    const slots = [slot('09:00'), slot('10:00')]
    const itens = comLinhaDoAgora(slots, true, 20 * 60) // 20:00

    expect(itens[itens.length - 1]).toEqual({ tipo: 'agora' })
  })

  it('aparece sozinha quando o dia de hoje não tem nenhum horário', () => {
    const itens = comLinhaDoAgora([], true, 10 * 60)
    expect(itens).toEqual([{ tipo: 'agora' }])
  })
})
