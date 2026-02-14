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

const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN || '';
const TG_ADMIN_CHAT_ID = process.env.TG_ADMIN_CHAT_ID || '';
const TG_ADMIN_IDS = new Set(String(process.env.TG_ADMIN_IDS || '').split(',').map((id) => id.trim()).filter(Boolean));

const sessions = new Map();
const allowedProofMime = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const maxProofBytes = 5 * 1024 * 1024;

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use('/uploads', express.static(PROOF_DIR));
app.use(express.static(path.join(__dirname)));

function ensureDirs() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.mkdirSync(PROOF_DIR, { recursive: true });
}

function sqlEscape(value) {
    if (value === null || value === undefined) {
        return 'NULL';
    }
    if (typeof value === 'number') {
        return Number.isFinite(value) ? String(value) : 'NULL';
    }
    return `'${String(value).replace(/'/g, "''")}'`;
}

function runSql(sql) {
    execFileSync('sqlite3', [DB_PATH, sql], { stdio: 'pipe' });
}

function querySql(sql) {
    const raw = execFileSync('sqlite3', ['-json', DB_PATH, sql], { encoding: 'utf8' });
    const parsed = raw.trim() ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
}

function single(sql) {
    return querySql(sql)[0] || null;
}

function nowSql() {
    return "datetime('now')";
}

const ENC_KEY = crypto.createHash('sha256').update(process.env.STOCK_SECRET_KEY || 'demo-stock-secret-change-me').digest();
function encryptSecret(plain) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv);
    const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

function decryptSecret(payload) {
    const [ivHex, tagHex, dataHex] = String(payload).split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
}

function normalizeToken(token) {
    return token && token.startsWith('Bearer ') ? token.slice(7) : token;
}

function authRequired(req, res, next) {
    const token = normalizeToken(req.headers.authorization);
    if (!token || !sessions.has(token)) {
        return res.status(401).json({ success: false, message: 'Unauthorized.' });
    }
    req.user = sessions.get(token);
    next();
}

function adminRequired(req, res, next) {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Akses khusus admin.' });
    }
    next();
}

async function sendTelegram(payload) {
    if (!TG_BOT_TOKEN || !TG_ADMIN_CHAT_ID) {
        return;
    }
    try {
        await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: TG_ADMIN_CHAT_ID, parse_mode: 'HTML', ...payload })
        });
    } catch (error) {
        console.error('[TELEGRAM] sendMessage failed', error.message);
    }
}

function createAuditLog({ adminUserId = null, actor, action, invoiceId = null, userId = null, meta = {} }) {
    runSql(`INSERT INTO audit_logs (admin_user_id, actor, action, invoice_id, user_id, meta_json, created_at)
        VALUES (${sqlEscape(adminUserId)}, ${sqlEscape(actor)}, ${sqlEscape(action)}, ${sqlEscape(invoiceId)}, ${sqlEscape(userId)}, ${sqlEscape(JSON.stringify(meta))}, ${nowSql()});`);
}

