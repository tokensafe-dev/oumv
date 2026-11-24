import type { CartItem, PaymentMethodType } from '../types/checkout.js';

export interface CartState {
  items: CartItem[];
  paymentMethod: PaymentMethodType;
  phone: string;
  isSubmitting: boolean;
  orderError: string | null;
  lastOrderId: string | null;
  setPaymentMethod: (method: PaymentMethodType) => void;
  setPhone: (phone: string) => void;
  addItem: (item: CartItem) => void;
  removeItem: (id: string) => void;
  getTotalCents: () => number;
}

export function createCartStore(initialItems: CartItem[] = []): CartState {
  const items = [...initialItems];
  let paymentMethod: PaymentMethodType = 'card';
  let phone = '+15550192834';
  let isSubmitting = false;
  let orderError: string | null = null;
  let lastOrderId: string | null = null;

  return {
    items,
    paymentMethod,
    phone,
    isSubmitting,
    orderError,
    lastOrderId,
    setPaymentMethod: (m) => { paymentMethod = m; },
    setPhone: (p) => { phone = p; },
    addItem: (item) => { items.push(item); },
    removeItem: (id) => {
      const idx = items.findIndex(i => i.id === id);
      if (idx !== -1) items.splice(idx, 1);
    },
    getTotalCents: () => items.reduce((sum, item) => sum + (item.priceCents * item.quantity), 0)
  };
}
