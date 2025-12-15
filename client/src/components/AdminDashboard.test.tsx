import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminDashboard } from './AdminDashboard';
import { useAdminDashboard } from '../hooks/useAdminDashboard';
import { useAdminManagement } from '../hooks/useAdminManagement';

vi.mock('../hooks/useAdminDashboard');
vi.mock('../hooks/useAdminManagement');

const baseProduct = {
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
};

const baseStats = {
  totalTransactions: 3,
  totalRevenue: 42,
  itemsSold: 9,
  averageOrderValue: 14,
  lifetime: { revenue: 42, transactions: 3, itemsSold: 9 },
  period: {
    current: { start: '2025-11-01', end: '2025-11-07' },
    previous: { start: '2025-10-25', end: '2025-10-31' }
  },
  summary: {
    revenue: { current: 30, previous: 20, deltaAbsolute: 10, deltaPercent: 50 },
    transactions: { current: 3, previous: 2, deltaAbsolute: 1, deltaPercent: 50 },
    itemsSold: { current: 9, previous: 6, deltaAbsolute: 3, deltaPercent: 50 },
    averageOrderValue: { current: 14, previous: 12, deltaAbsolute: 2, deltaPercent: 16.7 }
  },
  daily: [{ date: '2025-11-05', total: 12, transactions: 1 }],
  weekly: [{ weekStart: '2025-10-27', total: 42, transactions: 3 }],
  hourlyTrend: [{ hour: '08:00', percentage: 12.5, transactions: 1 }],
  categoryMix: [{ category: 'Beverages', quantity: 5, revenue: 20, revenueShare: 60, quantityShare: 50 }],
  topProducts: [{ productId: 'demo-coffee', title: 'Filter Coffee', quantity: 3, revenue: 12 }],
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
        lifetime: { quantity: 12, revenue: 28 }
      }
    }
  ],
  highlights: {
    bestDay: { date: '2025-11-06', total: 18, transactions: 2 },
    slowDay: null
  },
  alerts: ['Average order value increased 20%.']
};

type DashboardStateShape = {
  products: typeof baseProduct[];
  config: { currency: string; paymentProvider: string; inventoryEnabled: boolean } | null;
  stats: typeof baseStats | null;
  isLoading: boolean;
  error: string | null;
  refresh: vi.Mock<Promise<void>, []>;
  createProduct: vi.Mock<Promise<void>, [any]>;
  updateProduct: vi.Mock<Promise<void>, [string, any]>;
  toggleInventory: vi.Mock<Promise<void>, [boolean]>;
  deleteProduct: vi.Mock<Promise<void>, [string]>;
  uploadImage: vi.Mock<Promise<{ url: string; filename: string }>, [File]>;
};

const createDashboardState = (overrides: Partial<DashboardStateShape> = {}): DashboardStateShape => ({
  products: [baseProduct],
  config: { currency: 'EUR', paymentProvider: 'mobilepay', inventoryEnabled: true },
  stats: baseStats,
  isLoading: false,
  error: null,
  refresh: vi.fn().mockResolvedValue(undefined),
  createProduct: vi.fn().mockResolvedValue(undefined),
  updateProduct: vi.fn().mockResolvedValue(undefined),
  toggleInventory: vi.fn().mockResolvedValue(undefined),
  deleteProduct: vi.fn().mockResolvedValue(undefined),
  uploadImage: vi.fn().mockResolvedValue({ url: 'https://example.com/coffee.png', filename: 'coffee.png' }),
  ...overrides
});

const baseAdminUser = {
  id: 'admin-1',
  email: 'ops@example.com',
  username: 'ops',
  isActive: true,
  lastLoginAt: '2025-11-26T12:00:00.000Z',
  createdAt: '2025-09-01T08:00:00.000Z',
  updatedAt: '2025-11-26T12:00:00.000Z'
};

const baseInvite = {
  id: 'invite-1',
  email: 'new-admin@example.com',
  username: 'newadmin',
  status: 'pending' as const,
  createdAt: '2025-11-26T12:00:00.000Z',
  expiresAt: '2025-12-03T12:00:00.000Z',
  lastSentAt: '2025-11-26T12:00:00.000Z',
  acceptedAt: null,
  revokedAt: null,
  invitedBy: {
    id: 'admin-1',
    username: 'ops'
  }
};

type ManagementStateShape = {
  admins: typeof baseAdminUser[];
  invites: typeof baseInvite[];
  isLoading: boolean;
  error: string | null;
  refresh: vi.Mock<Promise<void>, []>;
  inviteAdmin: vi.Mock<Promise<{ invite: typeof baseInvite; debugToken?: string; expiresAt?: string | null }>, [any]>;
  resendInvite: vi.Mock<Promise<{ invite?: typeof baseInvite; debugToken?: string; expiresAt?: string | null }>, [string]>;
  revokeInvite: vi.Mock<Promise<void>, [string]>;
  updateAdminStatus: vi.Mock<Promise<typeof baseAdminUser>, [string, boolean]>;
};

const createManagementState = (overrides: Partial<ManagementStateShape> = {}): ManagementStateShape => ({
  admins: [baseAdminUser],
  invites: [baseInvite],
  isLoading: false,
  error: null,
  refresh: vi.fn().mockResolvedValue(undefined),
  inviteAdmin: vi.fn().mockResolvedValue({ invite: baseInvite }),
  resendInvite: vi.fn().mockResolvedValue({ invite: baseInvite }),
  revokeInvite: vi.fn().mockResolvedValue(undefined),
  updateAdminStatus: vi.fn().mockResolvedValue({ ...baseAdminUser, isActive: false }),
  ...overrides
});

