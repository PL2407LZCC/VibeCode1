import { useCallback, useEffect, useState } from 'react';
import type {
  AdminProduct,
  KioskConfig,
  SalesStats,
  SalesCategoryMixEntry,
  SalesHighlightDay,
  SalesHourlyBucket,
  SalesSummaryMetric
} from '../types';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const TOKEN_MISSING_MESSAGE =
  'Admin token is not configured. Set VITE_ADMIN_TOKEN in your environment to unlock admin tools.';

type CreateProductInput = {
  title: string;
  description?: string;
  price: number;
  imageUrl?: string;
  inventoryCount: number;
  isActive?: boolean;
  category: string;
};

type UpdateProductInput = {
  title?: string;
  description?: string | null;
  price?: number;
  imageUrl?: string | null;
  inventoryCount?: number;
  isActive?: boolean;
  category?: string;
};

type AdminDashboardState = {
  products: AdminProduct[];
  config: KioskConfig | null;
  stats: SalesStats | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  createProduct: (input: CreateProductInput) => Promise<void>;
  updateProduct: (id: string, input: UpdateProductInput) => Promise<void>;
  toggleInventory: (inventoryEnabled: boolean) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  uploadImage: (file: File) => Promise<{ url: string; filename: string }>;
};

const parseAdminProduct = (payload: any): AdminProduct => ({
  id: String(payload.id),
  title: String(payload.title ?? ''),
  description: typeof payload.description === 'string' ? payload.description : '',
  price: Number(payload.price ?? 0),
  imageUrl: payload.imageUrl ?? null,
  inventoryCount: Number(payload.inventoryCount ?? 0),
  isActive: Boolean(payload.isActive),
  createdAt: String(payload.createdAt ?? ''),
  updatedAt: String(payload.updatedAt ?? ''),
  category: typeof payload.category === 'string' && payload.category.trim().length > 0 ? payload.category : 'Uncategorized'
});

const parseSalesStats = (payload: any): SalesStats => {
  const parseSummaryMetric = (metric: any): SalesSummaryMetric => ({
    current: Number(metric?.current ?? 0),
    previous: Number(metric?.previous ?? 0),
    deltaAbsolute: Number(metric?.deltaAbsolute ?? 0),
    deltaPercent:
      metric?.deltaPercent === null || metric?.deltaPercent === undefined
        ? null
        : Number(metric?.deltaPercent)
  });

  const parseHighlightDay = (value: any): SalesHighlightDay | null => {
    if (!value || typeof value !== 'object') {
      return null;
    }

    return {
      date: String(value.date ?? ''),
      total: Number(value.total ?? 0),
      transactions: Number(value.transactions ?? 0)
    };
  };

  const toDailyBucket = (bucket: any) => ({
    date: String(bucket?.date ?? ''),
    total: Number(bucket?.total ?? 0),
    transactions: Number(bucket?.transactions ?? 0)
  });

  const toWeeklyBucket = (bucket: any) => ({
    weekStart: String(bucket?.weekStart ?? ''),
    total: Number(bucket?.total ?? 0),
    transactions: Number(bucket?.transactions ?? 0)
  });

  const toTopProduct = (bucket: any) => ({
    productId: String(bucket?.productId ?? ''),
    title: String(bucket?.title ?? ''),
    quantity: Number(bucket?.quantity ?? 0),
    revenue: Number(bucket?.revenue ?? 0)
  });

  const toPerformanceWindow = (windowValue: any) => ({
    quantity: Number(windowValue?.quantity ?? 0),
    revenue: Number(windowValue?.revenue ?? 0)
  });

  const productPerformance = Array.isArray(payload?.productPerformance)
    ? payload.productPerformance.map((entry: any) => ({
        productId: String(entry?.productId ?? ''),
        title: String(entry?.title ?? ''),
        category:
          typeof entry?.category === 'string' && entry.category.trim().length > 0 ? entry.category : 'Uncategorized',
        isActive: Boolean(entry?.isActive),
        inventoryCount: Number(entry?.inventoryCount ?? 0),
        price: Number(entry?.price ?? 0),
        sales: {
          last7Days: toPerformanceWindow(entry?.sales?.last7Days),
          last30Days: toPerformanceWindow(entry?.sales?.last30Days),
          lifetime: toPerformanceWindow(entry?.sales?.lifetime)
        }
      }))
    : [];

  const daily = Array.isArray(payload?.daily) ? payload.daily.map(toDailyBucket) : [];
  const weekly = Array.isArray(payload?.weekly) ? payload.weekly.map(toWeeklyBucket) : [];
  const topProducts = Array.isArray(payload?.topProducts) ? payload.topProducts.map(toTopProduct) : [];
  const hourlyTrend: SalesHourlyBucket[] = Array.isArray(payload?.hourlyTrend)
    ? payload.hourlyTrend.map((bucket: any) => ({
        hour: String(bucket?.hour ?? ''),
        percentage: Number(bucket?.percentage ?? 0),
        transactions: Number(bucket?.transactions ?? 0)
      }))
    : [];

  const categoryMix: SalesCategoryMixEntry[] = Array.isArray(payload?.categoryMix)
    ? payload.categoryMix.map((entry: any) => ({
        category: typeof entry?.category === 'string' && entry.category.trim().length > 0 ? entry.category : 'Uncategorized',
        quantity: Number(entry?.quantity ?? 0),
        revenue: Number(entry?.revenue ?? 0),
        revenueShare: Number(entry?.revenueShare ?? 0),
        quantityShare: Number(entry?.quantityShare ?? 0)
      }))
    : [];

  const alerts = Array.isArray(payload?.alerts)
    ? payload.alerts.filter((alert: unknown): alert is string => typeof alert === 'string' && alert.trim().length > 0)
    : [];

  const summaryPayload = payload?.summary ?? {};

  return {
    totalTransactions: Number(payload?.totalTransactions ?? 0),
    totalRevenue: Number(payload?.totalRevenue ?? 0),
    itemsSold: Number(payload?.itemsSold ?? 0),
    averageOrderValue: Number(payload?.summary?.averageOrderValue?.current ?? 0),
    lifetime: {
      revenue: Number(payload?.lifetime?.revenue ?? payload?.totalRevenue ?? 0),
      transactions: Number(payload?.lifetime?.transactions ?? payload?.totalTransactions ?? 0),
      itemsSold: Number(payload?.lifetime?.itemsSold ?? payload?.itemsSold ?? 0)
    },
    period: {
      current: {
        start: String(payload?.period?.current?.start ?? ''),
        end: String(payload?.period?.current?.end ?? '')
      },
      previous: {
        start: String(payload?.period?.previous?.start ?? ''),
        end: String(payload?.period?.previous?.end ?? '')
      }
    },
    summary: {
      revenue: parseSummaryMetric(summaryPayload.revenue),
      transactions: parseSummaryMetric(summaryPayload.transactions),
      itemsSold: parseSummaryMetric(summaryPayload.itemsSold),
      averageOrderValue: parseSummaryMetric(summaryPayload.averageOrderValue)
    },
    daily,
    weekly,
    hourlyTrend,
    categoryMix,
    topProducts,
    productPerformance,
    highlights: {
      bestDay: parseHighlightDay(payload?.highlights?.bestDay),
      slowDay: parseHighlightDay(payload?.highlights?.slowDay)
    },
    alerts
  };
};

