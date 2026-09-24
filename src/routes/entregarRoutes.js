// src/routes/entregarRoutes.js
const express = require("express");
const router = express.Router();
const entregarController = require("../controllers/entregarController");
const { authenticate } = require("../middleware/loginmiddleware");

// Estado de la caja del usuario (para deshabilitar el botón si está cerrada)
router.get("/estado-caja", authenticate, entregarController.estadoCaja);

// Buscar recepciones pendientes
router.get("/buscar", authenticate, entregarController.buscar);

// Preview del monto a cobrar
router.get("/preview/:id", authenticate, entregarController.preview);

// Entregar una recepción
router.post("/", authenticate, entregarController.entregar);

module.exports = router;