# Historical data import

Telegram Bot API tidak menyediakan seluruh riwayat pesan sebelum bot bergabung. Admin grup dapat menggunakan fitur Export chat history Telegram Desktop jika memiliki akses yang sah.

Format importer yang direncanakan: chat_id, user_id, username (opsional), first_name, message_id, message_date (ISO 8601). Data wajib dideduplikasi berdasarkan chat_id + message_id. Importer CSV belum aktif pada versi awal ini.
