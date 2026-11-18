/**
 * telas-relatorios-extras.js — tela "Relatórios": conciliação diária por conta,
 * pagamentos por fornecedor, gastos por categoria mês a mês, contas a vencer,
 * recebimentos por categoria/plataforma, dinheiro dos gerentes e alterações.
 * Todos com filtros fixos e exportação para Excel ou PDF.
 */
import { api } from './api.js';
import { app } from './app.js';
import { h, limpar, reais, data, hojeIso, toast, comBotao, opcoes, exportarPlanilha, reaisPlanilha, fixarFiltros, ROTULO_STATUS } from './ui.js';
import { abrirDetalhe, rotuloContaBancaria } from './telas-contas.js';

const NOMES_MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const nomeMes = (m) => NOMES_MES[Number(m.slice(5, 7)) - 1] + '/' + m.slice(2, 4);
const somarDias = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const primeiroDoMes = () => hojeIso().slice(0, 8) + '01';
const pct = (v) => (v * 100).toFixed(1).replace('.', ',') + '%';
const num = (c, extra) => h('td', { class: 'direita num' + (c < 0 ? ' negativo' : '') + (extra ? ' ' + extra : '') }, reais(c));
const periodoTexto = (de, ate) => data(de) + ' a ' + data(ate);

const RELATORIOS = [
  { id: 'conciliacao', nome: 'Conciliação', perfis: ['FINANCEIRO', 'APROVADOR', 'GESTOR'], monta: relConciliacao },
  { id: 'fornecedores', nome: 'Por fornecedor', perfis: ['FINANCEIRO', 'APROVADOR', 'GESTOR'], monta: relFornecedores },
  { id: 'categorias', nome: 'Por categoria', perfis: ['FINANCEIRO', 'APROVADOR', 'GESTOR'], monta: relCategorias },
  { id: 'a-vencer', nome: 'A vencer', perfis: ['FINANCEIRO', 'APROVADOR', 'GESTOR'], monta: relAVencer },
  { id: 'recebimentos', nome: 'Recebimentos', perfis: ['FINANCEIRO', 'APROVADOR', 'GESTOR'], monta: relRecebimentos },
  { id: 'dinheiro', nome: 'Dinheiro dos gerentes', perfis: ['FINANCEIRO', 'APROVADOR', 'GESTOR'], monta: relDinheiro },
  { id: 'alteracoes', nome: 'Alterações e exclusões', perfis: ['FINANCEIRO', 'APROVADOR', 'GESTOR', 'ADMIN'], monta: relAlteracoes },
];

export async function telaRelatorios({ subtitulo }) {
  const disponiveis = RELATORIOS.filter((r) => r.perfis.some((p) => app.tem(p)));
  const area = h('div');
  const botoes = {};
  let escolhido = (() => { try { return localStorage.getItem('relatorio:' + (window.__usuarioId || '')); } catch (e) { return null; } })();
  if (!disponiveis.some((r) => r.id === escolhido)) escolhido = disponiveis[0].id;
  const abrir = async (id) => {
    escolhido = id;
    try { localStorage.setItem('relatorio:' + (window.__usuarioId || ''), id); } catch (e) { /* sem armazenamento */ }
    Object.entries(botoes).forEach(([k, b]) => b.classList.toggle('primario', k === id));
    const r = disponiveis.find((x) => x.id === id);
    limpar(area, h('div', { class: 'vazio' }, 'Carregando…'));
    try { limpar(area, await r.monta(subtitulo)); } catch (e) { limpar(area, h('p', { class: 'mensagem erro' }, e.message)); }
  };
  disponiveis.forEach((r) => { botoes[r.id] = h('button', { onclick: () => abrir(r.id) }, r.nome); });
  await abrir(escolhido);
  return [h('div', { class: 'acoes abas-relatorio' }, Object.values(botoes)), area];
}

/** Barra de filtros padrão: devolve { el, valores(), fixo } e chama gerar() ao filtrar. */
function barraFiltros(chave, campos, gerar, exportar) {
  const fixo = fixarFiltros('rel:' + chave, campos.valores);
  if (campos.depoisDeRestaurar) campos.depoisDeRestaurar(fixo);
  const filtrar = h('button', { class: 'primario' }, 'Gerar');
  filtrar.onclick = () => comBotao(filtrar, gerar);
  const limparF = h('button', { class: 'discreto', onclick: () => { fixo.limpar(); if (campos.depoisDeRestaurar) campos.depoisDeRestaurar(fixo, true); gerar(); } }, 'Limpar filtros');
  const exp = h('button', { onclick: exportar }, 'Exportar (Excel ou PDF)');
  return h('div', { class: 'bloco filtros' }, campos.rotulos, h('div', { class: 'acoes', style: { alignSelf: 'end' } }, filtrar, limparF, exp));
}

