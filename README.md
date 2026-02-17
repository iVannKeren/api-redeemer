# API Redeemer (Vercel Ready)

Project ini berisi:
- Backend Express serverless di `api/index.js`.
- Frontend static di `public/` (`shop.html`, `clientarea.html`, `register.html`, dst).
- Routing Vercel via `vercel.json` supaya URL bersih seperti `/shop` dan `/clientarea` tetap mengarah ke file static yang benar.

## Prasyarat
- Node.js 18+
- npm
- Vercel CLI (opsional, untuk local parity): `npm i -g vercel`

## Environment Variables
Wajib di-set di local (`.env`) dan di Vercel Project Settings:

```bash
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

## Menjalankan Lokal

### 1) Install dependency
```bash
npm install
```

### 2) Jalankan sebagai Node server biasa
```bash
npm start
```
API akan hidup di `http://localhost:3000`.

Cek health:
```bash
curl http://localhost:3000/api/health
```

### 3) Jalankan seperti environment Vercel (opsional tapi direkomendasikan)
```bash
vercel dev
```
Lalu cek:
```bash
curl http://localhost:3000/api/health
```

## Deploy ke Vercel
1. Import repo ini ke Vercel.
2. Tambahkan semua environment variables (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`).
3. Deploy.
4. Verifikasi endpoint:
   - `GET /api/health` → `{ "success": true, "message": "API ready" }`
   - `GET /shop` → halaman landing.

## Catatan Arsitektur Milestone 1
- Entrypoint serverless tetap `api/index.js`.
- `server.js` disediakan hanya untuk mode local `npm start`, agar konsisten dan tidak lagi menunjuk file yang tidak ada.
- Frontend tetap berada di folder `public/`.
