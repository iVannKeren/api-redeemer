# api-redeemer

Project ini sekarang memiliki:

- API redeem otomatis (`/api/run-redeem`) berbasis Puppeteer.
- Halaman **Digital Shop Pro** di `/shop` (atau `/`) dengan tema profesional.
- Sistem login sederhana untuk customer/admin.
- Admin panel untuk update stok produk premium (Vidio, Netflix, Canva, dll).

## Menjalankan lokal

```bash
npm install
npm start
```

Buka `http://localhost:3000/shop`.

## Akun demo

- Admin: `admin@digitalshop.com` / `admin123`
- Buyer: `buyer@digitalshop.com` / `buyer123`

## Endpoint utama

- `POST /api/login`
- `POST /api/logout`
- `GET /api/products` (butuh login)
- `PATCH /api/admin/products/:id/stock` (khusus admin)
- `POST /api/run-redeem`


## Catatan mode demo lokal

- Jika frontend tidak bisa menjangkau endpoint `/api/*` (misalnya saat hanya deploy static), aplikasi otomatis beralih ke **mode demo lokal** agar login demo dan fitur stok tetap bisa dicoba.
- Tambahkan query `?demo_local=1` untuk memaksa mode demo lokal saat testing.
