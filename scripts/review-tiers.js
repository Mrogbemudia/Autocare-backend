// Run daily (Render cron job or manually): node scripts/review-tiers.js
import { pool } from '../src/db.js';
import { reviewAllProviders } from '../src/services/grading.service.js';

reviewAllProviders()
  .then((s) => console.log('Tier review done:', s))
  .catch((e) => { console.error('Tier review failed:', e.message); process.exitCode = 1; })
  .finally(() => pool.end());
