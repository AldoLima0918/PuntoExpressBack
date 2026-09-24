// src/controllers/cajaController.js
const cajaService = require("../services/cajaService");

// ============================================
// ESTADO ACTUAL DE CAJA
// ============================================
const estado = async (req, res) => {
  try {
    const { idCaja } = req.query;
    const idUsuario = req.user?.id_usuario;
    const rol = req.user?.rol;

    const result = await cajaService.obtenerEstadoCaja({
      idUsuario,
      rol,
      idCajaQuery: idCaja ? Number(idCaja) : null,
    });

    res.json(result);
  } catch (error) {
    console.error("Error en estado caja:", error);
    res.status(500).json({
      success: false,
      message: "Error interno del servidor",
    });
  }
};

// ============================================
// LISTAR TRANSACCIONES
// ============================================
const listarTransacciones = async (req, res) => {
  try {
    const { desde, hasta, soloMias, idCaja } = req.query;
    const idUsuario = req.user?.id_usuario;
    const rol = req.user?.rol;

    const result = await cajaService.listarTransacciones({
      desde: desde ? String(desde) : null,
      hasta: hasta ? String(hasta) : null,
      soloMias: soloMias === "1" || soloMias === "true",
      idUsuario,
      rol,
      idCajaQuery: idCaja ? Number(idCaja) : null,
    });

    res.json(result);
  } catch (error) {
    console.error("Error en listarTransacciones:", error);
    res.status(500).json({
      success: false,
      message: "Error interno del servidor",
    });
  }
};

// ============================================
// REGISTRAR MOVIMIENTO
// ============================================
const registrarMovimiento = async (req, res) => {
  try {
    const { tipo, descripcion, monto, idCaja } = req.body;

    if (!tipo || typeof tipo !== "string") {
      return res.status(400).json({
        success: false,
        message: "El tipo de movimiento es obligatorio",
      });
    }

    const tiposValidos = ["apertura", "cierre", "ingreso", "egreso"];
    if (!tiposValidos.includes(tipo)) {
      return res.status(400).json({
        success: false,
        message: `Tipo inválido. Debe ser uno de: ${tiposValidos.join(", ")}`,
      });
    }

    if (!descripcion || typeof descripcion !== "string") {
      return res.status(400).json({
        success: false,
        message: "La descripción es obligatoria",
      });
    }

    const montoNum = Number(monto);
    if (!Number.isFinite(montoNum) || montoNum < 0) {
      return res.status(400).json({
        success: false,
        message: "El monto debe ser un número mayor o igual a 0",
      });
    }

    if ((tipo === "ingreso" || tipo === "egreso") && montoNum <= 0) {
      return res.status(400).json({
        success: false,
        message: "El monto debe ser mayor a 0 para ingresos y egresos",
      });
    }

    const idUsuario = req.user?.id_usuario;
    const rol = req.user?.rol;

    if (!idUsuario) {
      return res.status(401).json({
        success: false,
        message: "Usuario no autenticado",
      });
    }

    const result = await cajaService.registrarMovimiento({
      tipo,
      descripcion: descripcion.trim(),
      monto: montoNum,
      idUsuario,
      rol,
      idCajaQuery: idCaja ? Number(idCaja) : null,
    });

    res.status(result.success ? 201 : 400).json(result);
  } catch (error) {
    console.error("Error en registrarMovimiento:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Error al registrar movimiento",
    });
  }
};

module.exports = {
  estado,
  listarTransacciones,
  registrarMovimiento,
};