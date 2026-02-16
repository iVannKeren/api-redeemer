const express = require('express');

const app = express();
app.use(express.json());

app.post('/api/verify-captcha', async (req, res) => {
  try {
    const token = req.body?.token;
    if (!token) return res.status(400).json({ success: false, message: 'Captcha token missing' });

    const secret = process.env.TURNSTILE_SECRET_KEY;
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim();

    const formData = new URLSearchParams();
    formData.append('secret', secret);
    formData.append('response', token);
    if (ip) formData.append('remoteip', ip);

    const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData
    });

    const data = await resp.json();

    if (!data.success) {
      return res.status(400).json({ success: false, message: 'Captcha failed', details: data['error-codes'] || [] });
    }

    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ success: false, message: 'Captcha verify error' });
  }
});

module.exports = app;