const seletorEmpresa = () => h('select', null, opcoes(app.cad.empresas.map((e) => [e.id, e.nome]), '', 'Todas'));
const nomeEmpresaOuTodas = (id) => (id ? app.nomeEmpresa(id) : 'Todas as empresas');

// ---------------------------------------------------------------------------
// Conciliação diária
// ---------------------------------------------------------------------------

async function relConciliacao(subtitulo) {
  subtitulo('Escolha a conta e o período: o relatório mostra, dia a dia, o saldo do início, cada entrada e saída, os totais e o saldo do fim do dia — para bater com o extrato do banco.');
  const gestor = app.tem('GESTOR');
  const v = {
    empresa: h('select', null, opcoes(app.cad.empresas.map((e) => [e.id, e.nome]), app.cad.empresas.length === 1 ? app.cad.empresas[0].id : '', 'Escolha')),
    conta: h('select'),
    de: h('input', { type: 'date', value: somarDias(hojeIso(), -7), max: hojeIso() }),
    ate: h('input', { type: 'date', value: somarDias(hojeIso(), -1), max: hojeIso() }),
  };
  const contasDa = () => limpar(v.conta, opcoes(app.cad.contasBancarias.filter((c) => c.ativo && c.empresaId === v.empresa.value && (gestor || c.tipo !== 'APLICACAO'))
    .map((c) => [c.id, rotuloContaBancaria(c)]), '', 'Escolha'));
  v.empresa.addEventListener('change', contasDa);
  const saida = h('div');
  let ultimo = null;
  const gerar = async () => {
    if (!v.conta.value) { limpar(saida, h('div', { class: 'vazio' }, 'Escolha a empresa e a conta.')); return; }
    try { ultimo = await api('relatorios.conciliacao', { contaBancariaId: v.conta.value, de: v.de.value || undefined, ate: v.ate.value || undefined }); } catch (e) { limpar(saida, h('p', { class: 'mensagem erro' }, e.message)); return; }
    const r = ultimo;
    limpar(saida,
      h('section', { class: 'bloco' },
        h('div', { class: 'fechamento' }, h('h2', null, r.conta.empresa + ' · ' + r.conta.apelido), h('span', { class: 'secundario' }, periodoTexto(r.de, r.ate))),
        r.aviso ? h('p', { class: 'mensagem aviso' }, r.aviso) : null,
        h('div', { class: 'resumo', style: { marginTop: '8px' } },
          h('span', null, 'Saldo em ' + data(r.saldoInicioData) + ': ', h('b', null, reais(r.saldoInicioCentavos))),
          h('span', null, 'Entradas: ', h('b', null, reais(r.entradasCentavos))),
          h('span', null, 'Saídas: ', h('b', null, reais(r.saidasCentavos))),
          h('span', null, 'Saldo em ' + data(r.ate) + ': ', h('b', null, reais(r.saldoFimCentavos)))),
        r.conferencia && r.conferencia.saldoSistemaCentavos !== null ? h('p', { class: 'pequeno', style: { color: r.conferencia.bate ? '#1F5E3C' : '#B42318' } },
          r.conferencia.bate ? '✅ Último saldo informado pelo banco (' + data(r.conferencia.data) + ') bate com o sistema.'
            : '⚠️ Último saldo informado pelo banco (' + data(r.conferencia.data) + '): ' + reais(r.conferencia.saldoBancoCentavos) + ' · sistema ' + reais(r.conferencia.saldoSistemaCentavos) + ' · diferença ' + reais(r.conferencia.diferencaCentavos)) : null),
      !r.dias.length ? h('div', { class: 'vazio' }, 'Nenhum movimento no período.') : h('div', { class: 'bloco rolagem' }, h('table', { class: 'tabela tabela-conciliacao' },
        h('thead', null, h('tr', null, ['Data', 'Descrição', 'Situação no sistema', 'Entrada', 'Saída', 'Saldo'].map((t, i) => h('th', { class: i >= 3 ? 'direita' : '' }, t)))),
        h('tbody', null, r.dias.map((d) => [
          h('tr', { class: 'dia-inicio' }, h('td', { class: 'num' }, h('b', null, data(d.data))), h('td', { colspan: 4, class: 'secundario' }, 'Saldo do início do dia'), num(d.saldoInicialCentavos)),
          d.itens.map((x) => h('tr', { class: x.pendente ? 'pendente' : '' }, h('td', null, ''), h('td', null, x.descricao), h('td', { class: 'pequeno' + (x.pendente ? ' alerta' : ' secundario') }, x.situacao),
            h('td', { class: 'direita num' }, x.valor > 0 ? reais(x.valor) : ''), h('td', { class: 'direita num' }, x.valor < 0 ? reais(-x.valor) : ''), h('td', null, ''))),
          h('tr', { class: 'dia-fim' }, h('td', null, ''), h('td', null, h('b', null, 'Fim do dia ' + data(d.data))), h('td', null, ''),
            num(d.entradasCentavos, 'forte'), h('td', { class: 'direita num forte' }, reais(d.saidasCentavos)), num(d.saldoFinalCentavos, 'forte')),
        ])))),
      r.semExtrato.length ? h('section', { class: 'bloco' }, h('h3', null, 'Lançado no sistema nesta conta, mas não achado no extrato (' + r.semExtrato.length + ')'),
        h('p', { class: 'secundario pequeno' }, 'Pode ser lançamento manual repetido (o extrato já trouxe), conta errada ou algo que ainda não compensou. Não entra no saldo da conta de banco, que segue o extrato.'),
        h('table', { class: 'tabela' }, h('tbody', null, r.semExtrato.map((x) => h('tr', null, h('td', { class: 'num' }, data(x.data)), h('td', null, x.descricao), num(x.valor)))))) : null);
  };
  const exportar = () => {
    if (!ultimo) { toast('Gere o relatório primeiro.'); return; }
    const r = ultimo; const linhas = [];
    r.dias.forEach((d) => {
      linhas.push([data(d.data), 'Saldo do início do dia', '', '', '', reaisPlanilha(d.saldoInicialCentavos)]);
      d.itens.forEach((x) => linhas.push(['', x.descricao, x.situacao, x.valor > 0 ? reaisPlanilha(x.valor) : '', x.valor < 0 ? reaisPlanilha(-x.valor) : '', '']));
      linhas.push(['', 'Fim do dia ' + data(d.data), '', reaisPlanilha(d.entradasCentavos), reaisPlanilha(d.saidasCentavos), reaisPlanilha(d.saldoFinalCentavos)]);
    });
    r.semExtrato.forEach((x) => linhas.push([data(x.data), 'Não achado no extrato: ' + x.descricao, '', x.valor > 0 ? reaisPlanilha(x.valor) : '', x.valor < 0 ? reaisPlanilha(-x.valor) : '', '']));
    exportarPlanilha('conciliacao-' + r.conta.apelido + '-' + r.de + '-a-' + r.ate, ['Data', 'Descrição', 'Situação no sistema', 'Entrada (R$)', 'Saída (R$)', 'Saldo (R$)'], linhas,
      { titulo: 'Conciliação · ' + r.conta.empresa + ' · ' + r.conta.apelido, subtitulo: periodoTexto(r.de, r.ate) + ' · saldo em ' + data(r.saldoInicioData) + ': ' + reais(r.saldoInicioCentavos) + ' · saldo em ' + data(r.ate) + ': ' + reais(r.saldoFimCentavos), paisagem: false,
        destaque: (l) => (/^Fim do dia/.test(l[1]) ? 'forte' : l[1] === 'Saldo do início do dia' ? 'suave' : '') });
  };
  const barra = barraFiltros('conciliacao', {
    valores: v,
    depoisDeRestaurar: (fixo, limpo) => { contasDa(); if (!limpo) fixo.restaurar(['conta']); },
    rotulos: [h('label', { class: 'campo' }, 'Empresa', v.empresa), h('label', { class: 'campo' }, 'Conta', v.conta), h('label', { class: 'campo' }, 'De', v.de), h('label', { class: 'campo' }, 'Até', v.ate)],
  }, gerar, exportar);
  await gerar();
  return [barra, saida];
}

