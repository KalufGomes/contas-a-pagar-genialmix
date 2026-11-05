/**
 * telas-conciliacao.js — Extratos bancários (importar e classificar), vendas do
 * Soft Up cruzadas com o extrato, e importação dos holerites.
 *
 * Os arquivos são lidos no aparelho (leitores.js); só as linhas vão ao servidor,
 * em lotes. O número completo da conta bancária nunca sai do aparelho.
 */
import { api } from './api.js';
import { app } from './app.js';
import {
  h, limpar, reais, data, hojeIso, toast, dialogo, comBotao, campoValor, opcoes,
  exportarPlanilha, reaisPlanilha, lerPlanilha, lerTextoPdf,
} from './ui.js';
import { opcoesCategorias } from './telas-contas.js';
import { lerOfx, lerExtratoExcel, lerSoftUp, menosUmMes, lerHolerites, vencimentoDoHolerite, comparavel } from './leitores.js';

const LOTE_EXTRATO = 100;
const LOTE_VENDAS = 150;

const SITUACAO = {
  PENDENTE: { nome: 'Para classificar', cor: 'urgente' },
  CONCILIADO: { nome: 'Baixa de conta a pagar', cor: 'ok' },
  LANCADO: { nome: 'Lançado', cor: 'ok' },
  TRANSFERENCIA: { nome: 'Transferência entre contas', cor: '' },
  IGNORADO: { nome: 'Ignorado (aplicação/resgate)', cor: '' },
};
const CLASSIFICACAO = {
  CONTA_A_PAGAR: 'Conta a pagar', VARIAS_CONTAS: 'Várias contas', SALARIOS: 'Salários (holerites)', DESPESA: 'Despesa',
  RECEITA: 'Receita', RECEITA_VENDA: 'Receita de vendas', TRANSFERENCIA: 'Transferência', INVESTIMENTO_OU_OUTRO: 'Ignorado',
};
const VENDA = {
  RECEBIDO: { nome: 'Recebido no banco — falta baixar no Soft Up', curto: 'Recebido (baixar no Soft Up)', cor: 'ok' },
  PROVAVEL: { nome: 'Provável — confirme', curto: 'Provável', cor: 'aviso' },
  EM_ABERTO: { nome: 'Ainda não pago', curto: 'Não pago', cor: 'urgente' },
  BAIXADA_SOFTUP: { nome: 'Já baixada no Soft Up', curto: 'Baixada no Soft Up', cor: '' },
};
const etiqueta = (texto, cor) => h('span', { class: 'etiqueta' + (cor === 'urgente' ? ' urgente' : cor === 'ok' ? ' ok' : cor === 'aviso' ? ' aviso' : '') }, texto);
const contaNome = (id) => { const c = app.contaBancaria(id); return c ? c.apelido + ' · final ' + c.contaFinal : ''; };
const nomeCategoria = (id) => { const c = app.categoria(id); return c ? c.codigo + ' ' + c.nome : ''; };
const temGenial = () => app.cad.empresas.some((e) => e.marca === 'genial-mix');

// ---------------------------------------------------------------------------
// Tela principal (duas abas)
// ---------------------------------------------------------------------------

export async function telaConciliacao(ctx) {
  const area = h('div');
  const aba = /aba=softup/.test(location.hash) ? 'softup' : 'extratos';
  const botoes = {};
  const abrir = async (qual) => {
    Object.entries(botoes).forEach(([k, b]) => b.classList.toggle('primario', k === qual));
    limpar(area, h('div', { class: 'vazio' }, 'Carregando…'));
    try { limpar(area, await (qual === 'softup' ? telaVendas(ctx) : telaExtratos(ctx))); } catch (e) { limpar(area, h('p', { class: 'mensagem erro' }, e.message)); }
  };
  botoes.extratos = h('button', { onclick: () => abrir('extratos') }, 'Extratos bancários');
  if (temGenial()) botoes.softup = h('button', { onclick: () => abrir('softup') }, 'Vendas do Soft Up (Genial)');
  await abrir(aba === 'softup' && botoes.softup ? 'softup' : 'extratos');
  return [h('div', { class: 'acoes' }, Object.values(botoes)), area];
}

// ---------------------------------------------------------------------------
// Extratos
// ---------------------------------------------------------------------------

