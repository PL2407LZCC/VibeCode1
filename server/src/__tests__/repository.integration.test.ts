import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import { execSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedDatabase } from '../lib/seedData';

const TEST_TIMEOUT_MS = 120_000;
vi.setConfig({ testTimeout: TEST_TIMEOUT_MS, hookTimeout: TEST_TIMEOUT_MS });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRoot = path.resolve(__dirname, '../..');

type RepositoryModule = typeof import('../repositories/productRepository');

const dockerInfo = spawnSync('docker', ['info'], { stdio: 'ignore' });
const DOCKER_AVAILABLE = dockerInfo.status === 0;
const describeWithRuntime = DOCKER_AVAILABLE ? describe : describe.skip;

let container: StartedPostgreSqlContainer | null = null;
let prisma: PrismaClient | null = null;
let listActiveProducts: RepositoryModule['listActiveProducts'];
let createPurchase: RepositoryModule['createPurchase'];

beforeAll(async () => {
  if (!DOCKER_AVAILABLE) {
    return;
  }

  container = await new PostgreSqlContainer('postgres:18-alpine')
    .withDatabase('vibecode1')
    .withUsername('postgres')
    .withPassword('postgres')
    .start();

  const databaseUrl = container.getConnectionUri();
  process.env.DATABASE_URL = databaseUrl;

  const env = { ...process.env, DATABASE_URL: databaseUrl };
  execSync('npx prisma migrate deploy', { cwd: serverRoot, env, stdio: 'inherit' });

  prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

  const repositoryModule: RepositoryModule = await import('../repositories/productRepository');
  listActiveProducts = repositoryModule.listActiveProducts;
  createPurchase = repositoryModule.createPurchase;
});

beforeEach(async () => {
  if (!DOCKER_AVAILABLE || !prisma) {
    return;
  }

  await seedDatabase(prisma);
});

afterAll(async () => {
  if (!DOCKER_AVAILABLE) {
    return;
  }

  await prisma?.$disconnect();
  await container?.stop();
});

describeWithRuntime('Product repository persistence', () => {
  it('lists active products from the seeded catalog', async () => {
    if (!prisma) {
      throw new Error('Prisma client not initialised');
    }

    const products = await listActiveProducts(prisma);

    expect(products).toHaveLength(6);
    expect(products.find((product) => product.id === 'demo-coffee')).toMatchObject({
      id: 'demo-coffee',
      inventoryCount: 54,
      isActive: true
    });
  });

  it('creates a purchase and updates inventory counts', async () => {
    if (!prisma) {
      throw new Error('Prisma client not initialised');
    }

    const reference = `ref-${randomUUID()}`;

    const purchase = await createPurchase(
      {
        reference,
        notes: 'Integration test order',
        items: [
          { productId: 'demo-coffee', quantity: 2 },
          { productId: 'demo-energy', quantity: 1 }
        ]
      },
      prisma
    );

    expect(purchase.reference).toBe(reference);
    expect(purchase.items).toHaveLength(2);

    const persisted = await prisma.purchase.findUnique({
      where: { reference },
      include: { items: true }
    });

    expect(persisted).not.toBeNull();
    expect(persisted?.items).toHaveLength(2);
    expect(Number(persisted?.totalAmount)).toBeCloseTo(8, 2);

    const coffee = await prisma.product.findUnique({ where: { id: 'demo-coffee' } });
    const energy = await prisma.product.findUnique({ where: { id: 'demo-energy' } });

    expect(coffee?.inventoryCount).toBe(52);
    expect(energy?.inventoryCount).toBe(39);
  });

  it('throws when attempting to create a purchase with unknown products', async () => {
    if (!prisma) {
      throw new Error('Prisma client not initialised');
    }

    await expect(
      createPurchase(
        {
          reference: `ref-${randomUUID()}`,
          items: [{ productId: 'unknown-item', quantity: 1 }]
        },
        prisma
      )
    ).rejects.toThrow(/Unknown product/);
  });
});