// ---------------------------------------------------------------------------
// Por fornecedor
// ---------------------------------------------------------------------------

async function relFornecedores(subtitulo) {
  subtitulo('Contas pagas no período (pela data do pagamento), somadas por fornecedor. Toque no fornecedor para ver as contas.');
  const v = { empresa: seletorEmpresa(), de: h('input', { type: 'date', value: primeiroDoMes() }), ate: h('input', { type: 'date', value: hojeIso() }) };
  const saida = h('div'); let ultimo = null;
  const gerar = async () => {
    try { ultimo = await api('relatorios.fornecedores', { empresaId: v.empresa.value || undefined, de: v.de.value || undefined, ate: v.ate.value || undefined }); } catch (e) { limpar(saida, h('p', { class: 'mensagem erro' }, e.message)); return; }
    const r = ultimo;
    limpar(saida, h('p', { class: 'resumo' }, r.fornecedores.length + ' fornecedores · total pago ', h('b', null, reais(r.totalCentavos)), ' · ' + periodoTexto(r.de, r.ate)),
      !r.fornecedores.length ? h('div', { class: 'vazio' }, 'Nenhuma conta paga no período.') : h('div', { class: 'bloco rolagem' }, h('table', { class: 'tabela' },
        h('thead', null, h('tr', null, ['Fornecedor', 'Contas', 'Último pagamento', 'Total', '% do total'].map((t, i) => h('th', { class: i === 3 || i === 4 ? 'direita' : '' }, t)))),
        h('tbody', null, r.fornecedores.map((f) => {
          const detalhe = h('tr', { hidden: true }, h('td', { colspan: 5 }, h('table', { class: 'tabela pequeno' }, h('tbody', null, f.contas.map((c) => h('tr', { class: 'clicavel', onclick: () => abrirDetalhe(c.id) },
            h('td', { class: 'num' }, data(c.dataPagamento)), h('td', null, c.rotulo + ' · ' + app.nomeEmpresa(c.empresaId)), h('td', null, c.descricao), h('td', { class: 'secundario' }, c.categoria), num(c.valorCentavos)))))));
          return [h('tr', { class: 'clicavel', onclick: () => { detalhe.hidden = !detalhe.hidden; } }, h('td', null, h('b', null, f.fornecedor)), h('td', { class: 'num' }, f.quantidade),
            h('td', { class: 'num' }, data(f.ultimoPagamento)), num(f.totalCentavos), h('td', { class: 'direita num' }, r.totalCentavos ? pct(f.totalCentavos / r.totalCentavos) : '')), detalhe];
        })))));
  };
  const exportar = () => {
    if (!ultimo) return;
    const linhas = [];
    ultimo.fornecedores.forEach((f) => f.contas.forEach((c) => linhas.push([f.fornecedor, data(c.dataPagamento), c.rotulo, app.nomeEmpresa(c.empresaId), c.descricao, c.categoria, reaisPlanilha(c.valorCentavos)])));
    exportarPlanilha('pagamentos-por-fornecedor-' + ultimo.de + '-a-' + ultimo.ate, ['Fornecedor', 'Pago em', 'Conta', 'Empresa', 'Descrição', 'Categoria', 'Valor (R$)'], linhas,
      { titulo: 'Pagamentos por fornecedor', subtitulo: nomeEmpresaOuTodas(v.empresa.value) + ' · ' + periodoTexto(ultimo.de, ultimo.ate) + ' · total ' + reais(ultimo.totalCentavos), totais: true });
  };
  const barra = barraFiltros('fornecedores', { valores: v, rotulos: [h('label', { class: 'campo' }, 'Empresa', v.empresa), h('label', { class: 'campo' }, 'Pago de', v.de), h('label', { class: 'campo' }, 'até', v.ate)] }, gerar, exportar);
  await gerar();
  return [barra, saida];
}

