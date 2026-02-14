const state = {
    token: null,
    user: null,
    products: []
};

const loginForm = document.getElementById('loginForm');
const authStatus = document.getElementById('authStatus');
const logoutBtn = document.getElementById('logoutBtn');
const productGrid = document.getElementById('productGrid');
const adminPanel = document.getElementById('adminPanel');
const adminRows = document.getElementById('adminRows');

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

const demoUsers = [
    { id: 1, email: 'admin@digitalshop.com', password: 'admin123', role: 'admin', name: 'Super Admin' },
    { id: 2, email: 'buyer@digitalshop.com', password: 'buyer123', role: 'customer', name: 'Digital Buyer' }
];

const DEMO_PRODUCTS_KEY = 'digitalshop_demo_products';
const forceLocalDemo = new URLSearchParams(window.location.search).get('demo_local') === '1';
let usingLocalDemoApi = forceLocalDemo;

function formatRupiah(value) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value);
}

function normalizeEmail(email) {
    return String(email || '')
        .trim()
        .toLowerCase()
        .replace(/@digitalshop\.local$/, '@digitalshop.com');
}

function getLocalDemoProducts() {
    try {
        const raw = localStorage.getItem(DEMO_PRODUCTS_KEY);
        if (!raw) {
            localStorage.setItem(DEMO_PRODUCTS_KEY, JSON.stringify(defaultProducts));
            return [...defaultProducts];
        }
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [...defaultProducts];
    } catch {
        return [...defaultProducts];
    }
}

function saveLocalDemoProducts(products) {
    localStorage.setItem(DEMO_PRODUCTS_KEY, JSON.stringify(products));
}

function buildErrorMessage(error) {
    if (!error) {
        return 'Terjadi kesalahan.';
    }

    const msg = String(error.message || error);
    if (msg.includes('expected pattern') || msg.includes('Failed to fetch') || msg.includes('Load failed')) {
        return 'Koneksi ke API gagal. Sistem otomatis memakai mode demo lokal. Coba login lagi.';
    }

    return msg;
}

function renderProducts() {
    if (!state.products.length) {
        productGrid.innerHTML = '<p class="text-slate-400">Belum ada produk yang tersedia.</p>';
        return;
    }

    productGrid.innerHTML = state.products
        .map(
            (item) => `
            <article class="border border-slate-800 bg-slate-950 rounded-xl p-4">
                <p class="text-xs uppercase text-cyan-300 tracking-widest mb-2">${item.category} · ${item.badge}</p>
                <h3 class="text-lg font-semibold mb-1">${item.name}</h3>
                <p class="text-sm text-slate-400 mb-3">${item.description}</p>
                <div class="flex items-center justify-between">
                    <strong class="text-cyan-300">${formatRupiah(item.price)}</strong>
                    <span class="text-xs px-2 py-1 rounded bg-slate-800">Stok: ${item.stock}</span>
                </div>
            </article>
        `
        )
        .join('');
}

function renderAdminRows() {
    if (!state.products.length) {
        adminRows.innerHTML = '';
        return;
    }

    adminRows.innerHTML = state.products
        .map(
            (item) => `
            <tr class="border-b border-slate-800">
                <td class="py-3 pr-3">${item.name}</td>
                <td class="py-3 pr-3">${formatRupiah(item.price)}</td>
                <td class="py-3 pr-3">
                    <input data-stock-id="${item.id}" type="number" min="0" value="${item.stock}" class="w-24 rounded bg-slate-950 border border-slate-700 px-2 py-1" />
                </td>
                <td class="py-3">
                    <button data-save-id="${item.id}" class="px-3 py-1 bg-cyan-500 text-slate-950 font-semibold rounded hover:bg-cyan-400">Simpan</button>
                </td>
            </tr>
        `
        )
        .join('');
}

