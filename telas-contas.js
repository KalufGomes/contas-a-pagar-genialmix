/**
 * telas-contas.js — Listas de contas, formulário de lançamento/solicitação
 * e painel de detalhe com as ações do fluxo.
 */
import { api } from './api.js';
import { baixarCsv } from './telas-relatorios.js';
import { app } from './app.js';
import {
  h, limpar, reais, data, dataHora, hojeIso, trilho, statusEl, toast, dialogo, pedirMotivo, comBotao,
  lerArquivo, campoValor, opcoes, FORMAS, ROTULO_STATUS,
} from './ui.js';

// ---------------------------------------------------------------------------
// Linha e lista
// ---------------------------------------------------------------------------

export function linhaConta(c, sel) {
  const linha = h('div', {
    class: 'linha-conta' + (sel ? ' com-selecao' : ' sem-selecao'), role: 'button', tabindex: '0',
    'aria-label': c.rotulo + ', ' + c.fornecedorNome + ', ' + reais(c.valorCentavos) + ', ' + ROTULO_STATUS[c.status],
    onclick: () => abrirDetalhe(c.id),
    onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirDetalhe(c.id); } },
  },
  sel ? h('div', { class: 'sel', onclick: (e) => e.stopPropagation() }, sel) : null,
  h('div', { class: 'quem' },
    h('div', { class: 'forn' }, c.fornecedorNome),
    h('div', { class: 'desc' }, c.descricao),
    h('div', { class: 'etiquetas' },
      h('span', { class: 'etiqueta' }, c.rotulo),
      h('span', { class: 'etiqueta' }, app.nomeEmpresa(c.empresaId)),
      c.urgente && !['PAGO', 'RECUSADO', 'CANCELADO'].includes(c.status) ? h('span', { class: 'etiqueta urgente' }, 'Urgente') : null,
      c.origem === 'RECORRENCIA' ? h('span', { class: 'etiqueta' }, 'Recorrente') : null,
      c.origem === 'ESTORNO' ? h('span', { class: 'etiqueta' }, 'Estorno') : null)),
  h('div', { class: 'venc' + (c.vencida ? ' vencida' : '') }, (c.status === 'PAGO' ? 'Pago em ' + data(c.dataPagamento) : 'Vence ' + data(c.dataVencimento)) + (c.vencida ? ' (vencida)' : '')),
  h('div', { class: 'valor' }, reais(c.valorCentavos)),
  h('div', { class: 'col-status' }, statusEl(c.status), trilho(c.status)));
  return linha;
}

function listaContas(itens, vazio, selecao) {
  if (!itens.length) return h('div', { class: 'bloco vazio' }, vazio);
  return h('div', { class: 'lista' }, itens.map((c) => linhaConta(c, selecao ? selecao(c) : null)));
}

const somar = (itens) => itens.reduce((s, c) => s + c.valorCentavos, 0);

// ---------------------------------------------------------------------------
// Telas de lista
// ---------------------------------------------------------------------------

export async function telaParaFazer({ subtitulo }) {
  const r = await api('contas.listar', { status: ['SOLICITADO', 'PREVISTA', 'DEVOLVIDO'], porPagina: 200 });
  subtitulo(r.total ? r.total + (r.total === 1 ? ' conta precisa' : ' contas precisam') + ' de você: lance as solicitações e previstas, corrija as devolvidas.' : '');
  return listaContas(r.itens, [h('p', null, 'Nada pendente. Novas solicitações dos gerentes aparecem aqui.'),
    h('button', { class: 'primario', onclick: () => app.navegar('lancar') }, 'Nova conta')]);
}

export async function telaAPagar({ subtitulo }) {
  const r = await api('contas.listar', { status: ['AGUARDANDO_APROVACAO', 'APROVADO'], porPagina: 200 });
  subtitulo(r.total ? 'Contas que já subiram no banco, pela data do pagamento. Confirme cada uma quando o valor sair no extrato.' : '');
  if (!r.itens.length) return h('div', { class: 'bloco vazio' }, 'Nenhuma conta no banco esperando confirmação de pagamento.');
  const aprovadas = r.itens.filter((c) => c.status === 'APROVADO');
  const aguardando = r.itens.filter((c) => c.status === 'AGUARDANDO_APROVACAO');
  const secao = (titulo, dica, itens) => (itens.length ? h('section', { class: 'secao-lista' },
    h('h2', null, titulo + ' ', h('span', { class: 'secundario' }, '(' + itens.length + ' · ' + reais(somar(itens)) + ')')),
    h('p', { class: 'secundario pequeno' }, dica), listaContas(itens, '')) : null);
  return [
    secao('Aprovadas pela dona', 'Dê baixa quando cair no extrato.', aprovadas),
    secao('Aguardando a dona aprovar', 'Se ela já aprovou no banco e esqueceu no sistema, dá para dar baixa com justificativa; ela recebe um aviso.', aguardando),
  ];
}

/**
 * Lista com seleção e uma ação em lote (aprovar, marcar como enviada ao banco).
 * Cada conta tem o próprio resultado: as que derem certo andam, as outras ficam.
 */
function listaComLote(itens, { rotuloAcao, corAcao, acaoApi, sucesso }) {
  const marcadas = new Set();
  const total = h('span', { class: 'num' });
  const botao = h('button', { class: 'primario', style: corAcao });
  const barra = h('div', { class: 'barra-lote', hidden: true }, total, botao);
  const caixas = [];
  const todas = h('input', { type: 'checkbox', 'aria-label': 'Selecionar todas' });
  const atualizar = () => {
    const sel = itens.filter((c) => marcadas.has(c.id));
    total.textContent = sel.length + (sel.length === 1 ? ' selecionada · ' : ' selecionadas · ') + reais(somar(sel));
    botao.textContent = rotuloAcao(sel.length);
    barra.hidden = !sel.length;
    todas.checked = sel.length === itens.length;
  };
  todas.onchange = () => {
    itens.forEach((c) => (todas.checked ? marcadas.add(c.id) : marcadas.delete(c.id)));
    caixas.forEach((x) => { x.checked = todas.checked; });
    atualizar();
  };
  botao.onclick = () => comBotao(botao, async () => {
    const lote = itens.filter((c) => marcadas.has(c.id)).map((c) => ({ contaId: c.id, versao: c.versao }));
    try {
      const res = await api(acaoApi, { itens: lote });
      const ok = res.resultados.filter((x) => x.ok).length;
      const falhas = res.resultados.filter((x) => !x.ok);
      toast(sucesso(ok) + (falhas.length ? ' ' + falhas.length + ' não foi(ram): ' + falhas[0].erro.mensagem : ''), { tipo: falhas.length ? 'erro' : '' });
    } catch (e) { toast(e.message, { tipo: 'erro' }); }
    app.recarregar();
  });
  return [
    h('div', { class: 'acoes' }, h('label', { class: 'check' }, todas, 'Selecionar todas (' + itens.length + ' · ' + reais(somar(itens)) + ')')),
    listaContas(itens, '', (c) => {
      const cx = h('input', { type: 'checkbox', 'aria-label': 'Selecionar ' + c.rotulo, onchange: () => { cx.checked ? marcadas.add(c.id) : marcadas.delete(c.id); atualizar(); } });
      caixas.push(cx);
      return cx;
    }),
    barra,
  ];
}

export async function telaParaAprovar({ subtitulo }) {
  const r = await api('contas.listar', { status: ['AGUARDANDO_APROVACAO'], porPagina: 200 });
  subtitulo(r.total ? 'Contas que o financeiro já subiu no banco. Aprove no banco e aqui; se não aprovar no banco, toque na conta e devolva.' : '');
  if (!r.itens.length) return h('div', { class: 'bloco vazio' }, 'Nenhum pagamento aguardando aprovação.');
  return listaComLote(r.itens, {
    rotuloAcao: (n) => 'Aprovar ' + (n === 1 ? 'a selecionada' : 'as ' + n),
    corAcao: { background: 'var(--ouro)', color: 'var(--marinho)', borderColor: 'var(--ouro)' },
    acaoApi: 'contas.aprovarLote',
    sucesso: (n) => n + (n === 1 ? ' conta aprovada. O financeiro foi avisado.' : ' contas aprovadas. O financeiro foi avisado.'),
  });
}

