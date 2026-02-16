const state = {
  token:
    localStorage.getItem('digitalshop_token') ||
    localStorage.getItem('access_token') ||
    localStorage.getItem('token') ||
    '',
  user: JSON.parse(localStorage.getItem('digitalshop_user') || 'null'),
  products: [],
  orders: [],
  accounts: [],
  paymentMethods: [],
  loading: false,
  error: null,
  currentPage: 'dashboard',
};

const pageTitle = document.getElementById('pageTitle');
const navMenu = document.getElementById('navMenu');
const summaryCards = document.getElementById('summaryCards');
const latestOrders = document.getElementById('latestOrders');
const productGrid = document.getElementById('productGrid');
const transactionTable = document.getElementById('transactionTable');
const paymentList = document.getElementById('paymentList');
const paymentMethodsBox = document.getElementById('paymentMethods');
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
    PAID_BUT_OUT_OF_STOCK: 'bg-orange-500/20 text-orange-300 border border-orange-500/30',
  };
  return map[status] || 'bg-slate-800 text-slate-200 border border-slate-700';
}

function formatRupiah(v) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(v || 0);
}

// ✅ helper: ambil nama produk dari join `products`
function getProductName(order) {
  return order?.products?.name || order?.product_name || `Product #${order?.product_id ?? '-'}`;
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

function redirectToShop(message) {
  localStorage.removeItem('digitalshop_token');
  localStorage.removeItem('digitalshop_user');
  if (message) alert(message);
  window.location.href = '/shop';
}

async function safeJson(res) {
  const text = await res.text().catch(() => '');
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { message: text || 'Response tidak valid' };
  }
}

async function request(path, options = {}) {
  if (!state.token) {
    redirectToShop('Silakan login terlebih dahulu.');
    throw new Error('Unauthorized');
  }

  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(cleanPath, window.location.origin).toString();

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
    Authorization: `Bearer ${state.token}`,
  };

  const res = await fetch(url, { ...options, headers });

  if (res.status === 401) {
    redirectToShop('Session habis, silakan login ulang.');
    throw new Error('Session habis, silakan login ulang.');
  }

  const payload = await safeJson(res);

  if (res.status === 404) {
    console.error('API 404 Not Found:', url, payload);
    throw new Error('API tidak ditemukan (404). Pastikan route /api sudah benar dan file clientarea.js sudah update.');
  }

  if (!res.ok) {
    throw new Error(payload.message || 'Terjadi kesalahan');
  }

  return payload;
}

function renderDashboard() {
  const paid = state.orders.filter((o) => o.status === 'PAID').length;
  const waiting = state.orders.filter((o) => o.status === 'WAITING_PROOF').length;

  const cards = [
    { title: 'Total Order', value: state.orders.length, sub: 'Semua transaksi' },
    { title: 'Status PAID', value: paid, sub: 'Pembayaran approved' },
    { title: 'Menunggu Review', value: waiting, sub: 'WAITING_PROOF' },
    { title: 'Akun Aktif', value: state.accounts.length, sub: 'Sudah terassign' },
  ];

  summaryCards.innerHTML = cards
    .map(
      (c) => `
        <article class="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <p class="text-xs text-slate-400">${c.title}</p>
            <h3 class="text-2xl font-bold mt-2">${c.value}</h3>
            <p class="text-xs text-slate-500 mt-1">${c.sub}</p>
        </article>
    `
    )
    .join('');

  if (!state.orders.length) {
    latestOrders.innerHTML = '<p class="text-slate-400">Belum ada order. Mulai dari menu Produk / Order.</p>';
    return;
  }

  latestOrders.innerHTML = state.orders
    .slice(0, 3)
    .map(
      (o) => `
        <div class="flex items-center justify-between py-2 border-b border-slate-800 last:border-0">
            <div>
                <p>#${o.id} · ${getProductName(o)}</p>
                <p class="text-xs text-slate-400">${formatRupiah(o.amount)}</p>
            </div>
            <span class="text-xs px-2 py-1 rounded-full ${badgeClass(o.status)}">${o.status}</span>
        </div>
    `
    )
    .join('');
}

