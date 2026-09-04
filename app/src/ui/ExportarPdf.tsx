import { useState } from 'react'
import { formatarCurta, somarDias } from '../db'
import { IconeAlerta, IconeBaixar } from './icones'

export default function ExportarPdf({
  segundaAtual,
  aoFechar,
}: {
  /** A segunda-feira da semana visível na tela — vira o padrão do formulário. */
  segundaAtual: string
  aoFechar: () => void
}) {
  const sextaAtual = somarDias(segundaAtual, 4)
  const [modo, setModo] = useState<'semana' | 'periodo'>('semana')
  const [de, setDe] = useState(segundaAtual)
  const [ate, setAte] = useState(sextaAtual)
  const [gerando, setGerando] = useState(false)
  const [erro, setErro] = useState('')

  async function exportar() {
    const deReal = modo === 'semana' ? segundaAtual : de
    const ateReal = modo === 'semana' ? sextaAtual : ate
    if (deReal > ateReal) {
      setErro('A data final precisa ser depois da inicial.')
      return
    }
    setGerando(true)
    setErro('')
    try {
      // Carregado sob demanda: jsPDF é pesado e a maioria das aberturas do
      // app nunca exporta um PDF.
      const { exportarAgendaPdf } = await import('../pdf/exportarAgenda')
      await exportarAgendaPdf({ de: deReal, ate: ateReal })
      aoFechar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
      setGerando(false)
    }
  }

  return (
    <div className="folha-fundo" onClick={aoFechar}>
      <div
        className="folha"
        role="dialog"
        aria-modal="true"
        aria-label="Exportar PDF"
        onClick={(e) => e.stopPropagation()}
      >
        <h3>Exportar PDF</h3>

        <fieldset className="alcance">
          <legend>O quê</legend>
          <label className="radio">
            <input type="radio" checked={modo === 'semana'} onChange={() => setModo('semana')} />
            Semana atual ({formatarCurta(segundaAtual)} a {formatarCurta(sextaAtual)})
          </label>
          <label className="radio">
            <input type="radio" checked={modo === 'periodo'} onChange={() => setModo('periodo')} />
            Período personalizado
          </label>
        </fieldset>

        {modo === 'periodo' && (
          <>
            <label>
              De
              <input type="date" value={de} onChange={(e) => setDe(e.target.value)} />
            </label>
            <label>
              Até
              <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
            </label>
            <p className="ajuste-nota">
              O PDF sai em semanas completas (segunda a sexta) — uma tabela por
              semana. Datas fora disso são arredondadas para a semana que as contém.
            </p>
          </>
        )}

        {erro && (
          <p className="erro">
            <IconeAlerta width={16} height={16} />
            {erro}
          </p>
        )}

        <div className="folha-botoes">
          <button className="primario" onClick={() => void exportar()} disabled={gerando}>
            <IconeBaixar width={16} height={16} /> {gerando ? 'Gerando…' : 'Exportar'}
          </button>
          <button onClick={aoFechar}>Cancelar</button>
        </div>
      </div>
    </div>
  )
}
