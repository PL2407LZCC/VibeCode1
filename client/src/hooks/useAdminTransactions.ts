import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ADMIN_TOKEN_MISSING_MESSAGE } from './useAdminDashboard';
import type { AdminTransaction, AdminTransactionsResponse, TransactionRange } from '../types';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

type TransactionFilters = {
  startDate: string;
  endDate: string;
  category: string | null;
};

const addDaysUtc = (date: Date, amount: number) => {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + amount);
  return copy;
};

const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);

const createDefaultFilters = (): TransactionFilters => {
  const today = new Date();
  const endDate = toIsoDate(today);
  const startDate = toIsoDate(addDaysUtc(today, -6));
  return {
    startDate,
    endDate,
    category: null
  };
};

type UseAdminTransactionsState = {
  transactions: AdminTransaction[];
  categories: string[];
  range: TransactionRange | null;
  categoryFilter: string | null;
  appliedFilters: TransactionFilters;
  isLoading: boolean;
  error: string | null;
  fetchTransactions: (overrides?: Partial<TransactionFilters>) => Promise<void>;
};

export type { TransactionFilters };

export function useAdminTransactions(initial?: Partial<TransactionFilters>): UseAdminTransactionsState {
  const adminToken = import.meta.env.VITE_ADMIN_TOKEN;
  const baseFilters = useMemo(() => ({ ...createDefaultFilters(), ...initial }), [initial]);
  const filtersRef = useRef<TransactionFilters>(baseFilters);
  const [appliedFilters, setAppliedFilters] = useState<TransactionFilters>(baseFilters);
  const [transactions, setTransactions] = useState<AdminTransaction[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [range, setRange] = useState<TransactionRange | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(adminToken ? null : ADMIN_TOKEN_MISSING_MESSAGE);

  useEffect(() => {
    filtersRef.current = baseFilters;
    setAppliedFilters(baseFilters);
  }, [baseFilters]);

  const fetchTransactions = useCallback(
    async (overrides?: Partial<TransactionFilters>) => {
      if (!adminToken) {
        setError(ADMIN_TOKEN_MISSING_MESSAGE);
        return;
      }

      const nextFilters = {
        ...filtersRef.current,
        ...overrides
      };

      if (!nextFilters.startDate || !nextFilters.endDate) {
        setError('Start and end dates are required.');
        return;
      }

      const params = new URLSearchParams();
      params.set('start', nextFilters.startDate);
      params.set('end', nextFilters.endDate);

      const category = nextFilters.category?.trim();
      if (category) {
        params.set('category', category);
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`${API_URL}/admin/transactions?${params.toString()}`, {
          headers: {
            'x-admin-token': adminToken
          }
        });

        if (!response.ok) {
          let message = `Request failed (${response.status})`;
          try {
            const body = (await response.json()) as { message?: string };
            if (body?.message) {
              message = body.message;
            }
          } catch {
            // Ignore JSON parsing issues and fall back to the default message.
          }
          throw new Error(message);
        }

        const payload = (await response.json()) as AdminTransactionsResponse;
        setTransactions(Array.isArray(payload.transactions) ? payload.transactions : []);
        setCategories(Array.isArray(payload.categories) ? payload.categories : []);
        setRange(payload.range ?? null);
        setCategoryFilter(payload.categoryFilter ?? null);
        filtersRef.current = nextFilters;
        setAppliedFilters(nextFilters);
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : 'Failed to load transactions.');
      } finally {
        setIsLoading(false);
      }
    },
    [adminToken]
  );

  useEffect(() => {
    void fetchTransactions(baseFilters);
  }, [fetchTransactions, baseFilters]);

  return {
    transactions,
    categories,
    range,
    categoryFilter,
    appliedFilters,
    isLoading,
    error,
    fetchTransactions
  };
}