function renderProducts() {
  if (!state.products.length) {
    productGrid.innerHTML = '<p class="text-slate-400">Produk kosong.</p>';
    return;
  }

  productGrid.innerHTML = state.products
    .map(
      (p) => `
        <article class="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <h3 class="font-semibold">${p.name}</h3>
            <p class="text-xs text-slate-400 mt-2">Harga: ${formatRupiah(p.price)}</p>
            <p class="text-xs text-slate-500 mt-1">Stock: ${p.stock}</p>
            <div class="mt-4 flex items-center justify-between">
                <button data-order-product-id="${p.id}" class="px-3 py-1 rounded bg-cyan-500 text-slate-950 text-xs font-semibold">Buat Order</button>
            </div>
        </article>
    `
    )
    .join('');
}

function renderTransactions() {
  if (!state.orders.length) {
    transactionTable.innerHTML = '<p class="text-slate-400">Belum ada transaksi.</p>';
    return;
  }

  transactionTable.innerHTML = `
        <table class="w-full text-sm">
            <thead class="text-slate-400">
                <tr>
                    <th class="text-left py-2">Invoice</th>
                    <th class="text-left py-2">Produk</th>
                    <th class="text-left py-2">Amount</th>
                    <th class="text-left py-2">Status</th>
                </tr>
            </thead>
            <tbody>
                ${state.orders
                  .map(
                    (o) => `
                    <tr class="border-t border-slate-800">
                        <td class="py-2">#${o.id}</td>
                        <td class="py-2">${getProductName(o)}</td>
                        <td class="py-2">${formatRupiah(o.amount)}</td>
                        <td class="py-2"><span class="text-xs px-2 py-1 rounded-full ${badgeClass(o.status)}">${o.status}</span></td>
                    </tr>
                `
                  )
                  .join('')}
            </tbody>
        </table>
    `;
}

function renderPayments() {
  if (paymentMethodsBox) {
    if (!state.paymentMethods.length) {
      paymentMethodsBox.innerHTML = '<p class="text-slate-400 text-sm">Metode pembayaran belum diatur.</p>';
    } else {
      paymentMethodsBox.innerHTML = state.paymentMethods
        .map(
          (m) => `
                <div class="border border-slate-800 rounded-lg p-3">
                    <p class="font-semibold">${m.name} <span class="text-xs text-slate-400">(${m.type})</span></p>
                    <p class="text-sm mt-1">${m.number}</p>
                    <p class="text-xs text-slate-400">a.n. ${m.holder || '-'}</p>
                    ${m.note ? `<p class="text-xs text-slate-500 mt-2">${m.note}</p>` : ''}
                </div>
            `
        )
        .join('');
    }
  }

  if (!state.orders.length) {
    paymentList.innerHTML = '<p class="text-slate-400">Belum ada invoice pembayaran.</p>';
    return;
  }

  paymentList.innerHTML = state.orders
    .map((o) => {
      const canUpload = o.status === 'UNPAID' || o.status === 'REJECTED';
      const waiting = o.status === 'WAITING_PROOF';
      const done = o.status === 'PAID';

      const actionHtml = done
        ? `<p class="text-xs text-emerald-300 mt-3">Pembayaran sudah dikonfirmasi.</p>`
        : waiting
          ? `<p class="text-xs text-sky-300 mt-3">Bukti sudah dikirim. Menunggu review admin.</p>`
          : `
                    <div class="mt-3 flex gap-2 items-center">
                        <input type="file" data-proof-file-id="${o.id}" class="text-xs" accept="image/png,image/jpeg,image/webp,application/pdf">
                        <button data-upload-proof-id="${o.id}" class="px-3 py-1 rounded bg-emerald-500 text-slate-950 text-xs ${
                          canUpload ? '' : 'opacity-50 pointer-events-none'
                        }">
                            Upload Bukti
                        </button>
                    </div>
                  `;

      return `
        <div class="border border-slate-800 rounded-lg p-3">
            <p class="font-semibold">Invoice #${o.id} · ${getProductName(o)}</p>
            <p class="text-xs text-slate-400 mt-1">Metode: MANUAL_PAYMENT · ${formatRupiah(o.amount)}</p>
            <span class="inline-flex mt-2 text-xs px-2 py-1 rounded-full ${badgeClass(o.status)}">${o.status}</span>
            ${actionHtml}
        </div>`;
    })
    .join('');
}

function renderAccounts() {
  if (!state.accounts.length) {
    myAccounts.innerHTML = '<p class="text-slate-400">Belum ada akun premium.</p>';
    return;
  }

  myAccounts.innerHTML = state.accounts
    .map(
      (a) => `
        <div class="border border-slate-800 rounded-lg p-3">
            <p class="font-semibold">${a.provider || 'Premium Account'}</p>
            <p class="text-xs text-slate-400 mt-1">Username: ${a.username || '-'}</p>
            <p class="text-xs text-slate-500 mt-1">Status: ${a.status}</p>
        </div>
    `
    )
    .join('');
}