function initDb() {
    ensureDirs();
    runSql(`
    PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('admin','customer')),
        name TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        description TEXT,
        price INTEGER NOT NULL,
        stock INTEGER NOT NULL DEFAULT 0,
        badge TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        payment_method TEXT NOT NULL,
        status TEXT NOT NULL,
        rejection_reason TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (product_id) REFERENCES products(id)
    );
    CREATE TABLE IF NOT EXISTS payment_proofs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        source TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        original_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        telegram_file_id TEXT,
        status TEXT NOT NULL DEFAULT 'PENDING',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (invoice_id) REFERENCES invoices(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS premium_account_stock (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        account_email TEXT NOT NULL,
        account_password_encrypted TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'AVAILABLE',
        assigned_invoice_id INTEGER,
        assigned_user_id INTEGER,
        created_by_admin_id INTEGER,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        assigned_at TEXT,
        FOREIGN KEY (product_id) REFERENCES products(id)
    );
    CREATE TABLE IF NOT EXISTS user_premium_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        invoice_id INTEGER NOT NULL,
        stock_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        account_email TEXT NOT NULL,
        account_password_encrypted TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (invoice_id) REFERENCES invoices(id),
        FOREIGN KEY (stock_id) REFERENCES premium_account_stock(id)
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        admin_user_id INTEGER,
        actor TEXT NOT NULL,
        action TEXT NOT NULL,
        invoice_id INTEGER,
        user_id INTEGER,
        meta_json TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    `);

    const userCount = single('SELECT COUNT(*) AS count FROM users;').count;
    if (!userCount) {
        runSql(`INSERT INTO users (email, password, role, name) VALUES
            ('admin@digitalshop.com', 'admin123', 'admin', 'Super Admin'),
            ('buyer@digitalshop.com', 'buyer123', 'customer', 'Digital Buyer');`);
    }

    const productCount = single('SELECT COUNT(*) AS count FROM products;').count;
    if (!productCount) {
        runSql(`INSERT INTO products (name, category, description, price, stock, badge) VALUES
            ('Vidio Premium 30 Hari', 'Streaming', 'Akun Vidio Premium aktif 30 hari, siap pakai.', 45000, 12, 'Best Seller'),
            ('Netflix Private 1 Profile', 'Streaming', 'Akses 1 profile private, garansi replace.', 55000, 9, 'Popular'),
            ('Canva Pro 1 Bulan', 'Productivity', 'Akses Canva Pro full fitur untuk kebutuhan desain.', 35000, 20, 'Promo');`);
    }
}

function parseStockLines(input) {
    const lines = String(input || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const parsed = [];
    for (const [idx, line] of lines.entries()) {
        const [email, password, ...rest] = line.split('|');
        if (rest.length || !email || !password) {
            throw new Error(`Format stok tidak valid di baris ${idx + 1}. Gunakan email|password.`);
        }
        parsed.push({ email: email.trim(), password: password.trim() });
    }
    if (!parsed.length) {
        throw new Error('Input stok kosong.');
    }
    return parsed;
}

function assignStockToPaidInvoice(invoiceId, actor = 'system', adminUserId = null) {
    const invoice = single(`SELECT * FROM invoices WHERE id = ${sqlEscape(invoiceId)};`);
    if (!invoice) {
        throw new Error('Invoice tidak ditemukan.');
    }
    if (invoice.status !== 'PAID') {
        throw new Error('Invoice harus status PAID sebelum assign.');
    }

    const stock = single(`SELECT * FROM premium_account_stock
        WHERE product_id = ${sqlEscape(invoice.product_id)} AND status = 'AVAILABLE'
        ORDER BY id ASC LIMIT 1;`);

    if (!stock) {
        runSql(`UPDATE invoices SET status = 'PAID_BUT_OUT_OF_STOCK', updated_at = ${nowSql()} WHERE id = ${sqlEscape(invoice.id)};`);
        createAuditLog({ adminUserId, actor, action: 'AUTO_ASSIGN_NO_STOCK', invoiceId: invoice.id, userId: invoice.user_id });
        sendTelegram({ text: `⚠️ Invoice #${invoice.id} sudah PAID tetapi stok habis untuk product_id ${invoice.product_id}.` });
        return { assigned: false, outOfStock: true };
    }

    runSql(`UPDATE premium_account_stock SET
        status = 'ASSIGNED', assigned_invoice_id = ${sqlEscape(invoice.id)}, assigned_user_id = ${sqlEscape(invoice.user_id)}, assigned_at = ${nowSql()}
        WHERE id = ${sqlEscape(stock.id)};`);

    runSql(`INSERT INTO user_premium_accounts (user_id, invoice_id, stock_id, product_id, account_email, account_password_encrypted)
        VALUES (${sqlEscape(invoice.user_id)}, ${sqlEscape(invoice.id)}, ${sqlEscape(stock.id)}, ${sqlEscape(invoice.product_id)},
        ${sqlEscape(stock.account_email)}, ${sqlEscape(stock.account_password_encrypted)});`);

    createAuditLog({ adminUserId, actor, action: 'AUTO_ASSIGN_SUCCESS', invoiceId: invoice.id, userId: invoice.user_id, meta: { stockId: stock.id } });
    sendTelegram({ text: `✅ Account berhasil di-assign untuk Invoice #${invoice.id}. Stock ID: ${stock.id}.` });
    return { assigned: true, outOfStock: false };
}

function approveInvoice(invoiceId, adminUserId, actor = 'admin_panel') {
    const invoice = single(`SELECT * FROM invoices WHERE id = ${sqlEscape(invoiceId)};`);
    if (!invoice) {
        throw new Error('Invoice tidak ditemukan.');
    }
    if (!['WAITING_PROOF', 'UNPAID'].includes(invoice.status)) {
        throw new Error(`Invoice tidak bisa di-approve dari status ${invoice.status}.`);
    }

    runSql(`UPDATE invoices SET status = 'PAID', updated_at = ${nowSql()} WHERE id = ${sqlEscape(invoice.id)};`);
    runSql(`UPDATE payment_proofs SET status = 'APPROVED' WHERE invoice_id = ${sqlEscape(invoice.id)};`);
    createAuditLog({ adminUserId, actor, action: 'PAYMENT_APPROVED', invoiceId: invoice.id, userId: invoice.user_id });

    const result = assignStockToPaidInvoice(invoiceId, actor, adminUserId);
    return result;
}

function rejectInvoice(invoiceId, reason, adminUserId, actor = 'admin_panel') {
    runSql(`UPDATE invoices SET status = 'REJECTED', rejection_reason = ${sqlEscape(reason)}, updated_at = ${nowSql()}
        WHERE id = ${sqlEscape(invoiceId)};`);
    runSql(`UPDATE payment_proofs SET status = 'REJECTED' WHERE invoice_id = ${sqlEscape(invoiceId)};`);
    const invoice = single(`SELECT * FROM invoices WHERE id = ${sqlEscape(invoiceId)};`);
    if (!invoice) {
        throw new Error('Invoice tidak ditemukan.');
    }
    createAuditLog({ adminUserId, actor, action: 'PAYMENT_REJECTED', invoiceId, userId: invoice.user_id, meta: { reason } });
}

app.get('/api/health', (_, res) => {
    res.json({ success: true, message: 'API ready' });
});

app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Email dan password wajib diisi.' });
    }

    const normalizedEmail = String(email).trim().toLowerCase().replace(/@digitalshop\.local$/, '@digitalshop.com');
    const user = single(`SELECT id, email, role, name FROM users
        WHERE email = ${sqlEscape(normalizedEmail)} AND password = ${sqlEscape(password)} LIMIT 1;`);

    if (!user) {
        return res.status(401).json({ success: false, message: 'Email atau password tidak valid.' });
    }

    const token = crypto.randomBytes(24).toString('hex');
    sessions.set(token, user);
    res.json({ success: true, token, user });
});

