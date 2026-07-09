import {
  buildCategoryMessage,
  buildDirectFaqMessage,
  buildFaqMessage,
  buildStartMessage,
  buildQuestionKeyboard,
  buildSatisfactionKeyboard,
  buildUnsupportedMessage,
  buildUnknownMessage,
  mainMenu,
  type SatisfactionChoice,
  type SatisfactionStats
} from "./replies";
import { getCategory, getFaqById, matchFaq } from "./pattern-matcher";

// Daftar environment variable yang dipakai oleh Cloudflare Worker.
interface Env {
  BOT_TOKEN: string;
  WEBHOOK_SECRET?: string;
  TELEGRAM_DRY_RUN?: string;
  MESSAGE_STORE?: KVNamespace;
  RESEARCH_STORE?: KVNamespace;
  ADMIN_EXPORT_TOKEN?: string;
}

interface TelegramUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

// Bentuk data update Telegram yang dipakai oleh bot ini.
interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: TelegramUser;
    chat: { id: number };
    text?: string;
  };
  callback_query?: {
    id: string;
    from?: TelegramUser;
    data?: string;
    message?: {
      message_id: number;
      chat: { id: number };
    };
  };
}

interface ResearchUserRecord {
  telegram_id: number;
  username: string;
  first_name: string;
  last_name: string;
  language_code: string;
  started_at: string;
  last_seen_at: string;
}

interface SatisfactionVoteRecord {
  faq_id: number;
  telegram_id: number;
  choice: SatisfactionChoice;
  updated_at: string;
}

interface SatisfactionExportRow {
  faq_id: number;
  category: string;
  question: string;
  satisfied: number;
  dissatisfied: number;
  total: number;
  satisfied_percent: number;
  dissatisfied_percent: number;
}

interface TelegramApiResponse {
  ok?: boolean;
  result?: boolean | {
    message_id?: number;
  };
}

const maxTrackedMessagesPerChat = 10000;
const trackedMessageIdsByChat = new Map<number, Set<number>>();

export default {
  // Entry point utama Cloudflare Worker untuk menerima request HTTP.
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // GET dipakai untuk health check dan export data riset.
    if (request.method === "GET") {
      if (url.pathname === "/research.csv") {
        return exportResearchCsv(request, env);
      }

      if (url.pathname === "/research.txt") {
        return exportResearchText(request, env);
      }

      if (url.pathname === "/research.html") {
        return exportResearchHtml(request, env);
      }

      if (url.pathname === "/satisfaction.csv") {
        return exportSatisfactionCsv(request, env);
      }

      if (url.pathname === "/satisfaction.txt") {
        return exportSatisfactionText(request, env);
      }

      if (url.pathname === "/satisfaction.html") {
        return exportSatisfactionHtml(request, env);
      }

      return healthResponse(url.pathname);
    }

    // Telegram webhook hanya diterima melalui POST /webhook.
    if (request.method !== "POST" || url.pathname !== "/webhook") {
      return json({ ok: false, error: "Not found" }, 404);
    }

    // BOT_TOKEN wajib ada karena dipakai untuk mengirim balasan ke Telegram.
    if (!env.BOT_TOKEN) {
      return json({ ok: false, error: "BOT_TOKEN is not configured" }, 500);
    }

    // Request ditolak jika secret dari Telegram tidak cocok.
    if (!isAuthorizedTelegramRequest(request, env)) {
      return json({ ok: false, error: "Unauthorized" }, 401);
    }

    // Setelah request valid, data update Telegram diproses oleh handleUpdate().
    const update = await request.json<TelegramUpdate>();
    console.log(
      JSON.stringify({
        event: "telegram_update",
        update_id: update.update_id,
        type: update.message ? "message" : update.callback_query ? "callback_query" : "other",
        has_text: Boolean(update.message?.text),
        callback_data: update.callback_query?.data
      })
    );
    await handleUpdate(update, env, ctx);

    return json({ ok: true });
  }
};

