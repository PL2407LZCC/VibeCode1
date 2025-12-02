import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminDashboard } from './AdminDashboard';

const createJsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });

const expandSection = async (name: RegExp | string) => {
  const toggle = await screen.findByRole('button', { name });
  await userEvent.click(toggle);
};

describe('AdminDashboard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('surfaces configuration error when admin token is missing', () => {
    vi.unstubAllEnvs();
    vi.stubEnv('VITE_ADMIN_TOKEN', '');

    render(<AdminDashboard />);

    expect(screen.getByText(/admin token is not configured/i)).toBeTruthy();
  });

  it('fetches admin data and creates a new product', async () => {
    vi.unstubAllEnvs();
    vi.stubEnv('VITE_ADMIN_TOKEN', 'test-secret');

    let productsPayload = {
      items: [
        {
          id: 'demo-coffee',
          title: 'Filter Coffee',
          description: 'Fresh brew',
          price: 2.5,
          imageUrl: null,
          inventoryCount: 5,
          isActive: true,
          createdAt: '2025-11-07T10:00:00.000Z',
          updatedAt: '2025-11-07T10:00:00.000Z',
          category: 'Beverages'
        }
      ]
    };

    const configPayload = {
      currency: 'EUR',
      paymentProvider: 'mobilepay',
      inventoryEnabled: true
    };

    const transactionsPayload = {
      range: { start: '2025-11-01T00:00:00.000Z', end: '2025-11-07' },
      categoryFilter: null,
      categories: ['Beverages'],
      transactions: []
    };

    const statsPayload = {
      totalTransactions: 3,
      totalRevenue: 42,
      itemsSold: 9,
      lifetime: { revenue: 42, transactions: 3, itemsSold: 9 },
      period: {
        current: { start: '2025-11-01', end: '2025-11-07' },
        previous: { start: '2025-10-25', end: '2025-10-31' }
      },
      summary: {
        revenue: { current: 30, previous: 25, deltaAbsolute: 5, deltaPercent: 20 },
        transactions: { current: 2, previous: 1, deltaAbsolute: 1, deltaPercent: 100 },
        itemsSold: { current: 7, previous: 5, deltaAbsolute: 2, deltaPercent: 40 },
        averageOrderValue: { current: 15, previous: 12.5, deltaAbsolute: 2.5, deltaPercent: 20 }
      },
      daily: [
        { date: '2025-11-05', total: 12, transactions: 1 },
        { date: '2025-11-06', total: 18, transactions: 2 }
      ],
      weekly: [
        { weekStart: '2025-10-13', total: 40, transactions: 5 },
        { weekStart: '2025-10-20', total: 52, transactions: 6 }
      ],
      hourlyTrend: [
        { hour: '08:00', percentage: 12.5, transactions: 1 },
        { hour: '09:00', percentage: 18.5, transactions: 2 }
      ],
      categoryMix: [
        { category: 'Beverages', quantity: 8, revenue: 20.4, revenueShare: 70, quantityShare: 80 },
        { category: 'Snacks', quantity: 2, revenue: 5, revenueShare: 30, quantityShare: 20 }
      ],
      topProducts: [
        { productId: 'demo-coffee', title: 'Filter Coffee', quantity: 5, revenue: 12 },
        { productId: 'sparkling-water', title: 'Sparkling Water', quantity: 3, revenue: 8.4 }
      ],
      productPerformance: [
        {
          productId: 'demo-coffee',
          title: 'Filter Coffee',
          category: 'Beverages',
          isActive: true,
          inventoryCount: 5,
          price: 2.5,
          sales: {
            last7Days: { quantity: 3, revenue: 7.5 },
            last30Days: { quantity: 5, revenue: 12 },
            lifetime: { quantity: 12, revenue: 28.5 }
          }
        },
        {
          productId: 'sparkling-water',
          title: 'Sparkling Water',
          category: 'Beverages',
          isActive: true,
          inventoryCount: 18,
          price: 2.8,
          sales: {
            last7Days: { quantity: 2, revenue: 5.6 },
            last30Days: { quantity: 3, revenue: 8.4 },
            lifetime: { quantity: 6, revenue: 16.8 }
          }
        }
      ],
      highlights: {
        bestDay: { date: '2025-11-06', total: 18, transactions: 2 },
        slowDay: { date: '2025-11-05', total: 12, transactions: 1 }
      },
      alerts: ['Average order value increased 20% week-over-week.']
    };

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : input.toString();
      const method = init?.method ?? 'GET';

      if (url.endsWith('/admin/products') && method === 'GET') {
        return createJsonResponse(productsPayload);
      }

      if (url.endsWith('/admin/products') && method === 'POST') {
        const body = init?.body ? JSON.parse(init.body as string) : {};
        productsPayload = {
          items: [
            ...productsPayload.items,
            {
              id: 'sparkling-water',
              title: body.title,
              description: body.description ?? '',
              price: body.price,
              imageUrl: body.imageUrl ?? null,

              inventoryCount: body.inventoryCount,
              isActive: body.isActive ?? true,
              createdAt: '2025-11-07T12:00:00.000Z',
              updatedAt: '2025-11-07T12:00:00.000Z',
              category: body.category ?? 'Uncategorized'
            }
          ]
        };
        return createJsonResponse({ id: 'sparkling-water' }, 201);
      }

      if (url.endsWith('/admin/products/demo-coffee') && method === 'DELETE') {
        productsPayload = {
          items: productsPayload.items.filter((item) => item.id !== 'demo-coffee')
        };
        statsPayload.topProducts = statsPayload.topProducts.filter((item) => item.productId !== 'demo-coffee');
        return createJsonResponse({ id: 'demo-coffee', isActive: false });
      }

      if (url.endsWith('/config')) {
        return createJsonResponse(configPayload);
      }

      if (url.endsWith('/admin/stats/sales')) {
        return createJsonResponse(statsPayload);
      }

      if (url.includes('/admin/transactions')) {
        return createJsonResponse(transactionsPayload);
      }

      throw new Error(`Unexpected fetch call to ${url}`);
    });

    render(<AdminDashboard />);

    await expandSection(/product catalog/i);
    await expandSection(/inventory controls/i);

    await waitFor(() => {
      expect(screen.getAllByRole('heading', { level: 3, name: 'Filter Coffee' })).toHaveLength(1);
    });

    expect(fetchMock.mock.calls.some(([, options]) => {
      if (!options) {
        return false;
      }
      const headers = options.headers instanceof Headers ? options.headers : new Headers(options.headers ?? {});
      return headers.get('x-admin-token') === 'test-secret';
    })).toBe(true);

    await userEvent.type(screen.getByLabelText(/^Title$/i), 'Sparkling Water');
    await userEvent.type(screen.getByLabelText(/Price/i), '2.80');
    await userEvent.type(screen.getByLabelText(/Inventory/i), '12');

    await userEvent.click(screen.getByRole('button', { name: /add product/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/admin/products'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    await waitFor(() => {
      expect(screen.getAllByRole('heading', { level: 3, name: 'Sparkling Water' })).toHaveLength(1);
    });

    expect(screen.getByText(/product created successfully/i)).toBeTruthy();

    await expandSection(/sales overview/i);
    await waitFor(() => {
      expect(screen.getByText(/Revenue \(7 days\)/i)).toBeTruthy();
    });
    expect(screen.getByText(/Avg\. order value/i)).toBeTruthy();
    expect(screen.getByText(/Average order value increased 20% week-over-week\./i)).toBeTruthy();
    expect(screen.getByText(/Top products/i)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /Product performance/i }));
    expect(screen.getByRole('columnheader', { name: /Last 7 days/i })).toBeTruthy();
    expect(screen.getByText(/3 sold · €7\.50/)).toBeTruthy();
    expect(screen.getByText(/5 sold · 5 in stock/i)).toBeTruthy();
  });

  it('archives a product from the catalog', async () => {
    vi.unstubAllEnvs();
    vi.stubEnv('VITE_ADMIN_TOKEN', 'test-secret');

    let productsPayload = {
      items: [
        {
          id: 'demo-coffee',
          title: 'Filter Coffee',
          description: 'Fresh brew',
          price: 2.5,
          imageUrl: null,
          inventoryCount: 5,
          isActive: true,
          createdAt: '2025-11-07T10:00:00.000Z',
          updatedAt: '2025-11-07T10:00:00.000Z',
          category: 'Beverages'
        },
        {
          id: 'energy-drink',
          title: 'Energy Drink',
          description: 'Stay awake',
          price: 3,
          imageUrl: null,
          inventoryCount: 12,
          isActive: true,
          createdAt: '2025-11-07T11:00:00.000Z',
          updatedAt: '2025-11-07T11:00:00.000Z',
          category: 'Beverages'
        }
      ]
    };

    const statsPayload = {
      totalTransactions: 3,
      totalRevenue: 42,
      itemsSold: 9,
      daily: [],
      weekly: [],
      topProducts: [{ productId: 'demo-coffee', title: 'Filter Coffee', quantity: 5, revenue: 12 }],
      hourlyTrend: [],
      categoryMix: [],
      productPerformance: [
        {
          productId: 'demo-coffee',
          title: 'Filter Coffee',
          category: 'Beverages',
          isActive: true,
          inventoryCount: 5,
          price: 2.5,
          sales: {
            last7Days: { quantity: 2, revenue: 5 },
            last30Days: { quantity: 5, revenue: 12 },
            lifetime: { quantity: 18, revenue: 43 }
          }
        }
      ],
      lifetime: { revenue: 42, transactions: 3, itemsSold: 9 },
      period: {
        current: { start: '2025-11-01', end: '2025-11-07' },
        previous: { start: '2025-10-25', end: '2025-10-31' }
      },
      summary: {
        revenue: { current: 42, previous: 30, deltaAbsolute: 12, deltaPercent: 40 },
        transactions: { current: 3, previous: 2, deltaAbsolute: 1, deltaPercent: 50 },
        itemsSold: { current: 9, previous: 6, deltaAbsolute: 3, deltaPercent: 50 },
        averageOrderValue: { current: 14, previous: 12, deltaAbsolute: 2, deltaPercent: 16.7 }
      },
      highlights: { bestDay: null, slowDay: null },
      alerts: []
    };

    const transactionsPayload = {
      range: { start: '2025-11-01T00:00:00.000Z', end: '2025-11-07' },
      categoryFilter: null,
      categories: ['Beverages'],
      transactions: []
    };

    const configPayload = {
      currency: 'EUR',
      paymentProvider: 'mobilepay',
      inventoryEnabled: true
    };

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : input.toString();
      const method = init?.method ?? 'GET';

      if (url.endsWith('/admin/products') && method === 'GET') {
        return createJsonResponse(productsPayload);
      }

      if (url.endsWith('/admin/products/demo-coffee') && method === 'DELETE') {
        productsPayload = {
          items: productsPayload.items.filter((item) => item.id !== 'demo-coffee')
        };
        statsPayload.topProducts = statsPayload.topProducts.filter((item) => item.productId !== 'demo-coffee');
        return createJsonResponse({ id: 'demo-coffee', isActive: false });
      }

      if (url.endsWith('/config')) {
        return createJsonResponse(configPayload);
      }

      if (url.endsWith('/admin/stats/sales')) {
        return createJsonResponse(statsPayload);
      }

      if (url.includes('/admin/transactions')) {
        return createJsonResponse(transactionsPayload);
      }

      throw new Error(`Unexpected fetch call to ${url}`);
    });

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<AdminDashboard />);

    await expandSection(/product catalog/i);

    await waitFor(() => {
      expect(screen.getAllByRole('heading', { level: 3, name: 'Filter Coffee' })).toHaveLength(1);
    });

    const archiveButtons = screen.getAllByRole('button', { name: /archive/i });
    await userEvent.click(archiveButtons[0]);

    expect(confirmSpy).toHaveBeenCalled();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/admin/products/demo-coffee'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    await waitFor(() => {
      expect(screen.queryByRole('heading', { level: 3, name: 'Filter Coffee' })).toBeNull();
    });

    expect(screen.getByText(/archived/i)).toBeTruthy();
  });

  it('uploads an image and populates the image URL field', async () => {
    vi.unstubAllEnvs();
    vi.stubEnv('VITE_ADMIN_TOKEN', 'test-secret');

    const productsPayload = {
      items: [
        {
          id: 'demo-coffee',
          title: 'Filter Coffee',
          description: 'Fresh brew',
          price: 2.5,
          imageUrl: null,
          inventoryCount: 5,
          isActive: true,
          createdAt: '2025-11-07T10:00:00.000Z',
          updatedAt: '2025-11-07T10:00:00.000Z',
          category: 'Beverages'
        }
      ]
    };

    const configPayload = {
      currency: 'EUR',
      paymentProvider: 'mobilepay',
      inventoryEnabled: true
    };

    const statsPayload = {
      totalTransactions: 3,
      totalRevenue: 42,
      itemsSold: 9,
      daily: [],
      weekly: [],
      topProducts: [],
      productPerformance: [],
      hourlyTrend: [],
      categoryMix: [],
      lifetime: { revenue: 42, transactions: 3, itemsSold: 9 },
      period: {
        current: { start: '2025-11-01', end: '2025-11-07' },
        previous: { start: '2025-10-25', end: '2025-10-31' }
      },
      summary: {
        revenue: { current: 42, previous: 40, deltaAbsolute: 2, deltaPercent: 5 },
        transactions: { current: 3, previous: 3, deltaAbsolute: 0, deltaPercent: 0 },
        itemsSold: { current: 9, previous: 9, deltaAbsolute: 0, deltaPercent: 0 },
        averageOrderValue: { current: 14, previous: 13.3, deltaAbsolute: 0.7, deltaPercent: 5 }
      },
      highlights: { bestDay: null, slowDay: null },
      alerts: []
    };

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : input.toString();
      const method = init?.method ?? 'GET';

      if (url.endsWith('/admin/products') && method === 'GET') {
        return createJsonResponse(productsPayload);
      }

      if (url.endsWith('/config')) {
        return createJsonResponse(configPayload);
      }

      if (url.endsWith('/admin/stats/sales')) {
        return createJsonResponse(statsPayload);
      }

      if (url.includes('/admin/transactions')) {
        return createJsonResponse(transactionsPayload);
      }

      if (url.endsWith('/admin/uploads') && method === 'POST') {
        const body = init?.body;
        if (!(body instanceof FormData)) {
          throw new Error('Expected FormData payload for uploads');
        }

        const uploaded = body.get('image');
        expect(uploaded).toBeInstanceOf(File);
        return createJsonResponse({ url: '/uploads/mock-image.png', filename: 'mock-image.png' }, 201);
      }

      throw new Error(`Unexpected fetch call to ${url}`);
    });

    render(<AdminDashboard />);

    await expandSection(/product catalog/i);
    await expandSection(/inventory controls/i);

    await waitFor(() => {
      expect(screen.getAllByRole('heading', { level: 3, name: 'Filter Coffee' })).toHaveLength(1);
    });

    const fileInput = screen.getByLabelText(/Product image/i, { selector: 'input[type="file"]' });
    const file = new File(['binary'], 'coffee.png', { type: 'image/png' });

    await userEvent.upload(fileInput, file);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/admin/uploads'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    await waitFor(() => {
      expect(screen.getByLabelText(/^Image URL$/i)).toHaveValue('/uploads/mock-image.png');
    });

    expect(screen.getByText(/image uploaded successfully/i)).toBeTruthy();
  });

  it('loads transactions when the panel is expanded and supports filtering', async () => {
    vi.unstubAllEnvs();
    vi.stubEnv('VITE_ADMIN_TOKEN', 'test-secret');

    const productsPayload = { items: [] };
    const configPayload = { currency: 'EUR', paymentProvider: 'mobilepay', inventoryEnabled: true };
    const statsPayload = {
      totalTransactions: 0,
      totalRevenue: 0,
      itemsSold: 0,
      daily: [],
      weekly: [],
      topProducts: [],
      productPerformance: [],
      hourlyTrend: [],
      categoryMix: [],
      lifetime: { revenue: 0, transactions: 0, itemsSold: 0 },
      period: {
        current: { start: '2025-11-01', end: '2025-11-07' },
        previous: { start: '2025-10-25', end: '2025-10-31' }
      },
      summary: {
        revenue: { current: 0, previous: 0, deltaAbsolute: 0, deltaPercent: 0 },
        transactions: { current: 0, previous: 0, deltaAbsolute: 0, deltaPercent: 0 },
        itemsSold: { current: 0, previous: 0, deltaAbsolute: 0, deltaPercent: 0 },
        averageOrderValue: { current: 0, previous: 0, deltaAbsolute: 0, deltaPercent: 0 }
      },
      highlights: { bestDay: null, slowDay: null },
      alerts: []
    };

    const transactionsPayload = {
      range: { start: '2025-11-01T00:00:00.000Z', end: '2025-11-07' },
      categoryFilter: null,
      categories: ['Beverages', 'Snacks'],
      transactions: [
        {
          id: 'tx-1',
          reference: 'ORDER-123',
          status: 'PAID',
          notes: 'Deliver to desk',
          totalAmount: 12.5,
          createdAt: '2025-11-07T09:30:00.000Z',
          lineItems: [
            {
              productId: 'coffee',
              title: 'Filter Coffee',
              category: 'Beverages',
              quantity: 2,
              unitPrice: 3.5,
              subtotal: 7
            },
            {
              productId: 'bar',
              title: 'Energy Bar',
              category: 'Snacks',
              quantity: 2,
              unitPrice: 2.75,
              subtotal: 5.5
            }
          ],
          categoryBreakdown: [
            { category: 'Beverages', quantity: 2, revenue: 7 },
            { category: 'Snacks', quantity: 2, revenue: 5.5 }
          ]
        }
      ]
    };

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : input.toString();
      const method = init?.method ?? 'GET';

      if (url.endsWith('/admin/products') && method === 'GET') {
        return createJsonResponse(productsPayload);
      }

      if (url.endsWith('/config')) {
        return createJsonResponse(configPayload);
      }

      if (url.endsWith('/admin/stats/sales')) {
        return createJsonResponse(statsPayload);
      }

      if (url.includes('/admin/transactions')) {
        return createJsonResponse(transactionsPayload);
      }

      throw new Error(`Unexpected fetch call to ${url}`);
    });

    render(<AdminDashboard />);

    await expandSection(/Transactions/i);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/admin/transactions'),
        expect.objectContaining({ headers: expect.anything() })
      );
    });

    expect(await screen.findByText(/Reference ORDER-123/)).toBeTruthy();
    expect(screen.getByText(/Deliver to desk/)).toBeTruthy();
    expect(screen.getByText(/Energy Bar/)).toBeTruthy();
    expect(screen.getByText(/Revenue by category/)).toBeTruthy();
    expect(screen.getAllByText(/All categories/)).not.toHaveLength(0);

    const initialCalls = fetchMock.mock.calls.filter(([url]) =>
      typeof url === 'string' && url.includes('/admin/transactions')
    ).length;

    await userEvent.click(screen.getByRole('button', { name: /Last 30 days/i }));
    await userEvent.click(screen.getByRole('button', { name: /Apply filters/i }));

    await waitFor(() => {
      const calls = fetchMock.mock.calls.filter(([url]) => typeof url === 'string' && url.includes('/admin/transactions'))
        .length;
      expect(calls).toBeGreaterThan(initialCalls);
    });
  });
});
