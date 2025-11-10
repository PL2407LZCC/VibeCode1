import { useCallback, useEffect, useState } from 'react';
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
    price: 2.5,
    imageUrl: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=480&q=80',
    inventory: 0
  }
];

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export function useProducts(): ProductsState {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProducts = useCallback(async () => {
    setIsLoading(true);
    setError(null);

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
            price: Number(item.price ?? 0),
            imageUrl: item.imageUrl ?? '',
            inventory: Number(item.inventory ?? item.inventoryCount ?? 0)
          }))
        : [];

      setProducts(parsed.length > 0 ? parsed : FALLBACK_PRODUCTS);
    } catch (err) {
      console.error('Failed to fetch products', err);
      setError(err instanceof Error ? err.message : 'Unknown error fetching products');
      setProducts(FALLBACK_PRODUCTS);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  return {
    products,
    isLoading,
    error,
    refetch: fetchProducts
  };
}
