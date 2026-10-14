import type { ToolLike } from '../src';

/** Tools of the Trama Console prototype, as a gateway would expose them. */
export const faturamentoMensal: ToolLike = {
  name: 'pedidos_faturamento_mensal',
  title: 'Faturamento mensal',
  inputSchema: { type: 'object', properties: { ano: { type: 'integer' } } },
  outputSchema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: { type: 'object', properties: { mes: { type: 'string' }, valor: { type: 'number', title: 'R$ mil' } } },
      },
    },
  },
  annotations: { readOnlyHint: true },
};

export const clientesSearch: ToolLike = {
  name: 'clientes_search',
  title: 'Buscar clientes',
  inputSchema: { type: 'object', properties: { q: { type: 'string' }, cidade: { type: 'string' } } },
  outputSchema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            nome: { type: 'string' },
            documento: { type: 'string' },
            cidade: { type: 'string' },
            segmento: { type: 'string', enum: ['varejo', 'atacado', 'servicos'] },
            email: { type: 'string', format: 'email' },
            limite_credito: { type: 'number' },
            criado_em: { type: 'string', format: 'date-time' },
          },
        },
      },
      total: { type: 'integer' },
    },
  },
  annotations: { readOnlyHint: true },
};

export const clientesCreate: ToolLike = {
  name: 'clientes_create',
  title: 'Cadastrar cliente',
  inputSchema: {
    type: 'object',
    required: ['nome', 'email', 'segmento'],
    properties: {
      telefone: { type: 'string', title: 'Telefone' },
      nome: { type: 'string', title: 'Nome completo', minLength: 3 },
      email: { type: 'string', format: 'email' },
      segmento: { type: 'string', enum: ['varejo', 'atacado', 'servicos'] },
      observacao: { type: 'string' },
    },
  },
  outputSchema: {
    type: 'object',
    properties: { id: { type: 'string' }, nome: { type: 'string' }, email: { type: 'string', format: 'email' }, segmento: { type: 'string' } },
  },
  annotations: { readOnlyHint: false, destructiveHint: false },
};

export const cancelarPedido: ToolLike = {
  name: 'wf_cancelar_pedido',
  title: 'Cancelar pedido com estorno',
  inputSchema: { type: 'object', required: ['pedido_id'], properties: { pedido_id: { type: 'integer' }, motivo: { type: 'string' } } },
  annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
};

export const lojas: ToolLike = {
  name: 'lojas_list',
  outputSchema: {
    type: 'array',
    items: { type: 'object', properties: { nome: { type: 'string' }, latitude: { type: 'number' }, longitude: { type: 'number' } } },
  },
  annotations: { readOnlyHint: true },
};
