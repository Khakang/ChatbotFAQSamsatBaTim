# Implementasi Metode Pattern Matching pada Chatbot FAQ: Studi Kasus SAMSAT Bandung Timur

Proyek ini merupakan implementasi chatbot FAQ untuk **SAMSAT Bandung Timur** yang menjadi studi kasus dalam skripsi. Fokus utamanya adalah penerapan **metode pattern matching** untuk mencocokkan pertanyaan pengguna dengan dataset FAQ dan mengembalikan jawaban yang paling relevan.

Teknologi pendukung yang digunakan adalah **Cloudflare Workers** dan **Telegram webhook**.

Languages:

- [English Version](#english-version)
- [Versi Indonesia](#versi-indonesia)

---

## English Version

### Overview

This project is a Telegram chatbot for frequently asked questions about SAMSAT Bandung Timur. The research focus is the **pattern matching method**, not generative AI. The bot compares the user's question with an FAQ dataset and returns the most relevant answer.

The bot runs on Cloudflare Workers, so it does not need to run on your Mac after deployment. Telegram sends user messages to the deployed Worker URL through a webhook.

Current live Worker URL:

```text
https://samsat-bandung-timur-bot.uniframe.workers.dev
```

Webhook endpoint:

```text
https://samsat-bandung-timur-bot.uniframe.workers.dev/webhook
```

### Features

- Telegram command support: `/start`, `/help`, and `/clear`
- Inline category menu and FAQ buttons per category
- Free-text FAQ matching using pattern matching
- Text-only input handling
- FAQ dataset for SAMSAT Bandung Timur
- Satisfaction voting UI on each FAQ response
- Main menu is shown again after each FAQ answer

### Clear Command

The bot supports:

```text
/clear
```

This command deletes the conversation messages that have been tracked by the bot. It includes user messages, bot replies, media messages that were rejected by the bot, and the `/clear` command message itself when Telegram allows it. The bot sends a fresh main menu immediately, then runs the old-message cleanup in the background so the opening text and menu stay visible.

Message IDs are stored in Cloudflare KV through the `MESSAGE_STORE` binding, so tracking can survive Worker runtime restarts. The bot stores up to 10000 tracked message IDs per chat and deletes only those known IDs in Telegram batches. This is safer than deleting a guessed numeric range because it protects the fresh main menu from being removed.

Important limitation: Telegram bots can only delete messages by `message_id`, and deletion is still limited by Telegram Bot API rules. The bot cannot delete messages that were sent before tracking was enabled, messages whose IDs were never received by the bot, or messages Telegram refuses to delete.

### Research Data CSV

The bot stores basic Telegram profile data for research after the user sends:

```text
/start
```

After the bot gives an FAQ answer, users can vote whether the answer is `Memuaskan` or `Tidak memuaskan`. The bot calculates the satisfaction score from user votes:

```text
Memuaskan (%) = jumlah vote memuaskan / total vote * 100
Tidak memuaskan (%) = jumlah vote tidak memuaskan / total vote * 100
```

Each Telegram user has one active vote per FAQ. If the same user changes their choice, the old vote is corrected instead of counted twice.

Exported fields:

```text
telegram_id
username
first_name
last_name
language_code
started_at
last_seen_at
```

Export CSV through the protected endpoint:

```sh
curl "https://samsat-bandung-timur-bot.uniframe.workers.dev/research.csv" \
  -H "Authorization: Bearer $ADMIN_EXPORT_TOKEN"
```

For a readable terminal table, use:

```sh
curl "https://samsat-bandung-timur-bot.uniframe.workers.dev/research.txt" \
  -H "Authorization: Bearer $ADMIN_EXPORT_TOKEN"
```

For a browser-readable HTML table, download it first:

```sh
curl "https://samsat-bandung-timur-bot.uniframe.workers.dev/research.html" \
  -H "Authorization: Bearer $ADMIN_EXPORT_TOKEN" \
  -o research.html
open research.html
```

The research export endpoints require `ADMIN_EXPORT_TOKEN`. Do not share this token publicly.

Export FAQ satisfaction recap:

```sh
curl "https://samsat-bandung-timur-bot.uniframe.workers.dev/satisfaction.csv" \
  -H "Authorization: Bearer $ADMIN_EXPORT_TOKEN"
```

Readable versions are also available:

```text
/satisfaction.txt
/satisfaction.html
```

### Why It Can Run for Free

Telegram supports webhooks, so Telegram sends updates to a public HTTPS endpoint only when users interact with the bot.

Cloudflare Workers provides a free tier that is enough for a small FAQ chatbot. The project also does not use a paid database or a paid server. The FAQ data is bundled as a JSON file.

### Main Files

```text
src/index.ts
```

Main Worker entry point. It receives HTTP requests from Telegram, validates the webhook secret, processes messages or button callbacks, and sends replies through the Telegram Bot API.

```text
src/pattern-matcher.ts
```

Contains the pattern matching algorithm: normalization, stop-word removal, synonym expansion, custom patterns, scoring, and FAQ ranking.

```text
src/data/faq-samsat-bandung-timur.json
```

The FAQ dataset. It stores the FAQ rows separately from the algorithm so the data is not hardcoded inside the matching logic.

```text
src/faq-data.ts
```

Loads the JSON dataset and validates that every FAQ category is valid.

```text
src/replies.ts
```

Builds Telegram reply messages, category menus, FAQ buttons, and fallback messages.

```text
test/pattern-matcher.test.ts
```

Unit tests for the dataset and pattern matching behavior.

### Environment Variables

Production only needs two variables:

```env
BOT_TOKEN=your-telegram-botfather-token
WEBHOOK_SECRET=your-random-webhook-secret
ADMIN_EXPORT_TOKEN=your-random-csv-export-token
```

Explanation:

- `BOT_TOKEN`: token from BotFather. The Worker uses this to call Telegram API methods such as `sendMessage`.
- `WEBHOOK_SECRET`: secret used to verify incoming Telegram webhook requests.
- `ADMIN_EXPORT_TOKEN`: secret used to protect `/research.csv`, `/research.txt`, and `/research.html`.

Optional local testing variable:

```env
TELEGRAM_DRY_RUN=true
```

Do not use `TELEGRAM_DRY_RUN=true` in production because it prevents real Telegram replies from being sent.

### Where the Webhook URL Is Stored

The webhook URL is **not stored in `.env`** and is **not stored in the Worker code**.

The webhook URL is stored on **Telegram's server** after running `setWebhook`.

Example:

```sh
curl -X POST "https://api.telegram.org/bot$BOT_TOKEN/setWebhook" \
  -d "url=$WORKER_URL/webhook" \
  -d "secret_token=$WEBHOOK_SECRET"
```

After this command succeeds, Telegram remembers that user messages for this bot must be sent to:

```text
$WORKER_URL/webhook
```

Check the currently registered webhook:

```sh
set -a
source .env
set +a

curl "https://api.telegram.org/bot$BOT_TOKEN/getWebhookInfo"
```

If the Worker URL changes, the webhook must be set again.

### Pattern Matching Method

The chatbot is intentionally rule-based and used as the main implementation object in the thesis.

For academic writing, the core method should be described as **Pattern Matching**, not Regex. This implementation uses pattern matching through exact phrase comparison, partial phrase comparison, token overlap, synonym expansion, custom patterns, and scoring.

Regex appears only as a small preprocessing tool inside the `normalize()` function. It is used to clean punctuation, remove non-alphanumeric characters, and normalize spacing before matching. Regex is **not** the main FAQ matching method.

Safe wording for the thesis:

```text
The chatbot applies a rule-based pattern matching method. User input is normalized, tokenized, expanded with simple synonym rules, and compared against FAQ patterns. Regex is only used during text preprocessing, while answer selection is performed using pattern matching and scoring.
```

Matching flow:

1. Normalize user input into lowercase alphanumeric text.
2. Remove common stop words.
3. Expand simple synonyms, such as `alamat/lokasi`, `jam/jadwal/operasional`, and `bayar/pembayaran`.
4. Compare user input against FAQ questions, categories, and custom patterns.
5. Score each FAQ candidate.
6. Sort candidates by score.
7. Return the best FAQ if the score passes the minimum threshold.
8. Use the score internally to decide whether the FAQ answer is relevant enough.

The pattern matching score is an **internal relevance score**, not a statistical machine-learning accuracy value. The score is calculated from exact/partial phrase matching, custom pattern matching, important token overlap, FAQ token coverage, known-query token coverage, synonym expansion, and a small domain-anchor bonus for SAMSAT-related terms. Regex only contributes during preprocessing through `normalize()`; it cleans text before scoring but is not the main scoring method.

User-facing satisfaction score:

- `Memuaskan (%)`: percentage of users who voted that the answer was satisfying.
- `Tidak memuaskan (%)`: percentage of users who voted that the answer was not satisfying.

Example:

```text
User input:
syarat bayar pajak kendaraan
```

The matcher normalizes and tokenizes the input, then compares it with all 100 FAQ entries. The FAQ question `Syarat bayar pajak` gets a high score because it shares the important terms `syarat`, `bayar`, and `pajak`.

Bot response:

```text
Pertanyaan: Syarat bayar pajak

STNK dan KTP

Sumber: Referensi

Penilaian pengguna:
Belum ada suara.
Silakan nilai apakah jawaban ini memuaskan.
```

### Setup on a New Device or New Account

Use this section if you move the project to a new laptop, a new Cloudflare account, or a new Telegram bot.

1. Install the required tools:

   - Node.js
   - npm
   - Git, if using a Git repository
   - Telegram account
   - Cloudflare account

2. Check Node and npm:

   ```sh
   node --version
   npm --version
   ```

3. Clone the project:

   ```sh
   git clone https://github.com/0x94t3z/tebot.git
   cd tebot
   ```

4. Install dependencies:

   ```sh
   npm install
   ```

5. Create or retrieve a Telegram bot token:

   - Open Telegram.
   - Search for `@BotFather`.
   - Use `/newbot` for a new bot, or retrieve the token for an existing bot.
   - Save the token securely.

6. Generate a webhook secret:

   ```sh
   openssl rand -hex 32
   ```

7. Create `.env`:

   ```sh
   cp .dev.vars.example .env
   ```

8. Fill `.env`:

   ```env
   BOT_TOKEN=your-botfather-token
   WEBHOOK_SECRET=your-random-webhook-secret
   ADMIN_EXPORT_TOKEN=your-random-export-token
   ```

9. Log in to Cloudflare:

   ```sh
   npx wrangler login
   ```

10. If switching Cloudflare accounts:

   ```sh
   npx wrangler logout
   npx wrangler login
   ```

11. Check the Worker config:

   ```text
   wrangler.jsonc
   ```

   Important fields:

   ```jsonc
   {
     "name": "samsat-bandung-timur-bot",
     "main": "src/index.ts",
     "compatibility_date": "2026-06-21",
     "kv_namespaces": [
       {
         "binding": "MESSAGE_STORE",
         "id": "..."
       },
       {
         "binding": "RESEARCH_STORE",
         "id": "..."
       }
     ]
   }
   ```

   If you want a new Worker URL in the same Cloudflare account, change the `name` field before deploying:

   ```jsonc
   {
     "name": "samsat-bandung-timur-bot-v2"
   }
   ```

   If you keep the same `name` in the same Cloudflare account, Wrangler deploys to the same Worker route. If you use a different Cloudflare account, the same Worker name can still produce a different `workers.dev` URL because it belongs to that account.

   `MESSAGE_STORE` is used by `/clear` to store tracked Telegram `message_id` values. If you move to a different Cloudflare account, create a new KV namespace:

   ```sh
   npx wrangler kv namespace create MESSAGE_STORE
   ```

   Then replace the `id` in `wrangler.jsonc` with the new namespace ID.

   `RESEARCH_STORE` is used by `/start` and `/research.csv` to store/export research profile records. If you move to a different Cloudflare account, create another KV namespace:

   ```sh
   npx wrangler kv namespace create RESEARCH_STORE
   ```

   Then replace the `RESEARCH_STORE` `id` in `wrangler.jsonc`.

12. Run checks:

   ```sh
   npm run typecheck
   npm test
   npx wrangler deploy --dry-run
   ```

13. Deploy:

   ```sh
   npx wrangler deploy --secrets-file .env
   ```

14. Copy the deployed Worker URL from the Wrangler output.

15. Set Telegram webhook:

   ```sh
   set -a
   source .env
   set +a

   export WORKER_URL="https://your-worker-url.workers.dev"

   curl -X POST "https://api.telegram.org/bot$BOT_TOKEN/setWebhook" \
     -d "url=$WORKER_URL/webhook" \
     -d "secret_token=$WEBHOOK_SECRET"
   ```

   This replaces the active webhook for that Telegram bot. Telegram will send future bot updates to the new Worker URL.

   Check the active webhook:

   ```sh
   curl "https://api.telegram.org/bot$BOT_TOKEN/getWebhookInfo"
   ```

16. Test the bot in Telegram:

   ```text
   /start
   syarat bayar pajak kendaraan
   stnk hilang
   alamat samsat bandung timur
   apa itu pattern matching
   ```

### Deployment

Login:

```sh
npx wrangler login
```

Deploy:

```sh
npx wrangler deploy --secrets-file .env
```

Set webhook:

```sh
set -a
source .env
set +a

export WORKER_URL="https://samsat-bandung-timur-bot.uniframe.workers.dev"

curl -X POST "https://api.telegram.org/bot$BOT_TOKEN/setWebhook" \
  -d "url=$WORKER_URL/webhook" \
  -d "secret_token=$WEBHOOK_SECRET"
```

Check webhook:

```sh
curl "https://api.telegram.org/bot$BOT_TOKEN/getWebhookInfo"
```

### Updating FAQ Data

Edit:

```text
src/data/faq-samsat-bandung-timur.json
```

Then run:

```sh
npm run typecheck
npm test
npx wrangler deploy --secrets-file .env
```

### Troubleshooting

Check Worker health:

```sh
curl https://samsat-bandung-timur-bot.uniframe.workers.dev/health
```

Check bot identity:

```sh
set -a
source .env
set +a

curl "https://api.telegram.org/bot$BOT_TOKEN/getMe"
```

Check webhook:

```sh
curl "https://api.telegram.org/bot$BOT_TOKEN/getWebhookInfo"
```

Watch live Worker logs:

```sh
npx wrangler tail samsat-bandung-timur-bot --format pretty
```

If the log shows `POST /webhook - Ok`, Telegram successfully reached the Worker.

### Files That Are Safe or Secret

Safe to share:

```text
src/
test/
README.md
package.json
package-lock.json
tsconfig.json
wrangler.jsonc
.dev.vars.example
```

Do not share:

```text
.env
.dev.vars
.env.test-local
```

These files may contain `BOT_TOKEN` and `WEBHOOK_SECRET`.

### Short Answers for Presentation

**What method is used?**

The chatbot uses rule-based pattern matching with text normalization, stop-word removal, synonym expansion, custom phrase patterns, and scoring.

**Does the chatbot use AI?**

No. It does not use generative AI. It matches user questions with an FAQ dataset.

**Why is the dataset stored as JSON?**

To separate data from algorithm logic. This makes the implementation cleaner and easier to update.

**How does the bot choose an answer?**

It scores all FAQ entries and selects the highest-scoring entry if it passes the minimum threshold.

**Where is the webhook URL stored?**

It is stored on Telegram's server after running `setWebhook`, not in `.env`.

**Why use Cloudflare Workers?**

It provides a public HTTPS endpoint, works well with Telegram webhooks, has a free tier, and does not require a server running on your Mac.

---

## Versi Indonesia

### Gambaran Umum

Project ini adalah chatbot Telegram untuk menjawab pertanyaan FAQ seputar SAMSAT Bandung Timur. Chatbot ini memakai **metode pattern matching berbasis aturan**, bukan AI generatif. Sistem mencocokkan pertanyaan user dengan dataset FAQ, lalu mengirim jawaban yang paling sesuai.

Bot berjalan di Cloudflare Workers, jadi setelah deploy bot tidak berjalan di Mac. Telegram mengirim pesan user ke URL Worker melalui webhook.

URL Worker saat ini:

```text
https://samsat-bandung-timur-bot.uniframe.workers.dev
```

Endpoint webhook:

```text
https://samsat-bandung-timur-bot.uniframe.workers.dev/webhook
```

### Fitur

- Command Telegram: `/start`, `/help`, dan `/clear`
- Menu kategori dengan inline button
- Tombol FAQ per kategori, dibatasi 7 pertanyaan per halaman
- Navigasi berikutnya/sebelumnya untuk kategori yang memiliki lebih dari 7 pertanyaan
- Navigasi tombol memperbarui pesan menu yang sama, bukan mengirim chat baru
- Pencarian pertanyaan bebas dengan pattern matching
- Input hanya teks; media seperti foto, video, sticker, voice note, dan file ditolak dengan pesan instruksi singkat
- 100 data FAQ dari dataset SAMSAT Bandung Timur
- Menu utama ditampilkan kembali setelah setiap jawaban FAQ
- UI voting kepuasan pada setiap jawaban FAQ
- 9 kategori FAQ:
  - Layanan
  - Pajak
  - Dokumen
  - Balik Nama
  - Mutasi
  - Layanan Tambahan
  - Sistem
  - Perkembangan
  - Umum
- Validasi webhook secret dengan `X-Telegram-Bot-Api-Secret-Token`
- Mode dry-run lokal untuk testing webhook tanpa mengirim pesan Telegram sungguhan
- Pencatatan profil riset otomatis setelah `/start`
- Export CSV terproteksi untuk data profil Telegram dan rekap kepuasan FAQ

### Command Clear

Bot mendukung:

```text
/clear
```

Command ini menghapus pesan percakapan yang sudah dilacak oleh bot. Ini mencakup pesan user, balasan bot, pesan media yang ditolak oleh bot, dan pesan `/clear` itu sendiri jika Telegram mengizinkan. Bot langsung mengirim menu utama baru, lalu membersihkan pesan lama di background agar kata pembuka dan menu tetap terlihat.

Message ID disimpan di Cloudflare KV melalui binding `MESSAGE_STORE`, sehingga data pelacakan tetap tersedia meskipun runtime Worker restart. Bot menyimpan sampai 10000 message ID yang terlacak per chat dan hanya menghapus ID yang memang diketahui oleh bot secara batch di Telegram. Cara ini lebih aman daripada menghapus berdasarkan tebakan rentang angka karena menu utama baru tidak ikut terhapus.

Batasan penting: bot Telegram hanya bisa menghapus pesan berdasarkan `message_id`, dan penghapusan tetap mengikuti aturan Telegram Bot API. Bot tidak bisa menghapus pesan yang dikirim sebelum tracking aktif, pesan yang ID-nya tidak pernah diterima bot, atau pesan yang ditolak oleh Telegram.

### CSV Data Riset

Bot menyimpan data profil Telegram dasar untuk kebutuhan riset setelah user mengirim:

```text
/start
```

Setelah bot memberikan jawaban FAQ, user dapat memilih apakah jawaban tersebut `Memuaskan` atau `Tidak memuaskan`. Bot menghitung skor kepuasan dari voting user:

```text
Memuaskan (%) = jumlah vote memuaskan / total vote * 100
Tidak memuaskan (%) = jumlah vote tidak memuaskan / total vote * 100
```

Setiap user Telegram memiliki satu vote aktif per FAQ. Jika user yang sama mengganti pilihan, vote lama dikoreksi dan tidak dihitung dobel.

Field export:

```text
telegram_id
username
first_name
last_name
language_code
started_at
last_seen_at
```

Export rekap kepuasan FAQ:

```sh
curl "https://samsat-bandung-timur-bot.uniframe.workers.dev/satisfaction.csv" \
  -H "Authorization: Bearer $ADMIN_EXPORT_TOKEN"
```

Versi yang mudah dibaca juga tersedia:

```text
/satisfaction.txt
/satisfaction.html
```

Export CSV melalui endpoint terproteksi:

```sh
curl "https://samsat-bandung-timur-bot.uniframe.workers.dev/research.csv" \
  -H "Authorization: Bearer $ADMIN_EXPORT_TOKEN"
```

Untuk tabel yang lebih mudah dibaca di terminal, gunakan:

```sh
curl "https://samsat-bandung-timur-bot.uniframe.workers.dev/research.txt" \
  -H "Authorization: Bearer $ADMIN_EXPORT_TOKEN"
```

Untuk tabel HTML yang bisa dibuka di browser, download dulu filenya:

```sh
curl "https://samsat-bandung-timur-bot.uniframe.workers.dev/research.html" \
  -H "Authorization: Bearer $ADMIN_EXPORT_TOKEN" \
  -o research.html
open research.html
```

Endpoint export data riset membutuhkan `ADMIN_EXPORT_TOKEN`. Jangan membagikan token ini ke publik.

### Kenapa Bisa Berjalan Gratis

Telegram mendukung webhook, jadi Telegram hanya mengirim update ke endpoint HTTPS publik saat user berinteraksi dengan bot.

Cloudflare Workers memiliki free tier yang cukup untuk chatbot FAQ skala kecil. Project ini juga tidak memakai database berbayar atau server berbayar. Data FAQ dibundel sebagai file JSON.

### File Utama

```text
src/index.ts
```

File utama Cloudflare Worker. File ini menerima request dari Telegram, memvalidasi webhook secret, memproses pesan atau tombol, dan mengirim balasan melalui Telegram Bot API.

```text
src/pattern-matcher.ts
```

Berisi algoritma pattern matching: normalisasi teks, penghapusan stop word, perluasan sinonim, custom pattern, scoring, dan pemeringkatan FAQ.

```text
src/data/faq-samsat-bandung-timur.json
```

Dataset FAQ. Data disimpan terpisah dari algoritma agar tidak hardcoded di logic pencocokan.

```text
src/faq-data.ts
```

Memuat dataset JSON dan memvalidasi bahwa setiap kategori FAQ valid.

```text
src/replies.ts
```

Membentuk pesan balasan Telegram, menu kategori, tombol FAQ, dan pesan fallback.

```text
test/pattern-matcher.test.ts
```

Unit test untuk dataset dan perilaku pattern matching.

### Environment Variables

Production hanya membutuhkan dua variabel:

```env
BOT_TOKEN=token-dari-botfather
WEBHOOK_SECRET=secret-random
ADMIN_EXPORT_TOKEN=token-random-export-csv
```

Penjelasan:

- `BOT_TOKEN`: token dari BotFather. Worker memakai token ini untuk memanggil Telegram API seperti `sendMessage`.
- `WEBHOOK_SECRET`: secret untuk memverifikasi request webhook yang masuk dari Telegram.
- `ADMIN_EXPORT_TOKEN`: secret untuk melindungi endpoint `/research.csv`, `/research.txt`, dan `/research.html`.

Variabel opsional untuk testing lokal:

```env
TELEGRAM_DRY_RUN=true
```

Jangan gunakan `TELEGRAM_DRY_RUN=true` di production karena bot tidak akan benar-benar mengirim balasan Telegram.

### Di Mana URL Webhook Disimpan?

URL webhook **tidak disimpan di `.env`** dan **tidak disimpan di kode Worker**.

URL webhook disimpan di **server Telegram** setelah menjalankan `setWebhook`.

Contoh:

```sh
curl -X POST "https://api.telegram.org/bot$BOT_TOKEN/setWebhook" \
  -d "url=$WORKER_URL/webhook" \
  -d "secret_token=$WEBHOOK_SECRET"
```

Setelah command berhasil, Telegram menyimpan bahwa pesan user untuk bot ini harus dikirim ke:

```text
$WORKER_URL/webhook
```

Cek webhook yang sedang aktif:

```sh
set -a
source .env
set +a

curl "https://api.telegram.org/bot$BOT_TOKEN/getWebhookInfo"
```

Jika URL Worker berubah, webhook harus diset ulang.

### Metode Pattern Matching

Chatbot ini sengaja dibuat rule-based.

Untuk penulisan Tugas Akhir, metode utama sebaiknya disebut **Pattern Matching**, bukan Regex. Implementasi ini memakai pattern matching melalui pencocokan frasa persis, pencocokan frasa sebagian, overlap token, perluasan sinonim, custom pattern, dan scoring.

Regex hanya muncul sebagai alat bantu kecil di fungsi `normalize()`. Regex dipakai untuk membersihkan tanda baca, menghapus karakter non-alfanumerik, dan merapikan spasi sebelum proses pencocokan. Regex **bukan** metode utama pencocokan FAQ.

Kalimat aman untuk Tugas Akhir:

```text
Chatbot menerapkan metode pattern matching berbasis aturan. Input pengguna dinormalisasi, ditokenisasi, diperluas dengan aturan sinonim sederhana, lalu dibandingkan dengan pola FAQ. Regex hanya digunakan pada tahap preprocessing teks, sedangkan pemilihan jawaban dilakukan menggunakan pattern matching dan scoring.
```

Alur pencocokan:

1. Input user dinormalisasi menjadi teks lowercase alphanumeric.
2. Stop word umum dihapus.
3. Sinonim sederhana diperluas, seperti `alamat/lokasi`, `jam/jadwal/operasional`, dan `bayar/pembayaran`.
4. Input user dibandingkan dengan pertanyaan FAQ, kategori, dan custom pattern.
5. Setiap kandidat FAQ diberi skor.
6. Kandidat diurutkan berdasarkan skor.
7. FAQ terbaik dikembalikan jika skornya melewati batas minimum.
8. Skor dipakai secara internal untuk menentukan apakah jawaban FAQ cukup relevan.

Skor pattern matching adalah **skor relevansi internal**, bukan nilai akurasi statistik seperti pada evaluasi machine learning. Skor dihitung dari kecocokan frasa persis/sebagian, custom pattern, overlap kata penting, cakupan token FAQ, cakupan token input yang dikenal dataset, perluasan sinonim, dan bonus kecil untuk istilah domain SAMSAT. Regex hanya berperan pada tahap preprocessing melalui fungsi `normalize()`; regex membersihkan teks sebelum scoring, tetapi bukan metode utama penilaian.

Skor kepuasan yang terlihat oleh user:

- `Memuaskan (%)`: persentase user yang menilai jawaban memuaskan.
- `Tidak memuaskan (%)`: persentase user yang menilai jawaban tidak memuaskan.

Contoh:

```text
Input user:
syarat bayar pajak kendaraan
```

Matcher menormalisasi dan memecah input menjadi token, lalu membandingkannya dengan 100 FAQ. Pertanyaan FAQ `Syarat bayar pajak` mendapat skor tinggi karena memiliki kata penting yang sama: `syarat`, `bayar`, dan `pajak`.

Balasan bot:

```text
Pertanyaan: Syarat bayar pajak

STNK dan KTP

Sumber: Referensi

Penilaian pengguna:
Belum ada suara.
Silakan nilai apakah jawaban ini memuaskan.
```

### Setup di Device Baru atau Account Baru

Gunakan bagian ini jika project dipindahkan ke laptop baru, Cloudflare account baru, atau Telegram bot baru.

1. Install aplikasi yang dibutuhkan:

   - Node.js
   - npm
   - Git, jika memakai repository Git
   - Telegram account
   - Cloudflare account

2. Cek Node dan npm:

   ```sh
   node --version
   npm --version
   ```

3. Clone project:

   ```sh
   git clone https://github.com/0x94t3z/tebot.git
   cd tebot
   ```

4. Install dependency:

   ```sh
   npm install
   ```

5. Buat atau ambil token bot Telegram:

   - Buka Telegram.
   - Cari `@BotFather`.
   - Gunakan `/newbot` untuk bot baru, atau ambil token bot lama.
   - Simpan token secara aman.

6. Generate webhook secret:

   ```sh
   openssl rand -hex 32
   ```

7. Buat `.env`:

   ```sh
   cp .dev.vars.example .env
   ```

8. Isi `.env`:

   ```env
   BOT_TOKEN=token-dari-botfather
   WEBHOOK_SECRET=secret-random
   ADMIN_EXPORT_TOKEN=token-random-export
   ```

9. Login ke Cloudflare:

   ```sh
   npx wrangler login
   ```

10. Jika pindah Cloudflare account:

   ```sh
   npx wrangler logout
   npx wrangler login
   ```

11. Cek konfigurasi Worker:

   ```text
   wrangler.jsonc
   ```

   Bagian penting:

   ```jsonc
   {
     "name": "samsat-bandung-timur-bot",
     "main": "src/index.ts",
     "compatibility_date": "2026-06-21",
     "kv_namespaces": [
       {
         "binding": "MESSAGE_STORE",
         "id": "..."
       },
       {
         "binding": "RESEARCH_STORE",
         "id": "..."
       }
     ]
   }
   ```

   Jika ingin URL Worker baru di Cloudflare account yang sama, ubah field `name` sebelum deploy:

   ```jsonc
   {
     "name": "samsat-bandung-timur-bot-v2"
   }
   ```

   Jika `name` tetap sama di Cloudflare account yang sama, Wrangler akan deploy ke Worker route yang sama. Jika memakai Cloudflare account berbeda, nama Worker yang sama tetap bisa menghasilkan URL `workers.dev` berbeda karena URL tersebut milik account itu.

   `MESSAGE_STORE` dipakai oleh `/clear` untuk menyimpan `message_id` Telegram yang sudah dilacak. Jika pindah ke Cloudflare account lain, buat KV namespace baru:

   ```sh
   npx wrangler kv namespace create MESSAGE_STORE
   ```

   Lalu ganti `id` di `wrangler.jsonc` dengan namespace ID yang baru.

   `RESEARCH_STORE` dipakai oleh `/start` dan `/research.csv` untuk menyimpan/export data profil riset. Jika pindah ke Cloudflare account lain, buat KV namespace lain:

   ```sh
   npx wrangler kv namespace create RESEARCH_STORE
   ```

   Lalu ganti `id` `RESEARCH_STORE` di `wrangler.jsonc`.

12. Jalankan pengecekan:

   ```sh
   npm run typecheck
   npm test
   npx wrangler deploy --dry-run
   ```

13. Deploy:

   ```sh
   npx wrangler deploy --secrets-file .env
   ```

14. Copy URL Worker dari output Wrangler.

15. Set webhook Telegram:

   ```sh
   set -a
   source .env
   set +a

   export WORKER_URL="https://your-worker-url.workers.dev"

   curl -X POST "https://api.telegram.org/bot$BOT_TOKEN/setWebhook" \
     -d "url=$WORKER_URL/webhook" \
     -d "secret_token=$WEBHOOK_SECRET"
   ```

   Ini mengganti webhook aktif untuk bot Telegram tersebut. Setelah itu Telegram akan mengirim update bot ke URL Worker yang baru.

   Cek webhook aktif:

   ```sh
   curl "https://api.telegram.org/bot$BOT_TOKEN/getWebhookInfo"
   ```

16. Test bot di Telegram:

   ```text
   /start
   syarat bayar pajak kendaraan
   stnk hilang
   alamat samsat bandung timur
   apa itu pattern matching
   ```

### Deployment

Login:

```sh
npx wrangler login
```

Deploy:

```sh
npx wrangler deploy --secrets-file .env
```

Set webhook:

```sh
set -a
source .env
set +a

export WORKER_URL="https://samsat-bandung-timur-bot.uniframe.workers.dev"

curl -X POST "https://api.telegram.org/bot$BOT_TOKEN/setWebhook" \
  -d "url=$WORKER_URL/webhook" \
  -d "secret_token=$WEBHOOK_SECRET"
```

Cek webhook:

```sh
curl "https://api.telegram.org/bot$BOT_TOKEN/getWebhookInfo"
```

### Update Data FAQ

Edit:

```text
src/data/faq-samsat-bandung-timur.json
```

Lalu jalankan:

```sh
npm run typecheck
npm test
npx wrangler deploy --secrets-file .env
```

### Troubleshooting

Cek health Worker:

```sh
curl https://samsat-bandung-timur-bot.uniframe.workers.dev/health
```

Cek identitas bot:

```sh
set -a
source .env
set +a

curl "https://api.telegram.org/bot$BOT_TOKEN/getMe"
```

Cek webhook:

```sh
curl "https://api.telegram.org/bot$BOT_TOKEN/getWebhookInfo"
```

Lihat live log Worker:

```sh
npx wrangler tail samsat-bandung-timur-bot --format pretty
```

Jika log menunjukkan `POST /webhook - Ok`, berarti Telegram berhasil mengirim update ke Worker.

### File Aman dan File Rahasia

Aman dibagikan:

```text
src/
test/
README.md
package.json
package-lock.json
tsconfig.json
wrangler.jsonc
.dev.vars.example
```

Jangan dibagikan:

```text
.env
.dev.vars
.env.test-local
```

File tersebut dapat berisi `BOT_TOKEN` dan `WEBHOOK_SECRET`.

### Jawaban Singkat untuk Presentasi

**Metode apa yang digunakan?**

Chatbot menggunakan pattern matching berbasis aturan dengan normalisasi teks, penghapusan stop word, perluasan sinonim, custom pattern, dan scoring.

**Apakah chatbot memakai AI?**

Tidak. Chatbot tidak memakai AI generatif. Chatbot mencocokkan pertanyaan user dengan dataset FAQ.

**Kenapa dataset disimpan sebagai JSON?**

Supaya data terpisah dari logika algoritma. Ini membuat implementasi lebih rapi dan mudah diperbarui.

**Bagaimana bot memilih jawaban?**

Bot memberi skor ke semua FAQ dan memilih FAQ dengan skor tertinggi jika melewati batas minimum.

**Di mana URL webhook disimpan?**

URL webhook disimpan di server Telegram setelah menjalankan `setWebhook`, bukan di `.env`.

**Kenapa memakai Cloudflare Workers?**

Cloudflare Workers menyediakan endpoint HTTPS publik, cocok untuk Telegram webhook, memiliki free tier, dan tidak perlu server berjalan di Mac.
