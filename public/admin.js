const API_BASE = "/api";

// jangan pakai nama "supabase" biar gak bentrok dengan window.supabase dari CDN
let sb = null;

// UI elements
const loginBox = document.getElementById("loginBox");
const adminBox = document.getElementById("adminBox");
const userInfo = document.getElementById("userInfo");
const btnLogout = document.getElementById("btnLogout");

const emailEl = document.getElementById("email");
const passEl = document.getElementById("password");
const btnLogin = document.getElementById("btnLogin");
const loginMsg = document.getElementById("loginMsg");

const btnLoad = document.getElementById("btnLoad");
const btnLoadApproved = document.getElementById("btnLoadApproved");
const btnLoadRejected = document.getElementById("btnLoadRejected");

const msg = document.getElementById("msg");
const ordersEl = document.getElementById("orders");
const debugEl = document.getElementById("debug");

function setMsg(text, type = "muted") {
  msg.className = type;
  msg.textContent = text || "";
}
function setLoginMsg(text) {
  loginMsg.textContent = text || "";
}
function fmtDate(iso) {
  try { return new Date(iso).toLocaleString(); } catch { return iso || "-"; }
}

async function fetchConfig() {
  const res = await fetch(`${API_BASE}/config`);
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json?.message || "Failed to load config");
  if (!json.supabaseUrl || !json.supabaseAnonKey) {
    throw new Error("Missing SUPABASE_URL / SUPABASE_ANON_KEY in server env");
  }
  return json;
}

async function initSupabase() {
  setLoginMsg("Loading config...");
  const cfg = await fetchConfig();

  // CDN supabase-js v2: window.supabase.createClient(...)
  sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);

  setLoginMsg("");
}

// AUTH helpers
async function getToken() {
  const { data: { session } } = await sb.auth.getSession();
  return session?.access_token || null;
}

async function refreshAuthUI() {
  const { data: { user } } = await sb.auth.getUser();

  if (user) {
    userInfo.textContent = `Logged in: ${user.email}`;
    btnLogout.style.display = "inline-block";
    loginBox.style.display = "none";
    adminBox.style.display = "block";
    setLoginMsg("");
  } else {
    userInfo.textContent = "Not logged in";
    btnLogout.style.display = "none";
    loginBox.style.display = "block";
    adminBox.style.display = "none";
  }
}

btnLogin.addEventListener("click", async () => {
  const email = (emailEl.value || "").trim();
  const password = passEl.value || "";
  if (!email || !password) return setLoginMsg("Email & password wajib diisi.");

  setLoginMsg("Logging in...");
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return setLoginMsg(`Login gagal: ${error.message}`);

  setLoginMsg("Login berhasil.");
  await refreshAuthUI();
});

btnLogout.addEventListener("click", async () => {
  await sb.auth.signOut();
  ordersEl.innerHTML = "";
  debugEl.textContent = "{}";
  setMsg("");
  await refreshAuthUI();
});

// API helper
async function apiFetch(path, options = {}) {
  const token = await getToken();
  if (!token) throw new Error("No session token. Login dulu.");

  const headers = {
    ...(options.headers || {}),
    Authorization: `Bearer ${token}`,
  };

  if (options.body && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }

  debugEl.textContent = JSON.stringify({ status: res.status, json }, null, 2);

  if (!res.ok) {
    throw new Error(json?.message || json?.error || `HTTP ${res.status}`);
  }
  return json;
}

// Render
function renderOrders(orders) {
  if (!orders || orders.length === 0) {
    ordersEl.innerHTML = `<div class="card"><b>Tidak ada data.</b></div>`;
    return;
  }

  ordersEl.innerHTML = orders.map(o => {
    const proofs = Array.isArray(o.order_proofs) ? o.order_proofs : [];
    const proofHtml = proofs.length
      ? proofs.map(p => `
          <div class="muted">
            Proof ID: ${p.id} • ${fmtDate(p.created_at)}<br/>
            <a href="${p.file_url || "-"}" target="_blank" rel="noopener">Buka bukti</a>
          </div>
        `).join("<hr/>")
      : `<div class="muted">Belum ada bukti di order_proofs.</div>`;

    const rejectReason = o.reject_reason ? `<div class="bad">Reject reason: ${o.reject_reason}</div>` : "";

    return `
      <div class="card">
        <div><b>Order #${o.id}</b> <span class="pill">${o.status}</span></div>
        <div class="muted">
          User: ${o.user_id || "-"}<br/>
          Amount: ${o.amount ?? "-"}<br/>
          Invoice: ${o.invoice || "-"}<br/>
          Payment: ${o.payment_method || "-"}<br/>
          Created: ${fmtDate(o.created_at)}
        </div>
        ${rejectReason}
        <div style="margin-top:10px;"><b>Bukti:</b></div>
        ${proofHtml}
        <div class="actions">
          <button onclick="approveOrder(${o.id})">✅ Approve</button>
          <button onclick="rejectOrder(${o.id})">❌ Reject</button>
        </div>
      </div>
    `;
  }).join("");
}

// expose
window.approveOrder = async function(orderId) {
  if (!confirm(`Approve order #${orderId}?`)) return;
  try {
    setMsg("Processing approve...");
    await apiFetch(`/admin/orders/${orderId}/approve`, { method: "POST" });
    setMsg(`Approved order #${orderId}`, "ok");
    await loadByStatus("WAITING_PROOF");
  } catch (e) {
    setMsg(`Approve gagal: ${e.message}`, "bad");
  }
};

window.rejectOrder = async function(orderId) {
  const reason = prompt(`Alasan reject untuk order #${orderId}? (wajib isi)`);
  if (reason === null) return;
  if (!reason.trim()) return alert("Reason wajib diisi.");

  try {
    setMsg("Processing reject...");
    await apiFetch(`/admin/orders/${orderId}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason: reason.trim() }),
    });
    setMsg(`Rejected order #${orderId}`, "ok");
    await loadByStatus("WAITING_PROOF");
  } catch (e) {
    setMsg(`Reject gagal: ${e.message}`, "bad");
  }
};

async function loadByStatus(status) {
  try {
    setMsg(`Loading status=${status}...`);
    const json = await apiFetch(`/admin/orders?status=${encodeURIComponent(status)}`, { method: "GET" });
    renderOrders(json.orders);
    setMsg(`Loaded ${json.orders?.length || 0} orders (${status})`, "ok");
  } catch (e) {
    setMsg(`Load gagal: ${e.message}`, "bad");
  }
}

btnLoad.addEventListener("click", () => loadByStatus("WAITING_PROOF"));
btnLoadApproved.addEventListener("click", () => loadByStatus("PAID"));
btnLoadRejected.addEventListener("click", () => loadByStatus("REJECTED"));

// init
(async () => {
  try {
    await initSupabase();
    await refreshAuthUI();
    sb.auth.onAuthStateChange(async () => refreshAuthUI());
  } catch (e) {
    setLoginMsg(`Init error: ${e.message}`);
  }
})();