const { appPool, radiusPool, testConnections, closePools } = require('../../src/config/database');

describe('Database Configuration', () => {
  describe('appPool', () => {
    it('should be a mysql2 pool instance', () => {
      expect(appPool).toBeDefined();
      expect(appPool.pool).toBeDefined();
    });

    it('should use APP_DB environment variables for configuration', () => {
      const config = appPool.pool.config;
      expect(config.connectionConfig.host).toBe(process.env.APP_DB_HOST || 'localhost');
      expect(config.connectionConfig.port).toBe(
        parseInt(process.env.APP_DB_PORT, 10) || 3306
      );
      expect(config.connectionConfig.user).toBe(process.env.APP_DB_USER || 'uwais_app');
      expect(config.connectionConfig.database).toBe(process.env.APP_DB_NAME || 'uwais_app');
      expect(config.connectionLimit).toBe(
        parseInt(process.env.APP_DB_CONNECTION_LIMIT, 10) || 20
      );
    });

    it('should have waitForConnections enabled', () => {
      expect(appPool.pool.config.waitForConnections).toBe(true);
    });
  });

  describe('radiusPool', () => {
    it('should be a mysql2 pool instance', () => {
      expect(radiusPool).toBeDefined();
      expect(radiusPool.pool).toBeDefined();
    });

    it('should use RADIUS_DB environment variables for configuration', () => {
      const config = radiusPool.pool.config;
      expect(config.connectionConfig.host).toBe(process.env.RADIUS_DB_HOST || 'localhost');
      expect(config.connectionConfig.port).toBe(
        parseInt(process.env.RADIUS_DB_PORT, 10) || 3306
      );
      expect(config.connectionConfig.user).toBe(process.env.RADIUS_DB_USER || 'radius');
      expect(config.connectionConfig.database).toBe(process.env.RADIUS_DB_NAME || 'radius');
      expect(config.connectionLimit).toBe(
        parseInt(process.env.RADIUS_DB_CONNECTION_LIMIT, 10) || 10
      );
    });

    it('should have waitForConnections enabled', () => {
      expect(radiusPool.pool.config.waitForConnections).toBe(true);
    });
  });

  describe('testConnections', () => {
    it('should be a function', () => {
      expect(typeof testConnections).toBe('function');
    });

    it('should return an object with appDb and radiusDb status', async () => {
      const results = await testConnections();
      expect(results).toHaveProperty('appDb');
      expect(results).toHaveProperty('radiusDb');
      expect(typeof results.appDb).toBe('boolean');
      expect(typeof results.radiusDb).toBe('boolean');
    });
  });

  describe('closePools', () => {
    it('should be a function', () => {
      expect(typeof closePools).toBe('function');
    });
  });

  describe('config/index.js', () => {
    it('should export database module', () => {
      const config = require('../../src/config');
      expect(config.database).toBeDefined();
      expect(config.database.appPool).toBeDefined();
      expect(config.database.radiusPool).toBeDefined();
      expect(config.database.testConnections).toBeDefined();
      expect(config.database.closePools).toBeDefined();
    });
  });
});
