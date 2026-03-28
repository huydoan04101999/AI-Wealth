import express from "express";
import { sql } from "./db.js";
import "dotenv/config";

const app = express();
app.use(express.json());

// Middleware to check authentication
const requireAuth = (req: any, res: any, next: any) => {
  const userId = req.headers['x-user-id'];
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  req.userId = userId;
  next();
};

// User Management Routes (Admin only)
const requireAdmin = (req: any, res: any, next: any) => {
  const role = req.headers['x-user-role'];
  if (role !== 'admin') {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
};

// Cache for Bitcoin data to avoid rate limiting
let btcStatsCache: { data: any, timestamp: number } | null = null;
const CACHE_DURATION = 60000; // 1 minute

app.get("/api/crypto/btc/stats", async (req, res) => {
  const now = Date.now();
  if (btcStatsCache && (now - btcStatsCache.timestamp < CACHE_DURATION)) {
    return res.json(btcStatsCache.data);
  }

  try {
    const response = await fetch('https://api.coingecko.com/api/v3/coins/bitcoin?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false');
    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status}`);
    }
    const data = await response.json();
    btcStatsCache = { data, timestamp: now };
    res.json(data);
  } catch (error) {
    console.error("Error fetching BTC stats from CoinGecko:", error);
    // If cache exists, return it even if expired as fallback
    if (btcStatsCache) {
      return res.json(btcStatsCache.data);
    }
    res.status(500).json({ error: "Failed to fetch BTC stats" });
  }
});

app.get("/api/crypto/btc/ohlc", async (req, res) => {
  const { timeframe } = req.query;
  try {
    const response = await fetch(`https://api.coingecko.com/api/v3/coins/bitcoin/ohlc?vs_currency=usd&days=${timeframe || '7'}`);
    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status}`);
    }
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error("Error fetching BTC OHLC from CoinGecko:", error);
    res.status(500).json({ error: "Failed to fetch BTC OHLC data" });
  }
});

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

// Asset Definitions Routes
app.get("/api/portfolio/assets", requireAuth, async (req: any, res) => {
  if (!process.env.POSTGRES_URL) return res.json([]);
  try {
    const { rows } = await sql`SELECT * FROM asset_definitions WHERE user_id = ${req.userId} ORDER BY category, name`;
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post("/api/portfolio/assets", requireAuth, async (req: any, res) => {
  if (!process.env.POSTGRES_URL) return res.status(500).json({ error: "No DB" });
  try {
    const { category, name, current_price } = req.body;
    const symbol = name.toUpperCase().trim();
    
    // Get existing price history if any
    const { rows: existing } = await sql`SELECT price_history FROM asset_definitions WHERE symbol = ${symbol} AND user_id = ${req.userId}`;
    let priceHistory = [];
    if (existing.length > 0 && existing[0].price_history) {
      try {
        priceHistory = JSON.parse(existing[0].price_history);
      } catch (e) {
        priceHistory = [];
      }
    }
    
    // Add new entry to history
    priceHistory.push({
      price: current_price,
      date: new Date().toISOString()
    });

    await sql`
      INSERT INTO asset_definitions (category, name, symbol, current_price, price_history, user_id)
      VALUES (${category}, ${name}, ${symbol}, ${current_price}, ${JSON.stringify(priceHistory)}, ${req.userId})
      ON CONFLICT (symbol, user_id) DO UPDATE SET 
        current_price = EXCLUDED.current_price,
        price_history = EXCLUDED.price_history,
        name = EXCLUDED.name,
        updated_at = CURRENT_TIMESTAMP
    `;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.delete("/api/portfolio/assets/:id", requireAuth, async (req: any, res) => {
  if (!process.env.POSTGRES_URL) return res.status(500).json({ error: "No DB" });
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
    await sql`DELETE FROM asset_definitions WHERE id = ${id} AND user_id = ${req.userId}`;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.put("/api/portfolio/assets/:id", requireAuth, async (req: any, res) => {
  if (!process.env.POSTGRES_URL) return res.status(500).json({ error: "No DB" });
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
    const { category, name, current_price } = req.body;
    const symbol = name.toUpperCase().trim();
    
    // Get existing price history if any
    const { rows: existingAsset } = await sql`SELECT price_history FROM asset_definitions WHERE id = ${id} AND user_id = ${req.userId}`;
    let priceHistory = [];
    if (existingAsset.length > 0 && existingAsset[0].price_history) {
      try {
        priceHistory = JSON.parse(existingAsset[0].price_history);
      } catch (e) {
        priceHistory = [];
      }
    }
    
    // Add new entry to history if price changed
    priceHistory.push({
      price: current_price,
      date: new Date().toISOString()
    });

    // Check if symbol already exists for another asset of the same user
    const { rows: existing } = await sql`SELECT * FROM asset_definitions WHERE symbol = ${symbol} AND id != ${id} AND user_id = ${req.userId}`;
    if (existing.length > 0) {
      return res.status(400).json({ error: "Tên loại tài sản này đã tồn tại." });
    }

    await sql`
      UPDATE asset_definitions 
      SET category = ${category}, 
          name = ${name}, 
          symbol = ${symbol}, 
          current_price = ${current_price},
          price_history = ${JSON.stringify(priceHistory)},
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id} AND user_id = ${req.userId}
    `;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// API Routes
app.get("/api/portfolio/transactions", requireAuth, async (req: any, res) => {
  if (!process.env.POSTGRES_URL) {
    return res.status(500).json({ error: "POSTGRES_URL is not configured." });
  }
  try {
    // Create tables if not exist with user_id
    await sql`
      CREATE TABLE IF NOT EXISTS asset_definitions (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255),
        category VARCHAR(50), 
        name VARCHAR(255),
        symbol VARCHAR(255),
        current_price NUMERIC DEFAULT 0,
        price_history TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(symbol, user_id)
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255),
        asset_type VARCHAR(50),
        asset_symbol VARCHAR(255),
        transaction_type VARCHAR(50),
        amount NUMERIC,
        price_per_unit NUMERIC,
        interest_rate NUMERIC DEFAULT 0,
        term INTEGER DEFAULT 0,
        currency VARCHAR(10) DEFAULT 'USD',
        date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    
    // Add user_id columns if they don't exist, or alter them to VARCHAR(255)
    try { await sql`ALTER TABLE asset_definitions ADD COLUMN user_id VARCHAR(255);`; } catch (e) {}
    try { await sql`ALTER TABLE asset_definitions ALTER COLUMN user_id TYPE VARCHAR(255);`; } catch (e) {}
    try { await sql`ALTER TABLE asset_definitions ADD COLUMN price_history TEXT;`; } catch (e) {}
    try { await sql`ALTER TABLE transactions ADD COLUMN user_id VARCHAR(255);`; } catch (e) {}
    try { await sql`ALTER TABLE transactions ALTER COLUMN user_id TYPE VARCHAR(255);`; } catch (e) {}
    try { await sql`ALTER TABLE transactions ADD COLUMN term INTEGER DEFAULT 0;`; } catch (e) {}
    try { await sql`ALTER TABLE cash_flows ADD COLUMN user_id VARCHAR(255);`; } catch (e) {}
    try { await sql`ALTER TABLE cash_flows ALTER COLUMN user_id TYPE VARCHAR(255);`; } catch (e) {}
    try { await sql`ALTER TABLE asset_definitions ADD CONSTRAINT unique_symbol_user UNIQUE (symbol, user_id);`; } catch (e) {}

    await sql`
      CREATE TABLE IF NOT EXISTS cash_flows (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255),
        type VARCHAR(50),
        category VARCHAR(100),
        amount NUMERIC,
        currency VARCHAR(10),
        date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        description TEXT
      );
    `;

    const { rows } = await sql`SELECT * FROM transactions WHERE user_id = ${req.userId} ORDER BY date DESC`;
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post("/api/portfolio/transactions", requireAuth, async (req: any, res) => {
  if (!process.env.POSTGRES_URL) {
    return res.status(500).json({ error: "POSTGRES_URL is not configured." });
  }
  try {
    const { asset_type, asset_symbol, transaction_type, amount, price_per_unit, interest_rate, term, currency, date } = req.body;
    const safeAmount = amount === "" ? 0 : amount;
    const safePrice = price_per_unit === "" ? 0 : price_per_unit;
    const safeInterest = interest_rate === "" ? 0 : interest_rate;
    const safeTerm = term === "" ? 0 : term;
    
    await sql`
      INSERT INTO transactions (user_id, asset_type, asset_symbol, transaction_type, amount, price_per_unit, interest_rate, term, currency, date)
      VALUES (${req.userId}, ${asset_type}, ${asset_symbol}, ${transaction_type}, ${safeAmount}, ${safePrice}, ${safeInterest || 0}, ${safeTerm || 0}, ${currency || 'USD'}, ${date || new Date()})
    `;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.put("/api/portfolio/transactions/:id", requireAuth, async (req: any, res) => {
  if (!process.env.POSTGRES_URL) return res.status(500).json({ error: "No DB" });
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
    const { asset_type, asset_symbol, transaction_type, amount, price_per_unit, interest_rate, term, currency, date } = req.body;
    const safeAmount = amount === "" ? 0 : amount;
    const safePrice = price_per_unit === "" ? 0 : price_per_unit;
    const safeInterest = interest_rate === "" ? 0 : interest_rate;
    const safeTerm = term === "" ? 0 : term;

    await sql`
      UPDATE transactions 
      SET asset_type = ${asset_type}, 
          asset_symbol = ${asset_symbol}, 
          transaction_type = ${transaction_type}, 
          amount = ${safeAmount}, 
          price_per_unit = ${safePrice}, 
          interest_rate = ${safeInterest || 0}, 
          term = ${safeTerm || 0},
          currency = ${currency}, 
          date = ${date}
      WHERE id = ${id} AND user_id = ${req.userId}
    `;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.delete("/api/portfolio/transactions/:id", requireAuth, async (req: any, res) => {
  if (!process.env.POSTGRES_URL) return res.status(500).json({ error: "No DB" });
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
    await sql`DELETE FROM transactions WHERE id = ${id} AND user_id = ${req.userId}`;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Cash Flow Routes
app.get("/api/cashflow", requireAuth, async (req: any, res) => {
  if (!process.env.POSTGRES_URL) return res.json([]);
  try {
    const { rows } = await sql`SELECT * FROM cash_flows WHERE user_id = ${req.userId} ORDER BY date DESC`;
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post("/api/cashflow", requireAuth, async (req: any, res) => {
  if (!process.env.POSTGRES_URL) return res.status(500).json({ error: "No DB" });
  try {
    const { type, category, amount, currency, description, date } = req.body;
    await sql`
      INSERT INTO cash_flows (user_id, type, category, amount, currency, description, date)
      VALUES (${req.userId}, ${type}, ${category}, ${amount}, ${currency}, ${description}, ${date || new Date()})
    `;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.put("/api/cashflow/:id", requireAuth, async (req: any, res) => {
  if (!process.env.POSTGRES_URL) return res.status(500).json({ error: "No DB" });
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
    const { type, category, amount, currency, description, date } = req.body;
    await sql`
      UPDATE cash_flows 
      SET type = ${type}, 
          category = ${category}, 
          amount = ${amount}, 
          currency = ${currency}, 
          description = ${description}, 
          date = ${date}
      WHERE id = ${id} AND user_id = ${req.userId}
    `;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.delete("/api/cashflow/:id", requireAuth, async (req: any, res) => {
  if (!process.env.POSTGRES_URL) return res.status(500).json({ error: "No DB" });
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
    await sql`DELETE FROM cash_flows WHERE id = ${id} AND user_id = ${req.userId}`;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Backup & Restore Routes (Admin only)
app.get("/api/backup", requireAuth, requireAdmin, async (req: any, res) => {
  if (!process.env.POSTGRES_URL) return res.status(500).json({ error: "No DB" });
  try {
    const { rows: assets } = await sql`SELECT * FROM asset_definitions WHERE user_id = ${req.userId}`;
    const { rows: transactions } = await sql`SELECT * FROM transactions WHERE user_id = ${req.userId}`;
    const { rows: cash_flows } = await sql`SELECT * FROM cash_flows WHERE user_id = ${req.userId}`;
    
    const backupData = {
      timestamp: new Date().toISOString(),
      version: "1.0",
      data: {
        asset_definitions: assets,
        transactions,
        cash_flows
      }
    };
    
    res.json(backupData);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post("/api/restore", requireAuth, requireAdmin, async (req: any, res) => {
  if (!process.env.POSTGRES_URL) return res.status(500).json({ error: "No DB" });
  try {
    const { data } = req.body;
    if (!data) return res.status(400).json({ error: "Invalid backup data" });

    // Begin transaction manually
    await sql`BEGIN`;

    try {
      // Clear existing data for this user
      await sql`DELETE FROM transactions WHERE user_id = ${req.userId}`;
      await sql`DELETE FROM cash_flows WHERE user_id = ${req.userId}`;
      await sql`DELETE FROM asset_definitions WHERE user_id = ${req.userId}`;

      // Restore asset_definitions
      if (data.asset_definitions && data.asset_definitions.length > 0) {
        for (const item of data.asset_definitions) {
          await sql`
            INSERT INTO asset_definitions (category, name, symbol, current_price, updated_at, user_id)
            VALUES (${item.category}, ${item.name}, ${item.symbol}, ${item.current_price}, ${item.updated_at || new Date()}, ${req.userId})
          `;
        }
      }

      // Restore transactions
      if (data.transactions && data.transactions.length > 0) {
        for (const item of data.transactions) {
          await sql`
            INSERT INTO transactions (user_id, asset_type, asset_symbol, transaction_type, amount, price_per_unit, interest_rate, currency, date)
            VALUES (${req.userId}, ${item.asset_type}, ${item.asset_symbol}, ${item.transaction_type}, ${item.amount}, ${item.price_per_unit}, ${item.interest_rate || 0}, ${item.currency || 'USD'}, ${item.date || new Date()})
          `;
        }
      }

      // Restore cash_flows
      if (data.cash_flows && data.cash_flows.length > 0) {
        for (const item of data.cash_flows) {
          await sql`
            INSERT INTO cash_flows (user_id, type, category, amount, currency, description, date)
            VALUES (${req.userId}, ${item.type}, ${item.category}, ${item.amount}, ${item.currency}, ${item.description}, ${item.date || new Date()})
          `;
        }
      }

      await sql`COMMIT`;
    } catch (err) {
      await sql`ROLLBACK`;
      throw err;
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

export default app;
