import { expect, test, type Page, type Route } from '@playwright/test';

type AdminProductPayload = {
  id: string;
  title: string;
  description: string;
  price: string;
  imageUrl: string | null;
  inventoryCount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type AdminState = {
  products: AdminProductPayload[];
  kioskConfig: {
    inventoryEnabled: boolean;
    currency: string;
    paymentProvider: string;
  };
  salesStats: {
    totalRevenue: number;
    totalTransactions: number;
    itemsSold: number;
    daily: Array<{ date: string; total: number; transactions: number }>;
    weekly: Array<{ weekStart: string; total: number; transactions: number }>;
    topProducts: Array<{ productId: string; title: string; quantity: number; revenue: number }>;
  };
};

const ADMIN_TOKEN = process.env.VITE_ADMIN_TOKEN ?? 'testing-admin-key';

function createInitialState(): AdminState {
  return {
    products: [
      {
        id: 'demo-coffee',
        title: 'House Blend Coffee',
        description: 'Rich medium-roast coffee served hot or iced.',
        price: '2.50',
  imageUrl: '/house-mix-coffee.jpeg',
        inventoryCount: 54,
        isActive: true,
        createdAt: '2025-11-01T08:00:00.000Z',
        updatedAt: '2025-11-09T15:24:00.000Z'
      },
      {
        id: 'demo-energy',
        title: 'Lightning Energy Shot',
        description: 'High-caffeine energy shot for late-night study sessions.',
        price: '3.00',
  imageUrl: '/lightning-energy-shot.jpeg',
        inventoryCount: 40,
        isActive: true,
        createdAt: '2025-11-02T08:00:00.000Z',
        updatedAt: '2025-11-09T14:10:00.000Z'
      }
    ],
    kioskConfig: {
      inventoryEnabled: true,
      currency: 'EUR',
      paymentProvider: 'mobilepay'
    },
    salesStats: {
      totalRevenue: 256.4,
      totalTransactions: 42,
      itemsSold: 118,
      daily: [
        { date: '2025-11-04', total: 24.5, transactions: 6 },
        { date: '2025-11-05', total: 47.8, transactions: 11 },
        { date: '2025-11-06', total: 39.2, transactions: 9 },
        { date: '2025-11-07', total: 51.3, transactions: 9 },
        { date: '2025-11-08', total: 43.7, transactions: 5 },
        { date: '2025-11-09', total: 28.9, transactions: 2 },
        { date: '2025-11-10', total: 21.0, transactions: 0 }
      ],
      weekly: [
        { weekStart: '2025-10-20', total: 142.6, transactions: 31 },
        { weekStart: '2025-10-27', total: 183.1, transactions: 37 },
        { weekStart: '2025-11-03', total: 256.4, transactions: 42 },
        { weekStart: '2025-11-10', total: 32.1, transactions: 5 }
      ],
      topProducts: [
        { productId: 'demo-coffee', title: 'House Blend Coffee', quantity: 46, revenue: 115.0 },
        { productId: 'demo-energy', title: 'Lightning Energy Shot', quantity: 32, revenue: 96.0 },
        { productId: 'demo-trailmix', title: 'Trail Mix Snack Pack', quantity: 20, revenue: 40.0 }
      ]
    }
  };
}

async function setupAdminRoutes(page: Page) {
  const state = createInitialState();

  const json = (payload: unknown) => ({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(payload)
  });

  const requireAdminHeader = (route: Route) => {
    const token = route.request().headers()['x-admin-token'];
    expect(token).toBe(ADMIN_TOKEN);
  };

  await page.route('**/config', async (route) => {
    requireAdminHeader(route);
    await route.fulfill(json(state.kioskConfig));
  });

  await page.route('**/admin/stats/sales', async (route) => {
    requireAdminHeader(route);
    await route.fulfill(json(state.salesStats));
  });

  await page.route('**/admin/kiosk-mode', async (route) => {
    requireAdminHeader(route);
    if (route.request().method() === 'PATCH') {
      const payload = route.request().postDataJSON() as { inventoryEnabled?: boolean };
      if (typeof payload.inventoryEnabled === 'boolean') {
        state.kioskConfig.inventoryEnabled = payload.inventoryEnabled;
      }
      await route.fulfill(json(state.kioskConfig));
      return;
    }
    await route.fulfill(json(state.kioskConfig));
  });

  await page.route('**/admin/products', async (route) => {
    requireAdminHeader(route);
    const request = route.request();
    const method = request.method();

    if (method === 'GET') {
      await route.fulfill(json({ items: state.products }));
      return;
    }

    if (method === 'POST') {
      const payload = request.postDataJSON() as {
        title: string;
        description?: string;
        price: number;
        imageUrl?: string;
        inventoryCount: number;
        isActive?: boolean;
      };

      const nowIso = new Date().toISOString();
      const id = `seed-${Math.random().toString(36).slice(2, 10)}`;
      const newProduct: AdminProductPayload = {
        id,
        title: payload.title,
        description: payload.description ?? '',
        price: payload.price.toFixed(2),
        imageUrl: payload.imageUrl ?? null,
        inventoryCount: payload.inventoryCount,
        isActive: payload.isActive ?? true,
        createdAt: nowIso,
        updatedAt: nowIso
      };

      state.products = [...state.products, newProduct];

      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(newProduct)
      });
      return;
    }

    await route.abort();
  });

  await page.route('**/admin/products/*', async (route) => {
    requireAdminHeader(route);
    const request = route.request();
    const method = request.method();
    const productId = request.url().split('/').slice(-1)[0];

    if (method === 'PATCH') {
      const payload = request.postDataJSON() as {
        title?: string;
        description?: string | null;
        price?: number;
        imageUrl?: string | null;
        inventoryCount?: number;
        isActive?: boolean;
      };
      const product = state.products.find((item) => item.id === productId);
      if (product) {
        if (payload.title) product.title = payload.title;
        if (payload.description !== undefined) product.description = String(payload.description);
        if (typeof payload.price === 'number') product.price = payload.price.toFixed(2);
        if (payload.imageUrl !== undefined) product.imageUrl = payload.imageUrl;
        if (typeof payload.inventoryCount === 'number') product.inventoryCount = payload.inventoryCount;
        if (typeof payload.isActive === 'boolean') product.isActive = payload.isActive;
        product.updatedAt = new Date().toISOString();
      }
      await route.fulfill(json(product ?? {}));
      return;
    }

    if (method === 'DELETE') {
      state.products = state.products.filter((item) => item.id !== productId);
      await route.fulfill(json({ success: true }));
      return;
    }

    await route.abort();
  });

  return state;
}

