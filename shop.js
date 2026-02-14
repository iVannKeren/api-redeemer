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

function formatRupiah(value) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value);
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

    authStatus.textContent = `Login sebagai ${state.user.name} (${state.user.role})`;
    logoutBtn.classList.remove('hidden');

    if (state.user.role === 'admin') {
        adminPanel.classList.remove('hidden');
    } else {
        adminPanel.classList.add('hidden');
    }
}

async function request(url, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };

    if (state.token) {
        headers.Authorization = `Bearer ${state.token}`;
    }

    const response = await fetch(url, { ...options, headers });
    const payload = await response.json();

    if (!response.ok) {
        throw new Error(payload.message || 'Terjadi kesalahan.');
    }

    return payload;
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
        alert(error.message);
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
        alert(error.message);
    }
});

updateAuthUI();
