import { defineComponent, z, bind, h } from 'tokensafe-ui';
import { createOrder, listOrders, type Order } from './api.js';

/**
 * Agent-friendly component: explicit state contract, pure synchronous actions,
 * managed async effects with latest-wins concurrency. The OUMV observer exposes
 * this contract in ~80 tokens (L2) and the runtime verifies actions in-memory
 * via oumv/verify without launching a browser.
 */
export const App = defineComponent({
  id: 'orders-app',

  state: {
    orders: z.array(z.object({ id: z.number(), title: z.string(), quantity: z.number() })).default([]),
    newTitle: z.string().default(''),
    status: z.enum(['idle', 'loading', 'saving', 'error']).default('idle'),
  },

  actions: {
    setNewTitle: (s, title: string) => ({ ...s, newTitle: title }),
    setStatus: (s, status: 'idle' | 'loading' | 'saving' | 'error') => ({ ...s, status }),
    setOrders: (s, orders: Order[]) => ({ ...s, orders }),
    addOrder: (s, order: Order) => ({ ...s, orders: [...s.orders, order], newTitle: '' }),
  },

  effects: {
    refresh: {
      concurrency: 'latest-wins',
      handler: async ({ dispatch }) => {
        dispatch('setStatus', 'loading');
        try {
          dispatch('setOrders', await listOrders());
          dispatch('setStatus', 'idle');
        } catch {
          dispatch('setStatus', 'error');
        }
      },
    },
    submit: {
      concurrency: 'latest-wins',
      handler: async ({ state, dispatch }) => {
        if (!state.newTitle.trim()) return;
        dispatch('setStatus', 'saving');
        try {
          dispatch('addOrder', await createOrder(state.newTitle));
          dispatch('setStatus', 'idle');
        } catch {
          dispatch('setStatus', 'error');
        }
      },
    },
  },

  render: ({ state, emit }) =>
    h(
      'div',
      { class: 'orders-app', 'data-agent-id': 'root' },
      h('h1', { 'data-agent-id': 'title' }, 'OUMV Full-Stack Demo'),
      h('input', {
        type: 'text',
        placeholder: 'New order title',
        'data-agent-id': 'input-new-order',
        ...bind(emit.setNewTitle, state.newTitle),
      }),
      h(
        'button',
        { 'data-agent-id': 'btn-submit', onClick: () => emit.submit(), disabled: state.status === 'saving' },
        state.status === 'saving' ? 'Saving…' : 'Add order',
      ),
      h(
        'button',
        { 'data-agent-id': 'btn-refresh', onClick: () => emit.refresh() },
        'Refresh',
      ),
      h(
        'ul',
        { 'data-agent-id': 'order-list' },
        ...state.orders.map((order) =>
          h('li', { 'data-agent-id': `order-${order.id}` }, `#${order.id} — ${order.title} ×${order.quantity}`),
        ),
      ),
      h('p', { class: `status-${state.status}`, 'data-agent-id': 'status' }, state.status),
    ),
});