export async function telaMinhas({ subtitulo }) {
  const f = {
    texto: h('input', { type: 'search', placeholder: 'Fornecedor ou descrição' }),
    valor: campoValor(),
    de: h('input', { type: 'date' }), ate: h('input', { type: 'date' }),
  };
  const lista = h('div');
  const carregar = async () => {
    const texto = f.texto.value.trim();
    const r = await api('contas.listar', { porPagina: 200, busca: texto || undefined,
      valorCentavos: f.valor.centavos || undefined, vencimentoDe: f.de.value || undefined, vencimentoAte: f.ate.value || undefined });
    const abertas = r.itens.filter((c) => !['PAGO', 'RECUSADO', 'CANCELADO'].includes(c.status));
    subtitulo(abertas.length ? abertas.length + ' em andamento. Você recebe um aviso quando forem pagas ou recusadas.' : '');
    const filtrando = texto || f.valor.centavos || f.de.value || f.ate.value;
    limpar(lista, listaContas(r.itens, filtrando ? 'Nenhuma solicitação com essa busca.' : 'Você ainda não fez nenhuma solicitação.'));
  };
  let espera;
  [f.texto, f.valor].forEach((el) => el.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(carregar, 400); }));
  [f.de, f.ate].forEach((el) => el.addEventListener('change', carregar));
  await carregar();
  return [
    h('div', { class: 'acoes' }, h('button', { class: 'primario', onclick: () => app.navegar('nova-solicitacao') }, 'Nova solicitação')),
    h('div', { class: 'bloco filtros' },
      h('label', { class: 'campo busca' }, 'Buscar', f.texto),
      h('label', { class: 'campo' }, 'Valor exato (R$)', f.valor),
      h('label', { class: 'campo' }, 'Vencimento de', f.de),
      h('label', { class: 'campo' }, 'até', f.ate)),
    lista,
  ];
}

export async function telaTodas({ subtitulo }) {
  const f = {
    empresa: h('select', null, opcoes(app.cad.empresas.map((e) => [e.id, e.nome]), '', 'Todas')),
    status: h('select', null, opcoes(Object.entries(ROTULO_STATUS), '', 'Todos')),
    de: h('input', { type: 'date' }), ate: h('input', { type: 'date' }),
    fornecedor: h('input', { type: 'search', placeholder: 'Nome do fornecedor' }),
    descricao: h('input', { type: 'search', placeholder: 'Ex.: embalagem, aluguel' }),
    busca: h('input', { type: 'search', placeholder: 'Nº da conta ou do documento' }),
  };
  const resumo = h('div', { class: 'resumo' });
  const lista = h('div');
  const fin = app.tem('FINANCEIRO');
  // Seleção das "Lançadas" para subir para aprovação (só o financeiro)
  const marcadas = new Map();
  const totalSel = h('span', { class: 'num' });
  const botaoSubir = h('button', { class: 'primario', style: { background: 'var(--ouro)', color: 'var(--marinho)', borderColor: 'var(--ouro)' } });
  const barra = h('div', { class: 'barra-lote', hidden: true }, totalSel, botaoSubir);
  const atualizarBarra = () => {
    const sel = [...marcadas.values()];
    totalSel.textContent = sel.length + (sel.length === 1 ? ' selecionada · ' : ' selecionadas · ') + reais(somar(sel));
    botaoSubir.textContent = 'Subir para aprovação (' + sel.length + ')';
    barra.hidden = !sel.length;
  };
  botaoSubir.onclick = () => comBotao(botaoSubir, async () => {
    try {
      const res = await api('contas.enviarBancoLote', { itens: [...marcadas.values()].map((c) => ({ contaId: c.id, versao: c.versao })) });
      const ok = res.resultados.filter((x) => x.ok).length;
      const falhas = res.resultados.filter((x) => !x.ok);
      toast(ok + (ok === 1 ? ' conta enviada para aprovação.' : ' contas enviadas para aprovação.') + ' A dona foi avisada.' + (falhas.length ? ' ' + falhas.length + ' não foi(ram): ' + falhas[0].erro.mensagem : ''), { tipo: falhas.length ? 'erro' : '' });
    } catch (e) { toast(e.message, { tipo: 'erro' }); }
    marcadas.clear(); atualizarBarra();
    await carregar(true);
    app.atualizarContadores();
  });
  const selecao = (c) => {
    if (!fin || c.status !== 'LANCADO') return null;
    const cx = h('input', { type: 'checkbox', checked: marcadas.has(c.id), 'aria-label': 'Selecionar ' + c.rotulo + ' para subir para aprovação',
      onchange: () => { cx.checked ? marcadas.set(c.id, c) : marcadas.delete(c.id); atualizarBarra(); } });
    return cx;
  };
  const faltaSubir = h('button', { class: 'discreto', hidden: true, onclick: () => { f.status.value = 'LANCADO'; carregar(true); } });
  const soVencidas = h('input', { type: 'checkbox', checked: /vencidas=1/.test(location.hash) });
  const mais = h('button', { hidden: true }, 'Carregar mais');
  let pagina = 1; let itens = [];
  const carregar = async (novaBusca) => {
    if (novaBusca) { pagina = 1; itens = []; marcadas.clear(); atualizarBarra(); }
    const r = await api('contas.listar', {
      empresaId: f.empresa.value || undefined, status: f.status.value ? [f.status.value] : [],
      vencimentoDe: f.de.value || undefined, vencimentoAte: f.ate.value || undefined, vencidas: soVencidas.checked || undefined,
      fornecedor: f.fornecedor.value.trim() || undefined, descricao: f.descricao.value.trim() || undefined,
      busca: f.busca.value.trim() || undefined, pagina, porPagina: 50,
    });
    itens = itens.concat(r.itens);
    limpar(resumo, Object.entries(r.resumoPorStatus).map(([st, x]) => h('span', null, statusEl(st), ' ', h('b', null, x.quantidade), ' · ', h('b', null, reais(x.valorCentavos)))));
    limpar(lista, listaContas(itens, 'Nenhuma conta com esses filtros.', fin ? selecao : null));
    if (fin) {
      const n = (r.resumoPorStatus.LANCADO || {}).quantidade || 0;
      faltaSubir.hidden = !n || f.status.value === 'LANCADO';
      faltaSubir.textContent = n + (n === 1 ? ' conta lançada falta subir para aprovação: mostrar só ela' : ' contas lançadas faltam subir para aprovação: mostrar só elas');
    }
    mais.hidden = itens.length >= r.total;
    subtitulo(r.total + (r.total === 1 ? ' conta encontrada' : ' contas encontradas'));
  };
  let espera;
  Object.values(f).forEach((el) => el.addEventListener(el.type === 'search' ? 'input' : 'change', () => {
    clearTimeout(espera); espera = setTimeout(() => carregar(true), el.type === 'search' ? 350 : 0);
  }));
  soVencidas.addEventListener('change', () => carregar(true));
  mais.onclick = () => comBotao(mais, () => { pagina++; return carregar(); });
  const exportar = h('button', { onclick: () => comBotao(exportar, async () => {
    try {
      const r = await api('relatorios.exportarContas', {
        empresaId: f.empresa.value || undefined, status: f.status.value ? [f.status.value] : [],
        vencimentoDe: f.de.value || undefined, vencimentoAte: f.ate.value || undefined,
        fornecedor: f.fornecedor.value.trim() || undefined, descricao: f.descricao.value.trim() || undefined,
      });
      baixarCsv(r.nomeArquivo, r.conteudo);
      toast(r.linhas + (r.linhas === 1 ? ' conta exportada.' : ' contas exportadas.') + ' A exportação fica registrada no histórico.');
    } catch (e) { toast(e.message, { tipo: 'erro' }); }
  }) }, 'Exportar para Excel');
  await carregar(true);
  const recorrentes = h('button', { onclick: () => app.navegar('recorrentes') }, 'Gerenciar recorrentes');
  return [
    h('div', { class: 'acoes' },
      fin ? h('button', { class: 'primario', onclick: () => app.navegar('lancar') }, '+ Nova conta') : null,
      recorrentes,
      fin ? h('button', { onclick: () => app.navegar('importar') }, 'Importar do Arius') : null,
      fin ? h('span', { class: 'secundario pequeno' }, 'Para subir para aprovação: marque as contas "Lançadas" na lista.') : null),
    h('div', { class: 'bloco filtros' },
      h('label', { class: 'campo' }, 'Fornecedor', f.fornecedor),
      h('label', { class: 'campo' }, 'Descrição', f.descricao),
      h('label', { class: 'campo' }, 'Nº ou documento', f.busca),
      h('label', { class: 'campo' }, 'Empresa', f.empresa),
      h('label', { class: 'campo' }, 'Status', f.status),
      h('label', { class: 'campo' }, 'Vencimento de', f.de),
      h('label', { class: 'campo' }, 'até', f.ate),
      h('label', { class: 'check' }, soVencidas, 'Só vencidas'),
      h('div', { class: 'acoes', style: { alignSelf: 'end' } }, exportar)),
    resumo, faltaSubir, lista, h('div', { class: 'acoes' }, mais), barra,
  ];
}

