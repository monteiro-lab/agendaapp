import { jsPDF } from 'jspdf'
import {
  FAIXAS_GRADE,
  NOME_DIA,
  NOME_REGRA,
  formatarCurta,
  horaEmMinutos,
  type DiaSemana,
  type RegraCobranca,
  type StatusOcorrencia,
} from '../db'
import type { Slot } from '../ui/Agenda'

/**
 * Exporta a semana em PDF, no mesmo layout visual da grade original
 * ("Agenda Atualizada.pdf", usada para semear os dados na Tarefa 3):
 * tabela Hora × Seg–Sex, uma cor por dia, cabeçalho arredondado com os
 * pontinhos decorativos. Gerado inteiramente no aparelho, como o backup —
 * nada sai do dispositivo até a usuária mandar salvar.
 */

const LARGURA_PAGINA = 297 // A4 paisagem
const ALTURA_PAGINA = 210
const MARGEM = 10

// Paleta — aproximada visualmente do PDF original, um tom por dia.
const NAVY: [number, number, number] = [27, 38, 84]
const DOURADO: [number, number, number] = [239, 157, 62]
const DOT_TEAL: [number, number, number] = [30, 168, 150]
const DOT_ROSA: [number, number, number] = [214, 72, 140]

const COR_HORA: [number, number, number] = DOURADO
const CORES_DIA: Record<DiaSemana, [number, number, number]> = {
  1: DOT_ROSA, // segunda
  2: DOT_TEAL, // terça
  3: [108, 79, 214], // quarta — roxo
  4: [74, 130, 214], // quinta — azul
  5: [69, 58, 133], // sexta — índigo escuro
}

const HORA_FUNDO: [number, number, number] = [253, 241, 222]
const BANDA_CLARA: [number, number, number] = [255, 255, 255]
const BANDA_ESCURA: [number, number, number] = [238, 240, 251]

const TINTA_NOME: [number, number, number] = [36, 41, 83]
const TINTA_COBRANCA: [number, number, number] = [110, 116, 128]
const TINTA_FRACA: [number, number, number] = [140, 145, 155]
const VAGO_COR: [number, number, number] = DOT_ROSA
const BRANCO: [number, number, number] = [255, 255, 255]
const OK: [number, number, number] = [47, 125, 92]
const AVISO: [number, number, number] = [154, 107, 31]

const LARGURA_HORA = 20
const LARGURA_UTIL = LARGURA_PAGINA - MARGEM * 2
const LARGURA_DIA = (LARGURA_UTIL - LARGURA_HORA) / 5

const NOME_STATUS_CURTO: Partial<Record<StatusOcorrencia, string>> = {
  realizada: 'Realizada',
  cancelada: 'Cancelada',
  remarcada: 'Remarcada',
}

function corDots(doc: jsPDF, x: number, y: number) {
  const raio = 1.8
  const espaco = 5.5
  doc.setFillColor(...DOURADO)
  doc.circle(x, y, raio, 'F')
  doc.setFillColor(...DOT_TEAL)
  doc.circle(x + espaco, y, raio, 'F')
  doc.setFillColor(...DOT_ROSA)
  doc.circle(x + espaco * 2, y, raio, 'F')
}

function desenharCabecalho(doc: jsPDF, subtitulo: string): number {
  const alturaCartao = 20
  const x = MARGEM
  const y = 8
  const largura = LARGURA_PAGINA - MARGEM * 2

  doc.setFillColor(...NAVY)
  doc.roundedRect(x, y, largura, alturaCartao, 4, 4, 'F')
  // A faixa dourada à esquerda do cartão, como no original.
  doc.setFillColor(...DOURADO)
  doc.roundedRect(x + 3, y + 4, 2, alturaCartao - 8, 1, 1, 'F')

  doc.setTextColor(...BRANCO)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text('Agenda de Atendimentos', x + 10, y + alturaCartao / 2 - 1)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(220, 224, 240)
  doc.text(subtitulo, x + 10, y + alturaCartao / 2 + 5.5)

  corDots(doc, x + largura - 14, y + alturaCartao / 2)

  return y + alturaCartao + 6
}

