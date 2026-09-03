import { useEffect, useState } from 'react'
import {
  conferirBiometria,
  conferirPin,
  lerConfig,
  marcarDestravado,
  type TipoTrava,
} from '../seguranca/trava'
import { IconeAlerta, IconeCadeado, IconeImpressaoDigital } from './icones'

/** Tela de bloqueio. Nada da agenda é renderizado atrás dela. */
export default function Trava({ aoLiberar }: { aoLiberar: () => void }) {
  const [tipo, setTipo] = useState<TipoTrava>('nenhuma')
  const [pin, setPin] = useState('')
  const [erro, setErro] = useState('')
  const [tentando, setTentando] = useState(false)

  useEffect(() => {
    void lerConfig().then((c) => setTipo(c.tipo))
  }, [])

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
    if (await conferirPin(pin)) liberar()
    else {
      setErro('PIN incorreto.')
      setPin('')
    }
    setTentando(false)
  }

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
                autoFocus
              />
            </label>
            <button className="primario" type="submit" disabled={tentando || pin.length < 4}>
              Entrar
            </button>
          </form>
        )}

        {erro && (
          <p className="erro">
            <IconeAlerta width={16} height={16} />
            {erro}
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
