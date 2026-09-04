import { useEffect, useState } from 'react'
import {
  conferirBiometria,
  conferirPin,
  lerConfig,
  marcarDestravado,
  tempoBloqueioRestante,
  type TipoTrava,
} from '../seguranca/trava'
import { IconeAlerta, IconeCadeado, IconeImpressaoDigital } from './icones'

/** Tela de bloqueio. Nada da agenda é renderizado atrás dela. */
export default function Trava({ aoLiberar }: { aoLiberar: () => void }) {
  const [tipo, setTipo] = useState<TipoTrava>('nenhuma')
  const [pin, setPin] = useState('')
  const [erro, setErro] = useState('')
  const [tentando, setTentando] = useState(false)
  /** Segundos restantes de bloqueio; 0 = livre para tentar. */
  const [restante, setRestante] = useState(0)

  useEffect(() => {
    void lerConfig().then((c) => setTipo(c.tipo))
  }, [])

  // Se o app foi fechado durante um bloqueio, reabrir já mostra a contagem —
  // não deixa "esquecer" o bloqueio nem dá uma tentativa grátis.
  useEffect(() => {
    void tempoBloqueioRestante().then((ms) => setRestante(Math.ceil(ms / 1000)))
  }, [])

  useEffect(() => {
    if (restante <= 0) return
    const t = setInterval(() => setRestante((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(t)
  }, [restante])

  function liberar() {
    marcarDestravado()
    aoLiberar()
  }

  async function comBiometria() {
    setTentando(true)
    setErro('')
    if (await conferirBiometria()) liberar()
    else setErro('Não reconhecido. Tente de novo.')
    setTentando(false)
  }

  async function comPin(evento: React.FormEvent) {
    evento.preventDefault()
    setTentando(true)
    setErro('')
    const resultado = await conferirPin(pin)
    if (resultado === 'ok') {
      liberar()
    } else if (resultado === 'bloqueado') {
      const ms = await tempoBloqueioRestante()
      setRestante(Math.ceil(ms / 1000))
      setPin('')
    } else {
      setErro('PIN incorreto.')
      setPin('')
      // Já pode ter acabado de estourar o limite nessa própria tentativa.
      const ms = await tempoBloqueioRestante()
      if (ms > 0) setRestante(Math.ceil(ms / 1000))
    }
    setTentando(false)
  }

  const bloqueado = restante > 0

  return (
    <div className="trava">
      <div className="trava-caixa">
        <span className="trava-icone">
          {tipo === 'biometria' ? <IconeImpressaoDigital /> : <IconeCadeado />}
        </span>
        <h1>Agenda</h1>
        <p>Esta agenda está protegida.</p>

        {tipo === 'biometria' && (
          <button className="primario" onClick={() => void comBiometria()} disabled={tentando}>
            {tentando ? 'aguarde…' : 'Desbloquear'}
          </button>
        )}

        {tipo === 'pin' && (
          <form onSubmit={(e) => void comPin(e)}>
            <label>
              PIN
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                disabled={bloqueado}
                autoFocus
              />
            </label>
            <button
              className="primario"
              type="submit"
              disabled={tentando || bloqueado || pin.length < 4}
            >
              {bloqueado ? `Tente de novo em ${restante}s` : 'Entrar'}
            </button>
          </form>
        )}

        {erro && !bloqueado && (
          <p className="erro">
            <IconeAlerta width={16} height={16} />
            {erro}
          </p>
        )}

        {bloqueado && (
          <p className="erro">
            <IconeAlerta width={16} height={16} />
            Muitas tentativas erradas. Aguarde {restante}s.
          </p>
        )}

        {tipo === 'pin' && (
          <p className="trava-nota">
            Esqueceu o PIN? Não há como recuperá-lo — só apagando os dados do app,
            o que apaga a agenda junto.
          </p>
        )}
      </div>
    </div>
  )
}
