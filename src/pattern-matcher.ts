import { faqCategories, faqEntries, type FaqCategory, type FaqEntry } from "./faq-data";

export interface PatternMatchResult {
  entry: FaqEntry;
  score: number;
  matchedTerms: string[];
}

interface ScoredPatternMatchResult extends PatternMatchResult {
  rankingScore: number;
}

// Metode utama: pattern matching dengan perhitungan skor.
// Regex dipakai sebagai pendukung preprocessing dan pendeteksian pola frasa,
// bukan sebagai pengganti algoritma utama pencocokan FAQ.
const minimumScore = 25;

interface RegexPatternSpec {
  pattern: RegExp;
  label: string;
  score: number;
}

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
  "dapat",
  "bisa",
  "hari",
  "berapa",
  "bagaimana",
  "gimana",
  "jika",
  "mengapa",
  "kapan",
  "kah",
  "nya",
  "saya",
  "mau",
  "kalau",
  "saat",
  "begitu",
  "saja",
  "dia",
  "ini",
  "tidak",
  "tolong",
  "dong",
  "min",
  "admin",
  "kak",
  "mas",
  "pak",
  "bu"
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
  ["kendaraan", "mobil", "motor"],
  ["biaya", "tarif"],
  ["dokumen", "syarat", "persyaratan"],
  ["pemilik", "kepemilikan", "nama"],
  ["pengaduan", "keluhan", "komplain"],
  ["daftar", "mendaftar", "pendaftaran"],
  ["drive", "thru", "drivethru"],
  ["nomor", "nopol", "polisi"],
  ["plat", "pelat"],
  ["lima", "tahunan"]
];

// Pola tambahan untuk FAQ tertentu agar variasi pertanyaan user tetap cocok.
const customPatterns: Record<number, string[]> = {
  4: ["jam layanan samsat", "jadwal layanan samsat"],
  5: ["samsat buka", "buka jam"],
  6: ["samsat tutup", "tutup jam", "jam tutup", "kalau tutup", "operasional tutup"],
  7: ["samsat buka hari sabtu", "sabtu buka", "buka hari sabtu", "layanan sabtu"],
  8: ["samsat buka hari minggu", "minggu buka", "buka hari minggu", "layanan minggu"],
  9: ["lokasi samsat bandung timur", "samsat soekarno hatta"],
  10: ["alamat samsat bandung timur"],
  15: ["cek fisik samsat", "melayani cek fisik"],
  22: ["jatuh tempo", "masa berlaku pajak"],
  26: ["denda pajak", "telat bayar pajak"],
  30: ["pajak lima tahunan", "pajak 5 tahun"],
  35: ["bayar pajak online", "pajak online"],
  47: ["syarat bayar pajak", "dokumen bayar pajak", "syarat pajak tahunan"],
  48: ["pajak lima tahunan", "pajak 5 tahun", "syarat pajak lima tahunan"],
  54: ["stnk hilang", "kehilangan stnk"],
  55: ["bpkb hilang", "kehilangan bpkb"],
  62: ["bpkb pajak lima tahunan", "bpkb diperlukan pajak lima tahunan"],
  73: ["syarat balik nama", "dokumen balik nama", "balik nama"],
  90: [
    "mutasi",
    "syarat mutasi",
    "dokumen mutasi",
    "mau mutasi",
    "ingin mutasi",
    "cara mutasi",
    "proses mutasi",
    "alur mutasi"
  ],
  107: ["cek fisik wajib mutasi", "cek fisik untuk mutasi", "cek fisik kendaraan mutasi"],
  117: ["signal", "aplikasi signal"],
  120: ["daftar signal", "cara daftar signal", "registrasi signal"],
  129: ["samsat keliling", "layanan keliling"],
  134: ["jadwal samsat keliling", "jam samsat keliling"],
  136: ["parkir samsat", "tempat parkir samsat", "samsat punya tempat parkir"],
  142: [
    "pengaduan",
    "komplain",
    "pengaduan samsat",
    "keluhan samsat",
    "komplain samsat",
    "komplain layanan samsat",
    "cara komplain layanan samsat"
  ],
  146: ["drive thru", "samsat drive thru"],
  147: ["memiliki drive thru", "tersedia drive thru", "samsat punya drive thru"],
  150: ["syarat drive thru", "dokumen drive thru", "persyaratan drive thru"]
};

