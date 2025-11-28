import { ChangeEvent, FormEvent, useState } from 'react';
import { useAdminDashboard } from '../hooks/useAdminDashboard';
import type { AdminProduct } from '../types';
import { SalesOverview } from './SalesOverview';

type StatusKind = 'success' | 'error';

type StatusMessage = {
  kind: StatusKind;
  text: string;
};

type AdminProductRowProps = {
  product: AdminProduct;
  onSave: (id: string, payload: AdminProductUpdatePayload) => Promise<void>;
  onStatus: (kind: StatusKind, text: string) => void;
  onArchive: (product: AdminProduct) => void | Promise<void>;
  onUploadImage: (file: File) => Promise<{ url: string; filename: string }>;
  disabled?: boolean;
};

type AdminProductUpdatePayload = {
  title?: string;
  description?: string | null;
  price?: number;
  imageUrl?: string | null;
  inventoryCount?: number;
  isActive?: boolean;
  category?: string;
};

type CreateFormState = {
  title: string;
  description: string;
  price: string;
  imageUrl: string;
  inventoryCount: string;
  isActive: boolean;
  category: string;
};

const INITIAL_FORM: CreateFormState = {
  title: '',
  description: '',
  price: '',
  imageUrl: '',
  inventoryCount: '',
  isActive: true,
  category: ''
};

const CREATE_FIELD_IDS = {
  title: 'create-title',
  price: 'create-price',
  inventoryCount: 'create-inventory',
  description: 'create-description',
  imageFile: 'create-image-file',
  imageUrl: 'create-image-url',
  isActive: 'create-is-active',
  category: 'create-category'
} as const;

const COLLAPSIBLE_SECTION_IDS = {
  create: 'admin-section-create',
  catalog: 'admin-section-catalog',
  sales: 'admin-section-sales'
} as const;

type CollapsibleSectionKey = keyof typeof COLLAPSIBLE_SECTION_IDS;

