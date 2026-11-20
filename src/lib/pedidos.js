// Regras de pedido compartilhadas entre a pani, o cliente e a página pública.
import { supabase } from './supabase';

export const STATUS = {
  novo:       { txt: 'Recebido',          cliente: 'Pedido recebido',               cor: 'bg-red-100 text-red-700' },
  preparando: { txt: 'Preparando',        cliente: 'Preparando seu pedido',         cor: 'bg-orange-100 text-orange-700' },
  pronto:     { txt: 'Pronto',            cliente: 'Pronto! Já vai para a mesa',    cor: 'bg-green-100 text-green-700' },
  saiu:       { txt: 'Saiu para entrega', cliente: 'Saiu para entrega',             cor: 'bg-blue-100 text-blue-700' },
  entregue:   { txt: 'Entregue',          cliente: 'Entregue — bom apetite!',       cor: 'bg-stone-100 text-stone-600' },
  cancelado:  { txt: 'Cancelado',         cliente: 'Pedido cancelado',              cor: 'bg-stone-100 text-stone-500' },
};

// caminho de cada tipo de pedido
export const PASSOS = {
  mesa: ['novo', 'preparando', 'pronto', 'entregue'],
  delivery: ['novo', 'preparando', 'saiu', 'entregue'],
};

// próximo passo e o texto do botão, na visão da pani
export const PROXIMO = {
  mesa: { novo: ['preparando', 'Preparar'], preparando: ['pronto', 'Pronto'], pronto: ['entregue', 'Finalizar'] },
  delivery: { novo: ['preparando', 'Aceitar e preparar'], preparando: ['saiu', 'Saiu para entrega'], saiu: ['entregue', 'Entregue'] },
};

export const ABERTOS = ['novo', 'preparando', 'pronto', 'saiu'];

export const PAGAMENTOS = {
  pix: 'Pix',
  dinheiro: 'Dinheiro',
  cartao: 'Cartão na entrega',
};

export const codigo = (id) => String(id || '').slice(0, 4).toUpperCase(); // "#3FA2" para falar com o cliente

/** Mensagem amigável a partir do erro do Supabase (as do banco já vêm em português). */
export function erroPedido(error) {
  if (!error) return '';
  if (error.code === 'P0001' && error.message) return error.message;
  if (/fetch|network|Failed/i.test(error.message || '')) return 'Sem conexão. Confira a internet e tente de novo.';
  return 'Não foi possível enviar o pedido. Tente de novo.';
}

/**
 * Envia o pedido. O banco confere item por item e calcula o valor com o preço do cardápio.
 * itens: [{ id, qtd }]  (item por kg: qtd em gramas)
 */
export async function fazerPedido(dados) {
  const { data, error } = await supabase.rpc('fazer_pedido', {
    p_pani: dados.pani_id,
    p_tipo: dados.tipo,
    p_itens: dados.itens.map((i) => ({ id: i.id, qtd: i.qtd })),
    p_mesa: dados.mesa ?? null,
    p_cliente: dados.cliente ?? '',
    p_obs: dados.obs ?? '',
    p_telefone: dados.telefone ?? null,
    p_endereco: dados.endereco ?? null,
    p_pagamento: dados.pagamento ?? null,
    p_troco: dados.troco ?? null,
  });
  if (error) throw Object.assign(new Error(erroPedido(error)), { original: error });
  // a cozinha recebe aviso mesmo com o app fechado (se falhar, o pedido já está salvo)
  supabase.functions.invoke('send-push', { body: { evento: 'pedido', pedido_id: data.id } }).catch(() => {});
  lembrarPedido(data.id);
  return data; // { id, total }
}

/** Avisa o cliente que o status mudou (só existe aviso quando o pedido tem cliente logado). */
export function avisarStatus(pedido) {
  if (!pedido?.user_id) return;
  supabase.functions.invoke('send-push', { body: { evento: 'status_pedido', pedido_id: pedido.id } }).catch(() => {});
}

/* pedidos feitos neste aparelho (quem pede na mesa sem conta consegue voltar ao acompanhamento) */
const LOCAL = 'apppani:meus-pedidos';
export function lembrarPedido(id) {
  try {
    const l = JSON.parse(localStorage.getItem(LOCAL) || '[]').filter((x) => x.id !== id);
    l.unshift({ id, em: Date.now() });
    localStorage.setItem(LOCAL, JSON.stringify(l.slice(0, 10)));
  } catch { /* ignora */ }
}
export function pedidosRecentes(horas = 6) {
  try {
    return JSON.parse(localStorage.getItem(LOCAL) || '[]').filter((x) => Date.now() - x.em < horas * 3600000);
  } catch { return []; }
}
