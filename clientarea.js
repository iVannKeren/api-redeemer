const state = {
    token: localStorage.getItem('digitalshop_token'),
    user: JSON.parse(localStorage.getItem('digitalshop_user') || 'null'),
    products: [],
    orders: [],
    accounts: [],
    loading: false,
    error: null,
    currentPage: 'dashboard'
};

const pageTitle = document.getElementById('pageTitle');
const navMenu = document.getElementById('navMenu');
const summaryCards = document.getElementById('summaryCards');
const latestOrders = document.getElementById('latestOrders');
const productGrid = document.getElementById('productGrid');
const transactionTable = document.getElementById('transactionTable');
const paymentList = document.getElementById('paymentList');
const myAccounts = document.getElementById('myAccounts');
const adminPanel = document.getElementById('adminPanel');
const adminRows = document.getElementById('adminRows');
const logoutBtn = document.getElementById('logoutBtn');
const profileBtn = document.getElementById('profileBtn');
const profileMenu = document.getElementById('profileMenu');
const mobileMenuBtn = document.getElementById('mobileMenuBtn');
const sidebar = document.getElementById('sidebar');
const profileName = document.getElementById('profileName');
const profileEmail = document.getElementById('profileEmail');

const sections = [...document.querySelectorAll('[data-section]')];

function badgeClass(status) {
    const map = {
        PAID: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
        UNPAID: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
        WAITING_PROOF: 'bg-sky-500/20 text-sky-300 border border-sky-500/30',
        REJECTED: 'bg-rose-500/20 text-rose-300 border border-rose-500/30',
        PAID_BUT_OUT_OF_STOCK: 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
    };
    return map[status] || 'bg-slate-800 text-slate-200 border border-slate-700';
}

function formatRupiah(v) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(v || 0);
}

function showPage(page) {
    state.currentPage = page;
    pageTitle.textContent = page[0].toUpperCase() + page.slice(1);
    sections.forEach((section) => section.classList.toggle('hidden', section.dataset.section !== page));
    navMenu.querySelectorAll('[data-page]').forEach((btn) => {
        const active = btn.dataset.page === page;
        btn.classList.toggle('bg-cyan-500/20', active);
        btn.classList.toggle('text-cyan-300', active);
    });
}

async function request(url, options = {}) {
    if (!state.token) {
        window.location.href = '/';
        throw new Error('Silakan login terlebih dahulu.');
    }

    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}), Authorization: `Bearer ${state.token}` };
    const res = await fetch(url, { ...options, headers });
    const payload = await res.json();

    if (res.status === 401) {
        localStorage.removeItem('digitalshop_token');
        localStorage.removeItem('digitalshop_user');
        window.location.href = '/';
        throw new Error('Session habis, silakan login ulang.');
    }

    if (!res.ok) throw new Error(payload.message || 'Terjadi kesalahan');
    return payload;
}

function renderDashboard() {
    const paid = state.orders.filter((o) => o.status === 'PAID').length;
    const waiting = state.orders.filter((o) => o.status === 'WAITING_PROOF').length;
    const unpaid = state.orders.filter((o) => o.status === 'UNPAID').length;

    const cards = [
        { title: 'Total Order', value: state.orders.length, sub: 'Semua transaksi' },
        { title: 'Status PAID', value: paid, sub: 'Pembayaran approved' },
        { title: 'Menunggu Review', value: waiting, sub: 'WAITING_PROOF' },
        { title: 'Akun Aktif', value: state.accounts.length, sub: 'Sudah terassign' }
    ];

    summaryCards.innerHTML = cards.map((c) => `
        <article class="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <p class="text-xs text-slate-400">${c.title}</p>
            <h3 class="text-2xl font-bold mt-2">${c.value}</h3>
            <p class="text-xs text-slate-500 mt-1">${c.sub}</p>
        </article>
    `).join('');

    if (!state.orders.length) {
        latestOrders.innerHTML = '<p class="text-slate-400">Belum ada order. Mulai dari menu Produk / Order.</p>';
        return;
    }

    latestOrders.innerHTML = state.orders.slice(0, 3).map((o) => `
        <div class="flex items-center justify-between py-2 border-b border-slate-800 last:border-0">
            <div>
                <p>#${o.id} · ${o.product_name}</p>
                <p class="text-xs text-slate-400">${formatRupiah(o.amount)}</p>
            </div>
            <span class="text-xs px-2 py-1 rounded-full ${badgeClass(o.status)}">${o.status}</span>
        </div>
    `).join('');
}