// ---------------------------------------------------------------------------
// Por categoria, mês a mês
// ---------------------------------------------------------------------------

async function relCategorias(subtitulo) {
  subtitulo('Quanto foi pago em cada categoria, mês a mês (pela data do pagamento). Até 24 meses.');
  const v = { empresa: seletorEmpresa(), de: h('input', { type: 'month', value: hojeIso().slice(0, 4) + '-01' }), ate: h('input', { type: 'month', value: hojeIso().slice(0, 7) }) };
  const saida = h('div'); let ultimo = null;
  const gerar = async () => {
    const ateMes = v.ate.value || hojeIso().slice(0, 7);
    const fim = new Date(Date.UTC(Number(ateMes.slice(0, 4)), Number(ateMes.slice(5, 7)), 0)).toISOString().slice(0, 10);
    try { ultimo = await api('relatorios.categorias', { empresaId: v.empresa.value || undefined, de: (v.de.value || ateMes) + '-01', ate: fim > hojeIso() ? hojeIso() : fim }); } catch (e) { limpar(saida, h('p', { class: 'mensagem erro' }, e.message)); return; }
    const r = ultimo;
    limpar(saida, !r.categorias.length ? h('div', { class: 'vazio' }, 'Nenhum pagamento no período.') : h('div', { class: 'bloco rolagem' }, h('table', { class: 'tabela tabela-fluxo' },
      h('thead', null, h('tr', null, h('th', null, 'Categoria'), r.meses.map((m) => h('th', null, nomeMes(m))), h('th', null, 'Total'), h('th', null, '%'))),
      h('tbody', null, r.categorias.map((c) => h('tr', null, h('td', null, c.categoria), c.valores.map((x) => h('td', null, x ? reais(x) : '–')), h('td', null, h('b', null, reais(c.totalCentavos))),
        h('td', { class: 'pct' }, r.totalCentavos ? pct(c.totalCentavos / r.totalCentavos) : ''))),
      h('tr', { class: 'total' }, h('td', null, 'Total'), r.totaisPorMes.map((x) => h('td', null, reais(x))), h('td', null, reais(r.totalCentavos)), h('td', null, ''))))));
  };
  const exportar = () => {
    if (!ultimo) return;
    const r = ultimo;
    exportarPlanilha('gastos-por-categoria-' + r.de.slice(0, 7) + '-a-' + r.ate.slice(0, 7), ['Categoria'].concat(r.meses.map((m) => nomeMes(m) + ' (R$)'), ['Total (R$)']),
      r.categorias.map((c) => [c.categoria].concat(c.valores.map(reaisPlanilha), [reaisPlanilha(c.totalCentavos)])),
      { titulo: 'Gastos por categoria', subtitulo: nomeEmpresaOuTodas(v.empresa.value) + ' · ' + periodoTexto(r.de, r.ate), totais: true, paisagem: true });
  };
  const barra = barraFiltros('categorias', { valores: v, rotulos: [h('label', { class: 'campo' }, 'Empresa', v.empresa), h('label', { class: 'campo' }, 'De (mês)', v.de), h('label', { class: 'campo' }, 'Até (mês)', v.ate)] }, gerar, exportar);
  await gerar();
  return [barra, saida];
}

