const controlService = require("../services/controlService");

const listar = async (req, res) => {
  try { res.json(await controlService.listarRecepcionesActivas(req.query)); }
  catch (error) {
    console.error("Error en listar control controller:", error);
    res.status(500).json({ success: false, message: "Error interno del servidor" });
  }
};

const listarAlianzas = async (req, res) => {
  try { res.json(await controlService.listarAlianzasControl()); }
  catch (error) {
    console.error("Error en listar alianzas para control:", error);
    res.status(500).json({ success: false, message: "Error al cargar alianzas" });
  }
};

const cambiarEstadoTraslado = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { estado_traslado } = req.body || {};
    const result = await controlService.cambiarEstadoTraslado(id, estado_traslado);
    res.status(result.success ? 200 : 409).json(result);
  } catch (error) {
    console.error("Error en cambiar estado de traslado:", error);
    res.status(500).json({ success: false, message: "Error interno del servidor" });
  }
};

const listarEstantes = async (req, res) => {
  try { res.json(await controlService.listarEstantes()); }
  catch (error) {
    console.error("Error en listarEstantes control controller:", error);
    res.status(500).json({ success: false, message: "Error interno del servidor" });
  }
};

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
    const result = await controlService.editarEstanteItem(Number(id), Number(id_estante));
    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error("Error en editarEstanteItem controller:", error);
    res.status(500).json({ success: false, message: "Error interno del servidor" });
  }
};

module.exports = { listar, listarAlianzas, cambiarEstadoTraslado, listarEstantes, editarEstanteItem };
