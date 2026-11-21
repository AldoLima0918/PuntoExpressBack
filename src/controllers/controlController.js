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

const obtenerLogoAlianza = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0 || id > 2147483647) {
      return res.status(400).json({ success: false, message: "Alianza inválida" });
    }
    const result = await controlService.obtenerLogoAlianza(id);
    res.status(result.success ? 200 : 404).json(result);
  } catch (error) {
    console.error("Error al obtener logo de alianza para control:", error);
    res.status(500).json({ success: false, message: "Error interno del servidor" });
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

const historialRetiros = async (req,res) => {
  try { res.json(await controlService.listarRetirosVendedor(req.query.pagina, req.query.cobro, req.query.q, req.query.desde, req.query.hasta)); }
  catch(error) {
    console.error('Error al consultar retiros de vendedor:',error);
    res.status(500).json({success:false,message:'Error interno del servidor'});
  }
};

const retirarPorVendedor = async (req, res) => {
  try {
    if (!req.user?.id_usuario) return res.status(401).json({success:false,message:'Usuario no autenticado'});
    const result = await controlService.retirarPorVendedor(
      Number(req.params.id), req.body, req.user.id_usuario, req.user.id_caja ?? null
    );
    res.status(result.success ? 200 : 409).json(result);
  } catch(error) {
    console.error('Error al retirar por vendedor:',error);
    res.status(500).json({success:false,message:'Error interno del servidor'});
  }
};

module.exports = { historialRetiros, retirarPorVendedor, listar, listarAlianzas, obtenerLogoAlianza, cambiarEstadoTraslado, listarEstantes, editarEstanteItem };