function updateAuthUI() {
    if (!state.user) {
        authStatus.textContent = 'Belum login.';
        logoutBtn.classList.add('hidden');
        adminPanel.classList.add('hidden');
        return;
    }

    const modeInfo = usingLocalDemoApi ? ' · mode demo lokal' : '';
    authStatus.textContent = `Login sebagai ${state.user.name} (${state.user.role})${modeInfo}`;
    logoutBtn.classList.remove('hidden');

    if (state.user.role === 'admin') {
        adminPanel.classList.remove('hidden');
    } else {
        adminPanel.classList.add('hidden');
    }
}

async function localDemoRequest(url, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const body = options.body ? JSON.parse(options.body) : {};
    const token = state.token;
    const loggedInUser = token ? demoUsers.find((user) => user.email === token) : null;

    if (url === '/api/login' && method === 'POST') {
        const email = normalizeEmail(body.email);
        const user = demoUsers.find((u) => u.email === email && u.password === body.password);

        if (!user) {
            throw new Error('Email atau password tidak valid.');
        }

        return {
            success: true,
            token: user.email,
            user: { id: user.id, email: user.email, role: user.role, name: user.name }
        };
    }

    if (!loggedInUser) {
        throw new Error('Unauthorized. Silakan login dulu.');
    }

    if (url === '/api/logout' && method === 'POST') {
        return { success: true, message: 'Logout berhasil.' };
    }

    if (url === '/api/products' && method === 'GET') {
        return { success: true, products: getLocalDemoProducts() };
    }

    const stockMatch = url.match(/^\/api\/admin\/products\/(\d+)\/stock$/);
    if (stockMatch && method === 'PATCH') {
        if (loggedInUser.role !== 'admin') {
            throw new Error('Akses khusus admin.');
        }

        const id = Number(stockMatch[1]);
        const stock = Number(body.stock);
        if (!Number.isInteger(stock) || stock < 0) {
            throw new Error('Stock harus berupa angka >= 0.');
        }

        const products = getLocalDemoProducts();
        const index = products.findIndex((item) => item.id === id);

        if (index < 0) {
            throw new Error('Produk tidak ditemukan.');
        }

        products[index].stock = stock;
        saveLocalDemoProducts(products);

        return { success: true, product: products[index], message: 'Stock berhasil diperbarui.' };
    }

    throw new Error('Endpoint demo tidak tersedia.');
}

async function request(url, options = {}) {
    if (usingLocalDemoApi) {
        return localDemoRequest(url, options);
    }

    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };

    if (state.token) {
        headers.Authorization = `Bearer ${state.token}`;
    }

    try {
        const response = await fetch(url, { ...options, headers });
        const payload = await response.json();

        if (!response.ok) {
            throw new Error(payload.message || 'Terjadi kesalahan.');
        }

        return payload;
    } catch (error) {
        if (url.startsWith('/api/')) {
            usingLocalDemoApi = true;
            return localDemoRequest(url, options);
        }

        throw error;
    }
}

async function loadProducts() {
    const data = await request('/api/products');
    state.products = data.products;
    renderProducts();
    renderAdminRows();
}

loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    try {
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const data = await request('/api/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });

        state.token = data.token;
        state.user = data.user;

        await loadProducts();
        updateAuthUI();
    } catch (error) {
        alert(buildErrorMessage(error));
    }
});

logoutBtn.addEventListener('click', async () => {
    try {
        await request('/api/logout', { method: 'POST' });
    } catch (_) {
    } finally {
        state.token = null;
        state.user = null;
        state.products = [];
        productGrid.innerHTML = '';
        adminRows.innerHTML = '';
        updateAuthUI();
    }
});

adminRows.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-save-id]');

    if (!button) {
        return;
    }

    const id = Number(button.dataset.saveId);
    const stockInput = document.querySelector(`[data-stock-id="${id}"]`);
    const stock = Number(stockInput.value);

    try {
        await request(`/api/admin/products/${id}/stock`, {
            method: 'PATCH',
            body: JSON.stringify({ stock })
        });
        await loadProducts();
    } catch (error) {
        alert(buildErrorMessage(error));
    }
});

updateAuthUI();