async function telaExtratos({ subtitulo }) {
  const fin = app.tem('FINANCEIRO');
  subtitulo('Importe o extrato (OFX ou Excel): as contas pagas recebem baixa sozinhas, tarifas e IOF são lançados, as vendas viram receita. O que o sistema não souber fica "Para classificar".');
  const f = {
    empresa: h('select', null, opcoes(app.cad.empresas.map((e) => [e.id, e.nome]), '', 'Todas')),
    conta: h('select'),
    situacao: h('select', null, opcoes(Object.entries(SITUACAO).map(([k, v]) => [k, v.nome]), fin ? 'PENDENTE' : '', 'Todas')),
    tipo: h('select', null, opcoes([['CREDITO', 'Só entradas'], ['DEBITO', 'Só saídas']], '', 'Entradas e saídas')),
    de: h('input', { type: 'date' }), ate: h('input', { type: 'date' }),
    busca: h('input', { type: 'search', placeholder: 'Histórico, nome, CPF/CNPJ ou valor' }),
  };
  const atualizarContas = () => limpar(f.conta, opcoes(app.cad.contasBancarias.filter((c) => c.ativo && (!f.empresa.value || c.empresaId === f.empresa.value))
    .map((c) => [c.id, c.apelido + ' · final ' + c.contaFinal]), '', 'Todas'));
  atualizarContas();
  const resumo = h('div', { class: 'resumo' });
  const lista = h('div', { class: 'bloco rolagem' });
  let itens = [];
  const carregar = async () => {
    const r = await api('extratos.movimentos', { empresaId: f.empresa.value || undefined, contaBancariaId: f.conta.value || undefined,
      situacao: f.situacao.value || undefined, tipo: f.tipo.value || undefined, de: f.de.value || undefined, ate: f.ate.value || undefined,
      busca: f.busca.value.trim() || undefined });
    itens = r.itens;
    limpar(resumo, Object.entries(SITUACAO).filter(([k]) => r.resumoPorSituacao[k]).map(([k, v]) => {
      const x = r.resumoPorSituacao[k];
      return h('button', { class: 'discreto', onclick: () => { f.situacao.value = k; carregar(); } }, etiqueta(v.nome, v.cor), ' ', h('b', null, x.quantidade),
        x.entradasCentavos ? ' · +' + reais(x.entradasCentavos) : '', x.saidasCentavos ? ' · −' + reais(x.saidasCentavos) : '');
    }));
    desenhar();
  };
  const desenhar = () => {
    limpar(lista, !itens.length ? h('div', { class: 'vazio' }, f.situacao.value === 'PENDENTE' ? 'Nada para classificar. 🎉' : 'Nenhum movimento com esses filtros.') : h('table', { class: 'tabela' },
      h('thead', null, h('tr', null, ['Data', 'Conta', 'Histórico', 'Valor', 'Situação', ''].map((t, i) => h('th', { class: i === 3 ? 'direita' : '' }, t)))),
      h('tbody', null, itens.map((m) => h('tr', null,
        h('td', { class: 'num' }, data(m.data)), h('td', { class: 'pequeno' }, contaNome(m.contaBancariaId)),
        h('td', null, m.historico, m.contraparte && !comparavel(m.historico).includes(comparavel(m.contraparte)) ? h('div', { class: 'secundario pequeno' }, m.contraparte) : null,
          m.observacao ? h('div', { class: 'secundario pequeno' }, m.observacao) : null),
        h('td', { class: 'direita num', style: { color: m.valorCentavos > 0 ? 'var(--st-pago)' : null } }, (m.valorCentavos > 0 ? '+ ' : '− ') + reais(Math.abs(m.valorCentavos))),
        h('td', null, etiqueta(SITUACAO[m.situacao].nome, SITUACAO[m.situacao].cor), detalheMovimento(m)),
        h('td', null, fin && podeMudar(m) ? h('button', { class: m.situacao === 'PENDENTE' ? 'primario' : 'discreto', onclick: () => classificar(m, carregar) },
          m.situacao === 'PENDENTE' ? 'Classificar' : 'Mudar') : null))))));
  };
  let espera;
  Object.values(f).forEach((el) => el.addEventListener(el.type === 'search' ? 'input' : 'change', () => {
    if (el === f.empresa) atualizarContas();
    clearTimeout(espera); espera = setTimeout(carregar, el.type === 'search' ? 350 : 0);
  }));
  const exportar = h('button', { onclick: () => exportarPlanilha('extrato-' + hojeIso(), ['Data', 'Empresa', 'Conta', 'Histórico', 'Nome', 'CPF/CNPJ', 'Valor (R$)', 'Situação', 'Classificação', 'Categoria', 'Contas'],
    itens.map((m) => [data(m.data), app.nomeEmpresa(m.empresaId), contaNome(m.contaBancariaId), m.historico, m.contraparte, m.documento, reaisPlanilha(m.valorCentavos),
      SITUACAO[m.situacao].nome, CLASSIFICACAO[m.classificacao] || '', nomeCategoria(m.categoriaId), m.contas.map((c) => c.rotulo).join(', ')])) }, 'Exportar para Excel');
  const regras = fin ? h('button', { onclick: () => telaRegras() }, 'Regras automáticas') : null;
  await carregar();
  return [
    fin ? blocoImportarExtrato(carregar) : null,
    h('div', { class: 'bloco filtros' },
      h('label', { class: 'campo busca' }, 'Buscar', f.busca),
      h('label', { class: 'campo' }, 'Situação', f.situacao), h('label', { class: 'campo' }, 'Tipo', f.tipo),
      h('label', { class: 'campo' }, 'Empresa', f.empresa), h('label', { class: 'campo' }, 'Conta', f.conta),
      h('label', { class: 'campo' }, 'De', f.de), h('label', { class: 'campo' }, 'Até', f.ate),
      h('div', { class: 'acoes', style: { alignSelf: 'end' } }, exportar, regras)),
    resumo, lista,
  ];
}

const podeMudar = (m) => m.situacao === 'PENDENTE' || (!m.contas.length && ['LANCADO', 'TRANSFERENCIA', 'IGNORADO'].includes(m.situacao));

function detalheMovimento(m) {
  const partes = [];
  if (m.contas.length) partes.push(m.contas.map((c) => c.rotulo + ' ' + c.fornecedorNome).join(', '));
  if (m.categoriaId && !m.contas.length) partes.push(nomeCategoria(m.categoriaId));
  if (m.regra) partes.push('regra: ' + m.regra);
  if (m.vendaId) partes.push('venda do Soft Up');
  return partes.length ? h('div', { class: 'secundario pequeno' }, partes.join(' · ')) : null;
}

