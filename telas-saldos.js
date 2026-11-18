/**
 * telas-saldos.js — Contas e saldos: saldo de cada conta (banco, caixa, pessoa
 * física e, para o gestor, aplicação), extrato do sistema de cada conta,
 * lançamentos no caixa e na conta PF, transferências, saldo futuro e o
 * fechamento da conciliação.
 */
import { api } from './api.js';
import { app } from './app.js';
import { h, limpar, reais, data, hojeIso, toast, dialogo, comBotao, campoValor, opcoes, exportarPlanilha, reaisPlanilha, FORMAS } from './ui.js';
import { opcoesCategorias, rotuloContaBancaria } from './telas-contas.js';
import { avisoConferencia } from './telas-conciliacao.js';

const NOME_TIPO = { BANCO: 'Banco', CAIXA: 'Caixa (dinheiro)', PESSOA_FISICA: 'Pessoa física do dono', APLICACAO: 'Aplicação' };
const ontem = () => { const d = new Date(hojeIso() + 'T12:00:00'); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); };
const valorEl = (c) => h('span', { class: 'num' + (c < 0 ? ' negativo' : '') }, reais(c));

export async function telaSaldos({ subtitulo }) {
  const fin = app.tem('FINANCEIRO');
  const podeFuturo = fin || app.tem('APROVADOR');
  subtitulo('Saldo de cada conta. Banco: saldo inicial + extrato importado. Caixa e pessoa física: saldo inicial + o que é lançado nelas. O saldo inicial é informado pelo administrador.');
  const filtroEmpresa = h('select', null, opcoes(app.cad.empresas.map((e) => [e.id, e.nome]), '', 'Todas as empresas'));
  const area = h('div');
  const carregar = async () => {
    const r = await api('saldos.listar', { empresaId: filtroEmpresa.value || undefined });
    const empresas = app.cad.empresas.filter((e) => !filtroEmpresa.value || e.id === filtroEmpresa.value);
    limpar(area, empresas.map((e) => {
      const contas = r.contas.filter((c) => c.empresaId === e.id).sort((a, b) => ['BANCO', 'CAIXA', 'PESSOA_FISICA', 'APLICACAO'].indexOf(a.tipo) - ['BANCO', 'CAIXA', 'PESSOA_FISICA', 'APLICACAO'].indexOf(b.tipo));
      const fech = r.fechamentos.find((x) => x.empresaId === e.id) || {};
      const futuro = r.futuros.find((x) => x.empresaId === e.id);
      const total = contas.reduce((s, c) => s + c.saldoCentavos, 0);
      return h('section', { class: 'bloco' },
        h('div', { class: 'fechamento' },
          h('h2', null, e.nome, ' ', h('span', { class: 'secundario pequeno' }, '· total ', reais(total))),
          blocoFechamento(e, fech, fin, carregar)),
        h('div', { class: 'saldos-grade' }, contas.map((c) => h('div', { class: 'saldo-cartao' },
          h('button', { type: 'button', class: 'saldo-abrir', onclick: () => abrirExtrato(c) },
            h('span', { class: 'secundario pequeno' }, NOME_TIPO[c.tipo] || c.tipo),
            h('b', null, c.apelido),
            h('span', { class: 'valor' + (c.saldoCentavos < 0 ? ' negativo' : '') }, reais(c.saldoCentavos)),
            h('span', { class: 'secundario pequeno' }, !c.temSaldoInicial ? '⚠ sem saldo inicial (peça ao administrador)' : (c.ate ? 'até ' + data(c.ate) : 'desde ' + data(c.saldoInicialData)) +
              (c.tipo === 'BANCO' && !c.temExtrato ? ' · ainda sem extrato' : ''))),
          seloConferencia(c.conferencia),
          (fin || app.tem('GESTOR')) && c.temSaldoInicial ? h('button', { class: 'discreto pequeno', onclick: () => conferirComBanco(c, carregar) }, 'Conferir com o banco') : null))),
        h('p', { class: 'secundario pequeno', style: { marginTop: '10px' } }, futuro
          ? ['Saldo futuro: ', h('b', null, reais(futuro.valorCentavos)), futuro.data ? ' em ' + data(futuro.data) : '', futuro.descricao ? ' · ' + futuro.descricao : '', ' (' + futuro.informadoPor + ')']
          : 'Saldo futuro ainda não informado.',
        podeFuturo ? h('button', { class: 'discreto', onclick: () => informarFuturo(e, futuro, carregar) }, 'Informar saldo futuro') : null));
    }));
  };
  filtroEmpresa.addEventListener('change', carregar);
  await carregar();
  return [
    h('div', { class: 'acoes' },
      fin ? h('button', { class: 'primario', onclick: () => lancamentoAvulso('ENTRADA', carregar) }, '+ Entrada (caixa ou PF)') : null,
      fin ? h('button', { onclick: () => lancamentoAvulso('SAIDA', carregar) }, '+ Saída já paga (caixa ou PF)') : null,
      fin ? h('button', { onclick: () => transferir(carregar) }, 'Transferência entre contas') : null,
      h('label', { class: 'campo', style: { minWidth: '220px' } }, 'Empresa', filtroEmpresa)),
    area,
  ];
}

