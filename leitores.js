/**
 * leitores.js — Leitura dos arquivos no próprio aparelho (nada é enviado inteiro):
 * extrato OFX e Excel, relatório do Soft Up e holerites em PDF.
 * Funções puras (sem tela), testadas com os arquivos reais de modelo.
 */

const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
export const comparavel = (s) => semAcento(s).toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const doisDigitos = (n) => String(n).padStart(2, '0');
const isoDe = (a, m, d) => a + '-' + doisDigitos(m) + '-' + doisDigitos(d);

/** "1.234,56", "-982,31", "8147.40" ou número → centavos (inteiro). */
export function centavosDe(v) {
  if (typeof v === 'number') return Math.round(v * 100);
  let t = String(v || '').replace(/[R$\s]/g, '');
  if (!t) return null;
  if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
  else t = t.replace(/,/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}

/** dd/mm/aaaa, aaaammdd..., Date ou número de série do Excel → AAAA-MM-DD (vazio se a data não existe). */
export function dataIso(v) {
  const iso = dataIsoBruta(v);
  return iso && new Date(iso + 'T00:00:00Z').toISOString().slice(0, 10) === iso ? iso : '';
}
function dataIsoBruta(v) {
  if (v instanceof Date && !isNaN(v)) return isoDe(v.getFullYear(), v.getMonth() + 1, v.getDate());
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return isoDe(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const s = String(v || '').trim();
  let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return m[3] + '-' + m[2] + '-' + m[1];
  m = s.match(/^(\d{4})(\d{2})(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[0] : '';
}

/** 4 últimos dígitos da conta, sem o dígito verificador ("0722130024926" → "2492"). O resto do número é descartado. */
export function finalDaConta(numero) {
  const d = String(numero || '').replace(/\D/g, '');
  return d.length >= 5 ? d.slice(-5, -1) : d.slice(-4);
}

/** CPF/CNPJ que aparece no histórico (só os dígitos). */
const documentoNoTexto = (t) => (String(t).match(/\b(\d{14}|\d{11})\b/) || [])[1] || '';

/**
 * Identificador de cada linha para não importar duas vezes: dia + valor + histórico (+ nº da repetição no dia).
 * O número do banco (FITID) não serve: o Santander gera um novo a cada exportação.
 */
function numerar(movs) {
  const vistos = {};
  movs.forEach((m) => {
    const base = 'L' + m.data + '|' + m.valorCentavos + '|' + comparavel(m.historico);
    vistos[base] = (vistos[base] || 0) + 1;
    m.id = (base + '#' + vistos[base]).slice(0, 160);
  });
  return movs;
}

// ---------------------------------------------------------------------------
// Extrato OFX (Santander, Inter e outros bancos)
// ---------------------------------------------------------------------------

export function lerOfx(texto) {
  const tag = (bloco, nome) => { const m = bloco.match(new RegExp('<' + nome + '>([^<\\r\\n]*)', 'i')); return m ? m[1].trim() : ''; };
  const conta = tag(texto, 'ACCTID');
  const banco = tag(texto, 'ORG') || tag(texto, 'BANKID');
  if (!conta || !/<STMTTRN>/i.test(texto)) throw new Error('Não encontrei movimentos neste arquivo. Confira se é o extrato em OFX.');
  const movs = (texto.match(/<STMTTRN>[\s\S]*?(<\/STMTTRN>|(?=<STMTTRN>)|(?=<\/BANKTRANLIST>))/gi) || []).map((b) => {
    const memo = tag(b, 'MEMO').replace(/&amp;/g, '&').replace(/&quot;/g, '"');
    const nome = tag(b, 'NAME');
    const partes = memo.split(/\s{3,}/);
    const historico = memo.replace(/\s+/g, ' ').trim() || nome || tag(b, 'TRNTYPE');
    return {
      id: '', data: dataIso(tag(b, 'DTPOSTED')), valorCentavos: centavosDe(tag(b, 'TRNAMT')),
      historico: historico.slice(0, 200),
      contraparte: (nome || (partes.length > 1 ? partes.slice(1).join(' ') : '')).replace(/\s+/g, ' ').trim().slice(0, 120),
      documento: documentoNoTexto(memo),
    };
  }).filter((m) => m.data && m.valorCentavos);
  const datas = movs.map((m) => m.data).sort();
  return { formato: 'OFX', banco, contaFinal: finalDaConta(conta), periodoDe: dataIso(tag(texto, 'DTSTART')) || datas[0] || '',
    periodoAte: dataIso(tag(texto, 'DTEND')) || datas[datas.length - 1] || '', movimentos: numerar(movs) };
}

// ---------------------------------------------------------------------------
// Extrato em Excel (linhas já lidas da planilha: lista de listas)
// ---------------------------------------------------------------------------

export function lerExtratoExcel(linhas) {
  let conta = '';
  let iCab = -1;
  for (let i = 0; i < Math.min(linhas.length, 30) && iCab === -1; i++) {
    const l = (linhas[i] || []).map((x) => comparavel(x));
    const ic = l.indexOf('CONTA');
    if (ic !== -1 && linhas[i][ic + 1]) conta = String(linhas[i][ic + 1]);
    if (l.includes('DATA') && l.some((x) => x.startsWith('HISTORICO') || x.startsWith('DESCRICAO')) && l.some((x) => x.startsWith('VALOR'))) iCab = i;
  }
  if (iCab === -1) throw new Error('Não encontrei o cabeçalho (Data, Histórico, Valor) no Excel do extrato.');
  const cab = linhas[iCab].map((x) => comparavel(x));
  const col = (prefixo) => cab.findIndex((x) => x.startsWith(prefixo));
  const cData = col('DATA'); const cHist = col('HISTORICO') !== -1 ? col('HISTORICO') : col('DESCRICAO');
  const cDoc = col('DOCUMENTO'); const cValor = col('VALOR');
  const movs = [];
  linhas.slice(iCab + 1).forEach((l) => {
    if (!l) return;
    const data = dataIso(l[cData]);
    const valor = centavosDe(l[cValor]);
    if (!data || !valor) return;
    const hist = String(l[cHist] || '').replace(/\s+/g, ' ').trim();
    const partes = String(l[cHist] || '').split(/\s{2,}/);
    movs.push({ id: '', data, valorCentavos: valor, historico: hist.slice(0, 200),
      contraparte: (partes.length > 1 ? partes.slice(1).join(' ') : '').trim().slice(0, 120),
      documento: documentoNoTexto(hist) || (cDoc !== -1 && /^\d{11}$|^\d{14}$/.test(String(l[cDoc] || '')) ? String(l[cDoc]) : '') });
  });
  if (!movs.length) throw new Error('Nenhum movimento com data e valor no Excel.');
  const datas = movs.map((m) => m.data).sort();
  return { formato: 'EXCEL', banco: '', contaFinal: finalDaConta(conta), periodoDe: datas[0], periodoAte: datas[datas.length - 1], movimentos: numerar(movs) };
}

// ---------------------------------------------------------------------------
// Soft Up — contas a receber (lista de listas)
// ---------------------------------------------------------------------------

export function lerSoftUp(linhas) {
  let iCab = -1;
  for (let i = 0; i < Math.min(linhas.length, 30) && iCab === -1; i++) {
    const l = (linhas[i] || []).map((x) => comparavel(x));
    if (l.includes('VENCIMENTO') && l.some((x) => x.startsWith('DESCRICAO'))) iCab = i;
  }
  if (iCab === -1) throw new Error('Não encontrei o cabeçalho do Soft Up (Vencimento, Descrição, Pessoa, Valor).');
  const cab = linhas[iCab].map((x) => comparavel(x));
  const col = (n) => cab.findIndex((x) => x === n || x.startsWith(n));
  const c = { cat: col('CATEGORIA'), venc: col('VENCIMENTO'), desc: col('DESCRICAO'), pessoa: col('PESSOA'), valor: cab.indexOf('VALOR'),
    devido: col('VALOR DEVIDO'), vendedor: col('VENDEDOR'), baixado: col('BAIXADO') };
  if (c.venc === -1 || c.pessoa === -1 || c.valor === -1) throw new Error('O relatório do Soft Up precisa das colunas Vencimento, Pessoa e Valor.');
  const vendas = [];
  let ignoradas = 0;
  linhas.slice(iCab + 1).forEach((l) => {
    if (!l) return;
    const venc = dataIso(l[c.venc]);
    const valor = centavosDe(l[c.valor]);
    if (!venc || !valor || valor < 0) return;
    if (c.baixado !== -1 && comparavel(l[c.baixado]) === 'S') { ignoradas++; return; }
    const desc = String(l[c.desc] || '').trim();
    const devido = c.devido !== -1 ? centavosDe(l[c.devido]) : null;
    vendas.push({
      numero: ((desc.match(/(\d{3,})/) || [])[1] || desc).slice(0, 40), descricao: desc, cliente: String(l[c.pessoa] || '').trim().slice(0, 120),
      vendedor: c.vendedor !== -1 ? String(l[c.vendedor] || '').trim().slice(0, 80) : '',
      categoria: c.cat !== -1 ? String(l[c.cat] || '').trim().slice(0, 60) : '',
      vencimentoSoftup: venc, valorCentavos: valor, devidoCentavos: devido && devido > 0 ? devido : valor,
    });
  });
  if (!vendas.length) throw new Error('Nenhuma venda em aberto no relatório.');
  return { vendas, ignoradas };
}

/** O Soft Up mostra o vencimento 1 mês à frente: o sistema usa 1 mês antes (30/09 → 30/08). */
export function menosUmMes(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  const ano = m === 1 ? a - 1 : a; const mes = m === 1 ? 12 : m - 1;
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return isoDe(ano, mes, Math.min(d, ultimo));
}

// ---------------------------------------------------------------------------
// Calendário: dias úteis (fins de semana e feriados nacionais)
// ---------------------------------------------------------------------------

function pascoa(ano) {
  const a = ano % 19; const b = Math.floor(ano / 100); const c = ano % 100; const d = Math.floor(b / 4); const e = b % 4;
  const f = Math.floor((b + 8) / 25); const g = Math.floor((b - f + 1) / 3); const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4); const k = c % 4; const l = (32 + 2 * e + 2 * i - h - k) % 7; const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31); const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(ano, mes - 1, dia);
}
const somarDias = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);

export function feriados(ano) {
  const p = new Date(pascoa(ano)).toISOString().slice(0, 10);
  return new Set(['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25'].map((x) => ano + '-' + x)
    .concat([somarDias(p, -48), somarDias(p, -47), somarDias(p, -2), somarDias(p, 60)])); // carnaval, sexta-feira santa, corpus christi
}

export function diaUtil(iso) {
  const dow = new Date(iso + 'T00:00:00Z').getUTCDay();
  return dow !== 0 && dow !== 6 && !feriados(Number(iso.slice(0, 4))).has(iso);
}
export function diaUtilAnterior(iso) { let d = iso; while (!diaUtil(d)) d = somarDias(d, -1); return d; }

/** 5º dia útil do mês (segunda a sexta, sem feriados nacionais). */
export function quintoDiaUtil(ano, mes) {
  let d = isoDe(ano, mes, 1); let n = diaUtil(d) ? 1 : 0;
  while (n < 5) { d = somarDias(d, 1); if (diaUtil(d)) n++; }
  return d;
}

// ---------------------------------------------------------------------------
// Holerites em PDF (modelo do escritório: dois recibos por página, 1ª e 2ª via)
// ---------------------------------------------------------------------------

const MESES = ['JANEIRO', 'FEVEREIRO', 'MARCO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
const DINHEIRO = /\d{1,3}(?:\.\d{3})*,\d{2}/;

/** Data de pagamento sugerida para cada tipo de holerite. */
export function vencimentoDoHolerite(tipo, competencia) {
  const [a, m] = competencia.split('-').map(Number);
  if (tipo === 'ADIANTAMENTO') return diaUtilAnterior(isoDe(a, m, 20));
  if (tipo === 'FOLHA') return m === 12 ? quintoDiaUtil(a + 1, 1) : quintoDiaUtil(a, m + 1);
  if (tipo === 'DECIMO_1') return diaUtilAnterior(isoDe(a, 11, 30));
  if (tipo === 'DECIMO_2') return diaUtilAnterior(isoDe(a, 12, 20));
  return '';
}

/**
 * paginas: lista de páginas; cada página é a lista das linhas de texto, de cima para baixo.
 * Devolve um item por funcionário e tipo (a 2ª via do recibo é ignorada).
 */
export function lerHolerites(paginas) {
  const itens = [];
  const vistos = new Set();
  let semTexto = 0;
  paginas.forEach((linhas) => {
    const l = linhas.map((x) => String(x).replace(/\s+/g, ' ').trim()).filter(Boolean);
    if (!l.length) { semTexto++; return; }
    const inicios = l.map((x, i) => (/CNPJ:/i.test(x) ? i : -1)).filter((i) => i !== -1);
    inicios.forEach((ini, k) => {
      const bloco = l.slice(ini, inicios[k + 1] !== undefined ? inicios[k + 1] : l.length);
      const texto = comparavel(bloco.join(' | '));
      const cnpj = ((bloco[0].match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/) || [])[0] || '').replace(/\D/g, '');
      const comp = texto.match(new RegExp('(' + MESES.join('|') + ') DE (\\d{4})'));
      const topo = comparavel(bloco.slice(0, 2).join(' ')); // "CC: <empresa> Adiantamento" / "Mensalista Outubro de 2026"
      let tipo = 'FOLHA';
      if (/\b13 ?O? ?(ADIANTAMENTO|1 ?A? PARCELA|PRIMEIRA)/.test(topo)) tipo = 'DECIMO_1';
      else if (/\b13 ?O? ?(SALARIO|INTEGRAL|2 ?A? PARCELA|SEGUNDA|PARCELA FINAL)/.test(topo)) tipo = 'DECIMO_2';
      else if (/\bFERIAS\b/.test(topo)) tipo = 'FERIAS';
      else if (/\bADIANTAMENTO\b/.test(topo)) tipo = 'ADIANTAMENTO';
      const iCab = bloco.findIndex((x) => /Nome do Funcion/i.test(x));
      let codigo = ''; let nome = '';
      for (let i = iCab + 1; iCab !== -1 && i < Math.min(bloco.length, iCab + 4) && !nome; i++) {
        const m = bloco[i].match(/^(\d{1,8})\s+(.+?)\s+(\d{6})\b/);
        if (m) { codigo = m[1]; nome = m[2].replace(/\s+/g, ' ').trim(); }
      }
      const iLiq = bloco.findIndex((x) => /Valor L[ií]quido/i.test(x));
      let valor = null;
      for (let i = iLiq; iLiq !== -1 && i < Math.min(bloco.length, iLiq + 4) && valor === null; i++) {
        const m = bloco[i].replace(/Valor L[ií]quido/i, '').match(DINHEIRO);
        if (m) valor = centavosDe(m[0]);
      }
      if (!nome || !comp) return;
      const competencia = comp[2] + '-' + doisDigitos(MESES.indexOf(comp[1]) + 1);
      const chave = cnpj + '|' + codigo + '|' + tipo + '|' + competencia;
      if (vistos.has(chave)) return; // 2ª via
      vistos.add(chave);
      itens.push({ codigo, nome, tipo, competencia, cnpj, valorCentavos: valor, dataVencimento: vencimentoDoHolerite(tipo, competencia) });
    });
  });
  return { itens, paginasSemTexto: semTexto };
}
