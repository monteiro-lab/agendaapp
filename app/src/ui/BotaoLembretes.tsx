import { useEffect, useState } from 'react'
import {
  ativarLembretes,
  desativarLembretes,
  estadoAtual,
  type EstadoPush,
} from '../push/inscricao'
import { sincronizarLembretes } from '../push/sincronizar'
import { IconeSino } from './icones'
import { useConfirmar } from './confirmar'

const TEXTO: Record<EstadoPush, string> = {
  'sem-suporte': 'Lembretes indisponíveis neste navegador',
  'precisa-instalar': 'Instale na tela inicial para ativar os lembretes',
  'sem-chave': 'Lembretes não configurados (falta a chave VAPID)',
  negada: 'Notificações bloqueadas nos ajustes do aparelho',
  desligada: 'Ativar lembretes',
  ligada: 'Lembretes ativos',
}

export default function BotaoLembretes() {
  const [estado, setEstado] = useState<EstadoPush>('desligada')
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState('')
  const confirmar = useConfirmar()

  useEffect(() => {
    void estadoAtual().then(setEstado)
  }, [])

  const podeAtivar = estado === 'desligada'

  async function ativar() {
    setOcupado(true)
    setAviso('')
    try {
      await ativarLembretes()
      const r = await sincronizarLembretes()
      setEstado(await estadoAtual())
      if (r) setAviso(`${r.enviados} lembretes agendados no servidor.`)
    } catch (e) {
      setAviso(e instanceof Error ? e.message : String(e))
    }
    setOcupado(false)
  }

  async function desativar() {
    const ok = await confirmar({
      mensagem: 'Desligar os lembretes deste aparelho?',
      textoConfirmar: 'Desligar',
      variante: 'perigo',
    })
    if (!ok) return
    setOcupado(true)
    try {
      await desativarLembretes()
      setEstado(await estadoAtual())
      setAviso('')
    } catch (e) {
      setAviso(e instanceof Error ? e.message : String(e))
    }
    setOcupado(false)
  }

  return (
    <div className="lembretes">
      <button
        className={`lembretes-botao ${estado}`}
        // Precisa ser um toque: o iOS só concede permissão a partir de um gesto.
        onClick={() => (podeAtivar ? void ativar() : estado === 'ligada' ? void desativar() : undefined)}
        disabled={ocupado || (!podeAtivar && estado !== 'ligada')}
      >
        <IconeSino width={16} height={16} />
        {ocupado ? 'aguarde…' : TEXTO[estado]}
      </button>
      {aviso && <p className="lembretes-aviso">{aviso}</p>}
    </div>
  )
}
