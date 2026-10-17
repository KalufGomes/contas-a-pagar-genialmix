/**
 * app.js — Entrada, login, estrutura da tela, menu por perfil e avisos.
 *
 * Esconder um item do menu é só conveniência: quem decide o que cada pessoa
 * pode ver ou fazer é o servidor, a cada chamada.
 */
import { CONFIG } from '../config.js';
import { api, sessao, carregarSessao, salvarSessao, limparSessao, quandoPerderSessao, ErroApi } from './api.js';
import { h, limpar, icone, toast, dialogo, comBotao } from './ui.js';
import * as contas from './telas-contas.js';
import * as fin from './telas-financeiro.js';
import * as adm from './telas-admin.js';
import * as rel from './telas-relatorios.js';

const raiz = document.getElementById('app');

/** Contexto compartilhado com as telas. */
export const app = {
  cad: { empresas: [], categorias: [], contasBancarias: [] },
  perfis: {},
  tem(...ps) { return ps.some((p) => Object.prototype.hasOwnProperty.call(this.perfis, p)); },
  empresa(id) { return this.cad.empresas.find((e) => e.id === id); },
  nomeEmpresa(id) { const e = this.empresa(id); return e ? e.nome : ''; },
  categoria(id) { return this.cad.categorias.find((c) => c.id === id); },
  contaBancaria(id) { return this.cad.contasBancarias.find((c) => c.id === id); },
  navegar(rota) { location.hash = '#/' + rota; },
  async recarregarCadastros() { this.cad = await api('cadastros.listar', {}); },
  abrirConta: (id) => contas.abrirDetalhe(id),
  atualizarContadores: () => atualizarContadores(),
};

const ROTAS = [
  { id: 'para-fazer', titulo: 'Para fazer', perfis: ['FINANCEIRO'], icone: 'caixa', contador: ['SOLICITADO', 'PREVISTA', 'DEVOLVIDO'], tela: contas.telaParaFazer },
  { id: 'para-aprovar', titulo: 'Para aprovar', perfis: ['APROVADOR'], icone: 'check', contador: ['AGUARDANDO_APROVACAO'], tela: contas.telaParaAprovar },
  { id: 'a-pagar', titulo: 'Confirmar pagamento', curto: 'A pagar', perfis: ['FINANCEIRO'], icone: 'carteira', contador: ['APROVADO'], tela: contas.telaAPagar },
  { id: 'nova-solicitacao', titulo: 'Nova solicitação', curto: 'Solicitar', perfis: ['GERENTE'], icone: 'mais', tela: contas.telaNovaSolicitacao },
  { id: 'minhas', titulo: 'Minhas solicitações', curto: 'Minhas', perfis: ['GERENTE'], icone: 'lista', tela: contas.telaMinhas },
  { id: 'lancar', titulo: 'Lançar conta', curto: 'Lançar', perfis: ['FINANCEIRO'], icone: 'mais', tela: contas.telaLancar },
  { id: 'painel', titulo: 'Painel', perfis: ['FINANCEIRO', 'APROVADOR', 'GESTOR'], icone: 'grafico', tela: rel.telaPainel },
  { id: 'contas', titulo: 'Todas as contas', curto: 'Contas', perfis: ['FINANCEIRO', 'APROVADOR', 'GESTOR'], icone: 'lista', tela: contas.telaTodas },
  { id: 'dre', titulo: 'DRE gerencial', curto: 'DRE', perfis: ['FINANCEIRO', 'APROVADOR', 'GESTOR'], icone: 'tabela', tela: rel.telaDre },
  { id: 'receitas', titulo: 'Receitas', perfis: ['FINANCEIRO', 'APROVADOR', 'GESTOR'], icone: 'entrada', tela: fin.telaReceitas },
  { id: 'recorrentes', titulo: 'Contas recorrentes', curto: 'Recorrentes', perfis: ['FINANCEIRO', 'APROVADOR', 'GESTOR'], icone: 'repetir', tela: fin.telaRecorrentes },
  { id: 'fornecedores', titulo: 'Fornecedores', perfis: ['FINANCEIRO'], icone: 'pessoas', tela: fin.telaFornecedores },
  { id: 'usuarios', titulo: 'Usuários e acessos', curto: 'Usuários', grupo: 'Administração', perfis: ['ADMIN'], icone: 'pessoas', tela: adm.telaUsuarios },
  { id: 'empresas', titulo: 'Empresas e contas bancárias', curto: 'Empresas', grupo: 'Administração', perfis: ['ADMIN'], icone: 'caixa', tela: adm.telaEmpresas },
  { id: 'categorias', titulo: 'Plano de contas', grupo: 'Administração', perfis: ['ADMIN'], icone: 'lista', tela: adm.telaCategorias },
  { id: 'configuracoes', titulo: 'Configurações', grupo: 'Administração', perfis: ['ADMIN'], icone: 'engrenagem', tela: adm.telaConfiguracoes },
  { id: 'historico', titulo: 'Histórico e integridade', curto: 'Histórico', grupo: 'Administração', perfis: ['ADMIN'], icone: 'lista', tela: adm.telaHistorico },
];

