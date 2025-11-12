import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  listActiveProductsMock,
  createPurchaseMock,
  listAllProductsMock,
  createProductMock,
  updateProductMock,
  updateProductInventoryMock,
  archiveProductMock,
  getKioskConfigMock,
  setInventoryEnabledMock,
  prismaMock
} = vi.hoisted(() => {
  const prisma = {
    purchase: {
      aggregate: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn()
    },
    purchaseItem: {
      aggregate: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn()
    },
    product: {
      findMany: vi.fn()
    }
  };

  return {
    listActiveProductsMock: vi.fn(),
    createPurchaseMock: vi.fn(),
    listAllProductsMock: vi.fn(),
    createProductMock: vi.fn(),
    updateProductMock: vi.fn(),
    updateProductInventoryMock: vi.fn(),
    archiveProductMock: vi.fn(),
    getKioskConfigMock: vi.fn(),
    setInventoryEnabledMock: vi.fn(),
    prismaMock: prisma
  };
});

vi.mock('../repositories/productRepository', () => ({
  listActiveProducts: listActiveProductsMock,
  createPurchase: createPurchaseMock,
  listAllProducts: listAllProductsMock,
  createProduct: createProductMock,
  updateProduct: updateProductMock,
  updateProductInventory: updateProductInventoryMock,
  archiveProduct: archiveProductMock
}));

vi.mock('../repositories/settingsRepository', () => ({
  getKioskConfig: getKioskConfigMock,
  setInventoryEnabled: setInventoryEnabledMock
}));

vi.mock('../lib/prisma', () => ({
  default: prismaMock
}));

type ServerModule = typeof import('../index');

let app!: ServerModule['app'];
let resetState!: ServerModule['resetState'];
let uploadsDirAbsolute!: string;

const validPayload = {
  items: [
    {
      productId: 'demo-coffee',
      quantity: 2
    }
  ]
};