export function useAdminDashboard(): AdminDashboardState {
  const adminToken = import.meta.env.VITE_ADMIN_TOKEN;
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [config, setConfig] = useState<KioskConfig | null>(null);
  const [stats, setStats] = useState<SalesStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(adminToken ? null : TOKEN_MISSING_MESSAGE);

  const authorizedFetch = useCallback(
    async (path: string, init?: RequestInit) => {
      if (!adminToken) {
        throw new Error(TOKEN_MISSING_MESSAGE);
      }

      const headers = new Headers(init?.headers ?? {});
      const body = init?.body as BodyInit | null | undefined;
      const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
      if (body && !isFormData && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }
      headers.set('x-admin-token', adminToken);

      const response = await fetch(`${API_URL}${path}`, {
        ...init,
        headers
      });

      if (!response.ok) {
        let message = `Request failed (${response.status})`;
        try {
          const body = await response.json();
          if (body && typeof body.message === 'string') {
            message = body.message;
          }
        } catch (err) {
          // Ignore JSON parse errors – message fallback already set.
        }
        throw new Error(message);
      }

      return response;
    },
    [adminToken]
  );

  const load = useCallback(async () => {
    if (!adminToken) {
      setError(TOKEN_MISSING_MESSAGE);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const [productsResponse, configResponse, statsResponse] = await Promise.all([
        authorizedFetch('/admin/products'),
        authorizedFetch('/config'),
        authorizedFetch('/admin/stats/sales')
      ]);

      const productPayload = await productsResponse.json();
      const configPayload = await configResponse.json();
      const statsPayload = await statsResponse.json();

      const parsedProducts = Array.isArray(productPayload?.items)
        ? productPayload.items.map(parseAdminProduct)
        : [];

      setProducts(parsedProducts);
      setConfig({
        currency: String(configPayload?.currency ?? 'EUR'),
        paymentProvider: String(configPayload?.paymentProvider ?? 'mobilepay'),
        inventoryEnabled: Boolean(configPayload?.inventoryEnabled)
      });
      setStats(parseSalesStats(statsPayload));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected admin dashboard error');
    } finally {
      setIsLoading(false);
    }
  }, [adminToken, authorizedFetch]);

  const createProduct = useCallback(
    async (input: CreateProductInput) => {
      await authorizedFetch('/admin/products', {
        method: 'POST',
        body: JSON.stringify(input)
      });
      await load();
    },
    [authorizedFetch, load]
  );

  const updateProduct = useCallback(
    async (id: string, input: UpdateProductInput) => {
      await authorizedFetch(`/admin/products/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input)
      });
      await load();
    },
    [authorizedFetch, load]
  );

  const toggleInventory = useCallback(
    async (inventoryEnabled: boolean) => {
      await authorizedFetch('/admin/kiosk-mode', {
        method: 'PATCH',
        body: JSON.stringify({ inventoryEnabled })
      });
      await load();
    },
    [authorizedFetch, load]
  );

  const deleteProduct = useCallback(
    async (id: string) => {
      await authorizedFetch(`/admin/products/${id}`, {
        method: 'DELETE'
      });
      await load();
    },
    [authorizedFetch, load]
  );

  const uploadImage = useCallback(
    async (file: File) => {
      if (!file) {
        throw new Error('No image file provided.');
      }

      const formData = new FormData();
      formData.append('image', file);

      const response = await authorizedFetch('/admin/uploads', {
        method: 'POST',
        body: formData
      });

      const payload = await response.json();
      const url = typeof payload?.url === 'string' ? payload.url : null;
      const filename = typeof payload?.filename === 'string' ? payload.filename : null;

      if (!url || !filename) {
        throw new Error('Upload response missing image URL.');
      }

      return { url, filename };
    },
    [authorizedFetch]
  );

  useEffect(() => {
    void load();
  }, [load]);

  return {
    products,
    config,
    stats,
    isLoading,
    error,
    refresh: load,
    createProduct,
    updateProduct,
    toggleInventory,
    deleteProduct,
    uploadImage
  };
}
