import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import prisma from '../lib/prisma.js';

type ProductSummary = {
  id: string;
  title: string;
  price: string;
  imageUrl: string | null;
  inventoryCount: number;
  isActive: boolean;
  category: string;
};

type RetrievedProduct = {
  id: string;
  title: string;
  description: string | null;
  price: unknown;
  imageUrl: string | null;
  inventoryCount: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  category: string;
};

type PurchaseItemInput = {
  productId: string;
  quantity: number;
};

export type CreatePurchaseInput = {
  reference?: string;
  items: PurchaseItemInput[];
  notes?: string;
};

const toCents = (value: unknown) => {
  const numericValue =
    typeof value === 'number'
      ? value
      : typeof value === 'bigint'
        ? Number(value)
        : value && typeof value === 'object' && 'toNumber' in (value as Record<string, unknown>)
          ? Number((value as { toNumber: () => number }).toNumber())
          : Number(value);

  return Math.round(numericValue * 100);
};

const centsToString = (cents: number) => (cents / 100).toFixed(2);
const centsToNumber = (cents: number) => cents / 100;
const parsePriceInput = (price: number | string) =>
  typeof price === 'number' ? price.toFixed(2) : Number(price).toFixed(2);

const decimalToNumber = (value: unknown) => centsToNumber(toCents(value));

export async function listActiveProducts(client: PrismaClient = prisma): Promise<ProductSummary[]> {
  const products = (await client.product.findMany({
    where: { isActive: true },
    orderBy: { title: 'asc' }
  })) as RetrievedProduct[];

  return products.map((product: RetrievedProduct): ProductSummary => ({
    id: product.id,
    title: product.title,
    price: centsToString(toCents(product.price)),
    imageUrl: product.imageUrl,
    inventoryCount: product.inventoryCount,
    isActive: product.isActive,
    category: product.category
  }));
}

export async function createPurchase(
  input: CreatePurchaseInput,
  client: PrismaClient = prisma
) {
  if (!input.items || input.items.length === 0) {
    throw new Error('Purchase requires at least one item.');
  }

  const reference = input.reference ?? `purchase-${randomUUID()}`;

  return client.$transaction(async (tx: Prisma.TransactionClient) => {
    const productIds = input.items.map((item) => item.productId);
    const products = (await tx.product.findMany({
      where: { id: { in: productIds } }
    })) as RetrievedProduct[];
    const productMap: Record<string, RetrievedProduct> = {};
    products.forEach((product: RetrievedProduct) => {
      productMap[product.id] = product;
    });

    const unknownProductIds = productIds.filter((id) => !productMap[id]);
    if (unknownProductIds.length > 0) {
      throw new Error(`Unknown product(s): ${unknownProductIds.join(', ')}`);
    }

    let totalCents = 0;

    const purchaseItems = input.items.map((item) => {
      const product = productMap[item.productId];

      if (!product) {
        throw new Error(`Unknown product: ${item.productId}`);
      }
      const unitPriceCents = toCents(product.price);
      totalCents += unitPriceCents * item.quantity;

      return {
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: centsToString(unitPriceCents)
      };
    });

    const purchase = await tx.purchase.create({
      data: {
        reference,
        notes: input.notes,
        totalAmount: centsToString(totalCents),
        items: {
          create: purchaseItems
        }
      },
      include: {
        items: true
      }
    });

    await Promise.all(
      input.items.map((item) =>
        tx.product.update({
          where: { id: item.productId },
          data: {
            inventoryCount: {
              decrement: item.quantity
            }
          }
        })
      )
    );

    return purchase;
  });
}

export async function listAllProducts(client: PrismaClient = prisma) {
  const products = (await client.product.findMany({ orderBy: { updatedAt: 'desc' } })) as RetrievedProduct[];

  return products.map((product) => ({
    id: product.id,
    title: product.title,
    description: product.description ?? '',
    price: decimalToNumber(product.price),
    imageUrl: product.imageUrl,
    inventoryCount: product.inventoryCount,
    isActive: product.isActive,
    category: product.category,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt
  }));
}

export async function createProduct(
  input: {
    title: string;
    description?: string;
    price: number;
    imageUrl?: string;
    inventoryCount: number;
    isActive?: boolean;
    category: string;
  },
  client: PrismaClient = prisma
) {
  const product = await client.product.create({
    data: {
      title: input.title,
      description: input.description,
      price: parsePriceInput(input.price),
      imageUrl: input.imageUrl,
      inventoryCount: input.inventoryCount,
      isActive: input.isActive ?? true,
      category: input.category
    }
  });

  return {
    id: product.id,
    title: product.title,
    description: product.description ?? '',
    price: decimalToNumber(product.price),
    imageUrl: product.imageUrl,
    inventoryCount: product.inventoryCount,
    isActive: product.isActive,
    category: product.category,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt
  };
}

export async function updateProduct(
  productId: string,
  input: {
    title?: string;
    description?: string | null;
    price?: number;
    imageUrl?: string | null;
    inventoryCount?: number;
    isActive?: boolean;
    category?: string;
  },
  client: PrismaClient = prisma
) {
  const data = Prisma.validator<Prisma.ProductUpdateArgs['data']>()({
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.price !== undefined ? { price: parsePriceInput(input.price) } : {}),
    ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
    ...(input.inventoryCount !== undefined ? { inventoryCount: input.inventoryCount } : {}),
    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    ...(input.category !== undefined ? { category: input.category } : {})
  });

  const product = await client.product.update({
    where: { id: productId },
    data
  });

  return {
    id: product.id,
    title: product.title,
    description: product.description ?? '',
    price: decimalToNumber(product.price),
    imageUrl: product.imageUrl,
    inventoryCount: product.inventoryCount,
    isActive: product.isActive,
    category: product.category,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt
  };
}

export async function updateProductInventory(
  productId: string,
  inventoryCount: number,
  client: PrismaClient = prisma
) {
  const product = await client.product.update({
    where: { id: productId },
    data: { inventoryCount }
  });

  return {
    id: product.id,
    inventoryCount: product.inventoryCount
  };
}

export async function archiveProduct(
  productId: string,
  client: PrismaClient = prisma
) {
  const product = await client.product.update({
    where: { id: productId },
    data: {
      isActive: false,
      inventoryCount: 0
    }
  });

  return {
    id: product.id,
    title: product.title,
    description: product.description ?? '',
    price: decimalToNumber(product.price),
    imageUrl: product.imageUrl,
    inventoryCount: product.inventoryCount,
    isActive: product.isActive,
    category: product.category,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt
  };
}
