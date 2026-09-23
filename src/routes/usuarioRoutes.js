// src/routes/usuarioRoutes.js
const express = require("express");
const router = express.Router();
const usuarioController = require("../controllers/usuarioController");
const { authenticate, authorize } = require("../middleware/loginmiddleware");

// Todas las rutas requieren autenticación
router.use(authenticate);

// Listar usuarios (con búsqueda opcional ?q=)
router.get("/", usuarioController.listar);

// Obtener un usuario por id
router.get("/:id", usuarioController.obtener);

// Crear usuario (solo administrador)
router.post("/", authorize(["administrador"]), usuarioController.crear);

// Editar usuario (solo administrador)
router.put("/:id", authorize(["administrador"]), usuarioController.editar);

// Cambiar estado activo/inactivo (solo administrador)
router.patch(
  "/:id/estado",
  authorize(["administrador"]),
  usuarioController.cambiarEstado
);

// Eliminar usuario (soft delete, solo administrador)
router.delete("/:id", authorize(["administrador"]), usuarioController.eliminar);

module.exports = router;