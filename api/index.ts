import express from "express";
import { sql } from "../db.js";
import "dotenv/config";

const app = express();
app.use(express.json());

// Health check
app.get("/api/health", async (req, res) => {
  let dbStatus = "unknown";
  let dbError = null;
  
  if (process.env.POSTGRES_URL) {
    try {
      await sql`SELECT 1`;
      dbStatus = "connected";
    } catch (e: any) {
      dbStatus = "error";
      dbError = e.message;
    }
  } else {
    dbStatus = "missing_url";
  }

  res.json({ 
    status: "ok", 
    database: dbStatus,
    databaseError: dbError,
    env: { 
      POSTGRES_URL_SET: !!process.env.POSTGRES_URL,
      NODE_ENV: process.env.NODE_ENV
    } 
  });
});

// API Routes
app.get("/api/portfolio/transactions", async (req, res) => {
  if (!process.env.POSTGRES_URL) {
    return res.status(500).json({ error: "POSTGRES_URL is not configured." });
  }
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        asset_type VARCHAR(50),
        asset_symbol VARCHAR(255),
        transaction_type VARCHAR(50),
        amount NUMERIC,
        price_per_unit NUMERIC,
        interest_rate NUMERIC DEFAULT 0,
        date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    
    try {
      await sql`ALTER TABLE transactions ADD COLUMN interest_rate NUMERIC DEFAULT 0;`;
    } catch (e) {}

    await sql`
      CREATE TABLE IF NOT EXISTS asset_prices (
        asset_symbol VARCHAR(255) PRIMARY KEY,
        current_price NUMERIC,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS cash_flows (
        id SERIAL PRIMARY KEY,
        type VARCHAR(50),
        category VARCHAR(100),
        amount NUMERIC,
        currency VARCHAR(10),
        date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        description TEXT
      );
    `;

    const { rows } = await sql`SELECT * FROM transactions ORDER BY date DESC`;
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post("/api/portfolio/transactions", async (req, res) => {
  if (!process.env.POSTGRES_URL) {
    return res.status(500).json({ error: "POSTGRES_URL is not configured." });
  }
  try {
    const { asset_type, asset_symbol, transaction_type, amount, price_per_unit, interest_rate } = req.body;
    await sql`
      INSERT INTO transactions (asset_type, asset_symbol, transaction_type, amount, price_per_unit, interest_rate)
      VALUES (${asset_type}, ${asset_symbol}, ${transaction_type}, ${amount}, ${price_per_unit}, ${interest_rate || 0})
    `;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.get("/api/portfolio/prices", async (req, res) => {
  if (!process.env.POSTGRES_URL) return res.json({});
  try {
    const { rows } = await sql`SELECT * FROM asset_prices`;
    const prices: Record<string, number> = {};
    rows.forEach(r => prices[r.asset_symbol] = parseFloat(r.current_price));
    res.json(prices);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post("/api/portfolio/prices", async (req, res) => {
  if (!process.env.POSTGRES_URL) return res.status(500).json({ error: "No DB" });
  try {
    const { asset_symbol, current_price } = req.body;
    await sql`
      INSERT INTO asset_prices (asset_symbol, current_price)
      VALUES (${asset_symbol}, ${current_price})
      ON CONFLICT (asset_symbol) DO UPDATE SET current_price = EXCLUDED.current_price, updated_at = CURRENT_TIMESTAMP
    `;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Cash Flow Routes
app.get("/api/cashflow", async (req, res) => {
  if (!process.env.POSTGRES_URL) return res.json([]);
  try {
    const { rows } = await sql`SELECT * FROM cash_flows ORDER BY date DESC`;
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post("/api/cashflow", async (req, res) => {
  if (!process.env.POSTGRES_URL) return res.status(500).json({ error: "No DB" });
  try {
    const { type, category, amount, currency, description } = req.body;
    await sql`
      INSERT INTO cash_flows (type, category, amount, currency, description)
      VALUES (${type}, ${category}, ${amount}, ${currency}, ${description})
    `;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

export default app;
