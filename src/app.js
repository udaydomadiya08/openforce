import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Modules
import authRoutes from './modules/auth/routes.js';
import orgRoutes from './modules/orgs/routes.js';
import accountsRoutes from './modules/accounts/routes.js';
import contactsRoutes from './modules/contacts/routes.js';
import leadsRoutes from './modules/leads/routes.js';
import opportunitiesRoutes from './modules/opportunities/routes.js';
import activitiesRoutes from './modules/activities/routes.js';
import reportsRoutes from './modules/reports/routes.js';
import searchRoutes from './modules/search/routes.js';
import csvRoutes from './modules/csv/routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp(customDb = null) {
  const app = express();

  // Middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Attach db to request if custom db provided (e.g. for testing)
  if (customDb) {
    app.use((req, res, next) => {
      req.db = customDb;
      next();
    });
  }

  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'healthy', version: '1.0.0', timestamp: new Date().toISOString() });
  });

  // API Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/org', orgRoutes);
  if (accountsRoutes) app.use('/api/accounts', accountsRoutes);
  if (contactsRoutes) app.use('/api/contacts', contactsRoutes);
  if (leadsRoutes) app.use('/api/leads', leadsRoutes);
  if (opportunitiesRoutes) app.use('/api/opportunities', opportunitiesRoutes);
  if (activitiesRoutes) app.use('/api/activities', activitiesRoutes);
  if (reportsRoutes) app.use('/api/reports', reportsRoutes);
  if (searchRoutes) app.use('/api/search', searchRoutes);
  if (csvRoutes) app.use('/api/csv', csvRoutes);

  // Serve static assets from public directory
  const publicDir = path.join(__dirname, '../public');
  app.use(express.static(publicDir));

  // SPA fallback for HTML5 history API
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/health')) {
      return next();
    }
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  // Global Error Handler
  app.use((err, req, res, next) => {
    console.error('Unhandled Server Error:', err);
    res.status(err.status || 500).json({
      error: err.message || 'Internal Server Error'
    });
  });

  return app;
}