// ---------------------------------------------------------------------------
// Formulário de lançamento / solicitação
// ---------------------------------------------------------------------------

/** Lista de categorias agrupada por grupo da DRE, só com as que a empresa usa. */
export function opcoesCategorias(empresaId, selecionada, natureza = 'DESPESA') {
  const lista = app.categoriasDaEmpresa(empresaId, natureza);
  const out = [h('option', { value: '' }, 'Escolha')];
  (app.cad.grupos || []).filter((g) => g.natureza === natureza).forEach((g) => {
    const doGrupo = lista.filter((c) => c.grupo === g.chave);
    if (!doGrupo.length) return;
    out.push(h('optgroup', { label: doGrupo[0].codigo.split('.')[0] + '. ' + g.nome },
      doGrupo.map((c) => h('option', { value: c.id, selected: c.id === selecionada }, c.codigo + ' ' + c.nome))));
  });
  return out;
}
function selectCategorias(selecionada, empresaId, natureza = 'DESPESA') {
  return h('select', null, opcoesCategorias(empresaId, selecionada, natureza));
}

function selectContasBancarias(empresaId, selecionada) {
  return opcoes(app.cad.contasBancarias.filter((c) => c.empresaId === empresaId && c.ativo).map((c) => [c.id, c.apelido + ' · ' + c.banco + ' final ' + c.contaFinal]), selecionada, 'Escolha');
}

async function listaFornecedores() {
  try { return await api('fornecedores.listar', {}); } catch (e) { return []; }
}

export const telaNovaSolicitacao = (ctx) => formularioConta('solicitar', ctx);
export const telaLancar = (ctx) => formularioConta('lancar', ctx);

