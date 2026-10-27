/**
 * push.js — Avisos com o app fechado (Firebase Cloud Messaging).
 *
 * O Firebase só é carregado quando a pessoa ativa os avisos (ou já ativou),
 * direto do servidor oficial do Google. O aparelho recebe um "token" que vai
 * para o nosso servidor; é ele que dispara os avisos. O conteúdo do aviso é
 * só o título (nº da conta e tipo), sem valores.
 */
import { CONFIG } from '../config.js';
import { api } from './api.js';

const VERSAO_FIREBASE = '10.12.2';
const BASE = 'https://www.gstatic.com/firebasejs/' + VERSAO_FIREBASE + '/';

const fb = () => CONFIG.FIREBASE || {};
const configurado = () => !!(fb().apiKey && fb().projectId && fb().messagingSenderId && fb().appId && fb().vapidKey);
const suporte = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const ehIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const instalado = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

/**
 * 'ativo' | 'pendente' (pode ativar) | 'negado' | 'instalar' (iPhone fora da tela de início)
 * | 'indisponivel' (navegador sem suporte) | 'sem-firebase' (ainda não configurado).
 */
export function situacaoPush() {
  if (!configurado()) return 'sem-firebase';
  if (ehIOS() && !instalado()) return 'instalar';
  if (!suporte()) return 'indisponivel';
  if (Notification.permission === 'denied') return 'negado';
  return Notification.permission === 'granted' ? 'ativo' : 'pendente';
}

function plataforma() {
  const ua = navigator.userAgent;
  const so = /Android/.test(ua) ? 'Android' : ehIOS() ? 'iPhone/iPad' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : 'Outro';
  return so + (instalado() ? ' (app)' : ' (navegador)');
}

/** Pede permissão (se interativo), obtém o token do Firebase e registra este aparelho. */
export async function ativarPush(interativo) {
  const sit = situacaoPush();
  if (sit === 'sem-firebase') {
    // Sem Firebase, ao menos libera o aviso do sistema com o app em segundo plano.
    if (interativo && 'Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
    return { ok: false, mensagem: 'Os avisos com o app fechado ainda não foram configurados pelo administrador.' };
  }
  if (sit === 'instalar') return { ok: false, mensagem: 'No iPhone, instale o app na Tela de Início e abra pelo ícone para ativar os avisos.' };
  if (sit === 'indisponivel') return { ok: false, mensagem: 'Este navegador não recebe avisos com o app fechado. No Android use o Chrome; no iPhone, o app instalado.' };
  if (sit === 'negado') return { ok: false, mensagem: 'Os avisos estão bloqueados. Libere em Ajustes/Configurações → Notificações para este app.' };
  if (sit === 'pendente') {
    if (!interativo) return { ok: false, mensagem: '' };
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return { ok: false, mensagem: 'Sem permissão, os avisos ficam só no sininho.' };
  }
  try {
    const reg = await navigator.serviceWorker.ready;
    const { initializeApp, getApps } = await import(BASE + 'firebase-app.js');
    const { getMessaging, getToken } = await import(BASE + 'firebase-messaging.js');
    const c = fb();
    const appFb = getApps().length ? getApps()[0] : initializeApp({ apiKey: c.apiKey, authDomain: c.authDomain, projectId: c.projectId,
      messagingSenderId: c.messagingSenderId, appId: c.appId });
    const token = await getToken(getMessaging(appFb), { vapidKey: c.vapidKey, serviceWorkerRegistration: reg });
    if (!token) return { ok: false, mensagem: 'Não foi possível ativar os avisos neste aparelho.' };
    await api('push.registrar', { token, plataforma: plataforma() });
    return { ok: true, mensagem: 'Pronto: este aparelho vai receber os avisos mesmo com o app fechado.' };
  } catch (e) {
    return { ok: false, mensagem: 'Não foi possível ativar os avisos agora (' + (e.message || 'erro') + '). Tente de novo mais tarde.' };
  }
}
