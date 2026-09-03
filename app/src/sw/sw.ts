/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { db } from '../db/db'
import { NOME_REGRA, type Ocorrencia, type RegraCobranca } from '../db/tipos'

declare const self: ServiceWorkerGlobalScope

// A lista de arquivos do build é injetada aqui pelo vite-plugin-pwa.
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

/**
 * O push traz **só** `{ uid }` — o servidor não sabe de quem é o atendimento.
 * Quem descobre o nome é este service worker, lendo o banco local do aparelho.
 */
self.addEventListener('push', (event) => {
  event.waitUntil(mostrarLembrete(lerUid(event.data)))
})

function lerUid(dados: PushMessageData | null): string | null {
  if (!dados) return null
  try {
    const corpo = dados.json() as { uid?: unknown }
    return typeof corpo.uid === 'string' ? corpo.uid : null
  } catch {
    return null
  }
}

interface Aviso {
  titulo: string
  corpo: string
  tag: string
}

/**
 * O iOS exige que todo push mostre uma notificação (`userVisibleOnly`), então
 * mesmo sem achar a ocorrência é preciso avisar — genericamente.
 */
async function mostrarLembrete(uid: string | null): Promise<void> {
  const aviso = await montarAviso(uid)
  await self.registration.showNotification(aviso.titulo, {
    body: aviso.corpo,
    tag: aviso.tag,
    icon: '/icone-192.png',
    badge: '/icone-192.png',
    // Reabre a agenda no dia certo ao tocar.
    data: { uid },
    requireInteraction: false,
  })
}

async function montarAviso(uid: string | null): Promise<Aviso> {
  const generico: Aviso = {
    titulo: 'Atendimento em breve',
    corpo: 'Abra a agenda para ver os detalhes.',
    tag: uid ?? 'agenda',
  }
  if (!uid) return generico

  try {
    const ocorrencia = await db.ocorrencias.get(uid)
    if (!ocorrencia) return generico
    if (ocorrencia.status === 'cancelada') {
      return {
        titulo: `${ocorrencia.hora} — atendimento cancelado`,
        corpo: 'Este horário foi cancelado na agenda.',
        tag: uid,
      }
    }

    const nome = await nomeDoPaciente(ocorrencia)
    const regra = await regraDaOcorrencia(ocorrencia)

    const detalhes = [`Começa às ${ocorrencia.hora}.`]
    if (regra && regra !== 'sem_rotulo') detalhes.push(NOME_REGRA[regra])
    if (ocorrencia.observacoes) detalhes.push(ocorrencia.observacoes)

    return {
      titulo: `${ocorrencia.hora} — ${nome}`,
      corpo: detalhes.join(' '),
      tag: uid,
    }
  } catch {
    return generico
  }
}

async function nomeDoPaciente(ocorrencia: Ocorrencia): Promise<string> {
  if (!ocorrencia.pacienteId) return 'Horário vago'
  const paciente = await db.pacientes.get(ocorrencia.pacienteId)
  return paciente?.nome ?? 'Paciente'
}

async function regraDaOcorrencia(ocorrencia: Ocorrencia): Promise<RegraCobranca | null> {
  if (!ocorrencia.recorrenciaId) return null
  const recorrencia = await db.recorrencias.get(ocorrencia.recorrenciaId)
  return recorrencia?.regraCobranca ?? null
}

/** Tocar na notificação traz a agenda para a frente (ou abre o app). */
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(abrirAgenda())
})

async function abrirAgenda(): Promise<void> {
  const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  for (const janela of janelas) {
    if ('focus' in janela) {
      await janela.focus()
      return
    }
  }
  await self.clients.openWindow('/')
}
