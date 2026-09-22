// src/routes/controlRoutes.js
const express = require("express");
const router = express.Router();
const controlController = require("../controllers/controlController");
const { authenticate } = require("../middleware/loginmiddleware");

// Listar recepciones activas
router.get("/", authenticate, controlController.listar);

// Listar estantes (para el combo)
router.get("/estantes", authenticate, controlController.listarEstantes);

// Editar estante de un item
router.put(
  "/item/:id/estante",
  authenticate,
  controlController.editarEstanteItem
);

module.exports = router;