// ---------------------------------------------------------------------------
// A vencer
// ---------------------------------------------------------------------------

async function relAVencer(subtitulo) {
  subtitulo('Contas ainda não pagas, por faixa de vencimento. As vencidas aparecem primeiro.');
  const v = { empresa: seletorEmpresa(), dias: h('select', null, opcoes([['30', 'Próximos 30 dias'], ['60', 'Próximos 60 dias'], ['90', 'Próximos 90 dias']], '30')) };
  const saida = h('div'); let ultimo = null;
  const gerar = async () => {
    try { ultimo = await api('relatorios.aVencer', { empresaId: v.empresa.value || undefined, dias: Number(v.dias.value) }); } catch (e) { limpar(saida, h('p', { class: 'mensagem erro' }, e.message)); return; }
    const r = ultimo;
    limpar(saida,
      h('div', { class: 'tiles' }, r.faixas.map((f) => h('div', { class: 'tile' + (f.chave === 'VENCIDAS' && f.quantidade ? ' alerta' : '') },
        h('div', { class: 'tile-rotulo' }, f.nome), h('div', { class: 'tile-valor num' }, reais(f.totalCentavos)), h('div', { class: 'tile-detalhe' }, f.quantidade + (f.quantidade === 1 ? ' conta' : ' contas'))))),
      !r.itens.length ? h('div', { class: 'vazio' }, 'Nada a vencer no período.') : h('div', { class: 'bloco rolagem' }, h('table', { class: 'tabela' },
        h('thead', null, h('tr', null, ['Vencimento', 'Fornecedor', 'Conta', 'Situação', 'Categoria', 'Valor'].map((t, i) => h('th', { class: i === 5 ? 'direita' : '' }, t)))),
        h('tbody', null, r.itens.map((x) => h('tr', { class: 'clicavel' + (x.faixa === 'VENCIDAS' ? ' vencida' : ''), onclick: () => abrirDetalhe(x.id) },
          h('td', { class: 'num' }, data(x.vencimento)), h('td', null, h('b', null, x.fornecedor), h('div', { class: 'secundario pequeno' }, x.descricao)),
          h('td', null, x.rotulo + ' · ' + app.nomeEmpresa(x.empresaId)), h('td', null, ROTULO_STATUS[x.status] || x.status), h('td', { class: 'secundario pequeno' }, x.categoria), num(x.valorCentavos)))))));
  };
  const exportar = () => {
    if (!ultimo) return;
    const faixa = Object.fromEntries(ultimo.faixas.map((f) => [f.chave, f.nome]));
    exportarPlanilha('contas-a-vencer-' + ultimo.dias + '-dias-' + hojeIso(), ['Faixa', 'Vencimento', 'Fornecedor', 'Descrição', 'Conta', 'Empresa', 'Situação', 'Categoria', 'Valor (R$)'],
      ultimo.itens.map((x) => [faixa[x.faixa], data(x.vencimento), x.fornecedor, x.descricao, x.rotulo, app.nomeEmpresa(x.empresaId), ROTULO_STATUS[x.status] || x.status, x.categoria, reaisPlanilha(x.valorCentavos)]),
      { titulo: 'Contas a vencer · ' + ultimo.dias + ' dias', subtitulo: nomeEmpresaOuTodas(v.empresa.value) + ' · posição em ' + data(ultimo.hoje) + ' · ' + ultimo.faixas.map((f) => f.nome + ': ' + reais(f.totalCentavos)).join(' · '), totais: true });
  };
  const barra = barraFiltros('a-vencer', { valores: v, rotulos: [h('label', { class: 'campo' }, 'Empresa', v.empresa), h('label', { class: 'campo' }, 'Horizonte', v.dias)] }, gerar, exportar);
  await gerar();
  return [barra, saida];
}

