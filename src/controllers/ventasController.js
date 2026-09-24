// src/controllers/ventasController.js
const ventasService = require("../services/ventasService");

// ============================================
// LISTAR VENTAS
// ============================================
const listar = async (req, res) => {
  try {
    const { desde, hasta, id_caja } = req.query;

    if (!desde || !hasta) {
      return res.status(400).json({
        success: false,
        message: "Los parámetros 'desde' y 'hasta' son obligatorios",
      });
    }

    const idUsuario = req.user?.id_usuario;
    const rol = req.user?.rol;
    const esAdmin = rol === "administrador" || rol === "admin";

    // El filtro por caja solo aplica a admin
    const idCaja = esAdmin && id_caja ? Number(id_caja) : null;

    const result = await ventasService.listarVentas({
      desde,
      hasta,
      idUsuario,
      esAdmin,
      idCaja,
    });

    res.json(result);
  } catch (error) {
    console.error("Error en listar ventas controller:", error);
    res.status(500).json({
      success: false,
      message: "Error interno del servidor",
    });
  }
};

// ============================================
// LISTAR CAJAS (para el filtro del admin)
// ============================================
const listarCajas = async (req, res) => {
  try {
    const result = await ventasService.listarCajas();
    res.json(result);
  } catch (error) {
    console.error("Error en listarCajas controller:", error);
    res.status(500).json({
      success: false,
      message: "Error interno del servidor",
    });
  }
};

module.exports = {
  listar,
  listarCajas,
};