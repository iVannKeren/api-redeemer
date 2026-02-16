const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();

// CORS: biar Authorization header aman (termasuk preflight)
app.use(
  cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.options('*', cors());

app.use(express.json());

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getBearerToken(req) {
  const auth = req.headers.authorization || '';
  return auth.startsWith('Bearer ') ? auth.slice(7) : '';
}

async function authRequired(req, res, next) {
  try {
    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data?.user) {
      return res.status(401).json({ success: false, message: 'Token invalid/expired' });
    }

    req.accessToken = token;
    req.user = data.user;
    next();
  } catch (e) {
    return res.status(500).json({ success: false, message: 'Auth error' });
  }
}

// ==========================
// ADMIN CHECK (WHITELIST EMAIL)
// ==========================
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

function adminRequired(req, res, next) {
  const email = (req.user?.email || "").toLowerCase();

  if (!email || !ADMIN_EMAILS.includes(email)) {
    return res.status(403).json({
      success: false,
      message: "Admin only",
    });
  }

  next();
}

function supaForUser(token) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

// Admin client (untuk upload storage)
const adminSb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ============================
// ROUTER (tanpa prefix /api)
// ============================
const api = express.Router();

api.get('/health', (req, res) => res.json({ success: true, message: 'API ready' }));

api.get('/me', authRequired, (req, res) => {
  res.json({ success: true, user: req.user });
});

// PRODUCTS
api.get('/products', authRequired, async (req, res) => {
  const sb = supaForUser(req.accessToken);
  const { data, error } = await sb.from('products').select('*').order('id', { ascending: true });
  if (error) return res.status(500).json({ success: false, message: error.message });
  res.json({ success: true, products: data });
});

// CREATE ORDER
api.post('/orders', authRequired, async (req, res) => {
  try {
    const sb = supaForUser(req.accessToken);

    const productId = Number(req.body?.productId);
    const qty = Number(req.body?.qty ?? 1);

    if (!productId) return res.status(400).json({ success: false, message: 'productId required' });
    if (!qty || qty <= 0) return res.status(400).json({ success: false, message: 'qty invalid' });

    const { data: product, error: pErr } = await sb
      .from('products')
      .select('id,name,price,stock')
      .eq('id', productId)
      .single();

    if (pErr || !product) return res.status(404).json({ success: false, message: 'Product not found' });
    if ((product.stock ?? 0) < qty) return res.status(400).json({ success: false, message: 'Stock tidak cukup' });

    const total = Number(product.price) * qty;
    const invoice = `INV-${Date.now()}-${Math.random().toString(16).slice(2, 8).toUpperCase()}`;

    const { data: order, error } = await sb
      .from('orders')
      .insert({
        user_id: req.user.id,
        product_id: product.id,
        qty,
        amount: total,
        status: 'UNPAID',
        invoice,
        payment_method: 'MANUAL_TRANSFER',
      })
      .select('*')
      .single();

    if (error) return res.status(500).json({ success: false, message: error.message });

    res.json({ success: true, order });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Create order error' });
  }
});

//
// ✅ FIX: MY ORDERS HARUS DI ATAS /orders/:id
//
api.get('/orders/my', authRequired, async (req, res) => {
  const sb = supaForUser(req.accessToken);
  const { data, error } = await sb
    .from('orders')
    .select('*, products(name, price)')
    .eq('user_id', req.user.id)
    .order('id', { ascending: false });

  if (error) return res.status(500).json({ success: false, message: error.message });
  res.json({ success: true, orders: data });
});

//
// ✅ FIX: validate id supaya "my" / string lain gak dianggap id
//
api.get('/orders/:id', authRequired, async (req, res) => {
  const sb = supaForUser(req.accessToken);
  const id = Number(req.params.id);

  if (Number.isNaN(id)) {
    return res.status(400).json({ success: false, message: 'Invalid order id' });
  }

  const { data, error } = await sb
    .from('orders')
    .select('*, products(name, price)')
    .eq('id', id)
    .eq('user_id', req.user.id)
    .single();

  if (error || !data) return res.status(404).json({ success: false, message: 'Order not found' });
  res.json({ success: true, order: data });
});

api.get('/payment-methods', authRequired, (req, res) => {
  res.json({
    success: true,
    methods: [
      { type: 'BANK', name: 'BCA', number: '1234567890', holder: 'Digital Shop Pro', note: 'Transfer sesuai total invoice.' },
      { type: 'EWALLET', name: 'DANA', number: '081234567890', holder: 'Digital Shop Pro' },
    ],
  });
});

api.post('/orders/manual', authRequired, async (req, res) => {
  const sb = supaForUser(req.accessToken);

  const productId = Number(req.body?.productId);
  if (!productId) return res.status(400).json({ success: false, message: 'productId required' });

  const { data: product, error: pErr } = await sb
    .from('products')
    .select('id,name,price,stock')
    .eq('id', productId)
    .single();

  if (pErr || !product) return res.status(404).json({ success: false, message: 'Product not found' });
  if ((product.stock ?? 0) <= 0) return res.status(400).json({ success: false, message: 'Stock habis' });

  const { data: order, error } = await sb
    .from('orders')
    .insert({
      user_id: req.user.id,
      product_id: product.id,
      product_name: product.name,
      qty: 1,
      amount: Number(product.price),
      status: 'UNPAID',
    })
    .select('*')
    .single();

  if (error) return res.status(500).json({ success: false, message: error.message });

  res.json({ success: true, order });
});

