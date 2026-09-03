import type { IncomingMessage, ServerResponse } from 'node:http'
import { loadEnv, type Plugin } from 'vite'

/**
 * Serve as rotas de `api/` durante `npm run dev`.
 *
 * Só existe no desenvolvimento (`apply: 'serve'`): em produção quem executa
 * essas funções é a Vercel, e este arquivo não entra no bundle do cliente.
 * Os handlers são carregados pelo próprio Vite (`ssrLoadModule`), então valem
 * o hot-reload e o TypeScript sem passo de build.
 */
export function apiDev(): Plugin {
  return {
    name: 'agenda:api-dev',
    apply: 'serve',
    configureServer(server) {
      // As rotas leem process.env; o .env fica na raiz do repositório.
      const env = loadEnv(server.config.mode, server.config.envDir ?? '..', '')
      for (const [chave, valor] of Object.entries(env)) {
        if (process.env[chave] === undefined) process.env[chave] = valor
      }

      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next) => {
        const caminho = (req.url ?? '').split('?')[0]
        if (!caminho.startsWith('/api/')) return next()

        // Só nomes simples: nada de subir diretório.
        const rota = caminho.slice('/api/'.length)
        if (!/^[a-z0-9_-]+$/i.test(rota)) return next()

        try {
          const modulo = await server.ssrLoadModule(`/api/${rota}.ts`)
          const handler = modulo.default as (req: unknown, res: unknown) => unknown
          if (typeof handler !== 'function') return next()

          await handler(await adaptarRequisicao(req), adaptarResposta(res))
        } catch (erro) {
          // Rota inexistente cai para o Vite (que responde o index.html).
          if ((erro as { code?: string }).code === 'ERR_LOAD_URL') return next()
          server.config.logger.error(`[api-dev] ${rota}: ${String(erro)}`)
          res.statusCode = 500
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ erro: 'Falha interna (dev).' }))
        }
      })
    },
  }
}

async function adaptarRequisicao(req: IncomingMessage) {
  const [, consulta = ''] = (req.url ?? '').split('?')
  return {
    method: req.method,
    url: req.url,
    headers: req.headers,
    query: Object.fromEntries(new URLSearchParams(consulta)),
    body: await lerCorpo(req),
  }
}

function lerCorpo(req: IncomingMessage): Promise<unknown> {
  if (req.method === 'GET' || req.method === 'HEAD') return Promise.resolve(undefined)
  return new Promise((resolve, reject) => {
    const partes: Buffer[] = []
    req.on('data', (parte: Buffer) => partes.push(parte))
    req.on('error', reject)
    req.on('end', () => {
      const bruto = Buffer.concat(partes).toString('utf8')
      if (!bruto) return resolve(undefined)
      try {
        resolve(JSON.parse(bruto))
      } catch {
        resolve(bruto)
      }
    })
  })
}

/** O mínimo da interface VercelResponse que as rotas usam. */
function adaptarResposta(res: ServerResponse) {
  let status = 200
  const api = {
    status(codigo: number) {
      status = codigo
      return api
    },
    setHeader(nome: string, valor: string) {
      res.setHeader(nome, valor)
      return api
    },
    json(corpo: unknown) {
      res.statusCode = status
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.end(JSON.stringify(corpo))
      return api
    },
    send(corpo: string) {
      res.statusCode = status
      res.end(corpo)
      return api
    },
    end() {
      res.statusCode = status
      res.end()
      return api
    },
  }
  return api
}
