/**
 * telas-importacao.js — Importar contas a pagar do relatório do Arius (RiHappy).
 *
 * O arquivo nunca sai do aparelho: a tela lê as linhas, mostra a prévia e
 * manda só os dados de cada conta, em lotes. O servidor confere tudo de novo
 * e pula as que já foram lançadas.
 */
import { api } from './api.js';
import { app } from './app.js';
import { h, limpar, reais, data, toast, comBotao, opcoes } from './ui.js';
import { opcoesCategorias } from './telas-contas.js';

const LOTE = 50;
/** Categoria do Arius (código antes do hífen) → código do nosso plano de contas. */
const MAPA_CATEGORIAS_ARIUS = { '02.01.01': '3.1' };

const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();

function paraCentavos(texto) {
  const t = String(texto || '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  if (!/^-?\d+(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}
function paraIso(texto) {
  const m = String(texto || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? m[3] + '-' + m[2] + '-' + m[1] : '';
}

/** Lê o "xls" do Arius (na verdade uma página com uma tabela). */
export function lerRelatorioArius(texto) {
  const doc = new DOMParser().parseFromString(texto, 'text/html');
  const tabela = doc.querySelector('table');
  if (!tabela) throw new Error('Não encontrei a tabela de contas no arquivo. Confira se é o relatório de contas a pagar do Arius.');
  const cab = [...tabela.querySelectorAll('thead th')].map((th) => semAcento(th.textContent));
  const col = (nome) => cab.indexOf(semAcento(nome));
  const exigidas = ['Favorecido', 'CPF/CNPJ Favorecido', 'Origem', 'Valor Líquido', 'Vencto Previsto', 'Categoria', 'Memo', 'Situação', 'Forma Pagamento'];
  const faltando = exigidas.filter((n) => col(n) === -1);
  if (faltando.length) throw new Error('O arquivo não tem as colunas: ' + faltando.join(', ') + '.');
  const linhas = [];
  let ignoradas = 0;
  [...tabela.querySelectorAll('tbody tr')].forEach((tr) => {
    const td = [...tr.querySelectorAll('td')].map((c) => c.textContent.replace(/\s+/g, ' ').trim());
    if (td.length !== cab.length) return; // linha de totais
    const v = (n) => td[col(n)] || '';
    if (semAcento(v('Situação')) !== 'EM ABERTO') { ignoradas++; return; }
    linhas.push({
      favorecido: v('Favorecido'), documento: v('CPF/CNPJ Favorecido'), origem: v('Origem'), memo: v('Memo'),
      valorCentavos: paraCentavos(v('Valor Líquido')), vencimento: paraIso(v('Vencto Previsto')),
      competencia: col('Data Competência') !== -1 ? paraIso(v('Data Competência')) : '',
      categoria: v('Categoria'), forma: v('Forma Pagamento'),
    });
  });
  return { linhas, ignoradas };
}

export async function telaImportar({ subtitulo }) {
  subtitulo('Relatório de contas a pagar do Arius (RiHappy). Só entram as contas "EM ABERTO"; as que já foram lançadas são puladas.');
  const empresas = app.cad.empresas.filter((e) => e.ativo);
  const padrao = (empresas.find((e) => e.marca === 'rihappy') || empresas[0] || {}).id || '';
  const f = {
    empresa: h('select', null, opcoes(empresas.map((e) => [e.id, e.nome]), padrao)),
    conta: h('select'),
    arquivo: h('input', { type: 'file', accept: '.xls,.html,.htm,text/html,application/vnd.ms-excel' }),
  };
  const atualizarContas = () => limpar(f.conta, opcoes(app.cad.contasBancarias.filter((c) => c.empresaId === f.empresa.value && c.ativo)
    .map((c) => [c.id, c.apelido + ' · ' + c.banco + ' final ' + c.contaFinal]), '', 'Escolha'));
  atualizarContas();
  const area = h('div');
  let lido = null;
  let mapa = {};

  const montarItens = (linhas) => linhas.map((l) => ({
    fornecedorNome: l.favorecido, documento: l.documento, descricao: l.origem || ('Compra ' + l.memo), documentoNumero: l.memo || l.origem,
    valorCentavos: l.valorCentavos, dataVencimento: l.vencimento, dataEmissao: l.competencia || undefined,
    categoriaId: mapa[l.categoria] ? mapa[l.categoria].value : '', formaPagamento: l.forma,
  }));

  async function enviar(simular, linhas, progresso) {
    const res = [];
    for (let i = 0; i < linhas.length; i += LOTE) {
      if (progresso) progresso(i, linhas.length);
      const r = await api('contas.importar', { empresaId: f.empresa.value, contaBancariaId: f.conta.value, origemArquivo: 'Arius',
        simular, itens: montarItens(linhas.slice(i, i + LOTE)) });
      r.resultados.forEach((x) => res.push(Object.assign({}, x, { linha: i + x.linha })));
    }
    return res;
  }

  const NOME = { nova: 'Nova', repetida: 'Já lançada', erro: 'Com problema', criada: 'Importada' };
  function tabelaResultado(linhas, res) {
    return h('div', { class: 'bloco rolagem' }, h('table', { class: 'tabela' },
      h('thead', null, h('tr', null, ['Situação', 'Fornecedor', 'Documento', 'Vencimento', 'Valor', 'Observação'].map((t, i) => h('th', { class: i === 4 ? 'direita' : '' }, t)))),
      h('tbody', null, linhas.map((l, i) => {
        const r = res[i] || {};
        return h('tr', null, h('td', null, h('span', { class: 'etiqueta' + (r.situacao === 'erro' ? ' urgente' : '') }, NOME[r.situacao] || '—')),
          h('td', null, l.favorecido), h('td', null, l.memo), h('td', { class: 'num' }, data(l.vencimento)),
          h('td', { class: 'direita num' }, l.valorCentavos === null ? '?' : reais(l.valorCentavos)), h('td', { class: 'pequeno' }, r.mensagem || r.rotulo || ''));
      }))));
  }

  function mostrarLeitura() {
    const total = lido.linhas.reduce((s, l) => s + (l.valorCentavos || 0), 0);
    const categorias = [...new Set(lido.linhas.map((l) => l.categoria))];
    mapa = {};
    const blocoMapa = h('div', { class: 'grade-campos' }, categorias.map((c) => {
      const codigo = MAPA_CATEGORIAS_ARIUS[c.split('-')[0].trim()];
      const nossa = codigo && app.cad.categorias.find((x) => x.codigo === codigo && x.ativo);
      const sel = h('select', null, opcoesCategorias(f.empresa.value, nossa ? nossa.id : ''));
      mapa[c] = sel;
      return h('label', { class: 'campo largo' }, 'No Arius: ' + c, h('span', { class: 'dica' }, 'Categoria no sistema:'), sel);
    }));
    const conferir = h('button', { class: 'primario' }, 'Conferir o que já foi lançado');
    const resultado = h('div');
    conferir.onclick = () => comBotao(conferir, async () => {
      if (!f.conta.value) { toast('Escolha a conta bancária que vai pagar as contas.', { tipo: 'erro' }); return; }
      if (Object.values(mapa).some((s) => !s.value)) { toast('Escolha a categoria de cada categoria do Arius.', { tipo: 'erro' }); return; }
      let res;
      try { res = await enviar(true, lido.linhas); } catch (e) { toast(e.message, { tipo: 'erro' }); return; }
      const novas = lido.linhas.filter((l, i) => res[i].situacao === 'nova');
      const n = (s) => res.filter((x) => x.situacao === s).length;
      const importar = h('button', { class: 'primario sucesso', disabled: !novas.length }, 'Importar ' + novas.length + (novas.length === 1 ? ' conta nova' : ' contas novas'));
      const progresso = h('p', { class: 'secundario pequeno' });
      importar.onclick = () => comBotao(importar, async () => {
        let res2;
        try {
          res2 = await enviar(false, novas, (i, t) => { progresso.textContent = 'Importando ' + Math.min(i + LOTE, t) + ' de ' + t + '…'; });
        } catch (e) { toast(e.message + ' As que já foram importadas ficam; repita a importação para terminar (as repetidas são puladas).', { tipo: 'erro', duracao: 15000 }); return; }
        const criadas = res2.filter((x) => x.situacao === 'criada').length;
        progresso.textContent = '';
        limpar(resultado, h('p', { class: 'mensagem aviso' }, criadas + (criadas === 1 ? ' conta importada' : ' contas importadas') +
          ' como "Lançada". Elas aparecem em Contas a pagar para subir para aprovação.'),
          h('div', { class: 'acoes' }, h('button', { class: 'primario', onclick: () => app.navegar('contas') }, 'Ver em Contas a pagar')),
          tabelaResultado(novas, res2));
        toast(criadas + ' contas importadas.');
        app.atualizarContadores();
      });
      limpar(resultado, h('section', { class: 'bloco' },
        h('p', { class: 'resumo-importacao' }, h('b', null, String(n('nova'))), ' novas · ', h('b', null, String(n('repetida'))), ' já lançadas (serão puladas) · ', h('b', null, String(n('erro'))), ' com problema'),
        h('div', { class: 'acoes', style: { margin: '10px 0' } }, importar), progresso), tabelaResultado(lido.linhas, res));
    });
    limpar(area,
      h('section', { class: 'bloco' }, h('h2', null, lido.linhas.length + ' contas em aberto · ' + reais(total)),
        lido.ignoradas ? h('p', { class: 'secundario pequeno' }, lido.ignoradas + ' linha(s) com outra situação (ex.: pagas) foram ignoradas.') : null,
        h('h3', { style: { marginTop: '12px' } }, 'Categorias'), blocoMapa,
        h('div', { class: 'acoes', style: { marginTop: '12px' } }, conferir)),
      resultado);
  }

  f.arquivo.addEventListener('change', async () => {
    const arq = f.arquivo.files[0];
    if (!arq) return;
    try {
      lido = lerRelatorioArius(await arq.text());
      if (!lido.linhas.length) throw new Error('Nenhuma conta "EM ABERTO" no arquivo.');
      if (lido.linhas.some((l) => l.valorCentavos === null || !l.vencimento)) throw new Error('Há linhas sem valor ou vencimento legível. Confira o arquivo.');
      mostrarLeitura();
    } catch (e) { limpar(area, h('p', { class: 'mensagem erro' }, e.message)); }
  });
  f.empresa.addEventListener('change', () => { atualizarContas(); if (lido) mostrarLeitura(); });

  return [
    h('div', { class: 'acoes' }, h('button', { class: 'discreto', onclick: () => app.navegar('contas') }, '← Voltar para Contas a pagar')),
    h('section', { class: 'bloco' },
      h('div', { class: 'grade-campos' },
        h('label', { class: 'campo' }, 'Empresa', f.empresa),
        h('label', { class: 'campo' }, 'Pagar pela conta', f.conta),
        h('label', { class: 'campo largo' }, 'Arquivo do Arius', h('span', { class: 'dica' }, 'No Arius: Contas a pagar → exportar em formato planilha (.xls).'), f.arquivo))),
    area,
  ];
}
