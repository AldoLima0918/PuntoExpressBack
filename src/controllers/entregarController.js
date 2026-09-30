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
    res.status(500).json({ success: false, message: "Error interno del servidor" });
  }
};

// ============================================
// PREVIEW
// ============================================
const preview = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ success: false, message: "ID requerido" });
    }
    const result = await entregarService.previewEntrega(Number(id));
    res.status(result.success ? 200 : 404).json(result);
  } catch (error) {
    console.error("Error en preview controller:", error);
    res.status(500).json({ success: false, message: "Error interno del servidor" });
  }
};

// ============================================
// ESTADO DE CAJA
// ============================================
const estadoCaja = async (req, res) => {
  try {
    const idUsuario = req.user?.id_usuario;
    const idCajaUsuario = req.user?.id_caja ?? null;

    if (!idUsuario) {
      return res.status(401).json({
        success: false,
        message: "Usuario no autenticado",
      });
    }

    const result = await entregarService.estadoCajaUsuario(idUsuario, idCajaUsuario);
    res.json(result);
  } catch (error) {
    console.error("Error en estadoCaja controller:", error);
    res.status(500).json({
      success: false,
      message: "Error interno del servidor",
    });
  }
};

// ============================================
// ENTREGAR (una o varias recepciones)
// ============================================
const entregar = async (req, res) => {
  try {
    const { id_recepcion, id_recepciones, metodo_pago } = req.body;

    // Acepta tanto id_recepcion (single) como id_recepciones (array)
    let ids = [];
    if (Array.isArray(id_recepciones) && id_recepciones.length > 0) {
      ids = id_recepciones;
    } else if (id_recepcion) {
      ids = [id_recepcion];
    }

    if (ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Faltan datos: id_recepcion o id_recepciones son obligatorios",
      });
    }
    if (!metodo_pago) {
      return res.status(400).json({
        success: false,
        message: "Falta el método de pago",
      });
    }
    if (metodo_pago !== "Efectivo" && metodo_pago !== "QR") {
      return res.status(400).json({
        success: false,
        message: 'Método de pago inválido. Debe ser "Efectivo" o "QR"',
      });
    }

    const idUsuario = req.user?.id_usuario;
    const idCajaUsuario = req.user?.id_caja ?? null;

    if (!idUsuario) {
      return res.status(401).json({
        success: false,
        message: "Usuario no autenticado",
      });
    }

    const result = await entregarService.entregarMultiple(
      ids,
      metodo_pago,
      idUsuario,
      idCajaUsuario
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
  estadoCaja,
  entregar,
};