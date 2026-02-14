const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');

const users = [
    { id: 1, email: 'admin@digitalshop.local', password: 'admin123', role: 'admin', name: 'Super Admin' },
    { id: 2, email: 'buyer@digitalshop.local', password: 'buyer123', role: 'customer', name: 'Digital Buyer' }
];
const sessions = new Map();

const LOGIN_URL = 'https://www.cloudemulator.net/sign-in';
const TARGET_URL = 'https://www.cloudemulator.net/app/redeem-code/buy?utm_source=googleads&utm_medium=redfingerh5&utm_campaign=brand-ph&channelCode=web';

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname)));

const defaultProducts = [
    {
        id: 1,
        name: 'Vidio Premium 30 Hari',
        category: 'Streaming',
        description: 'Akun Vidio Premium aktif 30 hari, siap pakai.',
        price: 45000,
        stock: 12,
        badge: 'Best Seller'
    },
    {
        id: 2,
        name: 'Netflix Private 1 Profile',
        category: 'Streaming',
        description: 'Akses 1 profile private, garansi replace.',
        price: 55000,
        stock: 9,
        badge: 'Popular'
    },
    {
        id: 3,
        name: 'Canva Pro 1 Bulan',
        category: 'Productivity',
        description: 'Akses Canva Pro full fitur untuk kebutuhan desain.',
        price: 35000,
        stock: 20,
        badge: 'Promo'
    }
];

function ensureProductsFile() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (!fs.existsSync(PRODUCTS_FILE)) {
        fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(defaultProducts, null, 2), 'utf-8');
    }
}

function readProducts() {
    ensureProductsFile();
    const raw = fs.readFileSync(PRODUCTS_FILE, 'utf-8');
    return JSON.parse(raw);
}

function writeProducts(products) {
    fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(products, null, 2), 'utf-8');
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

app.get('/api/health', (_, res) => {
    res.json({ success: true, message: 'API ready' });
});

app.post('/api/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Email dan password wajib diisi.' });
    }

    const foundUser = users.find((u) => u.email === email && u.password === password);

    if (!foundUser) {
        return res.status(401).json({ success: false, message: 'Email atau password tidak valid.' });
    }

    const token = crypto.randomBytes(24).toString('hex');
    const sessionPayload = { id: foundUser.id, email: foundUser.email, role: foundUser.role, name: foundUser.name };
    sessions.set(token, sessionPayload);

    return res.json({ success: true, token, user: sessionPayload });
});

app.post('/api/logout', authRequired, (req, res) => {
    const token = normalizeToken(req.headers.authorization);
    sessions.delete(token);
    res.json({ success: true, message: 'Logout berhasil.' });
});

app.get('/api/products', authRequired, (req, res) => {
    const products = readProducts();
    res.json({ success: true, products });
});

app.patch('/api/admin/products/:id/stock', authRequired, adminRequired, (req, res) => {
    const id = Number(req.params.id);
    const { stock } = req.body;

    if (!Number.isInteger(id)) {
        return res.status(400).json({ success: false, message: 'ID produk tidak valid.' });
    }

    if (!Number.isInteger(stock) || stock < 0) {
        return res.status(400).json({ success: false, message: 'Stock harus berupa angka >= 0.' });
    }

    const products = readProducts();
    const index = products.findIndex((item) => item.id === id);

    if (index === -1) {
        return res.status(404).json({ success: false, message: 'Produk tidak ditemukan.' });
    }

    products[index].stock = stock;
    writeProducts(products);

    return res.json({ success: true, message: 'Stock berhasil diperbarui.', product: products[index] });
});

app.post('/api/run-redeem', async (req, res) => {
    const { email, password, redeemCode } = req.body;

    if (!email || !password || !redeemCode) {
        return res.status(400).json({ success: false, message: 'Email, Password, atau Kode tidak boleh kosong!' });
    }

    console.log(`[INFO] Memproses request untuk email: ${email}`);

    let browser = null;
    try {
        console.log('[INFO] Meluncurkan Browser...');
        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--single-process', '--no-zygote'],
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1366, height: 768 });

        console.log('--- Membuka Halaman Login ---');
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
                await Promise.all([
                    page.click(btnSel),
                    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 })
                ]);
            } else {
                await page.keyboard.press('Enter');
                await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
            }
        } catch {
            console.log('Info: Navigasi timeout atau sudah login, mencoba lanjut ke tahap berikutnya...');
        }

        console.log('--- Membuka Halaman Redeem ---');
        await page.goto(TARGET_URL, { waitUntil: 'networkidle2' });

        const redeemInputSel = 'input';
        await page.waitForSelector(redeemInputSel, { timeout: 15000 });
        await page.click(redeemInputSel, { clickCount: 3 });
        await page.type(redeemInputSel, redeemCode);

        const buttons = await page.$$('button');
        let clicked = false;
        let btnTextFound = '';

        for (const btn of buttons) {
            const text = await page.evaluate((el) => el.textContent.toLowerCase().trim(), btn);
            if (text.includes('redeem') || text.includes('buy') || text.includes('confirm') || text.includes('pay') || text.includes('exchange') || text.includes('tukar')) {
                btnTextFound = text;
                await btn.click();
                clicked = true;
                break;
            }
        }

        if (!clicked) {
            await page.keyboard.press('Enter');
            btnTextFound = 'ENTER Key';
        }

        await new Promise((resolve) => setTimeout(resolve, 5000));

        res.json({
            success: true,
            message: `Eksekusi Selesai (Tombol '${btnTextFound}' diklik). Silakan cek akun Anda.`
        });
    } catch (error) {
        console.error('[ERROR FATAL]', error);
        res.status(500).json({ success: false, message: `Gagal: ${error.message}` });
    } finally {
        if (browser) {
            await browser.close();
        }
    }
});

app.get('/shop', (_, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    ensureProductsFile();
    console.log(`Server Backend Bot berjalan di port ${PORT}`);
});
