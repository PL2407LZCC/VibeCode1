import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

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
  prismaMock,
  listAdminDirectoryMock,
  issueAdminInviteMock,
  resendAdminInviteMock,
  revokeAdminInviteMock,
  updateAdminActivationMock,
  previewAdminInviteMock,
  acceptAdminInviteMock
} = vi.hoisted(() => {
  const prisma = {
    purchase: {
      aggregate: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn()
    },
    purchaseItem: {
      aggregate: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn()
    },
    product: {
      findMany: vi.fn()
    },
    $queryRaw: vi.fn()
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
    prismaMock: prisma,
    listAdminDirectoryMock: vi.fn(),
    issueAdminInviteMock: vi.fn(),
    resendAdminInviteMock: vi.fn(),
    revokeAdminInviteMock: vi.fn(),
    updateAdminActivationMock: vi.fn(),
    previewAdminInviteMock: vi.fn(),
    acceptAdminInviteMock: vi.fn()
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

vi.mock('../services/adminInviteService', async () => {
  const actual = await vi.importActual<typeof import('../services/adminInviteService')>('../services/adminInviteService');
  return {
    ...actual,
    listAdminDirectory: listAdminDirectoryMock,
    issueAdminInvite: issueAdminInviteMock,
    resendAdminInvite: resendAdminInviteMock,
    revokeAdminInvite: revokeAdminInviteMock,
    updateAdminActivation: updateAdminActivationMock,
    previewAdminInvite: previewAdminInviteMock,
    acceptAdminInvite: acceptAdminInviteMock
  };
});

type ServerModule = typeof import('../index');

const FIXED_NOW = new Date('2025-11-25T12:00:00Z');

let app!: ServerModule['app'];
let resetState!: ServerModule['resetState'];
let uploadsDirAbsolute!: string;
let AdminDirectoryError!: typeof import('../services/adminInviteService').AdminDirectoryError;
let AdminInviteAcceptanceError!: typeof import('../services/adminInviteService').AdminInviteAcceptanceError;

const validPayload = {
  items: [
    {
      productId: 'demo-coffee',
      quantity: 2
    }
  ]
};

let adminDirectoryResponse: any;
let issuedInviteResponse: any;
let resendInviteResponse: any;
let revokedInviteResponse: any;
let updatedAdminActivationResponse: any;
let invitePreviewResponse: any;
let inviteAcceptanceResponse: any;

describe('API routes', () => {
  beforeAll(async () => {
    uploadsDirAbsolute = mkdtempSync(path.join(os.tmpdir(), 'vibecode-uploads-'));
    process.env.UPLOADS_DIR = uploadsDirAbsolute;
    process.env.UPLOAD_MAX_SIZE_MB = '1';

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(FIXED_NOW);

    const serverModule: ServerModule = await import('../index');
    app = serverModule.app;
    resetState = serverModule.resetState;

    const serviceModule = await import('../services/adminInviteService');
    AdminDirectoryError = serviceModule.AdminDirectoryError;
    AdminInviteAcceptanceError = serviceModule.AdminInviteAcceptanceError;
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.setSystemTime(FIXED_NOW);

    if (uploadsDirAbsolute) {
      rmSync(uploadsDirAbsolute, { recursive: true, force: true });
      mkdirSync(uploadsDirAbsolute, { recursive: true });
    }

    listActiveProductsMock.mockResolvedValue([
      {
        id: 'demo-coffee',
        title: 'Coffee',
        price: '2.50',
        imageUrl: null,
        inventoryCount: 5,
        isActive: true,
        category: 'Beverages'
      }
    ]);

    createPurchaseMock.mockResolvedValue({ reference: 'purchase-123' });
    listAllProductsMock.mockResolvedValue([
      {
        id: 'demo-coffee',
        title: 'Coffee',
        description: '',
        price: 2.5,
        imageUrl: null,
        inventoryCount: 5,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        category: 'Beverages'
      }
    ]);
    createProductMock.mockResolvedValue({ id: 'new-product', category: 'Beverages' });
    updateProductMock.mockResolvedValue({ id: 'demo-coffee', category: 'Beverages' });
    updateProductInventoryMock.mockResolvedValue({ id: 'demo-coffee', inventoryCount: 7 });
    archiveProductMock.mockResolvedValue({ id: 'demo-coffee', isActive: false, category: 'Beverages' });

    getKioskConfigMock.mockResolvedValue({ currency: 'EUR', paymentProvider: 'mobilepay', inventoryEnabled: true });
    setInventoryEnabledMock.mockResolvedValue({ currency: 'EUR', paymentProvider: 'mobilepay', inventoryEnabled: false });

    adminDirectoryResponse = {
      admins: [
        {
          id: 'legacy-admin',
          email: 'legacy-admin@localhost',
          username: 'legacy-admin',
          isActive: true,
          createdAt: new Date(0).toISOString(),
          updatedAt: new Date(0).toISOString(),
          lastLoginAt: null
        }
      ],
      invites: [
        {
          id: 'invite-1',
          email: 'new-admin@example.com',
          username: 'newadmin',
          status: 'pending',
          createdAt: new Date('2025-11-26T12:00:00Z').toISOString(),
          updatedAt: new Date('2025-11-26T12:00:00Z').toISOString(),
          expiresAt: new Date('2025-12-03T12:00:00Z').toISOString(),
          lastSentAt: new Date('2025-11-26T12:00:00Z').toISOString(),
          acceptedAt: null,
          revokedAt: null,
          invitedBy: {
            id: 'legacy-admin',
            username: 'legacy-admin'
          }
        }
      ]
    };
    listAdminDirectoryMock.mockResolvedValue(adminDirectoryResponse);

    issuedInviteResponse = {
      invite: {
        id: 'invite-2',
        email: 'fresh-admin@example.com',
        username: 'freshadmin',
        status: 'sent',
        createdAt: new Date('2025-11-27T12:00:00Z').toISOString(),
        updatedAt: new Date('2025-11-27T12:00:00Z').toISOString(),
        expiresAt: new Date('2025-12-04T12:00:00Z').toISOString(),
        lastSentAt: new Date('2025-11-27T12:00:00Z').toISOString(),
        acceptedAt: null,
        revokedAt: null,
        invitedBy: {
          id: 'legacy-admin',
          username: 'legacy-admin'
        }
      },
      token: 'debug-token-123',
      expiresAt: new Date('2025-12-04T12:00:00Z')
    };
    issueAdminInviteMock.mockResolvedValue(issuedInviteResponse);

    resendInviteResponse = {
      invite: {
        id: 'invite-1',
        email: 'new-admin@example.com',
        username: 'newadmin',
        status: 'sent',
        createdAt: new Date('2025-11-26T12:00:00Z').toISOString(),
        updatedAt: new Date('2025-11-27T12:30:00Z').toISOString(),
        expiresAt: new Date('2025-12-03T12:00:00Z').toISOString(),
        lastSentAt: new Date('2025-11-27T12:30:00Z').toISOString(),
        acceptedAt: null,
        revokedAt: null,
        invitedBy: {
          id: 'legacy-admin',
          username: 'legacy-admin'
        }
      },
      token: 'debug-token-456',
      expiresAt: new Date('2025-12-03T12:00:00Z')
    };
    resendAdminInviteMock.mockResolvedValue(resendInviteResponse);

    revokedInviteResponse = {
      id: 'invite-1',
      email: 'new-admin@example.com',
      username: 'newadmin',
      status: 'revoked',
      createdAt: new Date('2025-11-26T12:00:00Z').toISOString(),
      updatedAt: new Date('2025-11-27T13:00:00Z').toISOString(),
      expiresAt: null,
      lastSentAt: new Date('2025-11-27T12:30:00Z').toISOString(),
      acceptedAt: null,
      revokedAt: new Date('2025-11-27T13:00:00Z').toISOString(),
      invitedBy: {
        id: 'legacy-admin',
        username: 'legacy-admin'
      }
    };
    revokeAdminInviteMock.mockResolvedValue(revokedInviteResponse);

    updatedAdminActivationResponse = {
      id: 'admin-2',
      email: 'other@example.com',
      username: 'other',
      isActive: false,
      createdAt: new Date('2025-09-01T08:00:00Z').toISOString(),
      updatedAt: new Date('2025-11-27T14:00:00Z').toISOString(),
      lastLoginAt: null
    };
    updateAdminActivationMock.mockResolvedValue(updatedAdminActivationResponse);

    invitePreviewResponse = {
      invite: adminDirectoryResponse.invites[0],
      canAccept: true,
      reason: null
    };
    previewAdminInviteMock.mockResolvedValue(invitePreviewResponse);

    inviteAcceptanceResponse = {
      admin: {
        id: 'fresh-admin',
        email: 'fresh-admin@example.com',
        username: 'freshadmin',
        isActive: true,
        createdAt: new Date('2025-11-27T12:35:00Z').toISOString(),
        updatedAt: new Date('2025-11-27T12:35:00Z').toISOString(),
        lastLoginAt: null
      },
      invite: {
        id: 'invite-2',
        email: 'fresh-admin@example.com',
        username: 'freshadmin',
        status: 'accepted',
        createdAt: new Date('2025-11-27T12:00:00Z').toISOString(),
        updatedAt: new Date('2025-11-27T12:35:00Z').toISOString(),
        expiresAt: new Date('2025-12-04T12:00:00Z').toISOString(),
        lastSentAt: new Date('2025-11-27T12:00:00Z').toISOString(),
        acceptedAt: new Date('2025-11-27T12:35:00Z').toISOString(),
        revokedAt: null,
        invitedBy: {
          id: 'legacy-admin',
          username: 'legacy-admin'
        }
      }
    };
    acceptAdminInviteMock.mockResolvedValue(inviteAcceptanceResponse);

    prismaMock.purchase.aggregate.mockResolvedValue({ _sum: { totalAmount: 1000 }, _count: { _all: 120 } });
    prismaMock.purchase.findMany.mockResolvedValue([
      { createdAt: new Date('2025-10-10T13:00:00Z'), totalAmount: 100 },
      { createdAt: new Date('2025-11-13T09:00:00Z'), totalAmount: 40 },
      { createdAt: new Date('2025-11-17T20:30:00Z'), totalAmount: 10 },
      { createdAt: new Date('2025-11-19T08:15:00Z'), totalAmount: 50 },
      { createdAt: new Date('2025-11-22T18:25:00Z'), totalAmount: 30 },
      { createdAt: new Date('2025-11-25T11:05:00Z'), totalAmount: 20 }
    ]);
    prismaMock.purchase.findUnique.mockResolvedValue(null);
    prismaMock.purchase.update.mockResolvedValue(null);
    prismaMock.purchase.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.purchaseItem.aggregate.mockResolvedValue({ _sum: { quantity: 320 } });
    prismaMock.purchaseItem.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.purchaseItem.findMany.mockResolvedValue([
      {
        productId: 'demo-coffee',
        quantity: 6,
        unitPrice: 2.5,
        purchase: { createdAt: new Date('2025-11-22T18:25:00Z') },
        product: { category: 'Beverages' }
      },
      {
        productId: 'sparkling-water',
        quantity: 4,
        unitPrice: 3,
        purchase: { createdAt: new Date('2025-11-25T11:05:00Z') },
        product: { category: 'Beverages' }
      },
      {
        productId: 'granola-bar',
        quantity: 5,
        unitPrice: 2,
        purchase: { createdAt: new Date('2025-11-22T08:15:00Z') },
        product: { category: 'Snacks' }
      },
      {
        productId: 'demo-coffee',
        quantity: 2,
        unitPrice: 2.5,
        purchase: { createdAt: new Date('2025-11-17T20:30:00Z') },
        product: { category: 'Beverages' }
      }
    ]);
    prismaMock.$queryRaw
      .mockResolvedValueOnce([
        { productId: 'demo-coffee', quantity: 6, revenue: 15 },
        { productId: 'sparkling-water', quantity: 4, revenue: 12 },
        { productId: 'granola-bar', quantity: 5, revenue: 10 }
      ])
      .mockResolvedValueOnce([
        { productId: 'demo-coffee', quantity: 8, revenue: 20 },
        { productId: 'sparkling-water', quantity: 4, revenue: 12 },
        { productId: 'granola-bar', quantity: 5, revenue: 10 }
      ])
      .mockResolvedValueOnce([
        { hour: 10, transactions: 40 },
        { hour: 11, transactions: 5 },
        { hour: 13, transactions: 20 },
        { hour: 20, transactions: 30 },
        { hour: 22, transactions: 25 }
      ]);
    prismaMock.product.findMany.mockResolvedValue([
      {
        id: 'demo-coffee',
        title: 'Coffee',
        category: 'Beverages',
        inventoryCount: 18,
        isActive: true,
        price: 2.5
      },
      {
        id: 'sparkling-water',
        title: 'Sparkling Water',
        category: 'Beverages',
        inventoryCount: 30,
        isActive: true,
        price: 3
      },
      {
        id: 'granola-bar',
        title: 'Granola Bar',
        category: 'Snacks',
        inventoryCount: 45,
        isActive: true,
        price: 2
      }
    ]);

    process.env.ADMIN_API_KEY = 'test-secret';

    await resetState();
  });

  afterEach(() => {
    listAdminDirectoryMock.mockReset();
    issueAdminInviteMock.mockReset();
    resendAdminInviteMock.mockReset();
    revokeAdminInviteMock.mockReset();
    updateAdminActivationMock.mockReset();
    previewAdminInviteMock.mockReset();
    acceptAdminInviteMock.mockReset();
  });

  afterAll(() => {
    if (uploadsDirAbsolute) {
      rmSync(uploadsDirAbsolute, { recursive: true, force: true });
    }

    vi.useRealTimers();
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

  it('previews an invite token for onboarding', async () => {
    const response = await request(app)
      .post('/auth/invite/preview')
      .send({ token: 'sample-token' });

    expect(response.status).toBe(200);
    expect(previewAdminInviteMock).toHaveBeenCalledWith('sample-token');
    expect(response.body).toEqual(invitePreviewResponse);
  });

  it('validates invite preview payloads', async () => {
    const response = await request(app).post('/auth/invite/preview').send({ token: '' });

    expect(response.status).toBe(400);
    expect(previewAdminInviteMock).not.toHaveBeenCalled();
  });

  it('surfaces invite preview errors', async () => {
    previewAdminInviteMock.mockRejectedValueOnce(new AdminInviteAcceptanceError('Invite not found.', 404));

    const response = await request(app)
      .post('/auth/invite/preview')
      .send({ token: 'missing-token' });

    expect(response.status).toBe(404);
    expect(response.body.message).toContain('Invite not found');
  });

  it('accepts an invite and signs in the new admin', async () => {
    const response = await request(app)
      .post('/auth/invite/accept')
      .send({ token: 'sample-token', password: 'StrongPassword123!' });

    expect(response.status).toBe(201);
    expect(acceptAdminInviteMock).toHaveBeenCalledWith({ token: 'sample-token', password: 'StrongPassword123!' });
    expect(response.body.admin).toEqual(inviteAcceptanceResponse.admin);
    expect(response.body.invite).toEqual(inviteAcceptanceResponse.invite);
    const setCookieHeader = response.headers['set-cookie'] ?? [];
    expect(Array.isArray(setCookieHeader)).toBe(true);
    expect(setCookieHeader.join(';')).toContain('admin_session');
  });

  it('propagates invite acceptance errors', async () => {
    acceptAdminInviteMock.mockRejectedValueOnce(new AdminInviteAcceptanceError('Invite expired.', 410));

    const response = await request(app)
      .post('/auth/invite/accept')
      .send({ token: 'sample-token', password: 'StrongPassword123!' });

    expect(response.status).toBe(410);
    expect(response.body.message).toContain('Invite expired');
  });

  it('lists admins and invites for the management panel', async () => {
    const response = await request(app)
      .get('/admin/users')
      .set('x-admin-token', 'test-secret');

    expect(response.status).toBe(200);
    expect(listAdminDirectoryMock).toHaveBeenCalled();
    expect(response.body).toEqual(adminDirectoryResponse);
  });

  it('issues a new admin invite and returns debug details outside production', async () => {
    const response = await request(app)
      .post('/admin/users/invite')
      .set('x-admin-token', 'test-secret')
      .send({ email: 'fresh-admin@example.com', username: 'freshadmin' });

    expect(response.status).toBe(201);
    expect(issueAdminInviteMock).toHaveBeenCalledWith({
      email: 'fresh-admin@example.com',
      username: 'freshadmin',
      invitedByAdminId: 'legacy-admin'
    });
    expect(response.body.invite).toEqual(issuedInviteResponse.invite);
    expect(response.body.debugToken).toBe('debug-token-123');
    expect(response.body.expiresAt).toBe(issuedInviteResponse.expiresAt.toISOString());
  });

  it('surfaces invite conflicts from the service', async () => {
    issueAdminInviteMock.mockRejectedValueOnce(new AdminDirectoryError('An admin with that email already exists.', 409));

    const response = await request(app)
      .post('/admin/users/invite')
      .set('x-admin-token', 'test-secret')
      .send({ email: 'fresh-admin@example.com', username: 'freshadmin' });

    expect(response.status).toBe(409);
    expect(response.body.message).toContain('already exists');
  });

  it('resends an admin invite', async () => {
    const response = await request(app)
      .post('/admin/users/invites/invite-1/resend')
      .set('x-admin-token', 'test-secret');

    expect(response.status).toBe(200);
    expect(resendAdminInviteMock).toHaveBeenCalledWith('invite-1', 'legacy-admin');
    expect(response.body.invite).toEqual(resendInviteResponse.invite);
    expect(response.body.debugToken).toBe('debug-token-456');
    expect(response.body.expiresAt).toBe(resendInviteResponse.expiresAt.toISOString());
  });

  it('propagates resend errors gracefully', async () => {
    resendAdminInviteMock.mockRejectedValueOnce(new AdminDirectoryError('Invite not found.', 404));

    const response = await request(app)
      .post('/admin/users/invites/missing/resend')
      .set('x-admin-token', 'test-secret');

    expect(response.status).toBe(404);
    expect(response.body.message).toContain('Invite not found');
  });

  it('revokes an admin invite', async () => {
    const response = await request(app)
      .delete('/admin/users/invites/invite-1')
      .set('x-admin-token', 'test-secret');

    expect(response.status).toBe(204);
    expect(revokeAdminInviteMock).toHaveBeenCalledWith('invite-1');
  });

  it('updates admin activation status', async () => {
    const response = await request(app)
      .patch('/admin/users/admin-2')
      .set('x-admin-token', 'test-secret')
      .send({ isActive: false });

    expect(response.status).toBe(200);
    expect(updateAdminActivationMock).toHaveBeenCalledWith('admin-2', false, 'legacy-admin');
    expect(response.body.admin).toEqual(updatedAdminActivationResponse);
  });

  it('rejects invalid payloads when updating admin activation', async () => {
    const response = await request(app)
      .patch('/admin/users/admin-2')
      .set('x-admin-token', 'test-secret')
      .send({ isActive: 'no' });

    expect(response.status).toBe(400);
  });

  it('propagates activation errors from the service', async () => {
    updateAdminActivationMock.mockRejectedValueOnce(new AdminDirectoryError('Admin not found.', 404));

    const response = await request(app)
      .patch('/admin/users/missing')
      .set('x-admin-token', 'test-secret')
      .send({ isActive: true });

    expect(response.status).toBe(404);
    expect(response.body.message).toContain('Admin not found');
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
    const { body } = response;

    expect(body.totalTransactions).toBe(120);
    expect(body.totalRevenue).toBe(1000);
    expect(body.itemsSold).toBe(320);
    expect(body.lifetime).toEqual({ revenue: 1000, transactions: 120, itemsSold: 320 });
    expect(body.period).toEqual({
      current: { start: '2025-11-19', end: '2025-11-25' },
      previous: { start: '2025-11-12', end: '2025-11-18' }
    });

    expect(body.summary.revenue).toEqual({ current: 100, previous: 50, deltaAbsolute: 50, deltaPercent: 100 });
    expect(body.summary.transactions).toEqual({ current: 3, previous: 2, deltaAbsolute: 1, deltaPercent: 50 });
    expect(body.summary.itemsSold).toEqual({ current: 15, previous: 2, deltaAbsolute: 13, deltaPercent: 650 });
    expect(body.summary.averageOrderValue).toEqual({ current: 33.33, previous: 25, deltaAbsolute: 8.33, deltaPercent: 33.3 });

    expect(Array.isArray(body.daily)).toBe(true);
    expect(body.daily).toHaveLength(7);
    expect(body.daily[0]).toEqual({ date: '2025-11-19', total: 50, transactions: 1 });
    expect(body.daily[body.daily.length - 1]).toEqual({ date: '2025-11-25', total: 20, transactions: 1 });

    expect(Array.isArray(body.weekly)).toBe(true);
    expect(body.weekly).toHaveLength(4);
    expect(body.weekly[0]).toEqual({ weekStart: '2025-11-03', total: 0, transactions: 0 });
    expect(body.weekly[2]).toEqual({ weekStart: '2025-11-17', total: 90, transactions: 3 });

    expect(Array.isArray(body.hourlyTrend)).toBe(true);
    expect(body.hourlyTrend).toHaveLength(24);
    expect(body.hourlyTrend[10]).toEqual({ hour: '10:00', percentage: 33.3, transactions: 40 });
    expect(body.hourlyTrend[13]).toEqual({ hour: '13:00', percentage: 16.7, transactions: 20 });
    expect(body.hourlyTrend[20]).toEqual({ hour: '20:00', percentage: 25, transactions: 30 });

    expect(Array.isArray(body.topProducts)).toBe(true);
    expect(body.topProducts[0]).toEqual({ productId: 'demo-coffee', title: 'Coffee', quantity: 8, revenue: 20 });
    expect(body.topProducts[1]).toEqual({ productId: 'sparkling-water', title: 'Sparkling Water', quantity: 4, revenue: 12 });
    expect(body.topProducts[2]).toEqual({ productId: 'granola-bar', title: 'Granola Bar', quantity: 5, revenue: 10 });

    expect(body.highlights).toEqual({
      bestDay: { date: '2025-11-19', total: 50, transactions: 1 },
      slowDay: { date: '2025-11-25', total: 20, transactions: 1 }
    });

    expect(body.alerts).toContain('Average order value increased 33.3% week-over-week.');

    expect(body.categoryMix).toEqual([
      {
        category: 'Beverages',
        quantity: 10,
        revenue: 27,
        revenueShare: 27,
        quantityShare: 66.7
      },
      {
        category: 'Snacks',
        quantity: 5,
        revenue: 10,
        revenueShare: 10,
        quantityShare: 33.3
      }
    ]);

    expect(body.productPerformance).toEqual([
      {
        productId: 'demo-coffee',
        title: 'Coffee',
        category: 'Beverages',
        isActive: true,
        inventoryCount: 18,
        price: 2.5,
        sales: {
          last7Days: { quantity: 6, revenue: 15 },
          last30Days: { quantity: 8, revenue: 20 },
          lifetime: { quantity: 8, revenue: 20 }
        }
      },
      {
        productId: 'sparkling-water',
        title: 'Sparkling Water',
        category: 'Beverages',
        isActive: true,
        inventoryCount: 30,
        price: 3,
        sales: {
          last7Days: { quantity: 4, revenue: 12 },
          last30Days: { quantity: 4, revenue: 12 },
          lifetime: { quantity: 4, revenue: 12 }
        }
      },
      {
        productId: 'granola-bar',
        title: 'Granola Bar',
        category: 'Snacks',
        isActive: true,
        inventoryCount: 45,
        price: 2,
        sales: {
          last7Days: { quantity: 5, revenue: 10 },
          last30Days: { quantity: 5, revenue: 10 },
          lifetime: { quantity: 5, revenue: 10 }
        }
      }
    ]);

    expect(prismaMock.purchase.aggregate).toHaveBeenCalled();
    expect(prismaMock.purchase.findMany).toHaveBeenCalled();
    expect(prismaMock.purchaseItem.findMany).toHaveBeenCalled();
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(3);
  });

  it('returns zeroed stats and alert when no transactions exist', async () => {
    prismaMock.purchase.aggregate.mockResolvedValueOnce({ _sum: { totalAmount: null }, _count: { _all: 0 } });
    prismaMock.purchaseItem.aggregate.mockResolvedValueOnce({ _sum: { quantity: null } });
    prismaMock.purchase.findMany.mockResolvedValueOnce([]);
    prismaMock.purchaseItem.findMany.mockResolvedValueOnce([]);
    prismaMock.product.findMany.mockResolvedValueOnce([]);
    prismaMock.$queryRaw.mockReset();
    prismaMock.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const response = await request(app)
      .get('/admin/stats/sales')
      .set('x-admin-token', 'test-secret');

    expect(response.status).toBe(200);
    const { body } = response;

    expect(body.summary.revenue).toEqual({ current: 0, previous: 0, deltaAbsolute: 0, deltaPercent: 0 });
    expect(body.summary.transactions).toEqual({ current: 0, previous: 0, deltaAbsolute: 0, deltaPercent: 0 });
    expect(body.summary.itemsSold).toEqual({ current: 0, previous: 0, deltaAbsolute: 0, deltaPercent: 0 });
    expect(body.highlights).toEqual({ bestDay: null, slowDay: null });
    expect(body.topProducts).toEqual([]);
    expect(body.alerts).toContain('No transactions recorded in the last 7 days.');
    expect(body.daily).toHaveLength(7);
    expect(body.daily.every((entry: { total: number; transactions: number }) => entry.total === 0 && entry.transactions === 0)).toBe(true);
    expect(body.hourlyTrend).toHaveLength(24);
    expect(body.hourlyTrend.every((entry: { percentage: number; transactions: number }) => entry.percentage === 0 && entry.transactions === 0)).toBe(true);
    expect(body.categoryMix).toEqual([]);
    expect(body.productPerformance).toEqual([]);
  });

  it('returns transactions excluding deleted entries by default', async () => {
    const activeTransaction = {
      id: 'purchase-active',
      reference: 'purchase-active',
      totalAmount: 25,
      status: 'PAID',
      notes: null,
      createdAt: new Date('2025-11-24T10:00:00Z'),
      isDeleted: false,
      deletedAt: null,
      deletedByAdmin: null,
      items: [
        {
          quantity: 1,
          unitPrice: 25,
          product: {
            id: 'demo-coffee',
            title: 'Coffee',
            category: 'Beverages'
          }
        }
      ]
    };

    prismaMock.purchase.findMany.mockResolvedValueOnce([activeTransaction]);

    const response = await request(app)
      .get('/admin/transactions?start=2025-11-20&end=2025-11-25')
      .set('x-admin-token', 'test-secret');

    expect(response.status).toBe(200);
    expect(prismaMock.purchase.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isDeleted: false })
      })
    );
    expect(response.body.includeDeleted).toBe(false);
    expect(response.body.transactions).toHaveLength(1);
    expect(response.body.transactions[0]).toMatchObject({
      id: 'purchase-active',
      isDeleted: false,
      deletedAt: null,
      deletedBy: null
    });
  });

  it('includes deleted transactions when requested', async () => {
    const deletedTransaction = {
      id: 'purchase-deleted',
      reference: 'purchase-deleted',
      totalAmount: 15,
      status: 'PAID',
      notes: null,
      createdAt: new Date('2025-11-23T08:00:00Z'),
      isDeleted: true,
      deletedAt: new Date('2025-11-24T09:00:00Z'),
      deletedByAdmin: {
        id: 'admin-123',
        username: 'moderator'
      },
      items: [
        {
          quantity: 3,
          unitPrice: 5,
          product: {
            id: 'granola-bar',
            title: 'Granola Bar',
            category: 'Snacks'
          }
        }
      ]
    };

    prismaMock.purchase.findMany.mockResolvedValueOnce([deletedTransaction]);

    const response = await request(app)
      .get('/admin/transactions?start=2025-11-20&end=2025-11-25&includeDeleted=true')
      .set('x-admin-token', 'test-secret');

    expect(response.status).toBe(200);
    expect(prismaMock.purchase.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({ isDeleted: false })
      })
    );
    expect(response.body.includeDeleted).toBe(true);
    expect(response.body.transactions).toHaveLength(1);
    expect(response.body.transactions[0]).toMatchObject({
      id: 'purchase-deleted',
      isDeleted: true,
      deletedBy: { id: 'admin-123', username: 'moderator' }
    });
  });

  it('flags a transaction as deleted and returns the updated summary', async () => {
    const transactionId = 'purchase-soft-delete';
    const existingTransaction = {
      id: transactionId,
      reference: transactionId,
      totalAmount: 42,
      status: 'PAID',
      notes: null,
      createdAt: new Date('2025-11-25T08:00:00Z'),
      isDeleted: false,
      deletedAt: null,
      deletedByAdmin: null,
      items: [
        {
          quantity: 2,
          unitPrice: 21,
          product: {
            id: 'demo-coffee',
            title: 'Coffee',
            category: 'Beverages'
          }
        }
      ]
    };

    const updatedTransaction = {
      ...existingTransaction,
      isDeleted: true,
      deletedAt: new Date('2025-11-25T12:00:00Z')
    };

    prismaMock.purchase.findUnique.mockResolvedValueOnce(existingTransaction);
    prismaMock.purchase.update.mockResolvedValueOnce(updatedTransaction);

    const response = await request(app)
      .post(`/admin/transactions/${transactionId}/delete`)
      .set('x-admin-token', 'test-secret');

    expect(response.status).toBe(200);
    expect(prismaMock.purchase.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: transactionId },
        data: expect.objectContaining({ isDeleted: true })
      })
    );
    expect(response.body.transaction).toMatchObject({
      id: transactionId,
      isDeleted: true,
      totalAmount: 42,
      lineItems: [
        {
          productId: 'demo-coffee',
          quantity: 2,
          unitPrice: 21,
          subtotal: 42
        }
      ],
      categoryBreakdown: [
        {
          category: 'Beverages',
          quantity: 2,
          revenue: 42
        }
      ]
    });
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
