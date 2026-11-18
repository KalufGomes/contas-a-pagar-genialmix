/**
 * ui.js — Construção de telas sem innerHTML (todo texto vira nó de texto,
 * o que impede injeção de código vindo dos dados), formatação e avisos.
 */

export function h(tag, props, ...filhos) {
  const el = document.createElement(tag);
  aplicar(el, props);
  anexar(el, filhos);
  return el;
}

function aplicar(el, props) {
  if (!props) return;
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'dados' && typeof v === 'object') Object.assign(el.dataset, v);
    else if (k === 'value') el.value = v;
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
}

function anexar(el, filhos) {
  for (const f of filhos.flat(Infinity)) {
    if (f === null || f === undefined || f === false) continue;
    el.append(f instanceof Node ? f : document.createTextNode(String(f)));
  }
}

export function limpar(el, ...filhos) { el.replaceChildren(); anexar(el, filhos); return el; }

/** Ícones simples em SVG (traço). */
const CAMINHOS = {
  sino: 'M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0',
  lista: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  mais: 'M12 5v14M5 12h14',
  check: 'M20 6 9 17l-5-5',
  carteira: 'M3 7h18v12H3zM3 7l3-4h12l3 4M16 13h2',
  pessoas: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  engrenagem: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  entrada: 'M12 3v12M7 10l5 5 5-5M5 21h14',
  repetir: 'M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3',
  grafico: 'M3 3v18h18M7 16v-5M12 16V8M17 16v-8',
  tabela: 'M3 3h18v18H3zM3 9h18M3 15h18M9 3v18',
  caixa: 'M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11',
};
export function icone(nome) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', CAMINHOS[nome] || '');
  svg.append(p);
  return svg;
}

// ---------------------------------------------------------------------------
// Formatação
// ---------------------------------------------------------------------------

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const reais = (centavos) => moeda.format((Number(centavos) || 0) / 100);

/** "1.234,56" ou "1234,5" ou "R$ 10" → centavos (inteiro). Inválido → null. */
export function paraCentavos(texto, comSinal) {
  let limpo = String(texto || '').replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
  const negativo = comSinal && /^-/.test(limpo);
  if (negativo) limpo = limpo.slice(1);
  if (!/^\d+(\.\d{1,2})?$/.test(limpo)) return null;
  return (negativo ? -1 : 1) * Math.round(parseFloat(limpo) * 100);
}
export const centavosParaTexto = (c) => (c === null || c === undefined || c === '' ? '' : (Number(c) / 100).toFixed(2).replace('.', ','));