function desenharCabecalhoTabela(doc: jsPDF, y: number): number {
  const altura = 8
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)

  doc.setFillColor(...COR_HORA)
  doc.rect(MARGEM, y, LARGURA_HORA, altura, 'F')
  doc.setTextColor(...BRANCO)
  doc.text('HORA', MARGEM + LARGURA_HORA / 2, y + altura / 2 + 1.2, { align: 'center' })

  let x = MARGEM + LARGURA_HORA
  for (const dia of [1, 2, 3, 4, 5] as DiaSemana[]) {
    doc.setFillColor(...CORES_DIA[dia])
    doc.rect(x, y, LARGURA_DIA, altura, 'F')
    doc.setTextColor(...BRANCO)
    doc.text(NOME_DIA[dia].toUpperCase(), x + LARGURA_DIA / 2, y + altura / 2 + 1.2, {
      align: 'center',
    })
    x += LARGURA_DIA
  }
  return y + altura
}

function desenharRodape(doc: jsPDF, pagina: number, totalPaginas: number) {
  const y = ALTURA_PAGINA - 7
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(...TINTA_FRACA)
  const agora = new Date()
  doc.text(
    `Gerado em ${agora.toLocaleDateString('pt-BR')} às ${agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
    MARGEM,
    y,
  )
  if (totalPaginas > 1) {
    doc.text(`Página ${pagina} de ${totalPaginas}`, LARGURA_PAGINA - MARGEM, y, { align: 'right' })
  }
}

/** Altura que a célula de um dia precisa para caber todos os pacientes daquele horário. */
function alturaDaCelula(slots: Slot[]): number {
  if (slots.length === 0) return 9
  const alturaPorBloco = slots.map((s) => (s.regra !== 'sem_rotulo' || s.pausada ? 8.2 : 5.2))
  return Math.max(9, alturaPorBloco.reduce((a, b) => a + b, 0) + 2)
}

function desenharBlocoPaciente(doc: jsPDF, slot: Slot, x: number, y: number, largura: number): number {
  const vago = !slot.pacienteId
  const status = slot.ocorrencia?.status ?? 'agendada'
  const maxChars = Math.floor(largura / 1.5)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...(vago ? VAGO_COR : TINTA_NOME))
  const nomeExibido = vago ? 'VAGO' : slot.nome
  const truncado =
    nomeExibido.length > maxChars ? nomeExibido.slice(0, maxChars - 1) + '…' : nomeExibido
  doc.text(truncado, x, y)
  if (status === 'cancelada') {
    const largTexto = doc.getTextWidth(truncado)
    doc.setDrawColor(...TINTA_FRACA)
    doc.setLineWidth(0.25)
    doc.line(x, y - 1, x + largTexto, y - 1)
  }

  let proximaLinha = y + 4
  if (slot.pausada && slot.recorrencia?.pausadaAte) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(6.8)
    doc.setTextColor(...TINTA_FRACA)
    doc.text(`Pausado até ${formatarCurta(slot.recorrencia.pausadaAte)}`, x, proximaLinha)
    proximaLinha += 4
  } else if (slot.regra !== 'sem_rotulo') {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(6.8)
    doc.setTextColor(...TINTA_COBRANCA)
    doc.text(NOME_REGRA_CURTA(slot.regra), x, proximaLinha)
    proximaLinha += 4
  }

  const rotuloStatus = NOME_STATUS_CURTO[status]
  if (!vago && !slot.pausada && rotuloStatus) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.3)
    doc.setTextColor(...(status === 'realizada' ? OK : status === 'remarcada' ? AVISO : TINTA_FRACA))
    doc.text(rotuloStatus.toUpperCase(), x, proximaLinha)
    proximaLinha += 3.6
  }

  return proximaLinha
}

const NOME_REGRA_CURTA = (r: RegraCobranca) => NOME_REGRA[r]

export interface ExportarSemanaOpcoes {
  /** Segunda-feira da semana, "YYYY-MM-DD" — vai no nome do arquivo. */
  segunda: string
  /** As 5 datas úteis da semana, na ordem seg→sex. */
  datas: string[]
  /** Slots já resolvidos por data (o mesmo que a tela usa para desenhar a grade). */
  porDia: Map<string, Slot[]>
}

export function exportarAgendaDaSemanaPdf({ segunda, datas, porDia }: ExportarSemanaOpcoes): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' })

  const subtitulo = `${formatarCurta(datas[0])} a ${formatarCurta(datas[4])}`
  let y = desenharCabecalho(doc, subtitulo)
  y = desenharCabecalhoTabela(doc, y)

  // As linhas: as faixas padrão da grade, mais qualquer horário fora do
  // padrão que exista essa semana (ex.: o "10:20" do PDF original).
  const horasExtras = new Set<string>()
  for (const data of datas) {
    for (const slot of porDia.get(data) ?? []) horasExtras.add(slot.hora)
  }
  const horas = [...new Set([...FAIXAS_GRADE, ...horasExtras])].sort(
    (a, b) => horaEmMinutos(a) - horaEmMinutos(b),
  )

  const porDiaEHora = new Map<string, Slot[]>()
  for (const data of datas) {
    for (const slot of porDia.get(data) ?? []) {
      const chave = `${data}|${slot.hora}`
      const lista = porDiaEHora.get(chave) ?? []
      lista.push(slot)
      porDiaEHora.set(chave, lista)
    }
  }

  const LIMITE_INFERIOR = ALTURA_PAGINA - 12
  let indicePagina = 1
  const paginas = [1]
  let zebra = 0

  for (const hora of horas) {
    const celulasPorDia = datas.map((data) => porDiaEHora.get(`${data}|${hora}`) ?? [])
    const temConteudo = celulasPorDia.some((c) => c.length > 0)
    if (!temConteudo) continue // hora fora do padrão sem ninguém marcado nessa semana

    const alturaLinha = Math.max(...celulasPorDia.map(alturaDaCelula))

    if (y + alturaLinha > LIMITE_INFERIOR) {
      doc.addPage()
      indicePagina++
      paginas.push(indicePagina)
      y = desenharCabecalho(doc, subtitulo)
      y = desenharCabecalhoTabela(doc, y)
      zebra = 0
    }

    // Hora, na coluna da esquerda.
    doc.setFillColor(...HORA_FUNDO)
    doc.rect(MARGEM, y, LARGURA_HORA, alturaLinha, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(...NAVY)
    doc.text(hora, MARGEM + LARGURA_HORA / 2, y + alturaLinha / 2 + 1, { align: 'center' })

    let x = MARGEM + LARGURA_HORA
    celulasPorDia.forEach((slots) => {
      doc.setFillColor(...(zebra % 2 === 0 ? BANDA_CLARA : BANDA_ESCURA))
      doc.rect(x, y, LARGURA_DIA, alturaLinha, 'F')

      let yTexto = y + 4.5
      for (const slot of slots) {
        yTexto = desenharBlocoPaciente(doc, slot, x + 2, yTexto, LARGURA_DIA - 4)
      }
      x += LARGURA_DIA
    })

    // Linha divisória sutil sob a linha inteira.
    doc.setDrawColor(...BANDA_ESCURA)
    doc.setLineWidth(0.2)
    doc.line(MARGEM, y + alturaLinha, LARGURA_PAGINA - MARGEM, y + alturaLinha)

    y += alturaLinha
    zebra++
  }

  for (const pagina of paginas) {
    doc.setPage(pagina)
    desenharRodape(doc, pagina, paginas.length)
  }

  doc.save(`agenda-semana-${segunda}.pdf`)
}
