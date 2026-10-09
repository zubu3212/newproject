const express = require('express');
const path = require('path');
const crypto = require('crypto');
const session = require('express-session');
const connectPgSimple = require('connect-pg-simple');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const productCatalogSeed = require('./product-catalog-seed');
require('dotenv').config();

const app = express();
const port = Number(process.env.PORT || 8001);
const appUrl = (process.env.APP_URL || `http://localhost:${port}`).replace(/\/$/, '');
if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET is required in production.');
}
const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE || 'novatek'
});

const PgSession = connectPgSimple(session);
const sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(48).toString('hex');
const randomToken = (size = 32) => crypto.randomBytes(size).toString('base64url');
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

app.set('trust proxy', 1);
app.use(express.json());
app.use(express.urlencoded({ extended: false, limit: '20kb' }));
app.use(session({
  store: new PgSession({
    pool,
    tableName: 'user_sessions',
    createTableIfMissing: true
  }),
  name: 'novatek.sid',
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    secure: process.env.NODE_ENV === 'production'
  }
}));

function requireAuth(req, res, next) {
  if (req.session.user) return next();
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Please sign in to continue.' });
  }
  return res.redirect(`/login.html?next=${encodeURIComponent(req.originalUrl)}`);
}

async function requireAdmin(req, res, next) {
  if (!req.session.user) return requireAuth(req, res, next);
  try {
    const result = await pool.query('SELECT role FROM users WHERE id = $1', [req.session.user.id]);
    if (!result.rowCount || result.rows[0].role !== 'admin') {
      if (req.path.startsWith('/api/')) {
        return res.status(403).json({ error: 'Administrator access is required.' });
      }
      return res.status(403).type('text').send('Administrator access is required.');
    }
    req.session.user.role = 'admin';
    next();
  } catch (error) {
    console.error('Administrator permission check failed:', error);
    if (req.path.startsWith('/api/')) {
      return res.status(500).json({ error: 'Unable to verify administrator access.' });
    }
    res.status(500).type('text').send('Unable to verify administrator access.');
  }
}

function escapeXml(value) {
  return String(value).replace(/[<>&"']/g, character => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;'
  })[character]);
}

