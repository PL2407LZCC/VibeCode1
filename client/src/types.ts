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
  daily: Array<{ date: string } & SalesBucket>;
  weekly: Array<{ weekStart: string } & SalesBucket>;
  topProducts: Array<{
    productId: string;
    title: string;
    quantity: number;
    revenue: number;
  }>;
};
