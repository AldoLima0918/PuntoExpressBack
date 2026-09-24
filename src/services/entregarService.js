// src/services/entregarService.js
const { query, pool } = require("../../db");
const {
  calcularDiasYSemanas,
  calcularZonaEfectiva,
  calcularTotal,
} = require("../utils/almacenaje");

// ============================================
// BUSCAR RECEPCIONES PENDIENTES
// ============================================
const buscarRecepciones = async (q) => {
  try {
    const texto = String(q || "").trim();
    if (!texto) return { success: true, recepciones: [] };

    const like = `%${texto}%`;

    const recepcionesRes = await query(
      `SELECT DISTINCT r.id_recepcion
       FROM recepcion r
       LEFT JOIN persona_recepcion pr_deja
         ON pr_deja.id_recepcion = r.id_recepcion AND pr_deja.tipo = 'deja'
       LEFT JOIN persona p_deja ON pr_deja.id_persona = p_deja.id_persona
       LEFT JOIN persona_recepcion pr_recoge
         ON pr_recoge.id_recepcion = r.id_recepcion AND pr_recoge.tipo = 'recoge'
       LEFT JOIN persona p_recoge ON pr_recoge.id_persona = p_recoge.id_persona
       WHERE r.estado = 'pendiente'
         AND (
           r.codigo_recepcion ILIKE $1
           OR p_deja.carnet ILIKE $1
           OR p_recoge.carnet ILIKE $1
           OR (p_recoge.nombres || ' ' || p_recoge.apellidos) ILIKE $1
           OR p_recoge.celular ILIKE $1
         )
       ORDER BY r.id_recepcion DESC
       LIMIT 50`,
      [like]
    );

    const recepciones = [];
    for (const row of recepcionesRes.rows) {
      const detalle = await obtenerRecepcionCompleta(row.id_recepcion);
      if (detalle) recepciones.push(detalle);
    }

    return { success: true, recepciones };
  } catch (error) {
    console.error("Error al buscar recepciones:", error);
    throw error;
  }
};

