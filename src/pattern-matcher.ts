import { faqCategories, faqEntries, type FaqCategory, type FaqEntry } from "./faq-data";

export interface PatternMatchResult {
  entry: FaqEntry;
  score: number;
  matchedTerms: string[];
}

interface ScoredPatternMatchResult extends PatternMatchResult {
  directOverlapCount: number;
  phraseMatched: boolean;
}

// Metode utama: pattern matching dengan perhitungan skor.
// Regex hanya digunakan di dalam normalize() untuk preprocessing tanda baca/spasi,
// bukan sebagai algoritma utama pencocokan FAQ.
const minimumScore = 30;

// Kata umum yang diabaikan agar pencocokan fokus pada kata bermakna.
const stopWords = new Set([
  "apa",
  "apakah",
  "itu",
  "yang",
  "di",
  "ke",
  "dan",
  "atau",
  "untuk",
  "hari",
  "berapa",
  "bagaimana",
  "gimana",
  "kah",
  "nya",
  "saya",
  "mau",
  "kalau",
  "begitu",
  "saja",
  "dari",
  "ini",
  "dia"
]);

// Kelompok kata yang dianggap memiliki makna mirip saat pencocokan.
const synonymGroups = [
  ["alamat", "lokasi", "tempat", "dimana"],
  ["jam", "jadwal", "operasional", "buka", "tutup"],
  ["bayar", "pembayaran"],
  ["online", "digital", "hp"],
  ["hilang", "kehilangan"],
  ["wajib", "harus", "perlu"],
  ["fungsi", "manfaat", "kegunaan"],
  ["cepat", "kilat"],
  ["mutasi", "pindah"],
  ["biaya", "tarif"],
  ["dokumen", "syarat", "persyaratan"],
  ["pemilik", "kepemilikan", "nama"]
];

// Pola tambahan untuk FAQ tertentu agar variasi pertanyaan user tetap cocok.
const customPatterns: Record<number, string[]> = {
  1: ["jam layanan samsat", "jadwal layanan samsat"],
  4: ["jam operasional samsat", "jadwal samsat bandung timur"],
  5: ["samsat buka", "buka jam"],
  6: ["samsat tutup", "tutup jam"],
  7: ["samsat buka hari sabtu", "sabtu buka", "buka hari sabtu", "layanan sabtu"],
  8: ["samsat buka hari minggu", "minggu buka", "buka hari minggu", "layanan minggu"],
  9: ["lokasi samsat bandung timur", "dimana samsat bandung timur"],
  10: ["alamat samsat bandung timur", "samsat soekarno hatta"],
  26: ["antrean samsat", "antrian samsat", "antrean pelayanan"],
  36: ["denda pajak", "telat bayar pajak"],
  40: ["pajak lima tahunan", "pajak 5 tahun"],
  49: ["cek denda pajak", "mengetahui denda pajak"],
  62: ["bayar pajak online", "pajak online signal"],
  64: ["syarat bayar pajak", "dokumen bayar pajak", "syarat pajak tahunan"],
  65: ["syarat pajak lima tahunan", "dokumen pajak lima tahunan"],
  76: ["stnk hilang", "kehilangan stnk"],
  77: ["bpkb hilang", "kehilangan bpkb"],
  105: ["syarat balik nama", "dokumen balik nama"],
  113: ["proses balik nama", "alur balik nama", "lama balik nama"],
  126: ["mutasi kendaraan", "mau mutasi", "apa itu mutasi"],
  130: ["syarat mutasi", "dokumen mutasi"],
  136: ["proses mutasi", "alur mutasi", "alur mutasi kendaraan", "lama mutasi"],
  151: ["cek fisik kendaraan", "apa itu cek fisik"],
  158: ["biaya cek fisik", "cek fisik bayar"],
  170: ["lokasi cek fisik", "dimana cek fisik"],
  171: ["signal", "aplikasi signal"],
  191: ["samsat keliling", "layanan keliling"],
  196: ["jadwal samsat keliling", "jam samsat keliling"],
  197: ["lokasi samsat keliling", "samsat keliling hari ini"],
  217: ["area antrean", "tempat antrean"],
  218: ["fasilitas samsat", "fasilitas tersedia"],
  219: ["pengaduan samsat", "komplain layanan"],
  229: ["drive thru", "samsat drive thru"]
};

