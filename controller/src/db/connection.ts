import { Pool } from 'pg';
import { config } from '../config';
import { logger } from '../utils/logger';

export let pool: Pool;
export let isDbConnected = false;

export const initDb = async () => {
  pool = new Pool({
    host: config.db.host,
    port: config.db.port,
    database: config.db.database,
    user: config.db.user,
    password: config.db.password,
    // Add some reasonable timeouts
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
  });

  try {
    const client = await pool.connect();
    client.release();
    isDbConnected = true;
    logger.info('Connected to PostgreSQL successfully');
  } catch (err: any) {
    logger.error('Failed to connect to PostgreSQL, running in memory-only mode for persistence', { error: err.message });
    isDbConnected = false;
  }
};

export const getPool = () => pool;
