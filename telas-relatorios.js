/**
 * telas-relatorios.js — Painel, DRE gerencial e exportação para Excel (CSV).
 * Só financeiro, aprovação e gestão acessam; o servidor confere a cada chamada.
 */
import { api } from './api.js';
import { app } from './app.js';
import { h, limpar, reais, data, hojeIso, toast, comBotao, opcoes, dialogo, campoValor, exportarPlanilha, reaisPlanilha, fixarFiltros, perguntarFormato, lerCsv, exportarPdf } from './ui.js';
import { linhaConta } from './telas-contas.js';

const COR_ENTRADAS = '#B8893F';
const COR_SAIDAS = '#2F6FA8';
const compacto = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const nomeMes = (m) => MESES[Number(m.slice(5, 7)) - 1] + '/' + m.slice(2, 4);

/** Baixa um texto CSV com BOM, para o Excel abrir com acentos corretos. */
export function baixarCsv(nomeArquivo, conteudo) {
  const url = URL.createObjectURL(new Blob(['﻿' + conteudo], { type: 'text/csv;charset=utf-8' }));
  const a = h('a', { href: url, download: nomeArquivo });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function seletorEmpresa(valor) {
  return h('select', null, opcoes(app.cad.empresas.map((e) => [e.id, e.nome]), valor || '', 'Todas (consolidado)'));
}

// ---------------------------------------------------------------------------
// Painel
// ---------------------------------------------------------------------------

export async function telaPainel({ subtitulo }) {
  const gestor = app.tem('GESTOR');
  const empresa = seletorEmpresa('');
  const mes = h('select', null, opcoes([['', 'Mês atual']].concat(Array.from({ length: 24 }, (_, i) => { const m = mesesAtras(i); return [m, nomeMesLongo(m)]; }), [['periodo', 'Escolher período…']]), ''));
  const de = h('input', { type: 'date', max: hojeIso() });
  const ate = h('input', { type: 'date', max: hojeIso() });
  const blocoPeriodo = h('span', { class: 'acoes', hidden: true }, h('label', { class: 'campo' }, 'De', de), h('label', { class: 'campo' }, 'Até', ate));
  const corpo = h('div', { class: 'painel-relatorio' });
  const areaFluxo = h('div');
  const periodo = () => {
    if (mes.value === 'periodo') return { de: de.value || undefined, ate: ate.value || undefined };
    if (!mes.value) return {};
    const [a, m] = mes.value.split('-').map(Number);
    const fim = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
    return { de: mes.value + '-01', ate: fim > hojeIso() ? hojeIso() : fim };
  };
  const carregar = async () => {
    corpo.classList.add('recarregando');
    try {
      const p = await api('relatorios.painel', Object.assign({ empresaId: empresa.value || undefined }, periodo()));
      const atual = !mes.value;
      subtitulo('Situação em ' + data(p.hoje) + '. Pagamentos e entradas de ' + data(p.periodo.de) + ' a ' + data(p.periodo.ate) + (atual ? ' (mês atual)' : '') + '.');
      limpar(corpo, conteudoPainel(p, atual));
    } catch (e) { toast(e.message, { tipo: 'erro' }); } finally { corpo.classList.remove('recarregando'); }
  };
  const fixoPainel = fixarFiltros('painel', { empresa, mes, de, ate });
  blocoPeriodo.hidden = mes.value !== 'periodo';
  mes.addEventListener('change', () => { blocoPeriodo.hidden = mes.value !== 'periodo'; if (mes.value !== 'periodo') carregar(); });
  empresa.addEventListener('change', () => { carregar(); if (gestor) areaFluxo.recarregar(); });
  const filtrar = h('button', { class: 'primario', style: { alignSelf: 'end' }, onclick: () => { carregar(); if (gestor) areaFluxo.recarregar(); } }, 'Filtrar');
  const limparPainel = h('button', { class: 'discreto', style: { alignSelf: 'end' }, onclick: () => { fixoPainel.limpar(); blocoPeriodo.hidden = true; carregar(); if (gestor) areaFluxo.recarregar(); } }, 'Limpar filtros');
  await carregar();
  if (gestor) await montarFluxo(areaFluxo, empresa);
  return [h('div', { class: 'filtros' },
    h('label', { class: 'campo', style: { maxWidth: '320px' } }, 'Empresa', empresa),
    h('label', { class: 'campo' }, 'Período', mes), blocoPeriodo, filtrar, limparPainel), corpo, areaFluxo];
}

function nomeMesLongo(m) {
  const n = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  return n[Number(m.slice(5, 7)) - 1] + ' de ' + m.slice(0, 4);
}

const NOME_TIPO_CONTA = { BANCO: 'Banco', CAIXA: 'Caixa', PESSOA_FISICA: 'Pessoa física', APLICACAO: 'Aplicação' };
function blocoSaldos(p) {
  if (!p.saldos || !p.saldos.length) return null;
  const porEmpresa = {};
  p.saldos.forEach((c) => { (porEmpresa[c.empresaId] = porEmpresa[c.empresaId] || []).push(c); });
  const futuro = (id) => (p.saldosFuturos || []).find((f) => f.empresaId === id);
  return h('section', { class: 'bloco rolagem' }, h('h2', null, 'Saldos das contas hoje'),
    h('table', { class: 'tabela', style: { marginTop: '8px' } },
      h('thead', null, h('tr', null, ['Empresa', 'Conta', 'Tipo', 'Saldo', 'Atualizado até'].map((t, i) => h('th', { class: i === 3 ? 'direita' : '' }, t)))),
      h('tbody', null, Object.keys(porEmpresa).map((id) => {
        const contas = porEmpresa[id];
        const total = contas.reduce((s2, c) => s2 + c.saldoCentavos, 0);
        const f = futuro(id);
        return [contas.map((c, i) => h('tr', null, h('td', null, i ? '' : app.nomeEmpresa(id)), h('td', null, c.apelido), h('td', { class: 'secundario' }, NOME_TIPO_CONTA[c.tipo] || c.tipo),
          h('td', { class: 'direita num' + (c.saldoCentavos < 0 ? ' negativo' : '') }, reais(c.saldoCentavos)),
          h('td', { class: 'secundario pequeno' }, !c.temSaldoInicial ? 'sem saldo inicial' : c.ate ? data(c.ate) : '—'))),
        h('tr', { class: 'total' }, h('td', null, ''), h('td', null, h('b', null, 'Total')), h('td', null, ''), h('td', { class: 'direita num' }, h('b', null, reais(total))),
          h('td', { class: 'pequeno' }, f ? ['Saldo futuro: ', h('b', null, reais(f.valorCentavos)), f.data ? ' em ' + data(f.data) : '', f.descricao ? ' · ' + f.descricao : ''] : ''))];
      }))));
}

// ---------------------------------------------------------------------------
// Fluxo de caixa (igual à aba FLUXO_CAIXA da planilha do cliente)
// ---------------------------------------------------------------------------

async function montarFluxo(area, empresa) {
  const anoAtual = Number(hojeIso().slice(0, 4));
  const ano = h('select', null, opcoes(Array.from({ length: anoAtual - 2020 }, (_, i) => [String(anoAtual - i), String(anoAtual - i)]), String(anoAtual)));
  const comPct = h('input', { type: 'checkbox', checked: true });
  const tabela = h('div', { class: 'rolagem' });
  let ultimo = null;
  const carregar = async () => {
    tabela.classList.add('recarregando');
    try {
      ultimo = await api('relatorios.fluxoCaixa', { ano: Number(ano.value), empresaId: empresa.value || undefined });
      limpar(tabela, tabelaFluxo(ultimo, comPct.checked));
    } catch (e) { limpar(tabela, h('p', { class: 'mensagem erro' }, e.message)); } finally { tabela.classList.remove('recarregando'); }
  };
  area.recarregar = carregar;
  ano.addEventListener('change', carregar);
  comPct.addEventListener('change', () => ultimo && limpar(tabela, tabelaFluxo(ultimo, comPct.checked)));
  const exportar = h('button', { onclick: () => ultimo && exportarFluxo(ultimo) }, 'Exportar (Excel ou PDF)');
  const faturamento = h('button', { onclick: () => informarFaturamento(empresa.value, carregar) }, 'Informar faturamento');
  limpar(area, h('section', { class: 'bloco' },
    h('div', { class: 'fechamento' }, h('h2', null, 'Fluxo de caixa'),
      h('div', { class: 'acoes' }, h('label', { class: 'campo' }, 'Ano', ano), h('label', { class: 'check', style: { alignSelf: 'center' } }, comPct, 'Mostrar %'), faturamento, exportar)),
    h('p', { class: 'secundario pequeno' }, 'Regime de caixa, mês a mês. Faturamento é o informado pelos gestores (por plataforma); o restante vem dos pagamentos e recebimentos do sistema. Meses anteriores ao sistema vêm da planilha histórica.'),
    tabela));
  await carregar();
}

function tabelaFluxo(f, comPct) {
  const fmt = (v) => (v ? reais(v) : '–');
  const pct = (v) => (v === null || v === undefined ? '' : (v * 100).toFixed(1).replace('.', ',') + '%');
  const hist = new Set(f.mesesComHistorico || []);
  const linhas = f.linhas.filter((l) => comPct || l.tipo !== 'pct');
  return h('table', { class: 'tabela tabela-fluxo' },
    h('thead', null, h('tr', null, h('th', null, f.empresa + ' · ' + f.ano),
      f.meses.map((m) => h('th', { colspan: comPct ? 2 : 1, title: hist.has(m) ? 'Mês da planilha histórica' : '' }, nomeMes(m) + (hist.has(m) ? ' *' : ''))),
      h('th', { colspan: comPct ? 2 : 1 }, 'Total'))),
    h('tbody', null, linhas.map((l) => {
      if (l.tipo === 'pct') return h('tr', { class: 'linha-pct' }, h('td', null, l.rotulo + (l.chave === 'YOY' ? '' : '')),
        l.valores.map((v) => h('td', { colspan: comPct ? 2 : 1 }, pct(v))), h('td', { colspan: comPct ? 2 : 1 }, ''));
      const tot = l.total !== undefined ? l.total : l.valores.reduce((a, b) => a + b, 0);
      return h('tr', { class: l.tipo === 'total' ? 'total' : '' }, h('td', null, l.rotulo),
        l.valores.map((v, i) => [h('td', { class: v < 0 ? 'negativo' : '' }, fmt(v)), comPct ? h('td', { class: 'pct' }, l.pct ? pct(l.pct[i]) : '') : null]),
        h('td', { class: tot < 0 ? 'negativo' : '' }, fmt(tot)), comPct ? h('td', { class: 'pct' }, '') : null);
    }),
    f.faturamentoPorPlataforma && f.faturamentoPorPlataforma.length ? [
      h('tr', { class: 'linha-pct' }, h('td', { colspan: 1 + (f.meses.length + 1) * (comPct ? 2 : 1) }, 'Faturamento por plataforma')),
      f.faturamentoPorPlataforma.map((p) => h('tr', null, h('td', null, '  ' + p.plataforma),
        p.valores.map((v) => [h('td', null, fmt(v)), comPct ? h('td', { class: 'pct' }, '') : null]), h('td', null, fmt(p.total)), comPct ? h('td', null, '') : null))] : null),
    hist.size ? h('caption', { class: 'secundario pequeno', style: { captionSide: 'bottom', textAlign: 'left', paddingTop: '6px' } }, '* mês trazido da planilha histórica.') : null);
}

function exportarFluxo(f) {
  const cab = ['Linha'].concat(f.meses.map(nomeMes), ['Total']);
  const linhas = f.linhas.map((l) => l.tipo === 'pct'
    ? [l.rotulo].concat(l.valores.map((v) => (v === null ? '' : Number((v * 100).toFixed(1)))), [''])
    : [l.rotulo].concat(l.valores.map(reaisPlanilha), [reaisPlanilha(l.total !== undefined ? l.total : l.valores.reduce((a, b) => a + b, 0))]));
  (f.faturamentoPorPlataforma || []).forEach((p) => linhas.push(['Faturamento · ' + p.plataforma].concat(p.valores.map(reaisPlanilha), [reaisPlanilha(p.total)])));
  exportarPlanilha('fluxo-caixa-' + f.ano + '-' + f.empresa, cab, linhas, { titulo: 'Fluxo de caixa ' + f.ano + ' · ' + f.empresa, paisagem: true });
}

async function informarFaturamento(empresaPadrao, depois) {
  await dialogo((fechar) => {
    const empresas = app.cad.empresas.filter((e) => e.ativo);
    const emp = h('select', null, opcoes(empresas.map((e) => [e.id, e.nome]), empresaPadrao || (empresas[0] && empresas[0].id)));
    const mes = h('input', { type: 'month', value: mesesAtras(1), max: mesAtual() });
    const campos = h('div', { class: 'grade-campos' });
    const novaPlat = h('input', { maxlength: 40, placeholder: 'Outra plataforma' });
    let entradas = {};
    const erro = h('p', { class: 'mensagem erro', hidden: true });
    const adicionar = (nome, valor) => {
      if (entradas[nome]) return;
      const c = campoValor(); if (valor) c.centavos = valor;
      entradas[nome] = c; campos.append(h('label', { class: 'campo' }, nome, c));
    };
    const carregar = async () => {
      limpar(campos); entradas = {}; erro.hidden = true;
      try {
        const r = await api('faturamento.listar', { empresaId: emp.value, mes: mes.value });
        r.plataformas.forEach((p) => adicionar(p, r.valores[p]));
        Object.keys(r.valores).forEach((p) => adicionar(p, r.valores[p]));
      } catch (e) { erro.textContent = e.message; erro.hidden = false; }
    };
    emp.addEventListener('change', carregar); mes.addEventListener('change', carregar); carregar();
    const salvar = h('button', { class: 'primario' }, 'Salvar faturamento');
    salvar.onclick = () => comBotao(salvar, async () => {
      const valores = {};
      for (const [nome, c] of Object.entries(entradas)) {
        if (c.value.trim() === '') { valores[nome] = 0; continue; }
        if (c.centavos === null) { erro.textContent = 'Valor inválido em ' + nome + '.'; erro.hidden = false; return; }
        valores[nome] = c.centavos;
      }
      try { await api('faturamento.salvar', { empresaId: emp.value, mes: mes.value, valores }); toast('Faturamento salvo.'); fechar(true); depois(); } catch (e) { erro.textContent = e.message; erro.hidden = false; }
    });
    return [h('h2', null, 'Faturamento do mês'),
      h('p', { class: 'secundario pequeno' }, 'Valor vendido em cada plataforma no mês (bruto). Entra na linha FATURAMENTO do fluxo de caixa e é a base dos percentuais.'),
      h('div', { class: 'grade-campos' }, h('label', { class: 'campo' }, 'Empresa', emp), h('label', { class: 'campo' }, 'Mês', mes)),
      campos,
      h('div', { class: 'acoes' }, novaPlat, h('button', { onclick: () => { const n = novaPlat.value.trim(); if (n) { adicionar(n, 0); novaPlat.value = ''; } } }, '+ Plataforma')),
      erro, h('div', { class: 'acoes fim' }, h('button', { onclick: () => fechar(false) }, 'Voltar'), salvar)];
  });
}

function conteudoPainel(p, atual) {
  const tile = (rotulo, valor, detalhe, classe) => h('div', { class: 'tile' + (classe ? ' ' + classe : '') },
    h('div', { class: 'tile-rotulo' }, rotulo), h('div', { class: 'tile-valor num' }, valor), detalhe ? h('div', { class: 'tile-detalhe' }, detalhe) : null);
  const qtd = (n) => n + (n === 1 ? ' conta' : ' contas');
  return [
    h('section', { class: 'destaque-saldo' },
      h('div', null,
        h('div', { class: 'tile-rotulo' }, atual ? 'Saldo do mês (entradas − pagamentos)' : 'Resultado do período (entradas − pagamentos)'),
        h('div', { class: 'saldo num' + (p.saldoDoMesCentavos < 0 ? ' negativo' : '') }, reais(p.saldoDoMesCentavos))),
      h('div', { class: 'saldo-partes' },
        h('div', null, h('span', { class: 'chave', style: { background: COR_ENTRADAS } }), 'Entradas ', h('b', { class: 'num' }, reais(p.entradasNoMesCentavos))),
        h('div', null, h('span', { class: 'chave', style: { background: COR_SAIDAS } }), 'Pagamentos ', h('b', { class: 'num' }, reais(p.pagoNoMes.valorCentavos))))),
    h('div', { class: 'tiles' },
      tile('Em aberto, antes da aprovação', reais(p.emAberto.valorCentavos), qtd(p.emAberto.quantidade) + ' (solicitadas, previstas, em aprovação ou devolvidas)'),
      tile('Aprovado e agendado no banco', reais(p.aprovado.valorCentavos), qtd(p.aprovado.quantidade) + ' aguardando compensação'),
      tile(atual ? 'Pago no mês' : 'Pago no período', reais(p.pagoNoMes.valorCentavos), qtd(p.pagoNoMes.quantidade) + ' com compensação conferida'),
      tile('Vencidas sem pagamento', reais(p.vencidas.valorCentavos), qtd(p.vencidas.quantidade), p.vencidas.quantidade ? 'alerta' : '')),
    blocoSaldos(p),
    graficoEntradasSaidas(p.serie),
    p.listaVencidas.length ? h('section', null, h('h2', { class: 'titulo-secao' }, 'Vencidas'), h('div', { class: 'lista' }, p.listaVencidas.map((c) => linhaConta(c)))) : null,
    h('section', null, h('h2', { class: 'titulo-secao' }, 'Vencem nos próximos 7 dias'),
      p.listaProximas.length ? h('div', { class: 'lista' }, p.listaProximas.map((c) => linhaConta(c))) : h('div', { class: 'bloco vazio' }, 'Nenhuma conta vencendo nos próximos 7 dias.')),
    p.porEmpresa.length ? h('section', { class: 'bloco rolagem' }, h('h2', null, 'Por empresa'), h('table', { class: 'tabela', style: { marginTop: '8px' } },
      h('thead', null, h('tr', null, ['Empresa', 'Em aberto', 'Aprovado', atual ? 'Pago no mês' : 'Pago no período', atual ? 'Entradas no mês' : 'Entradas no período', 'Vencidas'].map((t, i) => h('th', { class: i ? 'direita' : '' }, t)))),
      h('tbody', null, p.porEmpresa.map((e) => h('tr', null, h('td', null, e.nome),
        h('td', { class: 'direita num' }, reais(e.emAbertoCentavos)), h('td', { class: 'direita num' }, reais(e.aprovadoCentavos)),
        h('td', { class: 'direita num' }, reais(e.pagoMesCentavos)), h('td', { class: 'direita num' }, reais(e.entradasMesCentavos)),
        h('td', { class: 'direita num' }, e.vencidas)))))) : null,
  ];
}

// ---------------------------------------------------------------------------
// Gráfico: entradas x pagamentos por mês (colunas agrupadas)
// ---------------------------------------------------------------------------

const NS = 'http://www.w3.org/2000/svg';
function s(tag, attrs, ...filhos) {
  const el = document.createElementNS(NS, tag);
  Object.entries(attrs || {}).forEach(([k, v]) => { if (v !== undefined && v !== null) el.setAttribute(k, String(v)); });
  filhos.flat().forEach((f) => { if (f !== null && f !== undefined) el.append(f instanceof Node ? f : document.createTextNode(String(f))); });
  return el;
}

/** Topo "redondo" para o eixo: 1, 2, 2,5 ou 5 × potência de 10. */
function topoEixo(max) {
  if (max <= 0) return 100000;
  const p = Math.pow(10, Math.floor(Math.log10(max)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= max) return m * p;
  return 10 * p;
}

function graficoEntradasSaidas(serie) {
  const W = 720; const H = 260; const esq = 64; const dir = 12; const topo = 16; const base = 36;
  const max = topoEixo(Math.max(...serie.map((x) => Math.max(x.entradasCentavos, x.saidasCentavos))));
  const altura = H - topo - base;
  const y = (v) => topo + altura - (Math.max(0, v) / max) * altura;
  const banda = (W - esq - dir) / serie.length;
  const larg = Math.min(24, banda / 3);
  const dica = h('div', { class: 'dica-grafico', hidden: true, role: 'status' });
  const svg = s('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'grafico', role: 'group', 'aria-label': 'Entradas e pagamentos por mês nos últimos 6 meses' });

  const grade = s('g', { class: 'grade' });
  [0, 0.25, 0.5, 0.75, 1].forEach((f) => {
    const v = max * f;
    grade.append(s('line', { x1: esq, x2: W - dir, y1: y(v), y2: y(v) }),
      s('text', { x: esq - 8, y: y(v) + 4, 'text-anchor': 'end' }, 'R$ ' + compacto.format(v / 100)));
  });
  svg.append(grade);

  const mostrar = (m, el) => {
    limpar(dica, h('div', { class: 'dica-mes' }, nomeMes(m.mes)),
      h('div', null, h('span', { class: 'traco', style: { background: COR_ENTRADAS } }), h('b', { class: 'num' }, reais(m.entradasCentavos)), ' entradas'),
      h('div', null, h('span', { class: 'traco', style: { background: COR_SAIDAS } }), h('b', { class: 'num' }, reais(m.saidasCentavos)), ' pagamentos'));
    dica.hidden = false;
    const caixa = svg.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    dica.style.left = Math.min(caixa.width - 190, Math.max(0, r.left - caixa.left + r.width / 2 - 95)) + 'px';
  };
  const esconder = () => { dica.hidden = true; };

  serie.forEach((m, i) => {
    const cx = esq + banda * i + banda / 2;
    const coluna = (v, x, cor) => {
      const hgt = Math.max(0, topo + altura - y(v));
      if (hgt < 0.5) return null;
      const r = Math.min(4, hgt);
      const yy = y(v);
      return s('path', { d: `M${x} ${topo + altura}V${yy + r}Q${x} ${yy} ${x + r} ${yy}H${x + larg - r}Q${x + larg} ${yy} ${x + larg} ${yy + r}V${topo + altura}Z`, fill: cor });
    };
    const grupo = s('g', { class: 'grupo-mes', tabindex: '0',
      'aria-label': nomeMes(m.mes) + ': entradas ' + reais(m.entradasCentavos) + ', pagamentos ' + reais(m.saidasCentavos) },
    s('rect', { x: cx - banda / 2, y: topo, width: banda, height: altura, fill: 'transparent', class: 'alvo' }),
    coluna(m.entradasCentavos, cx - larg - 1, COR_ENTRADAS),
    coluna(m.saidasCentavos, cx + 1, COR_SAIDAS),
    s('text', { x: cx, y: H - 12, 'text-anchor': 'middle', class: 'rotulo-mes' }, nomeMes(m.mes)));
    ['pointerenter', 'focus'].forEach((ev) => grupo.addEventListener(ev, () => { grupo.classList.add('ativo'); mostrar(m, grupo); }));
    ['pointerleave', 'blur'].forEach((ev) => grupo.addEventListener(ev, () => { grupo.classList.remove('ativo'); esconder(); }));
    svg.append(grupo);
  });
  svg.append(s('line', { x1: esq, x2: W - dir, y1: topo + altura, y2: topo + altura, class: 'eixo' }));

  const tabela = h('table', { class: 'tabela', hidden: true },
    h('thead', null, h('tr', null, h('th', null, 'Mês'), h('th', { class: 'direita' }, 'Entradas'), h('th', { class: 'direita' }, 'Pagamentos'), h('th', { class: 'direita' }, 'Saldo'))),
    h('tbody', null, serie.map((m) => h('tr', null, h('td', null, nomeMes(m.mes)), h('td', { class: 'direita num' }, reais(m.entradasCentavos)),
      h('td', { class: 'direita num' }, reais(m.saidasCentavos)), h('td', { class: 'direita num' }, reais(m.entradasCentavos - m.saidasCentavos))))));
  const alternar = h('button', { class: 'discreto', onclick: () => {
    tabela.hidden = !tabela.hidden; area.hidden = !tabela.hidden;
    alternar.textContent = tabela.hidden ? 'Ver como tabela' : 'Ver como gráfico';
  } }, 'Ver como tabela');
  const area = h('div', { class: 'area-grafico' }, svg, dica);
  return h('section', { class: 'bloco' },
    h('div', { class: 'acoes', style: { justifyContent: 'space-between' } },
      h('h2', null, 'Entradas e pagamentos por mês'),
      h('div', { class: 'acoes' },
        h('span', { class: 'legenda' }, h('span', { class: 'chave', style: { background: COR_ENTRADAS } }), 'Entradas (receitas)'),
        h('span', { class: 'legenda' }, h('span', { class: 'chave', style: { background: COR_SAIDAS } }), 'Pagamentos (contas pagas)'),
        alternar)),
    area, tabela);
}

// ---------------------------------------------------------------------------
// DRE gerencial
// ---------------------------------------------------------------------------

function mesAtual() { return hojeIso().slice(0, 7); }
function mesesAtras(n) {
  const [a, m] = mesAtual().split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1 - n, 1));
  return d.toISOString().slice(0, 7);
}

export async function telaDre({ subtitulo }) {
  subtitulo('Regime de caixa: receitas pela data do extrato e despesas pela data do pagamento. Pode diferir da DRE do contador, que costuma ser por competência.');
  const f = {
    empresa: seletorEmpresa(''),
    de: h('input', { type: 'month', value: mesesAtras(2), max: mesAtual() }),
    ate: h('input', { type: 'month', value: mesAtual(), max: mesAtual() }),
    detalhe: h('input', { type: 'checkbox', checked: true }),
  };
  const fixoDre = fixarFiltros('dre', f);
  const area = h('div');
  let ultimo = null;
  const carregar = async () => {
    area.classList.add('recarregando');
    try {
      ultimo = await api('relatorios.dre', { empresaId: f.empresa.value || undefined, de: f.de.value, ate: f.ate.value });
      limpar(area, tabelaDre(ultimo, f.detalhe.checked));
    } catch (e) { limpar(area, h('p', { class: 'mensagem erro' }, e.message)); } finally { area.classList.remove('recarregando'); }
  };
  [f.empresa, f.de, f.ate].forEach((el) => el.addEventListener('change', carregar));
  f.detalhe.addEventListener('change', () => { if (ultimo) limpar(area, tabelaDre(ultimo, f.detalhe.checked)); });
  const exportar = h('button', { onclick: () => comBotao(exportar, async () => {
    try {
      const r = await api('relatorios.exportarDre', { empresaId: f.empresa.value || undefined, de: f.de.value, ate: f.ate.value });
      const formato = await perguntarFormato();
      if (!formato) return;
      if (formato === 'PDF') {
        const t = lerCsv(r.conteudo);
        const paraNumero = (x) => { const n = Number(String(x).replace(/\./g, '').replace(',', '.')); return x !== '' && !isNaN(n) ? n : x; };
        const iCab = Math.max(0, t.findIndex((l) => l[0] === 'Linha'));
        const cab = t[iCab];
        await exportarPdf('dre-' + f.de.value + '-a-' + f.ate.value, cab.map((c, i) => (i ? c + ' (R$)' : c)),
          t.slice(iCab + 1).map((l) => cab.map((_, i) => (i ? paraNumero(l[i] === undefined ? '' : l[i]) : l[0]))),
          { titulo: 'DRE gerencial (regime de caixa)', subtitulo: (f.empresa.value ? app.nomeEmpresa(f.empresa.value) : 'Todas as empresas') + ' · ' + f.de.value + ' a ' + f.ate.value });
      } else baixarCsv(r.nomeArquivo, r.conteudo);
      toast('DRE exportada. A exportação fica registrada no histórico.');
    } catch (e) { toast(e.message, { tipo: 'erro' }); }
  }) }, 'Exportar (Excel ou PDF)');
  await carregar();
  return [
    h('div', { class: 'bloco filtros' },
      h('label', { class: 'campo' }, 'Empresa', f.empresa),
      h('label', { class: 'campo' }, 'De', f.de),
      h('label', { class: 'campo' }, 'Até', f.ate),
      h('label', { class: 'check', style: { alignSelf: 'center' } }, f.detalhe, 'Mostrar categorias'),
      h('div', { class: 'acoes', style: { alignSelf: 'end' } }, h('button', { class: 'primario', onclick: () => carregar() }, 'Filtrar'),
        h('button', { class: 'discreto', onclick: () => { fixoDre.limpar(); carregar(); } }, 'Limpar filtros'), exportar)),
    area,
  ];
}

function tabelaDre(d, detalhe) {
  const multi = d.meses.length > 1;
  const valor = (v) => h('td', { class: 'direita num' + (v < 0 ? ' negativo' : '') }, v === 0 ? '–' : reais(v));
  const linhas = d.linhas.filter((l) => detalhe || l.tipo !== 'categoria');
  return [
    h('div', { class: 'bloco rolagem' },
      h('h2', null, d.empresa),
      h('table', { class: 'tabela dre' },
        h('thead', null, h('tr', null, h('th', null, ''), d.meses.map((m) => h('th', { class: 'direita' }, nomeMes(m))), multi ? h('th', { class: 'direita' }, 'Total') : null)),
        h('tbody', null, linhas.map((l) => h('tr', { class: 'dre-' + l.tipo + (l.destaque ? ' dre-destaque' : '') },
          h('td', null, l.rotulo), l.valores.map(valor), multi ? valor(l.total) : null)))),
      h('p', { class: 'secundario pequeno', style: { marginTop: '10px' } },
        d.contasPagas + ' contas pagas e ' + d.receitas + ' entradas no período. ' + d.observacao)),
    d.foraDaDre.length ? h('div', { class: 'bloco rolagem' }, h('h3', null, 'Fora da DRE'),
      h('p', { class: 'secundario pequeno' }, 'Investimentos, empréstimos, aportes e retiradas dos sócios mexem no caixa, mas não são receita nem despesa do mês.'),
      h('table', { class: 'tabela dre', style: { marginTop: '8px' } }, h('tbody', null, d.foraDaDre.map((l) => h('tr', null,
        h('td', null, l.rotulo), l.valores.map(valor), multi ? valor(l.total) : null))))) : null,
  ];
}