api.post('/orders/:id/proofs', authRequired, async (req, res) => {
  const orderId = Number(req.params.id);
  const { fileName, mimeType, contentBase64 } = req.body || {};
  if (!fileName || !mimeType || !contentBase64) {
    return res.status(400).json({ success: false, message: 'fileName, mimeType, contentBase64 required' });
  }

  const sb = supaForUser(req.accessToken);

  const { data: order, error: oErr } = await sb
    .from('orders')
    .select('id,user_id,status')
    .eq('id', orderId)
    .eq('user_id', req.user.id)
    .single();

  if (oErr || !order) return res.status(404).json({ success: false, message: 'Order not found' });

  const bytes = Buffer.from(contentBase64, 'base64');
  const path = `${req.user.id}/${orderId}/${Date.now()}-${fileName}`;

  const { error: upErr } = await adminSb.storage
    .from('payment-proofs')
    .upload(path, bytes, { contentType: mimeType, upsert: true });

  if (upErr) return res.status(500).json({ success: false, message: upErr.message });

  const { data: pub } = adminSb.storage.from('payment-proofs').getPublicUrl(path);

  const { error: insErr } = await sb
    .from('order_proofs')
    .insert({ order_id: orderId, user_id: req.user.id, file_url: pub.publicUrl, mime_type: mimeType });

  if (insErr) return res.status(500).json({ success: false, message: insErr.message });

  const { error: stErr } = await sb
    .from('orders')
    .update({ status: 'WAITING_PROOF' })
    .eq('id', orderId)
    .eq('user_id', req.user.id);

  if (stErr) return res.status(500).json({ success: false, message: stErr.message });

  res.json({ success: true, message: 'Bukti diterima. Menunggu review.' });
});

// MY PREMIUM ACCOUNTS
api.get('/my/premium-accounts', authRequired, async (req, res) => {
  const sb = supaForUser(req.accessToken);
  const { data, error } = await sb
    .from('premium_accounts')
    .select('*')
    .eq('user_id', req.user.id)
    .order('id', { ascending: false });

  if (error) return res.status(500).json({ success: false, message: error.message });
  res.json({ success: true, accounts: data });
});

// =====================================================
// ADMIN ROUTES - REVIEW PAYMENT PROOF (APPROVE / REJECT)
// =====================================================

// 1) List orders yang sedang menunggu review bukti
api.get("/admin/orders/waiting-proof", authRequired, adminRequired, async (req, res) => {
  const { data, error } = await adminSb
    .from("orders")
    .select(`
      id, user_id, amount, status, invoice, payment_method, created_at,
      order_proofs ( id, file_url, mime_type, created_at )
    `)
    .eq("status", "WAITING_PROOF")
    .order("id", { ascending: false });

  if (error) {
    return res.status(500).json({ success: false, message: error.message });
  }

  return res.json({ success: true, orders: data });
});


// 2) Approve bukti transfer (status => PAID)
api.post("/admin/orders/:id/approve", authRequired, adminRequired, async (req, res) => {
  const orderId = Number(req.params.id);

  if (Number.isNaN(orderId)) {
    return res.status(400).json({ success: false, message: "Invalid order id" });
  }

  const { data, error } = await adminSb
    .from("orders")
    .update({
      status: "PAID",
      reject_reason: null,
    })
    .eq("id", orderId)
    .eq("status", "WAITING_PROOF")
    .select("*")
    .single();

  if (error) {
    return res.status(500).json({ success: false, message: error.message });
  }

  if (!data) {
    return res.status(409).json({
      success: false,
      message: "Already processed / not waiting proof",
    });
  }

  return res.json({ success: true, order: data });
});


// 3) Reject bukti transfer (status => UNPAID + alasan)
api.post("/admin/orders/:id/reject", authRequired, adminRequired, async (req, res) => {
  const orderId = Number(req.params.id);
  const reason = (req.body?.reason || "").trim();

  if (Number.isNaN(orderId)) {
    return res.status(400).json({ success: false, message: "Invalid order id" });
  }

  if (!reason) {
    return res.status(400).json({ success: false, message: "reason required" });
  }

  const { data, error } = await adminSb
    .from("orders")
    .update({
      status: "UNPAID",
      reject_reason: reason,
    })
    .eq("id", orderId)
    .eq("status", "WAITING_PROOF")
    .select("*")
    .single();

  if (error) {
    return res.status(500).json({ success: false, message: error.message });
  }

  if (!data) {
    return res.status(409).json({
      success: false,
      message: "Already processed / not waiting proof",
    });
  }

  return res.json({ success: true, order: data });
});

// ============================
// Mount router di 2 tempat:
// 1) /api/... (normal)
// 2) /...     (fallback kalau prefix /api ke-strip)
// ============================
app.use('/api', api);
app.use('/', api);

// Debug 404 JSON
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Not Found', path: req.originalUrl });
});

module.exports = app;