function productIllustration(product) {
  const identity = `${product.id}:${product.name}`;
  let hash = 2166136261;
  for (const character of identity) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  const hue = hash % 360;
  const accent = `hsl(${hue} 82% 57%)`;
  const secondary = `hsl(${(hue + 48) % 360} 78% 66%)`;
  const name = escapeXml(product.name);
  let device;

  switch (product.category_name) {
    case 'Smartphones':
      device = `
        <rect x="224" y="61" width="192" height="358" rx="35" fill="#11151d" stroke="#8792a5" stroke-width="3"/>
        <rect x="235" y="73" width="170" height="334" rx="27" fill="url(#screen)"/>
        <path d="M235 292 Q308 215 405 279 V380 Q320 431 235 368Z" fill="${accent}" opacity=".85"/>
        <path d="M235 333 Q318 266 405 322 V389 Q322 423 292 407 Q250 390 235 378Z" fill="${secondary}" opacity=".8"/>
        <rect x="292" y="82" width="56" height="12" rx="6" fill="#11151d"/>
        <circle cx="320" cy="385" r="5" fill="#fff" opacity=".75"/>`;
      break;
    case 'Laptops':
      device = `
        <rect x="150" y="72" width="340" height="238" rx="20" fill="#171b23" stroke="#9ca9bc" stroke-width="4"/>
        <rect x="165" y="87" width="310" height="208" rx="10" fill="url(#screen)"/>
        <circle cx="320" cy="190" r="73" fill="${accent}" opacity=".82"/>
        <path d="M252 217 Q319 113 392 216 Q344 259 252 217Z" fill="${secondary}" opacity=".92"/>
        <path d="M112 315 H528 L493 360 Q488 367 474 367 H166 Q151 367 146 359Z" fill="#c2c9d3" stroke="#e7ebf1" stroke-width="4"/>
        <path d="M224 322 H416 L400 340 H240Z" fill="#8d98a8"/>
        <rect x="285" y="354" width="70" height="4" rx="2" fill="#778294"/>`;
      break;
    case 'Audio':
      device = /speaker|sound bar/i.test(product.name)
        ? `<rect x="145" y="183" width="350" height="132" rx="58" fill="#171b23" stroke="#6f7b8f" stroke-width="5"/>
           <circle cx="211" cy="249" r="44" fill="#262c38" stroke="${accent}" stroke-width="5"/>
           <circle cx="429" cy="249" r="44" fill="#262c38" stroke="${secondary}" stroke-width="5"/>
           <circle cx="211" cy="249" r="15" fill="#8792a5"/><circle cx="429" cy="249" r="15" fill="#8792a5"/>
           <path d="M275 249 H365" stroke="#dce5f1" stroke-width="7" stroke-linecap="round" opacity=".75"/>`
        : /buds|earbud/i.test(product.name)
          ? `<path d="M228 182 C228 131 270 103 307 124 C337 142 335 183 315 202 L298 219 V290 Q298 319 273 319 Q248 319 248 290 V204 C236 200 228 193 228 182Z" fill="#fff" stroke="#a5afbd" stroke-width="7"/>
             <path d="M412 182 C412 131 370 103 333 124 C303 142 305 183 325 202 L342 219 V290 Q342 319 367 319 Q392 319 392 290 V204 C404 200 412 193 412 182Z" fill="#fff" stroke="#a5afbd" stroke-width="7"/>
             <path d="M264 156 Q282 137 300 156 M376 156 Q358 137 340 156" fill="none" stroke="${accent}" stroke-width="8" stroke-linecap="round"/>
             <rect x="238" y="337" width="164" height="34" rx="17" fill="${secondary}" opacity=".75"/>`
        : `<path d="M184 235 V184 A136 136 0 0 1 456 184 V235" fill="none" stroke="#202631" stroke-width="28" stroke-linecap="round"/>
           <rect x="167" y="211" width="70" height="142" rx="30" fill="#151922" stroke="${accent}" stroke-width="5"/>
           <rect x="403" y="211" width="70" height="142" rx="30" fill="#151922" stroke="${secondary}" stroke-width="5"/>
           <path d="M278 288 Q320 325 362 288" fill="none" stroke="#9ca9bc" stroke-width="9" stroke-linecap="round"/>`;
      break;
    case 'Wearables':
      device = /ring/i.test(product.name)
        ? `<ellipse cx="320" cy="242" rx="112" ry="106" fill="none" stroke="#bdc6d3" stroke-width="48"/>
           <ellipse cx="320" cy="242" rx="112" ry="106" fill="none" stroke="${accent}" stroke-width="10" stroke-dasharray="240 470" transform="rotate(-36 320 242)"/>
           <ellipse cx="320" cy="242" rx="74" ry="68" fill="#f0f3f7"/>`
        : `<rect x="273" y="43" width="94" height="412" rx="45" fill="url(#strap)"/>
           <rect x="227" y="135" width="186" height="232" rx="48" fill="#171b23" stroke="#929eaf" stroke-width="5"/>
           <rect x="241" y="149" width="158" height="204" rx="37" fill="url(#screen)"/>
           <circle cx="320" cy="250" r="54" fill="none" stroke="${accent}" stroke-width="10"/>
           <path d="M320 250 L320 209 M320 250 L351 268" stroke="#fff" stroke-width="8" stroke-linecap="round"/>
           <circle cx="320" cy="250" r="8" fill="${secondary}"/>`;
      break;
    case 'Smart Home':
      device = /bulb/i.test(product.name)
        ? `<path d="M320 91 C240 91 196 151 196 215 Q196 271 249 307 V332 H391 V307 Q444 271 444 215 C444 151 400 91 320 91Z" fill="#fff4c2" stroke="${accent}" stroke-width="10"/>
           <path d="M264 341 H376 M276 365 H364 M289 389 H351" stroke="#9aa5b5" stroke-width="14" stroke-linecap="round"/>
           <path d="M320 134 V221 M281 175 L320 221 L359 175" fill="none" stroke="${accent}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>`
        : `<rect x="190" y="106" width="260" height="246" rx="42" fill="#f8fafc" stroke="#9da9bc" stroke-width="6"/>
           <circle cx="320" cy="218" r="74" fill="#17202d" stroke="${accent}" stroke-width="12"/>
           <circle cx="320" cy="218" r="37" fill="#354158"/><circle cx="320" cy="218" r="17" fill="#11151d"/>
           <circle cx="320" cy="322" r="9" fill="${secondary}"/>`;
      break;
    default:
      if (/pad|tablet/i.test(product.name)) {
        device = `<rect x="146" y="93" width="348" height="294" rx="34" fill="url(#body)" stroke="#8793a4" stroke-width="6"/>
          <rect x="163" y="110" width="314" height="260" rx="23" fill="url(#screen)"/>
          <path d="M163 272 Q304 165 477 252 V330 Q320 408 163 326Z" fill="${accent}" opacity=".84"/>
          <path d="M222 202 L320 145 L418 202 V269 L320 325 L222 269Z" fill="${secondary}" opacity=".86"/>
          <circle cx="320" cy="354" r="5" fill="#edf2f8"/>`;
      } else if (/cable/i.test(product.name)) {
        device = `<path d="M150 270 C190 108 450 112 478 264 C501 385 223 399 191 279 C171 204 319 169 388 231" fill="none" stroke="#222b39" stroke-width="29" stroke-linecap="round"/>
          <path d="M150 270 C190 108 450 112 478 264 C501 385 223 399 191 279 C171 204 319 169 388 231" fill="none" stroke="${accent}" stroke-width="7" stroke-linecap="round"/>
          <rect x="119" y="243" width="47" height="55" rx="9" fill="#8792a5"/><rect x="377" y="205" width="55" height="45" rx="9" fill="#8792a5"/>`;
      } else if (/stand|mount/i.test(product.name)) {
        device = `<path d="M218 357 L278 142 Q284 122 303 130 L345 147 Q360 153 354 172 L306 323 H415 Q438 323 438 345 V363 H218Z" fill="#c4ccd7" stroke="${accent}" stroke-width="9" stroke-linejoin="round"/>
          <rect x="195" y="352" width="258" height="28" rx="14" fill="#8995a7"/><circle cx="309" cy="205" r="18" fill="${secondary}"/>`;
      } else if (/hub|adapter/i.test(product.name)) {
        device = `<rect x="157" y="175" width="326" height="148" rx="45" fill="#b6bfcb" stroke="#7d899a" stroke-width="6"/>
          <rect x="192" y="203" width="42" height="28" rx="7" fill="#293342"/><rect x="252" y="203" width="42" height="28" rx="7" fill="#293342"/>
          <rect x="312" y="203" width="42" height="28" rx="7" fill="#293342"/><rect x="372" y="203" width="70" height="28" rx="7" fill="${accent}"/>
          <path d="M192 265 H439" stroke="#eef2f7" stroke-width="10" stroke-linecap="round"/>`;
      } else if (/power|battery/i.test(product.name)) {
        device = `<rect x="214" y="106" width="212" height="286" rx="38" fill="url(#body)" stroke="#8793a4" stroke-width="6"/>
          <rect x="231" y="123" width="178" height="252" rx="27" fill="#263142"/>
          <rect x="271" y="157" width="98" height="82" rx="17" fill="${accent}"/>
          <text x="320" y="211" text-anchor="middle" font-family="Arial" font-size="32" font-weight="700" fill="#fff">82%</text>
          <path d="M268 285 H372 M268 310 H350 M268 335 H362" stroke="#dbe4ef" stroke-width="9" stroke-linecap="round"/>`;
      } else if (/case|sleeve|guard|screen/i.test(product.name)) {
        device = `<rect x="222" y="78" width="196" height="326" rx="35" fill="url(#body)" stroke="${accent}" stroke-width="9"/>
          <rect x="238" y="95" width="164" height="292" rx="27" fill="url(#screen)"/>
          <circle cx="273" cy="132" r="17" fill="#121824" stroke="#8e9aab" stroke-width="5"/>
          <circle cx="314" cy="132" r="17" fill="#121824" stroke="#8e9aab" stroke-width="5"/>
          <circle cx="355" cy="132" r="17" fill="#121824" stroke="#8e9aab" stroke-width="5"/>
          <path d="M258 307 Q320 236 382 307 V366 H258Z" fill="${secondary}" opacity=".82"/>`;
      } else if (/charger|wireless|pad/i.test(product.name)) {
        device = /pad|wireless/i.test(product.name)
          ? `<rect x="177" y="144" width="286" height="206" rx="47" fill="url(#body)" stroke="#8e9aab" stroke-width="6"/>
             <circle cx="320" cy="247" r="73" fill="none" stroke="${accent}" stroke-width="12"/>
             <path d="M320 189 V246 L363 272" fill="none" stroke="${secondary}" stroke-width="12" stroke-linecap="round"/>
             <circle cx="320" cy="247" r="10" fill="${accent}"/>`
          : `<rect x="223" y="139" width="194" height="217" rx="40" fill="url(#body)" stroke="#8e9aab" stroke-width="6"/>
             <rect x="274" y="182" width="92" height="78" rx="19" fill="#1c2634"/>
             <rect x="291" y="198" width="58" height="12" rx="6" fill="${accent}"/>
             <path d="M274 291 H366" stroke="#8b96a7" stroke-width="12" stroke-linecap="round"/>
             <path d="M267 139 V104 M373 139 V104" stroke="#737f91" stroke-width="14" stroke-linecap="round"/>`;
      } else if (/lens|camera/i.test(product.name)) {
        device = `<circle cx="320" cy="238" r="144" fill="url(#body)" stroke="#8e9aab" stroke-width="8"/>
          <circle cx="320" cy="238" r="104" fill="#111a28" stroke="${accent}" stroke-width="13"/>
          <circle cx="320" cy="238" r="67" fill="#27384f" stroke="#73839a" stroke-width="8"/>
          <circle cx="320" cy="238" r="32" fill="${secondary}" opacity=".7"/>
          <circle cx="320" cy="238" r="16" fill="#101620"/>`;
      } else {
        device = `<rect x="203" y="99" width="234" height="300" rx="34" fill="url(#body)" stroke="#9ca8b8" stroke-width="5"/>
          <rect x="222" y="119" width="196" height="260" rx="25" fill="url(#screen)"/>
          <path d="M222 307 Q313 226 418 286 V356 Q332 406 222 358Z" fill="${accent}" opacity=".82"/>
          <path d="M264 188 L320 155 L376 188 L376 254 L320 286 L264 254Z" fill="${secondary}" opacity=".82"/>
          <circle cx="320" cy="220" r="27" fill="#f6f8fb" opacity=".9"/>`;
      }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480" role="img" aria-label="${name}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f8fafc"/><stop offset="1" stop-color="#e5eaf1"/></linearGradient>
      <linearGradient id="screen" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#16243b"/><stop offset=".55" stop-color="#263b59"/><stop offset="1" stop-color="#0d1522"/></linearGradient>
      <linearGradient id="body" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#e9edf3"/><stop offset="1" stop-color="#9ca8b8"/></linearGradient>
      <linearGradient id="strap" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#333c4d"/><stop offset="1" stop-color="#171b23"/></linearGradient>
      <filter id="shadow" x="-30%" y="-30%" width="160%" height="180%"><feDropShadow dx="0" dy="18" stdDeviation="16" flood-color="#263244" flood-opacity=".25"/></filter>
    </defs>
    <rect width="640" height="480" fill="url(#bg)"/>
    <circle cx="320" cy="235" r="183" fill="${accent}" opacity=".08"/>
    <g filter="url(#shadow)">${device}</g>
    <rect x="22" y="22" width="58" height="7" rx="3.5" fill="${accent}"/>
    <text x="320" y="453" text-anchor="middle" font-family="Arial,sans-serif" font-size="17" font-weight="700" letter-spacing="2" fill="#475569">${name}</text>
  </svg>`;
}

async function signIn(req, user, rememberMe = true) {
  const adminEmail = typeof process.env.ADMIN_EMAIL === 'string' ? process.env.ADMIN_EMAIL.trim().toLowerCase() : '';
  if (adminEmail && user.email?.trim().toLowerCase() === adminEmail) {
    await pool.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [user.id]);
    user.role = 'admin';
  }
  return new Promise((resolve, reject) => {
    req.session.regenerate(error => {
      if (error) return reject(error);
      req.session.cookie.maxAge = rememberMe ? 1000 * 60 * 60 * 24 * 7 : null;
      req.session.user = {
        id: user.id,
        fullName: user.full_name || user.fullName || '',
        email: user.email || '',
        role: user.role || 'customer'
      };
      req.session.save(saveError => saveError ? reject(saveError) : resolve());
    });
  });
}

function page(file) {
  return (req, res) => {
    if (!req.session.user) return res.redirect(`/login.html?next=${encodeURIComponent(req.originalUrl)}`);
    res.sendFile(path.join(__dirname, file));
  };
}

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save(error => error ? reject(error) : resolve());
  });
}

async function createOAuthState(provider, req, codeVerifier = null, nonce = null) {
  const state = randomToken();
  await pool.query('DELETE FROM oauth_states WHERE expires_at <= NOW()');
  await pool.query(
    `INSERT INTO oauth_states (state_hash, provider, session_id, code_verifier, nonce, expires_at)
     VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '10 minutes')`,
    [sha256(state), provider, req.sessionID, codeVerifier, nonce]
  );
  return state;
}

async function consumeOAuthState(state, provider, req) {
  if (!state || typeof state !== 'string') return null;
  const result = await pool.query(
    `DELETE FROM oauth_states
     WHERE state_hash = $1 AND provider = $2 AND session_id = $3 AND expires_at > NOW()
     RETURNING code_verifier, nonce`,
    [sha256(state), provider, req.sessionID]
  );
  return result.rows[0] || null;
}

async function saveOAuthUser(provider, providerUserId, email, fullName) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const linked = await client.query(
      `SELECT u.id, u.full_name, u.email, u.role
       FROM oauth_accounts a JOIN users u ON u.id = a.user_id
       WHERE a.provider = $1 AND a.provider_user_id = $2`,
      [provider, providerUserId]
    );
    if (linked.rowCount) {
      await client.query('COMMIT');
      return linked.rows[0];
    }

    let user;
    if (email) {
      const existing = await client.query(
        'SELECT id, full_name, email, role FROM users WHERE LOWER(email) = LOWER($1) FOR UPDATE',
        [email]
      );
      if (existing.rowCount) user = existing.rows[0];
    }

    if (!user) {
      const inserted = await client.query(
        `INSERT INTO users (full_name, email, password_hash)
         VALUES ($1, $2, NULL)
         RETURNING id, full_name, email, role`,
        [fullName || null, email ? email.toLowerCase() : null]
      );
      user = inserted.rows[0];
    } else if (!user.full_name && fullName) {
      const updated = await client.query(
        'UPDATE users SET full_name = $1 WHERE id = $2 RETURNING id, full_name, email, role',
        [fullName, user.id]
      );
      user = updated.rows[0];
    }

    await client.query(
      'INSERT INTO oauth_accounts (user_id, provider, provider_user_id) VALUES ($1, $2, $3)',
      [user.id, provider, providerUserId]
    );
    await client.query('COMMIT');
    return user;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function importJose() {
  return import('jose');
}

async function verifyJwt(token, jwksUrl, issuer, audience, nonce) {
  const { createRemoteJWKSet, jwtVerify } = await importJose();
  const keys = createRemoteJWKSet(new URL(jwksUrl));
  const { payload } = await jwtVerify(token, keys, { issuer, audience, nonce });
  return payload;
}

function providerConfig(provider) {
  const config = {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callback: `${appUrl}/auth/google/callback`
    },
    apple: {
      clientId: process.env.APPLE_CLIENT_ID,
      teamId: process.env.APPLE_TEAM_ID,
      keyId: process.env.APPLE_KEY_ID,
      privateKey: process.env.APPLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      callback: `${appUrl}/auth/apple/callback`
    },
    x: {
      clientId: process.env.X_CLIENT_ID,
      clientSecret: process.env.X_CLIENT_SECRET,
      callback: `${appUrl}/auth/x/callback`
    }
  }[provider];
  return config;
}

function requireProviderConfig(provider, fields) {
  const config = providerConfig(provider);
  if (!config || fields.some(field => !config[field])) {
    const error = new Error(`${provider} sign-in is not configured yet. Add its OAuth credentials to .env.`);
    error.status = 503;
    throw error;
  }
  return config;
}

function oauthError(res, status, message) {
  res.status(status).type('html').send(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Sign-in issue | NOVATEK</title><body style="margin:0;background:#080b11;color:#edf3ff;font:16px sans-serif;display:grid;min-height:100vh;place-items:center"><main style="max-width:440px;padding:32px;background:#121922;border:1px solid #293243;border-radius:18px"><h1>Sign-in could not continue</h1><p>${message}</p><a style="color:#8dbaff" href="/login.html">Return to login</a></main></body></html>`
  );
}

