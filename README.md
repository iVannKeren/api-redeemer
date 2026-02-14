# api-redeemer

Sistem marketplace akun premium dengan area publik + client dashboard terpisah.

## Struktur Folder & Route (Publik vs Client Area)

```txt
/
 codex/troubleshoot-admin-demo-login-issue-set5ns
├── shop.html             # Landing page (publik utama /shop)
├── index.html            # Landing alias (fallback root /)
=======
├── index.html            # Landing page (publik)
main
├── shop.js               # Logic login landing + redirect
├── clientarea.html       # Dashboard setelah login
├── clientarea.js         # Logic client area (routing menu, data, upload, order)
├── server.js             # REST API + auth/session + payment + stock + telegram
└── data/
    ├── app.db            # SQLite database
    └── payment_proofs/   # Bukti pembayaran upload
```

### Route utama
- Publik:
 codex/troubleshoot-admin-demo-login-issue-set5ns
  - `GET /shop` (utama) atau `GET /` (alias) → landing page
=======
  - `GET /` atau `GET /shop` → landing page
 main
- Protected UX:
  - `GET /clientarea` → UI dashboard client (butuh token valid, diverifikasi via `/api/me`)
- API auth:
  - `POST /api/login`, `POST /api/logout`, `GET /api/me`

---

## UI Flow (Login → /clientarea → Navigasi)

1. User akses landing (`/`) dan login.
2. Jika sukses, token disimpan di `localStorage` lalu redirect ke `/clientarea`.
3. Client area memanggil `/api/me`:
   - valid → load data dashboard.
   - invalid/expired → redirect balik ke landing.
4. User navigasi via sidebar/topbar (tanpa pindah page, section-based routing UI).

---

## Daftar Halaman Client Area + Komponen Layout

### Layout global (konsisten)
- Topbar:
  - logo/title context
  - search bar (opsional)
  - notifikasi (opsional)
  - profile dropdown (settings/logout)
- Sidebar:
  - Dashboard
  - Produk/Order
  - Transaksi
  - Pembayaran
  - Akun Premium Saya
  - Riwayat
  - Support
  - Settings
- Main content:
  - cards, table, status badge, empty state, loading/error state

### Halaman minimum
1. Dashboard
   - summary cards (total order, paid, waiting proof, akun aktif)
   - quick actions
   - pesanan terakhir
2. Produk/Order
   - list produk + tombol “Buat Order”
3. Transaksi
   - tabel invoice + badge status
4. Pembayaran
   - list invoice manual payment + upload bukti
5. Akun Premium Saya
   - kredensial akun terassign + tombol copy
6. Profil/Settings
   - edit profil/password (UI ready)
7. Support/Ticket (opsional)
   - placeholder channel support

---

## Wireframe teks (contoh)

```txt
[Topbar: Logo | Search | Bell | Profile]
--------------------------------------------------------
[Sidebar]                  [Main Content]
- Dashboard                [Summary Cards x4]
- Produk/Order             [Quick Actions]
- Transaksi                [Recent Orders]
- Pembayaran
- Akun Premium Saya
- Riwayat
- Support
- Settings
```

---

## Design System Rekomendasi (sudah diterapkan)
 codex/troubleshoot-admin-demo-login-issue-set5ns

- Primary: cyan (`text-cyan-300`, `bg-cyan-500`)
- Netral: slate (`bg-slate-950/900`, `border-slate-800`)
- Typography: konsisten heading bold + body text-sm
- Grid & spacing: card-based (`rounded-xl`, `p-4`, `gap-4`)
- Badge status:
  - `PAID` hijau
  - `UNPAID` kuning
  - `WAITING_PROOF` biru
  - `REJECTED` merah
  - `PAID_BUT_OUT_OF_STOCK` oranye
- Responsif:
  - desktop sidebar tetap
  - mobile sidebar jadi drawer (toggle)

---

## Data & Integrasi (loading / empty / error)

Di `clientarea.js` setiap data utama (`products`, `orders`, `accounts`) punya state:
- Loading: tampil indikator loading dashboard.
- Empty: tampil empty state untuk section terkait.
- Error: tampil panel error jika API gagal.