function seloConferencia(cf) {
  if (!cf) return h('span', { class: 'secundario pequeno' }, 'Ainda não conferido com o banco.');
  if (cf.saldoSistemaCentavos === null) return null;
  if (cf.bate) return h('span', { class: 'pequeno', style: { color: '#1F5E3C' } }, '✅ Bate com o banco em ' + data(cf.data));
  return h('span', { class: 'pequeno', style: { color: '#B42318' } }, '⚠️ Não bate em ' + data(cf.data) + ': banco ' + reais(cf.saldoBancoCentavos) + ', diferença ' + reais(cf.diferencaCentavos));
}

/** O financeiro digita o saldo que o banco mostra numa data e vê na hora se bate. */
function conferirComBanco(conta, depois) {
  return dialogo((fechar) => {
    const dataEl = h('input', { type: 'date', value: ontem(), max: hojeIso(), min: conta.saldoInicialData || undefined });
    const valor = campoValor({ placeholder: 'Saldo no fim do dia (use - se negativo)' }, true);
    const resultado = h('div');
    const erro = h('p', { class: 'mensagem erro', hidden: true });
    const botao = h('button', { class: 'primario' }, 'Comparar');
    botao.onclick = () => comBotao(botao, async () => {
      erro.hidden = true;
      if (valor.centavos === null || !valor.value.trim()) { erro.textContent = 'Informe o saldo do banco.'; erro.hidden = false; return; }
      try { limpar(resultado, avisoConferencia(await api('saldos.conferir', { contaBancariaId: conta.id, data: dataEl.value, saldoBancoCentavos: valor.centavos }))); depois(); } catch (e) { erro.textContent = e.message; erro.hidden = false; }
    });
    return [h('h2', null, 'Conferir com o banco · ' + conta.apelido),
      h('p', { class: 'secundario pequeno' }, 'Olhe no app do banco o saldo no FIM do dia escolhido. Importando o extrato em OFX, essa conferência é feita sozinha.'),
      h('div', { class: 'grade-campos' }, h('label', { class: 'campo' }, 'Dia', dataEl), h('label', { class: 'campo' }, 'Saldo no banco (R$)', valor)),
      erro, resultado, h('div', { class: 'acoes fim' }, h('button', { onclick: () => fechar(false) }, 'Fechar'), botao)];
  });
}

