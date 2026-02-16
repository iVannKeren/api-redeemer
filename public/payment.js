const qs = new URLSearchParams(location.search);
const orderId = qs.get('order');

const statusEl = document.getElementById('status');
const invoiceEl = document.getElementById('invoice');
const productEl = document.getElementById('product');
const amountEl = document.getElementById('amount');
const orderStatusEl = document.getElementById('orderStatus');

function token() {
  return localStorage.getItem('digitalshop_token') || '';
}

async function api(path) {
  const t = token();
  if (!t) throw new Error('Silakan login dulu.');

  const res = await fetch(path, {
    headers: { Authorization: `Bearer ${t}` }
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Request gagal');
  return data;
}

(async () => {
  try {
    if (!orderId) throw new Error('Order ID tidak ada.');
    statusEl.textContent = 'Memuat order...';

    const data = await api(`/api/orders/${orderId}`);
    const o = data.order;

    invoiceEl.textContent = o.invoice || `ORDER-${o.id}`;
    productEl.textContent = o.products?.name || `Product #${o.product_id}`;
    amountEl.textContent = `Rp ${Number(o.amount).toLocaleString('id-ID')}`;
    orderStatusEl.textContent = o.status;

    statusEl.textContent = 'Silakan lakukan pembayaran sesuai instruksi.';
  } catch (e) {
    statusEl.textContent = e.message;
  }
})();