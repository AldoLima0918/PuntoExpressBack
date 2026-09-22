// src/controllers/entregarController.js
const entregarService = require("../services/entregarService");

// ============================================
// BUSCAR RECEPCIONES PENDIENTES
// ============================================
const buscar = async (req, res) => {
  try {
    const { q } = req.query;
    const result = await entregarService.buscarRecepciones(q);
    res.json(result);
  } catch (error) {
    console.error("Error en buscar controller:", error);
    res.status(500).json({
      success: false,
      message: "Error interno del servidor",
    });
  }
};

// ============================================
// PREVIEW DEL MONTO A COBRAR
// ============================================
const preview = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({
        success: false,
        message: "ID de recepción requerido",
      });
    }
    const result = await entregarService.previewEntrega(Number(id));
    res.status(result.success ? 200 : 404).json(result);
  } catch (error) {
    console.error("Error en preview controller:", error);
    res.status(500).json({
      success: false,
      message: "Error interno del servidor",
    });
  }
};

// ============================================
// ENTREGAR
// ============================================
const entregar = async (req, res) => {
  try {
    const { id_recepcion, metodo_pago } = req.body;

    if (!id_recepcion || !metodo_pago) {
      return res.status(400).json({
        success: false,
        message: "Faltan datos: id_recepcion y metodo_pago son obligatorios",
      });
    }
    if (metodo_pago !== "Efectivo" && metodo_pago !== "QR") {
      return res.status(400).json({
        success: false,
        message: 'Método de pago inválido. Debe ser "Efectivo" o "QR"',
      });
    }

    const idUsuario = req.user?.id_usuario;
    if (!idUsuario) {
      return res.status(401).json({
        success: false,
        message: "Usuario no autenticado",
      });
    }

    const result = await entregarService.entregar(
      Number(id_recepcion),
      metodo_pago,
      idUsuario
    );

    res.status(201).json(result);
  } catch (error) {
    console.error("Error en entregar controller:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Error al entregar la recepción",
    });
  }
};

module.exports = {
  buscar,
  preview,
  entregar,
};