app.get('/', (req, res) => res.redirect(req.session.user ? '/home' : '/login.html'));
app.get('/index.html', (req, res) => res.redirect(req.session.user ? '/home' : '/login.html'));
app.get('/login.html', (req, res) => {
  if (req.session.user) return res.redirect('/home');
  res.sendFile(path.join(__dirname, 'login.html'));
});
app.get('/signup.html', (req, res) => {
  if (req.session.user) return res.redirect('/home');
  res.sendFile(path.join(__dirname, 'signup.html'));
});
app.get('/home', page('index.html'));
app.get('/shop', page('catalog.html'));
app.get('/categories', page('catalog.html'));
app.get('/new-arrivals', page('catalog.html'));
app.get('/deals', page('catalog.html'));
app.get('/support', page('catalog.html'));
app.get('/profile', page('account.html'));
app.get('/cart', page('cart.html'));
app.get('/admin', requireAdmin, (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/admin/:section', requireAdmin, (req, res, next) => {
  if (!['orders', 'products', 'customers'].includes(req.params.section)) return next();
  res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/api/session', (req, res) => {
  res.json({ user: req.session.user || null });
});

app.get('/api/auth/providers', (_, res) => {
  const google = providerConfig('google');
  res.json({ google: Boolean(google.clientId && google.clientSecret) });
});

