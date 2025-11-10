import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminDashboard } from './AdminDashboard';

const createJsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });

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
          updatedAt: '2025-11-07T10:00:00.000Z'
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
      daily: [
        { date: '2025-11-05', total: 12, transactions: 1 },
        { date: '2025-11-06', total: 18, transactions: 2 }
      ],
      weekly: [
        { weekStart: '2025-10-13', total: 40, transactions: 5 },
        { weekStart: '2025-10-20', total: 52, transactions: 6 }
      ],
      topProducts: [
        { productId: 'demo-coffee', title: 'Filter Coffee', quantity: 5, revenue: 12 },
        { productId: 'sparkling-water', title: 'Sparkling Water', quantity: 3, revenue: 8.4 }
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
              updatedAt: '2025-11-07T12:00:00.000Z'
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

      throw new Error(`Unexpected fetch call to ${url}`);
    });

    render(<AdminDashboard />);

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
    expect(screen.getByText(/top products/i)).toBeTruthy();
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
          updatedAt: '2025-11-07T10:00:00.000Z'
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
          updatedAt: '2025-11-07T11:00:00.000Z'
        }
      ]
    };

    const statsPayload = {
      totalTransactions: 3,
      totalRevenue: 42,
      itemsSold: 9,
      daily: [],
      weekly: [],
      topProducts: [{ productId: 'demo-coffee', title: 'Filter Coffee', quantity: 5, revenue: 12 }]
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

      throw new Error(`Unexpected fetch call to ${url}`);
    });

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<AdminDashboard />);

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
});