export function AdminDashboard() {
  const {
    products,
    config,
    stats,
    isLoading,
    error,
    createProduct,
    updateProduct,
    toggleInventory,
    deleteProduct,
    refresh,
    uploadImage
  } = useAdminDashboard();
  const [formState, setFormState] = useState<CreateFormState>(INITIAL_FORM);
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<CollapsibleSectionKey, boolean>>({
    create: false,
    catalog: false,
    sales: false
  });

  const { create: isCreateOpen, catalog: isCatalogOpen, sales: isSalesOpen } = expandedSections;

  const handleStatus = (kind: StatusKind, text: string) => {
    setStatus({ kind, text });
  };

  const handleCreateImageUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setStatus(null);
    setIsUploadingImage(true);

    try {
      const result = await uploadImage(file);
      setFormState((prev) => ({ ...prev, imageUrl: result.url }));
      handleStatus('success', 'Image uploaded successfully.');
    } catch (err) {
      handleStatus('error', err instanceof Error ? err.message : 'Failed to upload image.');
    } finally {
      setIsUploadingImage(false);
      event.target.value = '';
    }
  };

  const handleCreateProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus(null);

    const title = formState.title.trim();
    const price = Number(formState.price);
    const inventory = Number(formState.inventoryCount);
    const category = formState.category.trim();

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
        isActive: formState.isActive,
        category: category || 'Uncategorized'
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

  const handleArchiveProduct = async (product: AdminProduct) => {
    const confirmMessage = `Archive ${product.title}? This hides it from the kiosk and clears remaining stock.`;
    const confirmed =
      typeof window !== 'undefined' && typeof window.confirm === 'function'
        ? window.confirm(confirmMessage)
        : true;

    if (!confirmed) {
      return;
    }

    setStatus(null);

    try {
      await deleteProduct(product.id);
      handleStatus('success', `${product.title} archived.`);
    } catch (err) {
      handleStatus('error', err instanceof Error ? err.message : 'Failed to archive product.');
    }
  };

  const handleRefresh = async () => {
    setStatus(null);
    await refresh();
  };

  const toggleSection = (section: CollapsibleSectionKey) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  return (
    <div className="admin-dashboard">
      {error && <div className="admin-banner admin-banner--error">{error}</div>}
      {status && !error && <div className={`admin-banner admin-banner--${status.kind}`}>{status.text}</div>}

      <div className="admin-dashboard__grid">
        <section className="admin-card admin-card--wide">
          <button
            type="button"
            className="admin-card__summary"
            onClick={() => toggleSection('create')}
            aria-expanded={isCreateOpen}
            aria-controls={COLLAPSIBLE_SECTION_IDS.create}
          >
            <span
              className={`admin-card__summary-icon${isCreateOpen ? ' admin-card__summary-icon--open' : ''}`}
              aria-hidden="true"
            />
            <div className="admin-card__summary-content">
              <h2>Inventory Controls</h2>
              <p className="admin-card__subtitle">Manage kiosk availability and create new catalog entries.</p>
            </div>
          </button>

          {isCreateOpen ? (
            <div id={COLLAPSIBLE_SECTION_IDS.create} className="admin-card__content">
              <div className="admin-card__actions">
                <button
                  type="button"
                  className="admin-button"
                  onClick={handleInventoryToggle}
                  disabled={!config || isLoading}
                >
                  {config?.inventoryEnabled ? 'Disable inventory gate' : 'Enable inventory gate'}
                </button>
              </div>

              <form className="admin-form admin-form--create" onSubmit={handleCreateProduct}>
                <h3 className="admin-form__title">Add a new product</h3>
                <div className="admin-form__rows">
                  <div className="admin-form__row">
                    <label htmlFor={CREATE_FIELD_IDS.title} className="admin-form__label">
                      Title
                    </label>
                    <input
                      id={CREATE_FIELD_IDS.title}
                      type="text"
                      className="admin-form__control"
                      value={formState.title}
                      onChange={(event) => setFormState((prev) => ({ ...prev, title: event.target.value }))}
                      placeholder="Cold Brew Coffee"
                      required
                    />
                  </div>

                  <div className="admin-form__row">
                    <label htmlFor={CREATE_FIELD_IDS.price} className="admin-form__label">
                      Price (€)
                    </label>
                    <input
                      id={CREATE_FIELD_IDS.price}
                      type="number"
                      min="0"
                      step="0.01"
                      className="admin-form__control"
                      value={formState.price}
                      onChange={(event) => setFormState((prev) => ({ ...prev, price: event.target.value }))}
                      placeholder="3.50"
                      required
                    />
                  </div>

                  <div className="admin-form__row">
                    <label htmlFor={CREATE_FIELD_IDS.category} className="admin-form__label">
                      Category
                    </label>
                    <input
                      id={CREATE_FIELD_IDS.category}
                      type="text"
                      className="admin-form__control"
                      value={formState.category}
                      onChange={(event) => setFormState((prev) => ({ ...prev, category: event.target.value }))}
                      placeholder="Beverages"
                    />
                  </div>

                  <div className="admin-form__row">
                    <label htmlFor={CREATE_FIELD_IDS.inventoryCount} className="admin-form__label">
                      Inventory
                    </label>
                    <input
                      id={CREATE_FIELD_IDS.inventoryCount}
                      type="number"
                      min="0"
                      step="1"
                      className="admin-form__control"
                      value={formState.inventoryCount}
                      onChange={(event) => setFormState((prev) => ({ ...prev, inventoryCount: event.target.value }))}
                      placeholder="12"
                      required
                    />
                  </div>

                  <div className="admin-form__row admin-form__row--textarea">
                    <label htmlFor={CREATE_FIELD_IDS.description} className="admin-form__label">
                      Description
                    </label>
                    <textarea
                      id={CREATE_FIELD_IDS.description}
                      className="admin-form__control admin-form__control--textarea"
                      value={formState.description}
                      onChange={(event) => setFormState((prev) => ({ ...prev, description: event.target.value }))}
                      rows={3}
                      placeholder="Tasting notes, allergens, or other helpful context"
                    />
                  </div>

                  <div className="admin-form__row admin-form__row--file">
                    <label htmlFor={CREATE_FIELD_IDS.imageFile} className="admin-form__label">
                      Product image
                    </label>
                    <div className="admin-form__control-group">
                      <input
                        id={CREATE_FIELD_IDS.imageFile}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="admin-form__control admin-form__control--file"
                        onChange={handleCreateImageUpload}
                        disabled={isUploadingImage || isLoading}
                      />
                      <small className="admin-form__help">
                        {isUploadingImage
                          ? 'Uploading image…'
                          : formState.imageUrl
                            ? `Image URL set to ${formState.imageUrl}`
                            : 'Upload a new image or paste a URL below.'}
                      </small>
                    </div>
                  </div>

                  <div className="admin-form__row">
                    <label htmlFor={CREATE_FIELD_IDS.imageUrl} className="admin-form__label">
                      Image URL
                    </label>
                    <input
                      id={CREATE_FIELD_IDS.imageUrl}
                      type="text"
                      inputMode="url"
                      className="admin-form__control"
                      value={formState.imageUrl}
                      onChange={(event) => setFormState((prev) => ({ ...prev, imageUrl: event.target.value }))}
                      placeholder="https://images.example.com/item.jpg"
                    />
                  </div>

                  <div className="admin-form__row admin-form__row--checkbox">
                    <span className="admin-form__label">Status</span>
                    <label className="admin-form__checkbox" htmlFor={CREATE_FIELD_IDS.isActive}>
                      <input
                        id={CREATE_FIELD_IDS.isActive}
                        type="checkbox"
                        checked={formState.isActive}
                        onChange={(event) => setFormState((prev) => ({ ...prev, isActive: event.target.checked }))}
                      />
                      <span>Active in kiosk</span>
                    </label>
                  </div>
                </div>

                <div className="admin-form__actions">
                  <button
                    type="submit"
                    className="admin-button admin-button--primary"
                    disabled={isLoading || isUploadingImage}
                  >
                    Add Product
                  </button>
                </div>
              </form>
            </div>
          ) : null}
        </section>

        <section className="admin-card admin-card--wide">
          <button
            type="button"
            className="admin-card__summary"
            onClick={() => toggleSection('catalog')}
            aria-expanded={isCatalogOpen}
            aria-controls={COLLAPSIBLE_SECTION_IDS.catalog}
          >
            <span
              className={`admin-card__summary-icon${isCatalogOpen ? ' admin-card__summary-icon--open' : ''}`}
              aria-hidden="true"
            />
            <div className="admin-card__summary-content">
              <h2>Product Catalog</h2>
              <p className="admin-card__subtitle">Edit prices, inventory, and visibility in real time.</p>
            </div>
          </button>

          {isCatalogOpen ? (
            <div id={COLLAPSIBLE_SECTION_IDS.catalog} className="admin-card__content">
              <div className="admin-card__actions">
                <button
                  type="button"
                  className="admin-button admin-button--ghost"
                  onClick={handleRefresh}
                  disabled={isLoading}
                >
                  Refresh
                </button>
              </div>

              <div className="admin-product-list" aria-live="polite">
                {products.length === 0 ? (
                  <p className="admin-empty">{isLoading ? 'Loading products…' : 'No products available yet.'}</p>
                ) : (
                  products.map((product) => (
                    <AdminProductRow
                      key={`${product.id}-${product.updatedAt}`}
                      product={product}
                      onSave={updateProduct}
                      onArchive={handleArchiveProduct}
                      onStatus={handleStatus}
                      onUploadImage={uploadImage}
                      disabled={isLoading}
                    />
                  ))
                )}
              </div>
            </div>
          ) : null}
        </section>

        <section className="admin-card admin-card--wide">
          <button
            type="button"
            className="admin-card__summary"
            onClick={() => toggleSection('sales')}
            aria-expanded={isSalesOpen}
            aria-controls={COLLAPSIBLE_SECTION_IDS.sales}
          >
            <span
              className={`admin-card__summary-icon${isSalesOpen ? ' admin-card__summary-icon--open' : ''}`}
              aria-hidden="true"
            />
            <div className="admin-card__summary-content">
              <h2>Sales Overview</h2>
              <p className="admin-card__subtitle">Track demand trends and kiosk performance.</p>
            </div>
          </button>

          {isSalesOpen ? (
            <div id={COLLAPSIBLE_SECTION_IDS.sales} className="admin-card__content">
              <SalesOverview stats={stats} isLoading={isLoading} />
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function AdminProductRow({ product, onSave, onStatus, onArchive, onUploadImage, disabled }: AdminProductRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [formState, setFormState] = useState({
    title: product.title,
    description: product.description,
    price: product.price.toFixed(2),
    imageUrl: product.imageUrl ?? '',
    inventoryCount: product.inventoryCount.toString(),
    isActive: product.isActive,
    category: product.category
  });
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const title = formState.title.trim();
    const price = Number(formState.price);
    const inventory = Number(formState.inventoryCount);
    const category = formState.category.trim();

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
        isActive: formState.isActive,
        category: category || 'Uncategorized'
      });
      onStatus('success', `${title} updated.`);
      setIsEditing(false);
    } catch (err) {
      onStatus('error', err instanceof Error ? err.message : 'Failed to update product.');
    }
  };

  const handleImageUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setIsUploadingImage(true);
    onStatus('success', 'Uploading image…');

    try {
      const result = await onUploadImage(file);
      setFormState((prev) => ({ ...prev, imageUrl: result.url }));
      onStatus('success', 'Image uploaded successfully.');
    } catch (err) {
      onStatus('error', err instanceof Error ? err.message : 'Failed to upload image.');
    } finally {
      setIsUploadingImage(false);
      event.target.value = '';
    }
  };

  return (
    <article className="admin-product">
      <header className="admin-product__header">
        <div>
          <h3>{product.title}</h3>
          <p className="admin-product__meta">
            {product.isActive ? 'Active' : 'Hidden'} · {product.inventoryCount} in stock · {product.category}
          </p>
        </div>
        <div className="admin-product__actions">
          <button
            type="button"
            className="admin-button admin-button--ghost"
            onClick={() => setIsEditing((prev) => !prev)}
            disabled={disabled}
          >
            {isEditing ? 'Cancel' : 'Edit'}
          </button>
          <button
            type="button"
            className="admin-button admin-button--danger"
            onClick={() => void onArchive(product)}
            disabled={disabled}
          >
            Archive
          </button>
        </div>
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
              <span>Category</span>
              <input
                type="text"
                value={formState.category}
                onChange={(event) => setFormState((prev) => ({ ...prev, category: event.target.value }))}
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
              <span>Product image</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleImageUpload}
                disabled={disabled || isUploadingImage}
              />
              <small>
                {isUploadingImage
                  ? 'Uploading image…'
                  : formState.imageUrl
                    ? `Image URL set to ${formState.imageUrl}`
                    : 'Upload a new image or paste a URL below.'}
              </small>
            </label>
            <label className="admin-field admin-field--full">
              <span>Image URL</span>
              <input
                type="text"
                inputMode="url"
                value={formState.imageUrl}
                onChange={(event) => setFormState((prev) => ({ ...prev, imageUrl: event.target.value }))}
                disabled={isUploadingImage}
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
            <button
              type="submit"
              className="admin-button admin-button--primary"
              disabled={disabled || isUploadingImage}
            >
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
              <dt>Category</dt>
              <dd>{product.category}</dd>
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
