/**
 * telas-financeiro.js — Receitas (entradas pelo extrato), contas recorrentes e fornecedores.
 */
import { api } from './api.js';
import { app } from './app.js';
import { h, limpar, reais, data, hojeIso, toast, dialogo, pedirMotivo, comBotao, campoValor, opcoes } from './ui.js';

const primeiroDoMes = () => hojeIso().slice(0, 8) + '01';

// ---------------------------------------------------------------------------
// Receitas
// ---------------------------------------------------------------------------

export async function telaReceitas({ subtitulo }) {
  const fin = app.tem('FINANCEIRO');
  const filtro = {
    empresa: h('select', null, opcoes(app.cad.empresas.map((e) => [e.id, e.nome]), '', 'Todas')),
    de: h('input', { type: 'date', value: primeiroDoMes() }),
    ate: h('input', { type: 'date', value: hojeIso() }),
    canceladas: h('input', { type: 'checkbox' }),
  };
  const total = h('p', { class: 'resumo' });
  const tabela = h('div', { class: 'bloco rolagem' });
  const carregar = async () => {
    const r = await api('receitas.listar', { empresaId: filtro.empresa.value || undefined, de: filtro.de.value || undefined,
      ate: filtro.ate.value || undefined, incluirCanceladas: filtro.canceladas.checked });
    limpar(total, h('span', null, 'Entradas no período: ', h('b', null, reais(r.totalCentavos))));
    subtitulo('Entradas lançadas conforme o extrato de cada conta bancária. Base da DRE gerencial.');
    limpar(tabela, !r.itens.length ? h('div', { class: 'vazio' }, 'Nenhuma entrada no período.') : h('table', { class: 'tabela' },
      h('thead', null, h('tr', null, ['Data', 'Empresa', 'Conta', 'Categoria', 'Descrição', 'Valor', ''].map((t, i) => h('th', { class: i === 5 ? 'direita' : '' }, t)))),
      h('tbody', null, r.itens.map((x) => {
        const cb = app.contaBancaria(x.contaBancariaId); const cat = app.categoria(x.categoriaId);
        const cancelada = x.status === 'CANCELADA';
        return h('tr', { style: cancelada ? { color: 'var(--nevoa)', textDecoration: 'line-through' } : null },
          h('td', { class: 'num' }, data(x.data)), h('td', null, app.nomeEmpresa(x.empresaId)), h('td', null, cb ? cb.apelido : ''),
          h('td', null, cat ? cat.nome : ''), h('td', null, x.descricao, cancelada ? h('div', { class: 'pequeno', style: { textDecoration: 'none' } }, 'Cancelada: ' + x.motivoCancelamento) : null),
          h('td', { class: 'direita num' }, reais(x.valorCentavos)),
          h('td', null, fin && !cancelada ? h('button', { class: 'discreto', onclick: async (e) => {
            const motivo = await pedirMotivo('Cancelar entrada', 'Cancelar entrada', true);
            if (!motivo) return;
            await comBotao(e.target, async () => {
              try { await api('receitas.cancelar', { receitaId: x.id, versao: x.versao, motivo }); toast('Entrada cancelada.'); carregar(); } catch (err) { toast(err.message, { tipo: 'erro' }); }
            });
          } }, 'Cancelar') : null));
      }))));
  };
  Object.values(filtro).forEach((el) => el.addEventListener('change', carregar));
  await carregar();
  return [fin ? formReceita(carregar) : null,
    h('div', { class: 'bloco filtros' },
      h('label', { class: 'campo' }, 'Empresa', filtro.empresa), h('label', { class: 'campo' }, 'De', filtro.de),
      h('label', { class: 'campo' }, 'Até', filtro.ate), h('label', { class: 'check' }, filtro.canceladas, 'Mostrar canceladas')),
    total, tabela];
}