const rotasPermitidas = () => ROTAS.filter((r) => app.tem(...r.perfis));

// ---------------------------------------------------------------------------
// Login e troca de senha
// ---------------------------------------------------------------------------

function telaLogin(mensagem) {
  pararAvisos();
  const usuario = h('input', { autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', required: true });
  const senha = h('input', { type: 'password', autocomplete: 'current-password', required: true });
  const erro = h('p', { class: 'mensagem ' + (mensagem ? 'aviso' : 'erro'), hidden: !mensagem }, mensagem || '');
  const botao = h('button', { class: 'primario', type: 'submit' }, 'Entrar');
  const form = h('form', { class: 'login-corpo', onsubmit: async (e) => {
    e.preventDefault();
    erro.hidden = true;
    await comBotao(botao, async () => {
      try {
        const r = await api('auth.login', { login: usuario.value.trim().toLowerCase(), senha: senha.value });
        sessao.token = r.token; sessao.usuario = r.usuario; sessao.expiraEm = r.expiraEm;
        salvarSessao();
        senha.value = '';
        await iniciar();
      } catch (err) {
        erro.className = 'mensagem erro'; erro.textContent = err.message; erro.hidden = false;
      }
    });
  } },
  h('h1', null, CONFIG.NOME_APP),
  h('label', { class: 'campo' }, 'Usuário', usuario),
  h('label', { class: 'campo' }, 'Senha', senha),
  erro, botao,
  h('p', { class: 'secundario pequeno' }, 'Esqueceu a senha? Peça ao administrador uma nova senha provisória.'));
  limpar(raiz, h('main', { class: 'login' },
    h('div', { class: 'login-cartao' },
      h('div', { class: 'login-marca' }, h('img', { src: CONFIG.MARCAS.kaluf.arquivo, alt: 'Kaluf & Gomes Soluções Empresariais' })),
      form)));
  usuario.focus();
}

function telaTrocarSenha() {
  const atual = h('input', { type: 'password', autocomplete: 'current-password' });
  const nova = h('input', { type: 'password', autocomplete: 'new-password' });
  const repete = h('input', { type: 'password', autocomplete: 'new-password' });
  const erro = h('p', { class: 'mensagem erro', hidden: true });
  const botao = h('button', { class: 'primario', type: 'submit' }, 'Salvar nova senha');
  limpar(raiz, h('main', { class: 'login' }, h('div', { class: 'login-cartao' },
    h('div', { class: 'login-marca' }, h('img', { src: CONFIG.MARCAS.kaluf.arquivo, alt: 'Kaluf & Gomes' })),
    h('form', { class: 'login-corpo', onsubmit: async (e) => {
      e.preventDefault();
      erro.hidden = true;
      if (nova.value !== repete.value) { erro.textContent = 'A confirmação não é igual à nova senha.'; erro.hidden = false; return; }
      await comBotao(botao, async () => {
        try {
          await api('auth.alterarSenha', { senhaAtual: atual.value, novaSenha: nova.value });
          sessao.usuario.trocarSenha = false; salvarSessao();
          toast('Senha alterada.');
          await iniciar();
        } catch (err) { erro.textContent = err.message; erro.hidden = false; }
      });
    } },
    h('h1', null, 'Crie sua senha'),
    h('p', { class: 'secundario' }, 'Para continuar, troque a senha provisória por uma só sua: mínimo de 10 caracteres, com letras e números, sem conter seu usuário.'),
    h('label', { class: 'campo' }, 'Senha atual (a provisória)', atual),
    h('label', { class: 'campo' }, 'Nova senha', nova),
    h('label', { class: 'campo' }, 'Repita a nova senha', repete),
    erro, botao,
    h('button', { type: 'button', class: 'discreto', onclick: sair }, 'Sair')))));
  atual.focus();
}

async function sair() {
  try { await api('auth.logout', {}); } catch (e) { /* a sessão já pode ter expirado */ }
  limparSessao();
  telaLogin();
}

quandoPerderSessao((msg) => { limparSessao(); telaLogin(msg || 'Sua sessão terminou. Entre novamente.'); });

// ---------------------------------------------------------------------------
// Estrutura
// ---------------------------------------------------------------------------

const els = {};

function placaMarca() {
  const m = CONFIG.MARCAS[sessao.usuario.marca] || CONFIG.MARCAS['genial-mix'];
  return h('div', { class: 'placa-marca' + (m.fundo === 'claro' ? ' clara' : '') }, h('img', { src: m.arquivo, alt: m.nome }));
}

function botaoSino() {
  const cont = h('span', { class: 'contador', hidden: true });
  const b = h('button', { class: 'sino', type: 'button', 'aria-label': 'Avisos', onclick: (e) => { e.stopPropagation(); abrirListaAvisos(b); } }, icone('sino'), cont);
  b.contador = cont;
  return b;
}

function montarEstrutura() {
  const rotas = rotasPermitidas();
  const menu = h('nav', { class: 'menu', 'aria-label': 'Menu principal' });
  let grupo = null;
  rotas.forEach((r) => {
    if (r.grupo && r.grupo !== grupo) { grupo = r.grupo; menu.append(h('div', { class: 'grupo' }, grupo)); }
    r.linkMenu = h('a', { href: '#/' + r.id }, h('span', null, r.titulo), r.contador ? h('span', { class: 'contador', hidden: true }) : null);
    menu.append(r.linkMenu);
  });
  const perfisTexto = Object.keys(app.perfis).map((p) => ({ GERENTE: 'Gerente', FINANCEIRO: 'Financeiro', APROVADOR: 'Aprovação', GESTOR: 'Gestão', ADMIN: 'Administração' }[p])).join(', ');
  els.sinoTopo = botaoSino();
  els.sinoMovel = botaoSino();
  els.titulo = h('h1');
  els.subtitulo = h('p', { class: 'secundario', hidden: true });
  els.conteudo = h('div', { class: 'conteudo' });

  const movel = rotas.slice(0, rotas.length > 5 ? 4 : 5);
  const abas = h('nav', { class: 'abas-movel', 'aria-label': 'Atalhos' },
    movel.map((r) => {
      r.linkAba = h('a', { href: '#/' + r.id }, icone(r.icone), h('span', null, r.curto || r.titulo), r.contador ? h('span', { class: 'contador', hidden: true }) : null);
      return r.linkAba;
    }),
    rotas.length > 5 ? (els.abaMais = h('a', { href: '#/mais' }, icone('lista'), h('span', null, 'Mais'))) : null);

  limpar(raiz, h('div', { class: 'app' },
    h('aside', { class: 'lateral' },
      placaMarca(), menu,
      h('div', { class: 'lateral-rodape' },
        h('div', { class: 'quem' }, sessao.usuario.nome),
        h('div', null, perfisTexto),
        h('button', { type: 'button', onclick: sair }, 'Sair'))),
    h('div', { class: 'principal' },
      h('header', { class: 'barra-movel' }, placaMarca(), els.sinoMovel),
      h('div', { class: 'topo' }, h('div', { class: 'titulo' }, els.titulo, els.subtitulo), els.sinoTopo),
      h('main', { id: 'conteudo', tabindex: '-1' }, els.conteudo),
      h('footer', { class: 'creditos' }, 'Desenvolvido por Kaluf & Gomes Soluções Empresariais')),
    abas));
}

function telaMais() {
  return h('div', { class: 'bloco' }, h('nav', { class: 'menu', style: { gap: '4px' } },
    rotasPermitidas().map((r) => h('a', { href: '#/' + r.id, style: { color: 'var(--tinta)' } }, r.titulo)),
    h('a', { href: '#', style: { color: 'var(--st-devolvido)' }, onclick: (e) => { e.preventDefault(); sair(); } }, 'Sair')));
}

async function rotear() {
  if (!sessao.token || !els.conteudo) return;
  const id = (location.hash.replace(/^#\/?/, '') || '').split('?')[0];
  const rotas = rotasPermitidas();
  const rota = id === 'mais' ? { id: 'mais', titulo: 'Mais opções', tela: telaMais } : rotas.find((r) => r.id === id) || rotas[0];
  if (!rota) { limpar(els.conteudo, h('div', { class: 'vazio' }, 'Seu usuário ainda não tem nenhum perfil de acesso. Fale com o administrador.')); return; }
  rotas.forEach((r) => {
    if (r.linkMenu) r.linkMenu.classList.toggle('ativo', r === rota);
    if (r.linkAba) r.linkAba.classList.toggle('ativo', r === rota);
  });
  if (els.abaMais) els.abaMais.classList.toggle('ativo', rota.id === 'mais' || !rota.linkAba);
  els.titulo.textContent = rota.titulo;
  els.subtitulo.hidden = true;
  document.title = rota.titulo + ' · ' + CONFIG.NOME_APP;
  tituloBase = document.title;
  limpar(els.conteudo, h('div', { class: 'vazio' }, 'Carregando…'));
  try {
    const tela = await rota.tela({ app, subtitulo: (t) => { els.subtitulo.textContent = t; els.subtitulo.hidden = !t; } });
    limpar(els.conteudo, tela);
  } catch (e) {
    if (e instanceof ErroApi && e.codigo === 'NAO_AUTENTICADO') return;
    limpar(els.conteudo, h('div', { class: 'vazio' }, h('p', null, e.message || 'Não foi possível carregar.'),
      h('button', { onclick: rotear }, 'Tentar de novo')));
  }
  atualizarContadores();
}
app.recarregar = rotear;

async function atualizarContadores() {
  const rotas = rotasPermitidas().filter((r) => r.contador);
  if (!rotas.length) return;
  try {
    const r = await api('contas.listar', { porPagina: 1 });
    rotas.forEach((rota) => {
      const n = rota.contador.reduce((s, st) => s + ((r.resumoPorStatus[st] || {}).quantidade || 0), 0);
      [rota.linkMenu, rota.linkAba].forEach((l) => {
        const c = l && l.querySelector('.contador');
        if (c) { c.textContent = n; c.hidden = n === 0; }
      });
    });
  } catch (e) { /* contadores são só ajuda visual */ }
}

// ---------------------------------------------------------------------------
// Avisos: sininho, pop-up, som e notificação do sistema
// ---------------------------------------------------------------------------

let timerAvisos = null;
let vistos = new Set();
let primeiraLeitura = true;
let tituloBase = document.title;
let piscar = null;

function pararAvisos() { clearInterval(timerAvisos); timerAvisos = null; pararPiscar(); }
function pararPiscar() { clearInterval(piscar); piscar = null; document.title = tituloBase; }

function bipe() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.18].forEach((t) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.15);
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.16);
    });
  } catch (e) { /* som indisponível */ }
}

