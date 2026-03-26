import { Pool } from 'pg';
import "dotenv/config";

export const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: process.env.POSTGRES_URL && !process.env.POSTGRES_URL.includes('localhost') 
    ? { rejectUnauthorized: false } 
    : false
});

export async function sql(strings: TemplateStringsArray, ...values: any[]) {
  const query = strings.reduce((acc, str, i) => acc + str + (i < values.length ? `$${i + 1}` : ''), '');
  return pool.query(query, values);
}
