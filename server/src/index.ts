import express, { type Request, type Response } from 'express';
import requireAdmin from './middleware/requireAdmin';
import {
  listActiveProducts,
  createPurchase,
  listAllProducts,
  createProduct,
  updateProduct,
  updateProductInventory,
  archiveProduct
} from './repositories/productRepository';
import { getKioskConfig, setInventoryEnabled } from './repositories/settingsRepository';
import prisma from './lib/prisma';

const app = express();
const port = Number.parseInt(process.env.PORT ?? '3000', 10);

type PurchaseItemPayload = {
  productId: unknown;
  quantity: unknown;
};

type CreateProductPayload = {
  title?: unknown;
  description?: unknown;
  price?: unknown;
  imageUrl?: unknown;
  inventoryCount?: unknown;
  isActive?: unknown;
};

type PurchaseSummaryRecord = {
  createdAt: Date;
  totalAmount: unknown;
};

const normalizeDecimal = (value: unknown) => {
  if (value == null) {
    return 0;
  }

  if (typeof value === 'number' || typeof value === 'bigint') {
    return Number(value);
  }

  if (typeof value === 'string') {
    return Number(value);
  }

  if (typeof value === 'object' && 'toNumber' in (value as Record<string, unknown>)) {
    return Number((value as { toNumber: () => number }).toNumber());
  }

  return Number(value);
};

const toIsoDate = (date: Date) => {
  const copy = new Date(date);
  copy.setUTCHours(0, 0, 0, 0);
  return copy.toISOString().slice(0, 10);
};

const startOfIsoWeek = (date: Date) => {
  const copy = new Date(date);
  const day = copy.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  copy.setUTCDate(copy.getUTCDate() - diff);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
};

const resetState = async () => {
  await prisma.purchaseItem.deleteMany();
  await prisma.purchase.deleteMany();
};

app.use(express.json());

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

app.get('/products', async (_req: Request, res: Response) => {
  try {
    const items = await listActiveProducts();
    res.json({ items });
  } catch (error) {
    res.status(500).json({ message: 'Unable to load products.' });
  }
});

app.get('/config', async (_req: Request, res: Response) => {
  try {
    const config = await getKioskConfig();
    res.json(config);
  } catch (error) {
    res.status(500).json({ message: 'Unable to load kiosk configuration.' });
  }
});

const isValidPurchaseItem = (item: PurchaseItemPayload): item is { productId: string; quantity: number } => {
  if (!item) {
    return false;
  }

  const { productId, quantity } = item;

  return (
    typeof productId === 'string' &&
    productId.length > 0 &&
    typeof quantity === 'number' &&
    Number.isFinite(quantity) &&
    quantity > 0
  );
};

app.post('/purchases', async (req: Request, res: Response) => {
  const { items, reference, notes } = req.body as {
    items?: PurchaseItemPayload[];
    reference?: unknown;
    notes?: unknown;
  };

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'Purchase requires at least one item.' });
  }

  const invalidItem = items.find((item) => !isValidPurchaseItem(item as PurchaseItemPayload));

  if (invalidItem) {
    return res.status(400).json({ message: 'Each purchase item must include productId and positive quantity.' });
  }

  try {
    const purchase = await createPurchase({
      items: items as { productId: string; quantity: number }[],
      reference: typeof reference === 'string' ? reference : undefined,
      notes: typeof notes === 'string' ? notes : undefined
    });

    return res.status(202).json({
      message: 'Purchase received. Processing pending payment confirmation.',
      reference: purchase.reference
    });
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes('unknown product')) {
      return res.status(404).json({ message: error.message });
    }

    return res.status(500).json({ message: 'Unable to process purchase.' });
  }
});

const adminRouter = express.Router();

adminRouter.use(requireAdmin);

adminRouter.get('/products', async (_req: Request, res: Response) => {
  try {
    const items = await listAllProducts();
    res.json({ items });
  } catch (error) {
    res.status(500).json({ message: 'Unable to load products.' });
  }
});

const parseCreateProductPayload = (body: CreateProductPayload) => {
  if (typeof body.title !== 'string' || body.title.trim().length === 0) {
    return { error: 'Product title is required.' } as const;
  }

  const price = typeof body.price === 'number' ? body.price : Number(body.price);
  if (!Number.isFinite(price) || price <= 0) {
    return { error: 'Product price must be a positive number.' } as const;
  }

  const inventory = typeof body.inventoryCount === 'number' ? body.inventoryCount : Number(body.inventoryCount ?? 0);
  if (!Number.isInteger(inventory) || inventory < 0) {
    return { error: 'Inventory count must be a non-negative integer.' } as const;
  }

  const result = {
    title: body.title.trim(),
    description: typeof body.description === 'string' ? body.description : undefined,
    price,
    imageUrl: typeof body.imageUrl === 'string' ? body.imageUrl : undefined,
    inventoryCount: inventory,
    isActive: typeof body.isActive === 'boolean' ? body.isActive : true
  };

  return { data: result } as const;
};

