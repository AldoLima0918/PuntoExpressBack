// src/routes/cajaRoutes.js
const express = require("express");
const router = express.Router();
const cajaController = require("../controllers/cajaController");
const { authenticate } = require("../middleware/loginmiddleware");

// Todas las rutas requieren autenticación
router.use(authenticate);

// Estado actual de la caja
router.get("/estado", cajaController.estado);

// Listar transacciones con filtros
router.get("/transacciones", cajaController.listarTransacciones);

// Registrar movimiento
router.post("/movimiento", cajaController.registrarMovimiento);

module.exports = router;