import express, { type Request, type Response } from 'express';
import { Prisma } from '@prisma/client';
import multer, { MulterError } from 'multer';
import cors from 'cors';
import cookieParser from 'cookie-parser';
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
import { env } from './lib/env';
import {
  ADMIN_SESSION_COOKIE,
  clearAdminSessionCookie,
  createAdminSessionToken
} from './lib/adminSession';
import {
  authenticateWithPassword,
  confirmPasswordReset,
  requestPasswordReset
} from './services/adminAuthService';
import { sendPasswordResetEmail } from './services/adminEmailService';

const app = express();
const port = Number.parseInt(process.env.PORT ?? '3000', 10);
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const shouldAutoSeed = (process.env.AUTO_SEED ?? 'true').toLowerCase() !== 'false';
const secureCookies = env.NODE_ENV === 'production';

const setAdminSessionCookie = (res: Response, token: string, maxAgeMs: number) => {
  res.cookie(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: secureCookies,
    maxAge: maxAgeMs
  });
};

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

type ProductSalesRow = {
  productId: string;
  quantity: unknown;
  revenue: unknown;
};

type HourlyTransactionsRow = {
  hour: unknown;
  transactions: unknown;
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
app.use(cookieParser(env.ADMIN_SESSION_SECRET));
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

app.post('/auth/login', async (req: Request, res: Response) => {
  const { identifier, password, remember } = req.body as {
    identifier?: unknown;
    password?: unknown;
    remember?: unknown;
  };

  if (typeof identifier !== 'string' || identifier.trim().length === 0 || typeof password !== 'string' || password.length === 0) {
    return res.status(400).json({ message: 'Identifier and password are required.' });
  }

  try {
    const authResult = await authenticateWithPassword(identifier, password);

    if (authResult.status === 'SUCCESS') {
      const session = createAdminSessionToken(authResult.admin, {
        remember: remember === true
      });

      setAdminSessionCookie(res, session.token, session.maxAgeMs);

      return res.json({
        admin: authResult.admin,
        needsPasswordUpgrade: authResult.needsPasswordUpgrade
      });
    }

    clearAdminSessionCookie(res);

    if (authResult.status === 'INVALID_CREDENTIALS') {
      return res.status(401).json({
        message: 'Invalid email/username or password.',
        remainingAttempts: authResult.remainingAttempts
      });
    }

    if (authResult.status === 'ACCOUNT_LOCKED') {
      return res.status(423).json({
        message: 'Account locked due to too many failed attempts. Please reset your password.'
      });
    }

    if (authResult.status === 'ACCOUNT_DISABLED') {
      return res.status(403).json({
        message: 'Account is disabled. Contact support.'
      });
    }

    return res.status(500).json({ message: 'Unable to login.' });
  } catch (error) {
    console.error('Failed to authenticate admin user', error);
    return res.status(500).json({ message: 'Unable to login.' });
  }
});

app.post('/auth/logout', (_req: Request, res: Response) => {
  clearAdminSessionCookie(res);
  res.status(204).send();
});

app.post('/auth/password-reset/request', async (req: Request, res: Response) => {
  const { email } = req.body as { email?: unknown };

  if (typeof email !== 'string' || email.trim().length === 0) {
    return res.status(400).json({ message: 'Email is required.' });
  }

  try {
    const result = await requestPasswordReset(email);
    const responseBody: Record<string, unknown> = {
      message: 'If an account matches that email, password reset instructions have been sent.'
    };

    if (result.token && result.admin && result.expiresAt) {
      await sendPasswordResetEmail({
        email: result.admin.email,
        username: result.admin.username,
        token: result.token,
        expiresAt: result.expiresAt
      });
    }

    if (result.token && env.NODE_ENV !== 'production') {
      responseBody.debugToken = result.token;
      responseBody.expiresAt = result.expiresAt?.toISOString();
      responseBody.admin = result.admin;
    }

    return res.status(202).json(responseBody);
  } catch (error) {
    console.error('Failed to issue password reset token', error);
    return res.status(500).json({ message: 'Unable to process reset request.' });
  }
});

app.post('/auth/password-reset/confirm', async (req: Request, res: Response) => {
  const { token, password } = req.body as { token?: unknown; password?: unknown };

  if (typeof token !== 'string' || token.length === 0 || typeof password !== 'string' || password.length === 0) {
    return res.status(400).json({ message: 'Reset token and new password are required.' });
  }

  try {
    const result = await confirmPasswordReset(token, password);

    if (result.status === 'SUCCESS') {
      const session = createAdminSessionToken(result.admin);
      setAdminSessionCookie(res, session.token, session.maxAgeMs);
      return res.json({
        message: 'Password updated successfully.',
        admin: result.admin
      });
    }

    if (result.status === 'POLICY_VIOLATION') {
      return res.status(422).json({ message: result.message });
    }

    return res.status(400).json({ message: 'Invalid or expired reset token.' });
  } catch (error) {
    console.error('Failed to confirm password reset', error);
    return res.status(500).json({ message: 'Unable to complete password reset.' });
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

    const [
      purchaseAggregate,
      purchaseItemAggregate,
      recentPurchases,
      relatedPurchaseItems,
      productCatalog,
      productSalesLast7DaysRows,
      productSalesLifetimeRows,
      hourlyTransactionsRows
    ] = await Promise.all([
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
      }),
      prisma.product.findMany({
        select: {
          id: true,
          title: true,
          category: true,
          inventoryCount: true,
          isActive: true,
          price: true
        }
      }),
      prisma.$queryRaw<ProductSalesRow[]>`
        SELECT "purchase_items"."productId" AS "productId",
               SUM("purchase_items"."quantity") AS "quantity",
               SUM("purchase_items"."quantity" * "purchase_items"."unitPrice") AS "revenue"
        FROM "purchase_items"
        INNER JOIN "purchases" ON "purchase_items"."purchaseId" = "purchases"."id"
        WHERE "purchases"."createdAt" >= ${currentDailyStart}
        GROUP BY "purchase_items"."productId"
      `,
      prisma.$queryRaw<ProductSalesRow[]>`
        SELECT "purchase_items"."productId" AS "productId",
               SUM("purchase_items"."quantity") AS "quantity",
               SUM("purchase_items"."quantity" * "purchase_items"."unitPrice") AS "revenue"
        FROM "purchase_items"
        GROUP BY "purchase_items"."productId"
      `,
      prisma.$queryRaw<HourlyTransactionsRow[]>`
        SELECT EXTRACT(HOUR FROM timezone('Europe/Helsinki', "purchases"."createdAt" AT TIME ZONE 'UTC'))::int AS "hour",
               COUNT(*)::bigint AS "transactions"
        FROM "purchases"
        GROUP BY 1
        ORDER BY 1
      `
    ]);

    const lifetimeTransactions = purchaseAggregate._count._all ?? 0;

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

    const productTitles = productCatalog.reduce<Record<string, string>>((acc, product) => {
      acc[product.id] = product.title;
      return acc;
    }, {});

    const roundCurrency = (value: number) => (Number.isFinite(value) ? Number(value.toFixed(2)) : 0);

    const createProductSalesMap = (rows: ProductSalesRow[]) => {
      const map = new Map<string, { quantity: number; revenue: number }>();
      for (const row of rows) {
        const quantityValue = normalizeDecimal(row.quantity ?? 0);
        const revenueValue = normalizeDecimal(row.revenue ?? 0);
        map.set(row.productId, {
          quantity: Math.round(quantityValue),
          revenue: revenueValue
        });
      }
      return map;
    };

    const productSalesLast7DaysMap = createProductSalesMap(productSalesLast7DaysRows);
    const productSalesLifetimeMap = createProductSalesMap(productSalesLifetimeRows);

    const productPerformance = productCatalog
      .map((product) => {
        const last7 = productSalesLast7DaysMap.get(product.id);
        const last30 = productTotals.get(product.id);
        const lifetime = productSalesLifetimeMap.get(product.id);
        const priceValue = normalizeDecimal(product.price);

        const last7Quantity = last7?.quantity ?? 0;
        const last7Revenue = last7?.revenue ?? 0;
        const last30Quantity = last30?.quantity ?? 0;
        const last30Revenue = last30?.revenue ?? 0;
        const lifetimeQuantity = lifetime?.quantity ?? 0;
        const lifetimeRevenue = lifetime?.revenue ?? 0;

        return {
          productId: product.id,
          title: product.title,
          category: product.category ?? 'Uncategorized',
          isActive: product.isActive,
          inventoryCount: product.inventoryCount,
          price: roundCurrency(priceValue),
          sales: {
            last7Days: {
              quantity: last7Quantity,
              revenue: roundCurrency(last7Revenue)
            },
            last30Days: {
              quantity: last30Quantity,
              revenue: roundCurrency(last30Revenue)
            },
            lifetime: {
              quantity: lifetimeQuantity,
              revenue: roundCurrency(lifetimeRevenue)
            }
          }
        };
      })
      .sort((a, b) => {
        const revenueDiff = b.sales.last7Days.revenue - a.sales.last7Days.revenue;
        if (revenueDiff !== 0) {
          return revenueDiff;
        }
        return b.sales.last30Days.revenue - a.sales.last30Days.revenue;
      });

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

    const hourlyTotals = Array.from({ length: 24 }, (_, hour) => ({ hour, transactions: 0 }));

    for (const row of hourlyTransactionsRows) {
      const hourValue = Number(row.hour);
      if (!Number.isFinite(hourValue)) {
        continue;
      }

      const hourIndex = Math.trunc(hourValue);
      if (hourIndex < 0 || hourIndex > 23) {
        continue;
      }

      const transactionsRounded = Math.max(0, Math.round(normalizeDecimal(row.transactions)));
      hourlyTotals[hourIndex].transactions = transactionsRounded;
    }

    const hourlyTrend = hourlyTotals.map(({ hour, transactions }) => ({
      hour: `${hour.toString().padStart(2, '0')}:00`,
      percentage: lifetimeTransactions === 0 ? 0 : Number(((transactions / lifetimeTransactions) * 100).toFixed(1)),
      transactions
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
      productPerformance,
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

type AdminTransactionsQuery = {
  start?: string;
  end?: string;
  category?: string;
};

type TransactionRow = {
  id: string;
  reference: string;
  totalAmount: Prisma.Decimal;
  status: string;
  notes: string | null;
  createdAt: Date;
  items: Array<{
    quantity: number;
    unitPrice: Prisma.Decimal;
    product: {
      id: string;
      title: string;
      category: string;
    };
  }>;
};

const MAX_TRANSACTION_WINDOW_DAYS = 90;

const parseTransactionQuery = (query: AdminTransactionsQuery) => {
  const now = new Date();
  const today = startOfDayUtc(now);

  let startDate: Date | null = null;
  let endDate: Date | null = null;

  if (query.start) {
    const parsed = new Date(query.start);
    if (Number.isNaN(parsed.getTime())) {
      return { error: 'Invalid start date. Use ISO 8601 (YYYY-MM-DD).' } as const;
    }
    startDate = startOfDayUtc(parsed);
  }

  if (query.end) {
    const parsed = new Date(query.end);
    if (Number.isNaN(parsed.getTime())) {
      return { error: 'Invalid end date. Use ISO 8601 (YYYY-MM-DD).' } as const;
    }
    endDate = addDaysUtc(startOfDayUtc(parsed), 1);
  }

  if (startDate && endDate && startDate.getTime() > endDate.getTime()) {
    return { error: 'Start date must be before end date.' } as const;
  }

  if (!startDate && endDate) {
    startDate = addDaysUtc(endDate, -MAX_TRANSACTION_WINDOW_DAYS);
  }

  if (!startDate) {
    startDate = addDaysUtc(today, -(MAX_TRANSACTION_WINDOW_DAYS - 1));
  }

  if (!endDate) {
    endDate = addDaysUtc(today, 1);
  }

  const windowMs = endDate.getTime() - startDate.getTime();
  const maxWindowMs = MAX_TRANSACTION_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  if (windowMs > maxWindowMs) {
    return { error: `Date range cannot exceed ${MAX_TRANSACTION_WINDOW_DAYS} days.` } as const;
  }

  const category = normalizeCategory(query.category);

  return {
    data: {
      start: startDate,
      end: endDate,
      categoryFilter: category === 'Uncategorized' && !query.category ? null : category
    }
  } as const;
};

const toTransactionSummary = (rows: TransactionRow[]) => {
  return rows.map((transaction) => {
    const totalAmount = normalizeDecimal(transaction.totalAmount);
    const sortedItems = [...transaction.items].sort((a, b) => a.product.title.localeCompare(b.product.title));
    const lineItems = sortedItems.map((item) => ({
      productId: item.product.id,
      title: item.product.title,
      category: item.product.category ?? 'Uncategorized',
      quantity: item.quantity,
      unitPrice: normalizeDecimal(item.unitPrice),
      subtotal: normalizeDecimal(item.unitPrice) * item.quantity
    }));

    const categoryBreakdown = lineItems.reduce<Record<string, { quantity: number; revenue: number }>>((acc, item) => {
      const key = item.category ?? 'Uncategorized';
      if (!acc[key]) {
        acc[key] = { quantity: 0, revenue: 0 };
      }
      acc[key].quantity += item.quantity;
      acc[key].revenue += item.subtotal;
      return acc;
    }, {});

    return {
      id: transaction.id,
      reference: transaction.reference,
      status: transaction.status,
      notes: transaction.notes ?? null,
      totalAmount: Number(totalAmount.toFixed(2)),
      createdAt: transaction.createdAt.toISOString(),
      lineItems,
      categoryBreakdown: Object.entries(categoryBreakdown)
        .map(([category, totals]) => ({
          category,
          quantity: totals.quantity,
          revenue: Number(totals.revenue.toFixed(2))
        }))
        .sort((a, b) => b.revenue - a.revenue)
    };
  });
};

adminRouter.get('/transactions', async (req: Request<unknown, unknown, unknown, AdminTransactionsQuery>, res: Response) => {
  const validation = parseTransactionQuery(req.query);
  if ('error' in validation) {
    return res.status(400).json({ message: validation.error });
  }

  const { start, end, categoryFilter } = validation.data;

  try {
    const transactions = await prisma.purchase.findMany({
      where: {
        createdAt: {
          gte: start,
          lt: end
        },
        status: {
          not: 'CANCELLED'
        },
        ...(categoryFilter
          ? {
              items: {
                some: {
                  product: {
                    category: categoryFilter
                  }
                }
              }
            }
          : {})
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        reference: true,
        totalAmount: true,
        status: true,
        notes: true,
        createdAt: true,
        items: {
          select: {
            quantity: true,
            unitPrice: true,
            product: {
              select: {
                id: true,
                title: true,
                category: true
              }
            }
          }
        }
      }
    });

    const categories = (await prisma.product.findMany({
      select: {
        category: true
      },
      distinct: ['category']
    }))
      .map((row) => normalizeCategory(row.category))
      .filter((value, index, self) => self.indexOf(value) === index)
      .sort((a, b) => a.localeCompare(b));

    res.json({
      range: {
        start: start.toISOString(),
        end: addDaysUtc(end, -1).toISOString().slice(0, 10)
      },
      categoryFilter: categoryFilter ?? null,
      categories,
      transactions: toTransactionSummary(transactions as TransactionRow[])
    });
  } catch (error) {
    res.status(500).json({ message: 'Unable to load transactions.' });
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
        const seedResult = await seedDatabase(prisma);
        console.log('Database seeded with mock data on startup.');

        if (seedResult.adminAccount) {
          if (env.NODE_ENV !== 'production') {
            console.log(
              `Created default admin account -> email: ${seedResult.adminAccount.email}, username: ${seedResult.adminAccount.username}, password: ${seedResult.adminAccount.password}`
            );
          } else {
            console.log('Default admin account ensured. Update credentials immediately.');
          }
        }
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
