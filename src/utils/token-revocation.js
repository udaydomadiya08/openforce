import crypto from 'node:crypto';

/**
 * Hash a JWT string with SHA-256 for compact and indexed storage
 */
export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Revoke a token by adding its hash and expiration timestamp to the database
 */
export function revokeToken(db, token) {
  if (!token || typeof token !== 'string') return;
  const tokenHash = hashToken(token);

  let exp = Math.floor(Date.now() / 1000) + 86400 * 7;
  try {
    const parts = token.split('.');
    if (parts.length === 3) {
      let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      const payload = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
      if (payload.exp) exp = payload.exp;
    }
  } catch (e) {
    // fallback to default exp
  }

  try {
    db.run(
      'INSERT OR REPLACE INTO revoked_tokens (token_hash, expires_at) VALUES (?, ?)',
      [tokenHash, exp]
    );
    cleanupRevokedTokens(db);
  } catch (err) {
    console.error('Failed to record revoked token:', err);
  }
}

/**
 * Prune expired revoked tokens from the database to prevent storage creep
 */
export function cleanupRevokedTokens(db) {
  if (!db) return;
  const now = Math.floor(Date.now() / 1000);
  try {
    db.run('DELETE FROM revoked_tokens WHERE expires_at <= ?', [now]);
  } catch (err) {
    // If table doesn't exist yet, ignore
  }
}

/**
 * Check whether a token has been revoked
 */
export function isTokenRevoked(db, token) {
  if (!token || typeof token !== 'string') return true;
  const tokenHash = hashToken(token);
  const now = Math.floor(Date.now() / 1000);

  try {
    const found = db.get(
      'SELECT 1 FROM revoked_tokens WHERE token_hash = ? AND expires_at > ?',
      [tokenHash, now]
    );
    return Boolean(found);
  } catch (err) {
    // If table doesn't exist yet (e.g. before migration), token is not revoked
    return false;
  }
}