app.get('/api/account/profile', requireAuth, async (req, res) => {
  try {
    const [profile, orders, stats] = await Promise.all([
      pool.query(
        `SELECT id, full_name, email, phone, address, city, postal_code, role, created_at
         FROM users WHERE id = $1`,
        [req.session.user.id]
      ),
      pool.query(
        `SELECT o.id, o.order_number, o.created_at, o.total, o.status,
                COALESCE(SUM(oi.quantity), 0)::int AS item_count
         FROM orders o
         LEFT JOIN order_items oi ON oi.order_id = o.id
         WHERE o.user_id = $1
         GROUP BY o.id
         ORDER BY o.created_at DESC
         LIMIT 10`,
        [req.session.user.id]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS order_count,
                COALESCE(SUM(total) FILTER (WHERE status NOT IN ('cancelled', 'refunded')), 0)::numeric(12, 2) AS order_value,
                COUNT(*) FILTER (WHERE status IN ('placed', 'processing', 'shipped'))::int AS active_orders
         FROM orders WHERE user_id = $1`,
        [req.session.user.id]
      )
    ]);
    if (!profile.rowCount) return res.status(404).json({ error: 'Account not found.' });
    res.json({ profile: profile.rows[0], orders: orders.rows, stats: stats.rows[0] });
  } catch (error) {
    console.error('Account profile load failed:', error);
    res.status(500).json({ error: 'Unable to load your profile right now.' });
  }
});

app.patch('/api/account/profile', requireAuth, async (req, res) => {
  const fullName = typeof req.body?.fullName === 'string' ? req.body.fullName.trim() : '';
  const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';
  const address = typeof req.body?.address === 'string' ? req.body.address.trim() : '';
  const city = typeof req.body?.city === 'string' ? req.body.city.trim() : '';
  const postalCode = typeof req.body?.postalCode === 'string' ? req.body.postalCode.trim() : '';
  const hasAnyAddress = Boolean(address || city || postalCode);
  if (fullName.length < 2 || fullName.length > 150) {
    return res.status(400).json({ error: 'Name must be between 2 and 150 characters.' });
  }
  if (phone && (phone.length < 6 || phone.length > 30)) {
    return res.status(400).json({ error: 'Phone number must be between 6 and 30 characters.' });
  }
  if (hasAnyAddress &&
      (address.length < 5 || address.length > 250 ||
       city.length < 2 || city.length > 100 ||
       postalCode.length < 3 || postalCode.length > 20)) {
    return res.status(400).json({ error: 'Complete your street address, city, and postal code, or leave all three blank.' });
  }
  try {
    const result = await pool.query(
      `UPDATE users
       SET full_name = $1, phone = $2, address = $3, city = $4, postal_code = $5
       WHERE id = $6
       RETURNING id, full_name, email, phone, address, city, postal_code, role, created_at`,
      [fullName, phone || null, address || null, city || null, postalCode || null, req.session.user.id]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Account not found.' });
    req.session.user.fullName = result.rows[0].full_name;
    res.json({ profile: result.rows[0], message: 'Your profile has been updated.' });
  } catch (error) {
    console.error('Account profile update failed:', error);
    res.status(500).json({ error: 'Unable to save your profile right now.' });
  }
});

app.post('/api/account/orders/:id/cancel', requireAuth, async (req, res) => {
  const orderId = Number(req.params.id);
  if (!Number.isSafeInteger(orderId) || orderId < 1) {
    return res.status(400).json({ error: 'Choose a valid order.' });
  }
  try {
    const result = await pool.query(
      `UPDATE orders
       SET status = 'cancelled'
       WHERE id = $1 AND user_id = $2 AND status IN ('placed', 'processing')
       RETURNING id, order_number, status`,
      [orderId, req.session.user.id]
    );
    if (result.rowCount) {
      return res.json({ order: result.rows[0], message: 'Order cancelled. It remains in your order history.' });
    }
    const existing = await pool.query(
      'SELECT status FROM orders WHERE id = $1 AND user_id = $2',
      [orderId, req.session.user.id]
    );
    if (!existing.rowCount) return res.status(404).json({ error: 'Order not found.' });
    res.status(409).json({ error: 'Only placed or processing orders can be cancelled.' });
  } catch (error) {
    console.error('Customer order cancellation failed:', error);
    res.status(500).json({ error: 'Unable to cancel this order right now.' });
  }
});

app.post('/api/account/password', requireAuth, async (req, res) => {
  const currentPassword = req.body?.currentPassword;
  const newPassword = req.body?.newPassword;
  if (typeof currentPassword !== 'string' || !currentPassword ||
      typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 200) {
    return res.status(400).json({ error: 'Enter your current password and a new password with at least 8 characters.' });
  }
  try {
    const result = await pool.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [req.session.user.id]
    );
    if (!result.rowCount || !result.rows[0].password_hash ||
        !await bcrypt.compare(currentPassword, result.rows[0].password_hash)) {
      return res.status(401).json({ error: 'The current password is incorrect.' });
    }
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, req.session.user.id]);
    res.json({ ok: true, message: 'Your password has been changed.' });
  } catch (error) {
    console.error('Account password update failed:', error);
    res.status(500).json({ error: 'Unable to change the password right now.' });
  }
});

app.get('/api/admin/summary', requireAdmin, async (_, res) => {
  try {
    const [totals, recentOrders] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*)::int AS total_orders,
          COUNT(*) FILTER (WHERE status IN ('placed', 'processing'))::int AS open_orders,
          COUNT(*) FILTER (WHERE status IN ('shipped', 'completed', 'delivered'))::int AS fulfilled_orders,
          COALESCE(SUM(total) FILTER (WHERE status NOT IN ('cancelled', 'refunded')), 0)::numeric(12, 2) AS order_value,
          (SELECT COUNT(*)::int FROM users WHERE role <> 'admin') AS customers
        FROM orders
      `),
      pool.query(`
        SELECT o.id, o.order_number, o.created_at, o.shipping_name, o.shipping_city,
               o.total, o.status, COALESCE(SUM(oi.quantity), 0)::int AS item_count
        FROM orders o
        LEFT JOIN order_items oi ON oi.order_id = o.id
        GROUP BY o.id
        ORDER BY o.created_at DESC
        LIMIT 25
      `)
    ]);
    res.json({ totals: totals.rows[0], orders: recentOrders.rows });
  } catch (error) {
    console.error('Admin order summary failed:', error);
    res.status(500).json({ error: 'Unable to load the order summary.' });
  }
});

app.get('/api/admin/products', requireAdmin, async (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 120) : '';
  try {
    const result = await pool.query(
      `SELECT p.id, p.name, p.category_id, c.name AS category_name,
              p.price, p.old_price, p.image_url, p.badge, p.badge_type, p.created_at
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE $1 = '' OR p.name ILIKE '%' || $1 || '%' OR c.name ILIKE '%' || $1 || '%'
       ORDER BY p.created_at DESC, p.id DESC`,
      [search]
    );
    res.json({ products: result.rows });
  } catch (error) {
    console.error('Admin product list failed:', error);
    res.status(500).json({ error: 'Unable to load products.' });
  }
});

app.get('/api/admin/categories', requireAdmin, async (_, res) => {
  try {
    const result = await pool.query('SELECT id, name FROM categories ORDER BY name');
    res.json({ categories: result.rows });
  } catch (error) {
    console.error('Admin category list failed:', error);
    res.status(500).json({ error: 'Unable to load product categories.' });
  }
});

function validateAdminProduct(body) {
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const categoryId = Number(body?.categoryId);
  const price = Number(body?.price);
  const oldPriceInput = body?.oldPrice;
  const oldPrice = oldPriceInput === '' || oldPriceInput === null || oldPriceInput === undefined
    ? null
    : Number(oldPriceInput);
  const badge = typeof body?.badge === 'string' ? body.badge.trim() : '';
  const badgeType = typeof body?.badgeType === 'string' ? body.badgeType : '';
  const imageUrl = typeof body?.imageUrl === 'string' ? body.imageUrl.trim() : '';
  if (!name || name.length > 150) return { error: 'Product name must be between 1 and 150 characters.' };
  if (!Number.isSafeInteger(categoryId) || categoryId < 1) return { error: 'Choose a valid category.' };
  if (!Number.isFinite(price) || price <= 0 || price > 10000000) return { error: 'Enter a valid price above zero.' };
  if (oldPrice !== null && (!Number.isFinite(oldPrice) || oldPrice < price || oldPrice > 10000000)) {
    return { error: 'Compare-at price must be at least the product price.' };
  }
  if (badge.length > 50 || !['', 'new', 'green', 'orange'].includes(badgeType)) {
    return { error: 'Choose a valid product badge.' };
  }
  if ((badge && !badgeType) || (!badge && badgeType)) return { error: 'Choose both a badge label and its style, or leave both blank.' };
  let normalizedImageUrl = null;
  if (imageUrl) {
    try {
      const parsed = new URL(imageUrl);
      if (!['http:', 'https:'].includes(parsed.protocol) || imageUrl.length > 2000) {
        return { error: 'Product image URL must be an HTTP or HTTPS URL under 2,000 characters.' };
      }
      normalizedImageUrl = parsed.toString();
    } catch {
      return { error: 'Enter a valid HTTP or HTTPS product image URL.' };
    }
  }
  return { value: { name, categoryId, price, oldPrice, badge: badge || null, badgeType: badgeType || null, imageUrl: normalizedImageUrl } };
}

