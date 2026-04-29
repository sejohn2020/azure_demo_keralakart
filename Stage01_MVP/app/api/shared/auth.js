'use strict';

// =============================================================
//  KeralaKart — Stage 01 Auth Helper
//  File   : shared/auth.js
//  Purpose: JWT sign + verify, shared by all Function triggers.
//
//  JWT_SECRET is set as a Function App application setting.
//  It must be at least 32 characters long.
// =============================================================

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-before-deploy-keralakart-2025';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '8h';   // token valid for 8 hours

/**
 * Sign a JWT for the given user object.
 * @param {{ id: number, username: string, role: string }} user
 * @returns {string} signed JWT
 */
function signToken(user) {
    return jwt.sign(
        { sub: user.id, username: user.username, role: user.role },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES, algorithm: 'HS256' }
    );
}

/**
 * Verify the Bearer token from an Azure Function request.
 * Returns the decoded payload, or null if invalid / missing.
 *
 * Usage in a function handler:
 *   const user = verifyRequest(req);
 *   if (!user) { context.res = { status: 401, body: 'Unauthorized' }; return; }
 *
 * @param {object} req  Azure Function request object
 * @returns {{ sub, username, role } | null}
 */
function verifyRequest(req) {
    try {
        const authHeader = req.headers['authorization'] || '';
        if (!authHeader.startsWith('Bearer ')) return null;

        const token = authHeader.slice(7).trim();
        return jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    } catch {
        return null;
    }
}

module.exports = { signToken, verifyRequest };