// Memproses update Telegram, baik pesan teks maupun callback dari tombol.
export async function handleUpdate(update: TelegramUpdate, env: Env, ctx?: ExecutionContext) {
  if (update.callback_query) {
    await handleCallback(update.callback_query, env);
    return;
  }

  const message = update.message;
  if (!message) {
    return;
  }

  const chatId = message.chat.id;
  await updateStartedResearchUser(env, message.from);
  await trackMessageId(env, chatId, message.message_id);

  // Bot hanya memproses pesan teks, media akan ditolak dengan pesan singkat.
  if (!isTextMessage(message)) {
    await sendMessage(env, chatId, buildUnsupportedMessage(), mainMenu);
    return;
  }

  const text = message.text;

  // Command clear mencoba menghapus pesan yang sudah dilacak oleh bot.
  if (isClearCommand(text)) {
    await handleClearCommand(env, chatId, message.message_id, ctx);
    return;
  }

  // Command awal langsung menampilkan menu utama.
  if (isStartCommand(text)) {
    await handleStartCommand(env, chatId, message.from);
    return;
  }

  // Pertanyaan bebas dicocokkan dengan dataset FAQ menggunakan pattern matching.
  const result = matchFaq(text);
  if (!result) {
    console.log(JSON.stringify({ event: "pattern_match", matched: false }));
    await sendMessage(env, chatId, buildUnknownMessage(), mainMenu);
    return;
  }

  console.log(
    JSON.stringify({
      event: "pattern_match",
      matched: true,
      faq_id: result.entry.id,
      category: result.entry.category,
      score: result.score
    })
  );
  const stats = await getSatisfactionStats(env, result.entry.id);
  await sendMessage(env, chatId, buildFaqMessage(result, stats), buildSatisfactionKeyboard(result.entry.id, stats));
  await sendMessage(env, chatId, buildStartMessage(), mainMenu);
}

// Endpoint sederhana untuk memastikan Worker aktif.
function healthResponse(pathname: string) {
  if (pathname === "/" || pathname === "/health") {
    return json({
      ok: true,
      service: "samsat-bandung-timur-bot",
      webhook: "/webhook"
    });
  }

  return json({ ok: false, error: "Not found" }, 404);
}

// Memproses tombol inline Telegram seperti kategori dan pilihan FAQ.
async function handleCallback(
  callback: NonNullable<TelegramUpdate["callback_query"]>,
  env: Env
) {
  const chatId = callback.message?.chat.id;
  const messageId = callback.message?.message_id;
  const data = callback.data ?? "";

  await updateStartedResearchUser(env, callback.from);
  await answerCallback(env, callback.id);

  // Callback tanpa chat tidak bisa dibalas.
  if (!chatId) {
    return;
  }

  // Tombol menu mengembalikan user ke daftar kategori utama.
  if (data === "menu") {
    console.log(JSON.stringify({ event: "callback_route", route: "menu" }));
    await editOrSendMessage(env, chatId, messageId, buildStartMessage(), mainMenu);
    return;
  }

  // Callback kategori memiliki format cat:Nama Kategori atau cat:Nama Kategori:Halaman.
  if (data.startsWith("cat:")) {
    const { categoryValue, page } = parseCategoryCallback(data);
    const category = getCategory(categoryValue);
    if (!category) {
      await sendMessage(env, chatId, buildUnknownMessage(), mainMenu);
      return;
    }

    console.log(JSON.stringify({ event: "callback_route", route: "category", category, page }));
    await editOrSendMessage(env, chatId, messageId, buildCategoryMessage(category, page), buildQuestionKeyboard(category, page));
    return;
  }

  // Callback voting kepuasan memiliki format vote:FAQ_ID:s atau vote:FAQ_ID:d.
  if (data.startsWith("vote:")) {
    const vote = parseVoteCallback(data);
    if (!vote) {
      await sendMessage(env, chatId, buildUnknownMessage(), mainMenu);
      return;
    }

    const entry = getFaqById(vote.faqId);
    if (!entry) {
      await sendMessage(env, chatId, buildUnknownMessage(), mainMenu);
      return;
    }

    if (!callback.from) {
      await sendMessage(env, chatId, buildUnknownMessage(), mainMenu);
      return;
    }

    const stats = await saveSatisfactionVote(env, vote.faqId, callback.from.id, vote.choice);
    console.log(
      JSON.stringify({
        event: "satisfaction_vote",
        faq_id: vote.faqId,
        telegram_id: callback.from.id,
        choice: vote.choice,
        satisfied: stats.satisfied,
        dissatisfied: stats.dissatisfied
      })
    );
    await editOrSendMessage(
      env,
      chatId,
      messageId,
      buildDirectFaqMessage(entry, stats, vote.choice),
      buildSatisfactionKeyboard(entry.id, stats)
    );
    return;
  }

  // Callback FAQ memiliki format faq:ID.
  if (data.startsWith("faq:")) {
    const entry = getFaqById(Number(data.slice(4)));
    if (!entry) {
      await sendMessage(env, chatId, buildUnknownMessage(), mainMenu);
      return;
    }

    console.log(JSON.stringify({ event: "callback_route", route: "faq", faq_id: entry.id }));
    const stats = await getSatisfactionStats(env, entry.id);
    await editOrSendMessage(env, chatId, messageId, buildDirectFaqMessage(entry, stats), buildSatisfactionKeyboard(entry.id, stats));
    await sendMessage(env, chatId, buildStartMessage(), mainMenu);
  }
}

// Mengenali command pembuka yang menampilkan menu utama.
function isStartCommand(text: string) {
  return ["/start", "/help", "start", "help", "menu", "mulai"].includes(text.toLowerCase().trim());
}