function blocoFechamento(e, fech, fin, depois) {
  const texto = fech.dataAte ? ['Conciliação fechada até ', h('b', null, data(fech.dataAte)), fech.fechadoPor ? ' (' + fech.fechadoPor + ')' : ''] : 'Conciliação ainda não fechada';
  if (!fin) return h('span', { class: 'secundario pequeno' }, texto);
  const dataEl = h('input', { type: 'date', value: ontem(), max: ontem() });
  const botao = h('button', { class: 'discreto' }, 'Fechar conciliação até');
  botao.onclick = () => comBotao(botao, async () => {
    const pergunta = await dialogo((fechar) => [h('h2', null, 'Fechar a conciliação de ' + e.nome + ' até ' + data(dataEl.value) + '?'),
      h('p', null, 'Depois disso ninguém lança, altera ou dá baixa com data até ' + data(dataEl.value) + '. Só o administrador pode reabrir.'),
      h('div', { class: 'acoes fim' }, h('button', { onclick: () => fechar(false) }, 'Voltar'), h('button', { class: 'primario', onclick: () => fechar(true) }, 'Fechar conciliação'))]);
    if (!pergunta) return;
    try { await api('saldos.fecharConciliacao', { empresaId: e.id, data: dataEl.value }); toast('Conciliação fechada.'); depois(); } catch (err) {
      if (err.codigo !== 'PENDENCIAS') { toast(err.message, { tipo: 'erro', duracao: 9000 }); return; }
      const mesmo = await dialogo((fechar) => [h('h2', null, 'Ainda há pendências'), h('p', null, err.message),
        h('div', { class: 'acoes fim' }, h('button', { onclick: () => fechar(false) }, 'Classificar antes'), h('button', { class: 'primario perigo', onclick: () => fechar(true) }, 'Fechar mesmo assim'))]);
      if (!mesmo) { app.navegar('conciliacao'); return; }
      try { await api('saldos.fecharConciliacao', { empresaId: e.id, data: dataEl.value, mesmoComPendentes: true }); toast('Conciliação fechada.'); depois(); } catch (e2) { toast(e2.message, { tipo: 'erro' }); }
    }
  });
  return h('div', { class: 'acoes' }, h('span', { class: 'secundario pequeno' }, texto), dataEl, botao);
}

async function abrirExtrato(conta) {
  const de = h('input', { type: 'date', value: hojeIso().slice(0, 8) + '01' });
  const ate = h('input', { type: 'date', value: hojeIso() });
  const corpo = h('div', { class: 'rolagem', style: { maxHeight: '60vh' } });
  let ultimo = null;
  const carregar = async () => {
    try {
      ultimo = await api('saldos.extrato', { contaBancariaId: conta.id, de: de.value || undefined, ate: ate.value || undefined });
    } catch (e) { limpar(corpo, h('p', { class: 'mensagem erro' }, e.message)); return; }
    limpar(corpo, h('table', { class: 'tabela' },
      h('thead', null, h('tr', null, ['Data', 'Descrição', 'Valor', 'Saldo'].map((t, i) => h('th', { class: i >= 2 ? 'direita' : '' }, t)))),
      h('tbody', null,
        h('tr', null, h('td', null, ''), h('td', { class: 'secundario' }, 'Saldo anterior'), h('td', null, ''), h('td', { class: 'direita' }, valorEl(ultimo.saldoAnteriorCentavos))),
        ultimo.itens.map((x) => h('tr', null, h('td', { class: 'num' }, data(x.data)), h('td', null, x.descricao),
          h('td', { class: 'direita' }, valorEl(x.valor)), h('td', { class: 'direita' }, valorEl(x.saldoCentavos)))))));
  };
  await dialogo((fechar) => {
    carregar();
    return [h('h2', null, conta.apelido + ' · ' + reais(conta.saldoCentavos)),
      h('p', { class: 'secundario pequeno' }, conta.temSaldoInicial ? 'Saldo inicial informado em ' + data(conta.saldoInicialData) + '.' : 'Sem saldo inicial: o administrador informa em Empresas e contas bancárias.'),
      h('div', { class: 'acoes' }, h('label', { class: 'campo' }, 'De', de), h('label', { class: 'campo' }, 'Até', ate),
        h('button', { class: 'primario', style: { alignSelf: 'end' }, onclick: carregar }, 'Filtrar'),
        h('button', { style: { alignSelf: 'end' }, onclick: () => ultimo && exportarPlanilha('extrato-' + conta.apelido + '-' + hojeIso(), ['Data', 'Descrição', 'Valor (R$)', 'Saldo (R$)'],
          ultimo.itens.map((x) => [data(x.data), x.descricao, reaisPlanilha(x.valor), reaisPlanilha(x.saldoCentavos)])) }, 'Exportar (Excel ou PDF)')),
      corpo, h('div', { class: 'acoes fim' }, h('button', { onclick: () => fechar() }, 'Fechar'))];
  });
}

