// src/controllers/recepcionarController.js
const recepcionarService = require("../services/recepcionarService");

// ============================================
// CREAR RECEPCIÓN
// ============================================
const crearRecepcion = async (req, res) => {
  try {
    const { codigo_recepcion, zona, dejo, recoge, items } = req.body;

    if (!codigo_recepcion || !zona || !dejo || !recoge || !items) {
      return res.status(400).json({
        success: false,
        message: "Faltan datos obligatorios para registrar la recepción",
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Debes incluir al menos un paquete",
      });
    }

    if (!dejo.carnet || !dejo.nombres || !dejo.apellidos) {
      return res.status(400).json({
        success: false,
        message: "Completa los datos de la persona que deja el producto",
      });
    }

    if (!recoge.carnet || !recoge.nombres || !recoge.apellidos) {
      return res.status(400).json({
        success: false,
        message: "Completa los datos de la persona que recoge el producto",
      });
    }

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.tamano || !it.estante || it.precio == null) {
        return res.status(400).json({
          success: false,
          message: `El paquete ${i + 1} está incompleto`,
        });
      }
    }

    const result = await recepcionarService.crearRecepcion({
      codigo_recepcion,
      zona,
      dejo,
      recoge,
      items,
    });

    res.status(201).json(result);
  } catch (error) {
    console.error("Error en crearRecepcion controller:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error interno del servidor",
    });
  }
};

// ============================================
// BUSCAR PERSONA POR CARNET
// ============================================
const buscarPersona = async (req, res) => {
  try {
    const { carnet } = req.params;
    if (!carnet) {
      return res.status(400).json({
        success: false,
        message: "Carnet requerido",
      });
    }

    const result = await recepcionarService.buscarPersonaPorCarnet(carnet);

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error("Error en buscarPersona controller:", error);
    res.status(500).json({
      success: false,
      message: "Error interno del servidor",
    });
  }
};

// ============================================
// LISTAR TAMAÑOS
// ============================================
const listarTamanos = async (req, res) => {
  try {
    const result = await recepcionarService.listarTamanos();
    res.json(result);
  } catch (error) {
    console.error("Error en listarTamanos controller:", error);
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
    const result = await recepcionarService.listarEstantes();
    res.json(result);
  } catch (error) {
    console.error("Error en listarEstantes controller:", error);
    res.status(500).json({
      success: false,
      message: "Error interno del servidor",
    });
  }
};

// ============================================
// CREAR ESTANTE
// ============================================
const crearEstante = async (req, res) => {
  try {
    const { estante } = req.body;
    if (!estante) {
      return res.status(400).json({ success: false, message: "Nombre del estante requerido" });
    }
    const result = await recepcionarService.crearEstante(estante);
    res.status(result.success ? 201 : 400).json(result);
  } catch (error) {
    console.error("Error en crearEstante controller:", error);
    res.status(500).json({ success: false, message: "Error interno del servidor" });
  }
};

// ============================================
// EDITAR ESTANTE
// ============================================
const editarEstante = async (req, res) => {
  try {
    const { id } = req.params;
    const { estante } = req.body;
    if (!estante) {
      return res.status(400).json({ success: false, message: "Nombre del estante requerido" });
    }
    const result = await recepcionarService.editarEstante(Number(id), estante);
    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error("Error en editarEstante controller:", error);
    res.status(500).json({ success: false, message: "Error interno del servidor" });
  }
};

// ============================================
// ELIMINAR ESTANTE
// ============================================
const eliminarEstante = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await recepcionarService.eliminarEstante(Number(id));
    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error("Error en eliminarEstante controller:", error);
    res.status(500).json({ success: false, message: "Error interno del servidor" });
  }
};

// ============================================
// LISTAR RECEPCIONES
// ============================================
const listarRecepciones = async (req, res) => {
  try {
    const result = await recepcionarService.listarRecepciones();
    res.json(result);
  } catch (error) {
    console.error("Error en listarRecepciones controller:", error);
    res.status(500).json({
      success: false,
      message: "Error interno del servidor",
    });
  }
};

module.exports = {
  crearRecepcion,
  buscarPersona,
  listarTamanos,
  listarEstantes,
  listarRecepciones,
  crearEstante,
  editarEstante,
  eliminarEstante,
};