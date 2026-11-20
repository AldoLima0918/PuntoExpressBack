const recepcionarService = require('../services/recepcionarService');
const fallo = (res, status, message) => res.status(status).json({ success: false, message });
const crearRecepcion = async (req, res) => {
  try {
    const { codigo_recepcion, zona, dejo, recoge, items, pago_inicial, tipo_operacion = 'local', id_alianza = null } = req.body;
    if (!codigo_recepcion || !zona || !dejo || !recoge || !items) return fallo(res, 400, 'Faltan datos obligatorios');
    if (!Array.isArray(items) || items.length === 0) return fallo(res, 400, 'Debes incluir al menos un paquete');
    if (!dejo.celular) return fallo(res, 400, 'La persona que deja debe tener celular.');
    if (!recoge.celular) return fallo(res, 400, 'La persona que recoge debe tener celular.');
    if (!dejo.nombres || !dejo.apellidos) return fallo(res, 400, 'Completa los datos de quien deja');
    if (!recoge.nombres || !recoge.apellidos) return fallo(res, 400, 'Completa los datos de quien recoge');
    if (!['local', 'entrada', 'salida'].includes(tipo_operacion)) return fallo(res, 400, 'Tipo de operación inválido');
    if (tipo_operacion !== 'local' && (!Number.isInteger(id_alianza) || id_alianza <= 0 || id_alianza > 2147483647)) return fallo(res, 400, 'Selecciona una alianza válida');
    if (tipo_operacion === 'local' && id_alianza !== null) return fallo(res, 400, 'Una recepción local no debe tener alianza');
    if (typeof codigo_recepcion !== 'string') return fallo(res, 400, 'Código inválido');
    const codigo = codigo_recepcion.trim().toUpperCase();
    if (tipo_operacion === 'entrada' ? !/^[A-Z0-9][A-Z0-9 _.-]{0,49}$/.test(codigo) : !/^PX-\d{6}$/.test(codigo)) return fallo(res, 400, 'Código de recepción inválido');
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.tamano || (tipo_operacion !== 'salida' && (!it.estante || it.precio == null))) return fallo(res, 400, `El paquete ${i + 1} está incompleto`);
      if (tipo_operacion !== 'salida' && it.tamano === 'Otro' && (!it.precio || Number(it.precio) <= 0)) return fallo(res, 400, `El paquete ${i + 1} tiene tamaño "Otro": debes indicar un precio mayor a 0`);
      if (!it.descripcion || !String(it.descripcion).trim()) return fallo(res, 400, `El paquete ${i + 1} debe tener una descripción.`);
    }
    if (tipo_operacion === 'salida' && pago_inicial && Number(pago_inicial.monto) > 0) return fallo(res, 400, 'Los envíos a alianzas no admiten pagos iniciales de almacenaje.');
    if (pago_inicial) {
      if (typeof pago_inicial.monto !== 'number' || !Number.isFinite(pago_inicial.monto) || pago_inicial.monto < 0) return fallo(res, 400, 'El monto del pago inicial es inválido.');
      if (pago_inicial.monto > 0 && !['Efectivo', 'QR'].includes(pago_inicial.metodo_pago)) return fallo(res, 400, 'Método de pago inicial inválido. Debe ser "Efectivo" o "QR".');
    }
    const idUsuario = req.user?.id_usuario;
    if (!idUsuario) return fallo(res, 401, 'Usuario no autenticado');
    const result = await recepcionarService.crearRecepcion({ codigo_recepcion: codigo, zona, dejo, recoge, items, pago_inicial: pago_inicial ?? null, id_usuario: idUsuario, id_caja_usuario: req.user?.id_caja ?? null, tipo_operacion, id_alianza });
    res.status(201).json(result);
  } catch (error) {
    console.error('Error en crearRecepcion controller:', error);
    if (error.code === '23505' && error.constraint === 'recepcion_codigo_recepcion_key') return fallo(res, 409, 'Ese código de recepción ya existe');
    if (error.status === 400) return fallo(res, 400, error.message);
    fallo(res, 500, error.message || 'Error interno del servidor');
  }
};
const buscarPersonaQuery = async (req, res) => {
  try { const { carnet, celular } = req.query; const result = await recepcionarService.buscarPersona({ carnet, celular }); res.status(result.success ? 200 : 404).json(result); }
  catch (error) { console.error('Error en buscarPersonaQuery controller:', error); fallo(res, 500, 'Error interno del servidor'); }
};
const buscarPersona = async (req, res) => {
  try { const { carnet } = req.params; if (!carnet) return fallo(res, 400, 'Carnet requerido'); const result = await recepcionarService.buscarPersona({ carnet }); res.status(result.success ? 200 : 404).json(result); }
  catch (error) { console.error('Error en buscarPersona controller:', error); fallo(res, 500, 'Error interno del servidor'); }
};
const listar = (nombre) => async (_req, res) => {
  try { res.json(await recepcionarService[nombre]()); }
  catch (error) { console.error(`Error en ${nombre} controller:`, error); fallo(res, 500, 'Error interno del servidor'); }
};
const listarTamanos = listar('listarTamanos');
const listarEstantes = listar('listarEstantes');
const listarRecepciones = listar('listarRecepciones');
const listarAlianzas = listar('listarAlianzas');
const siguienteCodigo = listar('siguienteCodigo');
const crearEstante = async (req, res) => {
  try { const { estante } = req.body; if (!estante) return fallo(res, 400, 'Nombre del estante requerido'); const result = await recepcionarService.crearEstante(estante); res.status(result.success ? 201 : 400).json(result); }
  catch (error) { console.error('Error en crearEstante controller:', error); fallo(res, 500, 'Error interno del servidor'); }
};
const editarEstante = async (req, res) => {
  try { const { estante } = req.body; if (!estante) return fallo(res, 400, 'Nombre del estante requerido'); const result = await recepcionarService.editarEstante(Number(req.params.id), estante); res.status(result.success ? 200 : 400).json(result); }
  catch (error) { console.error('Error en editarEstante controller:', error); fallo(res, 500, 'Error interno del servidor'); }
};
const eliminarEstante = async (req, res) => {
  try { const result = await recepcionarService.eliminarEstante(Number(req.params.id)); res.status(result.success ? 200 : 400).json(result); }
  catch (error) { console.error('Error en eliminarEstante controller:', error); fallo(res, 500, 'Error interno del servidor'); }
};
module.exports = { crearRecepcion, buscarPersonaQuery, buscarPersona, listarTamanos, listarEstantes, listarRecepciones, crearEstante, editarEstante, eliminarEstante, siguienteCodigo, listarAlianzas };