function renderAdmin() {
  if (!state.products.length) {
    adminRows.innerHTML = '<p class="text-slate-400">Tidak ada produk.</p>';
    return;
  }

  adminRows.innerHTML = state.products
    .map(
      (p) => `
        <tr class="border-t border-slate-800">
            <td class="py-2">${p.name}</td>
            <td class="py-2">${formatRupiah(p.price)}</td>
            <td class="py-2">
                <input type="number" min="0" value="${p.stock}" data-admin-stock="${p.id}" class="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm w-24">
            </td>
            <td class="py-2">
                <button data-admin-save-stock="${p.id}" class="px-3 py-1 rounded bg-cyan-500 text-slate-950 text-xs font-semibold">Simpan</button>
            </td>
        </tr>
    `
    )
    .join('');
}

function renderLoadingState() {}

async function syncData() {
  state.loading = true;
  state.error = null;
  renderLoadingState();

  try {
    const [me, products, orders, accounts, pay] = await Promise.all([
      request('/api/me'),
      request('/api/products'),
      request('/api/orders/my'),
      request('/api/my/premium-accounts'),
      request('/api/payment-methods'),
    ]);

    state.user = me.user;
    state.products = products.products || [];
    state.orders = orders.orders || [];
    state.accounts = accounts.accounts || [];
    state.paymentMethods = pay && pay.methods ? pay.methods : [];

    localStorage.setItem('digitalshop_user', JSON.stringify(state.user));
    if (profileName) profileName.value = state.user?.name || '';
    if (profileEmail) profileEmail.value = state.user?.email || '';

    if (adminPanel) adminPanel.classList.toggle('hidden', state.user?.role !== 'admin');

    renderDashboard();
    renderProducts();
    renderTransactions();
    renderPayments();
    renderAccounts();
    if (adminRows) renderAdmin();
  } catch (error) {
    console.error(error);
    alert(error.message);
  } finally {
    state.loading = false;
    renderLoadingState();
  }
}

// UI events
navMenu?.addEventListener('click', (event) => {
  const btn = event.target.closest('[data-page]');
  if (!btn) return;
  showPage(btn.dataset.page);
});

profileBtn?.addEventListener('click', () => {
  profileMenu?.classList.toggle('hidden');
});

mobileMenuBtn?.addEventListener('click', () => {
  sidebar?.classList.toggle('hidden');
});

logoutBtn?.addEventListener('click', () => {
  localStorage.removeItem('digitalshop_token');
  localStorage.removeItem('digitalshop_user');
  window.location.href = '/shop';
});

productGrid?.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-order-product-id]');
  if (!button) return;

  try {
    await request('/api/orders/manual', {
      method: 'POST',
      body: JSON.stringify({ productId: Number(button.dataset.orderProductId) }),
    });

    await syncData();
    showPage('payments');
  } catch (error) {
    alert(error.message);
  }
});

paymentList?.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-upload-proof-id]');
  if (!button) return;

  const invoiceId = Number(button.dataset.uploadProofId);
  const fileInput = paymentList.querySelector(`[data-proof-file-id="${invoiceId}"]`);
  const file = fileInput?.files?.[0];
  if (!file) return alert('Pilih file bukti pembayaran dulu.');
  // BATAS MAKSIMAL FILE (mis: 2.5MB supaya aman di Vercel + base64)
const MAX_BYTES = 2.5 * 1024 * 1024;

if (file.size > MAX_BYTES) {
  alert("File terlalu besar. Maks 2.5MB. Kompres gambar dulu ya (atau upload JPG).");
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
      body: JSON.stringify({ fileName: file.name, mimeType: file.type, contentBase64: base64, source: 'web' }),
    });
    await syncData();
    showPage('payments');
  } catch (error) {
    alert(error.message);
  }
});

adminRows?.addEventListener('click', async (event) => {
  const btn = event.target.closest('[data-admin-save-stock]');
  if (!btn) return;
  const id = Number(btn.dataset.adminSaveStock);

  const input = adminRows.querySelector(`[data-admin-stock="${id}"]`);
  const newStock = Number(input.value || 0);

  try {
    await request(`/api/admin/products/${id}/stock`, {
      method: 'POST',
      body: JSON.stringify({ stock: newStock }),
    });
    await syncData();
  } catch (error) {
    alert(error.message);
  }
});

// start
syncData();
showPage('dashboard');