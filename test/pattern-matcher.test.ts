import { describe, expect, it } from "vitest";
import { faqEntries } from "../src/faq-data";
import { getCategory, getEntriesByCategory, matchFaq } from "../src/pattern-matcher";

describe("FAQ dataset", () => {
  it("memiliki 233 baris FAQ yang diimpor", () => {
    expect(faqEntries).toHaveLength(233);
  });

  it.each([
    ["Layanan", 35],
    ["Pajak", 40],
    ["Dokumen", 30],
    ["Balik Nama", 25],
    ["Mutasi", 25],
    ["Cek Fisik", 20],
    ["SIGNAL", 20],
    ["Samsat Keliling", 15],
    ["Fasilitas", 13],
    ["Pengaduan", 10]
  ] as const)("memetakan kategori %s ke %s baris", (category, count) => {
    expect(getEntriesByCategory(category)).toHaveLength(count);
  });
});

describe("matchFaq", () => {
  it.each([
    ["alamat samsat bandung timur", 10, "Layanan"],
    ["samsat buka hari sabtu?", 7, "Layanan"],
    ["syarat bayar pajak kendaraan", 64, "Pajak"],
    ["bisa bayar pajak online?", 45, "Pajak"],
    ["stnk saya hilang", 76, "Dokumen"],
    ["dokumen balik nama", 105, "Balik Nama"],
    ["alur mutasi kendaraan", 136, "Mutasi"],
    ["jadwal samsat keliling", 196, "Samsat Keliling"],
    ["cek fisik kendaraan", 151, "Cek Fisik"],
    ["antrian samsat ramai", 26, "Layanan"]
  ] as const)("mencocokkan %s", (input, expectedId, expectedCategory) => {
    const result = matchFaq(input);

    expect(result?.entry.id).toBe(expectedId);
    expect(result?.entry.category).toBe(expectedCategory);
  });

  it("mengembalikan null jika tidak ada pola FAQ yang cukup cocok", () => {
    expect(matchFaq("halo admin selamat pagi")).toBeNull();
  });

  it("menolak pertanyaan di luar konteks yang hanya memuat satu kata mirip FAQ", () => {
    expect(matchFaq("Kalau begitu syarat saya mencitai dia?")).toBeNull();
    expect(matchFaq("Kalau begitu apa saja kekurangan dari bot ini?")).toBeNull();
  });

  it("tetap mencocokkan pertanyaan domain yang singkat", () => {
    const result = matchFaq("Kalau mau mutasi?");

    expect(result?.entry.question).toBe("Apa itu mutasi kendaraan");
    expect(result?.entry.category).toBe("Mutasi");
  });
});

describe("getCategory", () => {
  it("menormalisasi label callback kategori", () => {
    expect(getCategory("samsat keliling")).toBe("Samsat Keliling");
  });
});
