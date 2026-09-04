import { jsPDF } from 'jspdf'
import { NOME_REGRA, formatarLonga, type RegraCobranca, type StatusOcorrencia } from '../db'
import type { Slot } from '../ui/Agenda'

/**
 * Exporta a agenda de um dia em PDF, inteiramente no aparelho — o mesmo
 * princípio do backup: o arquivo só existe onde a usuária mandar salvar.
 * Recebe os slots já resolvidos (nome, hora, regra, status) que a tela da
 * agenda calcula; este módulo só desenha, não consulta o banco.
 */

// Paleta do PDF — espelha as cores semânticas do app (styles.css), porque o
// jsPDF não tem acesso ao CSS. Aqui pode ser um pouco mais rico que a UI:
// é material para imprimir/compartilhar, não a tela do dia a dia.
const PETROLEO: [number, number, number] = [15, 92, 102]
const PETROLEO_CLARO: [number, number, number] = [230, 242, 243]
const DOURADO: [number, number, number] = [214, 165, 58]
const TINTA: [number, number, number] = [28, 31, 34]
const TINTA_MEDIA: [number, number, number] = [86, 93, 99]
const TINTA_FRACA: [number, number, number] = [138, 144, 150]
const BRANCO: [number, number, number] = [255, 255, 255]
const OK: [number, number, number] = [47, 125, 92]
const OK_FUNDO: [number, number, number] = [230, 246, 238]
const RUIM: [number, number, number] = [179, 67, 58]
const RUIM_FUNDO: [number, number, number] = [251, 238, 237]
const AVISO: [number, number, number] = [154, 107, 31]
const AVISO_FUNDO: [number, number, number] = [250, 244, 232]
const ZEBRA: [number, number, number] = [246, 250, 250]

const MARGEM = 14
const LARGURA_PAGINA = 210
const ALTURA_PAGINA = 297
const LARGURA_UTIL = LARGURA_PAGINA - MARGEM * 2

const NOME_STATUS: Record<StatusOcorrencia, string> = {
  agendada: 'Agendada',
  realizada: 'Realizada',
  cancelada: 'Cancelada',
  remarcada: 'Remarcada',
}

function corDoStatus(status: StatusOcorrencia): { texto: [number, number, number]; fundo: [number, number, number] } {
  switch (status) {
    case 'realizada':
      return { texto: OK, fundo: OK_FUNDO }
    case 'cancelada':
      return { texto: TINTA_FRACA, fundo: [244, 245, 246] }
    case 'remarcada':
      return { texto: AVISO, fundo: AVISO_FUNDO }
    default:
      return { texto: PETROLEO, fundo: PETROLEO_CLARO }
  }
}

/** O monograma do app: cartão branco com o check em petróleo, como o favicon. */
function desenharMonograma(doc: jsPDF, x: number, y: number, tamanho: number) {
  doc.setFillColor(...BRANCO)
  doc.roundedRect(x, y, tamanho, tamanho, tamanho * 0.22, tamanho * 0.22, 'F')
  doc.setDrawColor(...PETROLEO)
  doc.setLineWidth(tamanho * 0.1)
  doc.setLineCap('round')
  doc.setLineJoin('round')
  // O "V" do check, em coordenadas absolutas — ponta curta descendo,
  // depois o traço longo subindo, igual ao favicon.svg do app.
  const px = (f: number) => x + tamanho * f
  const py = (f: number) => y + tamanho * f
  doc.line(px(0.26), py(0.52), px(0.42), py(0.68))
  doc.line(px(0.42), py(0.68), px(0.76), py(0.32))
  doc.setLineCap('butt')
  doc.setLineJoin('miter')
}

function desenharCabecalho(doc: jsPDF, tituloDia: string, dataLonga: string): number {
  const altura = 34
  doc.setFillColor(...PETROLEO)
  doc.rect(0, 0, LARGURA_PAGINA, altura, 'F')
  // Flourish: uma linha dourada fina, a assinatura visual do documento.
  doc.setFillColor(...DOURADO)
  doc.rect(0, altura, LARGURA_PAGINA, 1.4, 'F')

  doc.setTextColor(...BRANCO)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text('AGENDA DE ATENDIMENTOS', MARGEM, 12)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.text(tituloDia, MARGEM, 24)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.text(dataLonga, MARGEM, 30.5)

  desenharMonograma(doc, LARGURA_PAGINA - MARGEM - 14, 10, 14)

  return altura + 10
}

