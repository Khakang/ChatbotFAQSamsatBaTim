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
  "kenapa",
  "kah",
  "kan",
  "nya",
  "saya",
  "aku",
  "gue",
  "gw",
  "mau",
  "kalau",
  "saat",
  "sampai",
  "begitu",
  "saja",
  "aja",
  "dia",
  "ini",
  "jadi",
  "jelas",
  "tidak",
  "ada",
  "banget",
  "banjir",
  "belum",
  "beliau",
  "beberapa",
  "buat",
  "bwt",
  "cukup",
  "duluan",
  "datang",
  "dipakai",
  "doang",
  "entah",
  "ga",
  "gak",
  "kebawa",
  "kena",
  "lagi",
  "lama",
  "masih",
  "mana",
  "memasukkan",
  "minta",
  "musibah",
  "mengaktifkan",
  "nunggu",
  "pertama",
  "sekarang",
  "sekitar",
  "semua",
  "siang",
  "sih",
  "surat",
  "tulisan",
  "tulisannya",
  "waktunya",
  "kecelakaan",
  "kemarin",
  "sudah",
  "pas",
  "tapi",
  "tetap",
  "via",
  "lewat",
  "dari",
  "ya",
  "tolong",
  "dong",
  "min",
  "admin",
  "kak",
  "kang",
  "mas",
  "pak",
  "bu",
  "teh",
  "gan"
]);

// Kelompok kata yang dianggap memiliki makna mirip saat pencocokan.
const synonymGroups = [
  ["alamat", "lokasi", "tempat", "dimana"],
  ["jam", "jadwal", "operasional"],
  ["buka", "beroperasi"],
  ["tutup"],
  ["cek", "periksa", "lihat", "mengetahui", "cari"],
  ["bayar", "pembayaran", "dibayar", "bayarin"],
  ["online", "digital", "hp", "aplikasi", "ponsel"],
  ["hilang", "kehilangan", "ilang", "raib", "lenyap"],
  ["rusak", "patah", "kebakar"],
  ["wajib", "harus", "perlu"],
  ["fungsi", "manfaat", "kegunaan"],
  ["cepat", "kilat"],
  ["mutasi", "pindah", "domisili", "cabut"],
  ["kendaraan", "mobil", "motor"],
  ["jatuh", "tempo", "deadline"],
  ["telat", "terlambat", "keterlambatan"],
  ["menunggak", "nunggak", "tunggakan"],
  ["hitung", "dihitung"],
  ["total", "besaran", "tagihan"],
  ["mahal", "besar"],
  ["biaya", "tarif"],
  ["dokumen", "syarat", "persyaratan", "berkas", "bawa"],
  ["asli", "ori", "original"],
  ["ktp", "identitas"],
  ["pemilik", "kepemilikan", "nama"],
  ["bekas", "second", "seken"],
  ["pengaduan", "keluhan", "komplain", "lapor", "kritik", "saran", "petugas", "jutek"],
  ["daftar", "mendaftar", "pendaftaran", "registrasi"],
  ["drive", "thru", "drivethru"],
  ["nomor", "nopol", "polisi"],
  ["plat", "pelat", "tnkb"],
  ["sulit", "susah"],
  ["ditemukan", "dicari"],
  ["wajah", "muka", "selfie", "face", "matching"],
  ["gagal", "error"],
  ["pemutihan", "keringanan", "diskon"],
  ["parkir", "parking"],
  ["mushola", "musala"],
  ["loket", "informasi", "cs"],
  ["tunai", "cash", "nontunai", "non-tunai"],
  ["bukti", "struk", "resi"],
  ["status", "berubah"],
  ["gagal", "terpotong", "salah"],
  ["nik"],
  ["ruang", "tunggu"],
  ["pengunjung", "masyarakat"]
];