function renderProducts() {
    if (!state.products.length) {
        productGrid.innerHTML = '<p class="text-slate-400">Produk kosong.</p>';
        return;
    }

    productGrid.innerHTML = state.products.map((p) => `
        <article class="border border-slate-800 bg-slate-950 rounded-xl p-4">
            <p class="text-xs uppercase text-cyan-300">${p.category} · ${p.badge}</p>
            <h3 class="font-semibold mt-1">${p.name}</h3>
            <p class="text-xs text-slate-400 mt-1">${p.description}</p>
            <p class="mt-2 text-cyan-300 font-semibold">${formatRupiah(p.price)}</p>
            <button data-order-product-id="${p.id}" class="mt-3 w-full py-2 rounded bg-cyan-500 text-slate-950 font-semibold text-sm">Buat Order</button>
        </article>
    `).join('');

    adminRows.innerHTML = state.products.map((p) => `
        <tr class="border-b border-slate-800">
            <td class="py-2">${p.name}</td>
            <td class="py-2"><input data-stock-id="${p.id}" type="number" min="0" value="${p.stock}" class="w-20 rounded bg-slate-950 border border-slate-700 px-2 py-1"></td>
            <td class="py-2"><button data-save-id="${p.id}" class="px-2 py-1 rounded bg-cyan-500 text-slate-950 text-xs">Simpan</button></td>
        </tr>
    `).join('');
}

function renderTransactions() {
    if (!state.orders.length) {
        transactionTable.innerHTML = '<p class="text-slate-400">Belum ada transaksi.</p>';
        return;
    }

    transactionTable.innerHTML = `
        <table class="w-full text-sm min-w-[680px]">
            <thead><tr class="text-left border-b border-slate-800"><th class="py-2">Invoice</th><th class="py-2">Produk</th><th class="py-2">Nominal</th><th class="py-2">Status</th></tr></thead>
            <tbody>
                ${state.orders.map((o) => `
                    <tr class="border-b border-slate-800">
                        <td class="py-2">#${o.id}</td>
                        <td class="py-2">${o.product_name}</td>
                        <td class="py-2">${formatRupiah(o.amount)}</td>
                        <td class="py-2"><span class="text-xs px-2 py-1 rounded-full ${badgeClass(o.status)}">${o.status}</span></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function renderPayments() {
    if (!state.orders.length) {
        paymentList.innerHTML = '<p class="text-slate-400">Belum ada invoice pembayaran.</p>';
        return;
    }

    paymentList.innerHTML = state.orders.map((o) => `
        <div class="border border-slate-800 rounded-lg p-3">
            <p class="font-semibold">Invoice #${o.id} · ${o.product_name}</p>
            <p class="text-xs text-slate-400 mt-1">Metode: MANUAL_PAYMENT · ${formatRupiah(o.amount)}</p>
            <span class="inline-flex mt-2 text-xs px-2 py-1 rounded-full ${badgeClass(o.status)}">${o.status}</span>
            <div class="mt-3 flex gap-2 items-center">
                <input type="file" data-proof-file-id="${o.id}" class="text-xs" accept="image/png,image/jpeg,image/webp,application/pdf">
                <button data-upload-proof-id="${o.id}" class="px-3 py-1 rounded bg-emerald-500 text-slate-950 text-xs">Upload Bukti</button>
            </div>
        </div>
    `).join('');
}

function renderAccounts() {
    if (!state.accounts.length) {
        myAccounts.innerHTML = '<p class="text-slate-400">Belum ada akun premium aktif.</p>';
        return;
    }

    myAccounts.innerHTML = state.accounts.map((a) => `
        <div class="border border-slate-800 rounded-lg p-3">
            <p class="font-semibold">${a.product_name}</p>
            <p class="text-sm text-slate-300">Email: <span class="font-mono">${a.account_email}</span></p>
            <div class="mt-2 flex items-center gap-2">
                <input value="${a.account_password}" readonly class="text-sm bg-slate-950 border border-slate-700 rounded px-2 py-1 w-full">
                <button data-copy-pass="${a.account_password}" class="px-2 py-1 text-xs rounded bg-cyan-500 text-slate-950">Copy</button>
            </div>
        </div>
    `).join('');
}

function renderLoadingState() {
    summaryCards.innerHTML = '<div class="rounded-xl border border-slate-800 bg-slate-900 p-4">Loading dashboard...</div>';
}

function renderErrorState(message) {
    summaryCards.innerHTML = `<div class="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-rose-200">${message}</div>`;
}

async function syncData() {
    state.loading = true;
    state.error = null;
    renderLoadingState();

    try {
        const [me, products, orders, accounts] = await Promise.all([
            request('/api/me'),
            request('/api/products'),
            request('/api/orders/my'),
            request('/api/my/premium-accounts')
        ]);

        state.user = me.user;
        state.products = products.products;
        state.orders = orders.orders;
        state.accounts = accounts.accounts;

        localStorage.setItem('digitalshop_user', JSON.stringify(state.user));
        profileName.value = state.user.name || '';
        profileEmail.value = state.user.email || '';

        adminPanel.classList.toggle('hidden', state.user.role !== 'admin');
        renderDashboard();
        renderProducts();
        renderTransactions();
        renderPayments();
        renderAccounts();
    } catch (error) {
        state.error = error.message;
        renderErrorState(error.message);
    } finally {
        state.loading = false;
    }
}

navMenu.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-page]');
    if (!btn) return;
    showPage(btn.dataset.page);
    sidebar.classList.add('-translate-x-full');
});