app.post('/api/logout', authRequired, (req, res) => {
    sessions.delete(normalizeToken(req.headers.authorization));
    res.json({ success: true, message: 'Logout berhasil.' });
});

app.get('/api/me', authRequired, (req, res) => {
    res.json({ success: true, user: req.user });
});

app.get('/api/products', authRequired, (req, res) => {
    const products = querySql('SELECT * FROM products ORDER BY id ASC;');
    res.json({ success: true, products });
});

app.patch('/api/admin/products/:id/stock', authRequired, adminRequired, (req, res) => {
    const id = Number(req.params.id);
    const stock = Number(req.body.stock);
    if (!Number.isInteger(id) || !Number.isInteger(stock) || stock < 0) {
        return res.status(400).json({ success: false, message: 'ID atau stock tidak valid.' });
    }
    runSql(`UPDATE products SET stock = ${sqlEscape(stock)} WHERE id = ${sqlEscape(id)};`);
    const product = single(`SELECT * FROM products WHERE id = ${sqlEscape(id)};`);
    if (!product) {
        return res.status(404).json({ success: false, message: 'Produk tidak ditemukan.' });
    }
    createAuditLog({ adminUserId: req.user.id, actor: 'admin_panel', action: 'PRODUCT_DISPLAY_STOCK_UPDATED', meta: { productId: id, stock } });
    res.json({ success: true, product });
});

