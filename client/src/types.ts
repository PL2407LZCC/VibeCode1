export type Product = {
  id: string;
  title: string;
  description: string;
  category: string;
  price: number;
  imageUrl: string;
  inventory: number;
};

export type CartLine = {
  product: Product;
  quantity: number;
};

export type AdminUser = {
  id: string;
  email: string;
  username: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminInvite = {
  id: string;
  email: string;
  username: string;
  status: 'pending' | 'sent' | 'accepted' | 'expired' | 'revoked';
  invitedBy: {
    id: string;
    username: string;
  } | null;
  createdAt: string;
  expiresAt: string | null;
  lastSentAt: string | null;
  acceptedAt: string | null;
  revokedAt: string | null;
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
  averageOrderValue: number;
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
  productPerformance: ProductPerformanceEntry[];
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
  percentage: number;
  transactions: number;
};

export type ProductPerformanceWindow = {
  quantity: number;
  revenue: number;
};

export type ProductPerformanceEntry = {
  productId: string;
  title: string;
  category: string;
  isActive: boolean;
  inventoryCount: number;
  price: number;
  sales: {
    last7Days: ProductPerformanceWindow;
    last30Days: ProductPerformanceWindow;
    lifetime: ProductPerformanceWindow;
  };
};

export type TransactionLineItem = {
  productId: string;
  title: string;
  category: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
};

export type TransactionCategoryBreakdownEntry = {
  category: string;
  quantity: number;
  revenue: number;
};

export type AdminTransaction = {
  id: string;
  reference: string | null;
  status: string;
  notes: string | null;
  totalAmount: number;
  createdAt: string;
  isDeleted: boolean;
  deletedAt: string | null;
  deletedBy: {
    id: string;
    username: string;
  } | null;
  lineItems: TransactionLineItem[];
  categoryBreakdown: TransactionCategoryBreakdownEntry[];
};

export type TransactionRange = {
  start: string;
  end: string;
};

export type AdminTransactionsResponse = {
  range: TransactionRange;
  categoryFilter: string | null;
  includeDeleted: boolean;
  categories: string[];
  transactions: AdminTransaction[];
};
