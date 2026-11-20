const alianzaService = require('../services/alianzaService');
const sharp = require('sharp');
const MAX = 5242880;
const valido = id => Number.isInteger(id) && id > 0 && id <= 2147483647;
const fallo = (res, status, message) => res.status(status).json({ success: false, message });
function datos(req) {
  return {
    nombre: typeof req.body?.nombre === 'string' ? req.body.nombre.trim() : '',
    ubicacion: typeof req.body?.ubicacion === 'string' ? req.body.ubicacion.trim() : ''
  };
}
async function procesarFoto(file) {
  if (!file || !file.buffer || file.size > MAX) throw new Error('Fotografía inválida');
  const imagen = sharp(file.buffer, { limitInputPixels: 25000000 });
  const meta = await imagen.metadata();
  if (!['jpeg','png','webp'].includes(meta.format)) throw new Error('Formato inválido');
  const foto = await imagen.rotate().resize({ width:1600, height:1600, fit:'inside', withoutEnlargement:true }).webp({quality:85}).toBuffer();
  if (!foto.length || foto.length > MAX) throw new Error('Foto demasiado grande');
  return foto;
}
async function listarAlianzas(_req,res) {
  try { res.json({success:true, alianzas:await alianzaService.listarAlianzas()}); }
  catch(error) { console.error(error); return fallo(res,500,'Error al listar alianzas'); }
}
async function guardar(req,res,editar) {
  const id = Number(req.params.id);
  if (editar && !valido(id)) return fallo(res,400,'ID inválido');
  const {nombre,ubicacion} = datos(req);
  if (!nombre || nombre.length > 150 || !ubicacion || ubicacion.length > 255 || (!editar && !req.file)) return fallo(res,400,'Completa nombre, ubicación y fotografía válidos');
  let foto = null;
  if (req.file) {
    try { foto = await procesarFoto(req.file); }
    catch(error) { return fallo(res,400,'Fotografía inválida o demasiado grande'); }
  }
  try {
    const alianza = editar ? await alianzaService.editarAlianza(id,nombre,ubicacion,foto) : await alianzaService.crearAlianza(nombre,ubicacion,foto);
    if (!alianza) return fallo(res,404,'Alianza no encontrada');
    res.status(editar ? 200 : 201).json({success:true,alianza,message:editar?'Alianza actualizada':'Alianza añadida'});
  } catch(error) { console.error(error); return fallo(res,500,'Error al guardar alianza'); }
}
const crearAlianza = (req,res) => guardar(req,res,false);
const editarAlianza = (req,res) => guardar(req,res,true);
async function eliminarAlianza(req,res) {
  const id=Number(req.params.id);
  if (!valido(id)) return fallo(res,400,'ID inválido');
  try {
    if (!(await alianzaService.eliminarAlianza(id))) return fallo(res,404,'Alianza no encontrada');
    res.json({success:true,message:'Alianza eliminada'});
  } catch(error) { console.error(error); if (error.code === '23503') return fallo(res,409,'No se puede eliminar: la alianza tiene recepciones asociadas'); return fallo(res,500,'Error al eliminar alianza'); }
}
async function obtenerFoto(req,res) {
  const id=Number(req.params.id);
  if (!valido(id)) return res.status(400).end();
  try {
    const imagen=await alianzaService.obtenerFoto(id);
    if (!imagen) return res.status(404).end();
    res.set('X-Content-Type-Options','nosniff');
    res.set('Cache-Control','private, no-store');
    res.type(imagen.foto_tipo).send(imagen.foto);
  } catch(error) { console.error(error); res.status(500).end(); }
}
module.exports={listarAlianzas,crearAlianza,editarAlianza,eliminarAlianza,obtenerFoto};