// Mengenali command untuk membersihkan chat.
function isClearCommand(text: string) {
  return ["/clear", "clear", "bersihkan"].includes(text.toLowerCase().trim());
}

// Memastikan input user berupa pesan teks Telegram, bukan foto/video/file/sticker/voice.
function isTextMessage(
  message: NonNullable<TelegramUpdate["message"]>
): message is NonNullable<TelegramUpdate["message"]> & { text: string } {
  return typeof message.text === "string" && message.text.trim().length > 0;
}

// Menampilkan menu utama sekaligus menyimpan profil dasar untuk data riset.
async function handleStartCommand(env: Env, chatId: number, user?: TelegramUser) {
  if (user) {
    await saveResearchUser(env, user, new Date().toISOString(), true);
  }

  await sendMessage(env, chatId, buildStartMessage(), mainMenu);
}

// Membersihkan chat berdasarkan message_id yang benar-benar dilacak oleh bot.
async function handleClearCommand(
  env: Env,
  chatId: number,
  commandMessageId?: number,
  ctx?: ExecutionContext
) {
  await trackMessageId(env, chatId, commandMessageId);

  const messageIds = await getTrackedMessageIds(env, chatId);
  await clearTrackedMessageIds(env, chatId);
  await sendMessage(env, chatId, buildStartMessage(), mainMenu);

  const cleanup = deleteMessagesSafely(env, chatId, messageIds).then((deletedCount) => {
    console.log(
      JSON.stringify({
        event: "clear_chat",
        attempted_count: messageIds.length,
        deleted_count: deletedCount
      })
    );
  });

  if (ctx) {
    ctx.waitUntil(cleanup);
  } else {
    await cleanup;
  }
}

// Mengambil nama kategori dan halaman dari callback kategori.
function parseCategoryCallback(data: string) {
  const value = data.slice(4);
  const separatorIndex = value.lastIndexOf(":");

  if (separatorIndex === -1) {
    return { categoryValue: value, page: 0 };
  }

  const maybePage = Number(value.slice(separatorIndex + 1));
  if (!Number.isInteger(maybePage)) {
    return { categoryValue: value, page: 0 };
  }

  return {
    categoryValue: value.slice(0, separatorIndex),
    page: maybePage
  };
}

// Mengambil FAQ dan pilihan kepuasan dari callback voting.
function parseVoteCallback(data: string): { faqId: number; choice: SatisfactionChoice } | null {
  const [, faqIdValue, choiceValue] = data.split(":");
  const faqId = Number(faqIdValue);

  if (!Number.isInteger(faqId) || faqId <= 0) {
    return null;
  }

  if (choiceValue === "s") {
    return { faqId, choice: "satisfied" };
  }

  if (choiceValue === "d") {
    return { faqId, choice: "dissatisfied" };
  }

  return null;
}

// Memastikan request webhook membawa secret yang sama dengan WEBHOOK_SECRET.
function isAuthorizedTelegramRequest(request: Request, env: Env) {
  if (!env.WEBHOOK_SECRET) {
    return true;
  }

  return request.headers.get("X-Telegram-Bot-Api-Secret-Token") === env.WEBHOOK_SECRET;
}

// Export data user riset dalam format CSV.
async function exportResearchCsv(request: Request, env: Env) {
  const rows = await getAuthorizedResearchRows(request, env);
  if (rows instanceof Response) {
    return rows;
  }

  const csv = buildResearchCsv(rows);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Disposition": 'attachment; filename="telegram-users-research.csv"'
    }
  });
}

// Export data user riset dalam tabel teks agar mudah dibaca lewat terminal.
async function exportResearchText(request: Request, env: Env) {
  const rows = await getAuthorizedResearchRows(request, env);
  if (rows instanceof Response) {
    return rows;
  }

  return new Response(buildResearchTextTable(rows), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

// Export data user riset sebagai HTML table agar mudah dibuka di browser.
async function exportResearchHtml(request: Request, env: Env) {
  const rows = await getAuthorizedResearchRows(request, env);
  if (rows instanceof Response) {
    return rows;
  }

  return new Response(buildResearchHtmlTable(rows), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Disposition": 'inline; filename="telegram-users-research.html"'
    }
  });
}

// Export rekap voting kepuasan dalam format CSV.
async function exportSatisfactionCsv(request: Request, env: Env) {
  const rows = await getAuthorizedSatisfactionRows(request, env);
  if (rows instanceof Response) {
    return rows;
  }

  const csv = buildSatisfactionCsv(rows);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Disposition": 'attachment; filename="faq-satisfaction-research.csv"'
    }
  });
}

