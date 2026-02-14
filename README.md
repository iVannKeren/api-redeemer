# api-redeemer

Sistem jual-beli akun premium dengan:

- Login customer/admin.
- Manual payment + upload bukti bayar.
- Review bukti bayar (web admin / Telegram bot).
- Auto-assign akun premium saat pembayaran approved.
- Audit log dan notifikasi Telegram.

## Menjalankan lokal

```bash
npm install
npm start
```

Buka `http://localhost:3000/shop`.

## Akun demo

- Admin: `admin@digitalshop.com` / `admin123`
- Buyer: `buyer@digitalshop.com` / `buyer123`

---

## 1) Desain Database (SQL)

Implementasi memakai SQLite (`data/app.db`).

### Tabel inti

1. `invoices`
   - `id`, `user_id`, `product_id`, `amount`, `payment_method`, `status`, `rejection_reason`, `created_at`, `updated_at`
   - status: `UNPAID`, `WAITING_PROOF`, `PAID`, `REJECTED`, `PAID_BUT_OUT_OF_STOCK`

2. `payment_proofs`
   - `id`, `invoice_id`, `user_id`, `source` (`web`/`telegram`), `mime_type`, `original_name`, `file_path`, `telegram_file_id`, `status`, `created_at`

3. `premium_account_stock`
   - `id`, `product_id`, `account_email`, `account_password_encrypted`, `status`, `assigned_invoice_id`, `assigned_user_id`, `created_by_admin_id`, `created_at`, `assigned_at`
   - status: `AVAILABLE`, `ASSIGNED`, `USED`

4. `user_premium_accounts`
   - `id`, `user_id`, `invoice_id`, `stock_id`, `product_id`, `account_email`, `account_password_encrypted`, `created_at`

5. `audit_logs`
   - `id`, `admin_user_id`, `actor`, `action`, `invoice_id`, `user_id`, `meta_json`, `created_at`

Tambahan:
- `users` dan `products` sebagai master data.

---

## 2) End-to-End Flow

1. Client login.
2. Client pilih produk ➜ `POST /api/orders/manual`.
3. Invoice dibuat status `UNPAID`.
4. Client upload bukti bayar (`POST /api/orders/:id/proofs`) dari Web.
5. Sistem set status invoice `WAITING_PROOF` + kirim notifikasi Telegram admin.
6. Admin review:
   - via web: approve/reject endpoint admin
   - via bot: tombol callback `approve:<invoiceId>` atau command reject
7. Approve:
   - status invoice `PAID`
   - trigger auto-assign stok (atomic flow pada service)
   - ambil 1 stok `AVAILABLE` lalu set `ASSIGNED`
   - simpan kredensial ke `user_premium_accounts`
8. Jika stok kosong:
   - invoice jadi `PAID_BUT_OUT_OF_STOCK`
   - kirim notifikasi Telegram stok habis
9. User lihat kredensial di Client Area “Akun Premium Saya”.

---

## 3) Endpoint/API

### Auth
- `POST /api/login`
- `POST /api/logout`

### Produk
- `GET /api/products`
- `PATCH /api/admin/products/:id/stock` (admin)

### Manual Payment
- `POST /api/orders/manual` (buat invoice)
- `GET /api/orders/my` (list invoice user)
- `POST /api/orders/:id/proofs` (upload bukti via JSON base64)

### Premium Accounts
- `GET /api/my/premium-accounts`

### Admin Payment Review
- `GET /api/admin/invoices`
- `POST /api/admin/invoices/:id/approve`
- `POST /api/admin/invoices/:id/reject`

### Admin Stock Premium
- `POST /api/admin/premium-stock/bulk` (input multi-line `email|password`)
- `GET /api/admin/premium-stock`
- `DELETE /api/admin/premium-stock/:id`

### Audit
- `GET /api/admin/audit-logs`

### Telegram
- `POST /api/telegram/webhook`

---

## 4) Struktur Bot Telegram

Gunakan webhook ke `/api/telegram/webhook`.

### Command
- `/addstock email1|pass1` (single)
- `/addstock` lalu paste multi-line `email|password` (bulk)
- `/reject <invoiceId> <reason>`

### Callback Button
- `approve:<invoiceId>`
- `reject:<invoiceId>` ➜ bot minta admin kirim command `/reject`

### Akses bot
- whitelist admin pakai env `TG_ADMIN_IDS`.

---

## 5) Pseudocode Approve + Assign Stok

```pseudo
function approveInvoice(invoiceId, adminId):
  BEGIN IMMEDIATE
  invoice = SELECT ... FOR UPDATE (simulasi lock via BEGIN IMMEDIATE)
  if status not in [UNPAID, WAITING_PROOF]: rollback+error

  UPDATE invoices SET status='PAID'
  UPDATE payment_proofs SET status='APPROVED'
  INSERT audit_logs(action='PAYMENT_APPROVED')
  COMMIT

  assignStockToPaidInvoice(invoiceId)

function assignStockToPaidInvoice(invoiceId):
  BEGIN IMMEDIATE
  stock = SELECT first AVAILABLE for product
  if stock empty:
    UPDATE invoices SET status='PAID_BUT_OUT_OF_STOCK'
    INSERT audit_logs(action='AUTO_ASSIGN_NO_STOCK')
    COMMIT
    notifyTelegram('stok habis')
    return

  UPDATE premium_account_stock SET status='ASSIGNED', assigned_invoice_id=?, assigned_user_id=?
  INSERT user_premium_accounts(... encrypted password ...)
  INSERT audit_logs(action='AUTO_ASSIGN_SUCCESS')
  COMMIT
  notifyTelegram('akun assigned')
```

---

## 6) Keamanan & Konsistensi Data

- Password akun premium disimpan terenkripsi AES-256-GCM (`account_password_encrypted`).
- Kunci enkripsi dari `STOCK_SECRET_KEY` env (wajib ganti di production).
- Upload bukti bayar divalidasi:
  - mime: png/jpg/webp/pdf
  - max size: 5MB
- Auto-assign aman dari race condition level aplikasi dengan mekanisme atomic update di service (untuk produksi disarankan DB driver dengan row locking nyata).

---

## 7) Environment Variables

- `PORT` (default `3000`)
- `STOCK_SECRET_KEY` (wajib custom di production)
- `TG_BOT_TOKEN`
- `TG_ADMIN_CHAT_ID`
- `TG_ADMIN_IDS` (contoh: `12345,99887`)

---

## 8) Edge Cases & Test Cases

### Edge cases
- Upload bukti bayar dengan mime tidak valid.
- Upload file > 5MB.
- Approve invoice yang sudah `PAID` / `REJECTED`.
- Assign stok saat tidak ada `AVAILABLE`.
- Hapus stok yang sudah `ASSIGNED`.
- Command bot oleh user non-whitelist.
- Format bulk stock salah (tanpa `|`).

### Test cases (minimal)
1. Buyer buat invoice manual payment ➜ status `UNPAID`.
2. Buyer upload bukti ➜ status `WAITING_PROOF`, proof tersimpan.
3. Admin approve ➜ status `PAID` lalu account assigned.
4. Admin reject + alasan ➜ status `REJECTED`.
5. Approve saat stok kosong ➜ `PAID_BUT_OUT_OF_STOCK`.
6. `/addstock` telegram valid ➜ stok bertambah.
7. `/addstock` telegram invalid format ➜ error message.
8. Audit logs terisi untuk create invoice, upload proof, approve/reject, assign.
