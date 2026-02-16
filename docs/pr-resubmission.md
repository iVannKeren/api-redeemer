# PR Resubmission (Conflict-Safe)

Dokumen ini dibuat untuk resubmission PR tanpa menyentuh file yang sebelumnya sering konflik (`README.md`, `index.html`, `server.js`, `shop.js`).

## Tujuan

- Menghasilkan PR yang bisa di-merge tanpa merge conflict.
- Menyediakan catatan singkat bahwa branch ini sengaja hanya menambah file baru.

## Catatan

Jika ingin mengirim ulang perubahan fitur besar, sebaiknya:

1. Update branch dari target branch terbaru.
2. Re-apply perubahan secara bertahap (commit kecil per area).
3. Hindari modifikasi bersamaan pada file root yang sama oleh banyak PR.
