import { describe, expect, it } from "vitest";
import { faqEntries } from "../src/faq-data";
import { getCategory, getEntriesByCategory, matchFaq, normalize } from "../src/pattern-matcher";

describe("FAQ dataset", () => {
  it("memiliki 150 baris FAQ terkurasi yang diimpor", () => {
    expect(faqEntries).toHaveLength(150);
  });

  it.each([
    ["Layanan", 25],
    ["Pajak", 28],
    ["Dokumen", 20],
    ["Balik Nama", 17],
    ["Mutasi", 17],
    ["Cek Fisik", 14],
    ["SIGNAL", 12],
    ["Samsat Keliling", 7],
    ["Fasilitas", 6],
    ["Pengaduan", 4]
  ] as const)("memetakan kategori %s ke %s baris", (category, count) => {
    expect(getEntriesByCategory(category)).toHaveLength(count);
  });
});

describe("matchFaq", () => {
  it("tetap mencocokkan seluruh pertanyaan resmi ke FAQ asalnya", () => {
    for (const entry of faqEntries) {
      expect(matchFaq(entry.question)?.entry.id, entry.question).toBe(entry.id);
    }
  });

  it("tidak fallback saat urutan kata pertanyaan resmi dibalik", () => {
    for (const entry of faqEntries) {
      const reversedQuestion = normalize(entry.question).split(" ").reverse().join(" ");
      const result = matchFaq(reversedQuestion);

      expect(result, reversedQuestion).not.toBeNull();
    }
  });

  it("tidak fallback pada variasi percakapan kalau pertanyaan bagaimana", () => {
    const failures: string[] = [];

    for (const entry of faqEntries) {
      const conversationalQuestion = `Kalau ${entry.question} bagaimana?`;
      const result = matchFaq(conversationalQuestion);

      if (!result) {
        failures.push(conversationalQuestion);
      }
    }

    expect(failures).toEqual([]);
  });

  it.each([
    ["alamat samsat bandung timur", 10, "Layanan"],
    ["samsat buka hari sabtu?", 7, "Layanan"],
    ["Samsat di hari selasa buka jam berapa?", 5, "Layanan"],
    ["Kalau tutup jam berapa?", 6, "Layanan"],
    ["Kalau tutup operasional samsat jam berapa?", 6, "Layanan"],
    ["Kalau Sabtu?", 7, "Layanan"],
    ["Kalau Minggu?", 8, "Layanan"],
    ["Kalau mutasi?", 90, "Mutasi"],
    ["Kalau balik nama?", 73, "Balik Nama"],
    ["Kalau pajak online?", 35, "Pajak"],
    ["Kalau SIGNAL?", 117, "SIGNAL"],
    ["Kalau parkir?", 136, "Fasilitas"],
    ["Kalau komplain?", 142, "Pengaduan"],
    ["syarat bayar pajak kendaraan", 47, "Pajak"],
    ["bisa bayar pajak online?", 35, "Pajak"],
    ["stnk saya hilang", 54, "Dokumen"],
    ["Bagaimana jika stnk hilang?", 54, "Dokumen"],
    ["Kalau stnk hilang bagaimana?", 54, "Dokumen"],
    ["dokumen balik nama", 73, "Balik Nama"],
    ["alur mutasi kendaraan", 90, "Mutasi"],
    ["kalau mau mutasi?", 90, "Mutasi"],
    ["Kalau begitu mobil saya Toyota, kalau mau di mutasi apa syaratnya?", 90, "Mutasi"],
    ["jadwal samsat keliling", 134, "Samsat Keliling"],
    ["apa itu signal", 117, "SIGNAL"]
  ] as const)("mencocokkan %s", (input, expectedId, expectedCategory) => {
    const result = matchFaq(input);

    expect(result?.entry.id).toBe(expectedId);
    expect(result?.entry.category).toBe(expectedCategory);
  });

  it.each([
    ["drive-thru samsat", 146, "Layanan"],
    ["drivethru samsat", 146, "Layanan"],
    ["surat tanda nomor kendaraan hilang", 54, "Dokumen"],
    ["buku pemilik kendaraan bermotor hilang", 55, "Dokumen"],
    ["pajak 5 tahunan", 30, "Pajak"],
    ["pajak lima tahun", 30, "Pajak"],
    ["syarat pajak 5 tahunan", 48, "Pajak"],
    ["cabut berkas kendaraan", 90, "Mutasi"],
    ["pindah domisili kendaraan", 90, "Mutasi"],
    ["gesek rangka kendaraan", 103, "Cek Fisik"]
  ] as const)("mencocokkan variasi regex: %s", (input, expectedId, expectedCategory) => {
    const result = matchFaq(input);

    expect(result?.entry.id).toBe(expectedId);
    expect(result?.entry.category).toBe(expectedCategory);
  });

  it.each([
    ["hilang stnk saya bagaimana", 54, "Dokumen"],
    ["bpkb hilang harus bagaimana", 55, "Dokumen"],
    ["pajak kendaraan bayar syaratnya apa", 47, "Pajak"],
    ["lima tahunan pajak syaratnya apa", 48, "Pajak"],
    ["balik nama kendaraan syaratnya apa", 73, "Balik Nama"],
    ["nama balik dokumen apa saja", 73, "Balik Nama"],
    ["mutasi kendaraan apa saja syaratnya", 90, "Mutasi"],
    ["kendaraan mutasi mau syaratnya apa", 90, "Mutasi"],
    ["fisik cek mutasi wajib tidak", 107, "Cek Fisik"],
    ["keliling samsat jadwalnya kapan", 134, "Samsat Keliling"],
    ["signal daftar caranya gimana", 120, "SIGNAL"],
    ["drive thru syaratnya apa", 150, "Layanan"],
    ["pengaduan layanan samsat bagaimana cara", 142, "Pengaduan"]
  ] as const)("mencocokkan urutan kata yang dibalik: %s", (input, expectedId, expectedCategory) => {
    const result = matchFaq(input);

    expect(result?.entry.id).toBe(expectedId);
    expect(result?.entry.category).toBe(expectedCategory);
  });

  it("mengembalikan null jika tidak ada pola FAQ yang cukup cocok", () => {
    expect(matchFaq("halo admin selamat pagi")).toBeNull();
  });

  it("menjaga skor pertanyaan panjang yang relevan tetap aman", () => {
    const shortQuestion = matchFaq("mutasi");
    const longQuestion = matchFaq("Kalau begitu mobil saya Toyota, kalau mau di mutasi apa syaratnya?");

    expect(shortQuestion?.entry.id).toBe(90);
    expect(longQuestion?.entry.id).toBe(90);
    expect(shortQuestion?.score).toBeGreaterThanOrEqual(75);
    expect(longQuestion?.score).toBeGreaterThanOrEqual(75);
  });

  it.each([
    "Kalau begitu syarat saya mencintai dia?",
    "Kalau begitu apa saja kekurangan dari bot ini?",
    "Kalau saya punya pacar, mobil saya dipinjam pacar, apakah saya harus marah?",
    "Bagaimana cara memasak nasi goreng?",
    "Apakah besok akan hujan?",
    "Siapa presiden Indonesia?",
    "Kenapa laptop saya lambat?",
    "Apa obat untuk sakit kepala?",
    "Berapa hasil 25 dikali 12?",
    "Siapa yang menang pertandingan sepak bola tadi malam?",
    "Mobil saya warna merah, bagusnya diberi nama apa?",
    "Motor saya dipinjam teman, kapan harus diminta kembali?",
    "Apakah tersedia toilet di pusat perbelanjaan?",
    "Lokasi samsat bandung barat?",
    "Apakah cek fisik harus ngegym?",
    "Apa itu mutasi genetik?",
    "Bagaimana cara membayar pajak cinta?",
    "Apakah SIGNAL wifi saya rusak?",
    "STNK adalah singkatan sayang tanpa kenal?"
  ])("menolak pertanyaan di luar topik: %s", (input) => {
    expect(matchFaq(input)).toBeNull();
  });

  it.each([
    ["berapa pajak mobil saya", "Pajak"],
    ["syarat mutasi mobil", "Mutasi"],
    ["bagaimana jika STNK hilang", "Dokumen"],
    ["apa syarat balik nama", "Balik Nama"],
    ["apakah perlu cek fisik", "Cek Fisik"],
    ["dimana lokasi cek fisik kendaraan", "Cek Fisik"],
    ["apakah cek fisik wajib untuk mutasi", "Cek Fisik"],
    ["Apakah tersedia toilet", "Fasilitas"]
  ] as const)("tetap menerima pertanyaan Samsat: %s", (input, category) => {
    expect(matchFaq(input)?.entry.category).toBe(category);
  });

  it.each([
    ["jam buka samsat bandung timur", "Layanan"],
    ["cara cek pajak kendaraan online", "Pajak"],
    ["apa fungsi BPKB", "Dokumen"],
    ["dokumen untuk balik nama mobil", "Balik Nama"],
    ["syarat pindah domisili kendaraan", "Mutasi"],
    ["dimana cek fisik kendaraan", "Cek Fisik"],
    ["cara daftar aplikasi SIGNAL", "SIGNAL"],
    ["layanan samsat keliling apa saja", "Samsat Keliling"],
    ["apakah samsat punya tempat parkir", "Fasilitas"],
    ["cara komplain layanan samsat", "Pengaduan"]
  ] as const)("mengenali variasi kategori Samsat: %s", (input, category) => {
    expect(matchFaq(input)?.entry.category).toBe(category);
  });
});

describe("getCategory", () => {
  it("menormalisasi label callback kategori", () => {
    expect(getCategory("layanan tambahan")).toBe("Layanan Tambahan");
  });
});