// Pola tambahan untuk FAQ tertentu agar variasi pertanyaan user tetap cocok.
const customPatterns: Record<number, string[]> = {
  4: ["jam layanan samsat", "jadwal layanan samsat"],
  5: ["samsat buka", "buka jam"],
  6: [
    "samsat tutup",
    "tutup jam",
    "jam tutup",
    "kalau tutup",
    "operasional tutup",
    "loket pembayaran tutup jam",
    "siang masih dilayani",
    "jam satu masih dilayani"
  ],
  7: ["samsat buka hari sabtu", "sabtu buka", "buka hari sabtu", "layanan sabtu"],
  8: ["samsat buka hari minggu", "minggu buka", "buka hari minggu", "layanan minggu", "minggu bayar pajak", "tanggal merah", "hari libur"],
  9: ["lokasi samsat bandung timur", "samsat soekarno hatta"],
  10: ["alamat samsat bandung timur"],
  15: ["cek fisik samsat", "melayani cek fisik"],
  22: ["jatuh tempo", "masa berlaku pajak", "deadline pajak", "tanggal jatuh tempo pajak"],
  23: ["cek pajak kendaraan", "cek tagihan pajak", "lihat pajak kendaraan", "cek pkb"],
  26: ["denda pajak", "telat bayar pajak", "telat pajak", "denda keterlambatan pajak", "pajak terlambat", "pajak telat"],
  27: ["total biaya pajak", "besaran pajak kendaraan", "tagihan pajak mahal", "tagihan lebih mahal"],
  30: ["pajak lima tahunan", "pajak 5 tahun"],
  28: ["pajak diwakilkan", "bayar pajak diwakilkan", "bayarin pajak orang tua", "stnk atas nama istri", "suami bayar pajak", "pajak atas nama orang lain"],
  33: ["mati pajak", "pajak mati lama", "pajak sudah mati lama", "pajak bertahun tahun", "pajak menunggak bertahun tahun", "pajak mati beberapa tahun"],
  35: ["bayar pajak online", "pajak online", "bayar pkb online", "bayar e samsat"],
  42: ["pajak stnk hilang", "bayar pajak stnk hilang", "stnk hilang bayar pajak"],
  45: ["pajak aplikasi hp", "bayar pajak hp", "pajak pakai aplikasi", "bayar pajak signal", "pajak lewat signal"],
  39: ["denda dihitung", "denda satu bulan", "telat satu bulan", "besaran denda pajak", "denda pajak dihitung"],
  40: [
    "pemutihan pajak",
    "program pemutihan",
    "keringanan pajak",
    "diskon pajak",
    "bbnkb kendaraan bekas gratis",
    "bea balik nama kendaraan bekas gratis",
    "balik nama gratis",
    "biaya balik nama gratis",
    "semua biaya gratis"
  ],
  43: ["bukti pembayaran", "bukti bayar online", "bukti belum dikirim", "bukti pengesahan"],
  47: ["syarat bayar pajak", "dokumen bayar pajak", "syarat pajak tahunan", "bayar pajak bawa apa", "ktp asli bayar pajak", "fotokopi ktp bayar pajak"],
  48: [
    "pajak lima tahunan",
    "pajak 5 tahun",
    "syarat pajak lima tahunan",
    "ganti plat",
    "ganti pelat",
    "waktunya ganti plat",
    "ganti plat syarat",
    "ganti pelat syarat",
    "pajak lima tahunan kendaraan dibawa",
    "ganti plat cek fisik",
    "plat mau habis",
    "ganti plat leasing",
    "plat mati pajak menunggak",
    "ganti plat harus cek fisik",
    "bpkb leasing ganti plat",
    "motor luar kota ganti plat",
    "pajak lima tahunan cek fisik samsat terdekat",
    "dokumen ganti plat bawa motor"
  ],
  54: [
    "stnk hilang",
    "kehilangan stnk",
    "stnk hilang cara",
    "urus stnk hilang",
    "stnk hilang ngurus",
    "stnk bpkb hilang",
    "stnk sama bpkb hilang",
    "stnk hilang bpkb leasing",
    "stnk hilang bpkb masih leasing",
    "kehilangan dompet stnk hilang"
  ],
  55: ["bpkb hilang", "kehilangan bpkb", "bpkb hilang cara", "urus bpkb hilang"],
  56: ["stnk rusak", "stnk kena air", "stnk kebakar", "stnk terbaca"],
  62: ["bpkb pajak lima tahunan", "bpkb diperlukan pajak lima tahunan"],
  63: ["ktp beda alamat stnk", "alamat ktp beda stnk", "data stnk sesuai"],
  66: [
    "tnkb hilang",
    "plat hilang",
    "pelat hilang",
    "plat nomor hilang",
    "plat nomor rusak",
    "nopol hilang",
    "plat hanyut",
    "plat kebawa banjir",
    "plat patah",
    "plat rusak",
    "plat dicuri",
    "plat motor patah",
    "habis banjir plat",
    "plat depan tidak ada",
    "plat kebawa arus",
    "bikin plat baru",
    "plat nomor tulisannya tidak jelas",
    "tnkb rusak"
  ],
  73: [
    "syarat balik nama",
    "dokumen balik nama",
    "balik nama",
    "motor bekas nama pemilik lama",
    "nama masih pemilik lama",
    "kendaraan bekas pemilik lama",
    "balik nama motor second",
    "balik nama kendaraan seken",
    "pindah tangan balik nama",
    "motor warisan balik nama",
    "perusahaan perorangan",
    "ktp pemilik lama tidak ada balik nama",
    "tidak punya ktp pemilik lama",
    "orangnya tidak tahu dimana balik nama",
    "ayah meninggal balik nama",
    "bapak meninggal balik nama",
    "pemilik meninggal balik nama",
    "kendaraan warisan balik nama",
    "membereskan kendaraan atas nama sendiri"
  ],
  76: ["balik nama diwakilkan", "pemilik lama susah dihubungi", "pemilik lama tidak bisa dihubungi"],
  82: ["kuitansi pembelian hilang", "kwitansi pembelian hilang", "bukti jual beli hilang"],
  85: ["balik nama pajak menunggak", "belum balik nama pajak", "motor bekas belum balik nama pajak", "balik nama pajak nunggak", "balik nama tunggakan pajak"],
  90: [
    "mutasi",
    "syarat mutasi",
    "dokumen mutasi",
    "mau mutasi",
    "ingin mutasi",
    "cara mutasi",
    "proses mutasi",
    "alur mutasi",
    "plat luar pindah",
    "pelat luar pindah",
    "pindah domisili",
    "cabut berkas"
  ],
  92: ["kendaraan dibawa mutasi", "motor dibawa mutasi", "mobil dibawa mutasi"],
  94: ["mutasi bpkb asli", "mutasi bpkb ori", "bpkb asli mutasi"],
  96: ["cabut berkas berapa lama", "proses cabut berkas", "batas waktu cabut berkas", "daftar daerah tujuan batas waktu"],
  98: [
    "kendaraan luar kota ke bandung",
    "plat jakarta jadi bandung",
    "plat luar daerah tinggal bandung",
    "plat luar jawa barat tinggal bandung",
    "bayar pajak plat luar daerah di bandung",
    "kendaraan luar provinsi mutasi",
    "pindah kendaraan luar kota bandung",
    "motor plat jakarta jadi bandung"
  ],
  102: ["mutasi online", "mutasi dapat online"],
  105: ["kapan cek fisik", "kendaraan harus cek fisik", "cek fisik diperlukan"],
  107: ["cek fisik wajib mutasi", "cek fisik untuk mutasi", "cek fisik kendaraan mutasi"],
  117: ["signal", "aplikasi signal"],
  120: ["daftar signal", "cara daftar signal", "registrasi signal", "bikin akun signal", "buat akun signal"],
  121: ["signal jawa barat", "signal jabar"],
  123: ["kendaraan tidak muncul signal", "kendaraan atas nama sendiri signal"],
  124: ["kendaraan atas nama orang lain signal", "kendaraan keluarga signal"],
  126: ["verifikasi signal gagal", "signal gagal wajah", "signal wajah buram", "signal gagal selfie", "nik tidak terbaca signal"],
  127: ["signal pajak tahunan", "pajak tahunan lewat signal", "setelah bayar signal pengesahan stnk", "bayar signal masih datang samsat", "pengesahan stnk lewat signal"],
  128: ["signal pajak lima tahunan", "pajak lima tahunan lewat signal", "pajak 5 tahunan signal"],
  129: ["samsat keliling", "layanan keliling"],
  131: ["layanan samsat keliling", "beda samsat keliling samsat induk", "samsat keliling samsat induk", "stnk hilang samsat keliling", "balik nama samsat keliling"],
  132: ["samsat keliling pajak tahunan", "pajak telat samsat keliling", "bayar pajak samsat keliling"],
  133: ["samsat keliling pajak lima tahunan", "ganti plat samsat keliling", "pajak 5 tahunan samsat keliling"],
  134: ["jadwal samsat keliling", "jam samsat keliling"],
  135: ["lokasi samsat keliling", "samsat keliling dimana", "samsat keliling hari ini", "samsat keliling ada dimana"],
  136: ["parkir samsat", "tempat parkir samsat", "samsat punya tempat parkir", "area parking samsat", "parkir motor samsat", "parkir mobil samsat"],
  137: ["ruang tunggu", "bawa anak ruang tunggu"],
  138: ["toilet samsat", "ada toilet", "tersedia toilet", "toilet pengunjung"],
  139: ["mushola samsat", "ada mushola", "tersedia mushola", "mushola dalam samsat"],
  140: ["loket informasi", "cs samsat", "customer service samsat", "tanya informasi samsat", "bingung proses loket"],
  141: ["area cek fisik", "cek fisik masuk lewat mana", "tempat cek fisik"],
  143: ["kendala pembayaran signal", "status belum berubah signal", "uang terpotong pembayaran gagal", "salah nomor polisi aplikasi", "pembayaran pajak gagal", "status signal belum berubah"],
  142: [
    "pengaduan",
    "komplain",
    "pengaduan samsat",
    "keluhan samsat",
    "komplain samsat",
    "komplain layanan samsat",
    "cara komplain layanan samsat",
    "petugas jutek",
    "komplain petugas",
    "lapor petugas"
  ],
  146: ["drive thru", "samsat drive thru"],
  147: ["memiliki drive thru", "tersedia drive thru", "samsat punya drive thru"],
  150: ["syarat drive thru", "dokumen drive thru", "persyaratan drive thru", "berkas drive thru", "bawa berkas drive thru"]
};

