import { faqCategories, faqEntries, type FaqCategory, type FaqEntry } from "./faq-data";
import { getEntriesByCategory, type PatternMatchResult } from "./pattern-matcher";

const questionsPerPage = 7;

const categoryIcons: Record<FaqCategory, string> = {
  Layanan: "🏢",
  Pajak: "💰",
  Dokumen: "📄",
  "Balik Nama": "🔁",
  Mutasi: "🚚",
  "Cek Fisik": "🔎",
  SIGNAL: "📱",
  "Samsat Keliling": "🚐",
  Fasilitas: "🪑",
  Pengaduan: "📣"
};

// Menu utama yang ditampilkan sebagai inline keyboard Telegram.
export const mainMenu = {
  inline_keyboard: [
    [
      { text: categoryLabel("Layanan"), callback_data: "cat:Layanan" },
      { text: categoryLabel("Pajak"), callback_data: "cat:Pajak" }
    ],
    [
      { text: categoryLabel("Dokumen"), callback_data: "cat:Dokumen" },
      { text: categoryLabel("Balik Nama"), callback_data: "cat:Balik Nama" }
    ],
    [
      { text: categoryLabel("Mutasi"), callback_data: "cat:Mutasi" },
      { text: categoryLabel("Cek Fisik"), callback_data: "cat:Cek Fisik" }
    ],
    [
      { text: categoryLabel("SIGNAL"), callback_data: "cat:SIGNAL" },
      { text: categoryLabel("Samsat Keliling"), callback_data: "cat:Samsat Keliling" }
    ],
    [
      { text: categoryLabel("Fasilitas"), callback_data: "cat:Fasilitas" },
      { text: categoryLabel("Pengaduan"), callback_data: "cat:Pengaduan" }
    ]
  ]
};

// Tombol rating setelah user menerima jawaban FAQ.
export function buildRatingKeyboard(faqId: number) {
  return {
    inline_keyboard: [[
      { text: "⭐ 1", callback_data: `rate:${faqId}:1` },
      { text: "⭐ 2", callback_data: `rate:${faqId}:2` },
      { text: "⭐ 3", callback_data: `rate:${faqId}:3` },
      { text: "⭐ 4", callback_data: `rate:${faqId}:4` },
      { text: "⭐ 5", callback_data: `rate:${faqId}:5` }
    ]]
  };
}

// Membuat pesan pembuka saat user mengirim /start atau /help.
export function buildStartMessage() {
  return withCommandHint([
    "Chatbot FAQ SAMSAT Bandung Timur",
    "",
    "Ketik pertanyaan seperti:",
    "- jam operasional samsat",
    "- syarat bayar pajak",
    "- stnk hilang",
    "- cek fisik kendaraan",
    "",
    "Ketik /clear untuk membersihkan pesan yang dapat dihapus oleh bot.",
    "Profil Telegram dasar dicatat untuk kebutuhan riset saat Anda menggunakan /start.",
    "",
    `Dataset aktif: ${faqEntries.length} FAQ dalam ${faqCategories.length} kategori.`
  ].join("\n"));
}

// Membuat daftar pertanyaan berdasarkan kategori dan halaman yang dipilih user.
export function buildCategoryMessage(category: FaqCategory, page = 0) {
  const entries = getCategoryPageEntries(category, page);
  const totalPages = getCategoryTotalPages(category);
  const questions = entries.map((entry) => `- ${entry.question}`).join("\n");

  return withCommandHint([
    `Kategori: ${categoryLabel(category)}`,
    `Halaman: ${page + 1}/${totalPages}`,
    "",
    questions,
    "",
    "Pilih pertanyaan dengan tombol, atau ketik pertanyaan bebas untuk dicocokkan dengan metode pattern matching."
  ].join("\n"));
}

