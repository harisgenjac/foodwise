import request from 'supertest';
import app from '../src/app.js';

describe('Smoke test', () => {
  it('server odgovara na osnovni zahtjev', async () => {
    const response = await request(app).get('/api/products');
    expect(response.status).toBe(401); // očekujemo 401 jer nema auth tokena
  });
});