import fs from 'fs';
import path from 'path';
import { initDb, getPool, isDbConnected } from './connection';
import { logger } from '../utils/logger';

export const runMigrations = async () => {
  if (!isDbConnected) {
    logger.warn('Skipping migrations because DB is not connected');
    return;
  }

  const pool = getPool();
  const sqlDir = path.join(__dirname, '../../sql');

  try {
    const files = fs.readdirSync(sqlDir).filter(f => f.endsWith('.sql')).sort();
    
    for (const file of files) {
      logger.info(`Running migration: ${file}`);
      const filePath = path.join(sqlDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');
      
      await pool.query(sql);
      logger.info(`Migration ${file} completed successfully`);
    }
    
    logger.info('All migrations completed');
  } catch (err: any) {
    logger.error('Migration failed', { error: err.message });
    throw err;
  }
};

// If run directly
if (require.main === module) {
  (async () => {
    await initDb();
    await runMigrations();
    process.exit(0);
  })();
}