adminRouter.post('/products', async (req: Request, res: Response) => {
  const validation = parseCreateProductPayload(req.body as CreateProductPayload);

  if ('error' in validation) {
    return res.status(400).json({ message: validation.error });
  }

  try {
    const product = await createProduct(validation.data);
    res.status(201).json(product);
  } catch (error) {
    res.status(500).json({ message: 'Unable to create product.' });
  }
});

adminRouter.patch('/products/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ message: 'Product id is required.' });
  }

  const payload = req.body as CreateProductPayload;
  const data: Record<string, unknown> = {};

  if (payload.title !== undefined) {
    if (typeof payload.title !== 'string' || payload.title.trim().length === 0) {
      return res.status(400).json({ message: 'Title must be a non-empty string.' });
    }
    data.title = payload.title.trim();
  }

  if (payload.description !== undefined && typeof payload.description !== 'string' && payload.description !== null) {
    return res.status(400).json({ message: 'Description must be a string or null.' });
  } else if (payload.description !== undefined) {
    data.description = payload.description;
  }

  if (payload.price !== undefined) {
    const price = typeof payload.price === 'number' ? payload.price : Number(payload.price);
    if (!Number.isFinite(price) || price <= 0) {
      return res.status(400).json({ message: 'Price must be a positive number.' });
    }
    data.price = price;
  }

  if (payload.imageUrl !== undefined) {
    if (payload.imageUrl !== null && typeof payload.imageUrl !== 'string') {
      return res.status(400).json({ message: 'Image URL must be a string or null.' });
    }
    data.imageUrl = payload.imageUrl;
  }

  if (payload.inventoryCount !== undefined) {
    const inventory = typeof payload.inventoryCount === 'number' ? payload.inventoryCount : Number(payload.inventoryCount);
    if (!Number.isInteger(inventory) || inventory < 0) {
      return res.status(400).json({ message: 'Inventory count must be a non-negative integer.' });
    }
    data.inventoryCount = inventory;
  }

  if (payload.isActive !== undefined) {
    if (typeof payload.isActive !== 'boolean') {
      return res.status(400).json({ message: 'isActive must be a boolean value.' });
    }
    data.isActive = payload.isActive;
  }

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ message: 'Provide at least one field to update.' });
  }

  try {
    const product = await updateProduct(id, data as unknown as Parameters<typeof updateProduct>[1]);
    res.json(product);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Record to update')) {
      return res.status(404).json({ message: `Product ${id} not found.` });
    }

    res.status(500).json({ message: 'Unable to update product.' });
  }
});

adminRouter.patch('/products/:id/inventory', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { inventoryCount } = req.body as { inventoryCount?: unknown };

  const parsedInventory = typeof inventoryCount === 'number' ? inventoryCount : Number(inventoryCount);

  if (!Number.isInteger(parsedInventory) || parsedInventory < 0) {
    return res.status(400).json({ message: 'Inventory count must be a non-negative integer.' });
  }

  try {
    const result = await updateProductInventory(id, parsedInventory);
    res.json(result);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Record to update')) {
      return res.status(404).json({ message: `Product ${id} not found.` });
    }

    res.status(500).json({ message: 'Unable to update inventory.' });
  }
});

adminRouter.delete('/products/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ message: 'Product id is required.' });
  }

  try {
    const product = await archiveProduct(id);
    res.json(product);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Record to update')) {
      return res.status(404).json({ message: `Product ${id} not found.` });
    }

    res.status(500).json({ message: 'Unable to archive product.' });
  }
});

adminRouter.patch('/kiosk-mode', async (req: Request, res: Response) => {
  const { inventoryEnabled } = req.body as { inventoryEnabled?: unknown };

  if (typeof inventoryEnabled !== 'boolean') {
    return res.status(400).json({ message: 'inventoryEnabled must be a boolean.' });
  }

  try {
    const config = await setInventoryEnabled(inventoryEnabled);
    res.json(config);
  } catch (error) {
    res.status(500).json({ message: 'Unable to update kiosk settings.' });
  }
});

