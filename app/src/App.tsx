import { useCallback, useEffect, useState } from 'react'
import Agenda from './ui/Agenda'
import Trava from './ui/Trava'
import { marcarDestravado, precisaDestravar } from './seguranca/trava'
import { IconeAlerta } from './ui/icones'

export default function App() {
  const [instalado, setInstalado] = useState(true)
  const [trancado, setTrancado] = useState<boolean | null>(null)

  useEffect(() => {
    // No iPhone, "instalado na tela inicial" é o que habilita o Web Push.
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    setInstalado(standalone)
  }, [])

  const reavaliar = useCallback(() => {
    void precisaDestravar().then(setTrancado)
  }, [])

  useEffect(reavaliar, [reavaliar])

  // Voltar do segundo plano re-tranca se passou o tempo de ociosidade.
  useEffect(() => {
    const aoVoltar = () => {
      if (document.visibilityState === 'visible') reavaliar()
    }
    document.addEventListener('visibilitychange', aoVoltar)
    return () => document.removeEventListener('visibilitychange', aoVoltar)
  }, [reavaliar])

  // Enquanto não sabemos, não pisca a agenda na tela.
  if (trancado === null) return null

  if (trancado) {
    return (
      <Trava
        aoLiberar={() => {
          marcarDestravado()
          setTrancado(false)
        }}
      />
    )
  }

  return (
    <>
      <Agenda />
      {!instalado && (
        <p className="dica">
          <IconeAlerta width={18} height={18} />
          <span>
            No iPhone: <strong>Compartilhar → Adicionar à Tela de Início</strong>. Os lembretes
            só funcionam com o app instalado.
          </span>
        </p>
      )}
    </>
  )
}
