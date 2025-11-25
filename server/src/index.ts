import express, { type Request, type Response } from 'express';
import multer, { MulterError } from 'multer';
import cors from 'cors';
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
import { seedDatabase } from './lib/seedData';
import {
  ensureUploadsDir,
  UPLOADS_DIR,
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_UPLOAD_SIZE_BYTES,
  createUploadFilename,
  toPublicUploadPath
} from './lib/uploads';

const app = express();
const port = Number.parseInt(process.env.PORT ?? '3000', 10);
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const shouldAutoSeed = (process.env.AUTO_SEED ?? 'true').toLowerCase() !== 'false';

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
  category?: unknown;
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

const startOfDayUtc = (date: Date) => {
  const copy = new Date(date);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
};

const addDaysUtc = (date: Date, amount: number) => {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + amount);
  return copy;
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

type UploadMiddlewareError = Error & { code?: string };

const imageUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      ensureUploadsDir()
        .then(() => cb(null, UPLOADS_DIR))
        .catch((error) => cb(error as Error, UPLOADS_DIR));
    },
    filename: (_req, file, cb) => {
      try {
        const filename = createUploadFilename(file.mimetype, file.originalname);
        cb(null, filename);
      } catch (error) {
        cb(error as Error, '');
      }
    }
  }),
  limits: {
    fileSize: MAX_UPLOAD_SIZE_BYTES
  },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
      const error: UploadMiddlewareError = new Error('Only JPEG, PNG, or WebP images are allowed.');
      error.code = 'UNSUPPORTED_FILE_TYPE';
      cb(error);
      return;
    }

    cb(null, true);
  }
});

const singleImageUpload = imageUpload.single('image');
const MAX_UPLOAD_SIZE_MB = Math.max(1, Math.round(MAX_UPLOAD_SIZE_BYTES / (1024 * 1024)));

app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : true
  })
);
app.use(express.json());
app.use('/uploads', express.static(UPLOADS_DIR));

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

adminRouter.post('/uploads', (req: Request, res: Response) => {
  singleImageUpload(req, res, (err?: unknown) => {
    if (err) {
      if (err instanceof MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ message: `Image must be ${MAX_UPLOAD_SIZE_MB} MB or smaller.` });
        }

        return res.status(400).json({ message: err.message });
      }

      const uploadError = err as UploadMiddlewareError;
      if (uploadError.code === 'UNSUPPORTED_FILE_TYPE') {
        return res.status(400).json({ message: 'Only JPEG, PNG, or WebP images are allowed.' });
      }

      return res.status(500).json({ message: 'Unable to upload image.' });
    }

    const file = req.file as Express.Multer.File | undefined;
    if (!file) {
      return res.status(400).json({ message: 'Image file is required.' });
    }

    return res.status(201).json({
      url: toPublicUploadPath(file.filename),
      filename: file.filename
    });
  });
});

adminRouter.get('/products', async (_req: Request, res: Response) => {
  try {
    const items = await listAllProducts();
    res.json({ items });
  } catch (error) {
    res.status(500).json({ message: 'Unable to load products.' });
  }
});

const MAX_CATEGORY_LENGTH = 64;