// ---------------------------------------------------------------------------
// Recebimentos
// ---------------------------------------------------------------------------

async function relRecebimentos(subtitulo) {
  subtitulo('Entradas do período, por categoria ou por plataforma (a plataforma vem do nome no extrato: PagBank, Cielo, Stone, iFood...).');
  const v = { empresa: seletorEmpresa(), agrupar: h('select', null, opcoes([['CATEGORIA', 'Por categoria'], ['PLATAFORMA', 'Por plataforma']], 'CATEGORIA')),
    de: h('input', { type: 'date', value: primeiroDoMes() }), ate: h('input', { type: 'date', value: hojeIso() }) };
  const saida = h('div'); let ultimo = null;
  const gerar = async () => {
    try { ultimo = await api('relatorios.recebimentos', { empresaId: v.empresa.value || undefined, agrupar: v.agrupar.value, de: v.de.value || undefined, ate: v.ate.value || undefined }); } catch (e) { limpar(saida, h('p', { class: 'mensagem erro' }, e.message)); return; }
    const r = ultimo; const variosMeses = r.meses.length > 1;
    limpar(saida, h('p', { class: 'resumo' }, 'Total recebido ', h('b', null, reais(r.totalCentavos)), ' · ' + periodoTexto(r.de, r.ate)),
      !r.grupos.length ? h('div', { class: 'vazio' }, 'Nenhuma entrada no período.') : h('div', { class: 'bloco rolagem' }, h('table', { class: 'tabela tabela-fluxo' },
        h('thead', null, h('tr', null, h('th', null, r.agrupar === 'PLATAFORMA' ? 'Plataforma' : 'Categoria'), variosMeses ? r.meses.map((m) => h('th', null, nomeMes(m))) : null, h('th', null, 'Total'), h('th', null, '%'), h('th', null, 'Entradas'))),
        h('tbody', null, r.grupos.map((g) => h('tr', null, h('td', null, g.nome), variosMeses ? g.valores.map((x) => h('td', null, x ? reais(x) : '–')) : null,
          h('td', null, h('b', null, reais(g.totalCentavos))), h('td', { class: 'pct' }, pct(g.percentual)), h('td', null, String(g.quantidade)))),
        h('tr', { class: 'total' }, h('td', null, 'Total'), variosMeses ? r.totaisPorMes.map((x) => h('td', null, reais(x))) : null, h('td', null, reais(r.totalCentavos)), h('td', null, '100%'), h('td', null, ''))))));
  };
  const exportar = () => {
    if (!ultimo) return;
    const r = ultimo;
    exportarPlanilha('recebimentos-por-' + r.agrupar.toLowerCase() + '-' + r.de + '-a-' + r.ate, [r.agrupar === 'PLATAFORMA' ? 'Plataforma' : 'Categoria'].concat(r.meses.map((m) => nomeMes(m) + ' (R$)'), ['Total (R$)', '%']),
      r.grupos.map((g) => [g.nome].concat(g.valores.map(reaisPlanilha), [reaisPlanilha(g.totalCentavos), pct(g.percentual)])),
      { titulo: 'Recebimentos por ' + (r.agrupar === 'PLATAFORMA' ? 'plataforma' : 'categoria'), subtitulo: nomeEmpresaOuTodas(v.empresa.value) + ' · ' + periodoTexto(r.de, r.ate), totais: true });
  };
  const barra = barraFiltros('recebimentos', { valores: v, rotulos: [h('label', { class: 'campo' }, 'Empresa', v.empresa), h('label', { class: 'campo' }, 'Agrupar', v.agrupar),
    h('label', { class: 'campo' }, 'De', v.de), h('label', { class: 'campo' }, 'Até', v.ate)] }, gerar, exportar);
  await gerar();
  return [barra, saida];
}