async function formularioConta(modo, { subtitulo }) {
  const lancar = modo === 'lancar';
  subtitulo(lancar ? 'A conta fica "Lançada". Depois de agendar no banco, marque-a em Contas a pagar e clique em "Subir para aprovação".' : 'O financeiro recebe um aviso assim que você enviar.');
  const empresas = app.cad.empresas.filter((e) => e.ativo);
  const fornecedores = await listaFornecedores();
  const idLista = 'fornecedores-' + modo;

  const f = {
    empresa: h('select', { required: true }, opcoes(empresas.map((e) => [e.id, e.nome]), empresas.length === 1 ? empresas[0].id : '', empresas.length === 1 ? undefined : 'Escolha')),
    fornecedor: h('input', { required: true, maxlength: 120, list: idLista, autocomplete: 'off' }),
    descricao: h('input', { required: true, maxlength: 300 }),
    valor: campoValor({ required: true }),
    vencimento: h('input', { type: 'date', required: true }),
    documento: h('input', { maxlength: 60 }),
    emissao: h('input', { type: 'date' }),
    categoria: selectCategorias('', empresas.length === 1 ? empresas[0].id : ''),
    forma: h('select', null, opcoes(Object.entries(FORMAS), '', lancar ? 'Escolha' : 'Não sei')),
    contaBancaria: h('select'),
    centroCusto: h('input', { maxlength: 60 }),
    urgente: h('input', { type: 'checkbox' }),
    observacoes: h('textarea', { maxlength: 500 }),
    arquivo: h('input', { type: 'file', accept: 'application/pdf,image/jpeg,image/png' }),
    tipoArquivo: h('select', null, opcoes([['BOLETO', 'Boleto'], ['NOTA_FISCAL', 'Nota fiscal'], ['OUTRO', 'Outro documento']], 'BOLETO')),
  };
  // Fornecedor cadastrado com categoria de costume: já sugere a categoria (se a empresa usa).
  f.fornecedor.addEventListener('change', () => {
    if (!lancar || f.categoria.value) return;
    const forn = fornecedores.find((x) => x.nome.toLowerCase() === f.fornecedor.value.trim().toLowerCase());
    if (!forn || !forn.categoriaCodigo) return;
    const cat = app.categoriasDaEmpresa(f.empresa.value, 'DESPESA').find((c) => c.codigo === forn.categoriaCodigo);
    if (cat) f.categoria.value = cat.id;
  });
  const atualizarContas = () => {
    limpar(f.contaBancaria, selectContasBancarias(f.empresa.value, ''));
    const atual = f.categoria.value;
    limpar(f.categoria, opcoesCategorias(f.empresa.value, atual));
  };
  f.empresa.addEventListener('change', atualizarContas);
  atualizarContas();

  // Tipo: único, parcelado ou recorrente
  const tipos = [['unico', 'Pagamento único'], ['parcelado', 'Parcelado']].concat(lancar ? [['recorrente', 'Repete todo mês/semana']] : []);
  let tipo = 'unico';
  const radios = h('div', { class: 'acoes', role: 'radiogroup', 'aria-label': 'Tipo de conta' }, tipos.map(([v, r]) =>
    h('label', { class: 'check' }, h('input', { type: 'radio', name: 'tipo-' + modo, value: v, checked: v === 'unico', onchange: () => { tipo = v; mostrarTipo(); } }), r)));

  // Parcelas
  const qtdParcelas = h('input', { type: 'number', min: 2, max: 60, value: '2', style: { maxWidth: '110px' } });
  const tabelaParcelas = h('div');
  let parcelas = [];
  const somaParcelas = h('p', { class: 'pequeno' });
  const conferirSoma = () => {
    const soma = parcelas.reduce((s, p) => s + (p.valor.centavos || 0), 0);
    const total = f.valor.centavos || 0;
    somaParcelas.textContent = 'Soma das parcelas: ' + reais(soma) + (soma === total ? ' (confere com o total)' : ' — diferente do total de ' + reais(total));
    somaParcelas.className = 'pequeno ' + (soma === total ? 'secundario' : 'mensagem erro');
  };
  const calcular = h('button', { type: 'button', onclick: async () => {
    if (!f.valor.centavos || !f.vencimento.value) { toast('Preencha o valor total e o primeiro vencimento antes.', { tipo: 'erro' }); return; }
    await comBotao(calcular, async () => {
      const sug = await api('contas.sugerirParcelas', { valorCentavos: f.valor.centavos, parcelas: Number(qtdParcelas.value), primeiroVencimento: f.vencimento.value });
      parcelas = sug.map((p) => ({ data: h('input', { type: 'date', value: p.dataVencimento }), valor: campoValor() }));
      sug.forEach((p, i) => { parcelas[i].valor.centavos = p.valorCentavos; parcelas[i].valor.addEventListener('input', conferirSoma); });
      limpar(tabelaParcelas, h('div', { class: 'rolagem' }, h('table', { class: 'tabela' },
        h('thead', null, h('tr', null, h('th', null, 'Parcela'), h('th', null, 'Vencimento'), h('th', { class: 'direita' }, 'Valor (R$)'))),
        h('tbody', null, parcelas.map((p, i) => h('tr', null, h('td', null, (i + 1) + '/' + parcelas.length), h('td', null, p.data), h('td', null, p.valor)))))), somaParcelas);
      conferirSoma();
    });
  } }, 'Calcular parcelas');
  const blocoParcelas = h('div', { class: 'grade-campos largo', hidden: true },
    h('div', { class: 'largo acoes' }, h('label', { class: 'campo' }, 'Número de parcelas', qtdParcelas), calcular,
      h('p', { class: 'secundario pequeno' }, 'Valores iguais, um por mês a partir do vencimento informado. Ajuste datas e valores se precisar.')),
    h('div', { class: 'largo' }, tabelaParcelas));

  // Recorrência
  const rec = {
    periodicidade: h('select', null, opcoes([['MENSAL', 'Mensal'], ['QUINZENAL', 'Quinzenal (a cada 15 dias)'], ['SEMANAL', 'Semanal'], ['ANUAL', 'Anual']], 'MENSAL')),
    valorTipo: h('select', null, opcoes([['FIXO', 'Fixo (sempre o mesmo)'], ['ESTIMADO', 'Estimado (muda todo mês, ex.: energia)']], 'FIXO')),
    termino: h('input', { type: 'date' }),
  };
  const blocoRecorrente = h('div', { class: 'grade-campos largo', hidden: true },
    h('label', { class: 'campo' }, 'Repete', rec.periodicidade),
    h('label', { class: 'campo' }, 'Valor', rec.valorTipo),
    h('label', { class: 'campo' }, 'Termina em', h('span', { class: 'dica' }, 'Deixe vazio se não tem fim.'), rec.termino),
    h('p', { class: 'largo secundario pequeno' }, 'O vencimento informado acima é o primeiro. Cada conta é criada 10 dias antes como "Prevista"; você confere o valor e lança.'));

  const mostrarTipo = () => { blocoParcelas.hidden = tipo !== 'parcelado'; blocoRecorrente.hidden = tipo !== 'recorrente'; };

  const erro = h('p', { class: 'mensagem erro', hidden: true });
  const enviar = h('button', { class: 'primario', type: 'submit' }, lancar ? 'Lançar conta' : 'Enviar solicitação');

  const montarDados = () => {
    const d = {
      empresaId: f.empresa.value, fornecedorNome: f.fornecedor.value.trim(), descricao: f.descricao.value.trim(),
      valorCentavos: f.valor.centavos, dataVencimento: f.vencimento.value,
      documentoNumero: f.documento.value.trim() || undefined, observacoes: f.observacoes.value.trim() || undefined,
      formaPagamento: f.forma.value || undefined,
    };
    const forn = fornecedores.find((x) => x.nome.toLowerCase() === d.fornecedorNome.toLowerCase());
    if (forn) d.fornecedorId = forn.id;
    if (lancar) Object.assign(d, { categoriaId: f.categoria.value || undefined, contaBancariaId: f.contaBancaria.value || undefined,
      dataEmissao: f.emissao.value || undefined, centroCusto: f.centroCusto.value.trim() || undefined });
    d.urgente = f.urgente.checked;
    if (tipo === 'parcelado') {
      if (!parcelas.length) throw new Error('Clique em "Calcular parcelas" e confira as datas e valores.');
      d.parcelas = parcelas.map((p) => ({ dataVencimento: p.data.value, valorCentavos: p.valor.centavos }));
    }
    if (d.valorCentavos === null) throw new Error('Valor inválido. Use o formato 1.234,56.');
    return d;
  };

  async function enviarDados(dados, confirmarDuplicidade) {
    if (tipo === 'recorrente') {
      return { recorrente: await api('recorrencias.salvar', Object.assign({}, dados, { primeiroVencimento: dados.dataVencimento,
        periodicidade: rec.periodicidade.value, valorTipo: rec.valorTipo.value, termino: rec.termino.value || undefined })) };
    }
    return await api(lancar ? 'contas.lancar' : 'contas.solicitar', Object.assign({}, dados, confirmarDuplicidade ? { confirmarDuplicidade: true } : {}));
  }

  const voltar = lancar ? h('div', { class: 'acoes' }, h('button', { type: 'button', class: 'discreto', onclick: () => app.navegar('contas') }, '← Voltar para Contas a pagar')) : null;
  const form = h('form', { class: 'bloco', onsubmit: async (e) => {
    e.preventDefault();
    erro.hidden = true;
    await comBotao(enviar, async () => {
      let dados;
      try { dados = montarDados(); } catch (err) { erro.textContent = err.message; erro.hidden = false; return; }
      let r;
      try {
        r = await enviarDados(dados, false);
      } catch (err) {
        if (err.codigo !== 'DUPLICIDADE_POSSIVEL') { erro.textContent = err.message; erro.hidden = false; return; }
        const seguir = await dialogo((fechar) => [h('h2', null, 'Conta parecida já existe'), h('p', null, err.message),
          h('div', { class: 'acoes fim' }, h('button', { onclick: () => fechar(false) }, 'Voltar e conferir'),
            h('button', { class: 'primario', onclick: () => fechar(true) }, lancar ? 'Lançar mesmo assim' : 'Enviar mesmo assim'))]);
        if (!seguir) return;
        try { r = await enviarDados(dados, true); } catch (err2) { erro.textContent = err2.message; erro.hidden = false; return; }
      }
      if (r.recorrente) {
        toast('Conta recorrente criada.' + (r.recorrente.contasGeradas ? ' A primeira já está em "Para fazer".' : ' A primeira aparece 10 dias antes do vencimento.'));
      } else {
        const primeira = r.contas[0];
        if (f.arquivo.files[0]) {
          try {
            const arq = await lerArquivo(f.arquivo.files[0]);
            await api('anexos.enviar', { contaId: primeira.id, tipo: f.tipoArquivo.value, nomeArquivo: arq.nomeArquivo, mime: arq.mime, conteudoBase64: arq.conteudoBase64 });
          } catch (e2) { toast('A conta foi criada, mas o anexo não foi enviado: ' + e2.message + ' Anexe pelo detalhe da conta.', { tipo: 'erro', duracao: 12000 }); }
        }
        toast((lancar ? 'Conta ' : 'Solicitação ') + primeira.rotulo.replace(/-1\/\d+$/, '') + (r.contas.length > 1 ? ' (' + r.contas.length + ' parcelas)' : '') + (lancar ? ' lançada.' : ' enviada.'),
          { acao: { rotulo: 'Ver', fn: () => abrirDetalhe(primeira.id) } });
      }
      app.recarregar();
    });
  } },
  h('div', { class: 'grade-campos' },
    empresas.length > 1 ? h('label', { class: 'campo' }, 'Empresa', f.empresa) : h('div', { class: 'campo' }, h('span', null, 'Empresa'), h('b', null, empresas[0] ? empresas[0].nome : '')),
    h('label', { class: 'campo' }, 'Fornecedor', f.fornecedor, h('datalist', { id: idLista }, fornecedores.map((x) => h('option', { value: x.nome })))),
    h('label', { class: 'campo largo' }, 'Descrição', h('span', { class: 'dica' }, 'Ex.: compra de embalagens, conserto da câmara fria.'), f.descricao),
    h('label', { class: 'campo' }, 'Valor total (R$)', f.valor),
    h('label', { class: 'campo' }, 'Vencimento', h('span', { class: 'dica' }, 'O primeiro, se for parcelado ou recorrente.'), f.vencimento),
    h('label', { class: 'campo' }, 'Nº da nota ou do boleto', h('span', { class: 'dica' }, 'Opcional'), f.documento),
    lancar ? h('label', { class: 'campo' }, 'Emissão', h('span', { class: 'dica' }, 'Opcional'), f.emissao) : null,
    lancar ? h('label', { class: 'campo' }, 'Categoria', f.categoria) : null,
    h('label', { class: 'campo' }, 'Forma de pagamento', f.forma),
    lancar ? h('label', { class: 'campo' }, 'Pagar pela conta', f.contaBancaria) : null,
    lancar ? h('label', { class: 'campo' }, 'Centro de custo', h('span', { class: 'dica' }, 'Opcional'), f.centroCusto) : null,
    h('div', { class: 'campo largo' }, h('span', null, 'Tipo'), radios),
    blocoParcelas, blocoRecorrente,
    h('label', { class: 'campo largo' }, 'Observações', h('span', { class: 'dica' }, 'Opcional. Ex.: fornecedor pediu pagamento até 15h.'), f.observacoes),
    h('div', { class: 'largo grade-campos' },
      h('label', { class: 'campo' }, 'Anexar boleto ou nota', h('span', { class: 'dica' }, 'PDF ou foto, até 5 MB.'), f.arquivo),
      h('label', { class: 'campo' }, 'Tipo do anexo', f.tipoArquivo)),
    h('label', { class: 'check largo' }, f.urgente, h('span', null, h('b', null, 'Urgente'), lancar
      ? ' — a dona recebe aviso destacado quando subir para aprovação, e de novo a cada hora (até 19h) enquanto não aprovar.'
      : ' — precisa ser pago hoje. O financeiro recebe um alerta destacado.'))),
  erro,
  h('div', { class: 'acoes fim', style: { marginTop: '16px' } }, enviar));
  return voltar ? [voltar, form] : form;
}