// Regex normalisasi menyamakan variasi penulisan sebelum tokenisasi.
// Contoh: "drive-thru" dan "drivethru" disamakan menjadi "drive thru".
const regexNormalizationRules = [
  { pattern: /\b(alamat|alur|biaya|cara|daftar|dokumen|fungsi|jadwal|lokasi|manfaat|mutasi|pajak|proses|syarat)nya\b/g, replacement: "$1" },
  { pattern: /\b(stnk|bpkb|tnkb|pkb|swdkllj)nya\b/g, replacement: "$1" },
  { pattern: /\b(ilang|raib|lenyap)\b/g, replacement: "hilang" },
  { pattern: /\b(blm|belom)\b/g, replacement: "belum" },
  { pattern: /\b(udah)\b/g, replacement: "sudah" },
  { pattern: /\b(ngapain|ngurus|ngurusnya|urusnya|urusan|ngurusin)\b/g, replacement: "cara" },
  { pattern: /\b(kemana)\b/g, replacement: "dimana" },
  { pattern: /\b(pake|pakai|menggunakan)\b/g, replacement: "pakai" },
  { pattern: /\b(bayarin)\b/g, replacement: "bayar" },
  { pattern: /\b(pengen|pingin|ingin)\b/g, replacement: "mau" },
  { pattern: /\b(pindahin|memindahkan|dipindah|dipindahkan)\b/g, replacement: "pindah" },
  { pattern: /\b(dijadikan)\b/g, replacement: "jadi" },
  { pattern: /\b(diganti|mengganti)\b/g, replacement: "ganti" },
  { pattern: /\b(dibalik\s+nama|balik\s+namanya)\b/g, replacement: "balik nama" },
  { pattern: /\b(bedanya)\b/g, replacement: "beda" },
  { pattern: /\b(ngecek|cekkin|cariin|nyari|mencari)\b/g, replacement: "cek" },
  { pattern: /\b(selfie|muka)\b/g, replacement: "wajah" },
  { pattern: /\b(face\s+matching|facematching)\b/g, replacement: "wajah" },
  { pattern: /\b(nongkrong)\b/g, replacement: "lokasi" },
  { pattern: /\b(ketemu|nemu)\b/g, replacement: "ditemukan" },
  { pattern: /\b(kebawa\s+arus|terbawa\s+arus)\b/g, replacement: "hanyut" },
  { pattern: /\b(dendanya)\b/g, replacement: "denda" },
  { pattern: /\b(statusnya)\b/g, replacement: "status" },
  { pattern: /\b(terbaca)\b/g, replacement: "terbaca" },
  { pattern: /\b(nunggak|tunggakan)\b/g, replacement: "menunggak" },
  { pattern: /\b(telat|keterlambatan)\b/g, replacement: "terlambat" },
  { pattern: /\bdrive\s*-?\s*thru\b/g, replacement: "drive thru" },
  { pattern: /\bdrive\s+through\b/g, replacement: "drive thru" },
  { pattern: /\bdrivethru\b/g, replacement: "drive thru" },
  { pattern: /\b(no\s*pol|nopol|nomor\s*polisi|no\s*polisi)\b/g, replacement: "nomor polisi" },
  { pattern: /\b(nmr|nomer|no)\b/g, replacement: "nomor" },
  { pattern: /\b(plat|pelat|platnya|pelatnya)\b/g, replacement: "pelat" },
  { pattern: /\b(non\s*tunai|non-tunai|cashless)\b/g, replacement: "nontunai" },
  { pattern: /\b(lease|leasing)\b/g, replacement: "leasing" },
  { pattern: /\b(luar\s+kota|luar\s+daerah|luar\s+provinsi)\b/g, replacement: "luar daerah" },
  { pattern: /\b(5|lima)\s*(tahun|tahunan)\b/g, replacement: "lima tahunan" },
  { pattern: /\b(e\s*-?\s*samsat|esamsat)\b/g, replacement: "e samsat" },
  { pattern: /\b(samsat\s+digital\s+nasional|signal\s+nasional|sinyal)\b/g, replacement: "signal" },
  { pattern: /\b(samkel)\b/g, replacement: "samsat keliling" },
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
  6: [{ pattern: /\b(tutup|selesai|dilayani).*\b(jam|pukul|operasional|siang)\b|\b(jam|pukul|operasional|siang).*\b(tutup|selesai|dilayani)\b/, label: "regex:samsat tutup", score: 220 }],
  7: [{ pattern: /\b(sabtu).*\b(buka|layanan|operasional)\b|\b(buka|layanan|operasional).*\b(sabtu)\b/, label: "regex:sabtu buka", score: 90 }],
  8: [{ pattern: /\b(minggu|tanggal\s+merah|libur).*\b(buka|layanan|operasional|bayar|pajak)\b|\b(buka|layanan|operasional|bayar|pajak).*\b(minggu|tanggal\s+merah|libur)\b/, label: "regex:minggu buka", score: 150 }],
  10: [{ pattern: /\b(alamat|lokasi|dimana|tempat).*\b(samsat).*\b(bandung\s+timur)\b/, label: "regex:alamat samsat bandung timur", score: 95 }],
  22: [{ pattern: /\b(jatuh\s+tempo|deadline|masa\s+berlaku).*\b(pajak|stnk|kendaraan)\b|\b(pajak|stnk|kendaraan).*\b(jatuh\s+tempo|deadline|masa\s+berlaku)\b/, label: "regex:jatuh tempo pajak", score: 120 }],
  23: [{ pattern: /\b(cek|lihat|periksa).*\b(pajak|pkb|tagihan).*\b(kendaraan|motor|mobil)?\b|\b(tagihan|pajak|pkb).*\b(kendaraan|motor|mobil)?.*\b(cek|lihat|periksa)\b/, label: "regex:cek pajak", score: 115 }],
  26: [{ pattern: /\b(denda|terlambat).*\b(pajak|pkb)\b|\b(pajak|pkb).*\b(denda|terlambat)\b/, label: "regex:denda pajak", score: 125 }],
  27: [{ pattern: /\b(total|besaran|biaya).*\b(pajak|pkb|kendaraan)\b|\b(tagihan).*\b(pajak|pkb|kendaraan).*\b(mahal|besar|lebih)\b|\b(pajak|pkb|kendaraan).*\b(total|besaran|biaya|mahal|besar|lebih)\b/, label: "regex:besaran pajak", score: 145 }],
  28: [{ pattern: /\b(pajak|stnk).*\b(diwakilkan|orang\s+tua|istri|suami|orang\s+lain)\b|\b(diwakilkan|orang\s+tua|istri|suami|orang\s+lain).*\b(pajak|stnk)\b/, label: "regex:pajak diwakilkan", score: 145 }],
  35: [{ pattern: /\b(bayar|pembayaran).*\b(pajak|pkb).*\b(online|digital|signal|e\s+samsat)\b|\b(pajak|pkb).*\b(online|digital|signal|e\s+samsat)\b/, label: "regex:pajak online", score: 95 }],
  42: [{ pattern: /\b(pajak).*\b(stnk).*\b(hilang)\b|\b(stnk).*\b(hilang).*\b(pajak)\b/, label: "regex:pajak stnk hilang", score: 230 }],
  45: [{ pattern: /\b(pajak|pkb).*\b(tahunan)?.*\b(aplikasi|hp|ponsel|signal)\b|\b(aplikasi|hp|ponsel|signal).*\b(pajak|pkb)\b/, label: "regex:pajak aplikasi", score: 155 }],
  30: [{ pattern: /\b(pajak).*\b(lima\s+tahunan)\b|\b(lima\s+tahunan).*\b(pajak)\b/, label: "regex:pajak lima tahunan", score: 70 }],
  33: [{ pattern: /\b(mati|menunggak).*\b(pajak).*\b(tahun|bertahun|lama)\b|\b(pajak).*\b(mati|menunggak).*\b(tahun|bertahun|lama)\b|\b(tahun|bertahun).*\b(pajak).*\b(mati|menunggak)\b/, label: "regex:mati pajak bertahun", score: 170 }],
  39: [{ pattern: /\b(denda).*\b(hitung|dihitung|bulan|berapa|kapan)\b|\b(terlambat).*\b(bulan).*\b(denda)\b/, label: "regex:besaran denda", score: 140 }],
  40: [{ pattern: /\b(pemutihan|keringanan|diskon).*\b(pajak)?\b|\b(program).*\b(pemutihan)\b|\b(bbnkb|bea\s+balik\s+nama|balik\s+nama|biaya).*\b(gratis|bebas|pembebasan)\b|\b(gratis|bebas|pembebasan).*\b(bbnkb|bea\s+balik\s+nama|balik\s+nama|biaya)\b/, label: "regex:pemutihan pajak", score: 260 }],
  43: [{ pattern: /\b(bukti|struk|resi).*\b(pembayaran|bayar|online|pengesahan)\b|\b(pembayaran|bayar|online|pengesahan).*\b(bukti|struk|resi)\b/, label: "regex:bukti pembayaran", score: 130 }],
  47: [{ pattern: /\b(syarat|dokumen|persyaratan|bawa|ktp|fotokopi).*\b(pajak|tahunan)\b|\b(pajak|tahunan).*\b(syarat|dokumen|persyaratan|bawa|ktp|fotokopi)\b/, label: "regex:syarat pajak tahunan", score: 155 }],
  48: [{ pattern: /\b(syarat|dokumen|persyaratan|bawa|kendaraan|cek\s+fisik|ganti\s+pelat|pelat|leasing).*\b(pajak)?.*\b(lima\s+tahunan)\b|\b(lima\s+tahunan|ganti\s+pelat).*\b(pajak)?.*\b(syarat|dokumen|persyaratan|bawa|kendaraan|cek\s+fisik|leasing)\b|\b(ganti\s+pelat).*\b(syarat|cek\s+fisik|habis|mati|menunggak|leasing|bpkb)?\b|\b(waktu|waktunya).*\b(ganti\s+pelat)\b|\b(lima\s+tahunan).*\b(ganti\s+pelat|cek\s+fisik|samsat\s+terdekat|dokumen|bawa)\b/, label: "regex:syarat pajak lima tahunan", score: 250 }],
  54: [{ pattern: /\b(stnk).*\b(hilang|kehilangan|dompet|leasing)\b|\b(hilang|kehilangan|dompet|leasing).*\b(stnk)\b/, label: "regex:stnk hilang", score: 170 }],
  55: [{ pattern: /\b(bpkb).*\b(hilang|kehilangan)\b|\b(hilang|kehilangan).*\b(bpkb)\b/, label: "regex:bpkb hilang", score: 95 }],
  56: [{ pattern: /\b(stnk).*\b(rusak|kebakar|air|banjir|terbaca)\b|\b(rusak|kebakar|air|banjir|terbaca).*\b(stnk)\b/, label: "regex:stnk rusak", score: 145 }],
  62: [{ pattern: /\b(bpkb).*\b(pajak).*\b(lima\s+tahunan)\b|\b(pajak).*\b(lima\s+tahunan).*\b(bpkb)\b/, label: "regex:bpkb pajak lima tahunan", score: 135 }],
  63: [{ pattern: /\b(ktp|alamat).*\b(beda|tidak\s+sesuai).*\b(stnk)\b|\b(stnk).*\b(alamat|ktp).*\b(beda|tidak\s+sesuai)\b/, label: "regex:data stnk sesuai", score: 130 }],
  66: [{ pattern: /\b(tnkb|pelat|nomor\s+polisi).*\b(hilang|rusak|patah|hanyut|dicuri|banjir|baru|ga\s+ada|tidak\s+ada|surut|bengkok|terbaca)\b|\b(hilang|rusak|patah|hanyut|dicuri|banjir|baru|ga\s+ada|tidak\s+ada|surut|bengkok|terbaca).*\b(tnkb|pelat|nomor\s+polisi)\b/, label: "regex:tnkb hilang rusak", score: 280 }],
  73: [
    { pattern: /\b(syarat|dokumen|persyaratan|cara|proses|bekas|seken|second|pemilik\s+lama|pindah\s+tangan|warisan|perusahaan|perorangan).*\b(balik\s+nama)\b|\b(balik\s+nama).*\b(syarat|dokumen|persyaratan|cara|proses|bekas|seken|second|pemilik\s+lama|pindah\s+tangan|warisan|perusahaan|perorangan)\b|\b(perusahaan).*\b(perorangan)\b/, label: "regex:balik nama", score: 130 },
    { pattern: /\b(ktp|pemilik\s+lama|orangnya|kontak).*\b(tidak\s+ada|tidak\s+punya|tidak\s+tahu|susah|dimana).*\b(balik\s+nama|pajak)\b|\b(tidak\s+ada|tidak\s+punya|tidak\s+tahu|susah|dimana).*\b(ktp|pemilik\s+lama|orangnya|kontak).*\b(balik\s+nama|pajak)\b|\b(balik\s+nama|pajak).*\b(ktp|pemilik\s+lama|orangnya|kontak).*\b(tidak\s+ada|tidak\s+punya|tidak\s+tahu|susah|dimana)\b|\b(meninggal|warisan|ayah|bapak).*\b(stnk|bpkb|kendaraan|pajak|balik\s+nama)\b/, label: "regex:balik nama kasus khusus", score: 280 }
  ],
  76: [{ pattern: /\b(balik\s+nama).*\b(diwakilkan|pemilik\s+lama|dihubungi)\b|\b(pemilik\s+lama|dihubungi).*\b(balik\s+nama)\b/, label: "regex:balik nama diwakilkan", score: 130 }],
  82: [{ pattern: /\b(kuitansi|kwitansi|bukti\s+jual\s+beli).*\b(hilang|tidak\s+ada)\b|\b(hilang|tidak\s+ada).*\b(kuitansi|kwitansi|bukti\s+jual\s+beli)\b/, label: "regex:bukti jual beli", score: 145 }],
  85: [{ pattern: /\b(balik\s+nama).*\b(pajak|menunggak)\b|\b(pajak|menunggak).*\b(balik\s+nama)\b/, label: "regex:balik nama pajak", score: 135 }],
  90: [{ pattern: /\b(syarat|dokumen|persyaratan|cara|proses|alur|mau|pindah|domisili|cabut|berkas|pelat\s+luar|luar\s+daerah).*\b(mutasi)\b|\b(mutasi).*\b(syarat|dokumen|persyaratan|cara|proses|alur|pindah|domisili|cabut|berkas|pelat\s+luar|luar\s+daerah)\b|\b(pindah|cabut).*\b(domisili|berkas)\b/, label: "regex:mutasi", score: 115 }],
  92: [{ pattern: /\b(kendaraan|motor|mobil).*\b(dibawa|bawa).*\b(mutasi)\b|\b(mutasi).*\b(kendaraan|motor|mobil).*\b(dibawa|bawa)\b/, label: "regex:kendaraan dibawa mutasi", score: 125 }],
  94: [{ pattern: /\b(mutasi).*\b(bpkb).*\b(asli|ori|original)\b|\b(bpkb).*\b(asli|ori|original).*\b(mutasi)\b/, label: "regex:bpkb asli mutasi", score: 130 }],
  96: [{ pattern: /\b(cabut\s+berkas|berkas|daerah\s+tujuan).*\b(lama|batas|waktu|proses|daftar)\b|\b(proses|lama|batas|waktu|daftar).*\b(cabut\s+berkas|berkas|daerah\s+tujuan)\b/, label: "regex:lama mutasi", score: 175 }],
  98: [{ pattern: /\b(luar\s+daerah|luar\s+kota|jakarta|jawa\s+barat).*\b(bandung|mutasi|pelat|pindah|jadi|pajak|daerah\s+asal)\b|\b(pindah|pelat|pajak).*\b(jakarta|luar\s+daerah|luar\s+kota|jawa\s+barat).*\b(bandung|daerah\s+asal)\b/, label: "regex:kendaraan luar daerah", score: 230 }],
  102: [{ pattern: /\b(mutasi).*\b(online|luar\s+daerah)\b|\b(online).*\b(mutasi)\b/, label: "regex:mutasi online", score: 120 }],
  103: [{ pattern: /\b(apa|pengertian).*\b(cek\s+fisik)\b|\b(cek\s+fisik).*\b(kendaraan|rangka|mesin|cek\s+fisik)\b/, label: "regex:apa cek fisik", score: 145 }],
  105: [{ pattern: /\b(kapan|perlu|wajib|harus|diperlukan).*\b(cek\s+fisik)\b|\b(cek\s+fisik).*\b(kapan|perlu|wajib|harus|diperlukan)\b/, label: "regex:kapan cek fisik", score: 115 }],
  107: [{ pattern: /\b(cek\s+fisik).*\b(wajib|perlu|harus).*\b(mutasi)\b|\b(mutasi).*\b(cek\s+fisik)\b/, label: "regex:cek fisik mutasi", score: 98 }],
  115: [{ pattern: /\b(nomor\s+rangka).*\b(sulit|susah|ditemukan|dicari)\b|\b(sulit|susah|ditemukan|dicari).*\b(nomor\s+rangka)\b/, label: "regex:nomor rangka sulit", score: 135 }],
  117: [{ pattern: /\b(signal|sambara|aplikasi\s+signal)\b/, label: "regex:signal", score: 95 }],
  120: [{ pattern: /\b(daftar|mendaftar|registrasi|cara|akun).*\b(signal)\b|\b(signal).*\b(daftar|mendaftar|registrasi|cara|akun)\b/, label: "regex:daftar signal", score: 125 }],
  121: [{ pattern: /\b(signal).*\b(jawa\s+barat|jabar)\b|\b(jawa\s+barat|jabar).*\b(signal)\b/, label: "regex:signal jawa barat", score: 120 }],
  123: [{ pattern: /\b(kendaraan).*\b(tidak\s+muncul|atas\s+nama\s+sendiri).*\b(signal)\b|\b(signal).*\b(kendaraan).*\b(tidak\s+muncul|atas\s+nama\s+sendiri)\b/, label: "regex:signal kendaraan sendiri", score: 130 }],
  124: [{ pattern: /\b(kendaraan).*\b(orang\s+lain|keluarga).*\b(signal)\b|\b(signal).*\b(kendaraan).*\b(orang\s+lain|keluarga)\b/, label: "regex:signal kendaraan keluarga", score: 130 }],
  126: [{ pattern: /\b(signal).*\b(gagal|verifikasi|wajah|buram|nik|terbaca)\b|\b(gagal|verifikasi|wajah|buram|nik|terbaca).*\b(signal)\b/, label: "regex:verifikasi signal gagal", score: 190 }],
  127: [{ pattern: /\b(signal).*\b(pajak\s+tahunan|pengesahan|datang\s+ke\s+samsat|selesai\s+online)\b|\b(pajak\s+tahunan|pengesahan|datang\s+ke\s+samsat|selesai\s+online).*\b(signal)\b/, label: "regex:signal pajak tahunan", score: 215 }],
  128: [{ pattern: /\b(signal|online).*\b(pajak|pkb)?.*\b(lima\s+tahunan)\b|\b(lima\s+tahunan).*\b(signal|online)\b/, label: "regex:signal pajak lima tahunan", score: 170 }],
  129: [{ pattern: /\b(samsat\s+keliling|layanan\s+keliling)\b/, label: "regex:samsat keliling", score: 95 }],
  131: [{ pattern: /\b(samsat\s+keliling).*\b(layanan|beda|induk|stnk\s+hilang|balik\s+nama)\b|\b(stnk\s+hilang|balik\s+nama|beda).*\b(samsat\s+keliling)\b/, label: "regex:layanan samsat keliling", score: 170 }],
  132: [{ pattern: /\b(samsat\s+keliling).*\b(pajak\s+tahunan|pajak|terlambat|bayar)\b|\b(pajak\s+tahunan|terlambat|bayar).*\b(samsat\s+keliling)\b/, label: "regex:samkel pajak tahunan", score: 175 }],
  133: [{ pattern: /\b(samsat\s+keliling).*\b(lima\s+tahunan|ganti\s+pelat)\b|\b(lima\s+tahunan|ganti\s+pelat).*\b(samsat\s+keliling)\b/, label: "regex:samkel pajak lima tahunan", score: 240 }],
  134: [{ pattern: /\b(jadwal|jam|kapan).*\b(samsat\s+keliling|keliling\s+samsat)\b|\b(samsat\s+keliling|keliling\s+samsat).*\b(jadwal|jam|kapan)\b/, label: "regex:jadwal samsat keliling", score: 155 }],
  135: [{ pattern: /\b(lokasi|dimana|tempat|hari\s+ini).*\b(samsat\s+keliling|keliling\s+samsat)\b|\b(samsat\s+keliling|keliling\s+samsat).*\b(lokasi|dimana|tempat|hari\s+ini)\b/, label: "regex:lokasi samsat keliling", score: 210 }],
  136: [{ pattern: /\b(parkir|tempat\s+parkir|area\s+parkir).*\b(samsat|motor|mobil)?\b/, label: "regex:parkir samsat", score: 220 }],
  137: [{ pattern: /\b(ruang\s+tunggu|tunggu).*\b(anak|samsat)?\b|\b(anak).*\b(ruang\s+tunggu|tunggu)\b/, label: "regex:ruang tunggu", score: 125 }],
  138: [{ pattern: /\b(toilet).*\b(samsat|pengunjung)?\b|\b(samsat|pengunjung).*\b(toilet)\b/, label: "regex:toilet", score: 130 }],
  139: [{ pattern: /\b(mushola|musala).*\b(samsat|dalam)?\b|\b(samsat|dalam).*\b(mushola|musala)\b/, label: "regex:mushola", score: 130 }],
  140: [{ pattern: /\b(loket|cs|informasi|customer\s+service|tanya).*\b(samsat|proses)?\b|\b(samsat|proses).*\b(loket|cs|informasi|customer\s+service|tanya)\b/, label: "regex:loket informasi", score: 130 }],
  141: [{ pattern: /\b(cek\s+fisik).*\b(area|tempat|masuk|lewat)\b|\b(area|tempat|masuk|lewat).*\b(cek\s+fisik)\b/, label: "regex:area cek fisik", score: 220 }],
  143: [{ pattern: /\b(pembayaran|uang).*\b(gagal|terpotong|kendala)\b|\b(gagal|terpotong|kendala).*\b(pembayaran|uang)\b|\b(signal|aplikasi).*\b(status|belum\s+berubah)\b|\b(status|belum\s+berubah).*\b(signal|aplikasi)\b|\b(nomor\s+polisi|aplikasi).*\b(salah)\b|\b(salah).*\b(nomor\s+polisi|aplikasi)\b/, label: "regex:kendala layanan", score: 220 }],
  142: [{ pattern: /\b(pengaduan|keluhan|komplain|lapor|petugas|jutek).*\b(samsat|layanan|petugas)?\b/, label: "regex:pengaduan", score: 110 }],
  146: [{ pattern: /\b(drive\s+thru|drivethru)\b/, label: "regex:drive thru", score: 80 }],
  147: [{ pattern: /\b(memiliki|tersedia|ada|punya).*\b(drive\s+thru|drivethru)\b|\b(drive\s+thru|drivethru).*\b(memiliki|tersedia|ada|punya)\b/, label: "regex:ketersediaan drive thru", score: 130 }],
  150: [{ pattern: /\b(syarat|dokumen|persyaratan|berkas|bawa).*\b(drive\s+thru|drivethru)\b|\b(drive\s+thru|drivethru).*\b(syarat|dokumen|persyaratan|berkas|bawa)\b/, label: "regex:syarat drive thru", score: 135 }]
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
  prosesnya: "proses",
  syaratnya: "syarat",
  daftarnya: "daftar",
  bayarnya: "bayar",
  membayar: "bayar",
  membayarkan: "bayar",
  dibayarkan: "bayar",
  pengesahan: "sah",
  mengesahkan: "sah",
  perpanjangan: "perpanjang",
  memperpanjang: "perpanjang",
  mengurus: "cara",
  urus: "cara",
  pengurusan: "cara",
  mencari: "cek",
  melihat: "cek",
  mengecek: "cek",
  memeriksa: "cek",
  mendaftar: "daftar",
  mendaftarkan: "daftar",
  registrasinya: "registrasi",
  persyaratan: "syarat",
  persyaratannya: "syarat",
  keterlambatan: "terlambat",
  terlambat: "terlambat",
  dihitung: "hitung",
  dendanya: "denda",
  tagihannya: "tagihan",
  statusnya: "status",
  seken: "bekas",
  second: "bekas",
  musala: "mushola"
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
  "signal",
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
  "e samsat",
  "aplikasi signal"
];

