import { useMemo, useState } from 'react';
import type { CartLine, Product } from './types';
import { ProductGrid } from './components/ProductGrid';
import { CartPanel } from './components/CartPanel';
import { AdminDashboard } from './components/AdminDashboard';
import './App.css';
import { useProducts } from './hooks/useProducts';

type CartState = Record<string, CartLine>;

function App() {
  const { products, isLoading, error, refetch } = useProducts();
  const [cart, setCart] = useState<CartState>({});
  const [paymentReference, setPaymentReference] = useState<string | null>(null);
  const [view, setView] = useState<'kiosk' | 'admin'>('kiosk');

  const augmentedProducts = useMemo(() => {
    return products.map((product) => {
      const inCart = cart[product.id]?.quantity ?? 0;
      return { ...product, inventory: Math.max(0, product.inventory - inCart) };
    });
  }, [products, cart]);

  const cartLines = useMemo(() => Object.values(cart), [cart]);

  const cartTotal = useMemo(
    () => cartLines.reduce((sum, line) => sum + line.product.price * line.quantity, 0),
    [cartLines]
  );

  const handleAddToCart = (product: Product) => {
    const remaining = augmentedProducts.find((item) => item.id === product.id)?.inventory ?? 0;
    if (remaining <= 0) {
      return;
    }

    setPaymentReference(null);
    setCart((previous) => {
      const nextQuantity = (previous[product.id]?.quantity ?? 0) + 1;
      const next: CartState = { ...previous };
      next[product.id] = { product, quantity: nextQuantity };
      return next;
    });
  };

  const handleIncrease = (productId: string) => {
    const product = products.find((item) => item.id === productId);
    if (!product) {
      return;
    }

    handleAddToCart(product);
  };

  const handleDecrease = (productId: string) => {
    setPaymentReference(null);
    setCart((previous) => {
      const current = previous[productId];
      if (!current) {
        return previous;
      }

      if (current.quantity <= 1) {
        const { [productId]: _removed, ...rest } = previous;
        return rest;
      }

      return {
        ...previous,
        [productId]: {
          ...current,
          quantity: current.quantity - 1
        }
      };
    });
  };

  const handleClear = () => {
    setCart({});
    setPaymentReference(null);
  };

  const handleCheckout = () => {
    if (cartLines.length === 0) {
      return;
    }

    const reference = `QR-${Date.now().toString(36)}-${Math.floor(Math.random() * 10_000)
      .toString()
      .padStart(4, '0')}`;
    setPaymentReference(reference);
  };

  return (
    <div className={`app-shell ${view === 'admin' ? 'app-shell--admin' : ''}`}>
      <header className="top-bar">
        <h1 className="page-title">VibeCode Snack Kiosk</h1>
        <nav className="view-toggle" aria-label="View selection">
          <button
            type="button"
            className={`view-toggle__button ${view === 'kiosk' ? 'view-toggle__button--active' : ''}`}
            onClick={() => setView('kiosk')}
            aria-pressed={view === 'kiosk'}
          >
            Kiosk
          </button>
          <button
            type="button"
            className={`view-toggle__button ${view === 'admin' ? 'view-toggle__button--active' : ''}`}
            onClick={() => setView('admin')}
            aria-pressed={view === 'admin'}
          >
            Admin
          </button>
        </nav>
      </header>

      {view === 'kiosk' ? (
        <main className="kiosk-layout">
          {isLoading && <p role="status">Loading products…</p>}
          {error && (
            <div className="error-banner" role="alert">
              <p>{error}</p>
              <button type="button" onClick={refetch}>
                Retry
              </button>
            </div>
          )}
          <ProductGrid products={augmentedProducts} onAddToCart={handleAddToCart} />
          <CartPanel
            lines={cartLines}
            total={cartTotal}
            onIncrease={handleIncrease}
            onDecrease={handleDecrease}
            onClear={handleClear}
            onCheckout={handleCheckout}
            paymentReference={paymentReference}
          />
        </main>
      ) : (
        <main className="admin-layout">
          <AdminDashboard />
        </main>
      )}
    </div>
  );
}

export default App;
