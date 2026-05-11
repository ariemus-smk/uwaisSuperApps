require('dotenv').config();

const app = require('./app');
const { database } = require('./config');

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

const server = app.listen(PORT, async () => {
  console.log(`[${NODE_ENV}] UwaisSuperApps ISP Backend running on port ${PORT}`);

  // Test database connections on startup
  const dbStatus = await database.testConnections();
  if (dbStatus.appDb) {
    console.log('[DB] App DB connected successfully.');
  }
  if (dbStatus.radiusDb) {
    console.log('[DB] RADIUS DB connected successfully.');
  }
});

// Graceful shutdown
async function shutdown(signal) {
  console.log(`${signal} received. Shutting down gracefully...`);
  server.close(async () => {
    await database.closePools();
    console.log('Server closed.');
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = server;
