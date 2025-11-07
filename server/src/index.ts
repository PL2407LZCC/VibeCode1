import express, { type Request, type Response } from 'express';

const app = express();
const port = Number.parseInt(process.env.PORT ?? '3000', 10);

type Product = {
  id: string;
  title: string;
  price: number;
  imageUrl: string;
  inventory?: number;
};

type PurchaseItem = {
  productId: string;
  quantity: number;
};

type PurchaseRecord = {
  id: string;
  items: PurchaseItem[];
  createdAt: string;
};

const sampleProducts: Product[] = [
  {
    id: 'demo-coffee',
    title: 'Filter Coffee',
    price: 2.5,
    imageUrl: '/placeholder/coffee.png',
    inventory: 18
  },
  {
    id: 'demo-energy',
    title: 'Energy Drink',
    price: 3,
    imageUrl: '/placeholder/energy.png',
    inventory: 9
  }
];

const kioskConfig = {
  currency: 'EUR',
  inventoryEnabled: true,
  paymentProvider: 'mobilepay'
};

const purchases: PurchaseRecord[] = [];

const resetState = () => {
  purchases.length = 0;
};

app.use(express.json());

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

app.get('/products', (_req: Request, res: Response) => {
  res.json({ items: sampleProducts });
});

app.get('/config', (_req: Request, res: Response) => {
  res.json(kioskConfig);
});

app.post('/purchases', (req: Request, res: Response) => {
  const { items } = req.body as { items?: PurchaseItem[] };

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'Purchase requires at least one item.' });
  }

  const invalidItem = items.find(
    (item) =>
      !item ||
      typeof item.productId !== 'string' ||
      item.productId.length === 0 ||
      typeof item.quantity !== 'number' ||
      !Number.isFinite(item.quantity) ||
      item.quantity <= 0
  );

  if (invalidItem) {
    return res.status(400).json({ message: 'Each purchase item must include productId and positive quantity.' });
  }

  const unknownProduct = items.find((item) => !sampleProducts.some((product) => product.id === item.productId));

  if (unknownProduct) {
    return res.status(404).json({ message: `Product ${unknownProduct.productId} not found.` });
  }

  const record: PurchaseRecord = {
    id: `purchase-${Date.now()}-${purchases.length + 1}`,
    items: items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity
    })),
    createdAt: new Date().toISOString()
  };

  purchases.push(record);

  return res.status(202).json({
    message: 'Purchase received. Processing pending payment confirmation.',
    reference: record.id
  });
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    // Boot message helps validate that the placeholder server runs.
    // eslint-disable-next-line no-console
    console.log(`API listening on http://localhost:${port}`);
  });
}

export { app, resetState };
