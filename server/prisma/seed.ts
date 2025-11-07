import { PrismaClient } from '@prisma/client';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { seedDatabase } from '../src/lib/seedData';

let cachedClient: PrismaClient | null = null;

const ensureClient = () => {
  if (!cachedClient) {
    cachedClient = new PrismaClient();
  }

  return cachedClient;
};

export async function seed(client?: PrismaClient) {
  const db = client ?? ensureClient();

  return seedDatabase(db);
}

const isDirectExecution = (() => {
  const executedFile = process.argv[1];
  if (!executedFile) {
    return false;
  }

  try {
    const resolved = fileURLToPath(import.meta.url);
    return path.resolve(resolved) === path.resolve(executedFile);
  } catch (error) {
    console.error('Failed to determine module execution context', error);
    return false;
  }
})();

if (isDirectExecution) {
  seed()
    .then(async () => {
      if (cachedClient) {
        await cachedClient.$disconnect();
      }

      console.log('Seed complete');
    })
    .catch(async (error) => {
      console.error('Seed failed', error);
      if (cachedClient) {
        await cachedClient.$disconnect();
      }

      process.exit(1);
    });
}
