import { useEffect, useMemo, useRef, useState } from 'react';
import type { CartLine, Product } from './types';
import { ProductGrid } from './components/ProductGrid';
import { CartPanel } from './components/CartPanel';
import { AdminDashboard } from './components/AdminDashboard';
import './App.css';
import { useProducts } from './hooks/useProducts';
import { useAdminAuth } from './providers/AdminAuthProvider';
import { AdminAuthPanel } from './components/AdminAuthPanel';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

type CartState = Record<string, CartLine>;

const determineViewFromLocation = (): 'kiosk' | 'admin' => {
  if (typeof window === 'undefined') {
    return 'kiosk';
  }

  const path = window.location.pathname.toLowerCase();
  return path.startsWith('/admin') ? 'admin' : 'kiosk';
};

const readAdminFlowIntent = (): 'invite' | 'reset' | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  const path = window.location.pathname.toLowerCase();
  if (path.startsWith('/admin/invite')) {
    return 'invite';
  }
  if (path.startsWith('/admin/reset')) {
    return 'reset';
  }

  return null;
};

function App() {
  const { products, isLoading, error, refetch } = useProducts();
  const { status: authStatus, admin, logout } = useAdminAuth();
  const [cart, setCart] = useState<CartState>({});
  const [isPaymentModalOpen, setPaymentModalOpen] = useState(false);
  const [isProcessingPayment, setProcessingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [view, setView] = useState<'kiosk' | 'admin'>(() => determineViewFromLocation());
  const [adminRefreshToken, setAdminRefreshToken] = useState(0);
  const previousAuthStatus = useRef(authStatus);

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
    setPaymentModalOpen(false);
    setProcessingPayment(false);
    setPaymentError(null);
  };

  const handleCheckout = () => {
    if (cartLines.length === 0) {
      return;
    }
    setPaymentError(null);
    setPaymentModalOpen(true);
  };

  const handlePaymentCancel = () => {
    if (isProcessingPayment) {
      return;
    }
    setPaymentModalOpen(false);
    setPaymentError(null);
  };

  const handlePaymentConfirm = async () => {
    if (isProcessingPayment) {
      return;
    }

    setProcessingPayment(true);
    setPaymentError(null);

    try {
      const items = cartLines.map((line) => ({ productId: line.product.id, quantity: line.quantity }));
      if (items.length === 0) {
        throw new Error('Cart is empty.');
      }

      const response = await fetch(`${API_URL}/purchases`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ items })
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        const message = errorBody?.message ?? `Failed to record purchase (${response.status})`;
        throw new Error(message);
      }

      setCart({});
      setPaymentModalOpen(false);
      setProcessingPayment(false);
      setPaymentError(null);

      await refetch();
      setAdminRefreshToken((token) => token + 1);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unexpected payment error.';
      setPaymentError(message);
      setProcessingPayment(false);
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handlePopState = () => {
      setView(determineViewFromLocation());
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const handleSwitchToKiosk = () => {
    setView('kiosk');

    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (url.pathname !== '/') {
        url.pathname = '/';
        url.search = '';
        window.history.pushState(window.history.state, document.title, url.toString());
      }
    }
  };

  const handleSwitchToAdmin = () => {
    setView('admin');
    if (authStatus === 'authenticated') {
      setAdminRefreshToken((token) => token + 1);
    }

    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      const normalizedPath = url.pathname.toLowerCase();
      if (!normalizedPath.startsWith('/admin')) {
        url.pathname = '/admin';
        url.search = '';
        window.history.pushState(window.history.state, document.title, url.toString());
      }
    }
  };

  useEffect(() => {
    if (view !== 'admin') {
      previousAuthStatus.current = authStatus;
      return;
    }

    if (previousAuthStatus.current !== 'authenticated' && authStatus === 'authenticated') {
      setAdminRefreshToken((token) => token + 1);
    }

    previousAuthStatus.current = authStatus;
  }, [authStatus, view]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (authStatus !== 'authenticated') {
      return;
    }

    const url = new URL(window.location.href);
    const path = url.pathname.toLowerCase();
    const hasToken = url.searchParams.has('token');

    if (!hasToken && (path.includes('/admin/invite') || path.includes('/admin/reset'))) {
      url.pathname = '/admin';
      window.history.replaceState(window.history.state, document.title, url.toString());
      setView('admin');
    }
  }, [authStatus]);

  const handleLogout = async () => {
    await logout();
    previousAuthStatus.current = 'unauthenticated';
  };

  const adminFlowIntent = readAdminFlowIntent();
  const shouldForceInviteFlow = adminFlowIntent === 'invite';
  const shouldForceResetFlow = adminFlowIntent === 'reset';
  const shouldRenderAuthPanel =
    view === 'admin' && (authStatus !== 'authenticated' || shouldForceInviteFlow || shouldForceResetFlow);

  return (
    <div className={`app-shell ${view === 'admin' ? 'app-shell--admin' : ''}`}>
      <header className="top-bar">
        <h1 className="page-title">VibeCode Snack Kiosk</h1>
        <div className="top-bar__actions">
          <nav className="view-toggle" aria-label="View selection">
            <button
              type="button"
              className={`view-toggle__button ${view === 'kiosk' ? 'view-toggle__button--active' : ''}`}
              onClick={handleSwitchToKiosk}
              aria-pressed={view === 'kiosk'}
            >
              Kiosk
            </button>
            <button
              type="button"
              className={`view-toggle__button ${view === 'admin' ? 'view-toggle__button--active' : ''}`}
              onClick={handleSwitchToAdmin}
              aria-pressed={view === 'admin'}
            >
              Admin
            </button>
          </nav>
          {view === 'admin' && authStatus === 'authenticated' ? (
            <button type="button" className="top-bar__logout" onClick={handleLogout} aria-label="Sign out">
              Sign out{admin ? ` (${admin.username})` : ''}
            </button>
          ) : null}
        </div>
      </header>

      {view === 'kiosk' ? (
        <div className="kiosk-container">
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
          </main>
          <aside className="kiosk-cart-float" aria-label="Shopping cart">
            <CartPanel
              lines={cartLines}
              total={cartTotal}
              onIncrease={handleIncrease}
              onDecrease={handleDecrease}
              onClear={handleClear}
              onCheckout={handleCheckout}
            />
          </aside>
        </div>
      ) : (
        <main className="admin-layout">
          {authStatus === 'loading' ? (
            <p className="admin-status" role="status">
              Verifying admin session…
            </p>
          ) : shouldRenderAuthPanel ? (
            <AdminAuthPanel />
          ) : authStatus === 'authenticated' ? (
            <AdminDashboard refreshToken={adminRefreshToken} />
          ) : (
            <AdminAuthPanel />
          )}
        </main>
      )}

      {isPaymentModalOpen ? (
        <div className="payment-modal" role="dialog" aria-modal="true" aria-labelledby="payment-modal-title">
          <div className="payment-modal__content">
            <h2 id="payment-modal-title">Scan to pay</h2>
            <div className="payment-modal__qr" aria-hidden="true">
              <span>QR Placeholder</span>
            </div>
            {paymentError ? (
              <p className="payment-modal__feedback payment-modal__feedback--error" role="alert">
                {paymentError}
              </p>
            ) : null}
            <div className="payment-modal__actions">
              <button
                type="button"
                className="payment-modal__button payment-modal__button--cancel"
                onClick={handlePaymentCancel}
                disabled={isProcessingPayment}
              >
                Cancel
              </button>
              <button
                type="button"
                className="payment-modal__button payment-modal__button--confirm"
                onClick={handlePaymentConfirm}
                disabled={isProcessingPayment}
              >
                {isProcessingPayment ? 'Processing…' : 'Confirm successful payment'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default App;
