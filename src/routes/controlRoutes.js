const express = require("express");
const router = express.Router();
const controlController = require("../controllers/controlController");
const { authenticate } = require("../middleware/loginmiddleware");

router.get("/", authenticate, controlController.listar);
router.get("/alianzas", authenticate, controlController.listarAlianzas);
router.put("/traslado/:id/estado", authenticate, controlController.cambiarEstadoTraslado);
router.get("/estantes", controlController.listarEstantes);
router.put("/item/:id/estante", authenticate, controlController.editarEstanteItem);

module.exports = router;