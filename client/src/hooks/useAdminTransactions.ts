import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AdminTransaction, AdminTransactionsResponse, TransactionRange } from '../types';
import { UnauthorizedError, useAdminAuth } from '../providers/AdminAuthProvider';

type TransactionFilters = {
  startDate: string;
  endDate: string;
  category: string | null;
  includeDeleted: boolean;
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
    category: null,
    includeDeleted: false
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
  deleteTransaction: (id: string) => Promise<AdminTransaction>;
};

export type { TransactionFilters };

export function useAdminTransactions(initial?: Partial<TransactionFilters>): UseAdminTransactionsState {
  const { status: authStatus, fetchWithAuth } = useAdminAuth();
  const baseFilters = useMemo(() => ({ ...createDefaultFilters(), ...initial }), [initial]);
  const filtersRef = useRef<TransactionFilters>(baseFilters);
  const [appliedFilters, setAppliedFilters] = useState<TransactionFilters>(baseFilters);
  const [transactions, setTransactions] = useState<AdminTransaction[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [range, setRange] = useState<TransactionRange | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    filtersRef.current = baseFilters;
    setAppliedFilters(baseFilters);
  }, [baseFilters]);

  const fetchTransactions = useCallback(
    async (overrides?: Partial<TransactionFilters>) => {
      if (authStatus !== 'authenticated') {
        setError('Sign in to inspect transactions.');
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

      if (nextFilters.includeDeleted) {
        params.set('includeDeleted', 'true');
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetchWithAuth(`/admin/transactions?${params.toString()}`);

        const payload = (await response.json()) as AdminTransactionsResponse;
        setTransactions(Array.isArray(payload.transactions) ? payload.transactions : []);
        setCategories(Array.isArray(payload.categories) ? payload.categories : []);
        setRange(payload.range ?? null);
        setCategoryFilter(payload.categoryFilter ?? null);
        const resolvedIncludeDeleted = payload.includeDeleted ?? nextFilters.includeDeleted;
        const finalFilters = {
          ...nextFilters,
          includeDeleted: resolvedIncludeDeleted
        };
        filtersRef.current = finalFilters;
        setAppliedFilters(finalFilters);
      } catch (fetchError) {
        if (fetchError instanceof UnauthorizedError) {
          setError(fetchError.message);
        } else {
          setError(fetchError instanceof Error ? fetchError.message : 'Failed to load transactions.');
        }
      } finally {
        setIsLoading(false);
      }
    },
    [authStatus, fetchWithAuth]
  );

  useEffect(() => {
    if (authStatus === 'authenticated') {
      void fetchTransactions(baseFilters);
      return;
    }

    if (authStatus === 'unauthenticated') {
      setTransactions([]);
      setCategories([]);
      setRange(null);
      setCategoryFilter(null);
      setIsLoading(false);
      setError('Sign in to inspect transactions.');
    } else {
      setIsLoading(true);
    }
  }, [authStatus, fetchTransactions, baseFilters]);

  const deleteTransaction = useCallback(
    async (id: string) => {
      if (authStatus !== 'authenticated') {
        const message = 'Sign in to update transactions.';
        setError(message);
        throw new Error(message);
      }

      setError(null);

      const response = await fetchWithAuth(`/admin/transactions/${id}/delete`, {
        method: 'POST'
      });

      const payload = (await response.json()) as { transaction: AdminTransaction };
      const updated = payload.transaction;

      if (!updated) {
        throw new Error('Transaction update did not return data.');
      }

      setTransactions((previous) => {
        if (!filtersRef.current.includeDeleted) {
          return previous.filter((transaction) => transaction.id !== id);
        }

        const index = previous.findIndex((transaction) => transaction.id === id);
        if (index === -1) {
          return previous;
        }

        const next = [...previous];
        next[index] = updated;
        return next;
      });

      return updated;
    },
    [authStatus, fetchWithAuth]
  );

  return {
    transactions,
    categories,
    range,
    categoryFilter,
    appliedFilters,
    isLoading,
    error,
    fetchTransactions,
    deleteTransaction
  };
}
