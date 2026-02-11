require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");
const { Pool } = require("pg");

const bot = new Telegraf(process.env.BOT_TOKEN);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const ADMIN_IDS = process.env.ADMIN_IDS
  ? process.env.ADMIN_IDS.split(",").map(id => Number(id.trim()))
  : [];

const isAdmin = (ctx) => ADMIN_IDS.includes(ctx.from?.id);
const normCode = (t) => (t || "").trim().toUpperCase();
const pendingDelete = new Map();

const denyAdmin = (ctx) => {
  if (!isAdmin(ctx)) {
    ctx.reply("⛔ Sizda bu buyruq uchun ruxsat yo‘q.");
    return true;
  }
  return false;
};

// 🔥 TABLES CREATE
(async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS movies (
      code TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      caption TEXT,
      file_id TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      user_id BIGINT PRIMARY KEY,
      first_name TEXT,
      username TEXT,
      joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
})();

// 🔥 USER AUTO SAVE
bot.use(async (ctx, next) => {
  if (ctx.from) {
    await pool.query(
      `INSERT INTO users (user_id, first_name, username)
       VALUES ($1,$2,$3)
       ON CONFLICT (user_id) DO NOTHING`,
      [ctx.from.id, ctx.from.first_name || "", ctx.from.username || ""]
    );
  }
  return next();
});

// START
bot.start((ctx) => {
  if (isAdmin(ctx)) {
    ctx.reply(
      "🎬 Kino bot (ADMIN)\n\n" +
      "Admin buyruqlar:\n" +
      "/add\n/del CODE\n/list\n/get CODE\n/stats\n/myid"
    );
  } else {
    ctx.reply("🎬 Kino kodini yuboring (masalan: A1023)");
  }
});

bot.command("myid", (ctx) =>
  ctx.reply(`Sizning ID: ${ctx.from.id}`)
);

// ADD
bot.command("add", async (ctx) => {
  if (denyAdmin(ctx)) return;

  const raw = ctx.message.text.split(" ").slice(1).join(" ");
  const parts = raw.split("|").map(s => s.trim());

  if (parts.length < 3)
    return ctx.reply("Format:\n/add CODE | TITLE | FILE_ID | CAPTION(optional)");

  const code = normCode(parts[0]);
  const title = parts[1];
  const fileId = parts[2];
  const caption = parts[3] || "";

  await pool.query(
    `INSERT INTO movies(code,title,caption,file_id)
     VALUES($1,$2,$3,$4)
     ON CONFLICT (code)
     DO UPDATE SET
     title=EXCLUDED.title,
     caption=EXCLUDED.caption,
     file_id=EXCLUDED.file_id`,
    [code, title, caption, fileId]
  );

  ctx.reply(`✅ Saqlandi: ${code} — ${title}`);
});

// LIST
bot.command("list", async (ctx) => {
  if (denyAdmin(ctx)) return;

  const result = await pool.query(
    "SELECT code,title FROM movies ORDER BY created_at DESC LIMIT 30"
  );

  if (!result.rows.length) return ctx.reply("Baza bo‘sh.");

  ctx.reply(
    "📌 Oxirgi kinolar:\n" +
    result.rows.map(r => `${r.code} — ${r.title}`).join("\n")
  );
});

// GET
bot.command("get", async (ctx) => {
  if (denyAdmin(ctx)) return;

  const code = normCode(ctx.message.text.split(" ")[1]);
  if (!code) return ctx.reply("Format: /get A1023");

  const result = await pool.query(
    "SELECT * FROM movies WHERE code=$1",
    [code]
  );

  if (!result.rows.length) return ctx.reply("❌ Kod topilmadi.");

  const row = result.rows[0];

  const cap = row.caption
    ? `🎬 ${row.title}\n📌 Kod: ${row.code}\n\n${row.caption}`
    : `🎬 ${row.title}\n📌 Kod: ${row.code}`;

  ctx.replyWithVideo(row.file_id, { caption: cap });
});

// STATS
bot.command("stats", async (ctx) => {
  if (denyAdmin(ctx)) return;

  const movies = await pool.query("SELECT COUNT(*) FROM movies");
  const users = await pool.query("SELECT COUNT(*) FROM users");

  ctx.reply(
    `📊 STATISTIKA\n\n` +
    `🎬 Kinolar: ${movies.rows[0].count}\n` +
    `👥 Foydalanuvchilar: ${users.rows[0].count}`
  );
});

// USER TEXT
bot.on("text", async (ctx) => {
  const code = normCode(ctx.message.text);

  const result = await pool.query(
    "SELECT * FROM movies WHERE code=$1",
    [code]
  );

  if (!result.rows.length)
    return ctx.reply("❌ Kod topilmadi.");

  const row = result.rows[0];

  const cap = row.caption
    ? `🎬 ${row.title}\n📌 Kod: ${row.code}\n\n${row.caption}`
    : `🎬 ${row.title}\n📌 Kod: ${row.code}`;

  ctx.replyWithVideo(row.file_id, { caption: cap });
});

bot.launch();
console.log("🚀 Production bot ishga tushdi");