// ---------------------------------------------------------------------------
// Dinheiro dos gerentes
// ---------------------------------------------------------------------------

async function relDinheiro(subtitulo) {
  subtitulo('Contas que os gerentes pagaram em dinheiro do caixa da loja: o que já foi conferido pelo financeiro e o que falta conferir.');
  const v = { empresa: seletorEmpresa(), de: h('input', { type: 'date', value: primeiroDoMes() }), ate: h('input', { type: 'date', value: hojeIso() }) };
  const saida = h('div'); let ultimo = null;
  const gerar = async () => {
    try { ultimo = await api('relatorios.dinheiroGerentes', { empresaId: v.empresa.value || undefined, de: v.de.value || undefined, ate: v.ate.value || undefined }); } catch (e) { limpar(saida, h('p', { class: 'mensagem erro' }, e.message)); return; }
    const r = ultimo;
    limpar(saida,
      h('div', { class: 'tiles' }, r.gerentes.map((g) => h('div', { class: 'tile' }, h('div', { class: 'tile-rotulo' }, g.gerente), h('div', { class: 'tile-valor num' }, reais(g.totalCentavos)),
        h('div', { class: 'tile-detalhe' }, g.quantidade + (g.quantidade === 1 ? ' pagamento' : ' pagamentos') + (g.aConferirCentavos ? ' · ' + reais(g.aConferirCentavos) + ' a conferir' : ''))))),
      !r.itens.length ? h('div', { class: 'vazio' }, 'Nenhum pagamento em dinheiro no período.') : h('div', { class: 'bloco rolagem' }, h('table', { class: 'tabela' },
        h('thead', null, h('tr', null, ['Data', 'Gerente', 'Fornecedor', 'Empresa', 'Comprovante', 'Situação', 'Valor'].map((t, i) => h('th', { class: i === 6 ? 'direita' : '' }, t)))),
        h('tbody', null, r.itens.map((x) => h('tr', { class: 'clicavel', onclick: () => abrirDetalhe(x.id) }, h('td', { class: 'num' }, data(x.data)), h('td', null, x.gerente),
          h('td', null, h('b', null, x.fornecedor), h('div', { class: 'secundario pequeno' }, x.descricao)), h('td', null, app.nomeEmpresa(x.empresaId)),
          h('td', null, x.comprovantes ? '📎 ' + x.comprovantes : h('span', { style: { color: '#B42318' } }, 'sem')),
          h('td', null, x.status === 'SOLICITADO' ? h('b', { style: { color: '#9A6B00' } }, 'A conferir') : (ROTULO_STATUS[x.status] || x.status) + (x.conferidoPor ? ' · ' + x.conferidoPor : '')), num(x.valorCentavos)))))));
  };
  const exportar = () => {
    if (!ultimo) return;
    exportarPlanilha('dinheiro-dos-gerentes-' + ultimo.de + '-a-' + ultimo.ate, ['Data', 'Gerente', 'Fornecedor', 'Descrição', 'Empresa', 'Comprovantes', 'Situação', 'Conferido por', 'Valor (R$)'],
      ultimo.itens.map((x) => [data(x.data), x.gerente, x.fornecedor, x.descricao, app.nomeEmpresa(x.empresaId), x.comprovantes, x.status === 'SOLICITADO' ? 'A conferir' : ROTULO_STATUS[x.status] || x.status, x.conferidoPor, reaisPlanilha(x.valorCentavos)]),
      { titulo: 'Pagamentos em dinheiro dos gerentes', subtitulo: nomeEmpresaOuTodas(v.empresa.value) + ' · ' + periodoTexto(ultimo.de, ultimo.ate), totais: true });
  };
  const barra = barraFiltros('dinheiro', { valores: v, rotulos: [h('label', { class: 'campo' }, 'Empresa', v.empresa), h('label', { class: 'campo' }, 'De', v.de), h('label', { class: 'campo' }, 'Até', v.ate)] }, gerar, exportar);
  await gerar();
  return [barra, saida];
}

