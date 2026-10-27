/**
 * api.js — Conversa com o servidor (Apps Script).
 *
 * O token de sessão fica no sessionStorage: some ao fechar o navegador ou o
 * app, e nunca vai na URL. Cada gravação leva uma chave "idem" própria, então
 * um clique repetido ou um reenvio após falha de rede não grava duas vezes.
 */
import { CONFIG } from './config.js';

const CHAVE = 'cap.sessao';
export const sessao = { token: null, usuario: null, expiraEm: null };

export function carregarSessao() {
  try {
    const s = JSON.parse(sessionStorage.getItem(CHAVE) || 'null');
    if (s && s.token) Object.assign(sessao, s);
  } catch (e) { /* armazenamento indisponível: entra de novo */ }
  return !!sessao.token;
}
export function salvarSessao() {
  try { sessionStorage.setItem(CHAVE, JSON.stringify(sessao)); } catch (e) { /* segue só em memória */ }
}
export function limparSessao() {
  sessao.token = null; sessao.usuario = null; sessao.expiraEm = null;
  try { sessionStorage.removeItem(CHAVE); } catch (e) { /* nada a fazer */ }
}

export class ErroApi extends Error {
  constructor(codigo, mensagem) { super(mensagem); this.codigo = codigo; }
}

let aoPerderSessao = () => {};
export function quandoPerderSessao(fn) { aoPerderSessao = fn; }

const novaChave = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2) + 'abcdefgh');

/** Chama uma ação do servidor. Retorna `dados` ou lança ErroApi. */
export async function api(acao, dados = {}, opcoes = {}) {
  const corpo = { acao, dados, idem: opcoes.idem || novaChave() };
  if (sessao.token) corpo.token = sessao.token;
  let resposta;
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    try {
      const r = await fetch(CONFIG.API_URL, {
        method: 'POST', redirect: 'follow', cache: 'no-store',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(corpo),
      });
      resposta = await r.json();
      break;
    } catch (e) {
      if (tentativa === 1) throw new ErroApi('SEM_CONEXAO', 'Sem conexão com o servidor. Confira a internet e tente de novo.');
    }
  }
  if (resposta && resposta.ok) return resposta.dados;
  const erro = (resposta && resposta.erro) || { codigo: 'ERRO', mensagem: 'Resposta inesperada do servidor.' };
  if (erro.codigo === 'NAO_AUTENTICADO' && acao !== 'auth.login') aoPerderSessao(erro.mensagem);
  throw new ErroApi(erro.codigo, erro.mensagem);
}
