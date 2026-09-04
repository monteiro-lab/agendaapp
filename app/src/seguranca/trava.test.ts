import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/db'
import { conferirPin, definirPin, tempoBloqueioRestante } from './trava'

beforeEach(async () => {
  await db.config.clear()
})

describe('bloqueio progressivo do PIN', () => {
  it('deixa errar algumas vezes sem bloquear', async () => {
    await definirPin('1234')
    for (let i = 0; i < 4; i++) {
      expect(await conferirPin('0000')).toBe('incorreto')
    }
    expect(await tempoBloqueioRestante()).toBe(0)
  })

  it('bloqueia depois de 5 erros seguidos, por ~30s', async () => {
    await definirPin('1234')
    for (let i = 0; i < 5; i++) await conferirPin('0000')

    const restante = await tempoBloqueioRestante()
    expect(restante).toBeGreaterThan(25_000)
    expect(restante).toBeLessThanOrEqual(30_000)
  })

  it('recusa até o PIN correto enquanto estiver bloqueado', async () => {
    await definirPin('1234')
    for (let i = 0; i < 5; i++) await conferirPin('0000')

    expect(await conferirPin('1234')).toBe('bloqueado')
  })

  it('acertar o PIN reseta as tentativas e o nível de bloqueio', async () => {
    await definirPin('1234')
    for (let i = 0; i < 4; i++) await conferirPin('0000') // erra, mas não estoura

    expect(await conferirPin('1234')).toBe('ok')

    // Como resetou, precisa de 5 nova erros pra bloquear de novo — não só 1.
    for (let i = 0; i < 4; i++) {
      expect(await conferirPin('0000')).toBe('incorreto')
    }
    expect(await tempoBloqueioRestante()).toBe(0)
  })

  it('dobra a duração a cada vez que o limite estoura de novo', async () => {
    await definirPin('1234')
    for (let i = 0; i < 5; i++) await conferirPin('0000')
    const primeiro = await tempoBloqueioRestante()

    // Simula o primeiro bloqueio já ter expirado, sem esperar de verdade.
    const linha = await db.config.get('trava')
    const valor = linha!.valor as { bloqueadoAteMs?: number }
    valor.bloqueadoAteMs = Date.now() - 1
    await db.config.put({ chave: 'trava', valor })

    for (let i = 0; i < 5; i++) await conferirPin('0000')
    const segundo = await tempoBloqueioRestante()

    expect(segundo).toBeGreaterThan(primeiro * 1.5)
  })

  it('definir um novo PIN limpa qualquer bloqueio anterior', async () => {
    await definirPin('1234')
    for (let i = 0; i < 5; i++) await conferirPin('0000')
    expect(await tempoBloqueioRestante()).toBeGreaterThan(0)

    await definirPin('5678')

    expect(await tempoBloqueioRestante()).toBe(0)
    expect(await conferirPin('5678')).toBe('ok')
  })
})
