import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useAdminDashboard } from '../hooks/useAdminDashboard';
import type { AdminProduct } from '../types';

type StatusKind = 'success' | 'error';

type StatusMessage = {
  kind: StatusKind;
  text: string;
};

type AdminProductRowProps = {
  product: AdminProduct;
  onSave: (id: string, payload: AdminProductUpdatePayload) => Promise<void>;
  onStatus: (kind: StatusKind, text: string) => void;
  disabled?: boolean;
};

type AdminProductUpdatePayload = {
  title?: string;
  description?: string | null;
  price?: number;
  imageUrl?: string | null;
  inventoryCount?: number;
  isActive?: boolean;
};

type CreateFormState = {
  title: string;
  description: string;
  price: string;
  imageUrl: string;
  inventoryCount: string;
  isActive: boolean;
};

const INITIAL_FORM: CreateFormState = {
  title: '',
  description: '',
  price: '',
  imageUrl: '',
  inventoryCount: '',
  isActive: true
};

export function AdminDashboard() {
  const { products, config, stats, isLoading, error, createProduct, updateProduct, toggleInventory, refresh } =
    useAdminDashboard();
  const [formState, setFormState] = useState<CreateFormState>(INITIAL_FORM);
  const [status, setStatus] = useState<StatusMessage | null>(null);

  const handleStatus = (kind: StatusKind, text: string) => {
    setStatus({ kind, text });
  };

  const handleCreateProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus(null);

    const title = formState.title.trim();
    const price = Number(formState.price);
    const inventory = Number(formState.inventoryCount);

    if (!title) {
      handleStatus('error', 'Title is required.');
      return;
    }

    if (!Number.isFinite(price) || price <= 0) {
      handleStatus('error', 'Price must be a positive number.');
      return;
    }

    if (!Number.isInteger(inventory) || inventory < 0) {
      handleStatus('error', 'Inventory must be a non-negative integer.');
      return;
    }

    try {
      await createProduct({
        title,
        description: formState.description.trim() || undefined,
        price,
        imageUrl: formState.imageUrl.trim() || undefined,
        inventoryCount: inventory,
        isActive: formState.isActive
      });
      setFormState(INITIAL_FORM);
      handleStatus('success', 'Product created successfully.');
    } catch (err) {
      handleStatus('error', err instanceof Error ? err.message : 'Failed to create product.');
    }
  };

  const handleInventoryToggle = async () => {
    if (!config) {
      return;
    }
    setStatus(null);
    try {
      await toggleInventory(!config.inventoryEnabled);
      handleStatus('success', `Inventory enforcement ${config.inventoryEnabled ? 'disabled' : 'enabled'}.`);
    } catch (err) {
      handleStatus('error', err instanceof Error ? err.message : 'Failed to update kiosk settings.');
    }
  };

  const handleRefresh = async () => {
    setStatus(null);
    await refresh();
  };

  const dailyMax = useMemo(() => {
    if (!stats || stats.daily.length === 0) {
      return 1;
    }
    return Math.max(...stats.daily.map((bucket) => bucket.total), 1);
  }, [stats]);

  const weeklyMax = useMemo(() => {
    if (!stats || stats.weekly.length === 0) {
      return 1;
    }
    return Math.max(...stats.weekly.map((bucket) => bucket.total), 1);
  }, [stats]);

  return (
    <div className="admin-dashboard">
      {error && <div className="admin-banner admin-banner--error">{error}</div>}
      {status && !error && <div className={`admin-banner admin-banner--${status.kind}`}>{status.text}</div>}

      <div className="admin-dashboard__grid">
        <section className="admin-card admin-card--wide">
          <header className="admin-card__header">
            <div>
              <h2>Inventory Controls</h2>
              <p className="admin-card__subtitle">Manage kiosk availability and create new catalog entries.</p>
            </div>
            <button type="button" className="admin-button" onClick={handleInventoryToggle} disabled={!config || isLoading}>
              {config?.inventoryEnabled ? 'Disable inventory gate' : 'Enable inventory gate'}
            </button>
          </header>

          <form className="admin-form" onSubmit={handleCreateProduct}>
            <div className="admin-form__grid">
              <label className="admin-field">
                <span>Title</span>
                <input
                  type="text"
                  value={formState.title}
                  onChange={(event) => setFormState((prev) => ({ ...prev, title: event.target.value }))}
                  placeholder="Cold Brew Coffee"
                  required
                />
              </label>

              <label className="admin-field">
                <span>Price (€)</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formState.price}
                  onChange={(event) => setFormState((prev) => ({ ...prev, price: event.target.value }))}
                  placeholder="3.50"
                  required
                />
              </label>

              <label className="admin-field">
                <span>Inventory</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={formState.inventoryCount}
                  onChange={(event) => setFormState((prev) => ({ ...prev, inventoryCount: event.target.value }))}
                  placeholder="12"
                  required
                />
              </label>

              <label className="admin-field admin-field--full">
                <span>Description</span>
                <textarea
                  value={formState.description}
                  onChange={(event) => setFormState((prev) => ({ ...prev, description: event.target.value }))}
                  rows={2}
                  placeholder="Tasting notes, allergens, or other helpful context"
                />
              </label>

              <label className="admin-field admin-field--full">
                <span>Image URL</span>
                <input
                  type="url"
                  value={formState.imageUrl}
                  onChange={(event) => setFormState((prev) => ({ ...prev, imageUrl: event.target.value }))}
                  placeholder="https://images.example.com/item.jpg"
                />
              </label>

              <label className="admin-checkbox">
                <input
                  type="checkbox"
                  checked={formState.isActive}
                  onChange={(event) => setFormState((prev) => ({ ...prev, isActive: event.target.checked }))}
                />
                <span>Active in kiosk</span>
              </label>
            </div>

            <div className="admin-form__actions">
              <button type="submit" className="admin-button admin-button--primary" disabled={isLoading}>
                Add Product
              </button>
            </div>
          </form>
        </section>

        <section className="admin-card admin-card--wide">
          <header className="admin-card__header">
            <div>
              <h2>Product Catalog</h2>
              <p className="admin-card__subtitle">Edit prices, inventory, and visibility in real time.</p>
            </div>
            <button type="button" className="admin-button admin-button--ghost" onClick={handleRefresh} disabled={isLoading}>
              Refresh
            </button>
          </header>

          <div className="admin-product-list" aria-live="polite">
            {products.length === 0 ? (
              <p className="admin-empty">{isLoading ? 'Loading products…' : 'No products available yet.'}</p>
            ) : (
              products.map((product) => (
                <AdminProductRow
                  key={product.id}
                  product={product}
                  onSave={updateProduct}
                  onStatus={handleStatus}
                  disabled={isLoading}
                />
              ))
            )}
          </div>
        </section>

        <section className="admin-card">
          <header className="admin-card__header">
            <div>
              <h2>Sales Overview</h2>
              <p className="admin-card__subtitle">Track demand trends and kiosk performance.</p>
            </div>
          </header>

          {!stats ? (
            <p className="admin-empty">{isLoading ? 'Loading analytics…' : 'No sales recorded yet.'}</p>
          ) : (
            <div className="admin-stats">
              <dl className="admin-metrics">
                <div>
                  <dt>Total revenue</dt>
                  <dd>€{stats.totalRevenue.toFixed(2)}</dd>
                </div>
                <div>
                  <dt>Transactions</dt>
                  <dd>{stats.totalTransactions}</dd>
                </div>
                <div>
                  <dt>Items sold</dt>
                  <dd>{stats.itemsSold}</dd>
                </div>
              </dl>

              <div className="admin-charts">
                <div>
                  <h3>Last 7 days</h3>
                  <ul className="admin-chart" role="list">
                    {stats.daily.map((bucket) => {
                      const percentage = dailyMax === 0 ? 0 : Math.round((bucket.total / dailyMax) * 100);
                      return (
                        <li key={bucket.date}>
                          <span className="admin-chart__label">{bucket.date}</span>
                          <div className="admin-chart__bar" aria-label={`${bucket.total.toFixed(2)} revenue`}> 
                            <span style={{ width: `${percentage}%` }} />
                          </div>
                          <span className="admin-chart__value">€{bucket.total.toFixed(2)}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                <div>
                  <h3>Last 4 weeks</h3>
                  <ul className="admin-chart" role="list">
                    {stats.weekly.map((bucket) => {
                      const percentage = weeklyMax === 0 ? 0 : Math.round((bucket.total / weeklyMax) * 100);
                      return (
                        <li key={bucket.weekStart}>
                          <span className="admin-chart__label">Week of {bucket.weekStart}</span>
                          <div className="admin-chart__bar" aria-label={`${bucket.total.toFixed(2)} revenue`}>
                            <span style={{ width: `${percentage}%` }} />
                          </div>
                          <span className="admin-chart__value">€{bucket.total.toFixed(2)}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function AdminProductRow({ product, onSave, onStatus, disabled }: AdminProductRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [formState, setFormState] = useState({
    title: product.title,
    description: product.description,
    price: product.price.toFixed(2),
    imageUrl: product.imageUrl ?? '',
    inventoryCount: product.inventoryCount.toString(),
    isActive: product.isActive
  });

  useEffect(() => {
    setFormState({
      title: product.title,
      description: product.description,
      price: product.price.toFixed(2),
      imageUrl: product.imageUrl ?? '',
      inventoryCount: product.inventoryCount.toString(),
      isActive: product.isActive
    });
  }, [product.id, product.title, product.description, product.price, product.imageUrl, product.inventoryCount, product.isActive]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const title = formState.title.trim();
    const price = Number(formState.price);
    const inventory = Number(formState.inventoryCount);

    if (!title) {
      onStatus('error', 'Title is required.');
      return;
    }

    if (!Number.isFinite(price) || price <= 0) {
      onStatus('error', 'Price must be a positive number.');
      return;
    }

    if (!Number.isInteger(inventory) || inventory < 0) {
      onStatus('error', 'Inventory must be a non-negative integer.');
      return;
    }

    try {
      await onSave(product.id, {
        title,
        description: formState.description.trim(),
        price,
        imageUrl: formState.imageUrl.trim() || null,
        inventoryCount: inventory,
        isActive: formState.isActive
      });
      onStatus('success', `${title} updated.`);
      setIsEditing(false);
    } catch (err) {
      onStatus('error', err instanceof Error ? err.message : 'Failed to update product.');
    }
  };

  return (
    <article className="admin-product">
      <header className="admin-product__header">
        <div>
          <h3>{product.title}</h3>
          <p className="admin-product__meta">
            {product.isActive ? 'Active' : 'Hidden'} · {product.inventoryCount} in stock
          </p>
        </div>
        <button
          type="button"
          className="admin-button admin-button--ghost"
          onClick={() => setIsEditing((prev) => !prev)}
          disabled={disabled}
        >
          {isEditing ? 'Cancel' : 'Edit'}
        </button>
      </header>

      {isEditing ? (
        <form className="admin-product__form" onSubmit={handleSubmit}>
          <div className="admin-form__grid">
            <label className="admin-field">
              <span>Title</span>
              <input
                type="text"
                value={formState.title}
                onChange={(event) => setFormState((prev) => ({ ...prev, title: event.target.value }))}
                required
              />
            </label>
            <label className="admin-field">
              <span>Price (€)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={formState.price}
                onChange={(event) => setFormState((prev) => ({ ...prev, price: event.target.value }))}
                required
              />
            </label>
            <label className="admin-field">
              <span>Inventory</span>
              <input
                type="number"
                min="0"
                step="1"
                value={formState.inventoryCount}
                onChange={(event) => setFormState((prev) => ({ ...prev, inventoryCount: event.target.value }))}
                required
              />
            </label>
            <label className="admin-field admin-field--full">
              <span>Description</span>
              <textarea
                rows={2}
                value={formState.description}
                onChange={(event) => setFormState((prev) => ({ ...prev, description: event.target.value }))}
              />
            </label>
            <label className="admin-field admin-field--full">
              <span>Image URL</span>
              <input
                type="url"
                value={formState.imageUrl}
                onChange={(event) => setFormState((prev) => ({ ...prev, imageUrl: event.target.value }))}
              />
            </label>
            <label className="admin-checkbox">
              <input
                type="checkbox"
                checked={formState.isActive}
                onChange={(event) => setFormState((prev) => ({ ...prev, isActive: event.target.checked }))}
              />
              <span>Active in kiosk</span>
            </label>
          </div>

          <div className="admin-form__actions">
            <button type="submit" className="admin-button admin-button--primary" disabled={disabled}>
              Save changes
            </button>
          </div>
        </form>
      ) : (
        <div className="admin-product__details">
          <p>{product.description || 'No description provided.'}</p>
          <dl>
            <div>
              <dt>Price</dt>
              <dd>€{product.price.toFixed(2)}</dd>
            </div>
            <div>
              <dt>Inventory</dt>
              <dd>{product.inventoryCount}</dd>
            </div>
            <div>
              <dt>Updated</dt>
              <dd>{new Date(product.updatedAt).toLocaleString()}</dd>
            </div>
          </dl>
        </div>
      )}
    </article>
  );
}