function blocoImportarExtrato(depois) {
  const arquivo = h('input', { type: 'file', accept: '.ofx,.OFX,.xlsx,.xls,application/x-ofx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel' });
  const area = h('div');
  arquivo.addEventListener('change', async () => {
    const arq = arquivo.files[0];
    if (!arq) return;
    limpar(area, h('p', { class: 'secundario' }, 'Lendo o arquivo…'));
    let lido;
    try {
      lido = /\.ofx$/i.test(arq.name) || /<OFX>/i.test(await arq.slice(0, 2000).text()) ? lerOfx(await lerTextoOfx(arq)) : lerExtratoExcel(await lerPlanilha(arq));
    } catch (e) { limpar(area, h('p', { class: 'mensagem erro' }, e.message)); return; }
    mostrarPrevia(arq.name, lido, area, () => { arquivo.value = ''; depois(); });
  });
  return h('section', { class: 'bloco' }, h('h2', null, 'Importar extrato'),
    h('div', { class: 'grade-campos' }, h('label', { class: 'campo largo' }, 'Arquivo do banco',
      h('span', { class: 'dica' }, 'OFX (melhor) ou Excel. No Santander e no Inter: Extrato → exportar/salvar em OFX. Pode importar o mesmo período de novo: o que já entrou é pulado.'), arquivo)),
    area);
}

/** OFX costuma vir em Windows-1252 (acentos): tenta UTF-8 e cai para 1252. */
async function lerTextoOfx(arq) {
  const buf = await arq.arrayBuffer();
  const utf = new TextDecoder('utf-8').decode(buf);
  return utf.includes('�') ? new TextDecoder('windows-1252').decode(buf) : utf;
}

function mostrarPrevia(nomeArquivo, lido, area, depois) {
  const doFinal = app.cad.contasBancarias.filter((c) => c.ativo && String(c.contaFinal).padStart(4, '0') === lido.contaFinal);
  const conta = h('select', null, opcoes(app.cad.contasBancarias.filter((c) => c.ativo).map((c) => [c.id, app.nomeEmpresa(c.empresaId) + ' · ' + c.apelido + ' · final ' + c.contaFinal]),
    doFinal.length === 1 ? doFinal[0].id : '', 'Escolha a conta'));
  const entradas = lido.movimentos.filter((m) => m.valorCentavos > 0).reduce((s, m) => s + m.valorCentavos, 0);
  const saidas = lido.movimentos.filter((m) => m.valorCentavos < 0).reduce((s, m) => s - m.valorCentavos, 0);
  const futuros = lido.movimentos.filter((m) => m.data > hojeIso()).length;
  const progresso = h('p', { class: 'secundario pequeno' });
  const resultado = h('div');
  const botao = h('button', { class: 'primario sucesso' }, 'Importar ' + lido.movimentos.length + ' movimentos');
  botao.onclick = () => comBotao(botao, async () => {
    const cb = app.contaBancaria(conta.value);
    if (!cb) { toast('Escolha de qual conta é o extrato.', { tipo: 'erro' }); return; }
    const movs = lido.movimentos.filter((m) => m.data <= hojeIso());
    const total = { novas: 0, repetidas: 0, erros: 0, PENDENTE: 0, CONCILIADO: 0, LANCADO: 0, TRANSFERENCIA: 0, IGNORADO: 0 };
    let extratoId; let baixas = 0; let vendas = null; let erro = '';
    try {
      for (let i = 0; i < movs.length; i += LOTE_EXTRATO) {
        progresso.textContent = 'Importando ' + Math.min(i + LOTE_EXTRATO, movs.length) + ' de ' + movs.length + '…';
        const r = await api('extratos.importar', { empresaId: cb.empresaId, contaBancariaId: cb.id, formato: lido.formato, arquivo: nomeArquivo.slice(0, 120),
          periodoDe: lido.periodoDe || undefined, periodoAte: lido.periodoAte || undefined, extratoId, ultimo: i + LOTE_EXTRATO >= movs.length,
          itens: movs.slice(i, i + LOTE_EXTRATO) });
        extratoId = r.extratoId; baixas += r.baixas; if (r.vendas) vendas = r.vendas;
        Object.keys(total).forEach((k) => { total[k] += r.contagem[k] || 0; });
        const falha = r.resultados.find((x) => x.situacao === 'ERRO');
        if (falha && !erro) erro = falha.mensagem;
      }
    } catch (e) { toast(e.message + ' O que já foi importado fica; importe o arquivo de novo para terminar (o repetido é pulado).', { tipo: 'erro', duracao: 15000 }); }
    progresso.textContent = '';
    limpar(resultado, h('div', { class: 'mensagem aviso' },
      h('b', null, total.novas + ' movimentos novos'), total.repetidas ? ' · ' + total.repetidas + ' já estavam importados' : '', h('br'),
      baixas + (baixas === 1 ? ' conta a pagar recebeu baixa' : ' contas a pagar receberam baixa'), ' · ', total.LANCADO + ' lançados (tarifas, receitas)', ' · ',
      total.TRANSFERENCIA + ' transferências', ' · ', total.IGNORADO + ' ignorados', h('br'),
      h('b', null, total.PENDENTE + ' para classificar'),
      vendas && (vendas.recebidas || vendas.provaveis) ? h('div', null, 'Soft Up: ' + vendas.recebidas + ' vendas achadas no extrato, ' + vendas.provaveis + ' prováveis para confirmar.') : null,
      erro ? h('div', { class: 'mensagem erro' }, total.erros + ' linha(s) com problema: ' + erro) : null));
    toast('Extrato importado.');
    depois();
  });
  limpar(area, h('div', { class: 'acao-aberta bloco' },
    h('p', null, h('b', null, lido.movimentos.length + ' movimentos'), (lido.periodoDe ? ' de ' + data(lido.periodoDe) + ' a ' + data(lido.periodoAte) : ''),
      ' · entradas ' + reais(entradas) + ' · saídas ' + reais(saidas), lido.banco ? ' · ' + lido.banco : ''),
    doFinal.length !== 1 ? h('p', { class: 'mensagem aviso' }, lido.contaFinal ? 'Não achei conta cadastrada com final ' + lido.contaFinal + '. Escolha abaixo (ou cadastre a conta em Empresas e contas bancárias).' : 'O arquivo não traz o número da conta: escolha abaixo.') : null,
    futuros ? h('p', { class: 'secundario pequeno' }, futuros + ' lançamento(s) com data futura (agendados) ficam de fora: importe de novo depois que acontecerem.') : null,
    h('div', { class: 'grade-campos' }, h('label', { class: 'campo largo' }, 'Extrato da conta', conta)),
    h('div', { class: 'acoes', style: { marginTop: '10px' } }, botao), progresso, resultado));
}

