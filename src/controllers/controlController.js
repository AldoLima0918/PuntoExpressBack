// src/controllers/controlController.js
const controlService = require("../services/controlService");

// ============================================
// LISTAR RECEPCIONES ACTIVAS
// ============================================
const listar = async (req, res) => {
  try {
    const result = await controlService.listarRecepcionesActivas();
    res.json(result);
  } catch (error) {
    console.error("Error en listar control controller:", error);
    res.status(500).json({
      success: false,
      message: "Error interno del servidor",
    });
  }
};

// ============================================
// LISTAR ESTANTES
// ============================================
const listarEstantes = async (req, res) => {
  try {
    const result = await controlService.listarEstantes();
    res.json(result);
  } catch (error) {
    console.error("Error en listarEstantes control controller:", error);
    res.status(500).json({
      success: false,
      message: "Error interno del servidor",
    });
  }
};

// ============================================
// EDITAR ESTANTE DE UN ITEM
// ============================================
const editarEstanteItem = async (req, res) => {
  try {
    const { id } = req.params;
    const { id_estante } = req.body;

    if (!id || !id_estante) {
      return res.status(400).json({
        success: false,
        message: "Faltan datos: id_tamano_recepcion e id_estante son obligatorios",
      });
    }

    const result = await controlService.editarEstanteItem(
      Number(id),
      Number(id_estante)
    );

    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error("Error en editarEstanteItem controller:", error);
    res.status(500).json({
      success: false,
      message: "Error interno del servidor",
    });
  }
};

module.exports = {
  listar,
  listarEstantes,
  editarEstanteItem,
};