// Export rekap voting kepuasan dalam tabel teks.
async function exportSatisfactionText(request: Request, env: Env) {
  const rows = await getAuthorizedSatisfactionRows(request, env);
  if (rows instanceof Response) {
    return rows;
  }

  return new Response(buildSatisfactionTextTable(rows), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

// Export rekap voting kepuasan sebagai HTML table.
async function exportSatisfactionHtml(request: Request, env: Env) {
  const rows = await getAuthorizedSatisfactionRows(request, env);
  if (rows instanceof Response) {
    return rows;
  }

  return new Response(buildSatisfactionHtmlTable(rows), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Disposition": 'inline; filename="faq-satisfaction-research.html"'
    }
  });
}

// Mengambil data riset hanya jika request membawa token admin yang benar.
async function getAuthorizedResearchRows(request: Request, env: Env) {
  if (!env.ADMIN_EXPORT_TOKEN) {
    return json({ ok: false, error: "ADMIN_EXPORT_TOKEN is not configured" }, 500);
  }

  if (request.headers.get("Authorization") !== `Bearer ${env.ADMIN_EXPORT_TOKEN}`) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  if (!env.RESEARCH_STORE) {
    return json({ ok: false, error: "RESEARCH_STORE is not configured" }, 500);
  }

  return listResearchUsers(env);
}

// Mengambil rekap voting hanya jika request membawa token admin yang benar.
async function getAuthorizedSatisfactionRows(request: Request, env: Env) {
  if (!env.ADMIN_EXPORT_TOKEN) {
    return json({ ok: false, error: "ADMIN_EXPORT_TOKEN is not configured" }, 500);
  }

  if (request.headers.get("Authorization") !== `Bearer ${env.ADMIN_EXPORT_TOKEN}`) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  if (!env.RESEARCH_STORE) {
    return json({ ok: false, error: "RESEARCH_STORE is not configured" }, 500);
  }

  return listSatisfactionRows(env);
}

// Mengirim pesan teks ke chat Telegram.
async function sendMessage(
  env: Env,
  chatId: number,
  text: string,
  replyMarkup?: unknown
) {
  const response = await telegramApi(env, "sendMessage", {
    chat_id: chatId,
    text,
    reply_markup: replyMarkup
  });
  await trackMessageId(env, chatId, getTelegramResultMessageId(response));

  return response;
}

// Mengedit pesan menu jika memungkinkan, agar navigasi tombol tidak membuat chat panjang.
async function editOrSendMessage(
  env: Env,
  chatId: number,
  messageId: number | undefined,
  text: string,
  replyMarkup?: unknown
) {
  if (!messageId) {
    return sendMessage(env, chatId, text, replyMarkup);
  }

  try {
    const response = await telegramApi(env, "editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text,
      reply_markup: replyMarkup
    });
    trackMessageIdLocally(chatId, messageId);
    return response;
  } catch (error) {
    console.log(
      JSON.stringify({
        event: "edit_message",
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error"
      })
    );
    return sendMessage(env, chatId, text, replyMarkup);
  }
}

// Memberi tahu Telegram bahwa callback button sudah diterima.
async function answerCallback(env: Env, callbackQueryId: string) {
  return telegramApi(env, "answerCallbackQuery", {
    callback_query_id: callbackQueryId
  });
}

// Menghapus beberapa pesan secara aman tanpa membuat webhook gagal jika Telegram menolak.
async function deleteMessagesSafely(env: Env, chatId: number, messageIds: number[]) {
  let deletedCount = 0;

  const uniqueMessageIds = [...new Set(messageIds)].filter(isPositiveMessageId);

  for (const chunk of chunkMessageIds(uniqueMessageIds, 100)) {
    try {
      await telegramApi(env, "deleteMessages", {
        chat_id: chatId,
        message_ids: chunk
      });
      deletedCount += chunk.length;
    } catch {
      deletedCount += await deleteMessagesIndividually(env, chatId, chunk);
    }
  }

  return deletedCount;
}

// Fallback jika deleteMessages gagal pada satu batch.
async function deleteMessagesIndividually(env: Env, chatId: number, messageIds: number[]) {
  let deletedCount = 0;

  for (const messageId of messageIds) {
    const deleted = await deleteMessageSafely(env, chatId, messageId);
    if (deleted) {
      deletedCount += 1;
    }
  }

  return deletedCount;
}

// Menghapus satu pesan secara aman.
async function deleteMessageSafely(env: Env, chatId: number, messageId: number) {
  try {
    await telegramApi(env, "deleteMessage", {
      chat_id: chatId,
      message_id: messageId
    });
    return true;
  } catch (error) {
    console.log(
      JSON.stringify({
        event: "delete_message",
        ok: false,
        message_id: messageId,
        error: error instanceof Error ? error.message : "Unknown error"
      })
    );
    return false;
  }
}

