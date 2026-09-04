/**
 * Preferência de aparência (claro/escuro/sistema). Fica em `localStorage`,
 * não no Dexie: é ajuste do navegador neste aparelho, não dado da agenda, e
 * precisa ser lido de forma síncrona antes do primeiro paint pra não piscar
 * o tema errado.
 */
export type Tema = 'claro' | 'escuro' | 'sistema'

const CHAVE = 'agenda-tema'

export function lerTema(): Tema {
  const valor = localStorage.getItem(CHAVE)
  return valor === 'claro' || valor === 'escuro' ? valor : 'sistema'
}

export function definirTema(tema: Tema): void {
  if (tema === 'sistema') localStorage.removeItem(CHAVE)
  else localStorage.setItem(CHAVE, tema)
  aplicarTema()
}

/** Aplica a preferência atual no `<html>`. Chamar antes do primeiro render. */
export function aplicarTema(): void {
  const tema = lerTema()
  if (tema === 'sistema') delete document.documentElement.dataset.tema
  else document.documentElement.dataset.tema = tema
}