app.post('/api/admin/products', requireAdmin, async (req, res) => {
  const validation = validateAdminProduct(req.body);
  if (validation.error) return res.status(400).json({ error: validation.error });
  const product = validation.value;
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const category = await client.query('SELECT id FROM categories WHERE id = $1', [product.categoryId]);
    if (!category.rowCount) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'The selected category does not exist.' });
    }
    const result = await client.query(
      `INSERT INTO products (name, category_id, price, old_price, image_url, badge, badge_type)
       VALUES ($1, $2, $3, $4, COALESCE($5, '/product-images/pending.svg'), $6, $7)
       RETURNING id`,
      [product.name, product.categoryId, product.price, product.oldPrice, product.imageUrl, product.badge, product.badgeType]
    );
    const created = await client.query(
      `UPDATE products SET image_url = COALESCE($1, '/product-images/' || id || '.svg')
       WHERE id = $2
       RETURNING id, name, category_id, price, old_price, image_url, badge, badge_type`,
      [product.imageUrl, result.rows[0].id]
    );
    await client.query('COMMIT');
    res.status(201).json({ product: created.rows[0] });
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Admin product creation rollback failed:', rollbackError);
      }
    }
    console.error('Admin product creation failed:', error);
    res.status(500).json({ error: 'Unable to create this product.' });
  } finally {
    if (client) client.release();
  }
});

app.patch('/api/admin/products/:id', requireAdmin, async (req, res) => {
  const productId = Number(req.params.id);
  if (!Number.isSafeInteger(productId) || productId < 1) return res.status(400).json({ error: 'Choose a valid product.' });
  const validation = validateAdminProduct(req.body);
  if (validation.error) return res.status(400).json({ error: validation.error });
  const product = validation.value;
  try {
    const result = await pool.query(
      `UPDATE products AS p
       SET name = $1, category_id = $2, price = $3, old_price = $4,
           image_url = COALESCE($5, '/product-images/' || p.id || '.svg'),
           badge = $6, badge_type = $7
       WHERE p.id = $8
         AND EXISTS (SELECT 1 FROM categories WHERE id = $2)
       RETURNING p.id, p.name, p.category_id, p.price, p.old_price, p.image_url, p.badge, p.badge_type`,
      [product.name, product.categoryId, product.price, product.oldPrice, product.imageUrl, product.badge, product.badgeType, productId]
    );
    if (!result.rowCount) {
      const existing = await pool.query('SELECT 1 FROM products WHERE id = $1', [productId]);
      return res.status(400).json({ error: existing.rowCount ? 'The selected category does not exist.' : 'Product not found.' });
    }
    res.json({ product: result.rows[0] });
  } catch (error) {
    console.error('Admin product update failed:', error);
    res.status(500).json({ error: 'Unable to update this product.' });
  }
});

app.delete('/api/admin/products/:id', requireAdmin, async (req, res) => {
  const productId = Number(req.params.id);
  if (!Number.isSafeInteger(productId) || productId < 1) return res.status(400).json({ error: 'Choose a valid product.' });
  try {
    const result = await pool.query('DELETE FROM products WHERE id = $1 RETURNING id', [productId]);
    if (!result.rowCount) return res.status(404).json({ error: 'Product not found.' });
    res.json({ ok: true, message: 'Product deleted. Existing order history is retained.' });
  } catch (error) {
    console.error('Admin product deletion failed:', error);
    res.status(500).json({ error: 'Unable to delete this product.' });
  }
});

app.get('/api/admin/customers', requireAdmin, async (_, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.full_name, u.email, u.phone, u.created_at,
             COUNT(DISTINCT o.id)::int AS order_count,
             COALESCE(SUM(o.total) FILTER (WHERE o.status NOT IN ('cancelled', 'refunded')), 0)::numeric(12, 2) AS order_value
      FROM users u
      LEFT JOIN orders o ON o.user_id = u.id
      WHERE u.role <> 'admin'
      GROUP BY u.id
      ORDER BY u.created_at DESC NULLS LAST, u.id DESC
    `);
    res.json({ customers: result.rows });
  } catch (error) {
    console.error('Admin customer list failed:', error);
    res.status(500).json({ error: 'Unable to load customers.' });
  }
});

app.patch('/api/admin/orders/:id/status', requireAdmin, async (req, res) => {
  const orderId = Number(req.params.id);
  const allowedStatuses = ['placed', 'processing', 'shipped', 'delivered', 'completed', 'cancelled', 'refunded'];
  const status = typeof req.body?.status === 'string' ? req.body.status : '';
  if (!Number.isSafeInteger(orderId) || orderId < 1 || !allowedStatuses.includes(status)) {
    return res.status(400).json({ error: 'Choose a valid order and status.' });
  }
  try {
    const result = await pool.query(
      'UPDATE orders SET status = $1 WHERE id = $2 RETURNING id, order_number, status',
      [status, orderId]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Order not found.' });
    res.json({ order: result.rows[0] });
  } catch (error) {
    console.error('Admin order status update failed:', error);
    res.status(500).json({ error: 'Unable to update this order.' });
  }
});

app.post('/api/logout', (req, res, next) => {
  req.session.destroy(error => {
    if (error) return next(error);
    res.clearCookie('novatek.sid');
    res.json({ ok: true });
  });
});

app.get('/api/health', async (_, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ ok: true, time: result.rows[0].now });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(500).json({ ok: false, error: 'Database unavailable.' });
  }
});

app.get('/product-images/:id.svg', async (req, res) => {
  const productId = Number(req.params.id);
  if (!Number.isSafeInteger(productId) || productId < 1) {
    return res.status(404).type('text').send('Product image not found.');
  }
  try {
    const result = await pool.query(
      `SELECT p.id, p.name, c.name AS category_name
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.id = $1`,
      [productId]
    );
    if (!result.rowCount) return res.status(404).type('text').send('Product image not found.');
    res.set('Cache-Control', 'private, max-age=3600');
    res.type('image/svg+xml').send(productIllustration(result.rows[0]));
  } catch (error) {
    console.error('Product illustration could not be generated:', error);
    res.status(500).type('text').send('Product image could not be loaded.');
  }
});

app.get('/api/categories', requireAuth, async (_, res) => {
  try {
    const result = await pool.query('SELECT * FROM categories ORDER BY id');
    res.json(result.rows);
  } catch (error) {
    console.error('Category query failed:', error);
    res.status(500).json({ error: 'Unable to load categories.' });
  }
});

app.get('/api/products', requireAuth, async (req, res) => {
  const category = typeof req.query.category === 'string' ? req.query.category.trim().slice(0, 100) : '';
  try {
    const result = await pool.query(
      `SELECT p.*, c.name AS category_name
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE $1 = '' OR LOWER(c.name) = LOWER($1)
       ORDER BY p.id`,
      [category]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Product query failed:', error);
    res.status(500).json({ error: 'Unable to load products.' });
  }
});

app.get('/api/cart', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ci.product_id, ci.quantity, p.name, p.image_url, p.price,
              (p.price * ci.quantity)::numeric(10, 2) AS line_total
       FROM cart_items ci
       JOIN products p ON p.id = ci.product_id
       WHERE ci.user_id = $1
       ORDER BY ci.created_at`,
      [req.session.user.id]
    );
    const count = result.rows.reduce((sum, item) => sum + item.quantity, 0);
    res.json({ items: result.rows, count });
  } catch (error) {
    console.error('Cart query failed:', error);
    res.status(500).json({ error: 'Unable to load your cart.' });
  }
});