app.post('/api/orders/manual', authRequired, (req, res) => {
    const productId = Number(req.body.productId);
    const product = single(`SELECT * FROM products WHERE id = ${sqlEscape(productId)};`);
    if (!product) {
        return res.status(404).json({ success: false, message: 'Produk tidak ditemukan.' });
    }

    runSql(`INSERT INTO invoices (user_id, product_id, amount, payment_method, status, created_at, updated_at)
        VALUES (${sqlEscape(req.user.id)}, ${sqlEscape(productId)}, ${sqlEscape(product.price)}, 'MANUAL_PAYMENT', 'UNPAID', ${nowSql()}, ${nowSql()});`);
    const invoice = single('SELECT * FROM invoices ORDER BY id DESC LIMIT 1;');
    createAuditLog({ actor: 'client', action: 'INVOICE_CREATED', invoiceId: invoice.id, userId: req.user.id });
    res.json({ success: true, invoice });
});

app.get('/api/orders/my', authRequired, (req, res) => {
    const orders = querySql(`SELECT i.*, p.name AS product_name FROM invoices i
        JOIN products p ON p.id = i.product_id
        WHERE i.user_id = ${sqlEscape(req.user.id)}
        ORDER BY i.id DESC;`);
    res.json({ success: true, orders });
});

app.post('/api/orders/:id/proofs', authRequired, (req, res) => {
    const invoiceId = Number(req.params.id);
    const { fileName, mimeType, contentBase64, source = 'web', telegramFileId = null } = req.body;
    const invoice = single(`SELECT * FROM invoices WHERE id = ${sqlEscape(invoiceId)} AND user_id = ${sqlEscape(req.user.id)} LIMIT 1;`);

    if (!invoice) {
        return res.status(404).json({ success: false, message: 'Invoice tidak ditemukan.' });
    }

    if (!allowedProofMime.has(String(mimeType))) {
        return res.status(400).json({ success: false, message: 'Mime type file tidak diizinkan.' });
    }

    const buffer = Buffer.from(String(contentBase64 || ''), 'base64');
    if (!buffer.length || buffer.length > maxProofBytes) {
        return res.status(400).json({ success: false, message: 'Ukuran file tidak valid (maks 5MB).' });
    }

    const ext = (path.extname(fileName || '').replace('.', '') || 'bin').toLowerCase();
    const safeName = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
    const target = path.join(PROOF_DIR, safeName);
    fs.writeFileSync(target, buffer);

    runSql(`INSERT INTO payment_proofs (invoice_id, user_id, source, mime_type, original_name, file_path, telegram_file_id, status)
        VALUES (${sqlEscape(invoiceId)}, ${sqlEscape(req.user.id)}, ${sqlEscape(source)}, ${sqlEscape(mimeType)}, ${sqlEscape(fileName || safeName)},
        ${sqlEscape(`/uploads/${safeName}`)}, ${sqlEscape(telegramFileId)}, 'PENDING');`);

    runSql(`UPDATE invoices SET status = 'WAITING_PROOF', updated_at = ${nowSql()} WHERE id = ${sqlEscape(invoiceId)};`);
    createAuditLog({ actor: source === 'telegram' ? 'telegram' : 'client', action: 'PAYMENT_PROOF_UPLOADED', invoiceId, userId: req.user.id });

    sendTelegram({
        text: `📥 Bukti pembayaran masuk\nInvoice: #${invoiceId}\nUser: ${req.user.email}\nStatus: WAITING_PROOF`,
        reply_markup: {
            inline_keyboard: [[
                { text: `✅ Approve #${invoiceId}`, callback_data: `approve:${invoiceId}` },
                { text: `❌ Reject #${invoiceId}`, callback_data: `reject:${invoiceId}` }
            ]]
        }
    });

    res.json({ success: true, message: 'Bukti pembayaran berhasil diupload, menunggu review admin.' });
});

app.get('/api/my/premium-accounts', authRequired, (req, res) => {
    const rows = querySql(`SELECT upa.*, p.name AS product_name FROM user_premium_accounts upa
        JOIN products p ON p.id = upa.product_id
        WHERE upa.user_id = ${sqlEscape(req.user.id)}
        ORDER BY upa.id DESC;`);

    const accounts = rows.map((row) => ({
        ...row,
        account_password: decryptSecret(row.account_password_encrypted)
    }));
    res.json({ success: true, accounts });
});

app.get('/api/admin/invoices', authRequired, adminRequired, (req, res) => {
    const invoices = querySql(`SELECT i.*, u.email AS user_email, p.name AS product_name FROM invoices i
        JOIN users u ON u.id = i.user_id
        JOIN products p ON p.id = i.product_id
        ORDER BY i.id DESC LIMIT 200;`);
    res.json({ success: true, invoices });
});

