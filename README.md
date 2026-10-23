# FinTrack — Pencatat Keuangan Pribadi (Android)

Aplikasi pencatatan pemasukan & pengeluaran **offline** untuk Android: React Native + Expo (SDK 54) + TypeScript, database lokal **SQLite**. Bahasa Indonesia, format `Rp1.250.000`, tanggal `23 Okt 2026`, zona waktu Asia/Jakarta, tema terang/gelap.

---

## 1. Cara mendapatkan file APK

APK tidak bisa dikompilasi di lingkungan tempat proyek ini dibuat (akses ke Android SDK, Google Maven, dan npm diblokir). Pilih salah satu cara di bawah — semuanya memakai proyek ini apa adanya.

### Opsi A — GitHub Actions (paling mudah, tanpa install apa pun)
1. Buat repository baru di github.com (boleh private).
2. Unggah seluruh isi folder `fintrack` (termasuk folder tersembunyi `.github`). Di browser: **Add file → Upload files**, seret semua file/folder.
3. Buka tab **Actions** → workflow **Build APK** → **Run workflow** (berjalan otomatis setiap push ke `main`).
4. Tunggu ±15–25 menit. Buka run yang selesai → bagian **Artifacts** → unduh **FinTrack-apk** (zip berisi `app-release.apk`).
5. Pindahkan APK ke HP → buka → izinkan "Instal dari sumber tidak dikenal".

Workflow ini juga menjalankan seluruh test otomatis sebelum build; build gagal bila ada test yang gagal.

### Opsi B — Expo EAS Build (cloud Expo, akun gratis)
```bash
npm install
npx expo install --fix          # menyelaraskan versi modul dengan Expo SDK
npm install -g eas-cli
eas login
eas build -p android --profile preview   # menghasilkan .apk (lihat eas.json)
```
Setelah selesai, EAS memberi tautan unduh APK + QR code untuk langsung dipasang di HP.

### Opsi C — Lokal dengan Android Studio
Butuh Node 20+, JDK 17, Android SDK (via Android Studio).
```bash
npm install
npx expo install --fix
npx expo prebuild -p android
cd android && ./gradlew assembleRelease
# APK: android/app/build/outputs/apk/release/app-release.apk
```
Catatan: build release memakai keystore debug bawaan template Expo — cukup untuk pemakaian pribadi/sideload. Untuk Play Store, buat keystore sendiri dan gunakan profil `production` (AAB).

### Menjalankan untuk pengembangan
```bash
npm install && npx expo install --fix
npx expo run:android      # perangkat/emulator terhubung via USB/ADB
```

---

## 2. Fitur

| Area | Status |
|---|---|
| Dashboard: total saldo, pemasukan, pengeluaran, arus kas bersih + % perubahan vs periode yang sama bulan lalu | ✅ |
| Grafik pemasukan vs pengeluaran (mingguan/bulanan/tahunan), tooltip ketuk, periode tertinggi | ✅ |
| Donut pengeluaran per kategori, ketuk → daftar transaksinya | ✅ |
| Indikator kesehatan: tingkat tabungan, rasio pengeluaran, realisasi anggaran, hari bertransaksi, tren saldo, estimasi saldo akhir bulan (definisi bisa diketuk) | ✅ |
| Insight otomatis berbasis aturan (tanpa API berbayar), fakta vs **proyeksi** dibedakan, tanpa persentase palsu | ✅ |
| Transaksi: pemasukan/pengeluaran/transfer, kategori + subkategori, akun, tanggal & waktu, metode bayar, catatan, tag, foto struk | ✅ |
| Edit, hapus (konfirmasi), duplikat; cari kata kunci; filter periode/kategori/akun/jenis/nominal; urut terbaru/terlama/terbesar | ✅ |
| Multi-akun (tunai, bank, e-wallet, kartu kredit, tabungan, lainnya), saldo awal, aktif/nonaktif | ✅ |
| Transfer atomik, tidak dihitung pemasukan/pengeluaran; biaya transfer = pengeluaran terpisah | ✅ |
| Kartu kredit: saldo negatif (utang); belanja = pengeluaran; bayar tagihan = transfer (tanpa hitung ganda) | ✅ |
| Anggaran bulanan per kategori, progress, status aman / mendekati (≥80%) / melebihi (≥100%), salin dari bulan lalu | ✅ |
| Laporan: 8 pilihan periode + rentang khusus, arus kas, tren, per kategori/akun/metode, rata-rata harian & bulanan, kenaikan terbesar, transaksi terbesar, tren saldo | ✅ |
| Kalender transaksi dengan indikator masuk/keluar/transfer | ✅ |
| Transaksi berulang (harian/mingguan/bulanan/tahunan, interval, tanggal akhir), otomatis atau konfirmasi manual, anti-dobel, pengingat notifikasi lokal | ✅ |
| Ekspor CSV (rentang tanggal), laporan PDF, backup JSON, restore (ganti/gabung) dengan ringkasan & konfirmasi | ✅ |
| Impor CSV: pemetaan kolom otomatis+manual, validasi per baris, deteksi duplikasi, ringkasan sebelum impor | ✅ |
| PIN (hash SHA-256 bergaram berulang, kunci 30 detik setelah 5x salah) + biometrik; kunci ulang setelah 30 detik di latar belakang | ✅ |
| Profil, tema sistem/terang/gelap, format tanggal, kelola akun & kategori (arsip bila sudah dipakai) | ✅ |
| Data contoh (demo) bertanda khusus & bisa dihapus sekali ketuk; hapus seluruh data dengan konfirmasi berlapis (ketik HAPUS) | ✅ |

