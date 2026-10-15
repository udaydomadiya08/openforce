import { createApp } from './app.js';
import { runMigrations } from './db/migrate.js';
import { seedDatabase } from './db/seed.js';
import { getJwtSecret } from './utils/crypto.js';

const PORT = process.env.PORT || 3000;

// Security check: validate JWT_SECRET configuration immediately
getJwtSecret();

console.log('⚡ Starting OpenForce CRM...');
runMigrations();

// Demo seeding requires explicit opt-in (disabled by default in production)
const isAutoSeedEnabled = process.env.AUTO_SEED === 'true';
if (isAutoSeedEnabled) {
  seedDatabase();
}

const app = createApp();

const server = app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 OpenForce CRM is running live at http://localhost:${PORT}`);
  if (isAutoSeedEnabled) {
    console.log(`👤 Demo Admin:     admin@openforce.local / AdminPass123!`);
    console.log(`💼 Demo Sales Rep: sarah@openforce.local / SarahPass123!`);
  } else {
    console.log(`🔒 Production Mode: Demo seeding disabled.`);
  }
  console.log(`====================================================`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nGracefully shutting down OpenForce...');
  server.close(() => {
    process.exit(0);
  });
});