const useAdminDashboardMock = useAdminDashboard as unknown as vi.Mock;
const useAdminManagementMock = useAdminManagement as unknown as vi.Mock;

const expandSection = async (name: RegExp | string) => {
  const toggle = await screen.findByRole('button', { name });
  await userEvent.click(toggle);
};

describe('AdminDashboard', () => {
  beforeEach(() => {
    useAdminDashboardMock.mockReturnValue(createDashboardState());
    useAdminManagementMock.mockReturnValue(createManagementState());
  });

  afterEach(() => {
    useAdminDashboardMock.mockReset();
    useAdminManagementMock.mockReset();
    vi.restoreAllMocks();
  });

  it('prompts for sign in when admin session is missing', () => {
    useAdminDashboardMock.mockReturnValue(
      createDashboardState({ products: [], stats: null, config: null, error: 'Sign in to view admin tools.' })
    );

    render(<AdminDashboard />);

    expect(screen.getByText(/sign in to view admin tools/i)).toBeTruthy();
  });

  it('creates a new product using the dashboard form', async () => {
    const state = createDashboardState();
    useAdminDashboardMock.mockReturnValue(state);

    render(<AdminDashboard />);

    await expandSection(/inventory controls/i);

    await userEvent.clear(screen.getByLabelText(/^Title$/i));
    await userEvent.type(screen.getByLabelText(/^Title$/i), 'Sparkling Water');
    await userEvent.clear(screen.getByLabelText(/Price/i));
    await userEvent.type(screen.getByLabelText(/Price/i), '2.80');
    await userEvent.clear(screen.getByLabelText(/Inventory/i));
    await userEvent.type(screen.getByLabelText(/Inventory/i), '12');
    await userEvent.type(screen.getByLabelText(/Description/i), 'Refreshing bubbles');
    await userEvent.type(screen.getByLabelText(/Image URL/i), 'https://example.com/sparkling.png');
    await userEvent.clear(screen.getByLabelText(/Category/i));
    await userEvent.type(screen.getByLabelText(/Category/i), 'Beverages');

    await userEvent.click(screen.getByRole('button', { name: /add product/i }));

    await waitFor(() => {
      expect(state.createProduct).toHaveBeenCalledWith({
        title: 'Sparkling Water',
        description: 'Refreshing bubbles',
        price: 2.8,
        imageUrl: 'https://example.com/sparkling.png',
        inventoryCount: 12,
        isActive: true,
        category: 'Beverages'
      });
    });

    await waitFor(() => {
      expect(screen.getByText(/product created successfully/i)).toBeTruthy();
    });
  }, 10000);

  it('archives a product when confirmed', async () => {
    const state = createDashboardState();
    useAdminDashboardMock.mockReturnValue(state);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<AdminDashboard />);

    await expandSection(/product catalog/i);

    await userEvent.click(screen.getByRole('button', { name: /archive/i }));

    expect(confirmSpy).toHaveBeenCalled();

    await waitFor(() => {
      expect(state.deleteProduct).toHaveBeenCalledWith('demo-coffee');
    });

    await waitFor(() => {
      expect(screen.getByText(/filter coffee archived\./i)).toBeTruthy();
    });
  });

  it('requests inventory mode toggle', async () => {
    const state = createDashboardState();
    useAdminDashboardMock.mockReturnValue(state);

    render(<AdminDashboard />);

    await expandSection(/inventory controls/i);

    await userEvent.click(screen.getByRole('button', { name: /disable inventory gate/i }));

    await waitFor(() => {
      expect(state.toggleInventory).toHaveBeenCalledWith(false);
    });

    await waitFor(() => {
      expect(screen.getByText(/inventory enforcement disabled\./i)).toBeTruthy();
    });
  });

  it('surfaces upload errors from the hook', async () => {
    const uploadError = new Error('Upload failed');
    const state = createDashboardState({ uploadImage: vi.fn().mockRejectedValue(uploadError) });
    useAdminDashboardMock.mockReturnValue(state);

    render(<AdminDashboard />);

    await expandSection(/inventory controls/i);

    const fileInput = screen.getByLabelText(/Product image/i, { selector: 'input[type="file"]' });
    const file = new File(['binary'], 'coffee.png', { type: 'image/png' });
    await userEvent.upload(fileInput, file);

    await waitFor(() => {
      expect(state.uploadImage).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByText(/upload failed/i)).toBeTruthy();
    });
  });

  it('renders admin management data when section is expanded', async () => {
    render(<AdminDashboard />);

    await expandSection(/admin management/i);

    expect(await screen.findByText(baseAdminUser.email)).toBeTruthy();
    expect(screen.getByText(/pending invites/i)).toBeTruthy();
    expect(screen.getByText(baseInvite.email)).toBeTruthy();
  });

  it('submits a new admin invite through the panel', async () => {
    const managementState = createManagementState();
    useAdminManagementMock.mockReturnValue(managementState);

    render(<AdminDashboard />);

    await expandSection(/admin management/i);

    await userEvent.clear(screen.getByLabelText(/Email address/i));
    await userEvent.type(screen.getByLabelText(/Email address/i), 'fresh-admin@example.com');
    await userEvent.clear(screen.getByLabelText(/Username/i));
    await userEvent.type(screen.getByLabelText(/Username/i), 'freshadmin');

    await userEvent.click(screen.getByRole('button', { name: /send invite/i }));

    await waitFor(() => {
      expect(managementState.inviteAdmin).toHaveBeenCalledWith({ email: 'fresh-admin@example.com', username: 'freshadmin' });
    });

    await waitFor(() => {
      expect(screen.getByText(/invite sent to fresh-admin@example.com/i)).toBeTruthy();
    });
  });
});