### Keterbatasan yang diketahui
- APK belum diuji langsung di perangkat Android fisik (lihat bagian Testing).
- Foto struk **tidak** ikut dalam backup JSON (hanya data). PIN sengaja tidak ikut backup.
- Tidak ada sinkronisasi antarperangkat; data hanya di HP ini. Pindah HP = backup → restore.
- Mata uang hanya IDR (sesuai brief). Transaksi bertanggal masa depan tidak diizinkan; gunakan transaksi berulang untuk jadwal.
- Jika lupa PIN, satu-satunya jalan adalah menghapus data aplikasi dari pengaturan Android (lalu restore dari backup).

---

## 3. Arsitektur

```
App.tsx                     bootstrap (migrasi DB, seed, transaksi berulang jatuh tempo), navigasi, kunci PIN
src/domain/                 logika murni tanpa UI/DB: uang, tanggal WIB, periode, analitik, insight, jadwal berulang
src/db/                     antarmuka Db, migrasi skema (PRAGMA user_version), Repo (semua SQL), adapter expo-sqlite
src/services/               dashboard/laporan, CSV, backup, PDF, notifikasi, keamanan PIN, data contoh, file
src/state/AppContext.tsx    repo, tema, pengaturan, `dataVersion` → semua layar memuat ulang setelah data berubah
src/ui/                     tema, komponen reusable, grafik SVG (bar, garis, donut)
src/screens/                layar-layar aplikasi
tests/                      test otomatis (SQLite Node) + smoke test browser
```

**Model data** (SQLite, uang = INTEGER rupiah):
`accounts`, `categories` (subkategori via `parent_id`), `transactions`, `budgets` (unik per bulan+kategori), `recurring_transactions`, `app_settings`.
- Saldo akun **tidak disimpan** — selalu dihitung: saldo awal + pemasukan − pengeluaran − transfer keluar + transfer masuk. Edit/hapus transaksi tidak mungkin meninggalkan saldo basi.
- Transfer = 1 baris `type='transfer'`; biaya transfer = baris `expense` terpisah yang tertaut (`linked_tx_id`) dan ikut terhapus.
- Transaksi berulang: indeks unik `(recurring_id, recurring_date)` + `next_date` dimajukan dalam transaksi SQL yang sama → tidak pernah tercatat dobel.
- Semua operasi multi-langkah memakai transaksi SQL (BEGIN/COMMIT/ROLLBACK).

**Rumus utama**
- Arus kas bersih = pemasukan − pengeluaran (transfer dikecualikan).
- Tingkat tabungan = (pemasukan − pengeluaran) ÷ pemasukan × 100%, hanya bila pemasukan > 0.
- % perubahan = (sekarang − sebelumnya) ÷ |sebelumnya|; bila sebelumnya 0 → "Belum ada pembanding".
- Periode yang masih berjalan dibandingkan dengan jumlah hari yang sama di periode sebelumnya (mis. 1–23 Okt vs 1–23 Sep).
- Estimasi saldo akhir bulan (proyeksi) = saldo sekarang − rata-rata pengeluaran harian × sisa hari ± transaksi berulang terjadwal; muncul setelah ≥7 hari & ≥3 pengeluaran.

---

## 4. Testing

```bash
npm test            # 20 test logika & database pada SQLite sungguhan (Node ≥ 22.5)
```

Hasil saat dibuat: **20/20 lulus**, mencakup skenario brief:

| # | Skenario | Hasil |
|---|---|---|
| 1 | Pemasukan menambah saldo | ✅ |
| 2 | Pengeluaran mengurangi saldo | ✅ |
| 3 | Transfer: total aset tetap; biaya transfer dihitung pengeluaran; transfer atomik (rollback bila gagal); kartu kredit tanpa hitung ganda | ✅ |
| 4 | Edit transaksi (nominal, akun, jenis, biaya transfer) → semua perhitungan ulang | ✅ |
| 5 | Hapus transaksi / transfer + biayanya → saldo & laporan pulih | ✅ |
| 6 | Filter tanggal, kategori (termasuk subkategori), akun, jenis, nominal, pencarian, urutan | ✅ |
| 7 | Anggaran diperbarui setelah edit/hapus; ambang 80%/100%; salin bulan lalu tanpa duplikasi | ✅ |
| 8 | Data tetap ada setelah database ditutup & dibuka ulang (file SQLite) | ✅ |
| 9 | Backup → restore (ganti & gabung) tanpa relasi yatim; ekspor CSV → impor dengan deteksi duplikasi | ✅ |
| 10 | Tanpa transaksi, nominal 0/negatif/desimal, tanggal/waktu tidak valid → tanpa NaN, tanpa % palsu | ✅ |
| 11 | Angka dashboard = hitung ulang mandiri dari baris database (tidak ada hardcode) | ✅ |
| 12 | Layout tidak terpotong di layar kecil | ⚠️ Diperiksa lewat pratinjau browser 360×740 & 390×844; belum di perangkat fisik |

Tambahan: zona waktu WIB, format Rupiah/tanggal, periode laporan, transaksi berulang (akhir bulan 31→28/29, tanggal berakhir, manual vs otomatis, anti-dobel), insight tanpa data cukup.

**Smoke test UI** (`node tests/preview/run.mjs <folder>`; butuh Playwright + esbuild): menjalankan layar-layar asli di Chromium dengan shim react-native dan database SQLite sungguhan, lalu mengklik alur nyata — isi data contoh, simpan pengeluaran lewat formulir, transfer (total aset tetap), tambah anggaran, backup, buat PIN (tersimpan sebagai hash), kunci & buka dengan PIN, tema gelap. Hasil: tanpa error runtime. Shim hanya untuk pengujian; tampilan di Android bisa sedikit berbeda (font, ikon, bayangan).

Type-check aplikasi: `npx tsc --noEmit` (setelah `npm install`).
