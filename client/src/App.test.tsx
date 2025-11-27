import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

const mockProducts = {
  items: [
    {
      id: 'demo-coffee',
      title: 'Filter Coffee',
      description: 'Fresh brew',
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
  });

  it('loads products and allows adding to cart', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockProducts
    } as Response);

    render(<App />);

    expect(screen.getByRole('status')).toHaveTextContent(/loading/i);

    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    expect(screen.getByRole('heading', { name: /snack kiosk/i })).toBeInTheDocument();

    const addButton = screen.getByRole('button', { name: /add to cart/i });
    await userEvent.click(addButton);

    await waitFor(() => {
      expect(screen.getByText(/total/i).nextSibling).toHaveTextContent('€2.50');
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
      expect(screen.getByRole('status')).toHaveTextContent(/loading/i);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    await waitFor(
      () => {
        expect(fetchMock).toHaveBeenCalledTimes(2);
      },
      { timeout: 4500 }
    );

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /add to cart/i })).toBeEnabled();
    });
  });
});
