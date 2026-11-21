// src/routes/entregarRoutes.js
const express = require("express");
const router = express.Router();
const entregarController = require("../controllers/entregarController");
const { authenticate } = require("../middleware/loginmiddleware");
router.get("/estado-caja", authenticate, entregarController.estadoCaja);
router.get("/buscar", authenticate, entregarController.buscar);
router.get("/envios", authenticate, entregarController.listarEnvios);
router.put("/envios/estado", authenticate, entregarController.cambiarEnvios);
router.get("/preview/:id", authenticate, entregarController.preview);
router.post("/", authenticate, entregarController.entregar);
module.exports = router;