const loginForm = document.getElementById('loginForm');
const authStatus = document.getElementById('authStatus');

async function request(url, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    const res = await fetch(url, { ...options, headers });
    const payload = await res.json();
    if (!res.ok) throw new Error(payload.message || 'Terjadi kesalahan');
    return payload;
}

loginForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const data = await request('/api/login', { method: 'POST', body: JSON.stringify({ email, password }) });
        localStorage.setItem('digitalshop_token', data.token);
        localStorage.setItem('digitalshop_user', JSON.stringify(data.user));
        authStatus.textContent = `Login berhasil sebagai ${data.user.name}. Mengalihkan...`;
        window.location.href = '/clientarea';
    } catch (error) {
        authStatus.textContent = error.message;
        alert(error.message);
    }
});
