import { useEffect, useRef, useState } from 'react'
import { limparTudo, montarBackup, restaurarBackup } from '../db'
import { testarNotificacao } from '../push/inscricao'
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
import {
  IconeAlerta,
  IconeBaixar,
  IconeCadeado,
  IconeCheck,
  IconeGrafico,
  IconeImpressaoDigital,
  IconeLixeira,
  IconePessoas,
  IconeSino,
  IconeSubir,
} from './icones'
import { useConfirmar } from './confirmar'

export default function Ajustes({
  aoFechar,
  aoAbrirPacientes,
  aoAbrirEstatisticas,
}: {
  aoFechar: () => void
  aoAbrirPacientes: () => void
  aoAbrirEstatisticas: () => void
}) {
  const [tipo, setTipo] = useState<TipoTrava>('nenhuma')
  const [minutos, setMinutos] = useState(5)
  const [pin, setPin] = useState('')
  const [pedindoPin, setPedindoPin] = useState(false)
  const [aviso, setAviso] = useState('')
  const [erro, setErro] = useState('')
  const arquivoRef = useRef<HTMLInputElement>(null)
  const confirmar = useConfirmar()
  const [testando, setTestando] = useState(false)

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
    const ok = await confirmar({
      mensagem: 'Desligar a trava? A agenda abrirá sem pedir nada.',
      textoConfirmar: 'Desligar',
      variante: 'perigo',
    })
    if (!ok) return
    await desativarTrava()
    await recarregar('Trava desligada.')
  }

  async function mudarOciosidade(valor: number) {
    setMinutos(valor)
    await definirOciosidade(valor)
  }

  async function apagarTudo() {
    const ok = await confirmar({
      titulo: 'Apagar todos os dados locais',
      mensagem:
        'Pacientes, grade e ocorrências deste aparelho serão apagados. Isto não tem volta e não existe cópia no servidor — exporte um backup antes, se precisar.',
      textoConfirmar: 'Apagar tudo',
      variante: 'perigo',
    })
    if (!ok) return
    await limparTudo()
    setAviso('Dados apagados.')
  }

  async function testarPush() {
    setTestando(true)
    setErro('')
    try {
      await testarNotificacao()
      setAviso('Enviado! Se não aparecer em alguns segundos, confira as notificações do aparelho.')
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
    setTestando(false)
  }

  async function exportar() {
    setErro('')
    try {
      const backup = await montarBackup()
      const arquivo = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(arquivo)
      const link = document.createElement('a')
      link.href = url
      link.download = `agenda-backup-${backup.exportadoEm.slice(0, 10)}.json`
      link.click()
      URL.revokeObjectURL(url)
      setAviso('Backup baixado.')
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }

  function escolherArquivo() {
    arquivoRef.current?.click()
  }

  async function importar(evento: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = evento.target.files?.[0]
    evento.target.value = '' // permite escolher o mesmo arquivo de novo depois
    if (!arquivo) return

    const ok = await confirmar({
      titulo: 'Importar backup',
      mensagem:
        'Isso substitui TODOS os dados atuais do aparelho (pacientes, grade e ocorrências) pelo conteúdo do arquivo.',
      textoConfirmar: 'Importar e substituir',
      variante: 'perigo',
    })
    if (!ok) return
    setErro('')
    try {
      const texto = await arquivo.text()
      await restaurarBackup(JSON.parse(texto))
      setAviso('Backup restaurado.')
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
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
              <button onClick={() => void ligarBiometria()}>
                <IconeImpressaoDigital width={16} height={16} /> Usar biometria
              </button>
            )}
            {tipo !== 'pin' && (
              <button onClick={() => setPedindoPin(true)}>
                <IconeCadeado width={16} height={16} /> Usar PIN
              </button>
            )}
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
          <h4>Pacientes</h4>
          <p className="ajuste-nota">
            Veja e edite telefone, observações e o histórico de atendimentos de cada
            paciente.
          </p>
          <button onClick={aoAbrirPacientes}>
            <IconePessoas width={16} height={16} /> Ver e editar pacientes
          </button>
        </section>

        <section className="ajuste">
          <h4>Estatísticas</h4>
          <p className="ajuste-nota">
            Total de atendimentos e taxa de comparecimento, por mês ou desde o início.
          </p>
          <button onClick={aoAbrirEstatisticas}>
            <IconeGrafico width={16} height={16} /> Ver estatísticas
          </button>
        </section>

        <section className="ajuste">
          <h4>Notificações</h4>
          <p className="ajuste-nota">
            Manda um push de teste agora, sem esperar um lembrete real — prova que a
            cadeia inteira (servidor → aparelho → notificação) está funcionando.
          </p>
          <button onClick={() => void testarPush()} disabled={testando}>
            <IconeSino width={16} height={16} /> {testando ? 'Enviando…' : 'Testar agora'}
          </button>
        </section>

        <section className="ajuste">
          <h4>Backup</h4>
          <p className="ajuste-nota">
            Os dados dos pacientes existem só neste aparelho — o servidor não guarda
            cópia nenhuma. Trocar de aparelho, atualizar o iOS ou limpar os dados do
            Safari apaga a agenda para sempre, a menos que você tenha um backup.
          </p>
          <div className="ajuste-botoes">
            <button onClick={() => void exportar()}>
              <IconeBaixar width={16} height={16} /> Exportar backup (.json)
            </button>
            <button onClick={escolherArquivo}>
              <IconeSubir width={16} height={16} /> Importar backup
            </button>
            <input
              ref={arquivoRef}
              type="file"
              accept="application/json"
              hidden
              onChange={(e) => void importar(e)}
            />
          </div>
        </section>

        <section className="ajuste">
          <h4>Dados deste aparelho</h4>
          <p className="ajuste-nota">
            Os dados dos pacientes existem só aqui. O servidor guarda apenas horários e
            ids sem significado — não há cópia para restaurar.
          </p>
          <button className="perigo" onClick={() => void apagarTudo()}>
            <IconeLixeira width={16} height={16} /> Apagar todos os dados locais
          </button>
        </section>

        {aviso && (
          <p className="ajuste-aviso">
            <IconeCheck width={16} height={16} />
            {aviso}
          </p>
        )}
        {erro && (
          <p className="erro">
            <IconeAlerta width={16} height={16} />
            {erro}
          </p>
        )}

        <div className="folha-botoes">
          <button onClick={aoFechar}>Fechar</button>
        </div>
      </div>
    </div>
  )
}
