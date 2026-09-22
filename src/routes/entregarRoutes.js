// src/routes/entregarRoutes.js
const express = require("express");
const router = express.Router();
const entregarController = require("../controllers/entregarController");
const { authenticate } = require("../middleware/loginmiddleware");

// Buscar recepciones pendientes
router.get("/buscar", authenticate, entregarController.buscar);

// Preview del monto a cobrar
router.get("/preview/:id", authenticate, entregarController.preview);

// Entregar una recepción
router.post("/", authenticate, entregarController.entregar);

module.exports = router;