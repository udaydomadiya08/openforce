import crypto from 'node:crypto';

const KNOWN_INSECURE_SECRETS = new Set([
  'openforce_super_secret_production_key_9281729',
  'openforce_production_secret_key_change_in_production',
  'your_super_secret_jwt_key_here_change_for_production',
  'secret',
  'changeme',
  'password',
  'default',
  'jwt_secret'
]);

/**
 * Retrieve and validate the JWT secret.
 * Enforces strict security in production; allows designated dev secret in development/test.
 */
export function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction) {
    if (!secret || typeof secret !== 'string' || secret.trim() === '') {
      throw new Error(
        'FATAL: JWT_SECRET environment variable is missing or empty in production mode. Refusing to start.'
      );
    }
    const trimmed = secret.trim();
    if (KNOWN_INSECURE_SECRETS.has(trimmed) || trimmed.length < 32) {
      throw new Error(
        'FATAL: Insecure JWT_SECRET detected in production. Must be at least 32 characters and cannot be a known default. Refusing to start.'
      );
    }
    return trimmed;
  }

  // Development & testing mode
  return secret || 'openforce_dev_test_secret_only_not_for_prod';
}


/**
 * Hash a password using scrypt with a unique random salt
 */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `${salt}:${derivedKey.toString('hex')}`;
}

/**
 * Verify a plaintext password against a salt:hash string using constant-time comparison
 */
export function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(':')) {
    return false;
  }
  const [salt, key] = storedHash.split(':');
  const keyBuffer = Buffer.from(key, 'hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(keyBuffer, derivedKey);
}

/**
 * Base64URL encode a string or buffer
 */
function base64UrlEncode(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Base64URL decode
 */
function base64UrlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) {
    str += '=';
  }
  return Buffer.from(str, 'base64').toString('utf8');
}

/**
 * Generate a cryptographically signed JWT
 */
export function generateToken(payload, expiresInSeconds = null) {
  const defaultExp = Number(process.env.JWT_EXPIRES_IN_SECONDS) || 86400 * 7;
  const expiry = expiresInSeconds !== null ? expiresInSeconds : defaultExp;
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = {
    ...payload,
    iat: now,
    exp: now + expiry
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));

  const secret = getJwtSecret();
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

/**
 * Verify and decode a JWT token
 */
export function verifyToken(token) {
  if (!token || typeof token !== 'string') {
    return null;
  }
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  const secret = getJwtSecret();
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  if (signature !== expectedSignature) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return null; // Expired
    }
    return payload;
  } catch (e) {
    return null;
  }
}
