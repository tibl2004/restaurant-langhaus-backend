const pool = require("../database");
const stringSimilarity = require("string-similarity");

const express = require("express");
const router = express.Router();

/* =====================================================
   🔎 NORMALISIERUNG
===================================================== */
function normalizeText(text = "") {
  return text
    .toLowerCase()
    .replace(/[@$€0]/g, "o")
    .replace(/1/g, "i")
    .replace(/3/g, "e")
    .replace(/[^a-zäöüß]/g, "");
}

/* =====================================================
   🚫 VERBOTENE WÖRTER
===================================================== */
const bannedWords = [
  "idiot","arschloch","hurensohn","wichser","fotze","spast",
  "missgeburt","mongo","bastard","nutte","hure","opfer",
  "penner","schlampe","trottel","vollidiot","dummkopf",
  "ficker","motherfucker","fuck","scheisse","scheiß",
  "pisser","kacke","abschaum",
  "sex","porno","porn","nackt","ficken","blasen","anal",
  "oral","vagina","penis","schwanz","titten","brüste",
  "orgasmus","ejakul","masturb","wichs","cum",
  "kindersex","pedo","pedophil","lolita","teensex"
];

/* =====================================================
   🧠 REGEX
===================================================== */
const bannedRegex = [
  /f+u+c+k+/i,
  /f+i+c+k+e+n/i,
  /s+e+x+/i,
  /a+r+s+c+h+/i,
  /p+o+r+n+/i,
  /w+i+c+h+s+/i
];

/* =====================================================
   🚨 CHECK
===================================================== */
function containsInsult(text = "") {
  if (!text) return false;
  const normalized = normalizeText(text);
  return (
    bannedWords.some(w => normalized.includes(normalizeText(w))) ||
    bannedRegex.some(rx => rx.test(text))
  );
}

/* =====================================================
   🤖 CONTROLLER
===================================================== */
const chatbotController = {

  /* ===============================
     📥 CRUD
  =============================== */
  getAllAnswers: async (req, res) => {
    try {
      const [rows] = await pool.query("SELECT * FROM chatbot_answers");
      res.json({ data: rows });
    } catch (err) {
      console.error(err);
      res.status(500).json({ status: "error" });
    }
  },

  createAnswer: async (req, res) => {
    try {
      const { question, reply, synonyms } = req.body;
      await pool.query(
        "INSERT INTO chatbot_answers (question, reply, synonyms) VALUES (?, ?, ?)",
        [question, reply, JSON.stringify(synonyms || [])]
      );
      res.json({ status: "success" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ status: "error" });
    }
  },

  updateAnswer: async (req, res) => {
    try {
      const { id } = req.params;
      const { question, reply, synonyms } = req.body;
      await pool.query(
        "UPDATE chatbot_answers SET question=?, reply=?, synonyms=? WHERE id=?",
        [question, reply, JSON.stringify(synonyms || []), id]
      );
      res.json({ status: "success" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ status: "error" });
    }
  },

  deleteAnswer: async (req, res) => {
    try {
      await pool.query("DELETE FROM chatbot_answers WHERE id=?", [req.params.id]);
      res.json({ status: "success" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ status: "error" });
    }
  },

  /* ===============================
     💬 CHAT
  =============================== */
  findAnswer: async (req, res) => {
    try {
      const userQuestion = (req.body.question || "").trim();

      const ip =
        req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
        req.socket.remoteAddress ||
        "unknown";

      console.log("📨 CHAT:", ip, userQuestion);

      /* =====================================
         0️⃣ BEGRÜSSUNG (IMMER ZUERST)
      ===================================== */
      if (!userQuestion || userQuestion === "__INIT__") {
        return res.json({
          status: "welcome",
          reply: "👋 Hallo! Wie kann ich Ihnen helfen?"
        });
      }

      /* =====================================
         1️⃣ ZUERST TEXT PRÜFEN
      ===================================== */
      if (containsInsult(userQuestion)) {

        await pool.query(
          "INSERT INTO chat_reports (ip_address, message) VALUES (?, ?)",
          [ip, userQuestion]
        );

        await pool.query(
          `INSERT INTO chat_bans (ip_address, banned_until)
           VALUES (?, DATE_ADD(NOW(), INTERVAL 15 MINUTE))
           ON DUPLICATE KEY UPDATE banned_until = DATE_ADD(NOW(), INTERVAL 15 MINUTE)`,
          [ip]
        );

        return res.json({
          status: "blocked",
          reply: "⚠️ Deine Nachricht verstößt gegen die Chatregeln. 15 Minuten Sperre."
        });
      }

      /* =====================================
         2️⃣ DANN SPERRE PRÜFEN
      ===================================== */
      const [ban] = await pool.query(
        "SELECT 1 FROM chat_bans WHERE ip_address=? AND banned_until > NOW()",
        [ip]
      );

      if (ban.length) {
        return res.json({
          status: "banned",
          reply: "🚫 Du bist aktuell gesperrt."
        });
      }

      /* =====================================
         3️⃣ NORMALE BOT-ANTWORT
      ===================================== */
      const [answers] = await pool.query("SELECT * FROM chatbot_answers");

      let bestMatch = null;
      let bestScore = 0;

      for (const a of answers) {
        let synonyms = [];
        try { synonyms = JSON.parse(a.synonyms); } catch {}

        const variants = [a.question, ...synonyms];

        for (const v of variants) {
          if (!v) continue;

          const score = stringSimilarity.compareTwoStrings(
            userQuestion.toLowerCase(),
            v.toLowerCase()
          );

          if (score > bestScore) {
            bestScore = score;
            bestMatch = a;
          }
        }
      }

      if (bestMatch && bestScore > 0.5) {
        return res.json({
          status: "success",
          reply: bestMatch.reply
        });
      }

      return res.json({
        status: "unknown",
        reply: "🤔 Das habe ich leider nicht verstanden."
      });

    } catch (err) {
      console.error("❌ CHATBOT ERROR:", err);
      return res.status(500).json({
        status: "error",
        reply: "❌ Interner Serverfehler"
      });
    }
  }

};

module.exports = chatbotController;
