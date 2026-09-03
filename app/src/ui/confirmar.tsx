import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { IconeAlerta } from './icones'

export interface OpcoesConfirmacao {
  titulo?: string
  mensagem: string
  textoConfirmar?: string
  textoCancelar?: string
  /** 'perigo' para ações destrutivas (some com dados, desliga proteção). */
  variante?: 'perigo' | 'normal'
}

type FuncaoConfirmar = (opcoes: OpcoesConfirmacao) => Promise<boolean>

const ConfirmarContexto = createContext<FuncaoConfirmar | null>(null)

/** Substitui o `confirm()` nativo do navegador por um modal no estilo do app. */
export function useConfirmar(): FuncaoConfirmar {
  const ctx = useContext(ConfirmarContexto)
  if (!ctx) throw new Error('useConfirmar precisa estar dentro de <ProvedorConfirmacao>.')
  return ctx
}

/** Monta uma vez, perto da raiz do app — ver src/main.tsx. */
export function ProvedorConfirmacao({ children }: { children: ReactNode }) {
  const [pedido, setPedido] = useState<OpcoesConfirmacao | null>(null)
  const resolverRef = useRef<(valor: boolean) => void>(() => {})

  const confirmar = useCallback<FuncaoConfirmar>((opcoes) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve
      setPedido(opcoes)
    })
  }, [])

  const responder = useCallback((valor: boolean) => {
    setPedido(null)
    resolverRef.current(valor)
  }, [])

  useEffect(() => {
    if (!pedido) return
    const aoTeclar = (e: KeyboardEvent) => e.key === 'Escape' && responder(false)
    document.addEventListener('keydown', aoTeclar)
    return () => document.removeEventListener('keydown', aoTeclar)
  }, [pedido, responder])

  return (
    <ConfirmarContexto.Provider value={confirmar}>
      {children}
      {pedido && (
        <div className="folha-fundo centro" onClick={() => responder(false)}>
          <div
            className="folha compacta"
            role="alertdialog"
            aria-modal="true"
            aria-label={pedido.titulo ?? 'Confirmar'}
            onClick={(e) => e.stopPropagation()}
          >
            <span className={`trava-icone ${pedido.variante === 'perigo' ? 'perigo' : ''}`}>
              <IconeAlerta />
            </span>
            {pedido.titulo && <h3>{pedido.titulo}</h3>}
            <p className="confirmar-mensagem">{pedido.mensagem}</p>
            <div className="folha-botoes">
              <button
                className={pedido.variante === 'perigo' ? 'perigo' : 'primario'}
                onClick={() => responder(true)}
                autoFocus
              >
                {pedido.textoConfirmar ?? 'Confirmar'}
              </button>
              <button onClick={() => responder(false)}>{pedido.textoCancelar ?? 'Cancelar'}</button>
            </div>
          </div>
        </div>
      )}
    </ConfirmarContexto.Provider>
  )
}
