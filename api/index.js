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
  const { product_id, qty } = req.body || {};
  const q = Number(qty || 1);
  if (!product_id) return res.status(400).json({ success: false, message: 'product_id required' });

  const sb = supaForUser(req.accessToken);

  // ambil harga produk
  const { data: product, error: pErr } = await sb
    .from('products')
    .select('id,name,price,stock')
    .eq('id', product_id)
    .single();

  if (pErr || !product) return res.status(404).json({ success: false, message: 'Product not found' });

  const total = Number(product.price) * q;

  const { data: order, error } = await sb
    .from('orders')
    .insert({
      user_id: req.user.id,
      product_id: product.id,
      qty: q,
      amount: total,
      status: 'UNPAID',
    })
    .select('*')
    .single();

  if (error) return res.status(500).json({ success: false, message: error.message });

  res.json({ success: true, order });
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