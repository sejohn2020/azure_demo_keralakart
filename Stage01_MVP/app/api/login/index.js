'use strict';

// =============================================================
//  KeralaKart — Login Function
//  File   : login/index.js
//  Trigger: POST /api/login
//  Body   : { "username": "...", "password": "..." }
//
//  Returns: { token, username, role }  on success
//           401 on bad credentials
//
//  Users are stored in the SQL 'users' table.
//  Passwords are hashed with bcrypt (never stored in plain text).
//  On first call, the table is auto-created and seeded with 3 demo users.
//
//  Demo users (pre-seeded):
//    john    / Kerala@2025  — role: customer
//    priya   / Kerala@2025  — role: customer
//    riyas   / Kerala@2025  — role: customer
// =============================================================

const sql = require('mssql');
const bcrypt = require('bcryptjs');
const { signToken } = require('../shared/auth');

// ── SQL config (same as getProducts) ─────────────────────────
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

// ── Seed 3 demo users with bcrypt-hashed passwords ───────────
// bcrypt.hashSync cost factor = 10 (good balance for demos)
async function ensureUsersTable(pool) {
    await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM sys.tables WHERE name = 'users'
    )
    BEGIN
      CREATE TABLE users (
        id           INT IDENTITY(1,1) PRIMARY KEY,
        username     NVARCHAR(100) NOT NULL UNIQUE,
        password_hash NVARCHAR(255) NOT NULL,
        role         NVARCHAR(50)  NOT NULL DEFAULT 'customer',
        created_at   DATETIME2     NOT NULL DEFAULT GETUTCDATE()
      );
    END
  `);

    // Seed demo users only if the table is empty
    const count = await pool.request()
        .query('SELECT COUNT(*) AS cnt FROM users');

    if (count.recordset[0].cnt === 0) {
        // Pre-compute hash (cost 10) — done at seed time, not per request
        const customerHash = bcrypt.hashSync('Kerala@2025', 10);

        const req = pool.request();
        req.input('customerHash', sql.NVarChar, customerHash);

        await req.query(`
      INSERT INTO users (username, password_hash, role) VALUES
        ('john',  @customerHash, 'customer'),
        ('priya', @customerHash, 'customer'),
        ('riyas', @customerHash, 'customer');
    `);
    }
}

// ── Main handler ──────────────────────────────────────────────
module.exports = async function (context, req) {

    // CORS headers — required for browser requests
    const corsHeaders = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
    };

    // Handle CORS pre-flight
    if (req.method === 'OPTIONS') {
        context.res = { status: 204, headers: corsHeaders, body: '' };
        return;
    }

    // Validate request body
    const { username, password } = req.body || {};
    if (!username || !password) {
        context.res = {
            status: 400,
            headers: corsHeaders,
            body: { error: 'username and password are required' },
        };
        return;
    }

    // ── Mock login — when SQL is not configured (early demo) ───
    if (!process.env.SQL_SERVER) {
        context.log('SQL not configured — using mock users');
        const MOCK_USERS = [
            { id: 1, username: 'john', password: 'Kerala@2025', role: 'customer' },
            { id: 2, username: 'priya', password: 'Kerala@2025', role: 'customer' },
            { id: 3, username: 'riyas', password: 'Kerala@2025', role: 'customer' },
        ];
        const found = MOCK_USERS.find(u => u.username === username && u.password === password);
        if (!found) {
            context.res = { status: 401, headers: corsHeaders, body: { error: 'Invalid username or password' } };
            return;
        }
        context.res = {
            status: 200,
            headers: corsHeaders,
            body: { token: signToken(found), username: found.username, role: found.role },
        };
        return;
    }

    // ── SQL login ─────────────────────────────────────────────
    let pool;
    try {
        pool = await sql.connect(getSqlConfig());
        await ensureUsersTable(pool);

        const req2 = pool.request();
        req2.input('username', sql.NVarChar, username);

        const result = await req2.query(
            'SELECT id, username, password_hash, role FROM users WHERE username = @username'
        );

        const user = result.recordset[0];

        // Use constant-time compare to avoid timing attacks
        const validPassword = user ? bcrypt.compareSync(password, user.password_hash) : false;

        if (!user || !validPassword) {
            context.res = { status: 401, headers: corsHeaders, body: { error: 'Invalid username or password' } };
            return;
        }

        context.res = {
            status: 200,
            headers: corsHeaders,
            body: {
                token: signToken({ id: user.id, username: user.username, role: user.role }),
                username: user.username,
                role: user.role,
            },
        };

    } catch (err) {
        context.log.error('Login SQL error:', err.message);
        context.res = {
            status: 500,
            headers: corsHeaders,
            body: { error: 'Server error', details: err.message },
        };
    } finally {
        if (pool) {
            try { await pool.close(); } catch (_) { /* ignore */ }
        }
    }
};
