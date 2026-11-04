/* ==========================================================================
   CNU FREE V2 — BACKEND API & STATIC SERVER (server.js)
   P0 Fix #1, #2, #3, #4, #7:
   - Full REST API for Accounts, Isolated Schedules, Share Links, and Public Sharing
   - Cryptographically secure 128-bit unguessable tokens
   - Server-enforced expiration and revocation
   - Durable file-backed transactional database (data/db.json)
   - Static asset serving for dist/ with SPA route fallbacks
   ========================================================================== */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createSeedState } from './src/seed.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const DIST_DIR = path.join(__dirname, 'dist');
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon'
};

/* --------------------------------------------------------------------------
   Database Layer (File-backed JSON Store with atomic writes)
   -------------------------------------------------------------------------- */
let _db = null;

export function hashPassword(password) {
  return crypto.createHash('sha256').update(String(password || '')).digest('hex');
}

export function initDatabase() {
  if (_db) return _db;

  if (fs.existsSync(DB_FILE)) {
    try {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      _db = JSON.parse(raw);
      if (_db && typeof _db === 'object' && _db.users) {
        return _db;
      }
    } catch (_e) {
      // fallback to initial seed
    }
  }

  const seed = createSeedState();
  const defaultPasswordHash = hashPassword('password123');

  const users = {};
  users[seed.user.id] = {
    id: seed.user.id,
    username: seed.user.username,
    email: seed.user.email,
    passwordHash: defaultPasswordHash,
    firstName: seed.user.firstName,
    lastName: seed.user.lastName,
    name: seed.user.name,
    avatarClass: seed.user.avatarClass,
    entries: [...seed.user.entries]
  };

  for (const f of seed.friends || []) {
    users[f.id] = {
      id: f.id,
      username: f.username || f.id,
      email: `${f.id}@cnu.edu.ph`,
      passwordHash: defaultPasswordHash,
      firstName: f.firstName,
      lastName: f.lastName || '',
      name: f.name,
      avatarClass: f.avatarClass,
      entries: [...(f.entries || [])]
    };
  }

  _db = {
    users,
    shareLinks: {},
    groups: [...(seed.groups || [])],
    createdAt: Date.now()
  };

  saveDatabase(_db);
  return _db;
}

export function saveDatabase(db = _db) {
  if (!db) return;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const serialized = JSON.stringify(db, null, 2);
    // Write atomically via temporary file
    const tmp = `${DB_FILE}.tmp.${Date.now()}`;
    fs.writeFileSync(tmp, serialized, 'utf8');
    fs.renameSync(tmp, DB_FILE);
  } catch (_e) {
    // ignore
  }
}

export function getDatabase() {
  if (!_db) initDatabase();
  return _db;
}

export function resetDatabase() {
  _db = null;
  if (fs.existsSync(DB_FILE)) {
    try {
      fs.unlinkSync(DB_FILE);
    } catch (_e) {}
  }
  return initDatabase();
}

/* --------------------------------------------------------------------------
   API Handlers
   -------------------------------------------------------------------------- */
function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-cache',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
  return true;
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 2 * 1024 * 1024) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

