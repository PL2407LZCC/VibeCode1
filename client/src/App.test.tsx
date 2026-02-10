import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

type MockAuthState = {
  status: 'loading' | 'authenticated' | 'unauthenticated';
  admin: null;
  error: string | null;
  clearError: ReturnType<typeof vi.fn>;
  login: ReturnType<typeof vi.fn>;
  logout: ReturnType<typeof vi.fn>;
  requestPasswordReset: ReturnType<typeof vi.fn>;
  confirmPasswordReset: ReturnType<typeof vi.fn>;
  fetchWithAuth: ReturnType<typeof vi.fn>;
};

const createAuthState = (overrides: Partial<MockAuthState> = {}): MockAuthState => ({
  status: 'unauthenticated',
  admin: null,
  error: null,
  clearError: vi.fn(),
  login: vi.fn(),
  logout: vi.fn().mockResolvedValue(undefined),
  requestPasswordReset: vi.fn(),
  confirmPasswordReset: vi.fn(),
  fetchWithAuth: vi.fn(),
  ...overrides
});

const useAdminAuthMock = vi.fn(() => createAuthState());

vi.mock('./providers/AdminAuthProvider', () => ({
  useAdminAuth: () => useAdminAuthMock()
}));

const mockProducts = {
  items: [
    {
      id: 'demo-coffee',
      title: 'Filter Coffee',
      description: 'Fresh brew',
      category: 'Beverages',
      price: 2.5,
      imageUrl: 'coffee.png',
      inventory: 5
    }
  ]
};

describe('App kiosk flow', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    useAdminAuthMock.mockReturnValue(createAuthState());
  });

  it('loads products and allows adding to cart', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : input.toString();
      const method = init?.method ?? 'GET';

      if (url.endsWith('/products') && method === 'GET') {
        return {
          ok: true,
          json: async () => mockProducts
        } as Response;
      }

      if (url.endsWith('/purchases') && method === 'POST') {
        return {
          ok: true,
          json: async () => ({ id: 'purchase-123' })
        } as Response;
      }

      throw new Error(`Unhandled fetch request: ${method} ${url}`);
    });

    render(<App />);

    expect(screen.getByRole('status')).toHaveTextContent(/loading/i);

    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    expect(screen.getByRole('heading', { name: /snack kiosk/i })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: /product categories/i })).toBeInTheDocument();
    expect(screen.getByText('Beverages')).toBeInTheDocument();

    const addButton = screen.getByRole('button', { name: /add to cart/i });
    await userEvent.click(addButton);

    await waitFor(() => {
      expect(screen.getByText(/total/i).nextSibling).toHaveTextContent('€2.50');
    });

    const payButton = screen.getByRole('button', { name: /^pay$/i });
    expect(payButton).toBeEnabled();

    await userEvent.click(payButton);

    const dialog = await screen.findByRole('dialog', { name: /scan to pay/i });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /confirm successful payment/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /confirm successful payment/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/purchases'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByText(/total/i).nextSibling).toHaveTextContent('€0.00');
    });
  });

  it('keeps loading state until automatic recovery after a transient failure', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('booting'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockProducts
      } as Response);

    render(<App />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('status')).toHaveTextContent(/loading/i);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    const addButton = await screen.findByRole('button', { name: /add to cart/i }, { timeout: 7000 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(addButton).toBeEnabled();
  });
});
