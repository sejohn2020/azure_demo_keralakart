'use strict';
// =============================================================
//  KeralaKart — processPayment Function
//  Trigger : POST /api/processPayment
//  Body    : { orderId, totalAmount }
//  Returns : { status, orderId, transactionId, totalAmount }
//
//  Simulates a 1.5 s payment gateway delay.
//  Teaching point: "This latency is exactly why production systems
//  use async patterns — Queue trigger, Event Grid, etc.
//  In Stage 04 this becomes a proper event-driven webhook."
//
//  Updates orders.status = 'paid' in SQL when configured.
//  Works with mock orderId too (SQL_SERVER not set).
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

const sleep = ms => new Promise(r => setTimeout(r, ms));

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

    const { orderId, totalAmount } = req.body || {};
    if (!orderId) {
        context.res.status = 400;
        context.res.body = JSON.stringify({ error: 'orderId is required' });
        return;
    }

    // Simulate payment gateway latency (teaching moment)
    await sleep(1500);

    const transactionId = 'TXN' + Date.now();

    // Update order status in SQL if configured
    if (process.env.SQL_SERVER) {
        const pool = await sql.connect(getSqlConfig());
        await pool.request()
            .input('orderId', sql.Int, orderId)
            .query(`UPDATE orders SET status = 'paid' WHERE id = @orderId`);
    }

    context.res.status = 200;
    context.res.body = JSON.stringify({
        status: 'paid',
        orderId,
        transactionId,
        totalAmount,
        source: process.env.SQL_SERVER ? 'sql' : 'mock',
    });
};
