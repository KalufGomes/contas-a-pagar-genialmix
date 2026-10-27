/**
 * telas-admin.js — Administração: usuários e perfis, empresas e contas
 * bancárias, plano de contas, configurações e histórico.
 * O servidor recusa qualquer tentativa de alterar o próprio acesso.
 */
import { api, sessao } from './api.js';
import { app } from './app.js';
import { CONFIG } from './config.js';
import { h, limpar, dataHora, toast, dialogo, pedirMotivo, comBotao, opcoes } from './ui.js';

const NOME_PERFIL = { GERENTE: 'Gerente', FINANCEIRO: 'Financeiro', APROVADOR: 'Aprovação', GESTOR: 'Gestão (consulta e relatórios)', ADMIN: 'Administração' };

function erroEm(el) { return (e) => { el.textContent = e.message; el.hidden = false; }; }

// ---------------------------------------------------------------------------
// Usuários e perfis
// ---------------------------------------------------------------------------

export async function telaUsuarios({ subtitulo }) {
  subtitulo('Cada pessoa tem seu próprio login. Perfis podem ser concedidos e revogados sem excluir ninguém; tudo fica no histórico.');
  const tabela = h('div', { class: 'bloco rolagem' });
  const incluirRevogados = h('input', { type: 'checkbox' });
  const carregar = async () => {
    const lista = await api('admin.usuarios.listar', { incluirRevogados: incluirRevogados.checked });
    limpar(tabela, h('table', { class: 'tabela' },
      h('thead', null, h('tr', null, ['Pessoa', 'Perfis', 'Situação', ''].map((t) => h('th', null, t)))),
      h('tbody', null, lista.map((u) => linhaUsuario(u, carregar)))));
  };
  incluirRevogados.addEventListener('change', carregar);
  await carregar();
  return [h('div', { class: 'acoes' }, h('button', { class: 'primario', onclick: () => novoUsuario(carregar) }, 'Novo usuário'),
    h('label', { class: 'check' }, incluirRevogados, 'Mostrar perfis revogados')), tabela];
}

function linhaUsuario(u, carregar) {
  const eu = u.id === sessao.usuario.id;
  const bloqTemp = u.bloqueadoAte && new Date(u.bloqueadoAte) > new Date();
  const situacao = !u.ativo ? 'Bloqueado' : bloqTemp ? 'Bloqueio temporário (tentativas erradas)' : u.trocarSenha ? 'Aguardando primeiro acesso' : 'Ativo';
  const chips = h('div', { class: 'chips' }, u.perfis.map((p) => h('span', { class: 'chip' + (p.ativo ? '' : ' inativo'), title: p.ativo ? 'Concedido em ' + dataHora(p.concedidoEm) : 'Revogado: ' + p.motivoRevogacao },
    NOME_PERFIL[p.perfil] + (p.empresas.length ? ' · ' + p.empresas.map((id) => app.nomeEmpresa(id)).join(', ') : ''),
    p.ativo && !eu ? h('button', { class: 'discreto', style: { minHeight: '0', padding: '0 2px', fontSize: '14px' }, 'aria-label': 'Revogar ' + NOME_PERFIL[p.perfil], onclick: async (e) => {
      const motivo = await pedirMotivo('Revogar perfil ' + NOME_PERFIL[p.perfil] + ' de ' + u.nome, 'Revogar', true);
      if (!motivo) return;
      await comBotao(e.currentTarget, async () => {
        try { await api('admin.perfis.revogar', { perfilId: p.id, motivo }); toast('Perfil revogado.'); carregar(); } catch (err) { toast(err.message, { tipo: 'erro' }); }
      });
    } }, '×') : null)));
  const acao = async (botao, nome, dados, sucesso, mostrarSenha) => {
    const motivo = await pedirMotivo(nome + ': ' + u.nome, nome, nome !== 'Desbloquear');
    if (!motivo) return;
    await comBotao(botao, async () => {
      try {
        const r = await api(dados.acao, { usuarioId: u.id, motivo });
        if (mostrarSenha) await mostrarSenhaProvisoria(u.login, r.senhaProvisoria); else toast(sucesso);
        carregar();
      } catch (err) { toast(err.message, { tipo: 'erro' }); }
    });
  };
  return h('tr', null,
    h('td', null, h('b', null, u.nome), h('div', { class: 'pequeno secundario' }, u.login + (eu ? ' (você)' : '')),
      u.ultimoLogin ? h('div', { class: 'pequeno secundario' }, 'Último acesso ' + dataHora(u.ultimoLogin)) : null),
    h('td', null, chips),
    h('td', null, situacao),
    h('td', null, eu ? h('span', { class: 'secundario pequeno' }, 'Peça a outro administrador para mudar seu acesso.') : h('div', { class: 'acoes' },
      u.ativo ? h('button', { class: 'discreto', onclick: () => concederPerfil(u, carregar) }, 'Dar perfil') : null,
      h('button', { class: 'discreto', onclick: (e) => acao(e.currentTarget, 'Nova senha provisória', { acao: 'admin.usuarios.redefinirSenha' }, '', true) }, 'Nova senha'),
      h('button', { class: 'discreto', onclick: (e) => acao(e.currentTarget, 'Encerrar sessões', { acao: 'admin.sessoes.revogar' }, 'Sessões encerradas.') }, 'Encerrar sessões'),
      u.ativo
        ? h('button', { class: 'discreto', style: { color: 'var(--st-devolvido)' }, onclick: (e) => acao(e.currentTarget, 'Bloquear', { acao: 'admin.usuarios.bloquear' }, 'Usuário bloqueado.') }, 'Bloquear')
        : h('button', { class: 'discreto', onclick: (e) => acao(e.currentTarget, 'Desbloquear', { acao: 'admin.usuarios.desbloquear' }, 'Usuário desbloqueado.') }, 'Desbloquear'))));
}