/** Entrada ou saída já paga numa conta sem extrato (caixa, pessoa física). */
function lancamentoAvulso(tipo, depois) {
  const entrada = tipo === 'ENTRADA';
  return dialogo((fechar) => {
    const empresas = app.cad.empresas.filter((e) => e.ativo);
    const f = {
      empresa: h('select', null, opcoes(empresas.map((e) => [e.id, e.nome]), empresas.length === 1 ? empresas[0].id : '', 'Escolha')),
      conta: h('select'), categoria: h('select'),
      quem: h('input', { maxlength: 120, placeholder: entrada ? 'Opcional: cliente' : 'Fornecedor / favorecido' }),
      descricao: h('input', { maxlength: 200 }), valor: campoValor(), data: h('input', { type: 'date', value: hojeIso(), max: hojeIso() }),
      forma: h('select', null, opcoes(Object.entries(FORMAS), 'DINHEIRO')),
    };
    const atualizar = () => {
      const contas = app.cad.contasBancarias.filter((c) => c.empresaId === f.empresa.value && c.ativo && c.tipo !== 'APLICACAO');
      const padrao = contas.find((c) => c.tipo === 'CAIXA');
      limpar(f.conta, opcoes(contas.map((c) => [c.id, rotuloContaBancaria(c)]), padrao ? padrao.id : '', 'Escolha'));
      limpar(f.categoria, opcoesCategorias(f.empresa.value, '', entrada ? 'RECEITA' : 'DESPESA'));
      if (entrada) { const v = app.categoriasDaEmpresa(f.empresa.value, 'RECEITA').find((c) => c.codigo === '1.1'); if (v) f.categoria.value = v.id; }
    };
    f.empresa.addEventListener('change', atualizar); atualizar();
    const erro = h('p', { class: 'mensagem erro', hidden: true });
    const botao = h('button', { class: 'primario' }, 'Lançar');
    botao.onclick = () => comBotao(botao, async () => {
      erro.hidden = true;
      try {
        if (!f.valor.centavos) throw new Error('Informe o valor.');
        if (!entrada && !f.quem.value.trim()) throw new Error('Informe o fornecedor ou favorecido.');
        if (entrada) {
          await api('receitas.lancar', { empresaId: f.empresa.value, contaBancariaId: f.conta.value, categoriaId: f.categoria.value, data: f.data.value,
            valorCentavos: f.valor.centavos, descricao: [f.quem.value.trim(), f.descricao.value.trim()].filter(Boolean).join(' · ') || 'Entrada' });
        } else {
          await api('contas.lancarPaga', { empresaId: f.empresa.value, contaBancariaId: f.conta.value, categoriaId: f.categoria.value, data: f.data.value,
            valorCentavos: f.valor.centavos, fornecedorNome: f.quem.value.trim(), descricao: f.descricao.value.trim() || 'Pago no ' + (f.conta.selectedOptions[0] ? f.conta.selectedOptions[0].textContent : 'caixa'), formaPagamento: f.forma.value });
        }
        fechar(true); toast(entrada ? 'Entrada lançada.' : 'Saída lançada como paga.'); depois();
      } catch (e) { erro.textContent = e.message; erro.hidden = false; }
    });
    return [h('h2', null, entrada ? 'Entrada no caixa ou na conta PF' : 'Saída já paga (caixa ou conta PF)'),
      h('p', { class: 'secundario pequeno' }, 'Para contas de banco, use o extrato (Extratos e Soft Up).'),
      h('div', { class: 'grade-campos' },
        h('label', { class: 'campo' }, 'Empresa', f.empresa), h('label', { class: 'campo' }, 'Conta', f.conta),
        h('label', { class: 'campo' }, entrada ? 'Cliente' : 'Fornecedor / favorecido', f.quem), h('label', { class: 'campo' }, 'Descrição', f.descricao),
        h('label', { class: 'campo' }, 'Categoria', f.categoria), h('label', { class: 'campo' }, 'Valor (R$)', f.valor),
        h('label', { class: 'campo' }, 'Data', f.data), entrada ? null : h('label', { class: 'campo' }, 'Forma', f.forma)),
      erro, h('div', { class: 'acoes fim' }, h('button', { onclick: () => fechar(false) }, 'Voltar'), botao)];
  });
}

