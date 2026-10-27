/**
 * config.js — Único arquivo a editar na instalação.
 *
 * API_URL: endereço do web app do Apps Script (Implantar → Gerenciar implantações),
 *          terminando em /exec. Não é segredo, mas não precisa ser divulgado.
 * FIREBASE: preenchido depois de criar o projeto no Firebase (avisos com o app fechado).
 * MARCAS:  logos disponíveis na pasta "marcas". "fundo" indica se a logo
 *          precisa de placa clara (logos escuras) ou fica sobre o marinho.
 */
export const CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbwJpqR7Chf2TDLx_Gpy3y6X3WHIhgJ7zgEV87_0G5EH0DMSB-Xwt8GQwM7tjj1EncKs/exec',
  NOME_APP: 'Contas a Pagar',
  MARCAS: {
    'genial-mix': { arquivo: 'marcas/genial-mix.png', nome: 'Genial Mix', fundo: 'escuro' },
    rihappy: { arquivo: 'marcas/rihappy.png', nome: 'RiHappy', fundo: 'claro' },
    spoleto: { arquivo: 'marcas/spoleto.png', nome: 'Spoleto', fundo: 'claro' },
    kaluf: { arquivo: 'marcas/kaluf-completa.png', nome: 'Kaluf & Gomes', fundo: 'escuro' },
  },
  INTERVALO_AVISOS_SEG: 60,
  // Avisos com o app fechado. Valores do Firebase (Configurações do projeto → Seus apps → app da Web,
  // e Cloud Messaging → Certificados push da Web para a vapidKey). Não são segredos.
  FIREBASE: {
    apiKey: '',
    authDomain: '',
    projectId: '',
    messagingSenderId: '',
    appId: '',
    vapidKey: '',
  },
};