/** Diálogo para classificar (ou reclassificar) um movimento. */
function classificar(m, depois) {
  const credito = m.valorCentavos > 0;
  return dialogo((fechar) => {
    const opcoesAcao = (credito
      ? [['RECEITA', 'Receita (venda ou outra entrada)'], ['TRANSFERENCIA', 'Transferência entre contas do grupo / do sócio'], ['IGNORAR', 'Ignorar (resgate, estorno, devolução...)']]
      : [['CONTA', 'Pagou conta(s) a pagar já lançada(s)'], ['DESPESA', 'Despesa paga (lançar agora)'], ['TRANSFERENCIA', 'Transferência entre contas do grupo / ao sócio'], ['IGNORAR', 'Ignorar (aplicação, devolução...)']]);
    let acao = m.situacao === 'PENDENTE' ? (credito ? 'RECEITA' : (m.sugestoes && m.sugestoes.length ? 'CONTA' : 'DESPESA')) : opcoesAcao[0][0];
    const radios = h('div', { class: 'campo' }, opcoesAcao.map(([v, r]) => h('label', { class: 'check' },
      h('input', { type: 'radio', name: 'acao-mov', value: v, checked: v === acao, onchange: () => { acao = v; mostrar(); } }), r)));
    const cat = h('select', null, opcoesCategorias(m.empresaId, '', credito ? 'RECEITA' : 'DESPESA'));
    if (credito) { const vendas = app.categoriasDaEmpresa(m.empresaId, 'RECEITA').find((c) => c.codigo === '1.1'); if (vendas) cat.value = vendas.id; }
    const marcadas = new Set();
    const somaSel = h('p', { class: 'pequeno' });
    const sugestoes = (m.sugestoes || []);
    const atualizarSoma = () => {
      const soma = sugestoes.filter((c) => marcadas.has(c.id)).reduce((s, c) => s + c.valorCentavos, 0);
      somaSel.textContent = 'Selecionadas: ' + reais(soma) + (soma === -m.valorCentavos ? ' (confere com o extrato)' : ' — o extrato tem ' + reais(-m.valorCentavos));
    };
    const blocoConta = h('div', { class: 'campo' }, sugestoes.length ? [h('span', null, 'Contas em aberto com esse valor (até 30 dias)'),
      sugestoes.map((c) => h('label', { class: 'check' }, h('input', { type: 'checkbox', onchange: (e) => { e.target.checked ? marcadas.add(c.id) : marcadas.delete(c.id); atualizarSoma(); } }),
        h('span', null, h('b', null, c.fornecedorNome), ' · ' + c.rotulo + ' · vence ' + data(c.dataVencimento) + ' · ' + reais(c.valorCentavos), h('div', { class: 'secundario pequeno' }, c.descricao)))),
      somaSel]
      : h('p', { class: 'secundario pequeno' }, 'Nenhuma conta em aberto com esse valor. Se for um pagamento ainda não lançado, use "Despesa paga".'));
    const blocoCat = h('label', { class: 'campo' }, 'Categoria', cat);
    const textoPadrao = m.documento || m.contraparte || m.historico.replace(/\d{6,}.*$/, '').trim();
    const sempre = h('input', { type: 'checkbox' });
    const textoRegra = h('input', { value: textoPadrao.slice(0, 80), maxlength: 80 });
    const aplicarOutros = h('input', { type: 'checkbox', checked: true });
    const blocoRegra = h('div', { class: 'campo' }, h('label', { class: 'check' }, sempre, 'Sempre classificar assim quando o extrato tiver o texto:'), textoRegra,
      h('label', { class: 'check pequeno' }, aplicarOutros, 'Aplicar também aos outros "para classificar" iguais'));
    const obs = h('input', { maxlength: 300, placeholder: 'Opcional' });
    const erro = h('p', { class: 'mensagem erro', hidden: true });
    const mostrar = () => {
      blocoConta.hidden = acao !== 'CONTA';
      blocoCat.hidden = !['DESPESA', 'RECEITA'].includes(acao);
      blocoRegra.hidden = acao === 'CONTA';
    };
    mostrar();
    const botao = h('button', { class: 'primario' }, 'Salvar');
    botao.onclick = () => comBotao(botao, async () => {
      erro.hidden = true;
      const dados = { movimentoId: m.id, versao: m.versao, acao, observacao: obs.value.trim() || undefined };
      if (acao === 'CONTA') dados.contaIds = [...marcadas];
      if (['DESPESA', 'RECEITA'].includes(acao)) dados.categoriaId = cat.value;
      if (sempre.checked && acao !== 'CONTA') dados.regra = { texto: textoRegra.value.trim(), aplicarAosPendentes: aplicarOutros.checked };
      try {
        const r = await api('extratos.classificar', dados);
        fechar(true);
        toast('Movimento classificado.' + (r.outrosClassificados ? ' Mais ' + r.outrosClassificados + ' iguais classificados pela regra.' : ''));
        depois();
      } catch (e) { erro.textContent = e.message; erro.hidden = false; }
    });
    return [h('h2', null, (credito ? 'Entrada de ' : 'Saída de ') + reais(Math.abs(m.valorCentavos))),
      h('p', null, data(m.data) + ' · ' + contaNome(m.contaBancariaId)), h('p', { class: 'secundario' }, m.historico + (m.contraparte ? ' · ' + m.contraparte : '')),
      m.situacao !== 'PENDENTE' ? h('p', { class: 'mensagem aviso' }, 'Hoje está como "' + SITUACAO[m.situacao].nome + '". Ao mudar, o lançamento anterior é cancelado (fica no histórico).') : null,
      radios, blocoConta, blocoCat, blocoRegra, h('label', { class: 'campo' }, 'Observação', obs), erro,
      h('div', { class: 'acoes fim' }, h('button', { onclick: () => fechar(false) }, 'Voltar'), botao)];
  });
}

