import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import dotenv from 'dotenv';

// Load environment variables from parent folder or local
dotenv.config({ path: '../.env' });
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.FRONTEND_PORT || 3000;
// Fallback to localhost:3500 if port is not specified
const BACKEND_PORT = process.env.PORT || 3500;
const BACKEND_URL = process.env.BACKEND_URL || `http://localhost:${BACKEND_PORT}`;

// Parse JSON bodies to easily pass as objects to Axios
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Express API Proxy Router (Native RegExp to bypass Express 5 path-to-regexp limits)
app.all(/^\/api\/.*/, async (req, res) => {
  const targetUrl = `${BACKEND_URL}${req.originalUrl}`;
  try {
    const headers = { ...req.headers };
    // Delete host header to prevent target mismatch and SSL errors
    delete headers.host;

    const response = await axios({
      method: req.method,
      url: targetUrl,
      headers: headers,
      data: req.body,
      validateStatus: () => true, // Let Express pass any status (2xx, 4xx, 5xx) back to client
    });

    res.status(response.status).set(response.headers).send(response.data);
  } catch (err) {
    console.error(`Proxy Error for ${req.method} ${req.originalUrl}:`, err.message);
    res.status(500).json({ 
      status: 'error', 
      message: 'Frontend Gateway Proxy Error', 
      error: err.message 
    });
  }
});

// Serve compiled static files of React SPA output
app.use(express.static(path.join(__dirname, 'dist')));

// SPA fallback: Return index.html for all non-static / non-API path routing
app.get(/^\/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`=================================================`);
  console.log(`🚀 UwaisSuperApps Express-React Frontend Active`);
  console.log(`   Running on Address:  http://localhost:${PORT}`);
  console.log(`   Routing Proxy target: ${BACKEND_URL}`);
  console.log(`=================================================`);
});