const strongDomainPhrases = [
  ...domainAnchorPhrases,
  "pajak tahunan",
  "pajak kendaraan",
  "pajak lima tahunan",
  "pajak mati",
  "mati pajak",
  "pajak sudah mati",
  "pajak juga sudah mati",
  "stnk hilang",
  "bpkb hilang",
  "tnkb hilang",
  "pelat hilang",
  "pelat rusak",
  "pelat luar",
  "ganti pelat",
  "surat kehilangan",
  "samsat asal",
  "samsat terdekat",
  "samsat bandung timur",
  "status pembayaran",
  "uang terpotong"
];

const vehicleInspectionContextTokens = new Set([
  "samsat",
  "pajak",
  "stnk",
  "bpkb",
  "tnkb",
  "mutasi",
  "pelat",
  "kendaraan",
  "motor",
  "mobil",
  "rangka",
  "mesin"
]);

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
  "cek", "periksa", "lihat", "mengetahui", "cari", "fisik", "kendaraan", "mobil", "motor", "wajib", "harus", "perlu",
  "balik", "nama", "mutasi", "pindah", "domisili", "cabut", "pajak", "stnk", "bpkb", "nomor",
  "pelat", "plat", "tnkb", "ganti",
  "rangka", "mesin", "biaya", "tarif", "dimana", "lokasi", "tempat", "alamat",
  "samsat", "hasil", "masa", "berlaku", "baru", "modifikasi", "dimodifikasi",
  "proses", "alur", "cara", "syarat", "persyaratan", "dokumen", "layanan",
  "melayani", "pelayanan", "memerlukan", "diperlukan", "pemilik", "kepemilikan",
  "bawa", "membawa", "dibawa", "diperiksa", "dikenakan", "diwakilkan",
  "masuk",
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
  const hasStrongContext = hasStrongDomainContext(normalizedInput, queryTokens);

  // Satu istilah domain tidak boleh memaksa kecocokan ketika konteks lainnya
  // berasal dari topik berbeda (contoh: "mutasi genetik" atau "pajak cinta").
  if (!hasStrongContext && unknownTokenCount > 0 && knownTokenCount < unknownTokenCount + 3) {
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
    const hasVehicleInspectionContext = queryTokens.some((token) =>
      vehicleInspectionContextTokens.has(token)
    );
    return !hasVehicleInspectionContext && queryTokens.some((token) => !vehicleInspectionTokens.has(token));
  }

  return false;
}