export function data(iso) {
  if (!iso) return '';
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return d + '/' + m + '/' + a;
}
export function dataHora(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
export function hojeIso() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export const ROTULO_STATUS = {
  SOLICITADO: 'Solicitado', PREVISTA: 'Prevista', LANCADO: 'Lançada (falta subir)', AGUARDANDO_APROVACAO: 'Aguardando aprovação',
  DEVOLVIDO: 'Devolvido (tirar do banco)', APROVADO: 'Aprovado / agendado', PAGO: 'Pago', RECUSADO: 'Recusado', CANCELADO: 'Cancelado',
};
export const FORMAS = { BOLETO: 'Boleto', PIX: 'Pix', TED: 'TED', DEBITO_AUTOMATICO: 'Débito automático', CARTAO: 'Cartão', DINHEIRO: 'Dinheiro', OUTRO: 'Outro' };
/** Rótulo de qualquer forma (inclui as que não aparecem para escolher, como o desconto em folha). */
export const rotuloForma = (f) => FORMAS[f] || (f === 'DESCONTO_FOLHA' ? 'Desconto em folha' : f || '');

/** Trilho das cinco etapas; o ponto em ouro é onde a conta está. */
export function trilho(status, grande) {
  const etapas = ['Solicitada', 'Lançada', 'Em aprovação', 'Aprovada', 'Paga'];
  const indice = { SOLICITADO: 0, PREVISTA: 0, LANCADO: 1, DEVOLVIDO: 1, AGUARDANDO_APROVACAO: 2, APROVADO: 3, PAGO: 4 }[status];
  const encerrado = indice === undefined;
  return h('div', { class: 'trilho' + (grande ? ' grande' : '') + (encerrado ? ' encerrado' : ''), 'aria-hidden': 'true' },
    etapas.map((nome, i) => h('div', { class: 'marco' + (!encerrado && i < indice ? ' feito' : '') + (!encerrado && i === indice ? ' atual' : '') },
      h('span', { class: 'ponto' }), grande ? nome : null)));
}

export const statusEl = (s) => h('span', { class: 'status ' + s }, ROTULO_STATUS[s] || s);

// ---------------------------------------------------------------------------
// Avisos e diálogos
// ---------------------------------------------------------------------------

let caixaAvisos;
export function toast(texto, opcoes = {}) {
  if (!caixaAvisos) { caixaAvisos = h('div', { class: 'avisos', role: 'status', 'aria-live': 'polite' }); document.body.append(caixaAvisos); }
  const t = h('div', { class: 'toast' + (opcoes.tipo ? ' ' + opcoes.tipo : '') },
    h('div', null, texto),
    opcoes.acao ? h('div', { class: 'acoes' }, h('button', { class: 'primario', onclick: () => { t.remove(); opcoes.acao.fn(); } }, opcoes.acao.rotulo)) : null);
  caixaAvisos.append(t);
  setTimeout(() => t.remove(), opcoes.duracao || 6000);
}

/** Diálogo modal; `conteudo(fechar)` devolve os elementos. Retorna uma Promise com o valor passado a fechar(). */
export function dialogo(conteudo) {
  return new Promise((resolve) => {
    const d = h('dialog');
    const fechar = (v) => { d.close(); d.remove(); resolve(v); };
    d.append(h('div', { class: 'dialogo' }, conteudo(fechar)));
    d.addEventListener('cancel', (e) => { e.preventDefault(); fechar(undefined); });
    document.body.append(d);
    d.showModal();
  });
}

/** Pede uma justificativa (mínimo 5 caracteres). */
export function pedirMotivo(titulo, rotuloBotao, perigo) {
  return dialogo((fechar) => {
    const campo = h('textarea', { required: true, minlength: 5, maxlength: 500 });
    const erro = h('p', { class: 'mensagem erro', hidden: true });
    return [
      h('h2', null, titulo),
      h('label', { class: 'campo' }, 'Justificativa', h('span', { class: 'dica' }, 'Fica registrada no histórico.'), campo),
      erro,
      h('div', { class: 'acoes fim' },
        h('button', { type: 'button', onclick: () => fechar(null) }, 'Voltar'),
        h('button', { type: 'button', class: 'primario' + (perigo ? ' perigo' : ''), onclick: () => {
          if (campo.value.trim().length < 5) { erro.textContent = 'Escreva ao menos 5 caracteres.'; erro.hidden = false; return; }
          fechar(campo.value.trim());
        } }, rotuloBotao)),
    ];
  });
}

/** Executa uma ação travando o botão enquanto o servidor responde. */
export async function comBotao(botao, fn) {
  const texto = botao.textContent;
  botao.disabled = true;
  botao.textContent = 'Aguarde…';
  try { return await fn(); } finally { botao.disabled = false; botao.textContent = texto; }
}

/** Lê um arquivo como base64. Fotos grandes são reduzidas (até 2000 px, JPEG). */
/**
 * Prepara o anexo: PDF vai como está; foto de qualquer formato que o aparelho abra (HEIC do iPhone, WEBP do
 * WhatsApp, foto sem tipo do Android...) é convertida para JPG e reduzida. Assim o arquivo sempre chega ao financeiro.
 */
export async function lerArquivo(arquivo) {
  const nome = arquivo.name || 'arquivo';
  const ehPdf = arquivo.type === 'application/pdf' || /\.pdf$/i.test(nome);
  let blob = arquivo;
  if (ehPdf) {
    if (arquivo.size > 5 * 1048576) throw new Error('PDF maior que 5 MB. Diminua o arquivo ou envie uma foto.');
    blob = arquivo.type === 'application/pdf' ? arquivo : new Blob([arquivo], { type: 'application/pdf' });
  } else if (!['image/jpeg', 'image/png'].includes(arquivo.type) || arquivo.size > 1500000) {
    try { blob = await reduzirImagem(arquivo); } catch (e) {
      throw new Error('Não consegui abrir esta imagem (' + (arquivo.type || 'formato desconhecido') + '). Tire um print da foto ou envie em PDF, JPG ou PNG.');
    }
  }
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  const nomeFinal = blob.type === 'image/jpeg' && !/\.jpe?g$/i.test(nome) ? nome.replace(/\.[^.]*$/, '') + '.jpg' : nome;
  return { nomeArquivo: nomeFinal.slice(0, 120), mime: blob.type, conteudoBase64: btoa(bin), tamanho: buf.length };
}

async function reduzirImagem(arquivo) {
  let img;
  try { img = await createImageBitmap(arquivo); } catch (e) {
    // Alguns aparelhos só abrem pelo <img> (ex.: HEIC no Safari).
    img = await new Promise((ok, falha) => { const i = new Image(); const u = URL.createObjectURL(arquivo); i.onload = () => { URL.revokeObjectURL(u); ok(i); }; i.onerror = falha; i.src = u; });
  }
  const escala = Math.min(1, 2000 / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * escala);
  c.height = Math.round(img.height * escala);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
}

/** Campo de valor em reais que guarda centavos em el.centavos. */
export function campoValor(props = {}, comSinal) {
  const el = h('input', Object.assign({ class: 'valor', inputmode: 'decimal', placeholder: '0,00', autocomplete: 'off' }, props));
  el.addEventListener('blur', () => {
    const c = paraCentavos(el.value, comSinal);
    if (c !== null) el.value = centavosParaTexto(c);
  });
  if (comSinal) el.inputMode = 'text';
  Object.defineProperty(el, 'centavos', { get: () => paraCentavos(el.value, comSinal), set: (v) => { el.value = centavosParaTexto(v); } });
  return el;
}

export function opcoes(lista, selecionado, vazio) {
  return [vazio !== undefined ? h('option', { value: '' }, vazio) : null]
    .concat(lista.map(([v, r]) => h('option', { value: v, selected: v === selecionado }, r)));
}

// ---------------------------------------------------------------------------
// Relatórios em planilha (CSV aberto pelo Excel) e bibliotecas sob demanda
// ---------------------------------------------------------------------------

/** Célula segura para o Excel: textos que começam com = + - @ não viram fórmula. */
function celulaCsv(v) {
  if (v === null || v === undefined) return '';
  let s = typeof v === 'number' ? String(v).replace('.', ',') : String(v);
  if (typeof v !== 'number' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/** Baixa uma planilha (CSV com ; e acentos, abre direto no Excel). linhas: listas de valores. */
/**
 * Exporta uma tabela. Pergunta o formato: Excel (planilha) ou PDF (para imprimir/enviar).
 * opcoes: { titulo, subtitulo, totais (soma as colunas "(R$)"), formato ('EXCEL'|'PDF' para não perguntar) }
 */
/** Pergunta Excel ou PDF. Devolve 'EXCEL', 'PDF' ou null. */
export function perguntarFormato(quantidade) {
  return dialogo((fechar) => [h('h2', null, 'Exportar' + (quantidade === undefined ? '' : ' ' + (quantidade === 1 ? '1 linha' : quantidade + ' linhas'))),
    h('p', { class: 'secundario pequeno' }, 'Excel para mexer nos números; PDF para imprimir, arquivar ou enviar.'),
    h('div', { class: 'acoes fim' }, h('button', { onclick: () => fechar(null) }, 'Voltar'),
      h('button', { onclick: () => fechar('EXCEL') }, 'Excel'), h('button', { class: 'primario', onclick: () => fechar('PDF') }, 'PDF'))]);
}

/** Lê um CSV com ";" (o que o servidor gera) como lista de listas. */
export function lerCsv(texto) {
  const linhas = []; let linha = []; let campo = ''; let aspas = false;
  const t = String(texto).replace(/^\uFEFF/, '');
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (aspas) { if (ch === '"') { if (t[i + 1] === '"') { campo += '"'; i++; } else aspas = false; } else campo += ch; continue; }
    if (ch === '"') aspas = true;
    else if (ch === ';') { linha.push(campo); campo = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; linha.push(campo); linhas.push(linha); linha = []; campo = ''; }
    else campo += ch;
  }
  if (campo !== '' || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas.filter((l) => l.some((x) => x !== ''));
}

export async function exportarPlanilha(nomeArquivo, cabecalho, linhas, opcoesExp = {}) {
  const formato = opcoesExp.formato || await perguntarFormato(linhas.length);
  if (!formato) return;
  if (formato === 'PDF') {
    try { await exportarPdf(nomeArquivo, cabecalho, linhas, opcoesExp); } catch (e) { toast(e.message, { tipo: 'erro' }); }
    return;
  }
  exportarCsv(nomeArquivo, cabecalho, linhas);
}

const tituloDoArquivo = (nome) => {
  const t = String(nome).replace(/-\d{4}-\d{2}-\d{2}$/, '').replace(/[-_]+/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const formatoReais = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
let logoPdf;
async function logoParaPdf() {
  if (logoPdf !== undefined) return logoPdf;
  try {
    const img = new Image(); img.src = 'genial-mix.png';
    await img.decode();
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    logoPdf = { url: c.toDataURL('image/png'), proporcao: img.naturalWidth / img.naturalHeight };
  } catch (e) { logoPdf = null; }
  return logoPdf;
}

/** Gera o PDF da tabela (paisagem quando há muitas colunas), com cabeçalho, totais e numeração de páginas. */
export async function exportarPdf(nomeArquivo, cabecalho, linhas, opcoesExp = {}) {
  try { await carregarScript('jspdf.umd.min.js'); await carregarScript('jspdf.plugin.autotable.min.js'); } catch (e) { throw new Error('Não foi possível preparar o PDF. Confira a internet e tente de novo.'); }
  const { jsPDF } = window.jspdf;
  const paisagem = opcoesExp.paisagem !== undefined ? opcoesExp.paisagem : cabecalho.length > 6;
  const doc = new jsPDF({ orientation: paisagem ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
  const largura = doc.internal.pageSize.getWidth();
  const altura = doc.internal.pageSize.getHeight();
  const colReais = cabecalho.map((c) => /\(R\$\)/.test(String(c)));
  const corpo = linhas.map((l) => l.map((v, i) => (colReais[i] && typeof v === 'number' ? formatoReais.format(v) : v === null || v === undefined ? '' : String(v))));
  let rodape = null;
  if (opcoesExp.totais && linhas.length) {
    rodape = [cabecalho.map((c, i) => (i === 0 ? 'Total' : colReais[i] ? formatoReais.format(linhas.reduce((s, l) => s + (typeof l[i] === 'number' ? l[i] : 0), 0)) : ''))];
  }
  const titulo = opcoesExp.titulo || tituloDoArquivo(nomeArquivo);
  const logo = await logoParaPdf();
  const quem = (window.__usuarioNome || '');
  const gerado = 'Gerado em ' + new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) + (quem ? ' por ' + quem : '');
  doc.autoTable({
    head: [cabecalho.map(String)], body: corpo, foot: rodape || undefined, showFoot: 'lastPage',
    startY: opcoesExp.subtitulo ? 30 : 26, margin: { top: 26, left: 10, right: 10, bottom: 14 },
    styles: { fontSize: cabecalho.length > 9 ? 6.5 : 8, cellPadding: 1.6, overflow: 'linebreak', lineColor: [227, 230, 236], lineWidth: 0.1 },
    headStyles: { fillColor: [20, 33, 61], textColor: 255, fontStyle: 'bold' },
    footStyles: { fillColor: [244, 239, 225], textColor: [20, 33, 61], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 249, 251] },
    columnStyles: Object.fromEntries(colReais.map((r, i) => [i, r ? { halign: 'right' } : {}])),
    didParseCell: (d) => {
      if (d.section === 'body' && opcoesExp.destaque) {
        const tipo = opcoesExp.destaque(linhas[d.row.index] || []);
        if (tipo === 'forte') { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = [244, 239, 225]; }
        if (tipo === 'suave') { d.cell.styles.fillColor = [238, 241, 246]; d.cell.styles.textColor = [80, 90, 110]; }
      }
      if (colReais[d.column.index] && d.section !== 'head') {
        d.cell.styles.halign = 'right';
        if (String(d.cell.raw).trim().startsWith('-')) d.cell.styles.textColor = [180, 35, 24];
      }
    },
    didDrawPage: () => {
      if (logo) doc.addImage(logo.url, 'PNG', 10, 8, 12 * logo.proporcao > 40 ? 40 : 12 * logo.proporcao, 12 * logo.proporcao > 40 ? 40 / logo.proporcao : 12);
      doc.setFontSize(13); doc.setTextColor(20, 33, 61); doc.text(titulo, logo ? 56 : 10, 14, { maxWidth: largura - (logo ? 66 : 20) });
      doc.setFontSize(8); doc.setTextColor(102, 112, 133);
      if (opcoesExp.subtitulo) doc.text(String(opcoesExp.subtitulo), logo ? 56 : 10, 19.5, { maxWidth: largura - (logo ? 66 : 20) });
      doc.text(gerado, largura / 2, altura - 6, { align: 'center' });
      doc.text('Página ' + doc.internal.getNumberOfPages(), largura - 10, altura - 6, { align: 'right' });
      doc.text('Contas a Pagar · Kaluf & Gomes', 10, altura - 6);
    },
  });
  doc.save(String(nomeArquivo).replace(/[^\w.-]+/g, '-') + '.pdf');
  toast('PDF gerado (' + linhas.length + (linhas.length === 1 ? ' linha).' : ' linhas).'));
}

function exportarCsv(nomeArquivo, cabecalho, linhas) {
  const conteudo = [cabecalho].concat(linhas).map((l) => l.map(celulaCsv).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + conteudo], { type: 'text/csv;charset=utf-8' }));
  const a = h('a', { href: url, download: nomeArquivo.replace(/[^\w.-]+/g, '-') + (nomeArquivo.endsWith('.csv') ? '' : '.csv') });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  toast(linhas.length + (linhas.length === 1 ? ' linha exportada.' : ' linhas exportadas.'));
}
/** Valor em reais para planilha (número com vírgula). */
export const reaisPlanilha = (centavos) => Number(((Number(centavos) || 0) / 100).toFixed(2));

const scriptsCarregados = {};
/** Carrega uma biblioteca do próprio site só quando a tela precisa dela. */
export function carregarScript(arquivo) {
  if (!scriptsCarregados[arquivo]) {
    scriptsCarregados[arquivo] = new Promise((ok, falha) => {
      const s = document.createElement('script');
      s.src = arquivo; s.async = true;
      s.onload = () => ok(); s.onerror = () => { delete scriptsCarregados[arquivo]; falha(new Error('Não foi possível carregar o leitor de arquivos. Confira a internet e tente de novo.')); };
      document.head.append(s);
    });
  }
  return scriptsCarregados[arquivo];
}

/** Lê a 1ª aba de um Excel (.xlsx/.xls) como lista de listas. */
export async function lerPlanilha(arquivo) {
  await carregarScript('xlsx.mini.min.js');
  const wb = window.XLSX.read(new Uint8Array(await arquivo.arrayBuffer()), { type: 'array', cellDates: true });
  return window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' });
}

/** Lê o texto de um PDF: uma lista de linhas (de cima para baixo) por página. */
export async function lerTextoPdf(arquivo) {
  await carregarScript('pdf.min.js');
  const pdfjs = window.pdfjsLib;
  pdfjs.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js';
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await arquivo.arrayBuffer()), isEvalSupported: false, verbosity: 0 }).promise;
  const paginas = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    const linhas = {};
    tc.items.forEach((i) => {
      if (!i.str || !i.str.trim()) return;
      const y = Math.round(i.transform[5] / 2) * 2;
      (linhas[y] = linhas[y] || []).push([i.transform[4], i.str]);
    });
    paginas.push(Object.keys(linhas).map(Number).sort((a, b) => b - a).map((y) => linhas[y].sort((a, b) => a[0] - b[0]).map((x) => x[1]).join(' ')));
  }
  return paginas;
}