async function verificarAvisos() {
  let r;
  try { r = await api('notificacoes.listar', { apenasNaoLidas: true }); } catch (e) { return; }
  [els.sinoTopo, els.sinoMovel].forEach((s) => { if (s) { s.contador.textContent = r.naoLidas; s.contador.hidden = !r.naoLidas; } });
  const novos = r.itens.filter((n) => !vistos.has(n.id));
  novos.forEach((n) => vistos.add(n.id));
  // Na entrada só atualiza o contador: o que já estava pendente aparece nas listas.
  if (primeiraLeitura) { primeiraLeitura = false; return; }
  if (!novos.length) return;
  const urgente = novos.some((n) => /URGENTE/.test(n.tipo));
  novos.slice(0, 3).forEach((n) => toast(n.titulo, { tipo: /URGENTE/.test(n.tipo) ? 'urgente' : '', duracao: 12000,
    acao: { rotulo: 'Abrir', fn: () => abrirAviso(n) } }));
  if (app.tem('FINANCEIRO', 'APROVADOR')) bipe();
  if (document.hidden && !piscar) {
    let alterna = false;
    piscar = setInterval(() => { alterna = !alterna; document.title = alterna ? '(' + r.naoLidas + ') ' + (urgente ? 'URGENTE · ' : '') + 'Novo aviso' : tituloBase; }, 1000);
  }
  if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const opc = { body: novos[0].titulo, icon: 'icones/icone-192.png', badge: 'icones/icone-192.png', tag: novos[0].id, data: { contaId: novos[0].contaId } };
      if (reg) reg.showNotification(CONFIG.NOME_APP, opc); else new Notification(CONFIG.NOME_APP, opc);
    } catch (e) { /* notificação do sistema indisponível */ }
  }
  atualizarContadores();
}

