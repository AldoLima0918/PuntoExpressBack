const { query } = require('../../db');

const campos = 'id_alianza, nombre, ubicacion';
async function listarAlianzas() {
  const result = await query(`SELECT ${campos} FROM alianza ORDER BY id_alianza ASC`);
  return result.rows;
}
async function crearAlianza(nombre, ubicacion, foto) {
  const result = await query(`INSERT INTO alianza (nombre, ubicacion, foto, foto_tipo) VALUES ($1,$2,$3,'image/webp') RETURNING ${campos}`, [nombre, ubicacion, foto]);
  return result.rows[0];
}
async function editarAlianza(id, nombre, ubicacion, foto) {
  const result = foto
    ? await query(`UPDATE alianza SET nombre=$1, ubicacion=$2, foto=$3, foto_tipo='image/webp' WHERE id_alianza=$4 RETURNING ${campos}`, [nombre, ubicacion, foto, id])
    : await query(`UPDATE alianza SET nombre=$1, ubicacion=$2 WHERE id_alianza=$3 RETURNING ${campos}`, [nombre, ubicacion, id]);
  return result.rows[0];
}
async function eliminarAlianza(id) {
  const result = await query('DELETE FROM alianza WHERE id_alianza=$1 RETURNING id_alianza', [id]);
  return result.rows.length > 0;
}
async function obtenerFoto(id) {
  const result = await query('SELECT foto, foto_tipo FROM alianza WHERE id_alianza=$1', [id]);
  return result.rows[0];
}
module.exports = { listarAlianzas, crearAlianza, editarAlianza, eliminarAlianza, obtenerFoto };
