// src/routes/ventasRoutes.js
const express = require("express");
const router = express.Router();
const ventasController = require("../controllers/ventasController");
const { authenticate } = require("../middleware/loginmiddleware");

// Listar ventas con filtro de fechas: GET /api/ventas?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
router.get("/", authenticate, ventasController.listar);

module.exports = router;