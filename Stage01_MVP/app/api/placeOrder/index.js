'use strict';
// =============================================================
//  KeralaKart — placeOrder Function
//  Trigger : POST /api/placeOrder
//  Body    : { items: [{ productId, name, price, qty }] }
//  Returns : { orderId, totalAmount, itemCount, source }
//
//  Auto-creates 'orders' + 'order_items' tables on first call.
//  Falls back to a mock orderId when SQL_SERVER is not configured.
// =============================================================

const sql = require('mssql');
const { verifyRequest } = require('../shared/auth');

const CORS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function getSqlConfig() {
    return {
        server: process.env.SQL_SERVER,
        database: process.env.SQL_DATABASE,
        user: process.env.SQL_USER,
        password: process.env.SQL_PASSWORD,
        options: { encrypt: true, trustServerCertificate: false },
        connectionTimeout: 15000,
        requestTimeout: 15000,
    };
}

async function ensureOrdersTables(pool) {
    await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'orders')
        BEGIN
            CREATE TABLE orders (
                id         INT IDENTITY(1,1) PRIMARY KEY,
                username   NVARCHAR(100) NOT NULL,
                total      INT           NOT NULL,
                status     NVARCHAR(50)  NOT NULL DEFAULT 'pending',
                created_at DATETIME      NOT NULL DEFAULT GETUTCDATE()
            );
            CREATE TABLE order_items (
                id         INT IDENTITY(1,1) PRIMARY KEY,
                order_id   INT           NOT NULL REFERENCES orders(id),
                product_id INT           NOT NULL DEFAULT 0,
                name       NVARCHAR(200) NOT NULL,
                price      INT           NOT NULL,
                qty        INT           NOT NULL DEFAULT 1
            );
        END
    `);
}

module.exports = async function (context, req) {
    context.res = { headers: CORS };

    if (req.method === 'OPTIONS') {
        context.res.status = 204;
        context.res.body = '';
        return;
    }

    const user = verifyRequest(req);
    if (!user) {
        context.res.status = 401;
        context.res.body = JSON.stringify({ error: 'Unauthorized' });
        return;
    }

    const { items } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
        context.res.status = 400;
        context.res.body = JSON.stringify({ error: 'Cart is empty' });
        return;
    }

    const total = items.reduce((sum, i) => sum + i.price * (i.qty || 1), 0);

    // ── Mock path (SQL not configured) ────────────────────────
    if (!process.env.SQL_SERVER) {
        context.res.status = 200;
        context.res.body = JSON.stringify({
            orderId: Math.floor(Math.random() * 90000) + 10000,
            totalAmount: total,
            itemCount: items.length,
            source: 'mock',
        });
        return;
    }

    // ── SQL path ──────────────────────────────────────────────
    const pool = await sql.connect(getSqlConfig());
    await ensureOrdersTables(pool);

    const result = await pool.request()
        .input('username', sql.NVarChar, user.username)
        .input('total', sql.Int, total)
        .query(`
            INSERT INTO orders (username, total, status)
            OUTPUT INSERTED.id
            VALUES (@username, @total, 'pending')
        `);

    const orderId = result.recordset[0].id;

    for (const item of items) {
        await pool.request()
            .input('order_id', sql.Int, orderId)
            .input('product_id', sql.Int, item.productId || 0)
            .input('name', sql.NVarChar, item.name)
            .input('price', sql.Int, item.price)
            .input('qty', sql.Int, item.qty || 1)
            .query(`
                INSERT INTO order_items (order_id, product_id, name, price, qty)
                VALUES (@order_id, @product_id, @name, @price, @qty)
            `);
    }

    context.res.status = 200;
    context.res.body = JSON.stringify({
        orderId,
        totalAmount: total,
        itemCount: items.length,
        source: 'sql',
    });
};
