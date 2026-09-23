// src/routes/reportesRoutes.js
const express = require("express");
const router = express.Router();
const reportesController = require("../controllers/reportesController");
const { authenticate } = require("../middleware/loginmiddleware");

// Todas las rutas requieren autenticación
router.use(authenticate);

// Recepciones pendientes con zona efectiva y costo calculado
router.get("/recepciones-activas", reportesController.recepcionesActivas);

// Ventas agrupadas por mes
router.get("/tendencia-mensual", reportesController.tendenciaMensual);

module.exports = router;