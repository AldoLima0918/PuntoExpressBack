// src/controllers/usuarioController.js
const usuarioService = require("../services/usuarioService");

// ============================================
// LISTAR USUARIOS
// ============================================
const listar = async (req, res) => {
  try {
    const { q } = req.query;
    const result = await usuarioService.listarUsuarios(q);
    res.json(result);
  } catch (error) {
    console.error("Error en listar usuarios:", error);
    res.status(500).json({
      success: false,
      message: "Error interno del servidor",
    });
  }
};

// ============================================
// OBTENER UN USUARIO
// ============================================
const obtener = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await usuarioService.obtenerUsuario(Number(id));
    res.status(result.success ? 200 : 404).json(result);
  } catch (error) {
    console.error("Error en obtener usuario:", error);
    res.status(500).json({
      success: false,
      message: "Error interno del servidor",
    });
  }
};

// ============================================
// CREAR USUARIO
// ============================================
const crear = async (req, res) => {
  try {
    const {
      carnet,
      nombres,
      apellidos,
      celular,
      usuario,
      contrasena,
      rol,
      estado,
    } = req.body;

    if (!carnet || !nombres || !apellidos || !usuario || !contrasena || !rol) {
      return res.status(400).json({
        success: false,
        message:
          "Faltan datos: carnet, nombres, apellidos, usuario, contrasena y rol son obligatorios",
      });
    }

    if (rol !== "administrador" && rol !== "ayudante") {
      return res.status(400).json({
        success: false,
        message: 'Rol inválido. Debe ser "administrador" o "ayudante"',
      });
    }

    const result = await usuarioService.crearUsuario({
      carnet: String(carnet).trim(),
      nombres: String(nombres).trim(),
      apellidos: String(apellidos).trim(),
      celular: celular ? String(celular).trim() : null,
      usuario: String(usuario).trim(),
      contrasena: String(contrasena),
      rol,
      estado: estado || "activo",
    });

    res.status(201).json(result);
  } catch (error) {
    console.error("Error en crear usuario:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Error al crear usuario",
    });
  }
};

// ============================================
// EDITAR USUARIO
// ============================================
const editar = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      carnet,
      nombres,
      apellidos,
      celular,
      usuario,
      contrasena,
      rol,
      estado,
    } = req.body;

    if (!carnet || !nombres || !apellidos || !usuario || !rol) {
      return res.status(400).json({
        success: false,
        message:
          "Faltan datos: carnet, nombres, apellidos, usuario y rol son obligatorios",
      });
    }

    if (rol !== "administrador" && rol !== "ayudante") {
      return res.status(400).json({
        success: false,
        message: 'Rol inválido. Debe ser "administrador" o "ayudante"',
      });
    }

    const result = await usuarioService.editarUsuario(Number(id), {
      carnet: String(carnet).trim(),
      nombres: String(nombres).trim(),
      apellidos: String(apellidos).trim(),
      celular: celular ? String(celular).trim() : null,
      usuario: String(usuario).trim(),
      contrasena: contrasena ? String(contrasena) : undefined,
      rol,
      estado: estado || "activo",
    });

    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error("Error en editar usuario:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Error al editar usuario",
    });
  }
};

// ============================================
// CAMBIAR ESTADO
// ============================================
const cambiarEstado = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;

    if (estado !== "activo" && estado !== "inactivo") {
      return res.status(400).json({
        success: false,
        message: 'Estado inválido. Debe ser "activo" o "inactivo"',
      });
    }

    // Evitar que el admin se inhabilite a sí mismo
    if (req.user?.id_usuario === Number(id) && estado === "inactivo") {
      return res.status(400).json({
        success: false,
        message: "No puedes inhabilitar tu propio usuario",
      });
    }

    const result = await usuarioService.cambiarEstado(Number(id), estado);
    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error("Error en cambiar estado:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Error al cambiar estado",
    });
  }
};

// ============================================
// ELIMINAR (SOFT DELETE)
// ============================================
const eliminar = async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user?.id_usuario === Number(id)) {
      return res.status(400).json({
        success: false,
        message: "No puedes eliminar tu propio usuario",
      });
    }

    const result = await usuarioService.eliminarUsuario(Number(id));
    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error("Error en eliminar usuario:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Error al eliminar usuario",
    });
  }
};

module.exports = {
  listar,
  obtener,
  crear,
  editar,
  cambiarEstado,
  eliminar,
};