// Regex normalisasi menyamakan variasi penulisan sebelum tokenisasi.
// Contoh: "drive-thru" dan "drivethru" disamakan menjadi "drive thru".
const regexNormalizationRules = [
  { pattern: /\b(alamat|alur|biaya|cara|daftar|dokumen|fungsi|jadwal|lokasi|manfaat|mutasi|pajak|proses|syarat)nya\b/g, replacement: "$1" },
  { pattern: /\bdrive\s*-?\s*thru\b/g, replacement: "drive thru" },
  { pattern: /\bdrivethru\b/g, replacement: "drive thru" },
  { pattern: /\b(no\s*pol|nopol|nomor\s*polisi|no\s*polisi)\b/g, replacement: "nomor polisi" },
  { pattern: /\b(plat|pelat)\b/g, replacement: "pelat" },
  { pattern: /\b(5|lima)\s*(tahun|tahunan)\b/g, replacement: "lima tahunan" },
  { pattern: /\bsurat\s+tanda\s+nomor\s+kendaraan\b/g, replacement: "stnk" },
  { pattern: /\bbuku\s+pemilik\s+kendaraan\s+bermotor\b/g, replacement: "bpkb" },
  { pattern: /\btanda\s+nomor\s+kendaraan\s+bermotor\b/g, replacement: "tnkb" },
  { pattern: /\b(cabut\s+berkas|pindah\s+domisili)\b/g, replacement: "syarat mutasi" },
  { pattern: /\b(gesek\s+rangka|gesek\s+mesin)\b/g, replacement: "cek fisik" },
  { pattern: /\b(bb?nkb|bea\s+balik\s+nama)\b/g, replacement: "balik nama" }
];

