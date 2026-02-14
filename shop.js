const state = { token: null, user: null, products: [], orders: [], accounts: [] };

const loginForm = document.getElementById('loginForm');
const authStatus = document.getElementById('authStatus');
const logoutBtn = document.getElementById('logoutBtn');
const productGrid = document.getElementById('productGrid');
const adminPanel = document.getElementById('adminPanel');
const adminRows = document.getElementById('adminRows');
const clientArea = document.getElementById('clientArea');
const orderList = document.getElementById('orderList');
const myAccounts = document.getElementById('myAccounts');
const stockProductId = document.getElementById('stockProductId');
const stockBulkInput = document.getElementById('stockBulkInput');
const stockBulkBtn = document.getElementById('stockBulkBtn');
const stockList = document.getElementById('stockList');
const invoiceList = document.getElementById('invoiceList');

function formatRupiah(v) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(v);
}

async function request(url, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (state.token) headers.Authorization = `Bearer ${state.token}`;
    const res = await fetch(url, { ...options, headers });
    const payload = await res.json();
    if (!res.ok) throw new Error(payload.message || 'Terjadi kesalahan');
    return payload;
}

function updateAuthUI() {
    if (!state.user) {
        authStatus.textContent = 'Belum login.';
        logoutBtn.classList.add('hidden');
        adminPanel.classList.add('hidden');
        clientArea.classList.add('hidden');
        return;
    }

    authStatus.textContent = `Login sebagai ${state.user.name} (${state.user.role})`;
    logoutBtn.classList.remove('hidden');
    clientArea.classList.remove('hidden');
    if (state.user.role === 'admin') adminPanel.classList.remove('hidden');
    else adminPanel.classList.add('hidden');
}

function renderProducts() {
    productGrid.innerHTML = state.products.map((p) => `
        <article class="border border-slate-800 bg-slate-950 rounded-xl p-4">
            <p class="text-xs uppercase text-cyan-300">${p.category} · ${p.badge}</p>
            <h3 class="text-lg font-semibold mb-1">${p.name}</h3>
            <p class="text-sm text-slate-400 mb-3">${p.description}</p>
            <div class="flex justify-between items-center mb-3">
                <strong class="text-cyan-300">${formatRupiah(p.price)}</strong>
                <span class="text-xs">Display Stock: ${p.stock}</span>
            </div>
            <button class="w-full py-2 bg-cyan-500 text-slate-950 rounded font-semibold" data-order-product-id="${p.id}">
                Buat Pesanan Manual Payment
            </button>
        </article>
    `).join('');

    stockProductId.innerHTML = state.products.map((p) => `<option value="${p.id}">${p.name}</option>`).join('');

    adminRows.innerHTML = state.products.map((p) => `
        <tr class="border-b border-slate-800">
            <td class="py-2 pr-2">${p.name}</td>
            <td class="py-2 pr-2"><input data-stock-id="${p.id}" type="number" min="0" value="${p.stock}" class="w-20 rounded bg-slate-950 border border-slate-700 px-2 py-1"></td>
            <td class="py-2"><button data-save-id="${p.id}" class="px-2 py-1 bg-cyan-500 text-slate-950 rounded">Simpan</button></td>
        </tr>
    `).join('');
}

function renderOrders() {
    if (!state.orders.length) {
        orderList.innerHTML = '<p class="text-slate-400 text-sm">Belum ada pesanan.</p>';
        return;
    }

    orderList.innerHTML = state.orders.map((o) => `
        <div class="border border-slate-800 rounded p-3">
            <p class="font-semibold">#${o.id} · ${o.product_name}</p>
            <p class="text-sm text-slate-300">${formatRupiah(o.amount)} · ${o.status}</p>
            <div class="mt-2 flex gap-2">
                <input type="file" data-proof-file-id="${o.id}" class="text-xs" accept="image/png,image/jpeg,image/webp,application/pdf">
                <button data-upload-proof-id="${o.id}" class="px-3 py-1 rounded bg-emerald-500 text-slate-950 text-sm">Upload Bukti</button>
            </div>
        </div>
    `).join('');
}

function renderMyAccounts() {
    if (!state.accounts.length) {
        myAccounts.innerHTML = '<p class="text-slate-400 text-sm">Belum ada akun premium yang di-assign.</p>';
        return;
    }

    myAccounts.innerHTML = state.accounts.map((a) => `
        <div class="border border-slate-800 rounded p-3">
            <p class="font-semibold">${a.product_name}</p>
            <p class="text-sm text-slate-300">Email: ${a.account_email}</p>
            <p class="text-sm text-cyan-300">Password: ${a.account_password}</p>
        </div>
    `).join('');
}

async function loadProducts() {
    const data = await request('/api/products');
    state.products = data.products;
    renderProducts();
}

async function loadOrders() {
    const data = await request('/api/orders/my');
    state.orders = data.orders;
    renderOrders();
}

async function loadAccounts() {
    const data = await request('/api/my/premium-accounts');
    state.accounts = data.accounts;
    renderMyAccounts();
}

