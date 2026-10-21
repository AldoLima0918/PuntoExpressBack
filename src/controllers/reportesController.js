// src/controllers/reportesController.js
const reportesService = require("../services/reportesService");

// ============================================
// RECEPCIONES ACTIVAS
// ============================================
const recepcionesActivas = async (_req, res) => {
  try {
    const result = await reportesService.listarRecepcionesActivas();
    res.json(result);
  } catch (error) {
    console.error("Error en recepcionesActivas:", error);
    res.status(500).json({
      success: false,
      message: "Error interno del servidor",
    });
  }
};

// ============================================
// TENDENCIA MENSUAL
// ============================================
const tendenciaMensual = async (_req, res) => {
  try {
    const result = await reportesService.obtenerTendenciaMensual();
    res.json(result);
  } catch (error) {
    console.error("Error en tendenciaMensual:", error);
    res.status(500).json({
      success: false,
      message: "Error interno del servidor",
    });
  }
};

// ============================================
// TOP PERSONAS QUE MÁS DEJARON PAQUETES
// ============================================
const topDejantes = async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    const result = await reportesService.obtenerTopDejantes({ desde, hasta });
    res.json(result);
  } catch (error) {
    console.error("Error en topDejantes:", error);
    res.status(500).json({
      success: false,
      message: "Error interno del servidor",
    });
  }
};

module.exports = {
  recepcionesActivas,
  tendenciaMensual,
  topDejantes,
};