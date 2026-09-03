/**
 * UID opaco. É o único identificador que sai do aparelho (vai para a tabela
 * `lembretes` no Postgres e no payload do push), então não pode ser derivado
 * de nome, telefone ou qualquer dado do paciente.
 */
export function novoUid(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Fallback (contexto sem randomUUID): 16 bytes aleatórios em hex.
  // Nada de Math.random — precisa ser imprevisível.
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}
