// backend/tests/auth.test.js
const request  = require('supertest');
const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');

jest.mock('axios', () => ({
  post: jest.fn().mockResolvedValue({ data: { success: true } }),
  get:  jest.fn().mockResolvedValue({ data: { embedding: new Array(512).fill(0.1) } }),
}));

const authRoutes = require('../routes/auth');
const { User }   = require('../models');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use('/api/auth', authRoutes);

const BASE_USER = { name: 'Test User', email: 'test@auth.com', password: 'Password123' };

describe('Auth Routes', () => {

  describe('POST /api/auth/register', () => {
    test('creates user and returns JWT', async () => {
      const res = await request(app).post('/api/auth/register').send(BASE_USER);
      expect(res.status).toBe(201);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.email).toBe(BASE_USER.email);
      expect(res.body.user.role).toBe('student');
      expect(res.body.user.passwordHash).toBeUndefined();
    });

    test('rejects duplicate email with 409', async () => {
      await request(app).post('/api/auth/register').send(BASE_USER).catch(() => {});
      const res = await request(app).post('/api/auth/register').send(BASE_USER);
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/already registered/i);
    });

    test('rejects missing required fields', async () => {
      const res = await request(app).post('/api/auth/register').send({ email: 'no@name.com' });
      expect(res.status).toBe(400);
    });

    test('stores hashed password not plaintext', async () => {
      const email = `hash${Date.now()}@test.com`;
      const res = await request(app).post('/api/auth/register')
        .send({ name: 'Hash', email, password: 'MySecret123' });
      const dbUser = await User.findById(res.body.user.id);
      expect(dbUser.passwordHash).not.toBe('MySecret123');
      expect(await bcrypt.compare('MySecret123', dbUser.passwordHash)).toBe(true);
    });
  });

  describe('POST /api/auth/login', () => {
    beforeAll(async () => {
      await request(app).post('/api/auth/register')
        .send({ name: 'Login User', email: 'login@test.com', password: 'Password123' })
        .catch(() => {});
    });

    test('returns token on correct credentials', async () => {
      const res = await request(app).post('/api/auth/login')
        .send({ email: 'login@test.com', password: 'Password123' });
      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
    });

    test('rejects wrong password', async () => {
      const res = await request(app).post('/api/auth/login')
        .send({ email: 'login@test.com', password: 'wrongpass' });
      expect(res.status).toBe(401);
    });

    test('rejects unknown email', async () => {
      const res = await request(app).post('/api/auth/login')
        .send({ email: 'nobody@test.com', password: 'pass' });
      expect(res.status).toBe(401);
    });

    test('JWT payload contains userId and role', async () => {
      const res = await request(app).post('/api/auth/login')
        .send({ email: 'login@test.com', password: 'Password123' });
      const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET || 'changeme_in_production');
      expect(decoded.userId).toBeDefined();
      expect(decoded.role).toBe('student');
    });
  });

  describe('GET /api/auth/me', () => {
    let token;
    beforeAll(async () => {
      const res = await request(app).post('/api/auth/register')
        .send({ name: 'Me', email: `me${Date.now()}@test.com`, password: 'Pass1234' });
      token = res.body.token;
    });

    test('returns sanitised user with valid token', async () => {
      const res = await request(app).get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.email).toBeDefined();
      expect(res.body.passwordHash).toBeUndefined();
      expect(res.body.faceEmbedding).toBeUndefined();
    });

    test('401 with no token', async () => {
      expect((await request(app).get('/api/auth/me')).status).toBe(401);
    });

    test('401 with malformed token', async () => {
      const res = await request(app).get('/api/auth/me')
        .set('Authorization', 'Bearer bad.token.val');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/auth/register-face', () => {
    let token;
    beforeAll(async () => {
      const res = await request(app).post('/api/auth/register')
        .send({ name: 'Face', email: `face${Date.now()}@test.com`, password: 'Pass1234' });
      token = res.body.token;
    });

    test('calls AI service and returns success', async () => {
      const res = await request(app).post('/api/auth/register-face')
        .set('Authorization', `Bearer ${token}`)
        .send({ imageBase64: 'data:image/jpeg;base64,abc123==' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('rejects unauthenticated requests', async () => {
      const res = await request(app).post('/api/auth/register-face')
        .send({ imageBase64: 'abc' });
      expect(res.status).toBe(401);
    });
  });
});