app.post('/api/cart', requireAuth, async (req, res) => {
  const productId = Number(req.body?.productId);
  const quantity = req.body?.quantity === undefined ? 1 : Number(req.body.quantity);
  if (!Number.isSafeInteger(productId) || productId < 1 ||
      !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 99) {
    return res.status(400).json({ error: 'Choose a valid product and quantity.' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO cart_items (user_id, product_id, quantity)
       SELECT $1, id, $3 FROM products WHERE id = $2
       ON CONFLICT (user_id, product_id)
       DO UPDATE SET quantity = LEAST(cart_items.quantity + EXCLUDED.quantity, 99),
                     updated_at = NOW()
       RETURNING product_id, quantity`,
      [req.session.user.id, productId, quantity]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Product not found.' });
    res.status(201).json({ item: result.rows[0] });
  } catch (error) {
    console.error('Add to cart failed:', error);
    res.status(500).json({ error: 'Unable to add this product to your cart.' });
  }
});

app.patch('/api/cart/:productId', requireAuth, async (req, res) => {
  const productId = Number(req.params.productId);
  const quantity = Number(req.body?.quantity);
  if (!Number.isSafeInteger(productId) || productId < 1 ||
      !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 99) {
    return res.status(400).json({ error: 'Choose a quantity between 1 and 99.' });
  }
  try {
    const result = await pool.query(
      `UPDATE cart_items SET quantity = $1, updated_at = NOW()
       WHERE user_id = $2 AND product_id = $3 RETURNING product_id, quantity`,
      [quantity, req.session.user.id, productId]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'This product is not in your cart.' });
    res.json({ item: result.rows[0] });
  } catch (error) {
    console.error('Cart quantity update failed:', error);
    res.status(500).json({ error: 'Unable to update your cart.' });
  }
});

app.delete('/api/cart/:productId', requireAuth, async (req, res) => {
  const productId = Number(req.params.productId);
  if (!Number.isSafeInteger(productId) || productId < 1) {
    return res.status(400).json({ error: 'Choose a valid product.' });
  }
  try {
    await pool.query('DELETE FROM cart_items WHERE user_id = $1 AND product_id = $2', [
      req.session.user.id,
      productId
    ]);
    res.json({ ok: true });
  } catch (error) {
    console.error('Cart item removal failed:', error);
    res.status(500).json({ error: 'Unable to remove this item from your cart.' });
  }
});

app.post('/api/checkout', requireAuth, async (req, res) => {
  const { fullName, phone, address, city, postalCode } = req.body || {};
  const delivery = {
    fullName: typeof fullName === 'string' ? fullName.trim() : '',
    phone: typeof phone === 'string' ? phone.trim() : '',
    address: typeof address === 'string' ? address.trim() : '',
    city: typeof city === 'string' ? city.trim() : '',
    postalCode: typeof postalCode === 'string' ? postalCode.trim() : ''
  };
  if (delivery.fullName.length < 2 || delivery.fullName.length > 150 ||
      delivery.phone.length < 6 || delivery.phone.length > 30 ||
      delivery.address.length < 5 || delivery.address.length > 250 ||
      delivery.city.length < 2 || delivery.city.length > 100 ||
      delivery.postalCode.length < 3 || delivery.postalCode.length > 20) {
    return res.status(400).json({ error: 'Enter a valid name, phone number, street address, city, and postal code.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cart = await client.query(
      `SELECT ci.product_id, ci.quantity, p.name, p.price
       FROM cart_items ci
       JOIN products p ON p.id = ci.product_id
       WHERE ci.user_id = $1
       ORDER BY ci.product_id
       FOR UPDATE OF ci`,
      [req.session.user.id]
    );
    if (!cart.rowCount) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Your cart is empty.' });
    }

    const subtotal = cart.rows.reduce((sum, item) => sum + Math.round(Number(item.price) * 100) * item.quantity, 0);
    const shipping = subtotal >= 9900 ? 0 : 900;
    const total = subtotal + shipping;
    const orderNumber = `NV-${Date.now()}-${randomToken(4).toUpperCase()}`;
    const order = await client.query(
      `INSERT INTO orders
        (user_id, order_number, subtotal, shipping, total, payment_method,
         shipping_name, shipping_phone, shipping_address, shipping_city, shipping_postal_code)
       VALUES ($1, $2, $3 / 100.0, $4 / 100.0, $5 / 100.0, 'cash_on_delivery', $6, $7, $8, $9, $10)
       RETURNING id, order_number, subtotal, shipping, total, status, created_at`,
      [
        req.session.user.id,
        orderNumber,
        subtotal,
        shipping,
        total,
        delivery.fullName,
        delivery.phone,
        delivery.address,
        delivery.city,
        delivery.postalCode
      ]
    );
    await client.query(
      `UPDATE users
       SET full_name = $1, phone = $2, address = $3, city = $4, postal_code = $5
       WHERE id = $6`,
      [delivery.fullName, delivery.phone, delivery.address, delivery.city, delivery.postalCode, req.session.user.id]
    );
    for (const item of cart.rows) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity)
         VALUES ($1, $2, $3, $4, $5)`,
        [order.rows[0].id, item.product_id, item.name, item.price, item.quantity]
      );
    }
    await client.query('DELETE FROM cart_items WHERE user_id = $1', [req.session.user.id]);
    await client.query('COMMIT');
    req.session.user.fullName = delivery.fullName;
    res.status(201).json({ order: order.rows[0], message: 'Your cash-on-delivery order has been placed.' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Checkout failed:', error);
    res.status(500).json({ error: 'Unable to place your order right now.' });
  } finally {
    client.release();
  }
});

app.post('/api/support', requireAuth, async (req, res) => {
  const subject = typeof req.body?.subject === 'string' ? req.body.subject.trim() : '';
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (subject.length < 3 || subject.length > 160 || message.length < 10 || message.length > 5000) {
    return res.status(400).json({ error: 'Add a subject and a message between 10 and 5,000 characters.' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO support_requests (user_id, subject, message)
       VALUES ($1, $2, $3) RETURNING id, created_at`,
      [req.session.user.id, subject, message]
    );
    res.status(201).json({ request: result.rows[0], message: 'Your support request has been received.' });
  } catch (error) {
    console.error('Support request could not be saved:', error);
    res.status(500).json({ error: 'Unable to send your support request right now.' });
  }
});

app.post('/api/register', async (req, res) => {
  const { fullName, email, phone, address, city, postalCode, password } = req.body || {};
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const profile = {
    fullName: typeof fullName === 'string' ? fullName.trim() : '',
    phone: typeof phone === 'string' ? phone.trim() : '',
    address: typeof address === 'string' ? address.trim() : '',
    city: typeof city === 'string' ? city.trim() : '',
    postalCode: typeof postalCode === 'string' ? postalCode.trim() : ''
  };
  if (profile.fullName.length < 2 || profile.fullName.length > 150 || !normalizedEmail ||
      profile.phone.length < 6 || profile.phone.length > 30 ||
      profile.address.length < 5 || profile.address.length > 250 ||
      profile.city.length < 2 || profile.city.length > 100 ||
      profile.postalCode.length < 3 || profile.postalCode.length > 20 ||
      typeof password !== 'string') {
    return res.status(400).json({ error: 'Enter your name, email, phone, complete delivery address, and password.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }
  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO users (full_name, email, phone, address, city, postal_code, password_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, full_name, email, phone, role`,
      [profile.fullName, normalizedEmail, profile.phone, profile.address, profile.city, profile.postalCode, passwordHash]
    );
    await signIn(req, result.rows[0]);
    res.status(201).json({ user: req.session.user });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'This email is already registered. Please sign in.' });
    }
    console.error('Registration failed:', error);
    res.status(500).json({ error: 'Unable to create your account right now.' });
  }
});

app.post('/api/login', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = req.body?.password;
  if (!email || typeof password !== 'string' || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    const result = await pool.query(
      `SELECT id, full_name, email, phone, role, password_hash
       FROM users WHERE LOWER(email) = $1`,
      [email]
    );
    if (!result.rowCount || !result.rows[0].password_hash) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    const user = result.rows[0];
    const storedHash = user.password_hash;
    const valid = storedHash.startsWith('$2')
      ? await bcrypt.compare(password, storedHash)
      : /^[a-f0-9]{64}$/i.test(storedHash) &&
        crypto.timingSafeEqual(Buffer.from(sha256(password)), Buffer.from(storedHash));
    if (!valid) return res.status(401).json({ error: 'Invalid email or password.' });

    if (!storedHash.startsWith('$2')) {
      const upgradedHash = await bcrypt.hash(password, 12);
      await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [upgradedHash, user.id]);
    }
    await signIn(req, user, req.body.rememberMe !== false);
    res.json({ user: req.session.user });
  } catch (error) {
    console.error('Login failed:', error);
    res.status(500).json({ error: 'Unable to sign in right now.' });
  }
});