// ============================================
// OBTENER UNA RECEPCIÓN COMPLETA
// ============================================
const obtenerRecepcionCompleta = async (idRecepcion) => {
  const cabRes = await query(
    `SELECT id_recepcion, codigo_recepcion, fecha_recepcion, zona, estado
     FROM recepcion
     WHERE id_recepcion = $1 AND estado = 'pendiente'`,
    [idRecepcion]
  );
  if (cabRes.rows.length === 0) return null;
  const cab = cabRes.rows[0];

  const personasRes = await query(
    `SELECT pr.tipo, p.carnet, p.nombres, p.apellidos, p.celular
     FROM persona_recepcion pr
     INNER JOIN persona p ON pr.id_persona = p.id_persona
     WHERE pr.id_recepcion = $1`,
    [idRecepcion]
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
            t.tamano, e.estante
     FROM tamano_recepcion tr
     INNER JOIN tamano t ON tr.id_tamano = t.id_tamano
     LEFT JOIN estante e ON tr.id_estante = e.id_estante
     WHERE tr.id_recepcion = $1
     ORDER BY tr.id_tamano_recepcion`,
    [idRecepcion]
  );

  const items = itemsRes.rows.map((it) => ({
    id_tamano_recepcion: it.id_tamano_recepcion,
    tamano: it.tamano,
    estante: it.estante,
    precio_tamano: Number(it.precio_tamano),
  }));

  const base = items.reduce((s, it) => s + it.precio_tamano, 0);
  const { dias, semanas } = calcularDiasYSemanas(cab.fecha_recepcion);
  const { total, multiplicador } = calcularTotal(base, cab.fecha_recepcion);
  const zonaEfectiva = calcularZonaEfectiva(cab.zona, dias);

  return {
    id_recepcion: cab.id_recepcion,
    codigo_recepcion: cab.codigo_recepcion,
    fecha_recepcion: cab.fecha_recepcion,
    zona: cab.zona,
    zonaEfectiva,
    dias,
    semanas,
    multiplicador,
    base,
    total,
    estado: cab.estado,
    dejo,
    recoge,
    items,
  };
};

// ============================================
// PREVIEW
// ============================================
const previewEntrega = async (idRecepcion) => {
  try {
    const detalle = await obtenerRecepcionCompleta(idRecepcion);
    if (!detalle) {
      return { success: false, message: "Recepción no encontrada o ya entregada" };
    }
    return {
      success: true,
      id_recepcion: detalle.id_recepcion,
      codigo_recepcion: detalle.codigo_recepcion,
      total: detalle.total,
      base: detalle.base,
      semanas: detalle.semanas,
      dias: detalle.dias,
      multiplicador: detalle.multiplicador,
      zonaEfectiva: detalle.zonaEfectiva,
    };
  } catch (error) {
    console.error("Error en previewEntrega:", error);
    throw error;
  }
};

// ============================================
// ENTREGAR (TRANSACCIÓN)
// ============================================
const entregar = async (idRecepcion, metodoPago, idUsuario, idCajaUsuario) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const cabRes = await client.query(
      `SELECT id_recepcion, codigo_recepcion, fecha_recepcion, estado
       FROM recepcion
       WHERE id_recepcion = $1
       FOR UPDATE`,
      [idRecepcion]
    );
    if (cabRes.rows.length === 0) {
      throw new Error("Recepción no encontrada");
    }
    const cab = cabRes.rows[0];
    if (cab.estado !== "pendiente") {
      throw new Error("La recepción ya no está pendiente");
    }

    const itemsRes = await client.query(
      `SELECT tr.id_tamano_recepcion, tr.precio_tamano
       FROM tamano_recepcion tr
       WHERE tr.id_recepcion = $1`,
      [idRecepcion]
    );
    if (itemsRes.rows.length === 0) {
      throw new Error("La recepción no tiene items");
    }

    const base = itemsRes.rows.reduce(
      (s, it) => s + Number(it.precio_tamano),
      0
    );
    const { total, semanas, multiplicador } = calcularTotal(
      base,
      cab.fecha_recepcion
    );

    const esEfectivo = metodoPago !== "QR";

    // 1. Venta
    const ventaRes = await client.query(
      `INSERT INTO venta (id_usuario, descripcion, total, metodo_pago)
       VALUES ($1, $2, $3, $4)
       RETURNING id_venta`,
      [
        idUsuario,
        `Entrega de recepción ${cab.codigo_recepcion} · ${semanas} semana(s) · x${multiplicador}`,
        total,
        esEfectivo ? "Efectivo" : "QR",
      ]
    );
    const idVenta = ventaRes.rows[0].id_venta;

    // 2. Detalle
    for (const it of itemsRes.rows) {
      await client.query(
        `INSERT INTO detalle_venta (id_venta, id_tamano_recepcion)
         VALUES ($1, $2)`,
        [idVenta, it.id_tamano_recepcion]
      );
    }

    // 3. Marcar recepción como entregada
    await client.query(
      `UPDATE recepcion SET estado = 'entregado' WHERE id_recepcion = $1`,
      [idRecepcion]
    );

    // 4. Caja solo si es efectivo
    if (esEfectivo) {
      let cajaRes;

      // Prioridad 1: la caja asignada al usuario
      if (idCajaUsuario) {
        cajaRes = await client.query(
          `SELECT id_caja, total FROM caja WHERE id_caja = $1 FOR UPDATE`,
          [idCajaUsuario]
        );
      }

      // Fallback: la última caja abierta
      if (!cajaRes || cajaRes.rows.length === 0) {
        cajaRes = await client.query(
          `SELECT id_caja, total FROM caja WHERE estado = 'abierta' ORDER BY id_caja DESC LIMIT 1 FOR UPDATE`
        );
      }

      let idCaja;
      let montoAnterior;

      if (cajaRes.rows.length === 0) {
        // No hay caja disponible: crear
        const nuevaCaja = await client.query(
          `INSERT INTO caja (nombre_caja, total, estado)
           VALUES ($1, $2, 'abierta')
           RETURNING id_caja, total`,
          ["Caja Principal", total]
        );
        idCaja = nuevaCaja.rows[0].id_caja;
        montoAnterior = 0;

        await client.query(
          `INSERT INTO transaccion_caja
             (id_caja, id_usuario, monto_nuevo, monto_anterior, monto, tipo_movimiento, descripcion, id_venta)
           VALUES ($1, $2, $3, $4, $5, 'apertura', $6, $7)`,
          [idCaja, idUsuario, total, 0, total, "Apertura de caja", idVenta]
        );
      } else {
        idCaja = cajaRes.rows[0].id_caja;
        montoAnterior = Number(cajaRes.rows[0].total);
        const montoNuevo = Number((montoAnterior + total).toFixed(2));

        await client.query(
          `UPDATE caja SET total = $1, estado = 'abierta' WHERE id_caja = $2`,
          [montoNuevo, idCaja]
        );

        await client.query(
          `INSERT INTO transaccion_caja
             (id_caja, id_usuario, monto_nuevo, monto_anterior, monto, tipo_movimiento, descripcion, id_venta)
           VALUES ($1, $2, $3, $4, $5, 'ingreso', $6, $7)`,
          [
            idCaja,
            idUsuario,
            montoNuevo,
            montoAnterior,
            total,
            `Entrega ${cab.codigo_recepcion} (Efectivo) · ${semanas} sem`,
            idVenta,
          ]
        );
      }
    }

    await client.query("COMMIT");

    return {
      success: true,
      id_venta: idVenta,
      total,
      semanas,
      multiplicador,
      metodo_pago: esEfectivo ? "Efectivo" : "QR",
      message: esEfectivo
        ? "Recepción entregada exitosamente (afecta caja)"
        : "Recepción entregada exitosamente (no afecta caja)",
    };
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error al entregar recepción:", error);
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  buscarRecepciones,
  previewEntrega,
  entregar,
};