// ---------------------------------------------------------------------------
// Alterações e exclusões
// ---------------------------------------------------------------------------

async function relAlteracoes(subtitulo) {
  subtitulo('Tudo o que foi alterado, excluído, desfeito ou reaberto: quem fez, quando, o que mudou e o motivo.');
  const v = { empresa: seletorEmpresa(), de: h('input', { type: 'date', value: somarDias(hojeIso(), -30) }), ate: h('input', { type: 'date', value: hojeIso() }),
    busca: h('input', { type: 'search', placeholder: 'Pessoa, fornecedor, motivo...' }) };
  const saida = h('div'); let ultimo = null; let filtrados = [];
  const desenhar = () => {
    const b = v.busca.value.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    filtrados = ultimo.itens.filter((x) => !b || [x.usuario, x.acao, x.oQue, x.mudou, x.motivo].join(' ').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(b));
    limpar(saida, h('p', { class: 'resumo' }, filtrados.length + ' registros · ' + periodoTexto(ultimo.de, ultimo.ate)),
      !filtrados.length ? h('div', { class: 'vazio' }, 'Nenhuma alteração no período.') : h('div', { class: 'bloco rolagem' }, h('table', { class: 'tabela' },
        h('thead', null, h('tr', null, ['Quando', 'Quem', 'O que aconteceu', 'Em quê', 'O que mudou', 'Motivo'].map((t) => h('th', null, t)))),
        h('tbody', null, filtrados.map((x) => h('tr', null, h('td', { class: 'num pequeno' }, new Date(x.dataHora).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })),
          h('td', null, x.usuario), h('td', null, h('b', null, x.acao)), h('td', { class: 'pequeno' }, x.oQue, x.empresaId ? h('div', { class: 'secundario' }, app.nomeEmpresa(x.empresaId)) : null),
          h('td', { class: 'pequeno' }, x.mudou), h('td', { class: 'pequeno' }, x.motivo)))))));
  };
  const gerar = async () => {
    try { ultimo = await api('relatorios.alteracoes', { empresaId: v.empresa.value || undefined, de: v.de.value || undefined, ate: v.ate.value || undefined }); } catch (e) { limpar(saida, h('p', { class: 'mensagem erro' }, e.message)); return; }
    desenhar();
  };
  let espera;
  v.busca.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(() => ultimo && desenhar(), 250); });
  const exportar = () => {
    if (!ultimo) return;
    exportarPlanilha('alteracoes-' + ultimo.de + '-a-' + ultimo.ate, ['Quando', 'Quem', 'O que aconteceu', 'Em quê', 'Empresa', 'O que mudou', 'Motivo'],
      filtrados.map((x) => [new Date(x.dataHora).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }), x.usuario, x.acao, x.oQue, x.empresaId ? app.nomeEmpresa(x.empresaId) : '', x.mudou, x.motivo]),
      { titulo: 'Alterações e exclusões', subtitulo: nomeEmpresaOuTodas(v.empresa.value) + ' · ' + periodoTexto(ultimo.de, ultimo.ate), paisagem: true });
  };
  const barra = barraFiltros('alteracoes', { valores: v, rotulos: [h('label', { class: 'campo busca' }, 'Buscar', v.busca), h('label', { class: 'campo' }, 'Empresa', v.empresa),
    h('label', { class: 'campo' }, 'De', v.de), h('label', { class: 'campo' }, 'Até', v.ate)] }, gerar, exportar);
  await gerar();
  return [barra, saida];
}
