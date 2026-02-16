const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const sessions = new Map();

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ message: 'Email dan password wajib' });

  // demo user (samakan dengan demo kamu)
  const users = [
    { id: 1, email: 'admin@digitalshop.com', password: 'admin123', role: 'admin', name: 'Super Admin' },
    { id: 2, email: 'buyer@digitalshop.com', password: 'buyer123', role: 'customer', name: 'Digital Buyer' }
  ];

  const user = users.find(u => u.email === String(email).trim() && u.password === password);
  if (!user) return res.status(401).json({ message: 'Email atau password salah' });

  const token = Math.random().toString(16).slice(2) + Date.now().toString(16);
  sessions.set(token, user);

  res.json({ token, user: { id: user.id, email: user.email, role: user.role, name: user.name } });
});

app.get('/api/me', (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const user = sessions.get(token);
  if (!user) return res.status(401).json({ message: 'Unauthorized' });
  res.json({ user });
});

module.exports = app;