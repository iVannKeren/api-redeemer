const list = document.getElementById('list');
const statusEl = document.getElementById('status');

function token() {
  return localStorage.getItem('digitalshop_token') || '';
}

async function api(path, options = {}) {
  const t = token();
  if (!t) throw new Error('Silakan login dulu.');

  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${t}`,
      ...(options.headers || {})
    }
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Request gagal');
  return data;
}

async function loadProducts() {
  try {
    const data = await api('/api/products');
    const products = data.products || [];

    if (!products.length) {
      statusEl.textContent = 'Belum ada produk. Tambahkan seed products di Supabase.';
      return;
    }

    list.innerHTML = products.map(p => `
      <div class="bg-slate-900 border border-slate-800 rounded-2xl p-4">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h3 class="font-semibold text-lg">${p.name}</h3>
            <p class="text-slate-300 text-sm mt-1">Harga: <b>Rp ${Number(p.price).toLocaleString('id-ID')}</b></p>
            <p class="text-slate-400 text-sm">Stok: ${p.stock}</p>
          </div>
          <button data-id="${p.id}"
            class="buy bg-cyan-500 text-slate-950 font-bold px-3 py-2 rounded-lg">
            Beli
          </button>
        </div>
      </div>
    `).join('');

    document.querySelectorAll('.buy').forEach(btn => {
      btn.addEventListener('click', () => createOrder(Number(btn.dataset.id)));
    });

  } catch (e) {
    statusEl.textContent = e.message;
    if (e.message.toLowerCase().includes('login')) window.location.href = '/shop';
  }
}

async function createOrder(productId) {
  try {
    statusEl.textContent = 'Membuat order...';
    const data = await api('/api/orders', {
      method: 'POST',
      body: JSON.stringify({ product_id: productId, qty: 1 })
    });

    const order = data.order;
    statusEl.textContent = `Order dibuat: ${order.invoice}. Mengalihkan ke pembayaran...`;
    window.location.href = `/payment?order=${order.id}`;
  } catch (e) {
    statusEl.textContent = e.message;
  }
}

loadProducts();