function mostrarSenhaProvisoria(login, senha) {
  return dialogo((fechar) => [h('h2', null, 'Senha provisória de ' + login),
    h('p', null, 'Passe esta senha para a pessoa por um canal seguro (pessoalmente ou ligação). Ela aparece só agora; na primeira entrada a troca é obrigatória.'),
    h('div', { class: 'senha-mostrada' }, senha),
    h('div', { class: 'acoes fim' },
      h('button', { onclick: async (e) => { try { await navigator.clipboard.writeText(senha); e.target.textContent = 'Copiada'; } catch (err) { e.target.textContent = 'Selecione e copie'; } } }, 'Copiar'),
      h('button', { class: 'primario', onclick: () => fechar() }, 'Já anotei'))]);
}

function novoUsuario(depois) {
  return dialogo((fechar) => {
    const nome = h('input', { maxlength: 120 });
    const login = h('input', { maxlength: 40, autocapitalize: 'none', spellcheck: 'false', placeholder: 'ex.: maria.silva' });
    const email = h('input', { type: 'email', maxlength: 120 });
    const erro = h('p', { class: 'mensagem erro', hidden: true });
    const botao = h('button', { class: 'primario' }, 'Criar usuário');
    botao.onclick = () => comBotao(botao, async () => {
      try {
        const r = await api('admin.usuarios.criar', { nome: nome.value.trim(), login: login.value.trim().toLowerCase(), email: email.value.trim() || undefined });
        fechar(true);
        await mostrarSenhaProvisoria(r.usuario.login, r.senhaProvisoria);
        toast('Usuário criado. Agora dê a ele um perfil.');
        depois();
      } catch (e) { erroEm(erro)(e); }
    });
    return [h('h2', null, 'Novo usuário'), h('label', { class: 'campo' }, 'Nome', nome),
      h('label', { class: 'campo' }, 'Usuário para entrar', h('span', { class: 'dica' }, 'Letras minúsculas, números, ponto ou hífen.'), login),
      h('label', { class: 'campo' }, 'E-mail', h('span', { class: 'dica' }, 'Opcional'), email), erro,
      h('div', { class: 'acoes fim' }, h('button', { onclick: () => fechar(false) }, 'Voltar'), botao)];
  });
}

