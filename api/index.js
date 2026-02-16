const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());
app.use(express.json());

const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET;

function authRequired(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return res.status(401).json({ success: false, message: 'Unauthorized' });

  try {
    const payload = jwt.verify(token, SUPABASE_JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Token invalid/expired' });
  }
}

app.get('/api/health', (req, res) => res.json({ success: true, message: 'API ready' }));

app.get('/api/me', authRequired, (req, res) => {
  res.json({ success: true, user: req.user });
});

module.exports = app;