import type { PaymentMethodType } from '../../types/checkout.js';

export interface PaymentMethodSelectorProps {
  selected: PaymentMethodType;
  onChange: (method: PaymentMethodType) => void;
  disabled?: boolean;
}

export const PaymentMethodSelector = ({ selected, onChange, disabled }: PaymentMethodSelectorProps) => {
  return (
    <div className="payment-method-selector" role="radiogroup" aria-label="Payment Method">
      {(['card', 'apple_pay', 'crypto'] as PaymentMethodType[]).map((method) => (
        <button
          key={method}
          type="button"
          role="radio"
          aria-checked={selected === method}
          disabled={disabled}
          onClick={() => onChange(method)}
          className={`method-btn ${selected === method ? 'active' : ''}`}
        >
          {method.toUpperCase().replace('_', ' ')}
        </button>
      ))}
    </div>
  );
};
