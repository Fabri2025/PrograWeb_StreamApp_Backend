import dotenv from 'dotenv';
import { Pool } from 'pg';

// Cargar variables de entorno antes de crear el pool
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export const db = {
  query: (text: string, params?: any[]) => pool.query(text, params),
  getClient: () => pool.connect(),
};