document.addEventListener('visibilitychange', () => { if (!document.hidden) { pararPiscar(); if (sessao.token) verificarAvisos(); } });

async function abrirAviso(n) {
  try { await api('notificacoes.marcarLidas', { ids: [n.id] }); } catch (e) { /* segue */ }
  verificarAvisos();
  if (n.contaId) app.abrirConta(n.contaId);
}

async function abrirListaAvisos(ancora) {
  document.querySelectorAll('.lista-avisos').forEach((x) => x.remove());
  const caixa = h('div', { class: 'lista-avisos', role: 'dialog', 'aria-label': 'Avisos' }, h('div', { class: 'vazio' }, 'Carregando…'));
  ancora.parentElement.style.position = 'relative';
  ancora.after(caixa);
  const fechar = (e) => { if (!caixa.contains(e.target)) { caixa.remove(); document.removeEventListener('click', fechar); } };
  setTimeout(() => document.addEventListener('click', fechar));
  try {
    const r = await api('notificacoes.listar', {});
    const permitir = 'Notification' in window && Notification.permission === 'default'
      ? h('button', { class: 'item', onclick: async () => { await Notification.requestPermission(); caixa.remove(); } }, 'Receber avisos também quando o app estiver em segundo plano')
      : null;
    limpar(caixa,
      r.itens.length ? r.itens.map((n) => h('button', { class: 'item' + (n.lida ? '' : ' nao-lido'), onclick: () => { caixa.remove(); abrirAviso(n); } },
        h('div', null, n.titulo), h('div', { class: 'secundario pequeno' }, new Date(n.criadaEm).toLocaleString('pt-BR')))) : h('div', { class: 'vazio' }, 'Nenhum aviso por enquanto.'),
      r.naoLidas ? h('button', { class: 'item', onclick: async () => { await api('notificacoes.marcarLidas', { todas: true }); caixa.remove(); verificarAvisos(); } }, 'Marcar todos como lidos') : null,
      permitir);
  } catch (e) { limpar(caixa, h('div', { class: 'vazio' }, e.message)); }
}

