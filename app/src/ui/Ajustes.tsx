import { useEffect, useState } from 'react'
import { limparTudo } from '../db'
import {
  ativarBiometria,
  biometriaDisponivel,
  definirOciosidade,
  definirPin,
  desativarTrava,
  lerConfig,
  marcarDestravado,
  type TipoTrava,
} from '../seguranca/trava'

export default function Ajustes({ aoFechar }: { aoFechar: () => void }) {
  const [tipo, setTipo] = useState<TipoTrava>('nenhuma')
  const [minutos, setMinutos] = useState(5)
  const [pin, setPin] = useState('')
  const [pedindoPin, setPedindoPin] = useState(false)
  const [aviso, setAviso] = useState('')
  const [erro, setErro] = useState('')

  useEffect(() => {
    void lerConfig().then((c) => {
      setTipo(c.tipo)
      setMinutos(c.minutosOciosa)
    })
  }, [])

  async function recarregar(mensagem: string) {
    const c = await lerConfig()
    setTipo(c.tipo)
    setMinutos(c.minutosOciosa)
    setAviso(mensagem)
    setErro('')
    marcarDestravado()
  }

  async function ligarBiometria() {
    try {
      await ativarBiometria()
      await recarregar('Biometria ativada neste aparelho.')
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }

  async function salvarPin(evento: React.FormEvent) {
    evento.preventDefault()
    try {
      await definirPin(pin)
      setPin('')
      setPedindoPin(false)
      await recarregar('PIN definido.')
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }

  async function desligar() {
    if (!confirm('Desligar a trava? A agenda abrirá sem pedir nada.')) return
    await desativarTrava()
    await recarregar('Trava desligada.')
  }

  async function mudarOciosidade(valor: number) {
    setMinutos(valor)
    await definirOciosidade(valor)
  }

  async function apagarTudo() {
    if (!confirm('Apagar TODOS os dados deste aparelho: pacientes, grade e ocorrências?')) return
    if (!confirm('Isto não tem volta e não existe cópia no servidor. Confirmar?')) return
    await limparTudo()
    setAviso('Dados apagados.')
  }

  return (
    <div className="folha-fundo" onClick={aoFechar}>
      <div
        className="folha"
        role="dialog"
        aria-modal="true"
        aria-label="Ajustes"
        onClick={(e) => e.stopPropagation()}
      >
        <h3>Ajustes</h3>

        <section className="ajuste">
          <h4>Trava do app</h4>
          <p className="ajuste-nota">
            {tipo === 'nenhuma'
              ? 'A agenda abre sem pedir nada.'
              : tipo === 'biometria'
                ? 'Pede Face ID / Touch ID ao abrir.'
                : 'Pede um PIN ao abrir.'}
          </p>

          <div className="ajuste-botoes">
            {biometriaDisponivel() && tipo !== 'biometria' && (
              <button onClick={() => void ligarBiometria()}>Usar biometria</button>
            )}
            {tipo !== 'pin' && <button onClick={() => setPedindoPin(true)}>Usar PIN</button>}
            {tipo !== 'nenhuma' && (
              <button className="perigo" onClick={() => void desligar()}>
                Desligar
              </button>
            )}
          </div>

          {pedindoPin && (
            <form className="ajuste-pin" onSubmit={(e) => void salvarPin(e)}>
              <label>
                Novo PIN (4 a 10 dígitos)
                <input
                  type="password"
                  inputMode="numeric"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  autoFocus
                />
              </label>
              <button className="primario" type="submit">
                Salvar PIN
              </button>
            </form>
          )}

          {tipo !== 'nenhuma' && (
            <label>
              Pedir de novo depois de
              <select
                value={minutos}
                onChange={(e) => void mudarOciosidade(Number(e.target.value))}
              >
                <option value={0}>sempre que abrir</option>
                <option value={1}>1 minuto</option>
                <option value={5}>5 minutos</option>
                <option value={15}>15 minutos</option>
                <option value={60}>1 hora</option>
              </select>
            </label>
          )}

          <p className="ajuste-nota">
            A trava impede que alguém abra a agenda no aparelho desbloqueado. Ela não
            criptografa os dados — o lembrete precisa ler o nome do paciente com o app
            fechado, e por isso o banco local fica legível ao sistema.
          </p>
        </section>

        <section className="ajuste">
          <h4>Dados deste aparelho</h4>
          <p className="ajuste-nota">
            Os dados dos pacientes existem só aqui. O servidor guarda apenas horários e
            ids sem significado — não há cópia para restaurar.
          </p>
          <button className="perigo" onClick={() => void apagarTudo()}>
            Apagar todos os dados locais
          </button>
        </section>

        {aviso && <p className="ajuste-aviso">{aviso}</p>}
        {erro && <p className="erro">{erro}</p>}

        <div className="folha-botoes">
          <button onClick={aoFechar}>Fechar</button>
        </div>
      </div>
    </div>
  )
}
