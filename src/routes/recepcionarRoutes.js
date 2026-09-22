// src/routes/recepcionarRoutes.js
const express = require("express");
const router = express.Router();
const recepcionarController = require("../controllers/recepcionarController");
const { authenticate } = require("../middleware/loginmiddleware");

// Siguiente código (antes de "/" para evitar choques)
router.get("/siguiente-codigo", authenticate, recepcionarController.siguienteCodigo);

// Recepciones
router.post("/", authenticate, recepcionarController.crearRecepcion);
router.get("/", authenticate, recepcionarController.listarRecepciones);

// Personas
router.get("/persona/:carnet", authenticate, recepcionarController.buscarPersona);

// Tamaños
router.get("/tamanos", authenticate, recepcionarController.listarTamanos);

// Estantes
router.get("/estantes", authenticate, recepcionarController.listarEstantes);
router.post("/estantes", authenticate, recepcionarController.crearEstante);
router.put("/estantes/:id", authenticate, recepcionarController.editarEstante);
router.delete("/estantes/:id", authenticate, recepcionarController.eliminarEstante);

module.exports = router;