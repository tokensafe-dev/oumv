export interface CartItem {
  id: string;
  sku: string;
  name: string;
  priceCents: number;
  quantity: number;
}

export type PaymentMethodType = 'card' | 'apple_pay' | 'crypto';

export interface CheckoutRequest {
  cartId: string;
  customerId: string;
  paymentMethod: PaymentMethodType;
  phone: string; // Target field for Scenario 3 & 4 contract mutation
  shippingAddress: {
    street: string;
    city: string;
    postalCode: string;
    country: string;
  };
}

export interface CheckoutResponse {
  orderId: string;
  status: 'pending' | 'confirmed' | 'failed';
  totalCents: number;
  transactionHash?: string;
  createdAt: string;
}
