// src/routes/configuracionRoutes.js
const express = require("express");
const router = express.Router();
const configuracionController = require("../controllers/configuracionController");
const { authenticate, authorize } = require("../middleware/loginmiddleware");

// Todas las rutas requieren autenticación
router.use(authenticate);

// ─── ESTANTES ────────────────────────────────
router.get("/estantes", configuracionController.listarEstantes);
router.post(
  "/estantes",
  authorize(["administrador"]),
  configuracionController.crearEstante
);
router.put(
  "/estantes/:id",
  authorize(["administrador"]),
  configuracionController.editarEstante
);
router.delete(
  "/estantes/:id",
  authorize(["administrador"]),
  configuracionController.eliminarEstante
);

// ─── TAMAÑOS ─────────────────────────────────
router.get("/tamanos", configuracionController.listarTamanos);
router.post(
  "/tamanos",
  authorize(["administrador"]),
  configuracionController.crearTamano
);
router.put(
  "/tamanos/:id",
  authorize(["administrador"]),
  configuracionController.editarTamano
);
router.delete(
  "/tamanos/:id",
  authorize(["administrador"]),
  configuracionController.eliminarTamano
);

// ─── CAJAS ───────────────────────────────────
router.get("/cajas", configuracionController.listarCajas);
router.post(
  "/cajas",
  authorize(["administrador"]),
  configuracionController.crearCaja
);
router.put(
  "/cajas/:id",
  authorize(["administrador"]),
  configuracionController.editarCaja
);
router.delete(
  "/cajas/:id",
  authorize(["administrador"]),
  configuracionController.eliminarCaja
);

module.exports = router;