function formReceita(depois) {
  const empresas = app.cad.empresas.filter((e) => e.ativo);
  const f = {
    empresa: h('select', null, opcoes(empresas.map((e) => [e.id, e.nome]), '', 'Escolha')),
    conta: h('select'),
    categoria: h('select', null, opcoes(app.cad.categorias.filter((c) => c.natureza === 'RECEITA' && c.ativo).map((c) => [c.id, c.codigo + ' ' + c.nome]), '', 'Escolha')),
    data: h('input', { type: 'date', value: hojeIso(), max: hojeIso() }),
    valor: campoValor(),
    descricao: h('input', { maxlength: 200, placeholder: 'Ex.: vendas do dia, recebimento de cliente' }),
  };
  f.empresa.addEventListener('change', () => limpar(f.conta, opcoes(app.cad.contasBancarias.filter((c) => c.empresaId === f.empresa.value && c.ativo).map((c) => [c.id, c.apelido]), '', 'Escolha')));
  const erro = h('p', { class: 'mensagem erro', hidden: true });
  const botao = h('button', { class: 'primario', type: 'submit' }, 'Lançar entrada');
  const enviar = async (confirmar) => api('receitas.lancar', { empresaId: f.empresa.value, contaBancariaId: f.conta.value, categoriaId: f.categoria.value,
    data: f.data.value, valorCentavos: f.valor.centavos, descricao: f.descricao.value.trim(), confirmarDuplicidade: confirmar || undefined });
  return h('form', { class: 'bloco', onsubmit: (e) => {
    e.preventDefault(); erro.hidden = true;
    return comBotao(botao, async () => {
      try {
        try { await enviar(false); } catch (err) {
          if (err.codigo !== 'DUPLICIDADE_POSSIVEL') throw err;
          const ok = await dialogo((fechar) => [h('h2', null, 'Entrada parecida já existe'), h('p', null, err.message),
            h('div', { class: 'acoes fim' }, h('button', { onclick: () => fechar(false) }, 'Voltar'), h('button', { class: 'primario', onclick: () => fechar(true) }, 'Lançar mesmo assim'))]);
          if (!ok) return;
          await enviar(true);
        }
        toast('Entrada lançada.'); f.valor.value = ''; f.descricao.value = ''; depois();
      } catch (err) { erro.textContent = err.message; erro.hidden = false; }
    });
  } }, h('h2', null, 'Nova entrada'),
  h('div', { class: 'grade-campos' },
    h('label', { class: 'campo' }, 'Empresa', f.empresa), h('label', { class: 'campo' }, 'Conta bancária', f.conta),
    h('label', { class: 'campo' }, 'Categoria', f.categoria), h('label', { class: 'campo' }, 'Data no extrato', f.data),
    h('label', { class: 'campo' }, 'Valor (R$)', f.valor), h('label', { class: 'campo' }, 'Descrição', f.descricao)),
  erro, h('div', { class: 'acoes fim', style: { marginTop: '14px' } }, botao));
}

// ---------------------------------------------------------------------------
// Contas recorrentes
// ---------------------------------------------------------------------------

const PERIODO = { MENSAL: 'Mensal', QUINZENAL: 'Quinzenal', SEMANAL: 'Semanal', ANUAL: 'Anual' };

export async function telaRecorrentes({ subtitulo }) {
  const fin = app.tem('FINANCEIRO');
  const encerradas = h('input', { type: 'checkbox' });
  const tabela = h('div', { class: 'bloco rolagem' });
  const carregar = async () => {
    const lista = await api('recorrencias.listar', { incluirEncerradas: encerradas.checked });
    subtitulo('Cada conta é criada sozinha, como "Prevista", alguns dias antes do vencimento.');
    limpar(tabela, !lista.length ? h('div', { class: 'vazio' }, 'Nenhuma conta recorrente.', fin ? h('p', { class: 'pequeno' }, 'Para criar, use "Lançar conta" e escolha "Repete todo mês/semana".') : null)
      : h('table', { class: 'tabela' },
        h('thead', null, h('tr', null, ['Fornecedor', 'Empresa', 'Repete', 'Valor', 'Próximo vencimento', ''].map((t, i) => h('th', { class: i === 3 ? 'direita' : '' }, t)))),
        h('tbody', null, lista.map((r) => h('tr', { style: r.ativo ? null : { color: 'var(--nevoa)' } },
          h('td', null, h('div', null, h('b', null, r.fornecedorNome)), h('div', { class: 'pequeno secundario' }, r.descricao)),
          h('td', null, app.nomeEmpresa(r.empresaId)),
          h('td', null, PERIODO[r.periodicidade] + (r.termino ? ' até ' + data(r.termino) : '')),
          h('td', { class: 'direita num' }, reais(r.valorCentavos), r.valorTipo === 'ESTIMADO' ? h('div', { class: 'pequeno secundario' }, 'estimado') : null),
          h('td', { class: 'num' }, r.ativo ? data(r.proximoVencimento) : 'Encerrada'),
          h('td', null, fin && r.ativo ? h('div', { class: 'acoes' },
            h('button', { class: 'discreto', onclick: () => alterarRecorrencia(r, carregar) }, 'Alterar valor'),
            h('button', { class: 'discreto', style: { color: 'var(--st-devolvido)' }, onclick: async (e) => {
              const motivo = await pedirMotivo('Encerrar conta recorrente', 'Encerrar', true);
              if (!motivo) return;
              await comBotao(e.target, async () => {
                try { await api('recorrencias.encerrar', { recorrenciaId: r.id, versao: r.versao, motivo }); toast('Recorrência encerrada. As contas já criadas continuam.'); carregar(); } catch (err) { toast(err.message, { tipo: 'erro' }); }
              });
            } }, 'Encerrar')) : null))))));
  };
  encerradas.addEventListener('change', carregar);
  await carregar();
  return [h('div', { class: 'acoes' }, fin ? h('button', { class: 'primario', onclick: () => app.navegar('lancar') }, 'Nova conta recorrente') : null,
    h('label', { class: 'check' }, encerradas, 'Mostrar encerradas')), tabela];
}