document.addEventListener('click', (event) => {
    const jump = event.target.closest('[data-page-jump]');
    if (jump) showPage(jump.dataset.pageJump);
});

profileBtn.addEventListener('click', () => profileMenu.classList.toggle('hidden'));
mobileMenuBtn.addEventListener('click', () => sidebar.classList.toggle('-translate-x-full'));

logoutBtn.addEventListener('click', async () => {
    try {
        await request('/api/logout', { method: 'POST' });
    } catch (_) {
    }
    localStorage.removeItem('digitalshop_token');
    localStorage.removeItem('digitalshop_user');
    window.location.href = '/';
});

productGrid.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-order-product-id]');
    if (!button) return;
    try {
        await request('/api/orders/manual', {
            method: 'POST',
            body: JSON.stringify({ productId: Number(button.dataset.orderProductId) })
        });
        await syncData();
        showPage('payments');
    } catch (error) {
        alert(error.message);
    }
});

paymentList.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-upload-proof-id]');
    if (!button) return;

    const invoiceId = Number(button.dataset.uploadProofId);
    const fileInput = document.querySelector(`[data-proof-file-id="${invoiceId}"]`);
    const file = fileInput?.files?.[0];

    if (!file) {
        alert('Pilih file bukti terlebih dahulu.');
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
        await syncData();
    } catch (error) {
        alert(error.message);
    }
});

myAccounts.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-copy-pass]');
    if (!button) return;
    await navigator.clipboard.writeText(button.dataset.copyPass);
    button.textContent = 'Copied';
    setTimeout(() => {
        button.textContent = 'Copy';
    }, 1200);
});

adminRows.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-save-id]');
    if (!button) return;

    const id = Number(button.dataset.saveId);
    const input = document.querySelector(`[data-stock-id="${id}"]`);

    try {
        await request(`/api/admin/products/${id}/stock`, {
            method: 'PATCH',
            body: JSON.stringify({ stock: Number(input.value) })
        });
        await syncData();
    } catch (error) {
        alert(error.message);
    }
});

document.getElementById('settingsForm').addEventListener('submit', (event) => {
    event.preventDefault();
    alert('Update profil/password bisa ditambahkan endpoint backend terpisah bila diperlukan.');
});

(async () => {
    if (!state.token) {
        window.location.href = '/';
        return;
    }
    showPage('dashboard');
    await syncData();
})();