async function telaRegras() {
  let regras;
  try { regras = await api('extratos.regras', {}); } catch (e) { toast(e.message, { tipo: 'erro' }); return; }
  const ACAO = { DESPESA: 'Despesa paga', RECEITA: 'Receita', TRANSFERENCIA: 'Transferência', IGNORAR: 'Ignorar' };
  const NAT = { CREDITO: 'entradas', DEBITO: 'saídas', AMBOS: 'entradas e saídas' };
  return dialogo((fechar) => {
    const tabela = h('div', { class: 'rolagem' });
    const desenhar = () => limpar(tabela, h('table', { class: 'tabela' },
      h('thead', null, h('tr', null, ['Quando o extrato tiver', 'Em', 'Classificar como', 'Empresa', ''].map((t) => h('th', null, t)))),
      h('tbody', null, regras.map((r) => h('tr', null, h('td', null, h('b', null, r.texto)), h('td', { class: 'pequeno' }, NAT[r.natureza]),
        h('td', null, ACAO[r.acao] + (r.categoriaId ? ' · ' + nomeCategoria(r.categoriaId) : '')), h('td', { class: 'pequeno' }, r.empresaId ? app.nomeEmpresa(r.empresaId) : 'Todas'),
        h('td', null, h('button', { class: 'discreto', onclick: async (e) => {
          await comBotao(e.target, async () => {
            try { await api('extratos.desativarRegra', { regraId: r.id, versao: r.versao }); regras = regras.filter((x) => x.id !== r.id); desenhar(); toast('Regra desativada.'); } catch (err) { toast(err.message, { tipo: 'erro' }); }
          });
        } }, 'Desativar')))))));
    desenhar();
    return [h('h2', null, 'Regras automáticas do extrato'),
      h('p', { class: 'secundario pequeno' }, 'Valem para os próximos extratos. Para criar uma, classifique um movimento e marque "Sempre classificar assim". Antes das regras, o sistema sempre tenta dar baixa numa conta a pagar com o mesmo valor.'),
      tabela, h('div', { class: 'acoes fim' }, h('button', { onclick: () => fechar() }, 'Fechar'))];
  });
}

// ---------------------------------------------------------------------------
// Vendas do Soft Up
// ---------------------------------------------------------------------------

