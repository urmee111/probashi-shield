const { STATUS_CODES } = require('node:http');
const express = require('express');
const cors = require('cors');
const { checkConnection } = require('./db/pool');
const authRoutes = require('./routes/auth');
const directoryRoutes = require('./routes/directory');
const documentRoutes = require('./routes/documents');
const pathwayRoutes = require('./routes/pathways');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/api/health', async (_req, res) => {
  try {
    await checkConnection();
    return res.json({ status: 'ok', database: 'up' });
  } catch {
    return res.status(503).json({ status: 'unavailable', database: 'down' });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/pathways', pathwayRoutes);
app.use(['/api/directory', '/api'], directoryRoutes);

app.use((_req, res) => res.status(404).json({ error: 'Not Found' }));

app.use((error, _req, res, next) => {
  if (res.headersSent) return next(error);

  const status = Number.isInteger(error.status) && error.status >= 400 && error.status <= 599
    ? error.status
    : 500;
  if (status >= 500) console.error('Request failed', error.code || error.name);
  return res.status(status).json({ error: STATUS_CODES[status] || 'Request Failed' });
});

if (require.main === module) {
  const port = Number(process.env.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Set PORT to a valid TCP port in server/.env.');
  }
  if (!process.env.JWT_SECRET) throw new Error('Set JWT_SECRET in server/.env.');

  app.listen(port, () => {
    console.log(`ProbashiShield API listening on port ${port}`);
  });
}

module.exports = app;
