export type Product = {
  id: string;
  title: string;
  description: string;
  price: number;
  imageUrl: string;
  inventory: number;
};

export type CartLine = {
  product: Product;
  quantity: number;
};

export type AdminProduct = {
  id: string;
  title: string;
  description: string;
  price: number;
  imageUrl: string | null;
  inventoryCount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  category: string;
};

export type KioskConfig = {
  currency: string;
  paymentProvider: string;
  inventoryEnabled: boolean;
};

export type SalesBucket = {
  total: number;
  transactions: number;
};

export type SalesStats = {
  totalTransactions: number;
  totalRevenue: number;
  itemsSold: number;
  lifetime: {
    revenue: number;
    transactions: number;
    itemsSold: number;
  };
  period: {
    current: { start: string; end: string };
    previous: { start: string; end: string };
  };
  summary: {
    revenue: SalesSummaryMetric;
    transactions: SalesSummaryMetric;
    itemsSold: SalesSummaryMetric;
    averageOrderValue: SalesSummaryMetric;
  };
  daily: Array<{ date: string } & SalesBucket>;
  weekly: Array<{ weekStart: string } & SalesBucket>;
  hourlyTrend: SalesHourlyBucket[];
  categoryMix: SalesCategoryMixEntry[];
  topProducts: Array<{
    productId: string;
    title: string;
    quantity: number;
    revenue: number;
  }>;
  highlights: {
    bestDay: SalesHighlightDay | null;
    slowDay: SalesHighlightDay | null;
  };
  alerts: string[];
};

export type SalesSummaryMetric = {
  current: number;
  previous: number;
  deltaAbsolute: number;
  deltaPercent: number | null;
};

export type SalesHighlightDay = {
  date: string;
  total: number;
  transactions: number;
};

export type SalesCategoryMixEntry = {
  category: string;
  quantity: number;
  revenue: number;
  revenueShare: number;
  quantityShare: number;
};

export type SalesHourlyBucket = {
  hour: string;
  total: number;
  transactions: number;
};
