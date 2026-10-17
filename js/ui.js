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
export function paraCentavos(texto) {
  const limpo = String(texto || '').replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(limpo)) return null;
  return Math.round(parseFloat(limpo) * 100);
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
  SOLICITADO: 'Solicitado', PREVISTA: 'Prevista', AGUARDANDO_APROVACAO: 'Aguardando aprovação', DEVOLVIDO: 'Devolvido',
  APROVADO: 'Aprovado / agendado', PAGO: 'Pago', RECUSADO: 'Recusado', CANCELADO: 'Cancelado',
};
export const FORMAS = { BOLETO: 'Boleto', PIX: 'Pix', TED: 'TED', DEBITO_AUTOMATICO: 'Débito automático', CARTAO: 'Cartão', DINHEIRO: 'Dinheiro', OUTRO: 'Outro' };

/** Trilho das quatro etapas; o ponto em ouro é onde a conta está. */
export function trilho(status, grande) {
  const etapas = ['Solicitada', 'Em aprovação', 'Aprovada', 'Paga'];
  const indice = { SOLICITADO: 0, PREVISTA: 0, AGUARDANDO_APROVACAO: 1, DEVOLVIDO: 1, APROVADO: 2, PAGO: 3 }[status];
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
export async function lerArquivo(arquivo) {
  const tipos = ['application/pdf', 'image/jpeg', 'image/png'];
  if (!tipos.includes(arquivo.type)) throw new Error('Envie PDF, JPG ou PNG.');
  let blob = arquivo;
  if (arquivo.type !== 'application/pdf' && arquivo.size > 1500000) blob = await reduzirImagem(arquivo);
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return { nomeArquivo: arquivo.name, mime: blob.type, conteudoBase64: btoa(bin), tamanho: buf.length };
}

async function reduzirImagem(arquivo) {
  const img = await createImageBitmap(arquivo);
  const escala = Math.min(1, 2000 / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * escala);
  c.height = Math.round(img.height * escala);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
}

/** Campo de valor em reais que guarda centavos em el.centavos. */
export function campoValor(props = {}) {
  const el = h('input', Object.assign({ class: 'valor', inputmode: 'decimal', placeholder: '0,00', autocomplete: 'off' }, props));
  el.addEventListener('blur', () => {
    const c = paraCentavos(el.value);
    if (c !== null) el.value = centavosParaTexto(c);
  });
  Object.defineProperty(el, 'centavos', { get: () => paraCentavos(el.value), set: (v) => { el.value = centavosParaTexto(v); } });
  return el;
}

export function opcoes(lista, selecionado, vazio) {
  return [vazio !== undefined ? h('option', { value: '' }, vazio) : null]
    .concat(lista.map(([v, r]) => h('option', { value: v, selected: v === selecionado }, r)));
}
