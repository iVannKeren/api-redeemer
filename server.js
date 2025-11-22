const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const puppeteer = require('puppeteer');

const app = express();
// Render akan memberikan PORT secara otomatis lewat environment variable.
// Jika dijalankan di local, akan menggunakan port 3000.
const PORT = process.env.PORT || 3000; 

// Middleware
app.use(cors()); // PENTING: Mengizinkan Frontend cPanel mengakses Backend ini
app.use(bodyParser.json()); // Untuk membaca data JSON dari request

// URL Target CloudEmulator / Redfinger
const LOGIN_URL = 'https://www.cloudemulator.net/sign-in';
const TARGET_URL = 'https://www.cloudemulator.net/app/redeem-code/buy?utm_source=googleads&utm_medium=redfingerh5&utm_campaign=brand-ph&channelCode=web';

// Endpoint API yang akan dipanggil oleh Frontend
app.post('/api/run-redeem', async (req, res) => {
    const { email, password, redeemCode } = req.body;

    // 1. Validasi Input
    if (!email || !password || !redeemCode) {
        return res.status(400).json({ success: false, message: 'Email, Password, atau Kode tidak boleh kosong!' });
    }

    console.log(`[INFO] Memproses request untuk email: ${email}`);
    
    let browser = null;
    try {
        // 2. Konfigurasi Browser (Khusus Docker/Render)
        console.log('[INFO] Meluncurkan Browser...');
        browser = await puppeteer.launch({ 
            headless: "new", // Wajib mode headless (tanpa layar) di server cloud
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage', // Mencegah crash memori di container Docker
                '--single-process', 
                '--no-zygote'
            ],
            // Menggunakan Chrome yang sudah terinstall di dalam Docker Image (sesuai Dockerfile)
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined 
        });
        
        const page = await browser.newPage();
        
        // Set ukuran layar agar tampilan web normal (bukan tampilan mobile yang sempit)
        await page.setViewport({ width: 1366, height: 768 });

        // ==========================================
        // TAHAP 3: PROSES LOGIN
        // ==========================================
        console.log('--- Membuka Halaman Login ---');
        await page.goto(LOGIN_URL, { waitUntil: 'networkidle2', timeout: 60000 });

        // Fungsi Helper: Mencari selector yang valid dari daftar kemungkinan
        const findSelector = async (selectors) => {
            for (let s of selectors) {
                if (await page.$(s)) return s;
            }
            return null;
        };

        // Daftar kemungkinan selector (Antisipasi jika web target update class/id)
        const emailSelectors = ['input[type="email"]', 'input[name="email"]', '#email', '.el-input__inner'];
        const passSelectors = ['input[type="password"]', 'input[name="password"]', '#password'];
        const btnSelectors = ['button[type="submit"]', '.btn-login', 'button.primary', 'button'];

        const emailSel = await findSelector(emailSelectors);
        const passSel = await findSelector(passSelectors);
        
        if (!emailSel || !passSel) throw new Error("Form login tidak ditemukan. Struktur web mungkin berubah.");

        // Ketik Email & Password
        await page.type(emailSel, email);
        await page.type(passSel, password);
        
        // Klik Tombol Login
        const btnSel = await findSelector(btnSelectors);
        
        try {
            if (btnSel) {
                await Promise.all([
                    page.click(btnSel),
                    // Tunggu navigasi selesai atau timeout 30 detik
                    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 })
                ]);
            } else {
                // Fallback: Tekan Enter jika tombol tidak ketemu
                console.log('Tombol login spesifik tidak ketemu, menekan ENTER...');
                await page.keyboard.press('Enter');
                await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
            }
        } catch (e) {
            console.log("Info: Navigasi timeout atau sudah login, mencoba lanjut ke tahap berikutnya...");
        }

        // ==========================================
        // TAHAP 4: PROSES REDEEM
        // ==========================================
        console.log('--- Membuka Halaman Redeem ---');
        await page.goto(TARGET_URL, { waitUntil: 'networkidle2' });

        // Cari input redeem (biasanya elemen input pertama di page ini)
        const redeemInputSel = 'input'; 
        await page.waitForSelector(redeemInputSel, { timeout: 15000 });
        
        // Bersihkan input lama (jika ada) & Ketik Kode Baru
        await page.click(redeemInputSel, { clickCount: 3 });
        await page.type(redeemInputSel, redeemCode);
        
        // Logika Mencari Tombol "Redeem/Buy" berdasarkan Teks
        // Karena class tombol sering acak/berubah, kita cari berdasarkan kata kunci di dalamnya
        const buttons = await page.$$('button');
        let clicked = false;
        let btnTextFound = "";
        
        for (const btn of buttons) {
            const text = await page.evaluate(el => el.textContent.toLowerCase().trim(), btn);
            
            // Daftar kata kunci tombol konfirmasi
            if (text.includes('redeem') || text.includes('buy') || text.includes('confirm') || text.includes('pay') || text.includes('exchange') || text.includes('tukar')) {
                btnTextFound = text;
                console.log(`Tombol ditemukan: "${text}", Mengklik...`);
                await btn.click();
                clicked = true;
                break;
            }
        }

        if(!clicked) {
             console.log("Tombol spesifik tidak ditemukan, mencoba menekan Enter...");
             await page.keyboard.press('Enter');
             btnTextFound = "ENTER Key";
        }

        // Tunggu sebentar agar request diproses oleh server CloudEmulator
        await new Promise(r => setTimeout(r, 5000));

        // Ambil screenshot hasil (Opsional untuk debugging, dimatikan untuk performa)
        // const screenshot = await page.screenshot({ encoding: 'base64' });

        console.log('[INFO] Proses Selesai.');

        // 5. Kirim Respon Sukses ke Frontend
        res.json({ 
            success: true, 
            message: `Eksekusi Selesai (Tombol '${btnTextFound}' diklik). Silakan cek akun Anda.` 
        });

    } catch (error) {
        console.error('[ERROR FATAL]', error);
        res.status(500).json({ 
            success: false, 
            message: `Gagal: ${error.message}` 
        });
    } finally {
        // PENTING: Tutup browser untuk membersihkan RAM server
        if (browser) await browser.close();
    }
});

// Jalankan Server
app.listen(PORT, () => {
    console.log(`Server Backend Bot berjalan di port ${PORT}`);
});