// Fungsi utama untuk mencari FAQ yang paling cocok dengan pertanyaan user.
export function matchFaq(input: string): PatternMatchResult | null {
  const normalizedInput = normalize(input);
  const directQueryTokens = tokenize(normalizedInput);
  const queryTokens = expandTokens(directQueryTokens);

  if (directQueryTokens.length === 0) {
    return null;
  }

  const ranked = faqEntries
    .map((entry) => scoreEntry(entry, normalizedInput, directQueryTokens, queryTokens))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  return best && isReliableMatch(best) ? best : null;
}

// Mengambil satu FAQ berdasarkan ID, biasanya dipakai saat tombol FAQ diklik.
export function getFaqById(id: number) {
  return faqEntries.find((entry) => entry.id === id);
}

// Memvalidasi dan mengambil kategori dari callback Telegram.
export function getCategory(value: string): FaqCategory | null {
  const normalizedValue = normalize(value);
  return faqCategories.find((category) => normalize(category) === normalizedValue) ?? null;
}

// Mengambil semua FAQ dalam satu kategori.
export function getEntriesByCategory(category: FaqCategory) {
  return faqEntries.filter((entry) => entry.category === category);
}

// Menyamakan format teks sebelum dicocokkan.
export function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Menghitung skor kecocokan antara input user dan satu data FAQ.
function scoreEntry(
  entry: FaqEntry,
  normalizedInput: string,
  directQueryTokens: string[],
  queryTokens: string[]
): ScoredPatternMatchResult {
  const patterns = [entry.question, entry.category, ...(customPatterns[entry.id] ?? [])];
  const normalizedPatterns = patterns.map(normalize).filter(Boolean);
  const directEntryTokens = tokenize([entry.question, entry.category].join(" "));
  const entryTokens = expandTokens(directEntryTokens);

  let score = 0;
  let phraseMatched = false;
  const matchedTerms = new Set<string>();

  // Skor tinggi diberikan jika input cocok persis atau cocok sebagian dengan pola.
  for (const pattern of normalizedPatterns) {
    if (pattern === normalizedInput) {
      score += 100;
      phraseMatched = true;
      matchedTerms.add(pattern);
    } else if (pattern.includes(normalizedInput) || normalizedInput.includes(pattern)) {
      score += 45;
      phraseMatched = true;
      matchedTerms.add(pattern);
    }
  }

  const querySet = new Set(queryTokens);
  const entrySet = new Set(entryTokens);
  const directQuerySet = new Set(directQueryTokens);
  const directEntrySet = new Set(directEntryTokens);
  const overlap = [...querySet].filter((token) => entrySet.has(token));
  const directOverlap = [...directQuerySet].filter((token) => directEntrySet.has(token));

  for (const token of overlap) {
    matchedTerms.add(token);
  }

  const queryCoverage = overlap.length / querySet.size;
  const entryCoverage = overlap.length / Math.max(entrySet.size, 1);
  // Skor overlap memperhitungkan jumlah kata penting yang sama.
  score += queryCoverage * 45 + entryCoverage * 35;

  return {
    entry,
    score: Math.round(score),
    matchedTerms: [...matchedTerms].slice(0, 6),
    directOverlapCount: directOverlap.length,
    phraseMatched
  };
}

// Memastikan skor tinggi bukan hanya hasil perluasan sinonim dari satu kata ambigu.
function isReliableMatch(result: ScoredPatternMatchResult) {
  if (result.score < minimumScore) {
    return false;
  }

  return result.phraseMatched || result.directOverlapCount > 0;
}

// Memecah teks menjadi kata penting dan membuang stop word.
function tokenize(value: string) {
  return normalize(value)
    .split(" ")
    .filter((token) => token.length > 1 && !stopWords.has(token));
}

// Menambahkan kata sinonim agar variasi pertanyaan tetap bisa dikenali.
function expandTokens(tokens: string[]) {
  const expanded = new Set(tokens);

  for (const token of tokens) {
    for (const group of synonymGroups) {
      if (group.includes(token)) {
        for (const synonym of group) {
          expanded.add(synonym);
        }
      }
    }
  }

  return [...expanded];
}