// Regex pattern memberi sinyal tambahan untuk FAQ yang punya bentuk kalimat
// khas. Skor ini tetap digabung dengan token/sinonim/custom pattern.
const regexPatterns: Record<number, RegexPatternSpec[]> = {
  5: [{ pattern: /\b(samsat\s+)?buka\s+(jam|pukul)?\b/, label: "regex:samsat buka", score: 85 }],
  6: [{ pattern: /\b(tutup).*\b(jam|pukul|operasional)\b|\b(jam|pukul|operasional).*\b(tutup)\b/, label: "regex:samsat tutup", score: 125 }],
  7: [{ pattern: /\b(sabtu).*\b(buka|layanan|operasional)\b|\b(buka|layanan|operasional).*\b(sabtu)\b/, label: "regex:sabtu buka", score: 90 }],
  8: [{ pattern: /\b(minggu).*\b(buka|layanan|operasional)\b|\b(buka|layanan|operasional).*\b(minggu)\b/, label: "regex:minggu buka", score: 90 }],
  10: [{ pattern: /\b(alamat|lokasi|dimana|tempat).*\b(samsat).*\b(bandung\s+timur)\b/, label: "regex:alamat samsat bandung timur", score: 95 }],
  35: [{ pattern: /\b(bayar|pembayaran).*\b(pajak).*\b(online|digital|signal)\b|\b(pajak).*\b(online|digital|signal)\b/, label: "regex:pajak online", score: 95 }],
  47: [{ pattern: /\b(syarat|dokumen|persyaratan).*\b(bayar|pembayaran).*\b(pajak)\b|\b(syarat|dokumen|persyaratan).*\b(pajak)\b/, label: "regex:syarat pajak", score: 95 }],
  30: [{ pattern: /\b(pajak).*\b(lima\s+tahunan)\b|\b(lima\s+tahunan).*\b(pajak)\b/, label: "regex:pajak lima tahunan", score: 70 }],
  48: [{ pattern: /\b(syarat|dokumen|persyaratan).*\b(pajak)?.*\b(lima\s+tahunan)\b|\b(lima\s+tahunan).*\b(pajak)?.*\b(syarat|dokumen|persyaratan)\b/, label: "regex:syarat pajak lima tahunan", score: 140 }],
  54: [{ pattern: /\b(stnk).*\b(hilang|kehilangan)\b|\b(hilang|kehilangan).*\b(stnk)\b/, label: "regex:stnk hilang", score: 95 }],
  55: [{ pattern: /\b(bpkb).*\b(hilang|kehilangan)\b|\b(hilang|kehilangan).*\b(bpkb)\b/, label: "regex:bpkb hilang", score: 95 }],
  62: [{ pattern: /\b(bpkb).*\b(pajak).*\b(lima\s+tahunan)\b|\b(pajak).*\b(lima\s+tahunan).*\b(bpkb)\b/, label: "regex:bpkb pajak lima tahunan", score: 135 }],
  73: [{ pattern: /\b(syarat|dokumen|persyaratan|cara|proses).*\b(balik\s+nama)\b|\b(balik\s+nama).*\b(syarat|dokumen|persyaratan|cara|proses)\b/, label: "regex:balik nama", score: 95 }],
  90: [{ pattern: /\b(syarat|dokumen|persyaratan|cara|proses|alur|mau|ingin).*\b(mutasi)\b|\b(mutasi).*\b(syarat|dokumen|persyaratan|cara|proses|alur)\b/, label: "regex:mutasi", score: 95 }],
  103: [{ pattern: /\b(apa|pengertian).*\b(cek\s+fisik)\b|\b(cek\s+fisik).*\b(kendaraan)\b/, label: "regex:apa cek fisik", score: 85 }],
  107: [{ pattern: /\b(cek\s+fisik).*\b(wajib|perlu|harus).*\b(mutasi)\b|\b(mutasi).*\b(cek\s+fisik)\b/, label: "regex:cek fisik mutasi", score: 98 }],
  117: [{ pattern: /\b(signal|sambara|aplikasi\s+signal)\b/, label: "regex:signal", score: 95 }],
  120: [{ pattern: /\b(daftar|mendaftar|registrasi|cara).*\b(signal)\b|\b(signal).*\b(daftar|mendaftar|registrasi|cara)\b/, label: "regex:daftar signal", score: 125 }],
  129: [{ pattern: /\b(samsat\s+keliling|layanan\s+keliling)\b/, label: "regex:samsat keliling", score: 95 }],
  134: [{ pattern: /\b(jadwal|jam|kapan).*\b(samsat\s+keliling|keliling\s+samsat)\b|\b(samsat\s+keliling|keliling\s+samsat).*\b(jadwal|jam|kapan)\b/, label: "regex:jadwal samsat keliling", score: 120 }],
  136: [{ pattern: /\b(parkir|tempat\s+parkir|area\s+parkir).*\b(samsat)?\b/, label: "regex:parkir samsat", score: 90 }],
  142: [{ pattern: /\b(pengaduan|keluhan|komplain|lapor).*\b(samsat|layanan)?\b/, label: "regex:pengaduan", score: 90 }],
  146: [{ pattern: /\b(drive\s+thru|drivethru)\b/, label: "regex:drive thru", score: 80 }],
  147: [{ pattern: /\b(memiliki|tersedia|ada|punya).*\b(drive\s+thru|drivethru)\b|\b(drive\s+thru|drivethru).*\b(memiliki|tersedia|ada|punya)\b/, label: "regex:ketersediaan drive thru", score: 130 }]
};

// Kata intent umum tidak cukup untuk membuktikan bahwa pertanyaan membahas
// Samsat. Ini mencegah kalimat seperti "syarat mencintai dia" cocok hanya
// karena kata "syarat" bersinonim dengan kategori Dokumen.
const genericIntentTokens = new Set([
  "alamat",
  "lokasi",
  "tempat",
  "dimana",
  "jam",
  "jadwal",
  "operasional",
  "buka",
  "tutup",
  "fungsi",
  "manfaat",
  "kegunaan",
  "wajib",
  "harus",
  "perlu",
  "biaya",
  "tarif",
  "kendaraan",
  "mobil",
  "motor",
  "melayani",
  "layanan",
  "pelayanan",
  "dokumen",
  "syarat",
  "persyaratan",
  "cara",
  "proses",
  "alur",
  "online",
  "digital",
  "hilang",
  "kehilangan"
]);

