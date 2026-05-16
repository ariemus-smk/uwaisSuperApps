const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const routes = require('./routes');

const app = express();

// API prefix from environment
const apiPrefix = process.env.API_PREFIX || '/api';

// --- Global middleware (applied in correct order) ---

// 1. CORS - handle cross-origin requests
app.use(cors());

// 2. Security headers
app.use(helmet());

// 3. Request logging
app.use(morgan('combined'));

// 4. Body parsing (JSON + URL-encoded)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 5. Serve static files (for Isolir Landing Page)
const path = require('path');
app.use(express.static(path.join(__dirname, 'public')));

// --- Routes ---

// Health check (no auth required)
app.get(`${apiPrefix}/health`, (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Base route (no auth required)
app.get('/', (req, res) => {
  res.status(200).json({
    name: 'UwaisSuperApps ISP Backend',
    version: '1.0.0',
    api: apiPrefix
  });
});

// Isolir Landing Page Route
app.get('/isolir', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'isolir.html'));
});

// All API routes under the configured prefix
// Auth, RBAC, and branchScope middleware are applied per-route inside each module
app.use(apiPrefix, routes);

// --- Error handling ---

// 404 handler for unmatched routes
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

module.exports = app;
