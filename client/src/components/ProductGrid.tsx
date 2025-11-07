import type { Product } from '../types';

export type ProductGridProps = {
  products: Product[];
  onAddToCart: (product: Product) => void;
};

export function ProductGrid({ products, onAddToCart }: ProductGridProps) {
  return (
    <section className="product-grid" aria-label="Available products">
      {products.map((product) => {
        const isOutOfStock = product.inventory <= 0;

        return (
          <article key={product.id} className="product-card">
            <img
              src={product.imageUrl}
              alt={product.title}
              loading="lazy"
              className="product-card__image"
            />
            <div className="product-card__body">
              <h2 className="product-card__title">{product.title}</h2>
              <p className="product-card__description">{product.description}</p>
              <div className="product-card__meta">
                <span className="product-card__price">€{product.price.toFixed(2)}</span>
                <span className="product-card__inventory" aria-live="polite">
                  {isOutOfStock ? 'Sold out' : `${product.inventory} left`}
                </span>
              </div>
              <button
                type="button"
                className="product-card__add"
                onClick={() => onAddToCart(product)}
                disabled={isOutOfStock}
              >
                {isOutOfStock ? 'Unavailable' : 'Add to cart'}
              </button>
            </div>
          </article>
        );
      })}
    </section>
  );
}