app.get('/auth/google', async (req, res) => {
  try {
    const config = requireProviderConfig('google', ['clientId', 'clientSecret']);
    const nonce = randomToken();
    req.session.oauthInProgress = true;
    await saveSession(req);
    const state = await createOAuthState('google', req, null, nonce);
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.callback,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      nonce
    }).toString();
    res.redirect(url.toString());
  } catch (error) {
    if (error.status === 503) return res.redirect('/login.html?provider_setup=google');
    oauthError(res, error.status || 500, error.message || 'Google sign-in is unavailable.');
  }
});

app.get('/auth/google/callback', async (req, res) => {
  try {
    const config = requireProviderConfig('google', ['clientId', 'clientSecret']);
    const state = await consumeOAuthState(req.query.state, 'google', req);
    if (!state || !req.query.code) return oauthError(res, 400, 'The Google sign-in request expired or could not be verified.');
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: req.query.code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.callback,
        grant_type: 'authorization_code'
      })
    });
    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenData.id_token) throw new Error('Google did not return a valid sign-in token.');
    const claims = await verifyJwt(tokenData.id_token, 'https://www.googleapis.com/oauth2/v3/certs', ['accounts.google.com', 'https://accounts.google.com'], config.clientId, state.nonce);
    if (!claims.sub || !claims.email || claims.email_verified !== true) throw new Error('Google account email is missing or unverified.');
    const user = await saveOAuthUser('google', claims.sub, claims.email, claims.name);
    await signIn(req, user);
    res.redirect('/home');
  } catch (error) {
    console.error('Google OAuth failed:', error.message);
    oauthError(res, 401, 'Google sign-in was not completed. Please try again.');
  }
});

app.get('/auth/apple', async (req, res) => {
  try {
    const config = requireProviderConfig('apple', ['clientId', 'teamId', 'keyId', 'privateKey']);
    const nonce = randomToken();
    req.session.oauthInProgress = true;
    await saveSession(req);
    const state = await createOAuthState('apple', req, null, nonce);
    const url = new URL('https://appleid.apple.com/auth/authorize');
    url.search = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.callback,
      response_type: 'code',
      response_mode: 'form_post',
      scope: 'name email',
      state,
      nonce
    }).toString();
    res.redirect(url.toString());
  } catch (error) {
    oauthError(res, error.status || 500, error.message || 'Apple sign-in is unavailable.');
  }
});

app.post('/auth/apple/callback', async (req, res) => {
  try {
    const config = requireProviderConfig('apple', ['clientId', 'teamId', 'keyId', 'privateKey']);
    const state = await consumeOAuthState(req.body.state, 'apple', req);
    if (!state || !req.body.code) return oauthError(res, 400, 'The Apple sign-in request expired or could not be verified.');
    const { SignJWT, importPKCS8 } = await importJose();
    const key = await importPKCS8(config.privateKey, 'ES256');
    const clientSecret = await new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: config.keyId })
      .setIssuer(config.teamId)
      .setSubject(config.clientId)
      .setAudience('https://appleid.apple.com')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(key);
    const tokenResponse = await fetch('https://appleid.apple.com/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: req.body.code,
        client_id: config.clientId,
        client_secret: clientSecret,
        redirect_uri: config.callback,
        grant_type: 'authorization_code'
      })
    });
    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenData.id_token) throw new Error('Apple did not return a valid sign-in token.');
    const claims = await verifyJwt(tokenData.id_token, 'https://appleid.apple.com/auth/keys', 'https://appleid.apple.com', config.clientId, state.nonce);
    if (!claims.sub) throw new Error('Apple account identity is missing.');
    let fullName;
    if (req.body.user) {
      try {
        const name = JSON.parse(req.body.user).name || {};
        fullName = [name.firstName, name.lastName].filter(Boolean).join(' ');
      } catch (error) {
        console.warn('Apple did not provide a readable profile name:', error.message);
      }
    }
    const user = await saveOAuthUser('apple', claims.sub, claims.email, fullName);
    await signIn(req, user);
    res.redirect('/home');
  } catch (error) {
    console.error('Apple OAuth failed:', error.message);
    oauthError(res, 401, 'Apple sign-in was not completed. Please try again.');
  }
});

app.get('/auth/x', async (req, res) => {
  try {
    const config = requireProviderConfig('x', ['clientId']);
    const codeVerifier = randomToken(48);
    req.session.oauthInProgress = true;
    await saveSession(req);
    const state = await createOAuthState('x', req, codeVerifier);
    const challenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    const url = new URL('https://twitter.com/i/oauth2/authorize');
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: config.clientId,
      redirect_uri: config.callback,
      scope: 'users.read tweet.read',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256'
    }).toString();
    res.redirect(url.toString());
  } catch (error) {
    oauthError(res, error.status || 500, error.message || 'X sign-in is unavailable.');
  }
});

app.get('/auth/x/callback', async (req, res) => {
  try {
    const config = requireProviderConfig('x', ['clientId']);
    const state = await consumeOAuthState(req.query.state, 'x', req);
    if (!state || !req.query.code) return oauthError(res, 400, 'The X sign-in request expired or could not be verified.');
    const form = new URLSearchParams({
      code: req.query.code,
      grant_type: 'authorization_code',
      client_id: config.clientId,
      redirect_uri: config.callback,
      code_verifier: state.code_verifier
    });
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    if (config.clientSecret) {
      headers.Authorization = `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`;
      form.delete('client_id');
    }
    const tokenResponse = await fetch('https://api.x.com/2/oauth2/token', { method: 'POST', headers, body: form });
    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenData.access_token) throw new Error('X did not return a valid sign-in token.');
    const profileResponse = await fetch('https://api.x.com/2/users/me?user.fields=name,username', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const profileData = await profileResponse.json();
    if (!profileResponse.ok || !profileData.data?.id) throw new Error('Unable to read the X profile.');
    const user = await saveOAuthUser('x', profileData.data.id, null, profileData.data.name || profileData.data.username);
    await signIn(req, user);
    res.redirect('/home');
  } catch (error) {
    console.error('X OAuth failed:', error.message);
    oauthError(res, 401, 'X sign-in was not completed. Please try again.');
  }
});

app.post('/auth/logout', (req, res, next) => {
  req.session.destroy(error => {
    if (error) return next(error);
    res.clearCookie('novatek.sid');
    res.redirect('/login.html');
  });
});

app.get('/favicon.ico', (_, res) => res.status(204).end());
app.use((req, res) => res.status(404).type('text').send('Not found.'));
app.use((error, req, res, next) => {
  console.error('Unhandled request error:', error);
  if (res.headersSent) return next(error);
  res.status(500).json({ error: 'An unexpected server error occurred.' });
});