async function telaVendas({ subtitulo }) {
  const fin = app.tem('FINANCEIRO');
  const genial = app.cad.empresas.find((e) => e.marca === 'genial-mix');
  subtitulo('Relatório de contas a receber do Soft Up cruzado com as entradas dos extratos (vencimento 1 mês antes do que o Soft Up mostra, 5 dias para mais ou para menos, mesmo valor).');
  const f = {
    situacao: h('select', null, opcoes(Object.entries(VENDA).map(([k, v]) => [k, v.nome]), '', 'Todas')),
    busca: h('input', { type: 'search', placeholder: 'Nº da venda, cliente, vendedor ou valor' }),
    de: h('input', { type: 'date' }), ate: h('input', { type: 'date' }),
  };
  const resumo = h('div', { class: 'resumo' });
  const lista = h('div', { class: 'bloco rolagem' });
  let itens = [];
  const carregar = async () => {
    const r = await api('vendas.listar', { empresaId: genial ? genial.id : undefined, situacao: f.situacao.value || undefined,
      busca: f.busca.value.trim() || undefined, de: f.de.value || undefined, ate: f.ate.value || undefined });
    itens = r.itens;
    limpar(resumo, Object.entries(VENDA).filter(([k]) => r.resumoPorSituacao[k]).map(([k, v]) => h('button', { class: 'discreto', onclick: () => { f.situacao.value = k; carregar(); } },
      etiqueta(v.curto, v.cor), ' ', h('b', null, r.resumoPorSituacao[k].quantidade), ' · ' + reais(r.resumoPorSituacao[k].valorCentavos))));
    limpar(lista, !itens.length ? h('div', { class: 'vazio' }, 'Nenhuma venda com esses filtros.' + (fin ? ' Importe o relatório do Soft Up acima.' : '')) : h('table', { class: 'tabela' },
      h('thead', null, h('tr', null, ['Venda', 'Cliente', 'Vencimento', 'Valor', 'Situação', 'Pagamento no extrato', ''].map((t, i) => h('th', { class: i === 3 ? 'direita' : '' }, t)))),
      h('tbody', null, itens.map((v) => h('tr', null,
        h('td', { class: 'num' }, v.numero), h('td', null, v.cliente, v.vendedor ? h('div', { class: 'secundario pequeno' }, 'Vendedor: ' + v.vendedor) : null),
        h('td', { class: 'num' }, data(v.vencimento), h('div', { class: 'secundario pequeno' }, 'Soft Up: ' + data(v.vencimentoSoftup))),
        h('td', { class: 'direita num' }, reais(v.devidoCentavos)),
        h('td', null, etiqueta(VENDA[v.situacao].curto, VENDA[v.situacao].cor), v.confirmadoPor ? h('div', { class: 'secundario pequeno' }, 'por ' + v.confirmadoPor) : null),
        h('td', { class: 'pequeno' }, v.movimento ? [data(v.movimento.data) + ' · ' + reais(v.movimento.valorCentavos), h('div', null, v.movimento.contraparte || v.movimento.historico), h('div', { class: 'secundario' }, contaNome(v.movimento.contaBancariaId))] : '—'),
        h('td', null, fin && v.situacao === 'PROVAVEL' ? h('div', { class: 'acoes' },
          h('button', { class: 'primario sucesso', onclick: (e) => confirmar(v, true, e.currentTarget) }, 'É esta'),
          h('button', { class: 'discreto', onclick: (e) => confirmar(v, false, e.currentTarget) }, 'Não é')) : null))))));
  };
  const confirmar = (v, sim, botao) => comBotao(botao, async () => {
    try { await api('vendas.confirmar', { vendaId: v.id, versao: v.versao, confirmar: sim }); toast(sim ? 'Venda marcada como recebida.' : 'Ok, a venda continua em aberto.'); carregar(); } catch (e) { toast(e.message, { tipo: 'erro' }); }
  });
  let espera;
  Object.values(f).forEach((el) => el.addEventListener(el.type === 'search' ? 'input' : 'change', () => { clearTimeout(espera); espera = setTimeout(carregar, el.type === 'search' ? 350 : 0); }));
  const exportar = h('button', { onclick: () => exportarPlanilha('soft-up-' + hojeIso(), ['Venda', 'Cliente', 'Vendedor', 'Vencimento (ajustado)', 'Vencimento no Soft Up', 'Valor devido (R$)', 'Situação', 'Data no extrato', 'Quem pagou', 'Conta'],
    itens.map((v) => [v.numero, v.cliente, v.vendedor, data(v.vencimento), data(v.vencimentoSoftup), reaisPlanilha(v.devidoCentavos), VENDA[v.situacao].nome,
      v.movimento ? data(v.movimento.data) : '', v.movimento ? v.movimento.contraparte : '', v.movimento ? contaNome(v.movimento.contaBancariaId) : ''])) }, 'Exportar para Excel');
  await carregar();
  return [
    fin && genial ? blocoImportarSoftUp(genial, carregar) : null,
    h('div', { class: 'bloco filtros' },
      h('label', { class: 'campo busca' }, 'Buscar', f.busca), h('label', { class: 'campo' }, 'Situação', f.situacao),
      h('label', { class: 'campo' }, 'Vencimento de', f.de), h('label', { class: 'campo' }, 'até', f.ate),
      h('div', { class: 'acoes', style: { alignSelf: 'end' } }, exportar)),
    resumo, lista,
  ];
}

