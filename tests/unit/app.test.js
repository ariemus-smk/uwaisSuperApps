const request = require('supertest');
const app = require('../../src/app');

describe('App - Health Check', () => {
  it('GET /api/health should return status ok', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('environment');
  });

  it('GET / should return app info', async () => {
    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('name', 'UwaisSuperApps ISP Backend');
    expect(res.body).toHaveProperty('version', '1.0.0');
    expect(res.body).toHaveProperty('api', '/api');
  });

  it('GET /nonexistent should return 404', async () => {
    const res = await request(app).get('/nonexistent');

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('status', 'error');
    expect(res.body.message).toContain('not found');
  });
});
