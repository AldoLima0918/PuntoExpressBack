// src/controllers/loginController.js
const loginService = require("../services/loginService");

// ============================================
// LOGIN
// ============================================
const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    console.log("=== Login Controller ===");
    console.log("Username:", username);

    // Validar campos requeridos
    if (!username || !password) {
      console.log("Campos faltantes");
      return res.status(400).json({
        success: false,
        message: "Usuario y contraseña son requeridos"
      });
    }

    const result = await loginService.authenticateUser(username, password);

    console.log("Resultado autenticación:", result.success);

    if (result.success) {
      res.json({
        success: true,
        message: "Inicio de sesión exitoso",
        token: result.token,
        user: result.user
      });
    } else {
      // Mensaje específico según el error
      let statusCode = 401;
      let message = result.message;

      if (result.message === "Usuario inactivo") {
        statusCode = 403; // Prohibido
      }

      res.status(statusCode).json({
        success: false,
        message: message
      });
    }
  } catch (error) {
    console.error("Error en login controller:", error);
    res.status(500).json({
      success: false,
      message: "Error interno del servidor"
    });
  }
};

// ============================================
// LOGOUT
// ============================================
const logout = async (req, res) => {
  try {
    res.json({
      success: true,
      message: "Sesión cerrada exitosamente"
    });
  } catch (error) {
    console.error("Error en logout controller:", error);
    res.status(500).json({
      success: false,
      message: "Error interno del servidor"
    });
  }
};

// ============================================
// VERIFY TOKEN
// ============================================
const verifyToken = async (req, res) => {
  try {
    console.log("=== verifyToken Controller ===");
    console.log("req.user:", req.user);

    if (req.user) {
      // Construir objeto de usuario para el frontend
      const userData = {
        id_usuario: req.user.id_usuario,
        id_persona: req.user.id_persona,
        username: req.user.usuario,
        name: req.user.nombres,
        lastname: req.user.apellidos,
        role: req.user.rol,
        phoneNumber: req.user.celular,
        status: req.user.estado
      };

      res.json({
        success: true,
        user: userData
      });
    } else {
      res.status(401).json({
        success: false,
        message: "Token inválido o expirado"
      });
    }
  } catch (error) {
    console.error("Error en verifyToken controller:", error);
    res.status(500).json({
      success: false,
      message: "Error interno del servidor"
    });
  }
};

// ============================================
// CHANGE PASSWORD
// ============================================
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id_usuario;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Contraseña actual y nueva son requeridas"
      });
    }

    const result = await loginService.changePassword(userId, currentPassword, newPassword);

    if (result.success) {
      res.json({
        success: true,
        message: "Contraseña cambiada exitosamente"
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message
      });
    }
  } catch (error) {
    console.error("Error en changePassword controller:", error);
    res.status(500).json({
      success: false,
      message: "Error interno del servidor"
    });
  }
};

// ============================================
// GET CURRENT USER
// ============================================
const getCurrentUser = async (req, res) => {
  try {
    console.log("=== getCurrentUser Controller ===");
    console.log("req.user:", req.user);

    if (req.user) {
      const userData = {
        id_usuario: req.user.id_usuario,
        id_persona: req.user.id_persona,
        username: req.user.usuario,
        name: req.user.nombres,
        lastname: req.user.apellidos,
        role: req.user.rol,
        phoneNumber: req.user.celular,
        status: req.user.estado
      };

      res.json({
        success: true,
        user: userData
      });
    } else {
      res.status(401).json({
        success: false,
        message: "Usuario no autenticado"
      });
    }
  } catch (error) {
    console.error("Error en getCurrentUser controller:", error);
    res.status(500).json({
      success: false,
      message: "Error interno del servidor"
    });
  }
};

module.exports = {
  login,
  logout,
  verifyToken,
  changePassword,
  getCurrentUser
};