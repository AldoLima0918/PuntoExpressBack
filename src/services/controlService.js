const { query } = require("../../db");
const {
  calcularDiasYSemanas,
  calcularZonaEfectiva,
  calcularTotal,
} = require("../utils/almacenaje");

// Listado completo de alianzas para el filtro, incluso sin recepciones activas.
const listarAlianzasControl = async () => {
  const res = await query(
    "SELECT id_alianza, nombre, ubicacion FROM alianza ORDER BY nombre ASC"
  );
  return { success: true, alianzas: res.rows };
};

const listarRecepcionesActivas = async () => {
  try {
    const cabeceras = await query(
      `SELECT id_recepcion, codigo_recepcion,
              to_char(fecha_recepcion, 'YYYY-MM-DD"T"HH24:MI:SS') AS fecha_recepcion,
              zona, estado, monto_pagado_inicial, metodo_pago_inicial,
              id_venta_inicial, fecha_pago_inicial, tipo_operacion,
              id_alianza, estado_traslado, alianza_nombre, alianza_ubicacion
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
      const dejo = dejoRow ? {
        carnet: dejoRow.carnet, nombres: dejoRow.nombres,
        apellidos: dejoRow.apellidos, celular: dejoRow.celular,
      } : null;
      const recoge = recogeRow ? {
        carnet: recogeRow.carnet, nombres: recogeRow.nombres,
        apellidos: recogeRow.apellidos, celular: recogeRow.celular,
      } : null;

      const itemsRes = await query(
        `SELECT tr.id_tamano_recepcion, tr.precio_tamano, tr.descripcion,
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
        tamano: it.tamano, estante: it.estante, estante_id: it.id_estante,
        precio_tamano: Number(it.precio_tamano), descripcion: it.descripcion,
      }));
      const base = items.reduce((s, it) => s + it.precio_tamano, 0);
      const { dias, semanas } = calcularDiasYSemanas(r.fecha_recepcion);
      const { total, multiplicador } = calcularTotal(base, r.fecha_recepcion);
      const zonaEfectiva = calcularZonaEfectiva(r.zona, dias);
      const montoPagadoInicial = Number(r.monto_pagado_inicial ?? 0);
      const saldoPendiente = Number(Math.max(0, total - montoPagadoInicial).toFixed(2));
      recepciones.push({
        id_recepcion: r.id_recepcion, codigo_recepcion: r.codigo_recepcion,
        fecha_recepcion: r.fecha_recepcion, zona: r.zona, zonaEfectiva,
        dias, semanas, multiplicador, base, total,
        monto_pagado_inicial: montoPagadoInicial,
        metodo_pago_inicial: r.metodo_pago_inicial ?? null,
        id_venta_inicial: r.id_venta_inicial ?? null,
        fecha_pago_inicial: r.fecha_pago_inicial ?? null,
        saldo_pendiente: saldoPendiente, estado: r.estado,
        tipo_operacion: r.tipo_operacion ?? 'local',
        id_alianza: r.id_alianza ?? null,
        estado_traslado: r.estado_traslado ?? null,
        alianza_nombre: r.alianza_nombre ?? null,
        alianza_ubicacion: r.alianza_ubicacion ?? null,
        dejo, recoge, items,
      });
    }
    return { success: true, recepciones };
  } catch (error) {
    console.error("Error al listar recepciones activas:", error);
    throw error;
  }
};

// Transiciones permitidas: pendiente_envio -> en_transito -> recibido.
// Un traslado recibido no equivale a entregar el paquete al destinatario.
const cambiarEstadoTraslado = async (idRecepcion, estadoTraslado) => {
  if (!Number.isInteger(idRecepcion) || idRecepcion <= 0 || idRecepcion > 2147483647) {
    return { success: false, message: "ID de recepción inválido" };
  }
  if (!["en_transito", "recibido"].includes(estadoTraslado)) {
    return { success: false, message: "Estado de traslado inválido" };
  }
  const anterior = estadoTraslado === 'en_transito' ? 'pendiente_envio' : 'en_transito';
  const actualizado = await query(
    `UPDATE recepcion
     SET estado_traslado = $1
     WHERE id_recepcion = $2
       AND estado = 'pendiente'
       AND tipo_operacion = 'salida'
       AND estado_traslado = $3
     RETURNING id_recepcion, estado_traslado`,
    [estadoTraslado, idRecepcion, anterior]
  );
  if (!actualizado.rows.length) {
    return {
      success: false,
      message: "No se pudo actualizar: el paquete ya cambió de estado o no admite esta transición. Actualiza la página.",
    };
  }
  return {
    success: true, id_recepcion: idRecepcion,
    estado_traslado: estadoTraslado,
    message: estadoTraslado === 'en_transito'
      ? 'Envío marcado como despachado'
      : 'Se confirmó la recepción en la alianza',
  };
};

const editarEstanteItem = async (idTamanoRecepcion, idEstante) => {
  try {
    const itemRes = await query(
      `SELECT id_tamano_recepcion FROM tamano_recepcion WHERE id_tamano_recepcion = $1`,
      [idTamanoRecepcion]
    );
    if (itemRes.rows.length === 0) return { success: false, message: "Item no encontrado" };
    const estanteRes = await query(
      `SELECT id_estante, estante FROM estante WHERE id_estante = $1`,
      [idEstante]
    );
    if (estanteRes.rows.length === 0) return { success: false, message: "Estante no encontrado" };
    await query(
      `UPDATE tamano_recepcion SET id_estante = $1 WHERE id_tamano_recepcion = $2`,
      [idEstante, idTamanoRecepcion]
    );
    return { success: true, message: `Estante actualizado a ${estanteRes.rows[0].estante}` };
  } catch (error) {
    console.error("Error al editar estante del item:", error);
    throw error;
  }
};

const listarEstantes = async () => {
  try {
    const result = await query(`SELECT id_estante, estante FROM estante ORDER BY estante`);
    return { success: true, estantes: result.rows.map((r) => ({
      id_estante: r.id_estante, estante: r.estante,
    })) };
  } catch (error) {
    console.error("Error al listar estantes:", error);
    throw error;
  }
};

module.exports = {
  listarRecepcionesActivas, listarAlianzasControl, cambiarEstadoTraslado,
  editarEstanteItem, listarEstantes,
};
