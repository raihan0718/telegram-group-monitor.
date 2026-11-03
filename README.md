# Telegram Group Monitor

Bot Telegram untuk mencatat aktivitas anggota grup, membuat leaderboard, dan menandai anggota yang belum memenuhi target pesan.

## Fitur awal
- Hitung pesan baru per anggota (pesan layanan/bot diabaikan).
- Perintah `/report`, `/top`, `/inactive`, `/candidates`, dan `/help`.
- Target minimum pesan dan periode laporan dapat diatur lewat environment.
- Tidak mengeluarkan anggota otomatis. Bot hanya membuat daftar kandidat; admin tetap memutuskan tindakan.
- Siapkan jalur impor data historis melalui format CSV yang didokumentasikan.

> Telegram Bot API tidak menyediakan riwayat lengkap grup sebelum bot ditambahkan. Untuk data lama, gunakan ekspor Telegram yang sah dan proses impor terpisah.

## Stack
- Supabase Edge Functions (Deno + TypeScript) sebagai webhook.
- Supabase Postgres untuk data anggota dan hitungan pesan.
- Telegram Bot API.

## Struktur
- `supabase/functions/group-monitor/`: webhook dan modul bot.
- `supabase/migrations/`: skema database.
- `docs/`: setup, perintah, dan format impor.

## Setup singkat
1. Jalankan migration SQL di Supabase.
2. Deploy Edge Function `group-monitor`.
3. Set secrets: `TELEGRAM_BOT_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_ADMIN_IDS`, `TARGET_GROUP_ID`, `MIN_MESSAGES`.
4. Tambahkan bot ke grup dan beri izin membaca pesan. Atur privacy mode di BotFather sesuai kebutuhan pencatatan.
5. Set webhook Telegram ke URL function dengan secret token.
6. Uji `/help` di grup.

Jangan pernah commit token atau service-role key ke GitHub.
