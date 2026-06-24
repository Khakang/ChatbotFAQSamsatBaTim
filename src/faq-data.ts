import faqEntriesJson from "./data/faq-samsat-bandung-timur.json";

// Daftar kategori resmi yang dipakai oleh dataset FAQ.
export const faqCategories = [
  "Layanan",
  "Pajak",
  "Dokumen",
  "Balik Nama",
  "Mutasi",
  "Cek Fisik",
  "SIGNAL",
  "Samsat Keliling",
  "Fasilitas",
  "Pengaduan"
] as const;

export type FaqCategory = (typeof faqCategories)[number];

// Struktur satu baris data FAQ.
export interface FaqEntry {
  id: number;
  category: FaqCategory;
  question: string;
  answer: string;
  source: string;
}

const categorySet = new Set<string>(faqCategories);

// Memuat dataset JSON dan memastikan setiap kategori valid.
export const faqEntries: FaqEntry[] = faqEntriesJson.map((entry) => {
  if (!categorySet.has(entry.category)) {
    throw new Error(`Invalid FAQ category: ${entry.category}`);
  }

  return entry as FaqEntry;
});
