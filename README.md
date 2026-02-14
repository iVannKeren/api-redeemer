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

- Admin: `admin@digitalshop.local` / `admin123`
- Buyer: `buyer@digitalshop.local` / `buyer123`

## Endpoint utama

- `POST /api/login`
- `POST /api/logout`
- `GET /api/products` (butuh login)
- `PATCH /api/admin/products/:id/stock` (khusus admin)
- `POST /api/run-redeem`
