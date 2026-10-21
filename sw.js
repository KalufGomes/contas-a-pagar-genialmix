/**
 * sw.js — Permite instalar o app e abre a tela mais rápido.
 * Guarda só os arquivos da tela; respostas do servidor (dados) NUNCA são
 * guardadas no aparelho. Ao publicar uma nova versão, mude VERSAO.
 */
const VERSAO = 'cap-v6';
const ARQUIVOS = [
  './', 'index.html', 'estilo.css', 'config.js', 'manifest.webmanifest',
  'js/app.js', 'js/api.js', 'js/ui.js', 'js/telas-contas.js', 'js/telas-financeiro.js', 'js/telas-admin.js', 'js/telas-relatorios.js',
  'fontes/public-sans-latin-400-normal.woff2', 'fontes/public-sans-latin-500-normal.woff2',
  'fontes/public-sans-latin-600-normal.woff2', 'fontes/public-sans-latin-700-normal.woff2',
  'icones/icone-192.png', 'icones/icone-512.png', 'icones/favicon-32.png',
  'marcas/genial-mix.png', 'marcas/rihappy.png', 'marcas/spoleto.png', 'marcas/kaluf-completa.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return; // dados vão direto ao servidor
  // Rede primeiro, sempre conferindo com o GitHub (sem esperar o cache do navegador);
  // sem internet, usa a cópia guardada.
  e.respondWith(fetch(url.href, { cache: 'no-cache', credentials: 'same-origin' }).then((r) => {
    if (r.ok) { const copia = r.clone(); caches.open(VERSAO).then((c) => c.put(e.request, copia)); }
    return r;
  }).catch(() => caches.match(e.request).then((r) => r || caches.match('index.html'))));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const contaId = e.notification.data && e.notification.data.contaId;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((janelas) => {
    const j = janelas[0];
    if (j) { j.focus(); if (contaId) j.postMessage({ contaId }); return; }
    return self.clients.openWindow('./');
  }));
});