const normalizeCategory = (rawCategory: unknown) => {
  if (typeof rawCategory !== 'string') {
    return 'Uncategorized';
  }

  const trimmed = rawCategory.trim();
  if (trimmed.length === 0) {
    return 'Uncategorized';
  }

  return trimmed.length > MAX_CATEGORY_LENGTH ? trimmed.slice(0, MAX_CATEGORY_LENGTH) : trimmed;
};

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
    isActive: typeof body.isActive === 'boolean' ? body.isActive : true,
    category: normalizeCategory(body.category)
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

  if (payload.category !== undefined) {
    const normalizedCategory = normalizeCategory(payload.category);
    if (normalizedCategory.length === 0) {
      return res.status(400).json({ message: 'Category must be a valid string.' });
    }
    data.category = normalizedCategory;
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
    const dailyWindowDays = 7;
    const weeklyWindowWeeks = 4;

    const todayStart = startOfDayUtc(now);
    const currentDailyStart = addDaysUtc(todayStart, -(dailyWindowDays - 1));
    const previousDailyStart = addDaysUtc(currentDailyStart, -dailyWindowDays);
    const previousDailyEnd = addDaysUtc(currentDailyStart, -1);

    const isoWeekAnchor = startOfIsoWeek(new Date(now));
    const currentWeeklyStart = addDaysUtc(isoWeekAnchor, -(weeklyWindowWeeks - 1) * 7);
    const previousWeeklyStart = addDaysUtc(currentWeeklyStart, -weeklyWindowWeeks * 7);

    const historyWindowStart = previousWeeklyStart;
    const topProductWindowStart = addDaysUtc(todayStart, -29);
    const lineItemWindowStart = topProductWindowStart.getTime() < historyWindowStart.getTime() ? topProductWindowStart : historyWindowStart;
    const topProductWindowStartMs = topProductWindowStart.getTime();

    const [purchaseAggregate, purchaseItemAggregate, recentPurchases, relatedPurchaseItems] = await Promise.all([
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
            gte: historyWindowStart
          }
        },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true, totalAmount: true }
      }),
      prisma.purchaseItem.findMany({
        where: {
          purchase: {
            createdAt: {
              gte: lineItemWindowStart
            }
          }
        },
        select: {
          productId: true,
          quantity: true,
          unitPrice: true,
          purchase: {
            select: {
              createdAt: true
            }
          },
          product: {
            select: {
              category: true
            }
          }
        }
      })
    ]);

    const currentDailyBuckets = new Map<string, { total: number; transactions: number }>();
    const currentDailyKeys: string[] = [];

    for (let dayOffset = 0; dayOffset < dailyWindowDays; dayOffset += 1) {
      const currentDay = addDaysUtc(currentDailyStart, dayOffset);
      const currentKey = toIsoDate(currentDay);
      currentDailyBuckets.set(currentKey, { total: 0, transactions: 0 });
      currentDailyKeys.push(currentKey);
    }

    const currentWeeklyBuckets = new Map<string, { total: number; transactions: number }>();
    const currentWeeklyKeys: string[] = [];
    const hourlyBuckets = Array.from({ length: 24 }, (_, hour) => ({ hour, total: 0, transactions: 0 }));

    for (let weekOffset = 0; weekOffset < weeklyWindowWeeks; weekOffset += 1) {
      const weekStart = addDaysUtc(currentWeeklyStart, weekOffset * 7);
      const key = toIsoDate(weekStart);
      currentWeeklyBuckets.set(key, { total: 0, transactions: 0 });
      currentWeeklyKeys.push(key);
    }

    const currentDailyStartMs = currentDailyStart.getTime();
    const previousDailyStartMs = previousDailyStart.getTime();
    const currentWeeklyStartMs = currentWeeklyStart.getTime();
    const previousWeeklyStartMs = previousWeeklyStart.getTime();

    let currentRevenue = 0;
    let previousRevenue = 0;
    let currentTransactions = 0;
    let previousTransactions = 0;

    (recentPurchases as PurchaseSummaryRecord[]).forEach((purchase) => {
      const amount = normalizeDecimal(purchase.totalAmount);
      const purchaseTime = purchase.createdAt.getTime();
      const purchaseDateKey = toIsoDate(purchase.createdAt);
      const purchaseWeekKey = toIsoDate(startOfIsoWeek(purchase.createdAt));

      if (purchaseTime >= currentDailyStartMs) {
        currentRevenue += amount;
        currentTransactions += 1;
        const bucket = currentDailyBuckets.get(purchaseDateKey);
        if (bucket) {
          bucket.total += amount;
          bucket.transactions += 1;
        }

        const hourBucket = hourlyBuckets[purchase.createdAt.getUTCHours()];
        hourBucket.total += amount;
        hourBucket.transactions += 1;
      } else if (purchaseTime >= previousDailyStartMs && purchaseTime < currentDailyStartMs) {
        previousRevenue += amount;
        previousTransactions += 1;
      }

      if (purchaseTime >= currentWeeklyStartMs) {
        const weekBucket = currentWeeklyBuckets.get(purchaseWeekKey);
        if (weekBucket) {
          weekBucket.total += amount;
          weekBucket.transactions += 1;
        }
      }
    });

    let currentItemsSold = 0;
    let previousItemsSold = 0;

    const productTotals = new Map<string, { quantity: number; revenue: number }>();
    const categoryTotals = new Map<string, { quantity: number; revenue: number }>();
    let totalCategoryQuantityCurrent = 0;

    for (const item of relatedPurchaseItems) {
      const purchaseDate = item.purchase.createdAt;
      const purchaseTime = purchaseDate.getTime();

      if (purchaseTime >= currentDailyStartMs) {
        currentItemsSold += item.quantity;
        const categoryKey = item.product?.category ?? 'Uncategorized';
        const categoryData = categoryTotals.get(categoryKey) ?? { quantity: 0, revenue: 0 };
        categoryData.quantity += item.quantity;
        categoryData.revenue += normalizeDecimal(item.unitPrice) * item.quantity;
        categoryTotals.set(categoryKey, categoryData);
        totalCategoryQuantityCurrent += item.quantity;
      } else if (purchaseTime >= previousDailyStartMs && purchaseTime < currentDailyStartMs) {
        previousItemsSold += item.quantity;
      }

      if (purchaseTime >= topProductWindowStartMs) {
        const current = productTotals.get(item.productId) ?? { quantity: 0, revenue: 0 };
        current.quantity += item.quantity;
        current.revenue += normalizeDecimal(item.unitPrice) * item.quantity;
        productTotals.set(item.productId, current);
      }
    }

    const sortedTopProducts = Array.from(productTotals.entries())
      .sort(([, a], [, b]) => b.revenue - a.revenue)
      .slice(0, 5);

    const categoryMix = Array.from(categoryTotals.entries())
      .map(([category, totals]) => ({
        category,
        quantity: totals.quantity,
        revenue: Number(totals.revenue.toFixed(2)),
        revenueShare: currentRevenue === 0 ? 0 : Number(((totals.revenue / currentRevenue) * 100).toFixed(1)),
        quantityShare: totalCategoryQuantityCurrent === 0 ? 0 : Number(((totals.quantity / totalCategoryQuantityCurrent) * 100).toFixed(1))
      }))
      .sort((a, b) => b.revenue - a.revenue);

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

      const titleMap: Record<string, string> = {};
      for (const product of productDetails) {
        titleMap[product.id] = product.title;
      }
      productTitles = titleMap;
    }

    const roundToPrecision = (value: number, precision: number) => {
      if (precision === 0) {
        return Math.round(value);
      }
      const factor = 10 ** precision;
      return Math.round(value * factor) / factor;
    };

    const createSummaryMetric = (currentValue: number, previousValue: number, precision: number) => {
      const deltaAbsoluteRaw = currentValue - previousValue;
      const deltaPercent = previousValue === 0
        ? currentValue === 0
          ? 0
          : null
        : Math.round(((deltaAbsoluteRaw / previousValue) * 100) * 10) / 10;

      return {
        current: roundToPrecision(currentValue, precision),
        previous: roundToPrecision(previousValue, precision),
        deltaAbsolute: roundToPrecision(deltaAbsoluteRaw, precision),
        deltaPercent
      };
    };

    const daily = currentDailyKeys.map((dateKey) => {
      const bucket = currentDailyBuckets.get(dateKey)!;
      return {
        date: dateKey,
        total: Number(bucket.total.toFixed(2)),
        transactions: bucket.transactions
      };
    });

    const weekly = currentWeeklyKeys.map((weekStartKey) => {
      const bucket = currentWeeklyBuckets.get(weekStartKey)!;
      return {
        weekStart: weekStartKey,
        total: Number(bucket.total.toFixed(2)),
        transactions: bucket.transactions
      };
    });

    const hourlyTrend = hourlyBuckets.map((bucket) => ({
      hour: `${bucket.hour.toString().padStart(2, '0')}:00`,
      total: Number(bucket.total.toFixed(2)),
      transactions: bucket.transactions
    }));

    let bestDayRaw: { date: string; total: number; transactions: number } | null = null;
    let slowDayRaw: { date: string; total: number; transactions: number } | null = null;

    for (const dateKey of currentDailyKeys) {
      const bucket = currentDailyBuckets.get(dateKey)!;
      if (bucket.transactions === 0 && bucket.total === 0) {
        continue;
      }
      if (!bestDayRaw || bucket.total > bestDayRaw.total) {
        bestDayRaw = { date: dateKey, total: bucket.total, transactions: bucket.transactions };
      }
      if (!slowDayRaw || bucket.total < slowDayRaw.total) {
        slowDayRaw = { date: dateKey, total: bucket.total, transactions: bucket.transactions };
      }
    }

    const bestDay = bestDayRaw
      ? {
          date: bestDayRaw.date,
          total: Number(bestDayRaw.total.toFixed(2)),
          transactions: bestDayRaw.transactions
        }
      : null;

    const slowDay = slowDayRaw
      ? {
          date: slowDayRaw.date,
          total: Number(slowDayRaw.total.toFixed(2)),
          transactions: slowDayRaw.transactions
        }
      : null;

    const revenueSummary = createSummaryMetric(currentRevenue, previousRevenue, 2);
    const transactionSummary = createSummaryMetric(currentTransactions, previousTransactions, 0);
    const itemsSoldSummary = createSummaryMetric(currentItemsSold, previousItemsSold, 0);

    const currentAverageOrderValue = currentTransactions === 0 ? 0 : currentRevenue / currentTransactions;
    const previousAverageOrderValue = previousTransactions === 0 ? 0 : previousRevenue / previousTransactions;
    const averageOrderValueSummary = createSummaryMetric(currentAverageOrderValue, previousAverageOrderValue, 2);

    const totalTopProductRevenue = sortedTopProducts.reduce((sum, [, totals]) => sum + totals.revenue, 0);

    const alerts: string[] = [];
    if (currentTransactions === 0) {
      alerts.push('No transactions recorded in the last 7 days.');
    }
    if (revenueSummary.deltaPercent !== null && revenueSummary.deltaPercent < -10) {
      alerts.push(`Revenue dropped ${Math.abs(revenueSummary.deltaPercent).toFixed(1)}% compared to the previous 7 days.`);
    }
    if (averageOrderValueSummary.deltaPercent !== null && averageOrderValueSummary.deltaPercent > 15) {
      alerts.push(`Average order value increased ${averageOrderValueSummary.deltaPercent.toFixed(1)}% week-over-week.`);
    }
    if (sortedTopProducts.length > 0 && totalTopProductRevenue > 0) {
      const leadingProduct = sortedTopProducts[0];
      const share = Math.round((leadingProduct[1].revenue / totalTopProductRevenue) * 100);
      if (share >= 60) {
        alerts.push(`${share}% of the last 30 days revenue came from ${productTitles[leadingProduct[0]] ?? leadingProduct[0]}.`);
      }
    }

    const topProducts = sortedTopProducts.map(([productId, totals]) => ({
      productId,
      title: productTitles[productId] ?? productId,
      quantity: totals.quantity,
      revenue: Number(totals.revenue.toFixed(2))
    }));

    const lifetimeRevenue = normalizeDecimal(purchaseAggregate._sum.totalAmount);
    const lifetimeTransactions = purchaseAggregate._count._all ?? 0;
    const lifetimeItemsSold = purchaseItemAggregate._sum.quantity ?? 0;

    res.json({
      totalTransactions: lifetimeTransactions,
      totalRevenue: Number(lifetimeRevenue.toFixed(2)),
      itemsSold: lifetimeItemsSold,
      lifetime: {
        revenue: Number(lifetimeRevenue.toFixed(2)),
        transactions: lifetimeTransactions,
        itemsSold: lifetimeItemsSold
      },
      period: {
        current: {
          start: toIsoDate(currentDailyStart),
          end: toIsoDate(todayStart)
        },
        previous: {
          start: toIsoDate(previousDailyStart),
          end: toIsoDate(previousDailyEnd)
        }
      },
      summary: {
        revenue: revenueSummary,
        transactions: transactionSummary,
        itemsSold: itemsSoldSummary,
        averageOrderValue: averageOrderValueSummary
      },
      daily,
      weekly,
      categoryMix,
      hourlyTrend,
      topProducts,
      highlights: {
        bestDay,
        slowDay
      },
      alerts
    });
  } catch (error) {
    res.status(500).json({ message: 'Unable to load sales stats.' });
  }
});

app.use('/admin', adminRouter);

const listen = () =>
  new Promise<void>((resolve) => {
    app.listen(port, () => {
      console.log(`API listening on http://localhost:${port}`);
      resolve();
    });
  });

const initialize = async () => {
  if (process.env.NODE_ENV === 'test') {
    return;
  }

  try {
    await ensureUploadsDir();
  } catch (error) {
    console.error('Failed to ensure uploads directory', error);
  }

  if (shouldAutoSeed) {
    try {
      const productCount = await prisma.product.count();
      if (productCount === 0) {
        await seedDatabase(prisma);
        console.log('Database seeded with mock data on startup.');
      }
    } catch (error) {
      console.error('Failed to seed database on startup', error);
    }
  }

  try {
    await listen();
  } catch (error) {
    console.error('Failed to start API server', error);
    process.exitCode = 1;
  }
};

void initialize();

export { app, resetState };
