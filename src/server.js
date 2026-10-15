import { createApp } from './app.js';
import { runMigrations } from './db/migrate.js';
import { seedDatabase } from './db/seed.js';

const PORT = process.env.PORT || 3000;

// Ensure database migrations and initial seed are executed on startup
console.log('⚡ Starting OpenForce CRM...');
runMigrations();

// Auto-seed if flag or if database is brand new
if (process.env.AUTO_SEED !== 'false') {
  seedDatabase();
}

const app = createApp();

const server = app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 OpenForce CRM is running live at http://localhost:${PORT}`);
  console.log(`👤 Admin:     admin@openforce.local / AdminPass123!`);
  console.log(`💼 Sales Rep: sarah@openforce.local / SarahPass123!`);
  console.log(`====================================================`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nGracefully shutting down OpenForce...');
  server.close(() => {
    process.exit(0);
  });
});