// Bentuk kata percakapan yang sering memakai akhiran kepunyaan. Daftar
// eksplisit dipakai agar kata biasa seperti "hanya" tidak salah dipotong.
const tokenAliases: Record<string, string> = {
  alamatnya: "alamat",
  biayanya: "biaya",
  caranya: "cara",
  dokumennya: "dokumen",
  fungsinya: "fungsi",
  jadwalnya: "jadwal",
  kendaraannya: "kendaraan",
  lokasinya: "lokasi",
  manfaatnya: "manfaat",
  mobilnya: "mobil",
  motornya: "motor",
  mutasinya: "mutasi",
  pajaknya: "pajak",
  persyaratannya: "persyaratan",
  prosesnya: "proses",
  syaratnya: "syarat",
  daftarnya: "daftar"
};

// Istilah yang cukup spesifik untuk menunjukkan bahwa input membahas Samsat
// atau administrasi kendaraan. Kata umum seperti mobil/kendaraan sengaja tidak
// dimasukkan karena sering muncul dalam percakapan di luar layanan Samsat.
const domainAnchorTokens = new Set([
  "samsat",
  "pajak",
  "pkb",
  "swdkllj",
  "stnk",
  "bpkb",
  "tnkb",
  "mutasi",
  "sambara"
]);

const domainAnchorPhrases = [
  "buka jam",
  "tutup jam",
  "balik nama",
  "cek fisik",
  "nomor rangka",
  "nomor mesin",
  "nomor polisi",
  "pelat nomor",
  "plat nomor",
  "jatuh tempo",
  "drive thru",
  "aplikasi signal"
];

const vehicleBrandTokens = [
  "toyota", "honda", "suzuki", "daihatsu", "mitsubishi", "nissan", "mazda",
  "isuzu", "wuling", "hyundai", "kia", "bmw", "mercedes", "yamaha",
  "kawasaki", "vespa"
];

const dayOfWeekTokens = [
  "senin",
  "selasa",
  "rabu",
  "kamis",
  "jumat",
  "sabtu",
  "minggu"
];

const faqVocabulary = new Set([
  ...synonymGroups.flat(),
  ...vehicleBrandTokens,
  ...dayOfWeekTokens,
  ...faqEntries.flatMap((entry) =>
    tokenize(`${entry.question} ${entry.category} ${(customPatterns[entry.id] ?? []).join(" ")}`)
  )
]);

const outOfScopeBandungAreas = ["barat", "utara", "selatan", "tengah"];
const operationalHoursFaqIds = new Set([4, 5, 6, 7, 8]);
const operationalHoursTokens = new Set([
  "jam",
  "buka",
  "tutup",
  "operasional",
  ...dayOfWeekTokens
]);
const operationalHoursContextTokens = new Set(["jam", "buka", "tutup", "operasional"]);

// Kosakata yang masih masuk akal ketika user membahas cek fisik kendaraan.
// Kata di luar daftar ini menandakan bahwa frasa "cek fisik" dipakai dalam
// konteks lain, misalnya olahraga atau pemeriksaan kesehatan manusia.
const vehicleInspectionTokens = new Set([
  "cek", "fisik", "kendaraan", "mobil", "motor", "wajib", "harus", "perlu",
  "balik", "nama", "mutasi", "pindah", "pajak", "stnk", "bpkb", "nomor",
  "rangka", "mesin", "biaya", "tarif", "dimana", "lokasi", "tempat", "alamat",
  "samsat", "hasil", "masa", "berlaku", "baru", "modifikasi", "dimodifikasi",
  "proses", "alur", "cara", "syarat", "persyaratan", "dokumen", "layanan",
  "melayani", "pelayanan", "memerlukan", "diperlukan", "pemilik", "kepemilikan",
  "bawa", "membawa", "dibawa", "diperiksa", "dikenakan", "diwakilkan",
  "tersedia", "area", "waktu", "lama", "gratis"
]);

// Fungsi utama untuk mencari FAQ yang paling cocok dengan pertanyaan user.
export function matchFaq(input: string): PatternMatchResult | null {
  const normalizedInput = normalize(input);
  const baseQueryTokens = tokenize(normalizedInput);
  const queryTokens = expandTokens(baseQueryTokens);

  if (
    queryTokens.length === 0 ||
    !hasDomainContext(normalizedInput, queryTokens) ||
    hasConflictingContext(normalizedInput, queryTokens, baseQueryTokens)
  ) {
    return null;
  }

  const ranked = faqEntries
    .map((entry) => scoreEntry(entry, normalizedInput, baseQueryTokens, queryTokens))
    .sort((a, b) => b.rankingScore - a.rankingScore || b.score - a.score);

  const best = ranked[0];
  if (!best || best.score < minimumScore || !hasSubjectOverlap(best.entry, queryTokens)) {
    return null;
  }

  return best;
}

