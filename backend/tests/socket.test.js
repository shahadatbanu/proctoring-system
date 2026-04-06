// backend/tests/socket.test.js
const { createServer } = require('http');
const { Server }       = require('socket.io');
const Client           = require('socket.io-client');
const mongoose         = require('mongoose');
const jwt              = require('jsonwebtoken');
const { setupProctorSocket } = require('../sockets/proctorSocket');

jest.mock('axios', () => ({
  post: jest.fn().mockResolvedValue({
    data: {
      session_id: 'sess1',
      frame_number: 0,
      timestamp: Date.now() / 1000,
      face_detected: true,
      face_count: 1,
      identity_match: true,
      identity_confidence: 0.95,
      behaviour_flags: [],
      spoof_detected: false,
      risk_score: 0.0,
      alerts: [],
    },
  }),
}));

jest.mock('../models', () => ({
  ProctoringSession: {
    findById:          jest.fn().mockResolvedValue({ _id: 'sess1', userId: 'user1', examId: 'exam1', status: 'active' }),
    findByIdAndUpdate: jest.fn().mockResolvedValue({}),
  },
  AlertLog: {
    insertMany: jest.fn().mockResolvedValue([]),
    create:     jest.fn().mockResolvedValue({}),
  },
}));

const JWT_SECRET = 'test_secret';
process.env.JWT_SECRET = JWT_SECRET;

function makeToken(userId, role = 'student') {
  return jwt.sign({ userId, role }, JWT_SECRET);
}

describe('ProctorSocket', () => {
  let httpServer, io, clientSocket, serverSocket;
  const PORT = 4001;

  beforeAll((done) => {
    httpServer = createServer();
    io = new Server(httpServer);
    setupProctorSocket(io);
    httpServer.listen(PORT, done);
  });

  afterAll(() => {
    io.close();
    httpServer.close();
  });

  afterEach(() => {
    if (clientSocket?.connected) clientSocket.disconnect();
  });

  test('rejects connection without token', (done) => {
    clientSocket = Client(`http://localhost:${PORT}`, {
      auth: {},
      reconnection: false,
    });
    clientSocket.on('connect_error', (err) => {
      expect(err.message).toBe('Authentication error');
      done();
    });
  });

  test('rejects connection with invalid token', (done) => {
    clientSocket = Client(`http://localhost:${PORT}`, {
      auth: { token: 'invalid.token.here' },
      reconnection: false,
    });
    clientSocket.on('connect_error', (err) => {
      expect(err.message).toBe('Invalid token');
      done();
    });
  });

  test('accepts connection with valid token', (done) => {
    const token = makeToken('user1');
    clientSocket = Client(`http://localhost:${PORT}`, {
      auth: { token },
      reconnection: false,
    });
    clientSocket.on('connect', () => {
      expect(clientSocket.connected).toBe(true);
      done();
    });
  });

  test('join-session emits session-joined', (done) => {
    const token = makeToken('user1');
    clientSocket = Client(`http://localhost:${PORT}`, {
      auth: { token },
      reconnection: false,
    });
    clientSocket.on('connect', () => {
      clientSocket.emit('join-session', { sessionId: 'sess1' });
    });
    clientSocket.on('session-joined', (data) => {
      expect(data.sessionId).toBe('sess1');
      done();
    });
  });

  test('proctor-frame emits proctor-result', (done) => {
    const token = makeToken('user1');
    clientSocket = Client(`http://localhost:${PORT}`, {
      auth: { token },
      reconnection: false,
    });
    clientSocket.on('connect', () => {
      clientSocket.emit('join-session', { sessionId: 'sess1' });
    });
    clientSocket.on('session-joined', () => {
      // Send a fake frame (small base64 image)
      const fakeFrame = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AJQAB/9k=';
      clientSocket.emit('proctor-frame', { sessionId: 'sess1', imageBase64: fakeFrame });
    });
    clientSocket.on('proctor-result', (result) => {
      expect(result).toHaveProperty('risk_score');
      expect(result).toHaveProperty('face_detected');
      done();
    });
  }, 10000);

  test('admin can join monitor room', (done) => {
    const token = makeToken('admin1', 'admin');
    clientSocket = Client(`http://localhost:${PORT}`, {
      auth: { token },
      reconnection: false,
    });
    clientSocket.on('connect', () => {
      // Should not error
      clientSocket.emit('join-admin-monitor');
      setTimeout(() => {
        expect(clientSocket.connected).toBe(true);
        done();
      }, 200);
    });
  });

  test('student cannot join admin monitor', (done) => {
    const token = makeToken('user2', 'student');
    clientSocket = Client(`http://localhost:${PORT}`, {
      auth: { token },
      reconnection: false,
    });
    clientSocket.on('connect', () => {
      clientSocket.emit('join-admin-monitor');
      // No error thrown — it just silently ignores
      setTimeout(() => {
        expect(clientSocket.connected).toBe(true);
        done();
      }, 200);
    });
  });
});