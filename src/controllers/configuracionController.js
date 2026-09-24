// src/controllers/configuracionController.js
const configuracionService = require("../services/configuracionService");

// ============================================
// ─── ESTANTES ───────────────────────────────
// ============================================

const listarEstantes = async (_req, res) => {
  try {
    const result = await configuracionService.listarEstantes();
    res.json(result);
  } catch (error) {
    console.error("Error en listarEstantes:", error);
    res.status(500).json({
      success: false,
      message: "Error interno del servidor",
    });
  }
};

const crearEstante = async (req, res) => {
  try {
    const { estante } = req.body;

    if (!estante || typeof estante !== "string") {
      return res.status(400).json({
        success: false,
        message: "El nombre del estante es obligatorio",
      });
    }

    const nombre = estante.trim().toUpperCase();
    if (!nombre) {
      return res.status(400).json({
        success: false,
        message: "El nombre del estante no puede estar vacío",
      });
    }

    const result = await configuracionService.crearEstante(nombre);
    res.status(result.success ? 201 : 400).json(result);
  } catch (error) {
    console.error("Error en crearEstante:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Error al crear estante",
    });
  }
};

const editarEstante = async (req, res) => {
  try {
    const { id } = req.params;
    const { estante } = req.body;

    if (!estante || typeof estante !== "string") {
      return res.status(400).json({
        success: false,
        message: "El nombre del estante es obligatorio",
      });
    }

    const nombre = estante.trim().toUpperCase();
    if (!nombre) {
      return res.status(400).json({
        success: false,
        message: "El nombre del estante no puede estar vacío",
      });
    }

    const result = await configuracionService.editarEstante(Number(id), nombre);
    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error("Error en editarEstante:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Error al editar estante",
    });
  }
};

const eliminarEstante = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await configuracionService.eliminarEstante(Number(id));
    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error("Error en eliminarEstante:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Error al eliminar estante",
    });
  }
};

// ============================================
// ─── TAMAÑOS ────────────────────────────────
// ============================================

const listarTamanos = async (_req, res) => {
  try {
    const result = await configuracionService.listarTamanos();
    res.json(result);
  } catch (error) {
    console.error("Error en listarTamanos:", error);
    res.status(500).json({
      success: false,
      message: "Error interno del servidor",
    });
  }
};

const crearTamano = async (req, res) => {
  try {
    const { tamano, precio } = req.body;

    if (!tamano || typeof tamano !== "string") {
      return res.status(400).json({
        success: false,
        message: "El nombre del tamaño es obligatorio",
      });
    }

    const nombre = tamano.trim();
    if (!nombre) {
      return res.status(400).json({
        success: false,
        message: "El nombre del tamaño no puede estar vacío",
      });
    }

    const precioNum = Number(precio);
    if (!Number.isFinite(precioNum) || precioNum < 0) {
      return res.status(400).json({
        success: false,
        message: "El precio debe ser un número mayor o igual a 0",
      });
    }

    const result = await configuracionService.crearTamano(nombre, precioNum);
    res.status(result.success ? 201 : 400).json(result);
  } catch (error) {
    console.error("Error en crearTamano:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Error al crear tamaño",
    });
  }
};

const editarTamano = async (req, res) => {
  try {
    const { id } = req.params;
    const { tamano, precio } = req.body;

    if (!tamano || typeof tamano !== "string") {
      return res.status(400).json({
        success: false,
        message: "El nombre del tamaño es obligatorio",
      });
    }

    const nombre = tamano.trim();
    if (!nombre) {
      return res.status(400).json({
        success: false,
        message: "El nombre del tamaño no puede estar vacío",
      });
    }

    const precioNum = Number(precio);
    if (!Number.isFinite(precioNum) || precioNum < 0) {
      return res.status(400).json({
        success: false,
        message: "El precio debe ser un número mayor o igual a 0",
      });
    }

    const result = await configuracionService.editarTamano(
      Number(id),
      nombre,
      precioNum
    );
    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error("Error en editarTamano:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Error al editar tamaño",
    });
  }
};

const eliminarTamano = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await configuracionService.eliminarTamano(Number(id));
    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error("Error en eliminarTamano:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Error al eliminar tamaño",
    });
  }
};

// ============================================
// ─── CAJAS ──────────────────────────────────
// ============================================

const listarCajas = async (_req, res) => {
  try {
    const result = await configuracionService.listarCajas();
    res.json(result);
  } catch (error) {
    console.error("Error en listarCajas:", error);
    res.status(500).json({
      success: false,
      message: "Error interno del servidor",
    });
  }
};

const crearCaja = async (req, res) => {
  try {
    const { nombre_caja } = req.body;

    if (!nombre_caja || typeof nombre_caja !== "string") {
      return res.status(400).json({
        success: false,
        message: "El nombre de la caja es obligatorio",
      });
    }

    const nombre = nombre_caja.trim();
    if (!nombre) {
      return res.status(400).json({
        success: false,
        message: "El nombre de la caja no puede estar vacío",
      });
    }

    const result = await configuracionService.crearCaja(nombre);
    res.status(result.success ? 201 : 400).json(result);
  } catch (error) {
    console.error("Error en crearCaja:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Error al crear caja",
    });
  }
};

const editarCaja = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre_caja } = req.body;

    if (!nombre_caja || typeof nombre_caja !== "string") {
      return res.status(400).json({
        success: false,
        message: "El nombre de la caja es obligatorio",
      });
    }

    const nombre = nombre_caja.trim();
    if (!nombre) {
      return res.status(400).json({
        success: false,
        message: "El nombre de la caja no puede estar vacío",
      });
    }

    const result = await configuracionService.editarCaja(Number(id), nombre);
    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error("Error en editarCaja:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Error al editar caja",
    });
  }
};

const eliminarCaja = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await configuracionService.eliminarCaja(Number(id));
    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error("Error en eliminarCaja:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Error al eliminar caja",
    });
  }
};

module.exports = {
  listarEstantes,
  crearEstante,
  editarEstante,
  eliminarEstante,
  listarTamanos,
  crearTamano,
  editarTamano,
  eliminarTamano,
  listarCajas,
  crearCaja,
  editarCaja,
  eliminarCaja,
};