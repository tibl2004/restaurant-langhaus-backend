const express = require("express");
const router = express.Router();

const betriebsferienController = require("../controller/betriebsferien.controller");
const auth = require("../middleware/auth"); // JWT Middleware

/* =========================
   🔓 PUBLIC
========================= */
router.get(
  "/active",
  betriebsferienController.getAktiveBetriebsferien
);

/* =========================
   🔐 ADMIN ROUTES
========================= */

// ➕ CREATE
router.post(
  "/",
  auth,
  betriebsferienController.addBetriebsferien
);

// ✏️ UPDATE
router.put(
  "/:id",
  auth,
  betriebsferienController.updateBetriebsferien
);

// 🗑 DELETE
router.delete(
  "/:id",
  auth,
  betriebsferienController.deleteBetriebsferien
);

module.exports = router;