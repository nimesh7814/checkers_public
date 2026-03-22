const express = require('express');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const port = Number(process.env.PORT || 80);
const distPath = path.join(__dirname, 'dist');
const backendBase = process.env.BACKEND_INTERNAL_URL || 'http://backend:3001';

// Proxy API and realtime traffic to backend so a single public tunnel URL works.
app.use('/api', createProxyMiddleware({
  target: `${backendBase}/api`,
  changeOrigin: true,
  xfwd: true,
}));

app.use('/socket.io', createProxyMiddleware({
  target: `${backendBase}/socket.io`,
  changeOrigin: true,
  ws: true,
  xfwd: true,
}));

// Some proxies/challenge pages request /favicon.ico directly and can show stale branding.
app.get('/favicon.ico', (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.redirect(302, '/checkers-icon.svg');
});

app.use(express.static(distPath));

app.use((_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(port, () => {
  console.log(`Frontend listening on port ${port} (proxying to ${backendBase})`);
});