async function initializeDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        image_url TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        category_id INTEGER REFERENCES categories(id),
        price NUMERIC(10,2) NOT NULL,
        old_price NUMERIC(10,2),
        image_url TEXT,
        badge VARCHAR(50),
        badge_type VARCHAR(20),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        full_name VARCHAR(150),
        email VARCHAR(255) UNIQUE,
        phone VARCHAR(30),
        address VARCHAR(250),
        city VARCHAR(100),
        postal_code VARCHAR(20),
        password_hash VARCHAR(255),
        role VARCHAR(50) DEFAULT 'customer',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS support_requests (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        subject VARCHAR(160) NOT NULL,
        message TEXT NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'open',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS cart_items (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 99),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, product_id)
      );
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        order_number VARCHAR(60) NOT NULL UNIQUE,
        subtotal NUMERIC(10, 2) NOT NULL,
        shipping NUMERIC(10, 2) NOT NULL,
        total NUMERIC(10, 2) NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'placed',
        payment_method VARCHAR(30) NOT NULL DEFAULT 'cash_on_delivery',
        shipping_name VARCHAR(150) NOT NULL,
        shipping_phone VARCHAR(30) NOT NULL,
        shipping_address VARCHAR(250) NOT NULL,
        shipping_city VARCHAR(100) NOT NULL,
        shipping_postal_code VARCHAR(20) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
        order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
        product_name VARCHAR(150) NOT NULL,
        unit_price NUMERIC(10, 2) NOT NULL,
        quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 99)
      );
      ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
      ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS address VARCHAR(250);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS city VARCHAR(100);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS postal_code VARCHAR(20);
      CREATE TABLE IF NOT EXISTS oauth_accounts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider VARCHAR(20) NOT NULL,
        provider_user_id VARCHAR(255) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (provider, provider_user_id)
      );
      CREATE TABLE IF NOT EXISTS oauth_states (
        state_hash CHAR(64) PRIMARY KEY,
        provider VARCHAR(20) NOT NULL,
        session_id VARCHAR(255) NOT NULL,
        code_verifier TEXT,
        nonce TEXT,
        expires_at TIMESTAMPTZ NOT NULL
      );
      ALTER TABLE oauth_states ADD COLUMN IF NOT EXISTS session_id VARCHAR(255);
    `);

    const adminEmail = typeof process.env.ADMIN_EMAIL === 'string' ? process.env.ADMIN_EMAIL.trim().toLowerCase() : '';
    if (adminEmail) {
      await client.query(
        `UPDATE users SET role = 'admin' WHERE LOWER(email) = $1`,
        [adminEmail]
      );
    }

    const categoryCount = await client.query('SELECT COUNT(*)::int AS count FROM categories');
    if (categoryCount.rows[0].count === 0) {
      await client.query(`
        INSERT INTO categories (name, image_url) VALUES
          ('Smartphones', 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=600&q=80'),
          ('Laptops', 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=600&q=80'),
          ('Audio', 'https://images.unsplash.com/photo-1546435770-a3e426bf472b?auto=format&fit=crop&w=600&q=80'),
          ('Wearables', 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=80'),
          ('Accessories', 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=600&q=80'),
          ('Smart Home', 'https://images.unsplash.com/photo-1585386959984-a4155224a1ad?auto=format&fit=crop&w=600&q=80');
      `);
    }
    const productCount = await client.query('SELECT COUNT(*)::int AS count FROM products');
    if (productCount.rows[0].count === 0) {
      await client.query(`
        INSERT INTO products (name, category_id, price, old_price, image_url, badge, badge_type) VALUES
          ('NovaPhone 15 Pro', 1, 999.00, NULL, 'https://images.unsplash.com/photo-1598327105666-5b89351aff97?auto=format&fit=crop&w=900&q=80', 'New', 'new'),
          ('NovaBuds Pro', 3, 199.00, NULL, 'https://images.unsplash.com/photo-1583394838336-acd977736f90?auto=format&fit=crop&w=900&q=80', 'Best Seller', 'orange'),
          ('NovaBook Air M2', 2, 1299.00, NULL, 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=900&q=80', 'Sale', 'green'),
          ('NovaWatch X', 4, 249.00, 299.00, 'https://images.unsplash.com/photo-1546868871-7041f2a55e12?auto=format&fit=crop&w=900&q=80', NULL, NULL);
      `);
    }
    await client.query(`
      INSERT INTO products (name, category_id, price, old_price, image_url, badge, badge_type)
      SELECT seed.name, category.id, seed.price, seed.old_price, seed.image_url, seed.badge, seed.badge_type
      FROM (VALUES
        ('NovaPhone 15', 'Smartphones', 799.00, 899.00, 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=900&q=80', 'Save $100', 'green'),
        ('NovaPhone SE', 'Smartphones', 449.00, NULL, 'https://images.unsplash.com/photo-1592899677977-9c10ca588bbd?auto=format&fit=crop&w=900&q=80', 'New', 'new'),
        ('NovaPad 11', 'Accessories', 599.00, NULL, 'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?auto=format&fit=crop&w=900&q=80', 'New', 'new'),
        ('NovaBook Pro 14', 'Laptops', 1599.00, 1749.00, 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=900&q=80', 'Save $150', 'green'),
        ('NovaBuds Lite', 'Audio', 79.00, NULL, 'https://images.unsplash.com/photo-1606220945770-b5b6c2c55bf1?auto=format&fit=crop&w=900&q=80', 'Best Seller', 'orange'),
        ('NovaSound Mini', 'Audio', 129.00, 159.00, 'https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?auto=format&fit=crop&w=900&q=80', 'Save $30', 'green'),
        ('NovaWatch SE', 'Wearables', 179.00, NULL, 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=80', 'New', 'new'),
        ('NovaFit Band', 'Wearables', 69.00, NULL, 'https://images.unsplash.com/photo-1557935728-e6d1eaabe558?auto=format&fit=crop&w=900&q=80', NULL, NULL),
        ('NovaCharge 3-in-1', 'Accessories', 89.00, 109.00, 'https://images.unsplash.com/photo-1609592806596-b43bada2f6b9?auto=format&fit=crop&w=900&q=80', 'Save $20', 'green'),
        ('NovaPower 20K', 'Accessories', 59.00, NULL, 'https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?auto=format&fit=crop&w=900&q=80', 'Best Seller', 'orange'),
        ('NovaHome Cam', 'Smart Home', 99.00, NULL, 'https://images.unsplash.com/photo-1558002038-1055907df827?auto=format&fit=crop&w=900&q=80', 'New', 'new'),
        ('NovaGlow Smart Bulb', 'Smart Home', 29.00, 39.00, 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=900&q=80', 'Save $10', 'green')
      ) AS seed(name, category_name, price, old_price, image_url, badge, badge_type)
      JOIN categories AS category ON category.name = seed.category_name
      WHERE NOT EXISTS (
        SELECT 1 FROM products AS existing WHERE existing.name = seed.name
      );
    `);
    const catalogCategories = await client.query(
      `SELECT id, name FROM categories WHERE name = ANY($1::text[])`,
      [Object.keys(productCatalogSeed)]
    );
    for (const category of catalogCategories.rows) {
      const catalog = productCatalogSeed[category.name];
      const existingProducts = await client.query(
        'SELECT name FROM products WHERE category_id = $1',
        [category.id]
      );
      const existingNames = new Set(existingProducts.rows.map(product => product.name));
      const additions = catalog.products
        .filter(([name]) => !existingNames.has(name))
        .slice(0, Math.max(0, catalog.target - existingProducts.rowCount))
        .map(([name, price], index) => {
          const oldPrice = index % 4 === 3 ? Math.round(price * 1.15) : null;
          const badge = oldPrice ? 'Special offer' : index === 0 ? 'New' : index === 1 ? 'Best Seller' : null;
          const badgeType = oldPrice ? 'green' : index === 0 ? 'new' : index === 1 ? 'orange' : null;
          return {
            name,
            price,
            old_price: oldPrice,
            image_url: `/product-images/pending-${index}.svg`,
            badge,
            badge_type: badgeType
          };
        });
      if (existingProducts.rowCount + additions.length < catalog.target) {
        throw new Error(`Product seed is missing entries for ${category.name}.`);
      }
      if (additions.length) {
        await client.query(
          `INSERT INTO products (name, category_id, price, old_price, image_url, badge, badge_type)
           SELECT seed.name, $1, seed.price, seed.old_price, seed.image_url, seed.badge, seed.badge_type
           FROM jsonb_to_recordset($2::jsonb) AS seed(
             name text, price numeric, old_price numeric, image_url text, badge text, badge_type text
           )`,
          [category.id, JSON.stringify(additions)]
        );
      }
    }
    await client.query(
      `UPDATE products
       SET image_url = '/product-images/' || id || '.svg'
       WHERE image_url IS DISTINCT FROM '/product-images/' || id || '.svg'`
    );
  } finally {
    client.release();
  }
}

async function start() {
  try {
    await pool.query('SELECT 1');
    await initializeDatabase();
    app.listen(port, () => console.log(`NOVATEK server running on ${appUrl}`));
  } catch (error) {
    console.error('Database connection failed:', error.message);
    process.exit(1);
  }
}

start();
