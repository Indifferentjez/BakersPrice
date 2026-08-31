import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import './db.js';
import { bootstrap as bootstrapIngredients } from './lib/masterIngredients.js';
import { attachUser } from './lib/auth.js';
import authRoutes from './routes/auth.js';
import parseRoutes from './routes/parse.js';
import recipeRoutes from './routes/recipes.js';
import masterIngredientRoutes from './routes/masterIngredients.js';
import defaultsRoutes from './routes/defaults.js';
import calibrationRoutes from './routes/calibrations.js';
import calcRoutes from './routes/calc.js';
import quoteRoutes from './routes/quotes.js';
import { llmAvailable } from './anthropic.js';

bootstrapIngredients(); // seed master_ingredients + migrate legacy prices on first run

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const app = express();
const PORT = process.env.PORT || 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
app.use(cookieParser(process.env.SESSION_SECRET || undefined));
app.use(express.json({ limit: '5mb' }));
app.use(attachUser);

app.get('/api/health', (_req, res) => res.json({ ok: true, llm: llmAvailable() }));

app.use('/api/auth', authRoutes);
app.use('/api/parse', parseRoutes);
app.use('/api/recipes', recipeRoutes);
app.use('/api/master-ingredients', masterIngredientRoutes);
app.use('/api/defaults', defaultsRoutes);
app.use('/api/calibrations', calibrationRoutes);
app.use('/api/calc', calcRoutes);
app.use('/api/quotes', quoteRoutes);

// Serve the built client in production; in dev the Vite server proxies here.
const clientDist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

const isTest = process.env.VITEST === 'true';
if (!isTest && process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  console.error('SESSION_SECRET is required in production');
  process.exit(1);
}
if (!isTest) {
  app.listen(PORT, () => {
    console.log(`bakers-price server on http://localhost:${PORT}  (LLM parsing: ${llmAvailable() ? 'on' : 'off — manual entry only'})`);
  });
}

export default app;