// Wrapper untuk memanggil Telegram Bot API.
async function telegramApi(env: Env, method: string, body: Record<string, unknown>): Promise<TelegramApiResponse> {
  // Mode dry-run dipakai saat testing agar tidak mengirim pesan sungguhan.
  if (env.TELEGRAM_DRY_RUN === "true") {
    console.log(JSON.stringify({ telegramDryRun: true, method, body }));
    return { ok: true, result: true };
  }

  const response = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.log(JSON.stringify({ event: "telegram_api", method, ok: false, status: response.status }));
    throw new Error(`Telegram API ${method} failed: ${response.status} ${errorText}`);
  }

  console.log(JSON.stringify({ event: "telegram_api", method, ok: true, status: response.status }));
  return response.json<TelegramApiResponse>();
}

// Memperbarui last_seen_at hanya untuk user yang sudah terdaftar lewat /start.
async function updateStartedResearchUser(env: Env, user?: TelegramUser) {
  if (!user || !env.RESEARCH_STORE) {
    return;
  }

  const existing = await env.RESEARCH_STORE.get(getResearchUserKey(user.id));
  if (!existing) {
    return;
  }

  await saveResearchUser(env, user, new Date().toISOString(), false);
}

// Menyimpan data profil Telegram dasar untuk kebutuhan riset.
async function saveResearchUser(env: Env, user: TelegramUser, timestamp: string, isNewStart: boolean) {
  if (!env.RESEARCH_STORE) {
    return;
  }

  const existing = await getResearchUser(env, user.id);
  const record: ResearchUserRecord = {
    telegram_id: user.id,
    username: user.username ?? existing?.username ?? "",
    first_name: user.first_name ?? existing?.first_name ?? "",
    last_name: user.last_name ?? existing?.last_name ?? "",
    language_code: user.language_code ?? existing?.language_code ?? "",
    started_at: isNewStart ? timestamp : existing?.started_at ?? timestamp,
    last_seen_at: timestamp
  };

  await env.RESEARCH_STORE.put(getResearchUserKey(user.id), JSON.stringify(record));
}

// Mengambil satu data user riset dari KV.
async function getResearchUser(env: Env, telegramId: number) {
  const value = await env.RESEARCH_STORE?.get(getResearchUserKey(telegramId));
  if (!value) {
    return null;
  }

  try {
    return normalizeResearchUserRecord(JSON.parse(value));
  } catch {
    return null;
  }
}

// Mengambil semua user riset dari KV.
async function listResearchUsers(env: Env) {
  const records: ResearchUserRecord[] = [];
  let cursor: string | undefined;

  do {
    const result = await env.RESEARCH_STORE!.list({ prefix: "research:user:", cursor });
    cursor = result.list_complete ? undefined : result.cursor;

    for (const key of result.keys) {
      const value = await env.RESEARCH_STORE!.get(key.name);
      if (!value) {
        continue;
      }

      try {
        records.push(normalizeResearchUserRecord(JSON.parse(value)));
      } catch {
        console.log(JSON.stringify({ event: "research_csv", ok: false, key: key.name }));
      }
    }
  } while (cursor);

  return records.sort((a, b) => a.telegram_id - b.telegram_id);
}

// Mengambil semua rekap voting kepuasan FAQ dari KV.
async function listSatisfactionRows(env: Env) {
  const rows: SatisfactionExportRow[] = [];
  let cursor: string | undefined;
  const prefix = "research:faq_stats:";

  do {
    const result = await env.RESEARCH_STORE!.list({ prefix, cursor });
    cursor = result.list_complete ? undefined : result.cursor;

    for (const key of result.keys) {
      const value = await env.RESEARCH_STORE!.get(key.name);
      if (!value) {
        continue;
      }

      const faqId = Number(key.name.slice(prefix.length));
      const entry = getFaqById(faqId);
      if (!entry) {
        continue;
      }

      try {
        const stats = normalizeSatisfactionStats(JSON.parse(value));
        const total = stats.satisfied + stats.dissatisfied;
        const percentages = calculateSatisfactionPercentages(stats);
        rows.push({
          faq_id: faqId,
          category: entry.category,
          question: entry.question,
          satisfied: stats.satisfied,
          dissatisfied: stats.dissatisfied,
          total,
          satisfied_percent: percentages.satisfied,
          dissatisfied_percent: percentages.dissatisfied
        });
      } catch {
        console.log(JSON.stringify({ event: "satisfaction_export", ok: false, key: key.name }));
      }
    }
  } while (cursor);

  return rows.sort((a, b) => a.faq_id - b.faq_id);
}

// Menyamakan record lama/baru agar field CSV selalu lengkap.
function normalizeResearchUserRecord(value: unknown): ResearchUserRecord {
  const record = value as Partial<ResearchUserRecord> & { consented_at?: string };

  return {
    telegram_id: Number(record.telegram_id ?? 0),
    username: record.username ?? "",
    first_name: record.first_name ?? "",
    last_name: record.last_name ?? "",
    language_code: record.language_code ?? "",
    started_at: record.started_at ?? record.consented_at ?? "",
    last_seen_at: record.last_seen_at ?? ""
  };
}

