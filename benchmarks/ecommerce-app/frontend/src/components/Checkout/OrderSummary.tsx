import type { CartItem } from '../../types/checkout.js';

export interface OrderSummaryProps {
  items: CartItem[];
  totalCents: number;
}

export const OrderSummary = ({ items, totalCents }: OrderSummaryProps) => {
  return (
    <div className="order-summary" aria-label="Order Summary">
      <h3>Order Items ({items.length})</h3>
      <ul className="items-list">
        {items.map((item) => (
          <li key={item.id} className="item-row">
            <span>{item.name} × {item.quantity}</span>
            <span>${((item.priceCents * item.quantity) / 100).toFixed(2)}</span>
          </li>
        ))}
      </ul>
      <div className="total-row">
        <strong>Total:</strong>
        <strong>${(totalCents / 100).toFixed(2)}</strong>
      </div>
    </div>
  );
};
