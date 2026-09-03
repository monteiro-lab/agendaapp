import { Pool } from 'pg'

/**
 * Pool reaproveitado entre invocações da mesma instância serverless.
 * A Vercel congela e reutiliza o processo por alguns minutos; criar um pool
 * por requisição estouraria as conexões do Postgres.
 */
declare global {
  // eslint-disable-next-line no-var
  var __poolAgenda: Pool | undefined
}

export function pool(): Pool {
  if (global.__poolAgenda) return global.__poolAgenda

  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL não configurada.')

  const p = new Pool({
    connectionString,
    // Poucas conexões: são muitas instâncias serverless concorrendo pelo
    // mesmo Postgres caseiro.
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 8_000,
    // O Postgres roda numa máquina própria, normalmente com certificado
    // autoassinado: exigimos SSL, sem exigir cadeia de confiança pública.
    ssl: connectionString.includes('sslmode=require')
      ? { rejectUnauthorized: false }
      : undefined,
  })

  global.__poolAgenda = p
  return p
}