// Menolak wilayah Bandung selain Timur dan pemakaian istilah Samsat dalam
// konteks yang jelas berbeda dari administrasi kendaraan.
function hasConflictingContext(
  normalizedInput: string,
  queryTokens: string[],
  baseQueryTokens: string[]
) {
  if (isExactFaqPattern(normalizedInput)) {
    return false;
  }

  const knownTokenCount = baseQueryTokens.filter((token) => faqVocabulary.has(token)).length;
  const unknownTokenCount = baseQueryTokens.length - knownTokenCount;

  // Satu istilah domain tidak boleh memaksa kecocokan ketika konteks lainnya
  // berasal dari topik berbeda (contoh: "mutasi genetik" atau "pajak cinta").
  if (unknownTokenCount > 0 && knownTokenCount < unknownTokenCount + 3) {
    return true;
  }

  const asksOtherBandungArea =
    normalizedInput.includes("bandung") &&
    !normalizedInput.includes("bandung timur") &&
    outOfScopeBandungAreas.some((area) => normalizedInput.includes(`bandung ${area}`));

  if (asksOtherBandungArea) {
    return true;
  }

  if (normalizedInput.includes("cek fisik")) {
    return queryTokens.some((token) => !vehicleInspectionTokens.has(token));
  }

  return false;
}

// Pertanyaan harus membawa konteks domain yang jelas. Pengecualian diberikan
// untuk pertanyaan/pola FAQ yang diketik persis, karena konteksnya sudah tidak
// ambigu di dalam bot Samsat.
function hasDomainContext(normalizedInput: string, queryTokens: string[]) {
  if (queryTokens.some((token) => domainAnchorTokens.has(token))) {
    return true;
  }

  if (domainAnchorPhrases.some((phrase) => normalizedInput.includes(phrase))) {
    return true;
  }

  if (queryTokens.some((token) => faqVocabulary.has(token))) {
    return true;
  }

  if (queryTokens.some((token) => operationalHoursContextTokens.has(token))) {
    return true;
  }

  if (
    queryTokens.some((token) => dayOfWeekTokens.includes(token)) &&
    (normalizedInput.includes("kalau") || normalizedInput.includes("hari"))
  ) {
    return true;
  }

  return isExactFaqPattern(normalizedInput);
}

function isExactFaqPattern(normalizedInput: string) {
  return faqEntries.some((entry) => {
    const patterns = [entry.question, ...(customPatterns[entry.id] ?? [])];
    return patterns.some((pattern) => normalize(pattern) === normalizedInput);
  });
}

