const express = require("express");
const router = express.Router();

const controller = require("../controller/oeffnungszeiten.controller");

// Öffentliche Route
router.get(
  "/",
  controller.getOeffnungszeiten
);

// Geschützte Admin-Routen
router.get(
  "/",
  ...controller.getOeffzeitenForEdit
);

router.put(
  "/:id",
  ...controller.updateZeitblock
);

router.post(
  "/",
  ...controller.addZeitblock
);

router.delete(
  "/:id",
  ...controller.deleteZeitblock
);

module.exports = router;