function concederPerfil(u, depois) {
  return dialogo((fechar) => {
    const perfil = h('select', null, opcoes(Object.entries(NOME_PERFIL), '', 'Escolha'));
    const caixas = app.cad.empresas.filter((e) => e.ativo).map((e) => ({ e, cx: h('input', { type: 'checkbox' }) }));
    const blocoEmpresas = h('div', { class: 'campo', hidden: true }, h('span', null, 'Empresa(s) do gerente'),
      caixas.map(({ e, cx }) => h('label', { class: 'check' }, cx, e.nome)));
    perfil.addEventListener('change', () => { blocoEmpresas.hidden = perfil.value !== 'GERENTE'; });
    const motivo = h('input', { maxlength: 300, placeholder: 'Ex.: nova gerente da loja' });
    const erro = h('p', { class: 'mensagem erro', hidden: true });
    const botao = h('button', { class: 'primario' }, 'Dar perfil');
    botao.onclick = () => comBotao(botao, async () => {
      try {
        await api('admin.perfis.conceder', { usuarioId: u.id, perfil: perfil.value, motivo: motivo.value.trim(),
          empresas: perfil.value === 'GERENTE' ? caixas.filter((x) => x.cx.checked).map((x) => x.e.id) : undefined });
        fechar(true); toast('Perfil concedido.'); depois();
      } catch (e) { erroEm(erro)(e); }
    });
    return [h('h2', null, 'Dar perfil a ' + u.nome),
      h('label', { class: 'campo' }, 'Perfil', perfil),
      h('p', { class: 'secundario pequeno' }, 'Gerente solicita pagamentos da sua empresa. Financeiro lança, confirma pagamentos e lança receitas. Aprovação aprova ou devolve. Gestão consulta tudo, sem alterar.'),
      blocoEmpresas, h('label', { class: 'campo' }, 'Motivo', motivo), erro,
      h('div', { class: 'acoes fim' }, h('button', { onclick: () => fechar(false) }, 'Voltar'), botao)];
  });
}

// ---------------------------------------------------------------------------
// Empresas e contas bancárias
// ---------------------------------------------------------------------------

