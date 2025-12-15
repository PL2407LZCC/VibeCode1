import type { CartLine } from '../types';

export type CartPanelProps = {
  lines: CartLine[];
  total: number;
  onIncrease: (productId: string) => void;
  onDecrease: (productId: string) => void;
  onClear: () => void;
  onCheckout: () => void;
};

export function CartPanel({
  lines,
  total,
  onIncrease,
  onDecrease,
  onClear,
  onCheckout
}: CartPanelProps) {
  const isEmpty = lines.length === 0;

  return (
    <aside className="cart-panel" aria-label="Shopping cart">
      <header className="cart-panel__header">
        <h2>Kiosk Cart</h2>
        <button type="button" className="cart-panel__clear" onClick={onClear} disabled={isEmpty}>
          Clear
        </button>
      </header>
      <div className="cart-panel__content" role="list">
        {lines.map((line) => (
          <div key={line.product.id} className="cart-line" role="listitem">
            <div>
              <p className="cart-line__title">{line.product.title}</p>
              <p className="cart-line__price">€{line.product.price.toFixed(2)}</p>
            </div>
            <div className="cart-line__controls">
              <button type="button" onClick={() => onDecrease(line.product.id)} aria-label="Decrease quantity">
                –
              </button>
              <span aria-live="polite" className="cart-line__quantity">
                {line.quantity}
              </span>
              <button type="button" onClick={() => onIncrease(line.product.id)} aria-label="Increase quantity">
                +
              </button>
            </div>
          </div>
        ))}

        {isEmpty && <p className="cart-panel__empty">Select snacks to start an order.</p>}
      </div>
      <footer className="cart-panel__footer">
        <div className="cart-panel__total">
          <span>Total</span>
          <strong>€{total.toFixed(2)}</strong>
        </div>
        <button
          type="button"
          className="cart-panel__checkout"
          onClick={onCheckout}
          disabled={isEmpty}
        >
          Pay
        </button>
      </footer>
    </aside>
  );
}
