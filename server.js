const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'app.db');
const PROOF_DIR = path.join(DATA_DIR, 'payment_proofs');

const LOGIN_URL = 'https://www.cloudemulator.net/sign-in';
const TARGET_URL = 'https://www.cloudemulator.net/app/redeem-code/buy?utm_source=googleads&utm_medium=redfingerh5&utm_campaign=brand-ph&channelCode=web';

const sessions = new Map();

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use('/uploads', express.static(PROOF_DIR));
app.use(express.static(path.join(__dirname)));

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(PROOF_DIR, { recursive: true });
}

function sqlEscape(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function runSql(sql) {
  execFileSync('sqlite3', [DB_PATH, sql], { stdio: 'pipe' });
}

function querySql(sql) {
  const raw = execFileSync('sqlite3', ['-json', DB_PATH, sql], { encoding: 'utf8' });
  return raw.trim() ? JSON.parse(raw) : [];
}

function single(sql) {
  return querySql(sql)[0] || null;
}

function nowSql() {
  return "datetime('now')";
}

function initDb() {
  ensureDirs();

  runSql(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    password TEXT,
    role TEXT,
    name TEXT
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    price INTEGER,
    stock INTEGER
  );

  CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    product_id INTEGER,
    amount INTEGER,
    status TEXT,
    created_at TEXT,
    updated_at TEXT
  );
  `);

  const userCount = single('SELECT COUNT(*) as count FROM users;').count;

  if (!userCount) {
    runSql(`
      INSERT INTO users (email, password, role, name) VALUES
      ('admin@digitalshop.com','admin123','admin','Super Admin'),
      ('buyer@digitalshop.com','buyer123','customer','Digital Buyer');
    `);
  }
}

function authRequired(req, res, next) {
  const token = req.headers.authorization;
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  req.user = sessions.get(token);
  next();
}

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;

  const user = single(`
    SELECT id, email, role, name FROM users
    WHERE email = ${sqlEscape(email)} AND password = ${sqlEscape(password)}
    LIMIT 1;
  `);

  if (!user) {
    return res.status(401).json({ success: false, message: 'Email atau password salah' });
  }

  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, user);

  res.json({ success: true, token, user });
});

app.get('/api/me', authRequired, (req, res) => {
  res.json({ success: true, user: req.user });
});

app.post('/api/orders/manual', authRequired, (req, res) => {
  const productId = Number(req.body.productId);
  const product = single(`SELECT * FROM products WHERE id = ${sqlEscape(productId)};`);

  if (!product) {
    return res.status(404).json({ success: false, message: 'Produk tidak ditemukan' });
  }

  runSql(`
    INSERT INTO invoices (user_id, product_id, amount, status, created_at, updated_at)
    VALUES (${sqlEscape(req.user.id)}, ${sqlEscape(productId)}, ${sqlEscape(product.price)}, 'UNPAID', ${nowSql()}, ${nowSql()});
  `);

  const invoice = single(`SELECT * FROM invoices ORDER BY id DESC LIMIT 1;`);

  res.json({ success: true, invoice });
});

app.get('/shop', (_, res) => {
  res.sendFile(path.join(__dirname, 'shop.html'));
});

app.get('/clientarea', (_, res) => {
  res.sendFile(path.join(__dirname, 'clientarea.html'));
});

app.get('/', (_, res) => {
  res.redirect('/shop');
});

initDb();

app.listen(PORT, () => {
  console.log(`Server berjalan di port ${PORT}`);
});