// ---------------------------------------------------------------------------
// Início
// ---------------------------------------------------------------------------

async function iniciar() {
  if (!carregarSessao()) return telaLogin();
  if (sessao.usuario && sessao.usuario.trocarSenha) return telaTrocarSenha();
  try {
    const me = await api('auth.me', {});
    sessao.usuario = me.usuario; salvarSessao();
    if (me.usuario.trocarSenha) return telaTrocarSenha();
    app.perfis = me.usuario.perfis || {};
    await app.recarregarCadastros();
  } catch (e) {
    if (e.codigo === 'NAO_AUTENTICADO') return;
    limpar(raiz, h('main', { class: 'login' }, h('div', { class: 'login-cartao' }, h('div', { class: 'login-corpo' },
      h('p', { class: 'mensagem erro' }, e.message), h('button', { class: 'primario', onclick: iniciar }, 'Tentar de novo')))));
    return;
  }
  montarEstrutura();
  vistos = new Set(); primeiraLeitura = true;
  await rotear();
  verificarAvisos();
  pararAvisos();
  timerAvisos = setInterval(verificarAvisos, CONFIG.INTERVALO_AVISOS_SEG * 1000);
}

window.addEventListener('hashchange', rotear);
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* app funciona sem instalação */ });
  navigator.serviceWorker.addEventListener('message', (e) => { if (e.data && e.data.contaId) app.abrirConta(e.data.contaId); });
}
iniciar();