// Sedikitnya satu kata subjek harus sama dengan FAQ tujuan. Kecocokan yang
// hanya berasal dari kata intent umum dianggap di luar konteks.
function hasSubjectOverlap(entry: FaqEntry, queryTokens: string[]) {
  const entryTokens = new Set(expandTokens(tokenize(`${entry.question} ${entry.category}`)));
  if (
    operationalHoursFaqIds.has(entry.id) &&
    queryTokens.some((token) => operationalHoursTokens.has(token))
  ) {
    return true;
  }
  return queryTokens.some((token) => !genericIntentTokens.has(token) && entryTokens.has(token));
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
  const normalized = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");

  return applyRegexNormalization(normalized)
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Menjalankan aturan regex untuk menyamakan variasi istilah domain Samsat.
function applyRegexNormalization(value: string) {
  return regexNormalizationRules.reduce(
    (currentValue, rule) => currentValue.replace(rule.pattern, rule.replacement),
    value
  );
}

// Menghitung skor kecocokan antara input user dan satu data FAQ.
function scoreEntry(
  entry: FaqEntry,
  normalizedInput: string,
  baseQueryTokens: string[],
  queryTokens: string[]
): ScoredPatternMatchResult {
  const patterns = [
    { value: entry.question, exactScore: 100, partialScore: 65 },
    { value: entry.category, exactScore: 45, partialScore: 20 },
    ...(customPatterns[entry.id] ?? []).map((value) => ({
      value,
      exactScore: 100,
      partialScore: 80
    }))
  ];
  const compactInput = baseQueryTokens.join(" ");
  const entryTokens = expandTokens(tokenize([entry.question, entry.category].join(" ")));

  let phraseScore = 0;
  let regexScore = 0;
  const matchedTerms = new Set<string>();

  // Skor tinggi diberikan jika input cocok persis atau cocok sebagian dengan pola.
  for (const patternSpec of patterns) {
    const pattern = normalize(patternSpec.value);
    if (!pattern) {
      continue;
    }

    const compactPattern = tokenize(pattern).join(" ");
    if (pattern === normalizedInput) {
      phraseScore = Math.max(phraseScore, patternSpec.exactScore + 100);
      matchedTerms.add(pattern);
    } else if (compactPattern === compactInput) {
      phraseScore = Math.max(phraseScore, patternSpec.exactScore + 40);
      matchedTerms.add(pattern);
    } else if (
      pattern.includes(normalizedInput) ||
      normalizedInput.includes(pattern) ||
      (compactInput.length > 0 && compactPattern.includes(compactInput)) ||
      (compactPattern.length > 0 && compactInput.includes(compactPattern))
    ) {
      phraseScore = Math.max(phraseScore, patternSpec.partialScore);
      matchedTerms.add(pattern);
    } else {
      const unorderedScore = getUnorderedPatternScore(pattern, queryTokens, patternSpec.partialScore);
      if (unorderedScore > 0) {
        phraseScore = Math.max(phraseScore, unorderedScore);
        matchedTerms.add(`unordered:${pattern}`);
      }
    }
  }

  for (const regexPattern of regexPatterns[entry.id] ?? []) {
    if (regexPattern.pattern.test(normalizedInput)) {
      regexScore = Math.max(regexScore, regexPattern.score);
      matchedTerms.add(regexPattern.label);
    }
  }

  const querySet = new Set(queryTokens);
  const entrySet = new Set(entryTokens);
  const overlap = [...querySet].filter((token) => entrySet.has(token));
  const meaningfulOverlap = overlap.filter((token) => !genericIntentTokens.has(token));
  const meaningfulEntryTokens = [...entrySet].filter((token) => !genericIntentTokens.has(token));
  const knownQueryTokens = [...querySet].filter((token) => faqVocabulary.has(token));

  for (const token of overlap) {
    matchedTerms.add(token);
  }

  const queryCoverage = overlap.length / Math.max(knownQueryTokens.length, 1);
  const entryCoverage = overlap.length / Math.max(entrySet.size, 1);
  const subjectCoverage = meaningfulOverlap.length / Math.max(meaningfulEntryTokens.length, 1);
  const anchorBonus = overlap.some((token) => domainAnchorTokens.has(token)) ? 10 : 0;
  // Skor relevansi mengutamakan pola/frasa dan kata inti FAQ. Kata tambahan
  // yang tidak ada di dataset tidak langsung membuat skor turun drastis.
  const patternScore = Math.max(phraseScore, regexScore);
  const relevanceScore =
    patternScore * 0.65 +
    subjectCoverage * 20 +
    entryCoverage * 10 +
    queryCoverage * 5 +
    anchorBonus;

  return {
    entry,
    score: Math.min(100, Math.round(relevanceScore)),
    rankingScore: relevanceScore,
    matchedTerms: [...matchedTerms].slice(0, 6)
  };
}

// Custom pattern tetap dianggap cocok meski urutan kata user dibalik.
// Contoh: "syarat bayar pajak" tetap cocok dengan "pajak bayar syaratnya".
function getUnorderedPatternScore(pattern: string, queryTokens: string[], baseScore: number) {
  const basePatternTokens = tokenize(pattern);
  if (basePatternTokens.length < 2) {
    return 0;
  }

  const expandedPatternTokens = expandTokens(basePatternTokens);
  const querySet = new Set(queryTokens);
  const isMatch = expandedPatternTokens.every((token) => querySet.has(token));

  if (!isMatch) {
    return 0;
  }

  return baseScore + Math.min(basePatternTokens.length * 10, 40);
}

// Memecah teks menjadi kata penting dan membuang stop word.
function tokenize(value: string) {
  return normalize(value)
    .split(" ")
    .map((token) => tokenAliases[token] ?? token)
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
