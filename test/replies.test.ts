import { describe, expect, it } from "vitest";
import {
  buildDirectFaqMessage,
  buildFaqMessage,
  buildCategoryMessage,
  buildQuestionKeyboard,
  buildSatisfactionKeyboard,
  buildStartMessage,
  buildUnknownMessage,
  buildUnsupportedMessage,
  mainMenu
} from "../src/replies";

describe("tampilan kategori FAQ", () => {
  it("menampilkan maksimal 7 pertanyaan tanpa nomor ID pada halaman pertama", () => {
    const message = buildCategoryMessage("Mutasi");
    const questionLines = message.split("\n").filter((line) => line.startsWith("- "));
    const keyboard = buildQuestionKeyboard("Mutasi");
    const questionButtons = keyboard.inline_keyboard.filter((row) => row[0]?.callback_data?.startsWith("faq:"));

    expect(questionLines).toHaveLength(7);
    expect(questionLines[0]).toBe("- Apa itu mutasi kendaraan");
    expect(questionLines.some((line) => /^\- \d+\./.test(line))).toBe(false);
    expect(questionButtons).toHaveLength(7);
    expect(questionButtons[0][0].text).toBe("Apa itu mutasi kendaraan");
  });

  it("menampilkan tombol berikutnya dan sebelumnya sesuai halaman kategori", () => {
    const firstPageKeyboard = buildQuestionKeyboard("Mutasi", 0);
    const secondPageKeyboard = buildQuestionKeyboard("Mutasi", 1);

    expect(JSON.stringify(firstPageKeyboard)).toContain("Berikutnya ➡️");
    expect(JSON.stringify(firstPageKeyboard)).not.toContain("⬅️ Sebelumnya");
    expect(JSON.stringify(secondPageKeyboard)).toContain("⬅️ Sebelumnya");
    expect(JSON.stringify(secondPageKeyboard)).toContain("Berikutnya ➡️");
    expect(JSON.stringify(secondPageKeyboard)).toContain("↩️ Kembali ke kategori");
  });

  it("menampilkan icon pada menu kategori utama", () => {
    expect(JSON.stringify(mainMenu)).toContain("cat:Layanan");
    expect(JSON.stringify(mainMenu)).toContain("cat:Pajak");
    expect(JSON.stringify(mainMenu)).toContain("cat:Pengaduan");
  });

  it("menampilkan greeting formal pada pesan pembuka", () => {
    const message = buildStartMessage();

    expect(message).toContain("Selamat datang di Chatbot FAQ SAMSAT Bandung Timur.");
    expect(message).toContain("Silakan pilih kategori atau ketik pertanyaan Anda.");
    expect(message).toContain("Contoh:");
    expect(message).toContain("Ketik /clear untuk membersihkan chat.");
    expect(message).not.toContain("Dataset aktif");
    expect(message).not.toContain("Profil Telegram");
  });
});

describe("format jawaban FAQ", () => {
  it("menampilkan pertanyaan, jawaban, dan sumber pada hasil pattern matching", () => {
    const message = buildFaqMessage({
      entry: {
        id: 999,
        category: "Pajak",
        question: "Syarat bayar pajak",
        answer: "STNK dan KTP",
        source: "Referensi"
      },
      score: 100,
      matchedTerms: ["syarat", "bayar", "pajak"]
    });

    expect(message).toBe("Pertanyaan: Syarat bayar pajak\n\nSTNK dan KTP\n\nSumber: Referensi\n\nPenilaian pengguna:\nBelum ada suara.\nSilakan nilai apakah jawaban ini memuaskan.");
    expect(message).not.toContain("Jawaban:");
    expect(message).not.toContain("Kategori:");
    expect(message).toContain("Pertanyaan:");
    expect(message).not.toContain("Metode:");
    expect(message).not.toContain("rating");
    expect(message).not.toContain("Skor akurasi:");
  });

  it("menampilkan hasil voting kepuasan user", () => {
    const message = buildFaqMessage({
      entry: {
        id: 997,
        category: "Pajak",
        question: "Cek pajak kendaraan",
        answer: "Gunakan kanal resmi untuk mengecek pajak kendaraan.",
        source: "Referensi"
      },
      score: 62,
      matchedTerms: ["pajak"]
    }, { satisfied: 3, dissatisfied: 1 }, "satisfied");

    expect(message).toContain("Hasil voting pengguna:");
    expect(message).toContain("Memuaskan: ████████░░ 75% (3)");
    expect(message).toContain("Tidak memuaskan: ███░░░░░░░ 25% (1)");
    expect(message).toContain("Total suara: 4");
    expect(message).toContain("Pilihan Anda: Memuaskan");
  });

  it("menampilkan pertanyaan, jawaban, dan sumber pada pilihan tombol FAQ", () => {
    const message = buildDirectFaqMessage({
      id: 998,
      category: "Dokumen",
      question: "STNK hilang",
      answer: "Harus lapor polisi",
      source: "Referensi"
    });

    expect(message).toBe("Pertanyaan: STNK hilang\n\nHarus lapor polisi\n\nSumber: Referensi\n\nPenilaian pengguna:\nBelum ada suara.\nSilakan nilai apakah jawaban ini memuaskan.");
    expect(message).not.toContain("Jawaban:");
    expect(message).not.toContain("Kategori:");
    expect(message).toContain("Pertanyaan:");
    expect(message).not.toContain("rating");
    expect(message).not.toContain("Skor akurasi:");
  });

  it("membuat tombol voting kepuasan", () => {
    const keyboard = buildSatisfactionKeyboard(64, { satisfied: 2, dissatisfied: 1 });

    expect(keyboard.inline_keyboard[0][0].text).toBe("👍 Memuaskan 67%");
    expect(keyboard.inline_keyboard[0][0].callback_data).toBe("vote:64:s");
    expect(keyboard.inline_keyboard[0][1].text).toBe("👎 Tidak memuaskan 33%");
    expect(keyboard.inline_keyboard[0][1].callback_data).toBe("vote:64:d");
  });

  it("menampilkan panduan command pada pesan kategori", () => {
    const message = buildCategoryMessage("Pajak");

    expect(message).toContain("/start - tampilkan menu utama");
    expect(message).toContain("/clear - bersihkan chat");
    expect(message).not.toContain("/withdraw");
    expect(message).not.toContain("/consent - ikut data riset");
  });

  it("menampilkan pesan khusus untuk input selain teks", () => {
    const message = buildUnsupportedMessage();

    expect(message).toContain("Bot hanya mendukung pesan teks.");
    expect(message).toContain("/start - tampilkan menu utama");
    expect(message).toContain("/clear - bersihkan chat");
  });

  it("menampilkan fallback khusus untuk pesan di luar topik", () => {
    const message = buildUnknownMessage();

    expect(message).toContain("hanya dapat menjawab pertanyaan seputar layanan SAMSAT Bandung Timur");
    expect(message).toContain("Pesan Anda tidak terkait");
  });
});