// Menyamakan record voting agar nilai kosong/rusak tetap aman.
function normalizeSatisfactionStats(value: unknown): SatisfactionStats {
  const record = value as Partial<SatisfactionStats>;

  return {
    satisfied: normalizeCount(record.satisfied),
    dissatisfied: normalizeCount(record.dissatisfied)
  };
}

// Mengubah nilai hitungan menjadi bilangan bulat tidak negatif.
function normalizeCount(value: unknown) {
  const count = Number(value ?? 0);
  return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
}

// Membuat isi CSV untuk data profil riset.
function buildResearchCsv(records: ResearchUserRecord[]) {
  const header = [
    "telegram_id",
    "username",
    "first_name",
    "last_name",
    "language_code",
    "started_at",
    "last_seen_at"
  ];
  const rows = records.map((record) => [
    record.telegram_id,
    record.username,
    record.first_name,
    record.last_name,
    record.language_code,
    record.started_at,
    record.last_seen_at
  ]);

  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

// Membuat isi CSV untuk rekap voting kepuasan FAQ.
function buildSatisfactionCsv(records: SatisfactionExportRow[]) {
  const header = [
    "faq_id",
    "category",
    "question",
    "satisfied",
    "dissatisfied",
    "total",
    "satisfied_percent",
    "dissatisfied_percent"
  ];
  const rows = records.map((record) => [
    record.faq_id,
    record.category,
    record.question,
    record.satisfied,
    record.dissatisfied,
    record.total,
    record.satisfied_percent,
    record.dissatisfied_percent
  ]);

  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

// Membuat tabel teks agar data riset nyaman dibaca di terminal.
function buildResearchTextTable(records: ResearchUserRecord[]) {
  const table = buildResearchDisplayRows(records);
  const widths = table[0].map((_, columnIndex) =>
    Math.max(...table.map((row) => visibleLength(row[columnIndex])))
  );

  return table
    .map((row, rowIndex) => {
      const line = row.map((cell, columnIndex) => padRight(cell, widths[columnIndex])).join("  ");
      const divider = widths.map((width) => "-".repeat(width)).join("  ");

      return rowIndex === 0 ? `${line}\n${divider}` : line;
    })
    .join("\n") + "\n";
}

// Membuat tabel teks rekap voting kepuasan FAQ.
function buildSatisfactionTextTable(records: SatisfactionExportRow[]) {
  const table = buildSatisfactionDisplayRows(records);
  const widths = table[0].map((_, columnIndex) =>
    Math.max(...table.map((row) => visibleLength(row[columnIndex])))
  );

  return table
    .map((row, rowIndex) => {
      const line = row.map((cell, columnIndex) => padRight(cell, widths[columnIndex])).join("  ");
      const divider = widths.map((width) => "-".repeat(width)).join("  ");

      return rowIndex === 0 ? `${line}\n${divider}` : line;
    })
    .join("\n") + "\n";
}

// Membuat HTML table untuk laporan data riset.
function buildResearchHtmlTable(records: ResearchUserRecord[]) {
  const [header, ...rows] = buildResearchDisplayRows(records);
  const headerCells = header.map((cell) => `<th>${escapeHtml(cell)}</th>`).join("");
  const bodyRows = rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
    .join("");

  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Data Riset Chatbot SAMSAT Bandung Timur</title>
  <style>
    :root {
      color-scheme: light;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #172026;
      background: #f6f8fb;
    }

    body {
      margin: 0;
      padding: 32px;
    }

    main {
      max-width: 1180px;
      margin: 0 auto;
    }

    h1 {
      margin: 0 0 6px;
      font-size: 26px;
      line-height: 1.2;
    }

    p {
      margin: 0 0 20px;
      color: #5b6673;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      overflow: hidden;
      background: #ffffff;
      border: 1px solid #d9e1ea;
    }

    th,
    td {
      padding: 11px 12px;
      border-bottom: 1px solid #e6ecf2;
      text-align: left;
      white-space: nowrap;
      font-size: 14px;
    }

    th {
      background: #eaf1f8;
      font-weight: 700;
    }

    tr:last-child td {
      border-bottom: 0;
    }

    .table-wrap {
      overflow-x: auto;
    }
  </style>
</head>
<body>
  <main>
    <h1>Data Riset Chatbot SAMSAT Bandung Timur</h1>
    <p>Total responden: ${records.length}. Waktu ditampilkan dalam WIB.</p>
    <div class="table-wrap">
      <table>
        <thead><tr>${headerCells}</tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>
  </main>
</body>
</html>
`;
}

// Membuat HTML table untuk rekap voting kepuasan FAQ.
function buildSatisfactionHtmlTable(records: SatisfactionExportRow[]) {
  const [header, ...rows] = buildSatisfactionDisplayRows(records);
  const headerCells = header.map((cell) => `<th>${escapeHtml(cell)}</th>`).join("");
  const bodyRows = rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
    .join("");

  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Rekap Kepuasan Jawaban FAQ</title>
  <style>
    :root {
      color-scheme: light;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #172026;
      background: #f6f8fb;
    }

    body {
      margin: 0;
      padding: 32px;
    }

    main {
      max-width: 1180px;
      margin: 0 auto;
    }

    h1 {
      margin: 0 0 6px;
      font-size: 26px;
      line-height: 1.2;
    }

    p {
      margin: 0 0 20px;
      color: #5b6673;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      overflow: hidden;
      background: #ffffff;
      border: 1px solid #d9e1ea;
    }

    th,
    td {
      padding: 11px 12px;
      border-bottom: 1px solid #e6ecf2;
      text-align: left;
      white-space: nowrap;
      font-size: 14px;
    }

    th {
      background: #eaf1f8;
      font-weight: 700;
    }

    tr:last-child td {
      border-bottom: 0;
    }

    .table-wrap {
      overflow-x: auto;
    }
  </style>
</head>
<body>
  <main>
    <h1>Rekap Kepuasan Jawaban FAQ</h1>
    <p>Total FAQ yang sudah dinilai: ${records.length}.</p>
    <div class="table-wrap">
      <table>
        <thead><tr>${headerCells}</tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>
  </main>
</body>
</html>
`;
}

// Membuat baris tampilan dengan label kolom yang lebih ramah dibaca.
function buildResearchDisplayRows(records: ResearchUserRecord[]) {
  return [
    [
      "Telegram ID",
      "Username",
      "Nama",
      "Bahasa",
      "Mulai (WIB)",
      "Terakhir Aktif (WIB)"
    ],
    ...records.map((record) => [
      String(record.telegram_id),
      record.username ? `@${record.username}` : "-",
      [record.first_name, record.last_name].filter(Boolean).join(" ") || "-",
      record.language_code || "-",
      formatJakartaTime(record.started_at),
      formatJakartaTime(record.last_seen_at)
    ])
  ];
}

// Membuat baris tampilan rekap voting kepuasan.
function buildSatisfactionDisplayRows(records: SatisfactionExportRow[]) {
  return [
    [
      "FAQ ID",
      "Kategori",
      "Pertanyaan",
      "Memuaskan",
      "Tidak Memuaskan",
      "Total",
      "Memuaskan (%)",
      "Tidak Memuaskan (%)"
    ],
    ...records.map((record) => [
      String(record.faq_id),
      record.category,
      record.question,
      String(record.satisfied),
      String(record.dissatisfied),
      String(record.total),
      `${record.satisfied_percent}%`,
      `${record.dissatisfied_percent}%`
    ])
  ];
}

// Menghitung persentase voting kepuasan untuk laporan.
function calculateSatisfactionPercentages(stats: SatisfactionStats) {
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

// Escape nilai agar aman untuk format CSV.
function csvCell(value: string | number) {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// Format timestamp ISO ke zona waktu Indonesia Barat.
function formatJakartaTime(value: string) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta"
  }).format(date);
}

// Menghitung panjang teks sederhana untuk padding tabel terminal.
function visibleLength(value: string) {
  return value.length;
}

// Menambahkan spasi kanan untuk merapikan kolom tabel terminal.
function padRight(value: string, width: number) {
  return value + " ".repeat(Math.max(0, width - visibleLength(value)));
}

// Escape teks agar aman dimasukkan ke HTML.
function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Key penyimpanan data user riset.
function getResearchUserKey(telegramId: number) {
  return `research:user:${telegramId}`;
}

// Menyimpan pilihan voting user dan mengembalikan total kepuasan terbaru.
async function saveSatisfactionVote(
  env: Env,
  faqId: number,
  telegramId: number,
  choice: SatisfactionChoice
) {
  const stats = await getSatisfactionStats(env, faqId);
  const previousVote = await getSatisfactionVote(env, faqId, telegramId);

  if (previousVote?.choice === choice) {
    return stats;
  }

  if (previousVote?.choice === "satisfied") {
    stats.satisfied = Math.max(0, stats.satisfied - 1);
  }

  if (previousVote?.choice === "dissatisfied") {
    stats.dissatisfied = Math.max(0, stats.dissatisfied - 1);
  }

  if (choice === "satisfied") {
    stats.satisfied += 1;
  } else {
    stats.dissatisfied += 1;
  }

  if (!env.RESEARCH_STORE) {
    return stats;
  }

  const timestamp = new Date().toISOString();
  const voteRecord: SatisfactionVoteRecord = {
    faq_id: faqId,
    telegram_id: telegramId,
    choice,
    updated_at: timestamp
  };

  await env.RESEARCH_STORE.put(getSatisfactionStatsKey(faqId), JSON.stringify(stats));
  await env.RESEARCH_STORE.put(getSatisfactionVoteKey(faqId, telegramId), JSON.stringify(voteRecord));

  return stats;
}

// Mengambil total voting kepuasan untuk satu FAQ.
async function getSatisfactionStats(env: Env, faqId: number): Promise<SatisfactionStats> {
  const emptyStats = { satisfied: 0, dissatisfied: 0 };
  const value = await env.RESEARCH_STORE?.get(getSatisfactionStatsKey(faqId));
  if (!value) {
    return emptyStats;
  }

  try {
    return normalizeSatisfactionStats(JSON.parse(value));
  } catch {
    return emptyStats;
  }
}

// Mengambil pilihan terakhir user untuk satu FAQ agar vote tidak dobel.
async function getSatisfactionVote(env: Env, faqId: number, telegramId: number) {
  const value = await env.RESEARCH_STORE?.get(getSatisfactionVoteKey(faqId, telegramId));
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<SatisfactionVoteRecord>;
    if (parsed.choice === "satisfied" || parsed.choice === "dissatisfied") {
      return parsed as SatisfactionVoteRecord;
    }
  } catch {
    return null;
  }

  return null;
}