Data dashboard ditarik dari:
- `/api/products`
- `/api/orders/my`
- `/api/my/premium-accounts`
- `/api/me` untuk validasi sesi user.

---

## Best Practice Keamanan

1. Auth middleware di backend (`authRequired`) untuk endpoint private.
2. Role-based access (`adminRequired`) untuk endpoint admin.
3. Session token harus selalu diverifikasi (contoh `/api/me` saat load client area).
4. Pisahkan route publik dan route dashboard untuk UX + kontrol akses.
5. Validasi input/file upload (mime, size) tetap wajib.
6. Simpan password akun premium terenkripsi (AES-256-GCM) di DB.
7. Untuk production:
   - gunakan HttpOnly cookie/JWT yang aman + CSRF protection
   - rate limit login
   - audit log immutable
   - pertimbangkan refresh token flow

---

## API Fitur Manual Payment + Stock + Telegram (tetap tersedia)

- `POST /api/orders/manual`
- `GET /api/orders/my`
- `POST /api/orders/:id/proofs`
- `GET /api/my/premium-accounts`
- `GET /api/admin/invoices`
- `POST /api/admin/invoices/:id/approve`
- `POST /api/admin/invoices/:id/reject`
- `POST /api/admin/premium-stock/bulk`
- `GET /api/admin/premium-stock`
- `DELETE /api/admin/premium-stock/:id`
- `POST /api/telegram/webhook`

## Menjalankan Lokal

```bash
npm install
npm start
```

## Akun Demo
- Admin: `admin@digitalshop.com` / `admin123`
- Buyer: `buyer@digitalshop.com` / `buyer123`
=======

- Primary: cyan (`text-cyan-300`, `bg-cyan-500`)
- Netral: slate (`bg-slate-950/900`, `border-slate-800`)
- Typography: konsisten heading bold + body text-sm
- Grid & spacing: card-based (`rounded-xl`, `p-4`, `gap-4`)
- Badge status:
  - `PAID` hijau
  - `UNPAID` kuning
  - `WAITING_PROOF` biru
  - `REJECTED` merah
  - `PAID_BUT_OUT_OF_STOCK` oranye
- Responsif:
  - desktop sidebar tetap
  - mobile sidebar jadi drawer (toggle)

## Data & Integrasi (loading / empty / error)

Di `clientarea.js` setiap data utama (`products`, `orders`, `accounts`) punya state:
- Loading: tampil indikator loading dashboard.
- Empty: tampil empty state untuk section terkait.
- Error: tampil panel error jika API gagal.

Data dashboard ditarik dari:
- `/api/products`
- `/api/orders/my`
- `/api/my/premium-accounts`
- `/api/me` untuk validasi sesi user.

---

## Best Practice Keamanan

1. Auth middleware di backend (`authRequired`) untuk endpoint private.
2. Role-based access (`adminRequired`) untuk endpoint admin.
3. Session token harus selalu diverifikasi (contoh `/api/me` saat load client area).
4. Pisahkan route publik dan route dashboard untuk UX + kontrol akses.
5. Validasi input/file upload (mime, size) tetap wajib.
6. Simpan password akun premium terenkripsi (AES-256-GCM) di DB.
7. Untuk production:
   - gunakan HttpOnly cookie/JWT yang aman + CSRF protection
   - rate limit login
   - audit log immutable
   - pertimbangkan refresh token flow

---

## API Fitur Manual Payment + Stock + Telegram (tetap tersedia)

- `POST /api/orders/manual`
- `GET /api/orders/my`
- `POST /api/orders/:id/proofs`
- `GET /api/my/premium-accounts`
- `GET /api/admin/invoices`
- `POST /api/admin/invoices/:id/approve`
- `POST /api/admin/invoices/:id/reject`
- `POST /api/admin/premium-stock/bulk`
- `GET /api/admin/premium-stock`
- `DELETE /api/admin/premium-stock/:id`
- `POST /api/telegram/webhook`

## Menjalankan Lokal

```bash
npm install
npm start
main
