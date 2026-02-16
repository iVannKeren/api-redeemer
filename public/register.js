const form = document.getElementById('registerForm');
const statusEl = document.getElementById('status');

const SUPABASE_URL = "https://xiwruqeyycssxgnbpqqr.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhpd3J1cWV5eWNzc3hnbmJwcXFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNjIxNjAsImV4cCI6MjA4NjczODE2MH0.kWbYeO0N5LBPfB4bEmwNvyI_XEiRfeCc9kU29bRJeK0";

// pakai nama berbeda biar tidak bentrok
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function getTurnstileToken() {
  const el = document.querySelector('input[name="cf-turnstile-response"]');
  return el?.value || '';
}

async function verifyCaptcha(token) {
  const res = await fetch('/api/verify-captcha', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Captcha verification failed');

  return data;
}

form?.addEventListener('submit', async (e) => {
  e.preventDefault();

  try {
    statusEl.textContent = 'Memproses...';

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    const captchaToken = getTurnstileToken();
    if (!captchaToken) throw new Error('Silakan selesaikan captcha dulu.');

    // verify captcha
    await verifyCaptcha(captchaToken);

    // signup supabase
    const { error } = await sb.auth.signUp({
      email,
      password
    });

    if (error) throw error;

    statusEl.textContent = 'Register berhasil. Silakan login di /shop.';
  } catch (err) {
    statusEl.textContent = err.message || 'Register gagal';
  }
});