app.post('/api/admin/invoices/:id/approve', authRequired, adminRequired, (req, res) => {
    try {
        const result = approveInvoice(Number(req.params.id), req.user.id, 'admin_panel');
        res.json({ success: true, result });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

app.post('/api/admin/invoices/:id/reject', authRequired, adminRequired, (req, res) => {
    const reason = String(req.body.reason || '').trim();
    if (!reason) {
        return res.status(400).json({ success: false, message: 'Alasan reject wajib diisi.' });
    }
    try {
        rejectInvoice(Number(req.params.id), reason, req.user.id, 'admin_panel');
        res.json({ success: true });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

app.post('/api/admin/premium-stock/bulk', authRequired, adminRequired, (req, res) => {
    const productId = Number(req.body.productId);
    const lines = req.body.lines;

    try {
        const parsed = parseStockLines(lines);
        for (const item of parsed) {
            runSql(`INSERT INTO premium_account_stock (product_id, account_email, account_password_encrypted, status, created_by_admin_id)
                VALUES (${sqlEscape(productId)}, ${sqlEscape(item.email)}, ${sqlEscape(encryptSecret(item.password))}, 'AVAILABLE', ${sqlEscape(req.user.id)});`);
        }
        createAuditLog({ adminUserId: req.user.id, actor: 'admin_panel', action: 'STOCK_BULK_ADDED', meta: { productId, count: parsed.length } });
        sendTelegram({ text: `📦 Admin menambahkan ${parsed.length} stok akun untuk product_id ${productId}.` });
        res.json({ success: true, count: parsed.length });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

app.get('/api/admin/premium-stock', authRequired, adminRequired, (req, res) => {
    const productId = Number(req.query.productId || 0);
    const filter = Number.isInteger(productId) && productId > 0 ? `WHERE s.product_id = ${sqlEscape(productId)}` : '';
    const rows = querySql(`SELECT s.*, p.name AS product_name FROM premium_account_stock s
        JOIN products p ON p.id = s.product_id
        ${filter}
        ORDER BY s.id DESC LIMIT 500;`);
    res.json({ success: true, stock: rows });
});

app.delete('/api/admin/premium-stock/:id', authRequired, adminRequired, (req, res) => {
    const stockId = Number(req.params.id);
    const stock = single(`SELECT * FROM premium_account_stock WHERE id = ${sqlEscape(stockId)};`);
    if (!stock) {
        return res.status(404).json({ success: false, message: 'Stok tidak ditemukan.' });
    }
    if (stock.status !== 'AVAILABLE') {
        return res.status(400).json({ success: false, message: 'Hanya stok AVAILABLE yang boleh dihapus.' });
    }
    runSql(`DELETE FROM premium_account_stock WHERE id = ${sqlEscape(stockId)};`);
    createAuditLog({ adminUserId: req.user.id, actor: 'admin_panel', action: 'STOCK_DELETED', meta: { stockId } });
    res.json({ success: true });
});

app.get('/api/admin/audit-logs', authRequired, adminRequired, (req, res) => {
    const logs = querySql('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 300;');
    res.json({ success: true, logs });
});

app.post('/api/telegram/webhook', async (req, res) => {
    const update = req.body || {};
    const msg = update.message;
    const cb = update.callback_query;

    const fromId = String((msg && msg.from && msg.from.id) || (cb && cb.from && cb.from.id) || '');
    if (!TG_ADMIN_IDS.has(fromId)) {
        return res.json({ success: true, ignored: true });
    }

    try {
        if (msg && typeof msg.text === 'string') {
            const text = msg.text.trim();
            if (text.startsWith('/addstock')) {
                const body = text.replace('/addstock', '').trim();
                const lines = body || (msg.reply_to_message ? msg.reply_to_message.text : '');
                const parsed = parseStockLines(lines);
                const productId = 1;
                for (const item of parsed) {
                    runSql(`INSERT INTO premium_account_stock (product_id, account_email, account_password_encrypted, status)
                        VALUES (${sqlEscape(productId)}, ${sqlEscape(item.email)}, ${sqlEscape(encryptSecret(item.password))}, 'AVAILABLE');`);
                }
                createAuditLog({ actor: 'telegram', action: 'STOCK_BULK_ADDED_TELEGRAM', meta: { count: parsed.length } });
                await sendTelegram({ text: `✅ /addstock berhasil. ${parsed.length} akun ditambahkan.` });
            }

            if (text.startsWith('/reject')) {
                const [, invoiceIdRaw, ...reasonWords] = text.split(' ');
                const reason = reasonWords.join(' ').trim();
                if (!invoiceIdRaw || !reason) {
                    await sendTelegram({ text: 'Format: /reject <invoiceId> <alasan>' });
                } else {
                    rejectInvoice(Number(invoiceIdRaw), reason, null, 'telegram');
                    await sendTelegram({ text: `❌ Invoice #${invoiceIdRaw} direject. Alasan: ${reason}` });
                }
            }
        }

        if (cb && cb.data) {
            const [action, invoiceIdRaw] = cb.data.split(':');
            const invoiceId = Number(invoiceIdRaw);
            if (action === 'approve') {
                const result = approveInvoice(invoiceId, null, 'telegram');
                await sendTelegram({ text: `✅ Invoice #${invoiceId} approved. Assigned: ${result.assigned ? 'YA' : 'TIDAK'}.` });
            }
            if (action === 'reject') {
                await sendTelegram({ text: `Kirim /reject ${invoiceId} <alasan> untuk reject invoice.` });
            }
        }

        res.json({ success: true });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

app.post('/api/run-redeem', async (req, res) => {
    const { email, password, redeemCode } = req.body;
    if (!email || !password || !redeemCode) {
        return res.status(400).json({ success: false, message: 'Email, Password, atau Kode tidak boleh kosong!' });
    }

    let browser = null;
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--single-process', '--no-zygote'],
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1366, height: 768 });
        await page.goto(LOGIN_URL, { waitUntil: 'networkidle2', timeout: 60000 });

        const findSelector = async (selectors) => {
            for (const selector of selectors) {
                if (await page.$(selector)) {
                    return selector;
                }
            }
            return null;
        };

        const emailSel = await findSelector(['input[type="email"]', 'input[name="email"]', '#email', '.el-input__inner']);
        const passSel = await findSelector(['input[type="password"]', 'input[name="password"]', '#password']);
        const btnSel = await findSelector(['button[type="submit"]', '.btn-login', 'button.primary', 'button']);

        if (!emailSel || !passSel) {
            throw new Error('Form login tidak ditemukan. Struktur web mungkin berubah.');
        }

        await page.type(emailSel, email);
        await page.type(passSel, password);

        try {
            if (btnSel) {
                await Promise.all([page.click(btnSel), page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 })]);
            } else {
                await page.keyboard.press('Enter');
                await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
            }
        } catch {
        }

        await page.goto(TARGET_URL, { waitUntil: 'networkidle2' });
        await page.waitForSelector('input', { timeout: 15000 });
        await page.click('input', { clickCount: 3 });
        await page.type('input', redeemCode);

        const buttons = await page.$$('button');
        let clicked = false;
        for (const btn of buttons) {
            const text = await page.evaluate((el) => el.textContent.toLowerCase().trim(), btn);
            if (text.includes('redeem') || text.includes('buy') || text.includes('confirm') || text.includes('pay') || text.includes('exchange') || text.includes('tukar')) {
                await btn.click();
                clicked = true;
                break;
            }
        }

        if (!clicked) {
            await page.keyboard.press('Enter');
        }

        await new Promise((resolve) => setTimeout(resolve, 5000));
        res.json({ success: true, message: 'Eksekusi redeem selesai.' });
    } catch (error) {
        res.status(500).json({ success: false, message: `Gagal: ${error.message}` });
    } finally {
        if (browser) await browser.close();
    }
});

app.get('/shop', (_, res) => {
    res.sendFile(path.join(__dirname, 'shop.html'));
});

app.get('/clientarea', (_, res) => {
    res.sendFile(path.join(__dirname, 'clientarea.html'));
});

initDb();
app.listen(PORT, () => {
    console.log(`Server Backend Bot berjalan di port ${PORT}`);
});
