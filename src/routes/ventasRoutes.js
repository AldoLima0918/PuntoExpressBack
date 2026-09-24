// src/routes/ventasRoutes.js
const express = require("express");
const router = express.Router();
const ventasController = require("../controllers/ventasController");
const { authenticate } = require("../middleware/loginmiddleware");

// Listar ventas con filtro de fechas y caja
router.get("/", authenticate, ventasController.listar);

// Listar cajas (para el filtro del admin)
router.get("/cajas", authenticate, ventasController.listarCajas);

module.exports = router;