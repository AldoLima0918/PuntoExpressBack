// src/routes/recepcionarRoutes.js
const express = require("express");
const router = express.Router();
const recepcionarController = require("../controllers/recepcionarController");
const { authenticate } = require("../middleware/loginmiddleware");

// ============================================
// RECEPCIONES
// ============================================
router.post("/", authenticate, recepcionarController.crearRecepcion);
router.get("/", authenticate, recepcionarController.listarRecepciones);

// ============================================
// PERSONAS
// ============================================
router.get("/persona/:carnet", authenticate, recepcionarController.buscarPersona);

// ============================================
// TAMAÑOS
// ============================================
router.get("/tamanos", authenticate, recepcionarController.listarTamanos);

// ============================================
// ESTANTES
// ============================================
router.get("/estantes", authenticate, recepcionarController.listarEstantes);
router.post("/estantes", authenticate, recepcionarController.crearEstante);
router.put("/estantes/:id", authenticate, recepcionarController.editarEstante);
router.delete("/estantes/:id", authenticate, recepcionarController.eliminarEstante);

module.exports = router;