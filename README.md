# Telegram Group Monitor

Bot Telegram untuk mencatat aktivitas anggota grup, membuat leaderboard, dan menampilkan **Inactive Person** berdasarkan target pesan per grup.

## Fitur
- Menghitung pesan sejak bot bergabung; pesan sebelum bot masuk tidak tersedia dari Telegram.
- Menu tombol melalui `/start@UsernameBot`: Mulai Pembersihan, Settings, dan Help.
- Tombol menu mengedit pesan yang sama agar chat grup tetap rapi.
- Pengaturan per grup: minimal pesan (10/20/30/50/100), periode penilaian (3/7/14/30 hari), dan toleransi anggota baru (3/7/14/30 hari).
- Anggota baru mendapat masa toleransi sejak event bergabung diterima bot.
- Perintah `/report`, `/top`, `/inactive`, `/inactiveperson`, `/settings`, dan `/help`.
- Tidak mengeluarkan anggota otomatis. Bot hanya menampilkan daftar; admin tetap menentukan tindakan.
- Contact Person: **@Ipnexoraa**.

> Telegram Bot API tidak menyediakan riwayat lengkap grup sebelum bot ditambahkan. Anggota yang sudah tercatat sebelum fitur join tracking aktif memakai waktu pertama kali terlihat sebagai perkiraan tanggal bergabung.

## Stack
- Supabase Edge Functions (Deno + TypeScript) sebagai webhook.
- Supabase Postgres untuk data anggota, pesan, dan pengaturan.
- Telegram Bot API.

## Setup / deploy
1. Jalankan migration SQL di `supabase/migrations/` pada Supabase SQL Editor.
2. Deploy Edge Function `group-monitor`.
3. Set secrets: `TELEGRAM_BOT_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, dan konfigurasi owner broadcast bila dipakai.
4. Tambahkan bot ke grup dan beri izin membaca pesan. Atur privacy mode di BotFather sesuai kebutuhan pencatatan.
5. Pastikan webhook Telegram menerima update `message`, `my_chat_member`, dan `callback_query`. Contoh parameter `allowed_updates` saat memanggil `setWebhook`:
   `["message","my_chat_member","callback_query"]`.
6. Uji `/start@UsernameBot`, tombol Settings, dan `/help` di grup.

Webhook `allowed_updates` diatur melalui Telegram Bot API, bukan dari kode Edge Function. Jika webhook sudah aktif, perbarui konfigurasi webhook yang sama tanpa mengganti token atau URL function.

Jangan pernah commit token atau service-role key ke GitHub.
