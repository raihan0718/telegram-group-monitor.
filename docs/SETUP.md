# Setup & deployment

1. Jalankan migration SQL di `supabase/migrations/20261103000100_initial_schema.sql` lewat Supabase SQL Editor.
2. Deploy Edge Function bernama `group-monitor`, entrypoint `supabase/functions/group-monitor/index.ts`.
3. Atur secrets di Supabase: `TELEGRAM_BOT_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_ADMIN_IDS` (ID admin, pisahkan koma), `TARGET_GROUP_ID` (opsional), `MIN_MESSAGES` (default 20), `INACTIVE_DAYS` (default 7), dan `WEBHOOK_SECRET`.
4. Tambahkan bot ke grup. Atur BotFather > /setprivacy > Disable agar bot menerima pesan biasa; bila perlu keluarkan lalu tambahkan ulang bot.
5. Set webhook Telegram ke URL function dengan header secret token melalui parameter `secret_token`. Jangan bagikan URL yang mengandung token.
6. Uji `/help` dan `/report` di grup.

Versi awal tidak melakukan kick/ban otomatis. Service role key dan token bot tidak boleh masuk ke GitHub.