export async function telaEmpresas({ subtitulo }) {
  subtitulo('A logo escolhida aparece para o gerente da empresa. Quem trabalha com várias empresas vê a logo padrão (em Configurações).');
  await app.recarregarCadastros();
  const r = await api('cadastros.listar', { incluirInativos: true });
  const recarregar = async () => { await app.recarregarCadastros(); app.recarregar(); };
  return [h('div', { class: 'acoes' }, h('button', { class: 'primario', onclick: () => formEmpresa(null, recarregar) }, 'Nova empresa'),
    h('button', { onclick: () => formContaBancaria(null, r.empresas, recarregar) }, 'Nova conta bancária')),
  r.empresas.map((e) => h('section', { class: 'bloco' },
    h('div', { class: 'acoes', style: { justifyContent: 'space-between' } },
      h('div', null, h('h2', null, e.nome + (e.ativo ? '' : ' (inativa)')),
        h('div', { class: 'secundario pequeno' }, (e.cnpj ? 'CNPJ ' + e.cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5') + ' · ' : '') + 'Logo: ' + ((CONFIG.MARCAS[e.marca] || {}).nome || 'padrão'))),
      h('button', { class: 'discreto', onclick: () => formEmpresa(e, recarregar) }, 'Editar')),
    h('table', { class: 'tabela', style: { marginTop: '10px' } }, h('tbody', null,
      r.contasBancarias.filter((c) => c.empresaId === e.id).map((c) => h('tr', { style: c.ativo ? null : { color: 'var(--nevoa)' } },
        h('td', null, c.apelido + (c.ativo ? '' : ' (inativa)')), h('td', null, c.banco + ' · ag. ' + c.agencia + ' · conta final ' + c.contaFinal),
        h('td', { class: 'direita' }, h('button', { class: 'discreto', onclick: () => formContaBancaria(c, r.empresas, recarregar) }, 'Editar')))))))),
  ];
}

function campoAtivo(registro) {
  const ativo = h('input', { type: 'checkbox', checked: registro ? registro.ativo : true });
  const motivo = h('input', { maxlength: 300, placeholder: 'Obrigatório para ativar ou desativar' });
  return { ativo, motivo, el: registro ? [h('label', { class: 'check' }, ativo, 'Em uso'), h('label', { class: 'campo' }, 'Motivo da mudança', motivo)] : null };
}

function formEmpresa(e, depois) {
  return dialogo((fechar) => {
    const nome = h('input', { value: e ? e.nome : '', maxlength: 120 });
    const cnpj = h('input', { value: e ? e.cnpj : '', maxlength: 18, inputmode: 'numeric' });
    const marca = h('select', null, opcoes(Object.entries(CONFIG.MARCAS).map(([k, m]) => [k, m.nome]), e ? e.marca : '', 'Usar a logo padrão'));
    const at = campoAtivo(e);
    const erro = h('p', { class: 'mensagem erro', hidden: true });
    const botao = h('button', { class: 'primario' }, 'Salvar');
    botao.onclick = () => comBotao(botao, async () => {
      const dados = { nome: nome.value.trim(), cnpj: cnpj.value.trim(), marca: marca.value };
      if (e) Object.assign(dados, { id: e.id, versao: e.versao, ativo: at.ativo.checked, motivo: at.motivo.value.trim() || undefined });
      try { await api('admin.empresas.salvar', dados); fechar(true); toast('Empresa salva.'); depois(); } catch (err) { erroEm(erro)(err); }
    });
    return [h('h2', null, e ? 'Editar empresa' : 'Nova empresa'), h('label', { class: 'campo' }, 'Nome', nome),
      h('label', { class: 'campo' }, 'CNPJ', h('span', { class: 'dica' }, 'Opcional'), cnpj), h('label', { class: 'campo' }, 'Logo', marca),
      at.el, erro, h('div', { class: 'acoes fim' }, h('button', { onclick: () => fechar(false) }, 'Voltar'), botao)];
  });
}

function formContaBancaria(c, empresas, depois) {
  return dialogo((fechar) => {
    const empresa = h('select', null, opcoes(empresas.filter((e) => e.ativo).map((e) => [e.id, e.nome]), c ? c.empresaId : '', 'Escolha'));
    const apelido = h('input', { value: c ? c.apelido : '', maxlength: 60, placeholder: 'Ex.: Itaú movimento' });
    const banco = h('input', { value: c ? c.banco : '', maxlength: 60 });
    const agencia = h('input', { value: c ? c.agencia : '', maxlength: 10, inputmode: 'numeric' });
    const contaFinal = h('input', { value: c ? c.contaFinal : '', maxlength: 4, inputmode: 'numeric' });
    const at = campoAtivo(c);
    const erro = h('p', { class: 'mensagem erro', hidden: true });
    const botao = h('button', { class: 'primario' }, 'Salvar');
    botao.onclick = () => comBotao(botao, async () => {
      const dados = { empresaId: empresa.value, apelido: apelido.value.trim(), banco: banco.value.trim(), agencia: agencia.value.trim(), contaFinal: contaFinal.value.trim() };
      if (c) Object.assign(dados, { id: c.id, versao: c.versao, ativo: at.ativo.checked, motivo: at.motivo.value.trim() || undefined });
      try { await api('admin.contasBancarias.salvar', dados); fechar(true); toast('Conta bancária salva.'); depois(); } catch (err) { erroEm(erro)(err); }
    });
    return [h('h2', null, c ? 'Editar conta bancária' : 'Nova conta bancária'),
      h('label', { class: 'campo' }, 'Empresa', empresa), h('label', { class: 'campo' }, 'Apelido', apelido),
      h('div', { class: 'grade-campos' }, h('label', { class: 'campo' }, 'Banco', banco), h('label', { class: 'campo' }, 'Agência', agencia),
        h('label', { class: 'campo' }, 'Últimos 4 dígitos da conta', h('span', { class: 'dica' }, 'O número completo não é guardado.'), contaFinal)),
      at.el, erro, h('div', { class: 'acoes fim' }, h('button', { onclick: () => fechar(false) }, 'Voltar'), botao)];
  });
}

// ---------------------------------------------------------------------------
// Plano de contas
// ---------------------------------------------------------------------------

/** Grupos (1º nível) vêm do servidor, na ordem da DRE. */
const grupos = () => (app.cad.grupos || []).map((g) => [g.chave, g.nome]);

export async function telaCategorias({ subtitulo }) {
  subtitulo('Categorias usadas nas contas, nas receitas e na DRE. Categorias em uso não são apagadas, só desativadas.');
  const r = await api('cadastros.listar', { incluirInativos: true });
  const depois = async () => { await app.recarregarCadastros(); app.recarregar(); };
  return [h('div', { class: 'acoes' }, h('button', { class: 'primario', onclick: () => formCategoria(null, depois) }, 'Nova categoria')),
    grupos().map(([g, nome]) => {
      const itens = r.categorias.filter((c) => c.grupo === g);
      if (!itens.length) return null;
      return h('section', { class: 'bloco' }, h('h2', null, nome), h('table', { class: 'tabela', style: { marginTop: '8px' } }, h('tbody', null,
        itens.map((c) => h('tr', { style: c.ativo ? null : { color: 'var(--nevoa)' } }, h('td', { class: 'num', style: { width: '70px' } }, c.codigo),
          h('td', null, c.nome + (c.ativo ? '' : ' (desativada)'), h('div', { class: 'secundario pequeno' }, nomesMarcas(c.marcas))), h('td', { class: 'direita' }, h('button', { class: 'discreto', onclick: () => formCategoria(c, depois) }, 'Editar')))))));
    })];
}

const MARCAS_EMPRESA = () => Object.entries(CONFIG.MARCAS).filter(([k]) => k !== 'kaluf');
const nomesMarcas = (m) => (!m || !m.length ? 'Todas as empresas' : m.map((k) => (CONFIG.MARCAS[k] || { nome: k }).nome).join(', '));

function formCategoria(c, depois) {
  return dialogo((fechar) => {
    const codigo = h('input', { value: c ? c.codigo : '', maxlength: 12, placeholder: 'Ex.: 5.5' });
    const nome = h('input', { value: c ? c.nome : '', maxlength: 80 });
    const grupo = h('select', { disabled: !!c }, opcoes(grupos(), c ? c.grupo : '', 'Escolha'));
    const at = campoAtivo(c);
    const marcas = MARCAS_EMPRESA().map(([k, m]) => ({ k, el: h('input', { type: 'checkbox', checked: !!(c && c.marcas && c.marcas.includes(k)) }), nome: m.nome }));
    const erro = h('p', { class: 'mensagem erro', hidden: true });
    const botao = h('button', { class: 'primario' }, 'Salvar');
    botao.onclick = () => comBotao(botao, async () => {
      const dados = { codigo: codigo.value.trim(), nome: nome.value.trim(), grupo: grupo.value, marcas: marcas.filter((x) => x.el.checked).map((x) => x.k) };
      if (c) Object.assign(dados, { id: c.id, versao: c.versao, ativo: at.ativo.checked, motivo: at.motivo.value.trim() || undefined });
      try { await api('admin.categorias.salvar', dados); fechar(true); toast('Categoria salva.'); depois(); } catch (err) { erroEm(erro)(err); }
    });
    return [h('h2', null, c ? 'Editar categoria' : 'Nova categoria'),
      h('div', { class: 'grade-campos' }, h('label', { class: 'campo' }, 'Código', codigo), h('label', { class: 'campo' }, 'Nome', nome)),
      h('label', { class: 'campo' }, 'Grupo', c ? h('span', { class: 'dica' }, 'O grupo não muda depois de criado.') : null, grupo),
      h('div', { class: 'campo' }, h('span', null, 'Empresas que usam'), h('span', { class: 'dica' }, 'Nenhuma marcada = todas.'),
        h('div', { class: 'acoes' }, marcas.map((x) => h('label', { class: 'check' }, x.el, x.nome)))),
      at.el, erro, h('div', { class: 'acoes fim' }, h('button', { onclick: () => fechar(false) }, 'Voltar'), botao)];
  });
}

// ---------------------------------------------------------------------------
// Configurações
// ---------------------------------------------------------------------------

export async function telaConfiguracoes({ subtitulo }) {
  subtitulo('Toda alteração pede justificativa e fica no histórico.');
  const lista = await api('admin.config.listar', {});
  const texto = (item) => {
    if (item.valor === 'true') return 'Sim';
    if (item.valor === 'false') return 'Não';
    if (item.chave === 'MARCA_PADRAO') return (CONFIG.MARCAS[item.valor] || {}).nome || item.valor;
    return item.valor || '(vazio)';
  };
  return h('div', { class: 'bloco' }, h('table', { class: 'tabela' }, h('tbody', null, lista.map((item) => h('tr', null,
    h('td', null, item.descricao), h('td', null, h('b', null, texto(item))),
    h('td', { class: 'direita' }, h('button', { class: 'discreto', onclick: () => alterarConfig(item) }, 'Alterar')))))));
}

function alterarConfig(item) {
  return dialogo((fechar) => {
    let campo;
    if (item.valor === 'true' || item.valor === 'false') campo = h('select', null, opcoes([['true', 'Sim'], ['false', 'Não']], item.valor));
    else if (item.chave === 'MARCA_PADRAO') campo = h('select', null, opcoes(Object.entries(CONFIG.MARCAS).map(([k, m]) => [k, m.nome]), item.valor));
    else if (/^\d+$/.test(item.valor)) campo = h('input', { type: 'number', value: item.valor });
    else campo = h('input', { value: item.valor, maxlength: 120 });
    const motivo = h('input', { maxlength: 300 });
    const erro = h('p', { class: 'mensagem erro', hidden: true });
    const botao = h('button', { class: 'primario' }, 'Salvar');
    botao.onclick = () => comBotao(botao, async () => {
      let valor = campo.value;
      if (item.valor === 'true' || item.valor === 'false') valor = valor === 'true';
      else if (campo.type === 'number') valor = Number(valor);
      try { await api('admin.config.definir', { chave: item.chave, valor, motivo: motivo.value.trim() }); fechar(true); toast('Configuração alterada.'); app.recarregar(); } catch (err) { erroEm(erro)(err); }
    });
    return [h('h2', null, item.descricao), h('label', { class: 'campo' }, 'Valor', campo), h('label', { class: 'campo' }, 'Motivo', motivo), erro,
      h('div', { class: 'acoes fim' }, h('button', { onclick: () => fechar(false) }, 'Voltar'), botao)];
  });
}

// ---------------------------------------------------------------------------
// Histórico e integridade
// ---------------------------------------------------------------------------

export async function telaHistorico({ subtitulo }) {
  subtitulo('Registro de tudo o que foi feito no sistema. Ninguém consegue alterar ou apagar estes registros sem que a verificação aponte.');
  const resultado = h('div');
  const verificar = h('button', { class: 'primario', onclick: () => comBotao(verificar, async () => {
    const v = await api('admin.auditoria.verificar', {});
    limpar(resultado, h('p', { class: 'mensagem ' + (v.ok ? 'ok' : 'erro') }, v.ok
      ? 'Histórico íntegro: ' + v.total + ' registros conferidos.'
      : 'Atenção: ' + v.problemas.length + ' problema(s). Primeiro no registro ' + v.problemas[0].seq + ': ' + v.problemas[0].motivo + '. Não altere a planilha e fale com o suporte.'));
  }) }, 'Verificar integridade agora');
  const entidade = h('select', null, opcoes([['Usuarios', 'Usuários'], ['PerfisUsuario', 'Perfis'], ['Contas', 'Contas'], ['Receitas', 'Receitas'], ['Config', 'Configurações'], ['Empresas', 'Empresas'], ['Sistema', 'Sistema']], '', 'Tudo'));
  const tabela = h('div', { class: 'bloco rolagem' });
  const carregar = async () => {
    const lista = await api('admin.auditoria.consultar', { entidade: entidade.value || undefined, limite: 200 });
    limpar(tabela, h('table', { class: 'tabela' }, h('thead', null, h('tr', null, ['Quando', 'Quem', 'O quê', 'Justificativa'].map((t) => h('th', null, t)))),
      h('tbody', null, lista.map((r) => h('tr', null, h('td', { class: 'num pequeno' }, dataHora(r.dataHora)), h('td', null, r.usuario || '—'),
        h('td', null, r.acao.replace(/_/g, ' ').toLowerCase(), r.statusNovo ? h('div', { class: 'pequeno secundario' }, (r.statusAnterior || '—') + ' → ' + r.statusNovo) : null),
        h('td', { class: 'pequeno' }, r.justificativa || ''))))));
  };
  entidade.addEventListener('change', carregar);
  await carregar();
  return [h('div', { class: 'bloco' }, h('div', { class: 'acoes' }, verificar), resultado),
    h('div', { class: 'filtros' }, h('label', { class: 'campo' }, 'Mostrar', entidade)), tabela];
}