test.describe('Admin dashboard', () => {
  test('loads analytics and toggles inventory gate', async ({ page }) => {
    const state = await setupAdminRoutes(page);

    await page.goto('/');
    await page.getByRole('button', { name: 'Admin' }).click();

    await expect(page.getByRole('heading', { name: 'Inventory Controls' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Product Catalog' })).toBeVisible();

  await expect(page.locator('.admin-metrics dd').first()).toHaveText('€256.40');
  await expect(page.locator('.admin-metrics dd').nth(1)).toHaveText('42');

    await page.getByRole('button', { name: 'Disable inventory gate' }).click();

    await expect(page.getByText('Inventory enforcement disabled.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Enable inventory gate' })).toBeVisible();
    expect(state.kioskConfig.inventoryEnabled).toBe(false);
  });

  test('creates a product and shows success banner', async ({ page }) => {
    const state = await setupAdminRoutes(page);

    await page.goto('/');
    await page.getByRole('button', { name: 'Admin' }).click();

    await page.getByLabel('Title').fill('E2E Espresso Shot');
    await page.getByLabel('Price (€)').fill('4.20');
    await page.getByLabel('Inventory').fill('8');
    await page.getByLabel('Description').fill('Limited release single-origin espresso.');
    await page.getByLabel('Image URL').fill('https://example.com/espresso.jpg');

    await page.getByRole('button', { name: 'Add Product' }).click();

    await expect(page.getByText('Product created successfully.')).toBeVisible();
    await expect(page.getByText('E2E Espresso Shot')).toBeVisible();

    expect(state.products.some((product) => product.title === 'E2E Espresso Shot')).toBe(true);
  });
});
