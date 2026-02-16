const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

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

function supaForUser(token) {
  // Supabase client yang "login sebagai user" (RLS berlaku)
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

app.get('/api/health', (req, res) => res.json({ success: true, message: 'API ready' }));

app.get('/api/me', authRequired, (req, res) => {
  res.json({ success: true, user: req.user });
});

// PRODUCTS
app.get('/api/products', authRequired, async (req, res) => {
  const sb = supaForUser(req.accessToken);
  const { data, error } = await sb.from('products').select('*').order('id', { ascending: true });
  if (error) return res.status(500).json({ success: false, message: error.message });
  res.json({ success: true, products: data });
});

// CREATE ORDER
app.post('/api/orders', authRequired, async (req, res) => {
  const invoice = `INV-${Date.now()}-${Math.random().toString(16).slice(2, 8).toUpperCase()}`;

  const { data: order, error } = await sb
    .from('orders')
    .insert({
      user_id: req.user.id,
      product_id: product.id,
      qty: q,
      amount: total,
      status: 'UNPAID',
      invoice,
      payment_method: 'MANUAL_TRANSFER'
    })
    .select('*')
    .single();

  if (error) return res.status(500).json({ success: false, message: error.message });

  res.json({ success: true, order });
});

app.get('/api/orders/:id', authRequired, async (req, res) => {
  const sb = supaForUser(req.accessToken);
  const id = Number(req.params.id);

  const { data, error } = await sb
    .from('orders')
    .select('*, products(name, price)')
    .eq('id', id)
    .eq('user_id', req.user.id)
    .single();

  if (error || !data) return res.status(404).json({ success: false, message: 'Order not found' });
  res.json({ success: true, order: data });
});

app.get('/api/payment-methods', authRequired, (req, res) => {
  // bisa hardcode dulu
  res.json({
    success: true,
    methods: [
      { type: 'BANK', name: 'BCA', number: '1234567890', holder: 'Digital Shop Pro', note: 'Transfer sesuai total invoice.' },
      { type: 'EWALLET', name: 'DANA', number: '081234567890', holder: 'Digital Shop Pro' }
    ]
  });
});

app.post('/api/orders/manual', authRequired, async (req, res) => {
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
      product_name: product.name, // biar frontend kamu gak perlu join
      qty: 1,
      amount: Number(product.price),
      status: 'UNPAID'
    })
    .select('*')
    .single();

  if (error) return res.status(500).json({ success: false, message: error.message });

  res.json({ success: true, order });
});

const { createClient } = require('@supabase/supabase-js');

const adminSb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

app.post('/api/orders/:id/proofs', authRequired, async (req, res) => {
  const orderId = Number(req.params.id);
  const { fileName, mimeType, contentBase64 } = req.body || {};
  if (!fileName || !mimeType || !contentBase64) {
    return res.status(400).json({ success: false, message: 'fileName, mimeType, contentBase64 required' });
  }

  // pastikan order milik user
  const sb = supaForUser(req.accessToken);
  const { data: order, error: oErr } = await sb
    .from('orders')
    .select('id,user_id,status')
    .eq('id', orderId)
    .eq('user_id', req.user.id)
    .single();

  if (oErr || !order) return res.status(404).json({ success: false, message: 'Order not found' });

  // upload bukti ke bucket "payment-proofs"
  const bytes = Buffer.from(contentBase64, 'base64');
  const path = `${req.user.id}/${orderId}/${Date.now()}-${fileName}`;

  const { error: upErr } = await adminSb.storage
    .from('payment-proofs')
    .upload(path, bytes, { contentType: mimeType, upsert: true });

  if (upErr) return res.status(500).json({ success: false, message: upErr.message });

  const { data: pub } = adminSb.storage.from('payment-proofs').getPublicUrl(path);

  // simpan URL bukti + update status
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

// MY ORDERS
app.get('/api/orders/my', authRequired, async (req, res) => {
  const sb = supaForUser(req.accessToken);
  const { data, error } = await sb
    .from('orders')
    .select('*, products(name, price)')
    .eq('user_id', req.user.id)
    .order('id', { ascending: false });

  if (error) return res.status(500).json({ success: false, message: error.message });
  res.json({ success: true, orders: data });
});

// MY PREMIUM ACCOUNTS
app.get('/api/my/premium-accounts', authRequired, async (req, res) => {
  const sb = supaForUser(req.accessToken);
  const { data, error } = await sb
    .from('premium_accounts')
    .select('*')
    .eq('user_id', req.user.id)
    .order('id', { ascending: false });

  if (error) return res.status(500).json({ success: false, message: error.message });
  res.json({ success: true, accounts: data });
});

module.exports = app;