function transferir(depois) {
  return dialogo((fechar) => {
    const contas = app.cad.contasBancarias.filter((c) => c.ativo);
    const nome = (c) => app.nomeEmpresa(c.empresaId) + ' · ' + rotuloContaBancaria(c);
    const origem = h('select', null, opcoes(contas.map((c) => [c.id, nome(c)]), '', 'Escolha'));
    const destino = h('select', null, opcoes(contas.map((c) => [c.id, nome(c)]), '', 'Escolha'));
    const valor = campoValor(); const dataEl = h('input', { type: 'date', value: hojeIso(), max: hojeIso() });
    const desc = h('input', { maxlength: 200, placeholder: 'Ex.: depósito do caixa no banco' });
    const erro = h('p', { class: 'mensagem erro', hidden: true });
    const botao = h('button', { class: 'primario' }, 'Lançar transferência');
    botao.onclick = () => comBotao(botao, async () => {
      try {
        if (!valor.centavos) throw new Error('Informe o valor.');
        await api('transferencias.lancar', { origemId: origem.value, destinoId: destino.value, data: dataEl.value, valorCentavos: valor.centavos, descricao: desc.value.trim() || undefined });
        fechar(true); toast('Transferência lançada.'); depois();
      } catch (e) { erro.textContent = e.message; erro.hidden = false; }
    });
    return [h('h2', null, 'Transferência entre contas'),
      h('p', { class: 'secundario pequeno' }, 'Use para o que não aparece no extrato (ex.: dinheiro do caixa levado para a conta PF). Aplicação, resgate e depósito em dinheiro no banco são lançados sozinhos pelo extrato.'),
      h('div', { class: 'grade-campos' }, h('label', { class: 'campo' }, 'Sai de', origem), h('label', { class: 'campo' }, 'Entra em', destino),
        h('label', { class: 'campo' }, 'Valor (R$)', valor), h('label', { class: 'campo' }, 'Data', dataEl), h('label', { class: 'campo largo' }, 'Descrição', desc)),
      erro, h('div', { class: 'acoes fim' }, h('button', { onclick: () => fechar(false) }, 'Voltar'), botao)];
  });
}

function informarFuturo(empresa, atual, depois) {
  return dialogo((fechar) => {
    const valor = campoValor({ placeholder: 'Ex.: 48.000,00 (use - para negativo)' }, true);
    if (atual) valor.centavos = atual.valorCentavos;
    const dataEl = h('input', { type: 'date', value: atual ? atual.data : '' });
    const desc = h('input', { maxlength: 200, value: atual ? atual.descricao : '', placeholder: 'Ex.: repasses das plataformas da próxima semana' });
    const erro = h('p', { class: 'mensagem erro', hidden: true });
    const botao = h('button', { class: 'primario' }, 'Salvar');
    botao.onclick = () => comBotao(botao, async () => {
      if (valor.centavos === null) { erro.textContent = 'Valor inválido.'; erro.hidden = false; return; }
      try { await api('saldos.informarFuturo', { empresaId: empresa.id, valorCentavos: valor.centavos, data: dataEl.value || undefined, descricao: desc.value.trim() || undefined }); fechar(true); toast('Saldo futuro salvo. O gestor vê no painel.'); depois(); } catch (e) { erro.textContent = e.message; erro.hidden = false; }
    });
    return [h('h2', null, 'Saldo futuro · ' + empresa.nome),
      h('div', { class: 'grade-campos' }, h('label', { class: 'campo' }, 'Valor (R$)', valor), h('label', { class: 'campo' }, 'Para a data (opcional)', dataEl), h('label', { class: 'campo largo' }, 'Observação', desc)),
      erro, h('div', { class: 'acoes fim' }, h('button', { onclick: () => fechar(false) }, 'Voltar'), botao)];
  });
}