function blocoImportarSoftUp(genial, depois) {
  const arquivo = h('input', { type: 'file', accept: '.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel' });
  const area = h('div');
  arquivo.addEventListener('change', async () => {
    const arq = arquivo.files[0];
    if (!arq) return;
    limpar(area, h('p', { class: 'secundario' }, 'Lendo o relatório…'));
    let lido;
    try { lido = lerSoftUp(await lerPlanilha(arq)); } catch (e) { limpar(area, h('p', { class: 'mensagem erro' }, e.message)); return; }
    const total = lido.vendas.reduce((s, v) => s + v.devidoCentavos, 0);
    const datas = lido.vendas.map((v) => menosUmMes(v.vencimentoSoftup)).sort();
    const completo = h('input', { type: 'checkbox', checked: true });
    const progresso = h('p', { class: 'secundario pequeno' });
    const botao = h('button', { class: 'primario sucesso' }, 'Importar ' + lido.vendas.length + ' vendas');
    botao.onclick = () => comBotao(botao, async () => {
      let importacaoId; let ultimo = null; const erros = [];
      try {
        for (let i = 0; i < lido.vendas.length; i += LOTE_VENDAS) {
          progresso.textContent = 'Importando ' + Math.min(i + LOTE_VENDAS, lido.vendas.length) + ' de ' + lido.vendas.length + '…';
          ultimo = await api('vendas.importar', { empresaId: genial.id, arquivo: arq.name.slice(0, 120), importacaoId,
            ultimo: completo.checked ? i + LOTE_VENDAS >= lido.vendas.length : false,
            itens: lido.vendas.slice(i, i + LOTE_VENDAS).map((v) => ({ numero: v.numero, cliente: v.cliente, vendedor: v.vendedor, categoria: v.categoria,
              vencimentoSoftup: v.vencimentoSoftup, valorCentavos: v.valorCentavos, devidoCentavos: v.devidoCentavos })) });
          importacaoId = ultimo.importacaoId;
          ultimo.resultados.filter((x) => x.situacao === 'erro').forEach((x) => erros.push('venda ' + lido.vendas[i + x.linha].numero + ': ' + x.mensagem));
        }
      } catch (e) { toast(e.message, { tipo: 'erro', duracao: 12000 }); return; }
      progresso.textContent = '';
      const c = ultimo.cruzamento;
      limpar(area, h('p', { class: 'mensagem aviso' }, 'Relatório importado.',
        c ? ' ' + c.recebidas + ' vendas achadas no extrato (falta baixar no Soft Up) e ' + c.provaveis + ' prováveis para você confirmar.' : '',
        ultimo.contagem.baixadasNoSoftUp ? ' ' + ultimo.contagem.baixadasNoSoftUp + ' vendas saíram do relatório (já baixadas no Soft Up).' : '',
        erros.length ? h('div', { class: 'mensagem erro' }, erros.length + ' linha(s) com problema: ' + erros[0]) : null));
      arquivo.value = '';
      depois();
    });
    limpar(area, h('div', { class: 'acao-aberta bloco' },
      h('p', null, h('b', null, lido.vendas.length + ' vendas em aberto'), ' · ' + reais(total), ' · vencimentos (já com 1 mês a menos) de ' + data(datas[0]) + ' a ' + data(datas[datas.length - 1])),
      lido.ignoradas ? h('p', { class: 'secundario pequeno' }, lido.ignoradas + ' já baixada(s) no Soft Up ficaram de fora.') : null,
      h('label', { class: 'check' }, completo, 'Este relatório tem TODAS as vendas em aberto (as que sumiram dele foram baixadas no Soft Up)'),
      h('div', { class: 'acoes', style: { marginTop: '10px' } }, botao), progresso));
  });
  return h('section', { class: 'bloco' }, h('h2', null, 'Importar relatório do Soft Up'),
    h('div', { class: 'grade-campos' }, h('label', { class: 'campo largo' }, 'Relatório de contas a receber (Excel)',
      h('span', { class: 'dica' }, 'No Soft Up: Financeiro → movimento financeiro → exportar em Excel, com as vendas não baixadas. Importe sempre o relatório mais novo.'), arquivo)),
    area);
}

// ---------------------------------------------------------------------------
// Holerites
// ---------------------------------------------------------------------------

