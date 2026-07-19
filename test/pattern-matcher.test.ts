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

  it.each([
    ["stnk ilang harus ngapain ya", 54, "Dokumen"],
    ["stnk raib kebawa banjir gimana min", 54, "Dokumen"],
    ["bpkb lenyap entah kemana urusnya gimana", 55, "Dokumen"],
    ["motor mati pajak 3 tahun masih bisa dibayar?", 33, "Pajak"],
    ["telat pajak motor lama banget dendanya gimana", 26, "Pajak"],
    ["pajak motor mau bayar tapi stnk hilang duluan", 42, "Pajak"],
    ["beli motor bekas tapi nama masih pemilik lama harus apa", 73, "Balik Nama"],
    ["motor bekas belum balik nama pajaknya gimana", 85, "Balik Nama"],
    ["plat luar kota mau pindah ke bandung timur gimana", 98, "Mutasi"],
    ["cabut berkas motor ke domisili baru apa aja", 90, "Mutasi"],
    ["gesek rangka mesin buat apa sih", 103, "Cek Fisik"],
    ["nomor rangka susah dicari gimana", 115, "Cek Fisik"],
    ["signal gagal selfie wajah buram harus apa", 126, "SIGNAL"],
    ["mau daftar signal tapi verifikasi muka gagal", 126, "SIGNAL"],
    ["pajak tahunan pake hp aplikasi apa", 45, "Pajak"],
    ["samsat keliling hari ini nongkrong dimana", 135, "Samsat Keliling"],
    ["toilet di samsat ada ga", 138, "Fasilitas"],
    ["mushola ada ga kalau nunggu pajak", 139, "Fasilitas"],
    ["petugas jutek komplain kemana", 142, "Pengaduan"],
    ["drive thru bawa berkas apa aja", 150, "Layanan"]
  ] as const)("mencocokkan pertanyaan aneh tapi masih terkait Samsat: %s", (input, expectedId, expectedCategory) => {
    const result = matchFaq(input);

    expect(result?.entry.id).toBe(expectedId);
    expect(result?.entry.category).toBe(expectedCategory);
  });

  it.each([
    ["deadline pajak motor kapan sih", 22, "Pajak"],
    ["cariin tagihan pkb motor dong", 23, "Pajak"],
    ["pajak telat apakah kena denda", 26, "Pajak"],
    ["mau bayar pkb online lewat e-samsat", 35, "Pajak"],
    ["stnknya raib cara urus gimana", 54, "Dokumen"],
    ["bpkbnya ilang ngurus dimana", 55, "Dokumen"],
    ["dokumen apa bwt balik nama motor second", 73, "Balik Nama"],
    ["motor seken pajaknya nunggak bisa balik nama ga", 85, "Balik Nama"],
    ["pelat luar daerah mau cabut berkas", 98, "Mutasi"],
    ["motor wajib dibawa pas mutasi?", 92, "Mutasi"],
    ["mutasi perlu bpkb ori ga", 94, "Mutasi"],
    ["cek fisik itu buat gesek mesin doang?", 103, "Cek Fisik"],
    ["kapan kendaraan harus cek fisik", 105, "Cek Fisik"],
    ["nomer rangka susah ketemu", 115, "Cek Fisik"],
    ["bikin akun sinyal gimana", 120, "SIGNAL"],
    ["signal bisa dipakai di jabar?", 121, "SIGNAL"],
    ["face matching signal error kenapa", 126, "SIGNAL"],
    ["jadwal samkel hari ini ada dimana", 135, "Samsat Keliling"],
    ["ada cs atau loket informasi di samsat?", 140, "Fasilitas"],
    ["drive through bawa apa aja", 150, "Layanan"]
  ] as const)("mencocokkan slang, singkatan, dan imbuhan: %s", (input, expectedId, expectedCategory) => {
    const result = matchFaq(input);

    expect(result?.entry.id).toBe(expectedId);
    expect(result?.entry.category).toBe(expectedCategory);
  });

  it.each([
    ["Motor saya waktunya ganti plat, syaratnya apa aja?", 48, "Pajak"],
    ["Ganti plat harus cek fisik ya?", 48, "Pajak"],
    ["Bisa ganti plat di Samsat Keliling gak?", 133, "Samsat Keliling"],
    ["Mobil masih kredit dan BPKB di leasing, kalau ganti plat gimana?", 48, "Pajak"],
    ["Kalau plat nomor rusak dan tulisannya sudah gak jelas bisa diganti?", 66, "Dokumen"],
    ["Saya sudah bayar lewat SIGNAL tapi statusnya belum berubah.", 143, "Pengaduan"],
    ["Uang sudah terpotong tapi pembayaran pajak gagal, gimana?", 143, "Pengaduan"],
    ["Saya salah memasukkan nomor polisi di aplikasi, gimana?", 143, "Pengaduan"],
    ["Katanya BBNKB kendaraan bekas gratis, kok masih ada biaya?", 40, "Pajak"],
    ["Balik nama gratis itu maksudnya semua biaya gratis?", 40, "Pajak"]
  ] as const)("menjaga intent pertanyaan natural hasil audit: %s", (input, expectedId, expectedCategory) => {
    const result = matchFaq(input);

    expect(result?.entry.id).toBe(expectedId);
    expect(result?.entry.category).toBe(expectedCategory);
  });

  it.each([
    [
      "Min saya kemarin kena musibah banjir, motor sempat terendam dan plat nomor depannya hilang kebawa air, tapi STNK sama BPKB masih ada. Kalau saya mau bikin plat nomor baru itu harus bikin surat kehilangan dari polisi dulu atau bisa langsung datang ke Samsat?",
      66,
      "Dokumen"
    ],
    [
      "Saya mau tanya, beberapa hari lalu motor saya kena banjir dan setelah air surut ternyata STNK yang disimpan di motor sama plat nomornya hilang. Kalau dua-duanya hilang seperti ini saya harus mengurus surat kehilangan dulu atau bagaimana alurnya?",
      66,
      "Dokumen"
    ],
    [
      "Min saya baru beli motor bekas dari orang, tapi ternyata nama di STNK masih pemilik yang sebelumnya lagi dan saya juga tidak punya fotokopi KTP orang yang namanya ada di STNK. Kalau pajaknya sebentar lagi habis saya masih bisa bayar pajak atau harus balik nama dulu?",
      73,
      "Balik Nama"
    ],
    [
      "Saya mau bayar pajak motor punya bapak saya, tapi bapak saya sudah meninggal beberapa waktu lalu dan STNK masih atas nama beliau. Kalau saya sebagai anak mau bayar pajaknya itu bisa langsung atau kendaraannya harus dibalik nama dulu?",
      73,
      "Balik Nama"
    ],
    [
      "Saya sekarang kerja di luar kota dan motor saya ikut dibawa ke tempat saya kerja, tapi sebentar lagi sudah waktunya ganti plat lima tahunan. Apa motornya harus dibawa pulang ke Samsat asal atau bisa cek fisik di Samsat terdekat?",
      48,
      "Pajak"
    ],
    [
      "Saya sekarang sudah tinggal dan kerja di Bandung tapi motor saya masih plat luar Jawa Barat. Kalau saya mau bayar pajak tahunan apakah bisa dilakukan di Samsat Bandung Timur atau harus pulang ke daerah asal kendaraan?",
      98,
      "Mutasi"
    ],
    [
      "Saya punya motor lama yang sudah beberapa tahun tidak dipakai jadi pajaknya juga sudah mati cukup lama. Sekarang motornya mau saya pakai lagi dan saya ingin mengaktifkan surat-suratnya, kira-kira saya harus mulai mengurus dari mana?",
      33,
      "Pajak"
    ],
    [
      "Saya baru pertama kali bayar pajak kendaraan secara online lewat SIGNAL dan pembayarannya sudah berhasil. Tapi saya bingung setelah itu apakah masih harus datang ke Samsat untuk pengesahan STNK atau semuanya sudah selesai secara online?",
      127,
      "SIGNAL"
    ],
    [
      "Min beberapa waktu lalu motor saya mengalami kecelakaan dan plat nomor bagian depannya rusak sampai bengkok dan tulisannya sudah tidak terbaca jelas. Kalau saya mau mengganti dengan plat baru apakah harus menunggu masa ganti plat lima tahunan atau bisa diurus sekarang?",
      66,
      "Dokumen"
    ],
    [
      "Min saya beli motor bekas sekitar dua tahun lalu tapi sampai sekarang belum balik nama dan nama di STNK masih pemilik lama. Sekarang pajaknya sudah telat, sebentar lagi masuk waktu ganti plat lima tahunan, sementara saya sudah tidak punya kontak pemilik sebelumnya dan KTP-nya juga tidak ada. Kalau saya mau membereskan semuanya supaya kendaraan bisa atas nama saya sendiri, saya harus mulai dari proses apa dulu?",
      73,
      "Balik Nama"
    ]
  ] as const)("menangani pertanyaan random panjang hasil stress test: %s", (input, expectedId, expectedCategory) => {
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