// Key total voting kepuasan per FAQ.
function getSatisfactionStatsKey(faqId: number) {
  return `research:faq_stats:${faqId}`;
}

// Key pilihan terakhir user per FAQ.
function getSatisfactionVoteKey(faqId: number, telegramId: number) {
  return `research:faq_vote:${faqId}:${telegramId}`;
}

// Menyimpan message_id agar bisa dibersihkan lewat command /clear.
async function trackMessageId(env: Env, chatId: number, messageId?: number) {
  if (!isPositiveMessageId(messageId)) {
    return;
  }

  const messageIds = new Set(await getTrackedMessageIds(env, chatId));
  messageIds.add(messageId);

  while (messageIds.size > maxTrackedMessagesPerChat) {
    const oldest = Math.min(...messageIds);
    messageIds.delete(oldest);
  }

  setTrackedMessageIdsLocally(chatId, messageIds);
  await env.MESSAGE_STORE?.put(getMessageStoreKey(chatId), JSON.stringify([...messageIds]));
}

// Mengambil message_id yang sudah dilacak dari KV dan memori runtime.
async function getTrackedMessageIds(env: Env, chatId: number) {
  const memoryIds = trackedMessageIdsByChat.get(chatId) ?? new Set<number>();
  const kvIds = await getTrackedMessageIdsFromKv(env, chatId);

  return [...new Set([...kvIds, ...memoryIds])].sort((a, b) => b - a);
}