const TIPO_HOLERITE = { ADIANTAMENTO: 'Adiantamento (quinzena)', FOLHA: 'Salário (folha)', DECIMO_1: '13º - 1ª parcela', DECIMO_2: '13º - 2ª parcela', FERIAS: 'Férias' };
const cnpjTexto = (d) => (d && d.length === 14 ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5') : d || '');

export async function telaHolerites({ subtitulo }) {
  subtitulo('Envie os holerites em PDF do escritório: cada funcionário vira um pagamento "Lançado" no nome dele, com o valor líquido. Adiantamento no dia 20, salário no 5º dia útil.');
  const empresas = app.cad.empresas.filter((e) => e.ativo);
  const empresa = h('select', null, opcoes(empresas.map((e) => [e.id, e.nome]), empresas.length === 1 ? empresas[0].id : '', empresas.length === 1 ? undefined : 'Escolha'));
  const arquivo = h('input', { type: 'file', multiple: true, accept: 'application/pdf,.pdf' });
  const area = h('div');
  let linhas = [];

  arquivo.addEventListener('change', async () => {
    const arquivos = [...arquivo.files];
    if (!arquivos.length) return;
    limpar(area, h('p', { class: 'secundario' }, 'Lendo os holerites…'));
    const itens = []; const semTexto = [];
    try {
      for (const arq of arquivos) {
        const paginas = await lerTextoPdf(arq);
        const r = lerHolerites(paginas);
        if (!r.itens.length && r.paginasSemTexto) semTexto.push(arq.name);
        r.itens.forEach((x) => itens.push(Object.assign(x, { arquivo: arq.name })));
      }
    } catch (e) { limpar(area, h('p', { class: 'mensagem erro' }, 'Não consegui ler o PDF: ' + e.message)); return; }
    if (!empresa.value) {
      const porCnpj = empresas.find((e) => itens.some((x) => x.cnpj && String(e.cnpj || '').replace(/\D/g, '') === x.cnpj));
      if (porCnpj) empresa.value = porCnpj.id;
    }
    linhas = itens.map((x) => {
      const valor = campoValor(); valor.centavos = x.valorCentavos;
      return { x, incluir: h('input', { type: 'checkbox', checked: !!x.valorCentavos }), nome: h('input', { value: x.nome, maxlength: 120, style: { minWidth: '260px' } }),
        tipo: h('select', null, opcoes(Object.entries(TIPO_HOLERITE), x.tipo)), valor, venc: h('input', { type: 'date', value: x.dataVencimento }) };
    });
    linhas.forEach((l) => l.tipo.addEventListener('change', () => { l.venc.value = vencimentoDoHolerite(l.tipo.value, l.x.competencia) || l.venc.value; }));
    desenhar(semTexto);
  });

  const desenhar = (semTexto) => {
    const total = () => linhas.filter((l) => l.incluir.checked).reduce((s, l) => s + (l.valor.centavos || 0), 0);
    const totalEl = h('b');
    const atualizar = () => { totalEl.textContent = linhas.filter((l) => l.incluir.checked).length + ' pagamentos · ' + reais(total()); };
    linhas.forEach((l) => { l.incluir.onchange = atualizar; l.valor.oninput = atualizar; });
    const resultado = h('div');
    const botao = h('button', { class: 'primario sucesso' }, 'Lançar pagamentos');
    const enviar = async (simular) => {
      const sel = linhas.filter((l) => l.incluir.checked);
      if (!empresa.value) throw new Error('Escolha a empresa.');
      if (sel.some((l) => !l.valor.centavos || !l.venc.value)) throw new Error('Confira valor e data de todos os marcados.');
      const r = await api('contas.importarHolerites', { empresaId: empresa.value, simular, arquivo: [...new Set(sel.map((l) => l.x.arquivo))].join(', ').slice(0, 120),
        itens: sel.map((l) => ({ codigo: l.x.codigo || l.nome.value.slice(0, 20), nome: l.nome.value.trim(), tipo: l.tipo.value, competencia: l.x.competencia,
          valorCentavos: l.valor.centavos, dataVencimento: l.venc.value, cnpj: l.x.cnpj || undefined })) });
      return { sel, r };
    };
    botao.onclick = () => comBotao(botao, async () => {
      try {
        const previa = await enviar(true);
        const repetidas = previa.r.resultados.filter((x) => x.situacao === 'repetida').length;
        const erros = previa.r.resultados.filter((x) => x.situacao === 'erro');
        if (erros.length) throw new Error(erros[0].mensagem);
        if (repetidas && !(await dialogo((fechar) => [h('h2', null, repetidas + ' já lançado(s)'), h('p', null, 'Esses funcionários já têm o pagamento deste mês lançado e serão pulados.'),
          h('div', { class: 'acoes fim' }, h('button', { onclick: () => fechar(false) }, 'Voltar'), h('button', { class: 'primario', onclick: () => fechar(true) }, 'Lançar os outros'))]))) return;
        const { r } = await enviar(false);
        const criadas = r.resultados.filter((x) => x.situacao === 'criada').length;
        limpar(resultado, h('p', { class: 'mensagem aviso' }, criadas + ' pagamentos lançados (categoria Folha de pagamento). Eles estão em Contas a pagar como "Lançada": suba para aprovação quando agendar no banco. Quando o débito de salários aparecer no extrato, a baixa é automática.'),
          h('div', { class: 'acoes' }, h('button', { class: 'primario', onclick: () => app.navegar('contas') }, 'Ver em Contas a pagar')));
        toast(criadas + ' pagamentos lançados.');
        app.atualizarContadores();
      } catch (e) { toast(e.message, { tipo: 'erro', duracao: 10000 }); }
    });
    const empresaSel = app.empresa(empresa.value);
    const cnpjsDiferentes = empresaSel && empresaSel.cnpj && linhas.some((l) => l.x.cnpj && l.x.cnpj !== String(empresaSel.cnpj).replace(/\D/g, ''));
    limpar(area,
      semTexto.length ? h('p', { class: 'mensagem erro' }, 'Estes PDFs são imagem (foram impressos ou escaneados) e não dá para ler o texto: ' + semTexto.join(', ') + '. Peça ao escritório o PDF original, que sai direto do sistema deles.') : null,
      !linhas.length && !semTexto.length ? h('p', { class: 'mensagem erro' }, 'Não encontrei holerites neste PDF.') : null,
      linhas.length ? h('section', { class: 'bloco' },
        h('p', null, totalEl, ' · confira antes de lançar. A 2ª via de cada recibo é ignorada.'),
        cnpjsDiferentes ? h('p', { class: 'mensagem aviso' }, 'O CNPJ de algum holerite é diferente do CNPJ cadastrado da empresa escolhida. Na Genial Mix isso é normal (L.G.A, LFD e Pedro); nas outras, confira a empresa.') : null,
        h('div', { class: 'rolagem' }, h('table', { class: 'tabela' },
          h('thead', null, h('tr', null, ['', 'Funcionário', 'Tipo', 'Competência', 'CNPJ', 'Valor líquido', 'Pagar em'].map((t) => h('th', null, t)))),
          h('tbody', null, linhas.map((l) => h('tr', null, h('td', null, l.incluir), h('td', null, l.nome, h('div', { class: 'secundario pequeno' }, 'cód. ' + l.x.codigo)),
            h('td', null, l.tipo), h('td', { class: 'num' }, l.x.competencia.split('-').reverse().join('/')), h('td', { class: 'pequeno num' }, cnpjTexto(l.x.cnpj)),
            h('td', null, l.valor), h('td', null, l.venc)))))),
        h('div', { class: 'acoes', style: { marginTop: '12px' } }, botao), resultado) : null);
    atualizar();
  };

  return [
    h('div', { class: 'acoes' }, h('button', { class: 'discreto', onclick: () => app.navegar('contas') }, '← Voltar para Contas a pagar')),
    h('section', { class: 'bloco' }, h('div', { class: 'grade-campos' },
      h('label', { class: 'campo' }, 'Empresa', empresa),
      h('label', { class: 'campo largo' }, 'Holerites (PDF)', h('span', { class: 'dica' }, 'Pode escolher vários arquivos de uma vez (adiantamento, folha, 13º). Datas e valores podem ser ajustados antes de lançar.'), arquivo))),
    area,
  ];
}
