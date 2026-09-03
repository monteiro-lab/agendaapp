import { useState } from 'react'
import { semearGrade } from '../db'

/** Estado vazio: primeira abertura do app, antes de existir grade no aparelho. */
export default function Importar() {
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')

  async function importar() {
    setOcupado(true)
    setErro('')
    try {
      await semearGrade()
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
      setOcupado(false)
    }
  }

  return (
    <section className="vazio">
      <h2>Sua agenda está vazia</h2>
      <p>
        Importe a grade semanal da agenda em PDF para começar. Depois é só ajustar
        direto na tela — tudo fica guardado só neste aparelho.
      </p>
      <button className="primario" onClick={() => void importar()} disabled={ocupado}>
        {ocupado ? 'importando…' : 'Importar a grade do PDF'}
      </button>
      {erro && <p className="erro">{erro}</p>}
    </section>
  )
}