function desenharRodape(doc: jsPDF, pagina: number, totalPaginas: number) {
  const y = ALTURA_PAGINA - 12
  doc.setDrawColor(...PETROLEO_CLARO)
  doc.setLineWidth(0.3)
  doc.line(MARGEM, y, LARGURA_PAGINA - MARGEM, y)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...TINTA_FRACA)
  const agora = new Date()
  const carimbo = `Gerado em ${agora.toLocaleDateString('pt-BR')} às ${agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
  doc.text(carimbo, MARGEM, y + 5)
  if (totalPaginas > 1) {
    doc.text(`Página ${pagina} de ${totalPaginas}`, LARGURA_PAGINA - MARGEM, y + 5, { align: 'right' })
  }
}

function desenharChipTexto(
  doc: jsPDF,
  texto: string,
  x: number,
  yCentro: number,
  cores: { texto: [number, number, number]; fundo: [number, number, number] },
  alinhamentoDireita = false,
): void {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  const largura = doc.getTextWidth(texto.toUpperCase()) + 5
  const altura = 5.2
  const xChip = alinhamentoDireita ? x - largura : x
  doc.setFillColor(...cores.fundo)
  doc.roundedRect(xChip, yCentro - altura / 2, largura, altura, 1.4, 1.4, 'F')
  doc.setTextColor(...cores.texto)
  doc.text(texto.toUpperCase(), xChip + largura / 2, yCentro + 1.5, { align: 'center' })
}

export interface ExportarDiaOpcoes {
  /** "YYYY-MM-DD" da agenda exportada — vai no nome do arquivo. */
  data: string
  /** Ex.: "Terça-feira". */
  nomeDia: string
  slots: Slot[]
}

export function exportarAgendaDoDiaPdf({ data, nomeDia, slots }: ExportarDiaOpcoes): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })

  const dataLonga = formatarLonga(data).replace(/^\w/, (c) => c.toUpperCase())
  let y = desenharCabecalho(doc, nomeDia, dataLonga)

  // Resumo do dia — uma linha de estatísticas em chips, logo abaixo do header.
  const total = slots.length
  const vagos = slots.filter((s) => !s.pacienteId).length
  const realizados = slots.filter((s) => s.ocorrencia?.status === 'realizada').length
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor(...TINTA_MEDIA)
  doc.text(
    `${total} ${total === 1 ? 'horário' : 'horários'}  ·  ${vagos} ${vagos === 1 ? 'vago' : 'vagos'}  ·  ${realizados} ${realizados === 1 ? 'realizado' : 'realizados'}`,
    MARGEM,
    y,
  )
  y += 8

  if (slots.length === 0) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(11)
    doc.setTextColor(...TINTA_FRACA)
    doc.text('Nenhum horário agendado neste dia.', MARGEM, y + 6)
    desenharRodape(doc, 1, 1)
    doc.save(`agenda-${data}.pdf`)
    return
  }

  const ALTURA_LINHA = 15.5
  const LIMITE_INFERIOR = ALTURA_PAGINA - 20
  let indicePagina = 1
  const paginasComConteudo: number[] = [1]

  slots.forEach((slot, i) => {
    if (y + ALTURA_LINHA > LIMITE_INFERIOR) {
      doc.addPage()
      indicePagina++
      paginasComConteudo.push(indicePagina)
      y = desenharCabecalho(doc, nomeDia, dataLonga) + 4
    }

    const vago = !slot.pacienteId
    const pausado = slot.pausada
    const status = slot.ocorrencia?.status ?? 'agendada'
    const xLinha = MARGEM
    const wLinha = LARGURA_UTIL

    // Fundo da linha: zebra sutil, exceto VAGO (aviso) e pausado (cinza).
    if (vago) doc.setFillColor(...RUIM_FUNDO)
    else if (pausado) doc.setFillColor(248, 248, 248)
    else if (i % 2 === 1) doc.setFillColor(...ZEBRA)
    else doc.setFillColor(...BRANCO)
    doc.roundedRect(xLinha, y, wLinha, ALTURA_LINHA - 2.5, 2, 2, 'F')

    // Barra de status à esquerda da linha (espelha o app).
    const corBarra = pausado ? TINTA_FRACA : vago ? RUIM : status === 'realizada' ? OK : status === 'remarcada' ? AVISO : PETROLEO
    doc.setFillColor(...corBarra)
    doc.rect(xLinha, y, 1.4, ALTURA_LINHA - 2.5, 'F')

    // Horário, em chip petróleo.
    const xHora = xLinha + 6
    const yMeio = y + (ALTURA_LINHA - 2.5) / 2
    doc.setFillColor(...PETROLEO)
    doc.roundedRect(xHora, yMeio - 4.5, 18, 9, 1.6, 1.6, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(...BRANCO)
    doc.text(slot.hora, xHora + 9, yMeio + 1.2, { align: 'center' })

    // Nome do paciente + regra de cobrança (ou o aviso de pausa).
    const xTexto = xHora + 24
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11.5)
    doc.setTextColor(...(vago ? RUIM : TINTA))
    doc.text(vago ? 'VAGO' : slot.nome, xTexto, yMeio - 0.5)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(...TINTA_FRACA)
    if (pausado && slot.recorrencia?.pausadaAte) {
      doc.text(`Pausado até ${formatarLonga(slot.recorrencia.pausadaAte)}`, xTexto, yMeio + 4)
    } else if (slot.regra !== 'sem_rotulo') {
      doc.text(NOME_REGRA[slot.regra as RegraCobranca], xTexto, yMeio + 4)
    }

    // Status, em chip à direita.
    if (!vago && !pausado) {
      desenharChipTexto(doc, NOME_STATUS[status], xLinha + wLinha - 4, yMeio, corDoStatus(status), true)
    } else if (pausado) {
      desenharChipTexto(doc, 'Pausado', xLinha + wLinha - 4, yMeio, { texto: TINTA_FRACA, fundo: [238, 238, 238] }, true)
    }

    y += ALTURA_LINHA
  })

  for (const pagina of paginasComConteudo) {
    doc.setPage(pagina)
    desenharRodape(doc, pagina, paginasComConteudo.length)
  }

  doc.save(`agenda-${data}.pdf`)
}
