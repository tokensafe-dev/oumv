import React, { useState } from 'react';
import type { CartState } from '../../store/cartStore.js';
import { PaymentMethodSelector } from './PaymentMethodSelector.js';
import { OrderSummary } from './OrderSummary.js';
import { submitCheckout } from '../../api/checkoutClient.js';

export interface CheckoutModalProps {
  cart: CartState;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (orderId: string) => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  cart,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [phone, setPhone] = useState(cart.phone);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handlePay = async () => {
    if (!phone || phone.length < 5) {
      setError('Invalid contact phone');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await submitCheckout({
        cartId: 'cart_current_user',
        customerId: 'cust_8921',
        paymentMethod: cart.paymentMethod,
        phone: phone,
        shippingAddress: {
          street: '123 Market St',
          city: 'San Francisco',
          postalCode: '94105',
          country: 'USA',
        },
      });

      setLoading(false);
      onSuccess(response.orderId);
    } catch (err: any) {
      setLoading(false);
      setError(err.message || 'Payment failed');
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="checkout-title">
      <div className="modal-content">
        <h2 id="checkout-title">Complete Your Order</h2>

        <OrderSummary items={cart.items} totalCents={cart.getTotalCents()} />

        <div className="form-group">
          <label htmlFor="phone-input">Contact Phone</label>
          <input
            id="phone-input"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={loading}
            aria-required="true"
          />
        </div>

        <PaymentMethodSelector
          selected={cart.paymentMethod}
          onChange={cart.setPaymentMethod}
          disabled={loading}
        />

        {error && <div className="error-banner" role="alert">{error}</div>}

        <div className="modal-actions">
          <button type="button" onClick={onClose} disabled={loading} className="btn-secondary">
            Cancel
          </button>
          <button
            type="button"
            id="btn-submit-order"
            onClick={handlePay}
            disabled={loading || cart.items.length === 0}
            className="btn-primary"
          >
            {loading ? 'Processing...' : `Pay $${(cart.getTotalCents() / 100).toFixed(2)}`}
          </button>
        </div>
      </div>
    </div>
  );
};