// ---------------------------------------------------------------------------
// Painel de detalhe
// ---------------------------------------------------------------------------

const NOME_ACAO = {
  lancar: 'Lançar conta', recusar: 'Recusar', cancelar: 'Cancelar conta', reenviar: 'Corrigir (volta para "Subir no banco")',
  enviarBanco: 'Subir para aprovação', tirarDoBanco: 'Tirar da aprovação',
  aprovar: 'Aprovar', devolver: 'Devolver ao financeiro', confirmarPagamento: 'Confirmar pagamento',
};
const NOME_EVENTO = {
  CONTA_CRIADA: 'Conta criada', CONTA_LANCAR: 'Lançada', CONTA_ENVIAR_BANCO: 'Subiu para aprovação (agendada no banco)',
  CONTA_TIRAR_DO_BANCO: 'Tirada da aprovação', CONTA_APROVAR: 'Aprovada', CONTA_DEVOLVER: 'Devolvida ao financeiro',
  CONTA_REENVIAR: 'Corrigida após devolução', CONTA_RECUSAR: 'Recusada', CONTA_CANCELAR: 'Cancelada', CONTA_CONFIRMAR_PAGAMENTO: 'Pagamento conferido no extrato',
  CONTA_EDITADA: 'Dados alterados', CONTA_COMENTADA: 'Comentário', ANEXO_ENVIADO: 'Anexo enviado', ANEXO_BAIXADO: 'Anexo aberto',
};
const NOME_CAMPO = {
  empresa_id: 'Empresa', fornecedor_nome: 'Fornecedor', descricao: 'Descrição', categoria_id: 'Categoria', centro_custo: 'Centro de custo',
  documento_numero: 'Documento', valor_centavos: 'Valor', data_emissao: 'Emissão', data_vencimento: 'Vencimento', forma_pagamento: 'Forma de pagamento',
  conta_bancaria_id: 'Conta bancária', urgente: 'Urgente', observacoes: 'Observações', data_pagamento: 'Pagamento', data_compensacao: 'Compensação',
  referencia_bancaria: 'Referência bancária',
};

function valorCampo(campo, v) {
  if (v === '' || v === null || v === undefined) return '—';
  if (campo === 'valor_centavos') return reais(v);
  if (/^data_/.test(campo)) return data(v);
  if (campo === 'empresa_id') return app.nomeEmpresa(v) || v;
  if (campo === 'categoria_id') { const c = app.categoria(v); return c ? c.codigo + ' ' + c.nome : v; }
  if (campo === 'conta_bancaria_id') { const c = app.contaBancaria(v); return c ? c.apelido : v; }
  if (campo === 'forma_pagamento') return FORMAS[v] || v;
  if (campo === 'urgente') return v === true || v === 'true' ? 'Sim' : 'Não';
  return String(v);
}

let painelAtual = null;
function fecharPainel() {
  if (!painelAtual) return;
  painelAtual.fundo.remove(); painelAtual.painel.remove();
  document.removeEventListener('keydown', painelAtual.esc);
  if (painelAtual.foco && painelAtual.foco.focus) painelAtual.foco.focus();
  painelAtual = null;
}