// Mengambil message_id dari Cloudflare KV jika binding tersedia.
async function getTrackedMessageIdsFromKv(env: Env, chatId: number) {
  const value = await env.MESSAGE_STORE?.get(getMessageStoreKey(chatId));
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((messageId): messageId is number => Number.isInteger(messageId) && messageId > 0)
      : [];
  } catch {
    return [];
  }
}

// Menghapus daftar message_id setelah command /clear selesai.
async function clearTrackedMessageIds(env: Env, chatId: number) {
  trackedMessageIdsByChat.delete(chatId);
  await env.MESSAGE_STORE?.delete(getMessageStoreKey(chatId));
}

// Membagi message_id menjadi batch sesuai batas deleteMessages Telegram.
function chunkMessageIds(messageIds: number[], size: number) {
  const chunks: number[][] = [];

  for (let index = 0; index < messageIds.length; index += size) {
    chunks.push(messageIds.slice(index, index + size));
  }

  return chunks;
}

// Key penyimpanan message_id per chat.
function getMessageStoreKey(chatId: number) {
  return `chat:${chatId}:message_ids`;
}

// Memastikan message_id valid sebelum disimpan atau dikirim ke Telegram API.
function isPositiveMessageId(messageId: unknown): messageId is number {
  return Number.isInteger(messageId) && Number(messageId) > 0;
}

// Mengambil message_id dari response sendMessage Telegram.
function getTelegramResultMessageId(response: TelegramApiResponse) {
  return typeof response.result === "object" ? response.result.message_id : undefined;
}

// Menyimpan message_id ke memori runtime tanpa menulis ulang ke KV.
function trackMessageIdLocally(chatId: number, messageId?: number) {
  if (!isPositiveMessageId(messageId)) {
    return;
  }

  const messageIds = trackedMessageIdsByChat.get(chatId) ?? new Set<number>();
  messageIds.add(messageId);
  setTrackedMessageIdsLocally(chatId, messageIds);
}

// Menyimpan daftar message_id di memori runtime.
function setTrackedMessageIdsLocally(chatId: number, messageIds: Set<number>) {
  trackedMessageIdsByChat.set(chatId, messageIds);
}

// Helper untuk membuat response JSON yang konsisten.
function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store"
    }
  });
}
