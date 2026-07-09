import { type FaqCategory, type FaqEntry } from "./faq-data";
import { getEntriesByCategory, type PatternMatchResult } from "./pattern-matcher";

const questionsPerPage = 7;
const voteBarSegments = 10;

export type SatisfactionChoice = "satisfied" | "dissatisfied";

export interface SatisfactionStats {
  satisfied: number;
  dissatisfied: number;
}

const categoryIcons: Record<FaqCategory, string> = {
  Layanan: "🏢",
  Pajak: "💰",
  Dokumen: "📄",
  "Balik Nama": "🔁",
  Mutasi: "🚚",
  "Cek Fisik": "🔎",
  SIGNAL: "📲",
  "Samsat Keliling": "🚌",
  Fasilitas: "🏛️",
  Pengaduan: "📣",
  "Layanan Tambahan": "",
  Sistem: "",
  Perkembangan: "",
  Umum: ""
};

// Menu utama yang ditampilkan sebagai inline keyboard Telegram.
export const mainMenu = {
  inline_keyboard: [
    [
      { text: categoryLabel("Layanan"), callback_data: "cat:Layanan" },
      { text: categoryLabel("Pajak"), callback_data: "cat:Pajak" },
      { text: categoryLabel("Dokumen"), callback_data: "cat:Dokumen" }
    ],
    [
      { text: categoryLabel("Balik Nama"), callback_data: "cat:Balik Nama" },
      { text: categoryLabel("Mutasi"), callback_data: "cat:Mutasi" },
      { text: categoryLabel("Cek Fisik"), callback_data: "cat:Cek Fisik" }
    ],
    [
      { text: categoryLabel("SIGNAL"), callback_data: "cat:SIGNAL" },
      { text: categoryLabel("Samsat Keliling"), callback_data: "cat:Samsat Keliling" },
      { text: categoryLabel("Fasilitas"), callback_data: "cat:Fasilitas" }
    ],
    [
      { text: categoryLabel("Pengaduan"), callback_data: "cat:Pengaduan" },
    ]
  ]
};

// Membuat pesan pembuka saat user mengirim /start atau /help.
export function buildStartMessage() {
  return withCommandHint([
    "Selamat datang di Chatbot FAQ SAMSAT Bandung Timur.",
    "Silakan pilih kategori atau ketik pertanyaan Anda.",
    "",
    "Contoh:",
    "- jam operasional samsat",
    "- syarat bayar pajak",
    "- stnk hilang",
    "- apa itu SIGNAL",
    "",
    "Ketik /clear untuk membersihkan chat."
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
export function buildFaqMessage(
  result: PatternMatchResult,
  stats: SatisfactionStats = emptySatisfactionStats(),
  selectedChoice?: SatisfactionChoice
) {
  const { entry } = result;

  return [
    `Pertanyaan: ${entry.question}`,
    "",
    entry.answer,
    "",
    `Sumber: ${entry.source}`,
    "",
    buildSatisfactionText(stats, selectedChoice),
  ].join("\n");
}

// Membuat pesan jawaban saat user memilih FAQ langsung dari tombol.
export function buildDirectFaqMessage(
  entry: FaqEntry,
  stats: SatisfactionStats = emptySatisfactionStats(),
  selectedChoice?: SatisfactionChoice
) {
  return [
    `Pertanyaan: ${entry.question}`,
    "",
    entry.answer,
    "",
    `Sumber: ${entry.source}`,
    "",
    buildSatisfactionText(stats, selectedChoice),
  ].join("\n");
}

// Membuat tombol voting kepuasan untuk satu jawaban FAQ.
export function buildSatisfactionKeyboard(faqId: number, stats: SatisfactionStats = emptySatisfactionStats()) {
  const percentages = getSatisfactionPercentages(stats);

  return {
    inline_keyboard: [
      [
        { text: `👍 Memuaskan ${percentages.satisfied}%`, callback_data: `vote:${faqId}:s` },
        { text: `👎 Tidak memuaskan ${percentages.dissatisfied}%`, callback_data: `vote:${faqId}:d` }
      ]
    ]
  };
}

// Pesan fallback jika pertanyaan user tidak cocok dengan data FAQ.
export function buildUnknownMessage() {
  return withCommandHint([
    "Maaf, saya hanya dapat menjawab pertanyaan seputar layanan SAMSAT Bandung Timur.",
    "Pesan Anda tidak terkait dengan topik yang didukung atau belum cocok dengan FAQ yang tersedia.",
    "",
    "Coba gunakan kata kunci yang lebih dekat dengan data FAQ, misalnya:",
    "- pajak",
    "- stnk",
    "- balik nama",
    "- mutasi",
    "- samsat keliling",
    "- cek fisik",
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

// Nilai awal voting saat FAQ belum memiliki penilaian user.
function emptySatisfactionStats(): SatisfactionStats {
  return {
    satisfied: 0,
    dissatisfied: 0
  };
}

// Membuat ringkasan voting agar user melihat skor kepuasan berbasis penilaian.
function buildSatisfactionText(stats: SatisfactionStats, selectedChoice?: SatisfactionChoice) {
  const total = stats.satisfied + stats.dissatisfied;
  const percentages = getSatisfactionPercentages(stats);
  const selectedText =
    selectedChoice === "satisfied"
      ? "\nPilihan Anda: Memuaskan"
      : selectedChoice === "dissatisfied"
        ? "\nPilihan Anda: Tidak memuaskan"
        : "";

  if (total === 0) {
    return [
      "Penilaian pengguna:",
      "Belum ada suara.",
      "Silakan nilai apakah jawaban ini memuaskan."
    ].join("\n");
  }

  return [
    "Hasil voting pengguna:",
    `👍 Memuaskan: ${buildVoteBar(percentages.satisfied)} ${percentages.satisfied}% (${stats.satisfied})`,
    `👎 Tidak memuaskan: ${buildVoteBar(percentages.dissatisfied)} ${percentages.dissatisfied}% (${stats.dissatisfied})`,
    `Total suara: ${total}${selectedText}`
  ].join("\n");
}

// Menghitung persentase vote puas/tidak puas dari total suara yang tersedia.
function getSatisfactionPercentages(stats: SatisfactionStats) {
  const total = stats.satisfied + stats.dissatisfied;

  if (total <= 0) {
    return {
      satisfied: 0,
      dissatisfied: 0
    };
  }

  return {
    satisfied: Math.round((stats.satisfied / total) * 100),
    dissatisfied: Math.round((stats.dissatisfied / total) * 100)
  };
}

// Membuat bar visual sederhana seperti UI voting.
function buildVoteBar(percent: number) {
  const filledSegments = Math.max(0, Math.min(voteBarSegments, Math.round(percent / 10)));
  return "█".repeat(filledSegments) + "░".repeat(voteBarSegments - filledSegments);
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