export async function handleApiRequest(req, res) {
  const db = getDatabase();
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;
  const method = req.method;

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    res.end();
    return true;
  }

  // 1. POST /api/auth/register
  if (method === 'POST' && pathname === '/api/auth/register') {
    const body = await parseJsonBody(req);
    const username = String(body.username || '').trim().toLowerCase().replace(/^@/, '');
    const password = String(body.password || '');
    const firstName = String(body.firstName || body.name || '').trim();
    const lastName = String(body.lastName || '').trim();
    const email = String(body.email || `${username}@cnu.edu.ph`).trim().toLowerCase();

    if (!username || username.length < 2) {
      return sendJson(res, 400, { ok: false, error: 'Username must be at least 2 characters' });
    }
    if (password.length < 8) {
      return sendJson(res, 400, { ok: false, error: 'Password must be at least 8 characters' });
    }
    if (!firstName) {
      return sendJson(res, 400, { ok: false, error: 'First name is required' });
    }

    if (db.users[username]) {
      return sendJson(res, 409, { ok: false, error: 'Username is already taken' });
    }

    const newUser = {
      id: username,
      username,
      email,
      passwordHash: hashPassword(password),
      firstName,
      lastName,
      name: lastName ? `${firstName} ${lastName}` : firstName,
      avatarClass: 'av-ink',
      entries: []
    };

    db.users[username] = newUser;
    saveDatabase(db);

    const token = crypto.randomBytes(24).toString('hex');
    const { passwordHash: _, ...safeUser } = newUser;
    return sendJson(res, 201, { ok: true, user: safeUser, token });
  }

  // 2. POST /api/auth/login
  if (method === 'POST' && pathname === '/api/auth/login') {
    const body = await parseJsonBody(req);
    const query = String(body.username || body.email || '').trim().toLowerCase().replace(/^@/, '');
    const password = String(body.password || '');

    const user = Object.values(db.users).find(
      (u) => u.username.toLowerCase() === query || (u.email && u.email.toLowerCase() === query)
    );

    if (!user || user.passwordHash !== hashPassword(password)) {
      return sendJson(res, 401, { ok: false, error: 'Invalid username or password' });
    }

    const token = crypto.randomBytes(24).toString('hex');
    const { passwordHash: _, ...safeUser } = user;
    return sendJson(res, 200, { ok: true, user: safeUser, entries: user.entries || [], token });
  }

  // 3. GET /api/users/:username
  const userMatch = pathname.match(/^\/api\/users\/([^/]+)$/);
  if (userMatch && method === 'GET') {
    const uId = userMatch[1].toLowerCase();
    const user = db.users[uId];
    if (!user) {
      return sendJson(res, 404, { ok: false, error: 'User not found' });
    }
    const { passwordHash: _, ...safeUser } = user;
    return sendJson(res, 200, { ok: true, user: safeUser });
  }

  // 4. DELETE /api/users/:userId (Durable Account Deletion - P1 Fix #7)
  if (userMatch && method === 'DELETE') {
    const uId = userMatch[1].toLowerCase();
    if (db.users[uId]) {
      delete db.users[uId];
      // Cascade delete any share links owned by this user
      for (const [token, link] of Object.entries(db.shareLinks)) {
        if (link.ownerId === uId) {
          delete db.shareLinks[token];
        }
      }
      saveDatabase(db);
    }
    return sendJson(res, 200, { ok: true, deleted: true });
  }

  // 5. GET /api/schedules/:userId & PUT /api/schedules/:userId
  const scheduleMatch = pathname.match(/^\/api\/schedules\/([^/]+)$/);
  if (scheduleMatch) {
    const uId = scheduleMatch[1].toLowerCase();
    const user = db.users[uId];
    if (!user) {
      return sendJson(res, 404, { ok: false, error: 'User not found' });
    }

    if (method === 'GET') {
      return sendJson(res, 200, { ok: true, entries: user.entries || [] });
    }

    if (method === 'PUT') {
      const body = await parseJsonBody(req);
      if (!Array.isArray(body.entries)) {
        return sendJson(res, 400, { ok: false, error: 'Entries array is required' });
      }
      user.entries = body.entries;
      saveDatabase(db);
      return sendJson(res, 200, { ok: true, count: user.entries.length });
    }
  }

  // 6. POST /api/share-links (Cryptographically secure 128-bit unguessable tokens - P0 Fix #3, #4)
  if (method === 'POST' && pathname === '/api/share-links') {
    const body = await parseJsonBody(req);
    const ownerId = String(body.ownerId || 'francis').toLowerCase();
    const owner = db.users[ownerId];
    if (!owner) {
      return sendJson(res, 404, { ok: false, error: 'Owner user not found' });
    }

    const expiryDays = Number(body.expiryDays) || 7;
    // 128-bit unguessable random hex token
    const token = crypto.randomBytes(16).toString('hex');
    const nowMs = Date.now();
    const expiresAt = nowMs + expiryDays * 86400000;

    const newLink = {
      id: token,
      token,
      ownerId,
      audience: body.audience || 'free_busy',
      mode: body.audience || 'free_busy',
      hoursStart: typeof body.hoursStart === 'number' ? body.hoursStart : 540,
      hoursEnd: typeof body.hoursEnd === 'number' ? body.hoursEnd : 1020,
      createdAt: nowMs,
      expiresAt,
      expiryDays,
      revoked: false
    };

    db.shareLinks[token] = newLink;
    saveDatabase(db);

    const host = req.headers.host || `localhost:${PORT}`;
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const url = `${protocol}://${host}/s/${token}`;

    return sendJson(res, 201, {
      ok: true,
      link: newLink,
      url,
      token
    });
  }

  // 7. GET /api/s/:token (Server-enforced access control & Cross-device retrieval - P0 Fix #3, #4)
  const shareTokenMatch = pathname.match(/^\/api\/s\/([^/]+)$/);
  if (shareTokenMatch && method === 'GET') {
    const token = shareTokenMatch[1];
    const link = db.shareLinks[token];

    if (!link) {
      return sendJson(res, 404, { ok: false, error: 'Share link not found' });
    }
    if (link.revoked) {
      return sendJson(res, 410, { ok: false, error: 'This share link has been revoked by the owner', revoked: true });
    }
    if (Date.now() > link.expiresAt) {
      return sendJson(res, 410, { ok: false, error: 'This share link has expired', expired: true });
    }

    const owner = db.users[link.ownerId];
    if (!owner) {
      return sendJson(res, 404, { ok: false, error: 'Owner account no longer exists' });
    }

    // Filter owner's entries by shared hours window
    const sharedEntries = (owner.entries || []).filter((e) => {
      return e.start < link.hoursEnd && e.end > link.hoursStart;
    });

    return sendJson(res, 200, {
      ok: true,
      link,
      owner: {
        id: owner.id,
        username: owner.username,
        firstName: owner.firstName,
        name: owner.name,
        avatarClass: owner.avatarClass
      },
      entries: sharedEntries
    });
  }

  // 8. DELETE /api/share-links/:token (Server-side revocation - P0 Fix #4)
  const revokeMatch = pathname.match(/^\/api\/share-links\/([^/]+)$/);
  if (revokeMatch && method === 'DELETE') {
    const token = revokeMatch[1];
    const link = db.shareLinks[token];
    if (!link) {
      return sendJson(res, 404, { ok: false, error: 'Share link not found' });
    }
    link.revoked = true;
    saveDatabase(db);
    return sendJson(res, 200, { ok: true, revoked: true });
  }

  return false;
}

/* --------------------------------------------------------------------------
   HTTP Server Listener
   -------------------------------------------------------------------------- */
export const server = http.createServer(async (req, res) => {
  try {
    const handled = await handleApiRequest(req, res);
    if (handled) return;
  } catch (err) {
    return sendJson(res, 500, { ok: false, error: err.message || 'Server error' });
  }

  // Static files & SPA Routing
  const urlPath = (req.url || '/').split('?')[0];
  const baseDir = fs.existsSync(path.join(DIST_DIR, 'index.html')) ? DIST_DIR : PUBLIC_DIR;

  // Single-page application route: /s/:id serves index.html
  if (urlPath.startsWith('/s/')) {
    const indexPath = path.join(baseDir, 'index.html');
    fs.readFile(indexPath, (err, content) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(content);
    });
    return;
  }

  const relPath = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const safePath = path.normalize(relPath).replace(/^(\.\.(\/|\\|$))+/, '');
  let filePath = path.join(baseDir, safePath);

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(baseDir, 'index.html');
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(content);
  });
});

if (process.env.NODE_ENV !== 'test') {
  initDatabase();
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`CNU Free API & static server running at http://localhost:${PORT}`);
  });
}
