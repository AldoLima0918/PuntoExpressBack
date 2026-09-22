// src/routes/loginRoutes.js
const express = require("express");
const router = express.Router();
const loginController = require("../controllers/loginController");
const { authenticate } = require("../middleware/loginmiddleware");

// ============================================
// RUTAS DE AUTENTICACIÓN
// ============================================

// Login - pública
router.post("/auth/login", loginController.login);

// Logout - pública (solo limpia en frontend)
router.post("/auth/logout", loginController.logout);

// Verify token - requiere autenticación
router.get("/auth/verify", authenticate, loginController.verifyToken);

// Change password - requiere autenticación
router.post("/auth/change-password", authenticate, loginController.changePassword);

// Get current user - requiere autenticación
router.get("/auth/me", authenticate, loginController.getCurrentUser);

module.exports = router;