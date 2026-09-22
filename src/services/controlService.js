// src/services/controlService.js
const { query } = require("../../db");
const {
  calcularDiasYSemanas,
  calcularZonaEfectiva,
  calcularTotal,
} = require("../utils/almacenaje");

// ============================================
// LISTAR RECEPCIONES PENDIENTES (para control)
// ============================================
const listarRecepcionesActivas = async () => {
  try {
    const cabeceras = await query(
      `SELECT id_recepcion, codigo_recepcion, fecha_recepcion, zona, estado
       FROM recepcion
       WHERE estado = 'pendiente'
       ORDER BY fecha_recepcion ASC`
    );

    const recepciones = [];
    for (const r of cabeceras.rows) {
      const personasRes = await query(
        `SELECT pr.tipo, p.carnet, p.nombres, p.apellidos, p.celular
         FROM persona_recepcion pr
         INNER JOIN persona p ON pr.id_persona = p.id_persona
         WHERE pr.id_recepcion = $1`,
        [r.id_recepcion]
      );
      const dejoRow = personasRes.rows.find((p) => p.tipo === "deja") || null;
      const recogeRow = personasRes.rows.find((p) => p.tipo === "recoge") || null;

      const dejo = dejoRow
        ? {
            carnet: dejoRow.carnet,
            nombres: dejoRow.nombres,
            apellidos: dejoRow.apellidos,
            celular: dejoRow.celular,
          }
        : null;
      const recoge = recogeRow
        ? {
            carnet: recogeRow.carnet,
            nombres: recogeRow.nombres,
            apellidos: recogeRow.apellidos,
            celular: recogeRow.celular,
          }
        : null;

      const itemsRes = await query(
        `SELECT tr.id_tamano_recepcion, tr.precio_tamano,
                t.tamano, e.estante, e.id_estante
         FROM tamano_recepcion tr
         INNER JOIN tamano t ON tr.id_tamano = t.id_tamano
         LEFT JOIN estante e ON tr.id_estante = e.id_estante
         WHERE tr.id_recepcion = $1
         ORDER BY tr.id_tamano_recepcion`,
        [r.id_recepcion]
      );

      const items = itemsRes.rows.map((it) => ({
        id_tamano_recepcion: it.id_tamano_recepcion,
        tamano: it.tamano,
        estante: it.estante,
        estante_id: it.id_estante,
        precio_tamano: Number(it.precio_tamano),
      }));

      const base = items.reduce((s, it) => s + it.precio_tamano, 0);
      const { dias, semanas } = calcularDiasYSemanas(r.fecha_recepcion);
      const { total, multiplicador } = calcularTotal(base, r.fecha_recepcion);
      const zonaEfectiva = calcularZonaEfectiva(r.zona, dias);

      recepciones.push({
        id_recepcion: r.id_recepcion,
        codigo_recepcion: r.codigo_recepcion,
        fecha_recepcion: r.fecha_recepcion,
        zona: r.zona,
        zonaEfectiva,
        dias,
        semanas,
        multiplicador,
        base,
        total,
        estado: r.estado,
        dejo,
        recoge,
        items,
      });
    }

    return { success: true, recepciones };
  } catch (error) {
    console.error("Error al listar recepciones activas:", error);
    throw error;
  }
};

// ============================================
// EDITAR ESTANTE DE UN ITEM
// ============================================
const editarEstanteItem = async (idTamanoRecepcion, idEstante) => {
  try {
    const itemRes = await query(
      `SELECT id_tamano_recepcion FROM tamano_recepcion WHERE id_tamano_recepcion = $1`,
      [idTamanoRecepcion]
    );
    if (itemRes.rows.length === 0) {
      return { success: false, message: "Item no encontrado" };
    }

    const estanteRes = await query(
      `SELECT id_estante, estante FROM estante WHERE id_estante = $1`,
      [idEstante]
    );
    if (estanteRes.rows.length === 0) {
      return { success: false, message: "Estante no encontrado" };
    }

    await query(
      `UPDATE tamano_recepcion SET id_estante = $1 WHERE id_tamano_recepcion = $2`,
      [idEstante, idTamanoRecepcion]
    );

    return {
      success: true,
      message: `Estante actualizado a ${estanteRes.rows[0].estante}`,
    };
  } catch (error) {
    console.error("Error al editar estante del item:", error);
    throw error;
  }
};

// ============================================
// LISTAR ESTANTES
// ============================================
const listarEstantes = async () => {
  try {
    const result = await query(
      `SELECT id_estante, estante FROM estante ORDER BY estante`
    );
    return {
      success: true,
      estantes: result.rows.map((r) => ({
        id_estante: r.id_estante,
        estante: r.estante,
      })),
    };
  } catch (error) {
    console.error("Error al listar estantes:", error);
    throw error;
  }
};

module.exports = {
  listarRecepcionesActivas,
  editarEstanteItem,
  listarEstantes,
};