adminRouter.get('/stats/sales', async (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const dailyWindowStart = new Date(now);
    dailyWindowStart.setUTCDate(dailyWindowStart.getUTCDate() - 6);
    dailyWindowStart.setUTCHours(0, 0, 0, 0);

    const weeklyWindowStart = startOfIsoWeek(new Date(now));
    weeklyWindowStart.setUTCDate(weeklyWindowStart.getUTCDate() - 21);

    const topProductWindowStart = new Date(now);
    topProductWindowStart.setUTCDate(topProductWindowStart.getUTCDate() - 30);

    const [purchaseAggregate, purchaseItemAggregate, recentPurchases, recentLineItems] = await Promise.all([
      prisma.purchase.aggregate({
        _sum: { totalAmount: true },
        _count: { _all: true }
      }),
      prisma.purchaseItem.aggregate({
        _sum: { quantity: true }
      }),
      prisma.purchase.findMany({
        where: {
          createdAt: {
            gte: weeklyWindowStart
          }
        },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true, totalAmount: true }
      }),
      prisma.purchaseItem.findMany({
        where: {
          purchase: {
            createdAt: {
              gte: topProductWindowStart
            }
          }
        },
        select: {
          productId: true,
          quantity: true,
          unitPrice: true
        }
      })
    ]);

    const dailyBucket: Record<string, { total: number; transactions: number }> = {};
    for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
      const day = new Date(dailyWindowStart);
      day.setUTCDate(dailyWindowStart.getUTCDate() + dayOffset);
      dailyBucket[toIsoDate(day)] = { total: 0, transactions: 0 };
    }

    const weeklyBucket: Record<string, { total: number; transactions: number }> = {};
    for (let weekOffset = 0; weekOffset < 4; weekOffset += 1) {
      const weekStart = new Date(weeklyWindowStart);
      weekStart.setUTCDate(weeklyWindowStart.getUTCDate() + weekOffset * 7);
      weeklyBucket[toIsoDate(weekStart)] = { total: 0, transactions: 0 };
    }

  (recentPurchases as PurchaseSummaryRecord[]).forEach((purchase) => {
      const purchaseDate = toIsoDate(purchase.createdAt);
      if (purchaseDate in dailyBucket) {
        dailyBucket[purchaseDate].total += normalizeDecimal(purchase.totalAmount);
        dailyBucket[purchaseDate].transactions += 1;
      }

      const weekStart = toIsoDate(startOfIsoWeek(purchase.createdAt));
      if (weekStart in weeklyBucket) {
        weeklyBucket[weekStart].total += normalizeDecimal(purchase.totalAmount);
        weeklyBucket[weekStart].transactions += 1;
      }
    });

    const productTotals = new Map<string, { quantity: number; revenue: number }>();
    for (const lineItem of recentLineItems) {
      const current = productTotals.get(lineItem.productId) ?? { quantity: 0, revenue: 0 };
      current.quantity += lineItem.quantity;
      current.revenue += normalizeDecimal(lineItem.unitPrice) * lineItem.quantity;
      productTotals.set(lineItem.productId, current);
    }

    const sortedTopProducts = Array.from(productTotals.entries())
      .sort(([, a], [, b]) => b.revenue - a.revenue)
      .slice(0, 5);

    let productTitles: Record<string, string> = {};
    if (sortedTopProducts.length > 0) {
      const productDetails = await prisma.product.findMany({
        where: {
          id: {
            in: sortedTopProducts.map(([productId]) => productId)
          }
        },
        select: { id: true, title: true }
      });

      productTitles = productDetails.reduce<Record<string, string>>((acc, product) => {
        acc[product.id] = product.title;
        return acc;
      }, {});
    }

    res.json({
      totalTransactions: purchaseAggregate._count._all ?? 0,
      totalRevenue: normalizeDecimal(purchaseAggregate._sum.totalAmount),
      itemsSold: purchaseItemAggregate._sum.quantity ?? 0,
      daily: Object.entries(dailyBucket).map(([date, totals]) => ({
        date,
        total: Number(totals.total.toFixed(2)),
        transactions: totals.transactions
      })),
      weekly: Object.entries(weeklyBucket)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([weekStart, totals]) => ({
          weekStart,
          total: Number(totals.total.toFixed(2)),
          transactions: totals.transactions
        })),
      topProducts: sortedTopProducts.map(([productId, totals]) => ({
        productId,
        title: productTitles[productId] ?? productId,
        quantity: totals.quantity,
        revenue: Number(totals.revenue.toFixed(2))
      }))
    });
  } catch (error) {
    res.status(500).json({ message: 'Unable to load sales stats.' });
  }
});

app.use('/admin', adminRouter);

if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    // Boot message helps validate that the placeholder server runs.
    console.log(`API listening on http://localhost:${port}`);
  });
}

export { app, resetState };