function hasStrongDomainContext(normalizedInput: string, queryTokens: string[]) {
  const anchorCount = new Set(queryTokens.filter((token) => domainAnchorTokens.has(token))).size;
  return anchorCount >= 2 || strongDomainPhrases.some((phrase) => normalizedInput.includes(phrase));
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
  const entryTokens = new Set(expandTokens(tokenize(
    `${entry.question} ${entry.category} ${(customPatterns[entry.id] ?? []).join(" ")}`
  )));
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

  const querySet = new Set(queryTokens);
  const isMatch = basePatternTokens.every((token) => tokenMatchesQuery(token, querySet));

  if (!isMatch) {
    return 0;
  }

  return baseScore + Math.min(basePatternTokens.length * 10, 40);
}

// Memecah teks menjadi kata penting dan membuang stop word.
function tokenize(value: string) {
  return normalize(value)
    .split(" ")
    .map((token) => toCanonicalToken(token))
    .filter((token) => token.length > 1 && !stopWords.has(token));
}

// Menyamakan token hasil tokenisasi ke bentuk kanonis yang dipakai dataset.
function toCanonicalToken(token: string) {
  return tokenAliases[token] ?? token;
}

// Satu token pola dianggap cocok jika input memiliki token yang sama atau
// salah satu sinonimnya. Ini menjaga pola tetap fleksibel tanpa mengharuskan
// seluruh sinonim muncul bersamaan.
function tokenMatchesQuery(patternToken: string, querySet: Set<string>) {
  if (querySet.has(patternToken)) {
    return true;
  }

  return synonymGroups.some((group) => (
    group.includes(patternToken) && group.some((synonym) => querySet.has(synonym))
  ));
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