export async function abrirDetalhe(contaId) {
  fecharPainel();
  const corpo = h('div', { class: 'painel-corpo' }, h('div', { class: 'vazio' }, 'Carregando…'));
  const topo = h('div', { class: 'painel-topo' });
  const painel = h('aside', { class: 'painel', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Detalhe da conta' }, topo, corpo);
  const fundo = h('div', { class: 'fundo-painel', onclick: fecharPainel });
  const esc = (e) => { if (e.key === 'Escape') fecharPainel(); };
  painelAtual = { painel, fundo, esc, foco: document.activeElement };
  document.addEventListener('keydown', esc);
  document.body.append(fundo, painel);
  let d;
  try { d = await api('contas.detalhe', { contaId }); } catch (e) {
    limpar(corpo, h('div', { class: 'vazio' }, e.message, h('button', { onclick: fecharPainel }, 'Fechar')));
    return;
  }
  desenharDetalhe(d, topo, corpo);
  const fechar = topo.querySelector('.fechar');
  if (fechar) fechar.focus();
}

function desenharDetalhe(d, topo, corpo) {
  const c = d.conta;
  const recarregar = async () => { const nd = await api('contas.detalhe', { contaId: c.id }); desenharDetalhe(nd, topo, corpo); app.recarregar(); };

  limpar(topo,
    h('div', { class: 'linha1' },
      h('div', null,
        h('div', { class: 'secundario pequeno' }, c.rotulo + ' · ' + app.nomeEmpresa(c.empresaId) + (c.parcelaTotal ? ' · parcela ' + c.parcelaNumero + ' de ' + c.parcelaTotal : '')),
        h('h2', null, c.fornecedorNome)),
      h('button', { class: 'fechar', 'aria-label': 'Fechar', onclick: fecharPainel }, '×')),
    h('div', { class: 'valor-grande' }, reais(c.valorCentavos)),
    h('div', { class: 'acoes', style: { justifyContent: 'space-between' } },
      statusEl(c.status),
      h('span', { class: 'venc' + (c.vencida ? ' vencida' : '') }, 'Vencimento ' + data(c.dataVencimento) + (c.vencida ? ' (vencida)' : ''))),
    trilho(c.status, true));

  const areaAcao = h('div');
  const botoesAcao = d.acoesPossiveis.map((a) => h('button', {
    class: ['aprovar', 'lancar', 'reenviar', 'enviarBanco'].includes(a.acao) ? 'primario' : a.acao === 'confirmarPagamento' ? 'primario sucesso' : (['recusar', 'cancelar', 'devolver'].includes(a.acao) ? 'perigo' : ''),
    onclick: (e) => executarAcao(a, c, e.currentTarget, areaAcao, recarregar),
  }, NOME_ACAO[a.acao] || a.acao));

  const final = ['PAGO', 'RECUSADO', 'CANCELADO'].includes(c.status);
  const podeEditar = !final && (app.tem('FINANCEIRO') || (c.status === 'SOLICITADO' && app.tem('GERENTE')));
  if (podeEditar) botoesAcao.push(h('button', { class: 'discreto', onclick: () => formEditar(c, areaAcao, recarregar) }, 'Editar dados'));
  if (c.status === 'PAGO' && c.origem !== 'ESTORNO' && app.tem('FINANCEIRO')) {
    botoesAcao.push(h('button', { class: 'discreto', onclick: () => formEstorno(c, recarregar) }, 'Registrar estorno'));
  }

  const ultimaDevolucao = [...d.historico].reverse().find((x) => ['CONTA_DEVOLVER', 'CONTA_RECUSAR', 'CONTA_CANCELAR'].includes(x.acao));
  const cb = app.contaBancaria(c.contaBancariaId);
  const cat = app.categoria(c.categoriaId);
  const linhasDados = [
    ['Descrição', c.descricao], ['Documento', c.documentoNumero], ['Categoria', cat ? cat.codigo + ' ' + cat.nome : ''],
    ['Forma de pagamento', FORMAS[c.formaPagamento] || ''], ['Pagar pela conta', cb ? cb.apelido + ' · ' + cb.banco + ' final ' + cb.contaFinal : ''],
    ['Centro de custo', c.centroCusto], ['Emissão', data(c.dataEmissao)], ['Pagamento', data(c.dataPagamento)],
    ['Compensação conferida', data(c.dataCompensacao)], ['Referência bancária', c.referenciaBancaria], ['Observações', c.observacoes],
    ['Solicitado por', c.solicitadoPor ? c.solicitadoPor + ' em ' + dataHora(c.solicitadoEm) : ''],
    ['Lançado por', c.lancadoPor ? c.lancadoPor + ' em ' + dataHora(c.lancadoEm) : ''],
    ['Aprovado por', c.aprovadoPor ? c.aprovadoPor + ' em ' + dataHora(c.aprovadoEm) : ''],
    ['Pagamento confirmado por', c.pagoPor ? c.pagoPor + ' em ' + dataHora(c.pagoEm) : ''],
    ['Encerrado por', c.encerradoPor ? c.encerradoPor + ' em ' + dataHora(c.encerradoEm) : ''],
  ].filter(([, v]) => v);

  const comprovante = c.status === 'PAGO' ? d.anexos.filter((a) => a.tipo === 'COMPROVANTE').pop() : null;
  limpar(corpo,
    comprovante ? h('div', { class: 'comprovante-destaque' },
      h('div', null, h('b', null, 'Pago em ' + data(c.dataPagamento)), h('div', { class: 'secundario pequeno' }, 'Comprovante enviado pelo financeiro.')),
      h('button', { class: 'primario sucesso', onclick: (e) => abrirAnexo(comprovante.id, e.currentTarget) }, 'Ver comprovante')) : null,
    ultimaDevolucao && ['DEVOLVIDO', 'RECUSADO', 'CANCELADO'].includes(c.status) && ultimaDevolucao.justificativa
      ? h('p', { class: 'mensagem ' + (c.status === 'DEVOLVIDO' ? 'aviso' : 'erro') }, (NOME_EVENTO[ultimaDevolucao.acao] || '') + ' por ' + ultimaDevolucao.usuario + ': ' + ultimaDevolucao.justificativa)
      : null,
    botoesAcao.length ? h('div', { class: 'acoes' }, botoesAcao) : null,
    areaAcao,
    h('section', { class: 'bloco' }, h('h3', null, 'Dados'), h('dl', { class: 'dados' }, linhasDados.map(([k, v]) => [h('dt', null, k), h('dd', null, v)]))),
    d.parcelas.length ? blocoParcelas(d, c, recarregar) : null,
    d.estornos.length ? h('section', { class: 'bloco' }, h('h3', null, 'Estornos'), d.estornos.map((x) => h('div', { class: 'anexo' }, h('span', null, x.rotulo + ' em ' + data(x.data)), h('b', { class: 'num' }, reais(x.valorCentavos))))) : null,
    blocoAnexos(d, c, final, recarregar),
    blocoComentarios(d, c, recarregar),
    h('section', { class: 'bloco' }, h('h3', null, 'Histórico'), h('ol', { class: 'historico' }, d.historico.map(eventoHistorico))));
}

function eventoHistorico(ev) {
  const mudancas = ev.acao === 'CONTA_EDITADA' || ev.acao === 'CONTA_LANCAR' || ev.acao === 'CONTA_REENVIAR'
    ? Object.entries(ev.detalhes || {}).filter(([k]) => NOME_CAMPO[k] && !/_por$|_em$/.test(k)).map(([k, v]) =>
      h('div', { class: 'pequeno' }, NOME_CAMPO[k] + ': ' + valorCampo(k, v.de) + ' → ' + valorCampo(k, v.para)))
    : [];
  return h('li', null, h('div', null,
    h('div', null, h('b', null, NOME_EVENTO[ev.acao] || ev.acao), ' · ', ev.usuario),
    h('div', { class: 'quando' }, dataHora(ev.dataHora)),
    ev.acao === 'CONTA_CRIADA' ? null : mudancas,
    ev.justificativa ? h('div', { class: 'motivo' }, ev.justificativa) : null));
}

function blocoParcelas(d, c, recarregar) {
  const cancelar = app.tem('FINANCEIRO') && d.parcelas.some((p) => !['PAGO', 'CANCELADO', 'RECUSADO'].includes(p.status))
    ? h('button', { class: 'perigo', onclick: async (e) => {
      const motivo = await pedirMotivo('Cancelar a compra parcelada', 'Cancelar parcelas não pagas', true);
      if (!motivo) return;
      await comBotao(e.target, async () => {
        const r = await api('contas.cancelarParcelamento', { parcelamentoId: c.parcelamentoId, motivo });
        toast(r.canceladas + ' parcela(s) cancelada(s). ' + (r.mantidas ? r.mantidas + ' já encerrada(s) mantida(s).' : ''));
        recarregar();
      });
    } }, 'Cancelar parcelas não pagas') : null;
  return h('section', { class: 'bloco' }, h('h3', null, 'Parcelas desta compra'),
    h('table', { class: 'tabela' }, h('tbody', null, d.parcelas.map((p) => h('tr', { style: p.id === c.id ? { background: 'var(--ouro-claro)' } : null },
      h('td', null, h('a', { href: '#', onclick: (e) => { e.preventDefault(); abrirDetalhe(p.id); } }, p.rotulo)),
      h('td', null, data(p.dataVencimento)), h('td', null, statusEl(p.status)), h('td', { class: 'direita num' }, reais(p.valorCentavos)))))),
    cancelar ? h('div', { class: 'acoes', style: { marginTop: '12px' } }, cancelar) : null);
}

function blocoAnexos(d, c, final, recarregar) {
  const podeAnexar = !['CANCELADO', 'RECUSADO'].includes(c.status) && (app.tem('FINANCEIRO') || (c.status === 'SOLICITADO' && app.tem('GERENTE')));
  const enviarArquivo = async (arquivoEl, tipo, botao, sucesso) => comBotao(botao, async () => {
    if (!arquivoEl.files[0]) { toast('Escolha um arquivo.', { tipo: 'erro' }); return; }
    try {
      const a = await lerArquivo(arquivoEl.files[0]);
      await api('anexos.enviar', { contaId: c.id, tipo, nomeArquivo: a.nomeArquivo, mime: a.mime, conteudoBase64: a.conteudoBase64 });
      toast(sucesso);
      recarregar();
    } catch (e) { toast(e.message, { tipo: 'erro', duracao: 12000 }); }
  });
  // O comprovante entra na confirmação do pagamento. Se a baixa foi dada sem ele, aparece só este botão.
  const temComprovante = d.anexos.some((a) => a.tipo === 'COMPROVANTE');
  let comprovanteDepois = null;
  if (c.status === 'PAGO' && !temComprovante && app.tem('FINANCEIRO')) {
    const arq = h('input', { type: 'file', accept: 'application/pdf,image/jpeg,image/png' });
    const b = h('button', { class: 'primario sucesso' }, 'Anexar comprovante');
    b.onclick = () => enviarArquivo(arq, 'COMPROVANTE', b, 'Comprovante anexado.' + (c.solicitadoPor ? ' ' + c.solicitadoPor + ' foi avisado(a).' : ''));
    comprovanteDepois = h('div', { class: 'comprovante-destaque' }, h('div', null, h('b', null, 'Pago sem comprovante'),
      h('div', { class: 'secundario pequeno' }, 'Anexe aqui; quem pediu o pagamento recebe um aviso.')), h('div', { class: 'envio-anexo' }, arq, b));
  }
  const arquivo = h('input', { type: 'file', accept: 'application/pdf,image/jpeg,image/png' });
  const tipo = h('select', null, opcoes([['BOLETO', 'Boleto'], ['NOTA_FISCAL', 'Nota fiscal'], ['OUTRO', 'Outro']], 'BOLETO'));
  const enviar = h('button', null, 'Enviar anexo');
  enviar.onclick = () => enviarArquivo(arquivo, tipo.value, enviar, 'Anexo enviado.');
  const TIPO = { BOLETO: 'Boleto', NOTA_FISCAL: 'Nota fiscal', COMPROVANTE: 'Comprovante de pagamento', OUTRO: 'Outro' };
  return h('section', { class: 'bloco' }, h('h3', null, 'Anexos'),
    comprovanteDepois,
    d.anexos.length ? h('div', null, d.anexos.map((a) => h('div', { class: 'anexo' },
      h('div', null, h('div', null, TIPO[a.tipo] + ' · ' + a.nomeArquivo), h('div', { class: 'secundario pequeno' }, a.enviadoPor + ', ' + dataHora(a.enviadoEm))),
      h('button', { class: 'discreto', onclick: (e) => abrirAnexo(a.id, e.currentTarget) }, 'Abrir')))) : h('p', { class: 'secundario pequeno' }, 'Nenhum anexo.'),
    podeAnexar && c.status !== 'PAGO' ? h('div', null, h('p', { class: 'secundario pequeno', style: { margin: '10px 0 6px' } }, 'Boleto, nota ou outro documento. O comprovante de pagamento vai na hora de confirmar o pagamento.'),
      h('div', { class: 'envio-anexo' }, arquivo, tipo, enviar)) : null);
}

async function abrirAnexo(id, botao) {
  await comBotao(botao, async () => {
    try {
      const a = await api('anexos.baixar', { anexoId: id });
      const bytes = Uint8Array.from(atob(a.conteudoBase64), (ch) => ch.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: a.mime }));
      const link = h('a', { href: url, download: a.nomeArquivo, target: '_blank', rel: 'noopener' });
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { toast(e.message, { tipo: 'erro' }); }
  });
}

function blocoComentarios(d, c, recarregar) {
  const texto = h('textarea', { maxlength: 1000, placeholder: 'Escreva para quem acompanha esta conta' });
  const enviar = h('button', { onclick: () => comBotao(enviar, async () => {
    if (!texto.value.trim()) return;
    await api('contas.comentar', { contaId: c.id, texto: texto.value.trim() });
    recarregar();
  }) }, 'Comentar');
  return h('section', { class: 'bloco' }, h('h3', null, 'Comentários'),
    d.comentarios.length ? h('div', null, d.comentarios.map((m) => h('div', { class: 'comentario' },
      h('div', null, h('b', null, m.usuario), h('span', { class: 'secundario pequeno' }, ' · ' + dataHora(m.criadoEm))), h('div', null, m.texto)))) : null,
    h('div', { class: 'grade-campos', style: { marginTop: '10px' } }, h('label', { class: 'campo largo' }, texto), h('div', { class: 'acoes' }, enviar)));
}

// ---------------------------------------------------------------------------
// Ações
// ---------------------------------------------------------------------------

async function transicionar(c, acao, extra) {
  return await api('contas.transicionar', Object.assign({ contaId: c.id, versao: c.versao, acao }, extra || {}));
}

async function executarAcao(a, c, botao, area, recarregar) {
  const tratar = async (fn, sucesso) => {
    try { await fn(); toast(sucesso); await recarregar(); } catch (e) {
      toast(e.message, { tipo: 'erro', duracao: 9000 });
      if (e.codigo === 'CONFLITO') recarregar();
    }
  };
  if (a.acao === 'confirmarPagamento') return formPagamento(c, area, tratar, a.motivoObrigatorio);
  if (a.motivoObrigatorio) {
    const titulos = { recusar: 'Recusar a solicitação', cancelar: 'Cancelar a conta', devolver: 'Devolver ao financeiro (não aprovada no banco)', tirarDoBanco: 'Tirar da aprovação (volta para "Lançada")' };
    const motivo = await pedirMotivo(titulos[a.acao] || NOME_ACAO[a.acao], NOME_ACAO[a.acao], true);
    if (!motivo) return;
    return comBotao(botao, () => tratar(() => transicionar(c, a.acao, { motivo }), { recusar: 'Solicitação recusada.', cancelar: 'Conta cancelada.', devolver: 'Conta devolvida. O financeiro foi avisado.', tirarDoBanco: 'Conta voltou para "Lançada".' }[a.acao]));
  }
  if (a.acao === 'aprovar') return comBotao(botao, () => tratar(() => transicionar(c, 'aprovar'), 'Conta aprovada. O financeiro foi avisado.'));
  if (a.acao === 'enviarBanco') return comBotao(botao, () => tratar(() => transicionar(c, 'enviarBanco'), 'Enviada para aprovação. A dona foi avisada.'));
  if (a.acao === 'lancar' || a.acao === 'reenviar') return formLancar(c, a.acao, area, tratar);
}

function formLancar(c, acao, area, tratar) {
  const cat = selectCategorias(c.categoriaId, c.empresaId);
  const forma = h('select', null, opcoes(Object.entries(FORMAS), c.formaPagamento, 'Escolha'));
  const conta = h('select', null, selectContasBancarias(c.empresaId, c.contaBancariaId));
  const valor = campoValor(); valor.centavos = c.valorCentavos;
  const venc = h('input', { type: 'date', value: c.dataVencimento });
  const motivo = h('textarea', { maxlength: 500 });
  const botao = h('button', { class: 'primario' }, NOME_ACAO[acao]);
  botao.onclick = () => comBotao(botao, () => {
    const campos = { categoriaId: cat.value || undefined, formaPagamento: forma.value || undefined, contaBancariaId: conta.value || undefined };
    if (valor.centavos !== c.valorCentavos) campos.valorCentavos = valor.centavos;
    if (venc.value !== c.dataVencimento) campos.dataVencimento = venc.value;
    return tratar(() => transicionar(c, acao, { campos, motivo: motivo.value.trim() || undefined }), acao === 'lancar' ? 'Conta lançada.' : 'Conta corrigida. Está "Lançada" de novo: suba para aprovação quando agendar no banco.');
  });
  limpar(area, h('div', { class: 'bloco acao-aberta' }, h('h3', null, NOME_ACAO[acao]),
    h('div', { class: 'grade-campos', style: { marginTop: '12px' } },
      h('label', { class: 'campo' }, 'Categoria', cat), h('label', { class: 'campo' }, 'Forma de pagamento', forma),
      h('label', { class: 'campo' }, 'Pagar pela conta', conta),
      h('label', { class: 'campo' }, 'Valor (R$)', c.origem === 'RECORRENCIA' ? h('span', { class: 'dica' }, 'Confira com o boleto.') : null, valor),
      h('label', { class: 'campo' }, 'Vencimento', venc),
      acao === 'reenviar' ? h('label', { class: 'campo largo' }, 'O que foi corrigido', h('span', { class: 'dica' }, 'Obrigatório se mudar valor ou vencimento.'), motivo) : null),
    h('div', { class: 'acoes fim', style: { marginTop: '12px' } }, h('button', { onclick: () => limpar(area) }, 'Fechar'), botao)));
  cat.focus();
}

function formPagamento(c, area, tratar, semAprovacao) {
  const hoje = hojeIso();
  const pago = h('input', { type: 'date', value: hoje, max: hoje });
  const comp = h('input', { type: 'date', value: hoje, max: hoje });
  const ref = h('input', { maxlength: 80, placeholder: 'Ex.: autenticação ou ID da transação' });
  const conferido = h('input', { type: 'checkbox' });
  const justificativa = h('textarea', { maxlength: 500, placeholder: 'Ex.: a dona aprovou no banco dia 18 e esqueceu de aprovar no sistema' });
  const arquivo = h('input', { type: 'file', accept: 'application/pdf,image/jpeg,image/png' });
  const botao = h('button', { class: 'primario sucesso' }, 'Confirmar pagamento');
  botao.onclick = () => comBotao(botao, async () => {
    if (!conferido.checked) { toast('Marque que conferiu a compensação no extrato bancário.', { tipo: 'erro' }); return; }
    if (semAprovacao && justificativa.value.trim().length < 10) { toast('Explique por que está dando baixa sem a aprovação da dona no sistema (mínimo 10 letras).', { tipo: 'erro' }); return; }
    if (arquivo.files[0]) {
      try {
        const a = await lerArquivo(arquivo.files[0]);
        await api('anexos.enviar', { contaId: c.id, tipo: 'COMPROVANTE', nomeArquivo: a.nomeArquivo, mime: a.mime, conteudoBase64: a.conteudoBase64 });
      } catch (e) { toast('Comprovante não enviado, e o pagamento ainda NÃO foi confirmado: ' + e.message, { tipo: 'erro', duracao: 12000 }); return; }
    }
    await tratar(() => transicionar(c, 'confirmarPagamento', { dataPagamento: pago.value, dataCompensacao: comp.value,
      referenciaBancaria: ref.value.trim() || undefined, conferidoNoExtrato: true,
      motivo: semAprovacao ? justificativa.value.trim() : undefined }), semAprovacao ? 'Pagamento confirmado. A dona foi avisada.' : 'Pagamento confirmado.');
  });
  limpar(area, h('div', { class: 'bloco acao-aberta' }, h('h3', null, 'Confirmar pagamento'),
    h('p', { class: 'secundario pequeno', style: { marginTop: '6px' } }, 'Só confirme depois de ver o valor saindo da conta no extrato. O comprovante sozinho não basta.'),
    semAprovacao ? h('p', { class: 'mensagem aviso' }, 'A dona ainda não aprovou esta conta no sistema. Se ela já aprovou no banco, você pode dar baixa explicando o motivo; ela recebe um aviso.') : null,
    h('div', { class: 'grade-campos', style: { marginTop: '12px' } },
      h('label', { class: 'campo' }, 'Data do pagamento', pago),
      h('label', { class: 'campo' }, 'Compensação no extrato', comp),
      h('label', { class: 'campo largo' }, 'Referência bancária', h('span', { class: 'dica' }, 'Opcional'), ref),
      h('label', { class: 'campo largo' }, 'Comprovante', h('span', { class: 'dica' }, 'PDF ou foto. Vai junto com o aviso de "Pago" para quem pediu; não precisa enviar de novo.'), arquivo),
      semAprovacao ? h('label', { class: 'campo largo' }, 'Justificativa (obrigatória)', justificativa) : null,
      h('label', { class: 'check largo' }, conferido, 'Conferi no extrato bancário que o valor de ' + reais(c.valorCentavos) + ' foi compensado.')),
    h('div', { class: 'acoes fim', style: { marginTop: '12px' } }, h('button', { onclick: () => limpar(area) }, 'Fechar'), botao)));
}

function formEditar(c, area, recarregar) {
  const soObs = c.status === 'APROVADO';
  const lancada = ['AGUARDANDO_APROVACAO', 'DEVOLVIDO', 'APROVADO'].includes(c.status);
  const f = {
    fornecedorNome: h('input', { value: c.fornecedorNome, maxlength: 120 }),
    descricao: h('input', { value: c.descricao, maxlength: 300 }),
    valor: campoValor(), dataVencimento: h('input', { type: 'date', value: c.dataVencimento }),
    documentoNumero: h('input', { value: c.documentoNumero, maxlength: 60 }),
    observacoes: h('textarea', { value: c.observacoes, maxlength: 500 }),
  };
  f.valor.centavos = c.valorCentavos;
  const motivo = h('textarea', { maxlength: 500 });
  const botao = h('button', { class: 'primario' }, 'Salvar alterações');
  botao.onclick = () => comBotao(botao, async () => {
    const campos = {};
    if (!soObs) {
      ['fornecedorNome', 'descricao', 'documentoNumero'].forEach((k) => { if (f[k].value.trim() !== (c[k] || '')) campos[k] = f[k].value.trim(); });
      if (f.valor.centavos !== c.valorCentavos) campos.valorCentavos = f.valor.centavos;
      if (f.dataVencimento.value !== c.dataVencimento) campos.dataVencimento = f.dataVencimento.value;
    }
    if (f.observacoes.value.trim() !== (c.observacoes || '')) campos.observacoes = f.observacoes.value.trim();
    try {
      await api('contas.editar', { contaId: c.id, versao: c.versao, campos, motivo: motivo.value.trim() || undefined });
      toast('Alterações salvas.');
      recarregar();
    } catch (e) { toast(e.message, { tipo: 'erro', duracao: 9000 }); }
  });
  limpar(area, h('div', { class: 'bloco acao-aberta' }, h('h3', null, 'Editar dados'),
    soObs ? h('p', { class: 'secundario pequeno' }, 'Conta aprovada: só observações e anexos podem mudar. Para alterar valor ou data, cancele e lance de novo.') : null,
    h('div', { class: 'grade-campos', style: { marginTop: '12px' } },
      soObs ? null : [h('label', { class: 'campo' }, 'Fornecedor', f.fornecedorNome), h('label', { class: 'campo' }, 'Descrição', f.descricao),
        h('label', { class: 'campo' }, 'Valor (R$)', f.valor), h('label', { class: 'campo' }, 'Vencimento', f.dataVencimento),
        h('label', { class: 'campo' }, 'Documento', f.documentoNumero)],
      h('label', { class: 'campo largo' }, 'Observações', f.observacoes),
      lancada && !soObs ? h('label', { class: 'campo largo' }, 'Justificativa', h('span', { class: 'dica' }, 'Obrigatória para mudar fornecedor, valor ou vencimento depois do lançamento.'), motivo) : null),
    h('div', { class: 'acoes fim', style: { marginTop: '12px' } }, h('button', { onclick: () => limpar(area) }, 'Fechar'), botao)));
}

function formEstorno(c, recarregar) {
  return dialogo((fechar) => {
    const valor = campoValor(); valor.centavos = c.valorCentavos;
    const dt = h('input', { type: 'date', value: hojeIso(), max: hojeIso() });
    const motivo = h('textarea', { maxlength: 500 });
    const conferido = h('input', { type: 'checkbox' });
    const erro = h('p', { class: 'mensagem erro', hidden: true });
    const botao = h('button', { class: 'primario' }, 'Registrar estorno');
    botao.onclick = () => comBotao(botao, async () => {
      try {
        await api('contas.registrarEstorno', { contaId: c.id, valorCentavos: valor.centavos, data: dt.value, motivo: motivo.value.trim(), conferidoNoExtrato: conferido.checked });
        fechar(true); toast('Estorno registrado.'); recarregar();
      } catch (e) { erro.textContent = e.message; erro.hidden = false; }
    });
    return [h('h2', null, 'Registrar estorno'),
      h('p', { class: 'secundario pequeno' }, 'Use quando o valor pago voltar para a conta. A conta original continua como paga; o estorno é um lançamento ligado a ela.'),
      h('label', { class: 'campo' }, 'Valor devolvido (R$)', valor), h('label', { class: 'campo' }, 'Data no extrato', dt),
      h('label', { class: 'campo' }, 'Motivo', motivo), h('label', { class: 'check' }, conferido, 'Conferi a devolução no extrato bancário.'),
      erro, h('div', { class: 'acoes fim' }, h('button', { onclick: () => fechar(false) }, 'Voltar'), botao)];
  });
}