function alterarRecorrencia(r, depois) {
  return dialogo((fechar) => {
    const valor = campoValor(); valor.centavos = r.valorCentavos;
    const motivo = h('input', { maxlength: 200, placeholder: 'Ex.: reajuste anual do aluguel' });
    const erro = h('p', { class: 'mensagem erro', hidden: true });
    const botao = h('button', { class: 'primario' }, 'Salvar');
    botao.onclick = () => comBotao(botao, async () => {
      try {
        await api('recorrencias.salvar', { id: r.id, versao: r.versao, valorCentavos: valor.centavos, motivo: motivo.value.trim() || undefined });
        fechar(true); toast('Valor alterado para as próximas contas.'); depois();
      } catch (e) { erro.textContent = e.message; erro.hidden = false; }
    });
    return [h('h2', null, 'Alterar valor'), h('p', { class: 'secundario pequeno' }, 'Vale para as próximas contas. As já criadas não mudam.'),
      h('label', { class: 'campo' }, 'Novo valor (R$)', valor), h('label', { class: 'campo' }, 'Motivo', motivo), erro,
      h('div', { class: 'acoes fim' }, h('button', { onclick: () => fechar(false) }, 'Voltar'), botao)];
  });
}

// ---------------------------------------------------------------------------
// Fornecedores
// ---------------------------------------------------------------------------

export async function telaFornecedores({ subtitulo }) {
  subtitulo('Cadastre os fornecedores frequentes: o nome aparece como sugestão ao lançar e solicitar contas.');
  const busca = h('input', { type: 'search', placeholder: 'Buscar fornecedor' });
  const tabela = h('div', { class: 'bloco rolagem' });
  const carregar = async () => {
    const lista = await api('fornecedores.listar', { busca: busca.value.trim() || undefined });
    limpar(tabela, !lista.length ? h('div', { class: 'vazio' }, 'Nenhum fornecedor cadastrado.') : h('table', { class: 'tabela' },
      h('thead', null, h('tr', null, h('th', null, 'Nome'), h('th', null, 'CPF/CNPJ'), h('th', null, 'Dados para pagamento'), h('th', null, ''))),
      h('tbody', null, lista.map((f) => h('tr', null, h('td', null, f.nome), h('td', { class: 'num' }, formatarDocumento(f.documento)),
        h('td', { class: 'pequeno' }, f.dadosPagamento || ''), h('td', null, h('button', { class: 'discreto', onclick: () => formFornecedor(f, carregar) }, 'Editar')))))));
  };
  let espera;
  busca.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(carregar, 300); });
  await carregar();
  return [h('div', { class: 'acoes' }, h('button', { class: 'primario', onclick: () => formFornecedor(null, carregar) }, 'Novo fornecedor'), h('div', { style: { flex: '1 1 260px' } }, busca)), tabela];
}

function formatarDocumento(d) {
  if (!d) return '';
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return d;
}

function formFornecedor(f, depois) {
  return dialogo((fechar) => {
    const nome = h('input', { value: f ? f.nome : '', maxlength: 120 });
    const doc = h('input', { value: f ? formatarDocumento(f.documento) : '', maxlength: 18, inputmode: 'numeric' });
    const pag = h('textarea', { value: f ? f.dadosPagamento || '' : '', maxlength: 300 });
    const erro = h('p', { class: 'mensagem erro', hidden: true });
    const botao = h('button', { class: 'primario' }, 'Salvar');
    botao.onclick = () => comBotao(botao, async () => {
      try {
        await api('fornecedores.salvar', Object.assign(f ? { id: f.id, versao: f.versao } : {}, { nome: nome.value.trim(), documento: doc.value.trim(), dadosPagamento: pag.value.trim() }));
        fechar(true); toast('Fornecedor salvo.'); depois();
      } catch (e) { erro.textContent = e.message; erro.hidden = false; }
    });
    return [h('h2', null, f ? 'Editar fornecedor' : 'Novo fornecedor'),
      h('label', { class: 'campo' }, 'Nome ou razão social', nome),
      h('label', { class: 'campo' }, 'CPF ou CNPJ', h('span', { class: 'dica' }, 'Opcional'), doc),
      h('label', { class: 'campo' }, 'Dados para pagamento', h('span', { class: 'dica' }, 'Chave Pix ou banco/agência/conta. Só o financeiro vê.'), pag),
      erro, h('div', { class: 'acoes fim' }, h('button', { onclick: () => fechar(false) }, 'Voltar'), botao)];
  });
}
