import request from 'supertest';
import { describe, expect, it, beforeEach } from 'vitest';
import { app, resetState } from '../index';

const validPayload = {
  items: [
    {
      productId: 'demo-coffee',
      quantity: 2
    }
  ]
};

describe('API routes', () => {
  beforeEach(() => {
    resetState();
  });

  it('responds with ok status on /health', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('returns product list via /products', async () => {
    const response = await request(app).get('/products');

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.items)).toBe(true);
    expect(response.body.items.length).toBeGreaterThan(0);
    expect(response.body.items[0]).toMatchObject({ id: 'demo-coffee' });
  });

  it('provides kiosk configuration via /config', async () => {
    const response = await request(app).get('/config');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      currency: 'EUR',
      paymentProvider: 'mobilepay'
    });
  });

  it('rejects purchases without items', async () => {
    const response = await request(app).post('/purchases').send({});

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('requires at least one item');
  });

  it('rejects purchases with invalid quantity', async () => {
    const response = await request(app)
      .post('/purchases')
      .send({ items: [{ productId: 'demo-coffee', quantity: 0 }] });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('positive quantity');
  });

  it('rejects purchases for unknown products', async () => {
    const response = await request(app)
      .post('/purchases')
      .send({ items: [{ productId: 'missing-product', quantity: 1 }] });

    expect(response.status).toBe(404);
    expect(response.body.message).toContain('not found');
  });

  it('accepts a valid purchase request', async () => {
    const response = await request(app).post('/purchases').send(validPayload);

    expect(response.status).toBe(202);
    expect(response.body.reference).toBeTruthy();
    expect(typeof response.body.reference).toBe('string');
  });
});
