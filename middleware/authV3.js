const jwt = require('jsonwebtoken');
const pool = require('../config/db');

/**
 * JWT/OAuth Authentication Middleware for V3
 * Validates Bearer tokens and attaches user context to request
 */
async function authV3(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        code: 'NO_TOKEN' 
      });
    }

    const token = authHeader.slice(7);
    const jwtSecret = process.env.JWT_SECRET;
    
    if (!jwtSecret) {
      console.error('JWT_SECRET not configured');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, jwtSecret);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ 
          error: 'Token expired',
          code: 'TOKEN_EXPIRED'
        });
      }
      return res.status(401).json({ 
        error: 'Invalid token',
        code: 'INVALID_TOKEN'
      });
    }

    // Check if token is revoked
    const tokenCheckResult = await pool.query(
      `SELECT revoked FROM jwt_tokens 
       WHERE user_id = $1 AND token_hash = $2`,
      [decoded.userId, hashToken(token)]
    );

    if (tokenCheckResult.rows.length > 0 && tokenCheckResult.rows[0].revoked) {
      return res.status(401).json({ 
        error: 'Token revoked',
        code: 'TOKEN_REVOKED'
      });
    }

    // Fetch user and workspace data
    const userResult = await pool.query(
      `SELECT u.id, u.email, u.role, u.workspace_id, w.slug as workspace_slug
       FROM api_users u
       JOIN workspaces w ON u.workspace_id = w.id
       WHERE u.id = $1`,
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ 
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    const user = userResult.rows[0];

    // Attach user info to request
    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      workspaceId: user.workspace_id,
      workspaceSlug: user.workspace_slug,
      tokenSub: decoded.sub
    };

    next();
  } catch (error) {
    console.error('Auth error:', error);
    res.status(500).json({ error: 'Authorization error' });
  }
}

/**
 * Simple token hash for storage and comparison
 */
function hashToken(token) {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(token).digest('hex');
}

module.exports = authV3;