async function loadAdminStock() {
    if (state.user?.role !== 'admin') return;
    const productId = stockProductId.value;
    const data = await request(`/api/admin/premium-stock?productId=${productId}`);
    stockList.innerHTML = data.stock.map((s) => `
        <div class="border border-slate-800 rounded p-2 text-sm flex justify-between items-center">
            <span>#${s.id} ${s.account_email} · ${s.status}</span>
            <button data-delete-stock-id="${s.id}" class="px-2 py-1 bg-rose-500 text-white rounded text-xs">Hapus</button>
        </div>
    `).join('');
}

async function loadAdminInvoices() {
    if (state.user?.role !== 'admin') return;
    const data = await request('/api/admin/invoices');
    invoiceList.innerHTML = data.invoices.slice(0, 20).map((i) => `
        <div class="border border-slate-800 rounded p-2 text-sm">
            <p>#${i.id} · ${i.user_email} · ${i.product_name} · <strong>${i.status}</strong></p>
            <div class="mt-2 flex gap-2">
                <button data-approve-invoice-id="${i.id}" class="px-2 py-1 bg-emerald-500 text-slate-950 rounded text-xs">Approve</button>
                <button data-reject-invoice-id="${i.id}" class="px-2 py-1 bg-rose-500 text-white rounded text-xs">Reject</button>
            </div>
        </div>
    `).join('');
}

async function syncAll() {
    await loadProducts();
    await loadOrders();
    await loadAccounts();
    if (state.user?.role === 'admin') {
        await loadAdminStock();
        await loadAdminInvoices();
    }
}

loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const data = await request('/api/login', { method: 'POST', body: JSON.stringify({ email, password }) });
        state.token = data.token;
        state.user = data.user;
        updateAuthUI();
        await syncAll();
    } catch (error) {
        alert(error.message);
    }
});

logoutBtn.addEventListener('click', async () => {
    try { await request('/api/logout', { method: 'POST' }); } catch (_) {}
    state.token = null;
    state.user = null;
    state.products = [];
    state.orders = [];
    state.accounts = [];
    productGrid.innerHTML = '';
    orderList.innerHTML = '';
    myAccounts.innerHTML = '';
    updateAuthUI();
});

productGrid.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-order-product-id]');
    if (!button) return;
    try {
        await request('/api/orders/manual', { method: 'POST', body: JSON.stringify({ productId: Number(button.dataset.orderProductId) }) });
        await loadOrders();
        alert('Pesanan manual payment dibuat. Silakan upload bukti pembayaran.');
    } catch (error) {
        alert(error.message);
    }
});

orderList.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-upload-proof-id]');
    if (!button) return;

    const invoiceId = Number(button.dataset.uploadProofId);
    const fileInput = document.querySelector(`[data-proof-file-id="${invoiceId}"]`);
    const file = fileInput?.files?.[0];

    if (!file) {
        alert('Pilih file bukti dulu.');
        return;
    }

    const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });

    try {
        await request(`/api/orders/${invoiceId}/proofs`, {
            method: 'POST',
            body: JSON.stringify({ fileName: file.name, mimeType: file.type, contentBase64: base64, source: 'web' })
        });
        await loadOrders();
        alert('Bukti pembayaran terkirim ke admin.');
    } catch (error) {
        alert(error.message);
    }
});

adminRows.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-save-id]');
    if (!button) return;
    const id = Number(button.dataset.saveId);
    const input = document.querySelector(`[data-stock-id="${id}"]`);
    try {
        await request(`/api/admin/products/${id}/stock`, { method: 'PATCH', body: JSON.stringify({ stock: Number(input.value) }) });
        await loadProducts();
    } catch (error) {
        alert(error.message);
    }
});

stockBulkBtn.addEventListener('click', async () => {
    try {
        await request('/api/admin/premium-stock/bulk', {
            method: 'POST',
            body: JSON.stringify({ productId: Number(stockProductId.value), lines: stockBulkInput.value })
        });
        stockBulkInput.value = '';
        await loadAdminStock();
        alert('Stok berhasil ditambahkan.');
    } catch (error) {
        alert(error.message);
    }
});

stockProductId.addEventListener('change', loadAdminStock);

stockList.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-delete-stock-id]');
    if (!button) return;
    try {
        await request(`/api/admin/premium-stock/${Number(button.dataset.deleteStockId)}`, { method: 'DELETE' });
        await loadAdminStock();
    } catch (error) {
        alert(error.message);
    }
});

invoiceList.addEventListener('click', async (event) => {
    const approve = event.target.closest('[data-approve-invoice-id]');
    const reject = event.target.closest('[data-reject-invoice-id]');
    try {
        if (approve) {
            await request(`/api/admin/invoices/${Number(approve.dataset.approveInvoiceId)}/approve`, { method: 'POST' });
        }
        if (reject) {
            const reason = prompt('Alasan reject:');
            if (!reason) return;
            await request(`/api/admin/invoices/${Number(reject.dataset.rejectInvoiceId)}/reject`, {
                method: 'POST',
                body: JSON.stringify({ reason })
            });
        }
        await loadAdminInvoices();
        await loadOrders();
        await loadAccounts();
    } catch (error) {
        alert(error.message);
    }
});

updateAuthUI();