describe('API routes', () => {
  beforeAll(async () => {
    uploadsDirAbsolute = mkdtempSync(path.join(os.tmpdir(), 'vibecode-uploads-'));
    process.env.UPLOADS_DIR = uploadsDirAbsolute;
    process.env.UPLOAD_MAX_SIZE_MB = '1';

    const serverModule: ServerModule = await import('../index');
    app = serverModule.app;
    resetState = serverModule.resetState;
  });

  beforeEach(async () => {
    vi.clearAllMocks();

    if (uploadsDirAbsolute) {
      rmSync(uploadsDirAbsolute, { recursive: true, force: true });
      mkdirSync(uploadsDirAbsolute, { recursive: true });
    }

    listActiveProductsMock.mockResolvedValue([
      { id: 'demo-coffee', title: 'Coffee', price: '2.50', imageUrl: null, inventoryCount: 5, isActive: true }
    ]);

    createPurchaseMock.mockResolvedValue({ reference: 'purchase-123' });
    listAllProductsMock.mockResolvedValue([
      { id: 'demo-coffee', title: 'Coffee', description: '', price: 2.5, imageUrl: null, inventoryCount: 5, isActive: true, createdAt: new Date(), updatedAt: new Date() }
    ]);
    createProductMock.mockResolvedValue({ id: 'new-product' });
    updateProductMock.mockResolvedValue({ id: 'demo-coffee' });
    updateProductInventoryMock.mockResolvedValue({ id: 'demo-coffee', inventoryCount: 7 });
    archiveProductMock.mockResolvedValue({ id: 'demo-coffee', isActive: false });

    getKioskConfigMock.mockResolvedValue({ currency: 'EUR', paymentProvider: 'mobilepay', inventoryEnabled: true });
    setInventoryEnabledMock.mockResolvedValue({ currency: 'EUR', paymentProvider: 'mobilepay', inventoryEnabled: false });

    prismaMock.purchase.aggregate.mockResolvedValue({ _sum: { totalAmount: 42 }, _count: { _all: 3 } });
    prismaMock.purchase.findMany.mockResolvedValue([
      { createdAt: new Date('2025-11-05T00:00:00Z'), totalAmount: 12 },
      { createdAt: new Date('2025-11-07T00:00:00Z'), totalAmount: 30 }
    ]);
    prismaMock.purchase.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.purchaseItem.aggregate.mockResolvedValue({ _sum: { quantity: 9 } });
    prismaMock.purchaseItem.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.purchaseItem.findMany.mockResolvedValue([
      { productId: 'demo-coffee', quantity: 5, unitPrice: 2.5 },
      { productId: 'sparkling-water', quantity: 3, unitPrice: 3 }
    ]);
    prismaMock.product.findMany.mockResolvedValue([
      { id: 'demo-coffee', title: 'Coffee' },
      { id: 'sparkling-water', title: 'Sparkling Water' }
    ]);

    process.env.ADMIN_API_KEY = 'test-secret';

    await resetState();
  });

  afterAll(() => {
    if (uploadsDirAbsolute) {
      rmSync(uploadsDirAbsolute, { recursive: true, force: true });
    }
  });

  it('responds with ok status on /health', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('returns product list via /products', async () => {
    const response = await request(app).get('/products');

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.items)).toBe(true);
    expect(response.body.items[0]).toMatchObject({ id: 'demo-coffee' });
    expect(listActiveProductsMock).toHaveBeenCalled();
  });

  it('provides kiosk configuration via /config', async () => {
    const response = await request(app).get('/config');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      currency: 'EUR',
      paymentProvider: 'mobilepay'
    });
    expect(getKioskConfigMock).toHaveBeenCalled();
  });

  it('rejects purchases without items', async () => {
    const response = await request(app).post('/purchases').send({});

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('requires at least one item');
  });

  it('rejects purchases with invalid quantity', async () => {
    const response = await request(app)
      .post('/purchases')
      .send({ items: [{ productId: 'demo-coffee', quantity: 0 }] });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('positive quantity');
  });

  it('returns 500 when repository rejects purchase', async () => {
    createPurchaseMock.mockRejectedValueOnce(new Error('unexpected failure'));

    const response = await request(app).post('/purchases').send(validPayload);

    expect(response.status).toBe(500);
    expect(response.body.message).toContain('Unable to process purchase');
  });

  it('returns 404 when repository throws for unknown product', async () => {
    createPurchaseMock.mockRejectedValueOnce(new Error('Unknown product(s): demo-coffee'));

    const response = await request(app).post('/purchases').send(validPayload);

    expect(response.status).toBe(404);
    expect(response.body.message).toContain('Unknown product');
  });

  it('accepts a valid purchase request', async () => {
    const response = await request(app).post('/purchases').send(validPayload);

    expect(response.status).toBe(202);
    expect(response.body.reference).toBe('purchase-123');
    expect(createPurchaseMock).toHaveBeenCalledWith({
      items: validPayload.items,
      reference: undefined,
      notes: undefined
    });
  });

  it('requires admin token for admin routes', async () => {
    const response = await request(app).get('/admin/products');

    expect(response.status).toBe(401);
  });

  it('returns admin product list when authorized', async () => {
    const response = await request(app)
      .get('/admin/products')
      .set('x-admin-token', 'test-secret');

    expect(response.status).toBe(200);
    expect(listAllProductsMock).toHaveBeenCalled();
  });

  it('archives a product via admin endpoint', async () => {
    const response = await request(app)
      .delete('/admin/products/demo-coffee')
      .set('x-admin-token', 'test-secret');

    expect(response.status).toBe(200);
    expect(archiveProductMock).toHaveBeenCalledWith('demo-coffee');
  });

  it('updates kiosk config when admin toggles inventory', async () => {
    const response = await request(app)
      .patch('/admin/kiosk-mode')
      .set('x-admin-token', 'test-secret')
      .send({ inventoryEnabled: false });

    expect(response.status).toBe(200);
    expect(setInventoryEnabledMock).toHaveBeenCalledWith(false);
  });

  it('rejects invalid kiosk toggle payload', async () => {
    const response = await request(app)
      .patch('/admin/kiosk-mode')
      .set('x-admin-token', 'test-secret')
      .send({ inventoryEnabled: 'yes' });

    expect(response.status).toBe(400);
  });

  it('returns sales stats for admin dashboard', async () => {
    const response = await request(app)
      .get('/admin/stats/sales')
      .set('x-admin-token', 'test-secret');

    expect(response.status).toBe(200);
    expect(response.body.totalTransactions).toBe(3);
    expect(response.body.totalRevenue).toBe(42);
    expect(response.body.itemsSold).toBe(9);
    expect(Array.isArray(response.body.daily)).toBe(true);
    expect(Array.isArray(response.body.weekly)).toBe(true);
    expect(Array.isArray(response.body.topProducts)).toBe(true);
    expect(response.body.topProducts[0]).toMatchObject({ productId: 'demo-coffee', title: 'Coffee' });
    expect(response.body.daily).toHaveLength(7);
    expect(response.body.weekly).toHaveLength(4);
    expect(prismaMock.purchase.aggregate).toHaveBeenCalled();
    expect(prismaMock.purchase.findMany).toHaveBeenCalled();
    expect(prismaMock.purchaseItem.findMany).toHaveBeenCalled();
  });

  it('allows admins to upload images and returns file metadata', async () => {
    const pngBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGMAAQAABQABDQotAAAAAElFTkSuQmCC',
      'base64'
    );

    const response = await request(app)
      .post('/admin/uploads')
      .set('x-admin-token', 'test-secret')
      .attach('image', pngBuffer, { filename: 'tiny.png', contentType: 'image/png' });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ filename: expect.stringMatching(/\.png$/), url: expect.stringMatching(/^\/uploads\//) });

  const savedFile = path.join(uploadsDirAbsolute, response.body.filename);
    expect(existsSync(savedFile)).toBe(true);
    expect(readFileSync(savedFile).equals(pngBuffer)).toBe(true);
  });

  it('rejects uploads without admin credentials', async () => {
    const response = await request(app)
      .post('/admin/uploads')
      .attach('image', Buffer.from('data'), { filename: 'tiny.png', contentType: 'image/png' });

    expect(response.status).toBe(401);
  });

  it('rejects unsupported file types for uploads', async () => {
    const response = await request(app)
      .post('/admin/uploads')
      .set('x-admin-token', 'test-secret')
      .attach('image', Buffer.from('plain text'), { filename: 'note.txt', contentType: 'text/plain' });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('Only JPEG, PNG, or WebP images are allowed');
  });

  it('rejects uploads that exceed the configured size limit', async () => {
    const largeBuffer = Buffer.alloc(1024 * 1024 * 2, 0xff);

    const response = await request(app)
      .post('/admin/uploads')
      .set('x-admin-token', 'test-secret')
      .attach('image', largeBuffer, { filename: 'large.png', contentType: 'image/png' });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('Image must be 1 MB or smaller');
  });
});