/** Caixa de busca que filtra uma lista já carregada (sem ir ao servidor). */
export function buscaLocal(placeholder, aoMudar) {
  const el = h('input', { type: 'search', placeholder: placeholder || 'Buscar' });
  let espera;
  el.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(() => aoMudar(el.value), 250); });
  return el;
}
/** O texto bate com a busca? (sem acento, sem maiúsculas; valor "1.234,56" ou "1234,56" também). */
export function bateBusca(busca, ...campos) {
  const b = String(busca || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  if (!b) return true;
  const alvo = campos.map((c) => (typeof c === 'number' ? (c / 100).toFixed(2).replace('.', ',') + ' ' + reais(c) : String(c || ''))).join(' ')
    .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return b.split(/\s+/).every((p) => alvo.includes(p) || alvo.replace(/\./g, '').includes(p));
}


/**
 * Filtros fixos: guarda o que foi escolhido nos filtros de uma tela (neste aparelho) e devolve ao voltar.
 * campos: objeto { nome: elemento } (input, select, checkbox, campo de valor). Devolve { restaurar(nomes?), limpar(), salvar() }.
 */
export function fixarFiltros(chave, campos) {
  const id = 'filtros:' + (window.__usuarioId || '') + ':' + chave;
  const padrao = {};
  const ler = (el) => (el.type === 'checkbox' ? el.checked : el.value);
  const porValor = (el, v) => { if (el.type === 'checkbox') el.checked = !!v; else el.value = v; };
  Object.entries(campos).forEach(([k, el]) => { if (el) padrao[k] = ler(el); });
  let guardado = {};
  try { guardado = JSON.parse(localStorage.getItem(id) || '{}') || {}; } catch (e) { guardado = {}; }
  const salvar = () => {
    const v = {};
    Object.entries(campos).forEach(([k, el]) => { if (el) v[k] = ler(el); });
    try { localStorage.setItem(id, JSON.stringify(v)); } catch (e) { /* sem armazenamento: segue sem fixar */ }
  };
  const restaurar = (nomes) => {
    (nomes || Object.keys(campos)).forEach((k) => {
      const el = campos[k];
      if (!el || !(k in guardado)) return;
      if (el.tagName === 'SELECT' && guardado[k] !== '' && ![...el.options].some((o) => o.value === guardado[k])) return;
      porValor(el, guardado[k]);
    });
  };
  Object.values(campos).forEach((el) => { if (el) { el.addEventListener('change', salvar); el.addEventListener('input', salvar); } });
  restaurar();
  return {
    restaurar,
    salvar,
    alterado: () => Object.entries(campos).some(([k, el]) => el && ler(el) !== padrao[k]),
    limpar: () => { Object.entries(campos).forEach(([k, el]) => { if (el) porValor(el, padrao[k]); }); guardado = {}; try { localStorage.removeItem(id); } catch (e) { /* idem */ } },
  };
}
