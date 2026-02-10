import { useCallback, useEffect, useRef, useState } from 'react';
import type { Product } from '../types';

export type ProductsState = {
  products: Product[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
};

const FALLBACK_PRODUCTS: Product[] = [
  {
    id: 'demo-coffee',
    title: 'Filter Coffee',
    description: 'Fallback product: refresh to retry.',
    category: 'Uncategorized',
    price: 2.5,
    imageUrl: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=480&q=80',
    inventory: 0
  }
];

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

const RETRY_DELAYS_MS = [750, 1500, 3000, 6000];

const resolveImageUrl = (rawUrl: unknown) => {
  if (typeof rawUrl !== 'string' || rawUrl.trim().length === 0) {
    return '';
  }

  if (/^(https?:)?\/\//i.test(rawUrl) || rawUrl.startsWith('data:')) {
    return rawUrl;
  }

  try {
    if (rawUrl.startsWith('/uploads/')) {
      return new URL(rawUrl, API_URL).toString();
    }

  const clientBase = typeof window !== 'undefined' ? window.location.origin : API_URL;
    return new URL(rawUrl, clientBase).toString();
  } catch {
    return rawUrl;
  }
};

export function useProducts(): ProductsState {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const retryStateRef = useRef<{ attempt: number; timeoutId: ReturnType<typeof setTimeout> | null }>({
    attempt: 0,
    timeoutId: null
  });
  const initialLoadRef = useRef(true);

  const clearScheduledRetry = useCallback(() => {
    if (retryStateRef.current.timeoutId !== null) {
      clearTimeout(retryStateRef.current.timeoutId);
      retryStateRef.current.timeoutId = null;
    }
  }, []);

  const fetchProducts = useCallback(async ({ isAutoRetry = false }: { isAutoRetry?: boolean } = {}) => {
    if (!isAutoRetry) {
      retryStateRef.current.attempt = 0;
      clearScheduledRetry();
    }

    setIsLoading(true);
    if (!isAutoRetry) {
      setError(null);
    }

    try {
      const response = await fetch(`${API_URL}/products`);
      if (!response.ok) {
        throw new Error(`Failed to load products (${response.status})`);
      }

      const payload = await response.json();
      const parsed: Product[] = Array.isArray(payload.items)
        ? payload.items.map((item: any) => ({
            id: item.id,
            title: item.title,
            description: item.description ?? '',
            category:
              typeof item.category === 'string' && item.category.trim().length > 0 ? item.category : 'Uncategorized',
            price: Number(item.price ?? 0),
            imageUrl: resolveImageUrl(item.imageUrl),
            inventory: Number(item.inventory ?? item.inventoryCount ?? 0)
          }))
        : [];

      setProducts(parsed.length > 0 ? parsed : FALLBACK_PRODUCTS);
      retryStateRef.current.attempt = 0;
      clearScheduledRetry();
      initialLoadRef.current = false;
      setError(null);
    } catch (err) {
      console.error('Failed to fetch products', err);
      const attempt = retryStateRef.current.attempt;
      const willRetry = attempt < RETRY_DELAYS_MS.length;
      const isInitialLoad = initialLoadRef.current;

      const message = err instanceof Error ? err.message : 'Unknown error fetching products';
      const shouldSurfaceError = !isInitialLoad || !willRetry;

      if (shouldSurfaceError) {
        setError(message);
      }

      setProducts((previous) => {
        if (previous.length > 0) {
          return previous;
        }
        return shouldSurfaceError ? FALLBACK_PRODUCTS : [];
      });

      clearScheduledRetry();

      if (willRetry) {
        const delay = RETRY_DELAYS_MS[attempt];
        retryStateRef.current.attempt += 1;
        retryStateRef.current.timeoutId = setTimeout(() => {
          void fetchProducts({ isAutoRetry: true });
        }, delay);
      }
    } finally {
      const shouldKeepLoading = initialLoadRef.current && retryStateRef.current.timeoutId !== null;
      setIsLoading(shouldKeepLoading ? true : false);
    }
  }, [clearScheduledRetry]);

  useEffect(() => {
    void fetchProducts();

    return () => {
      clearScheduledRetry();
    };
  }, [fetchProducts, clearScheduledRetry]);

  return {
    products,
    isLoading,
    error,
    refetch: () => fetchProducts()
  };
}
