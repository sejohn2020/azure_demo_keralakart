'use strict';

// ── npm packages ──────────────────────────────────────────────
const sql = require('mssql');
const { verifyRequest } = require('../shared/auth');

// ── Demo products — returned when SQL env vars are not set ───
// This lets the Function App work immediately after deploy,
// even before SQL is configured. Great for live demos!
const MOCK_PRODUCTS = [
    { id: 1, name: 'Kerala Banana Chips', price: 120, category: 'Snacks', inStock: true },
    { id: 2, name: 'Malabar Prawns', price: 450, category: 'Seafood', inStock: true },
    { id: 3, name: 'Coconut Oil (1L)', price: 220, category: 'Oils', inStock: false },
    { id: 4, name: 'Karimeen (Pearl Spot)', price: 580, category: 'Seafood', inStock: true },
    { id: 5, name: 'Tapioca (Kappa)', price: 35, category: 'Vegetables', inStock: true },
    { id: 6, name: 'Jackfruit Chips', price: 95, category: 'Snacks', inStock: true },
    { id: 7, name: 'Mango Pickle', price: 140, category: 'Condiments', inStock: true },
    { id: 8, name: 'Red Ripe Banana', price: 60, category: 'Fruits', inStock: true },
];

// ── SQL connection config (read from Function App settings) ──
function getSqlConfig() {
    return {
        server: process.env.SQL_SERVER,
        database: process.env.SQL_DATABASE,
        user: process.env.SQL_USER,
        password: process.env.SQL_PASSWORD,
        options: {
            encrypt: true,
            trustServerCertificate: false,
        },
        connectionTimeout: 15000,
        requestTimeout: 15000,
    };
}

// ── Auto-create products table + seed data on first run ──────
async function ensureTable(pool) {
    await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM sys.tables WHERE name = 'products'
    )
    BEGIN
      CREATE TABLE products (
        id        INT IDENTITY(1,1) PRIMARY KEY,
        name      NVARCHAR(200) NOT NULL,
        price     INT           NOT NULL,
        category  NVARCHAR(100) NULL,
        inStock   BIT           NOT NULL DEFAULT 1
      );

      INSERT INTO products (name, price, category, inStock) VALUES
        ('Kerala Banana Chips',   120, 'Snacks',     1),
        ('Malabar Prawns',        450, 'Seafood',    1),
        ('Coconut Oil (1L)',      220, 'Oils',       0),
        ('Karimeen (Pearl Spot)', 580, 'Seafood',    1),
        ('Tapioca (Kappa)',        35, 'Vegetables', 1),
        ('Jackfruit Chips',        95, 'Snacks',     1),
        ('Mango Pickle',          140, 'Condiments', 1),
        ('Red Ripe Banana',        60, 'Fruits',     1);
    END
  `);
}

// ── Main function handler ─────────────────────────────────────
module.exports = async function (context, req) {

    // CORS — allow all origins (Stage 01 — no restriction)
    context.res = {
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
    };

    // Handle CORS pre-flight
    if (req.method === 'OPTIONS') {
        context.res.status = 204;
        context.res.body = '';
        return;
    }

    // ── Require valid JWT ─────────────────────────────────────
    const user = verifyRequest(req);
    if (!user) {
        context.res.status = 401;
        context.res.body = { error: 'Unauthorized — please log in' };
        return;
    }
    context.log(`getProducts called by: ${user.username} (${user.role})`);

    // ── Return mock data when SQL is not configured ───────────
    if (!process.env.SQL_SERVER) {
        context.log('SQL_SERVER not configured — returning mock data');
        context.res.body = { source: 'mock', products: MOCK_PRODUCTS };
        return;
    }

    // ── Query Azure SQL ───────────────────────────────────────
    let pool;
    try {
        pool = await sql.connect(getSqlConfig());
        await ensureTable(pool);                          // idempotent — runs once

        const result = await pool.request()
            .query('SELECT id, name, price, category, inStock FROM products ORDER BY category, name');

        context.res.body = {
            source: 'sql',
            products: result.recordset,
        };

    } catch (err) {
        context.log.error('SQL error:', err.message);
        context.res.status = 500;
        context.res.body = { error: 'Database error', details: err.message };

    } finally {
        if (pool) {
            try { await pool.close(); } catch (_) { /* ignore */ }
        }
    }
};
