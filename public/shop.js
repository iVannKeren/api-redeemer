(() => {
  const loginForm = document.getElementById('loginForm');
  const authStatus = document.getElementById('authStatus');

  const SUPABASE_URL = "https://xiwruqeyycssxgnbpqqr.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhpd3J1cWV5eWNzc3hnbmJwcXFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNjIxNjAsImV4cCI6MjA4NjczODE2MH0.kWbYeO0N5LBPfB4bEmwNvyI_XEiRfeCc9kU29bRJeK0"; // boleh tetap anon key kamu

  if (!window.supabase) {
    console.error("Supabase JS belum ke-load. Pastikan supabase-js di-load sebelum shop.js");
    return;
  }

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;

      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;

      localStorage.setItem('digitalshop_token', data.session.access_token);
      localStorage.setItem('digitalshop_user', JSON.stringify(data.user));

      authStatus.textContent = 'Login berhasil. Mengalihkan...';
      window.location.href = '/clientarea';
    } catch (err) {
      authStatus.textContent = err.message || 'Login gagal';
      alert(err.message || 'Login gagal');
    }
  });
})();