// Membuat tombol untuk setiap pertanyaan dalam satu kategori dan halaman.
export function buildQuestionKeyboard(category: FaqCategory, page = 0) {
  const totalPages = getCategoryTotalPages(category);
  const questionButtons = getCategoryPageEntries(category, page).map((entry) => [
    { text: truncateButtonText(entry.question), callback_data: `faq:${entry.id}` }
  ]);
  const navigationButtons = buildPaginationButtons(category, page, totalPages);

  return {
    inline_keyboard: [
      ...questionButtons,
      ...(navigationButtons.length > 0 ? [navigationButtons] : []),
      [{ text: "↩️ Kembali ke kategori", callback_data: "menu" }]
    ]
  };
}

// Membuat pesan jawaban dari hasil pattern matching.
export function buildFaqMessage(result: PatternMatchResult) {
  const { entry } = result;

  return [
    `Pertanyaan: ${entry.question}`,
    "",
    entry.answer,
    "",
    `Sumber: ${entry.source}`,
    "",
    "Silakan beri rating untuk jawaban ini:"
  ].join("\n");
}

// Membuat pesan jawaban saat user memilih FAQ langsung dari tombol.
export function buildDirectFaqMessage(entry: FaqEntry) {
  return [
    `Pertanyaan: ${entry.question}`,
    "",
    entry.answer,
    "",
    `Sumber: ${entry.source}`,
    "",
    "Silakan beri rating untuk jawaban ini:"
  ].join("\n");
}

// Pesan fallback jika pertanyaan user tidak cocok dengan data FAQ.
export function buildUnknownMessage() {
  return withCommandHint([
    "Maaf, pertanyaan belum cocok dengan pola FAQ yang tersedia.",
    "",
    "Coba gunakan kata kunci yang lebih dekat dengan data FAQ, misalnya:",
    "- pajak",
    "- stnk",
    "- balik nama",
    "- mutasi",
    "- samsat keliling",
    "- chatbot",
    "",
    "Atau pilih kategori di bawah."
  ].join("\n"));
}

// Pesan jika user mengirim media atau pesan selain teks.
export function buildUnsupportedMessage() {
  return withCommandHint([
    "Bot hanya mendukung pesan teks.",
    "",
    "Silakan ketik pertanyaan seputar SAMSAT Bandung Timur, misalnya:",
    "- jam operasional samsat",
    "- syarat bayar pajak",
    "- stnk hilang"
  ].join("\n"));
}

// Membatasi panjang teks tombol agar tetap rapi di Telegram.
function truncateButtonText(value: string) {
  return value.length > 55 ? `${value.slice(0, 52)}...` : value;
}

// Menambahkan panduan command singkat pada setiap balasan bot.
function withCommandHint(message: string) {
  return [
    message,
    "",
    "/start - tampilkan menu utama",
    "/clear - bersihkan chat"
  ].join("\n");
}

// Membuat label kategori dengan icon agar menu Telegram lebih mudah dipindai.
function categoryLabel(category: FaqCategory) {
  return `${categoryIcons[category]} ${category}`;
}

// Mengambil data FAQ sesuai halaman kategori.
function getCategoryPageEntries(category: FaqCategory, page: number) {
  const entries = getEntriesByCategory(category);
  const safePage = clampPage(page, getCategoryTotalPages(category));
  const start = safePage * questionsPerPage;

  return entries.slice(start, start + questionsPerPage);
}

// Menghitung jumlah halaman dalam satu kategori.
function getCategoryTotalPages(category: FaqCategory) {
  return Math.max(1, Math.ceil(getEntriesByCategory(category).length / questionsPerPage));
}

// Membuat tombol navigasi halaman sebelumnya/berikutnya.
function buildPaginationButtons(category: FaqCategory, page: number, totalPages: number) {
  const buttons = [];

  if (page > 0) {
    buttons.push({ text: "⬅️ Sebelumnya", callback_data: `cat:${category}:${page - 1}` });
  }

  if (page < totalPages - 1) {
    buttons.push({ text: "Berikutnya ➡️", callback_data: `cat:${category}:${page + 1}` });
  }

  return buttons;
}

// Memastikan halaman tidak keluar dari rentang halaman yang tersedia.
function clampPage(page: number, totalPages: number) {
  if (!Number.isFinite(page) || page < 0) {
    return 0;
  }

  return Math.min(Math.floor(page), totalPages - 1);
}
