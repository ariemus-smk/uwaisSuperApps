/**
 * Database mock helper for mysql2 connection pools.
 * Provides mock implementations for appPool and radiusPool.
 */

const createMockPool = () => {
  const mockConnection = {
    query: jest.fn().mockResolvedValue([[], []]),
    execute: jest.fn().mockResolvedValue([[], []]),
    release: jest.fn(),
    beginTransaction: jest.fn().mockResolvedValue(undefined),
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined)
  };

  const pool = {
    getConnection: jest.fn().mockResolvedValue(mockConnection),
    query: jest.fn().mockResolvedValue([[], []]),
    execute: jest.fn().mockResolvedValue([[], []]),
    end: jest.fn().mockResolvedValue(undefined),
    _mockConnection: mockConnection
  };

  return pool;
};

const appPool = createMockPool();
const radiusPool = createMockPool();

/**
 * Reset all mock functions on both pools.
 * Call this in beforeEach() to ensure clean state between tests.
 */
const resetMocks = () => {
  const resetPool = (pool) => {
    pool.getConnection.mockClear();
    pool.query.mockClear();
    pool.execute.mockClear();
    pool.end.mockClear();
    pool._mockConnection.query.mockClear();
    pool._mockConnection.execute.mockClear();
    pool._mockConnection.release.mockClear();
    pool._mockConnection.beginTransaction.mockClear();
    pool._mockConnection.commit.mockClear();
    pool._mockConnection.rollback.mockClear();
  };

  resetPool(appPool);
  resetPool(radiusPool);
};

module.exports = {
  createMockPool,
  appPool,
  radiusPool,
  resetMocks
};
