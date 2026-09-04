import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { ProvedorConfirmacao } from './ui/confirmar'
import { aplicarTema } from './tema'
import './styles.css'

aplicarTema()
registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ProvedorConfirmacao>
      <App />
    </ProvedorConfirmacao>
  </StrictMode>,
)
