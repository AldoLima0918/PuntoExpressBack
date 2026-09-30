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
// ESTADO DE LA CAJA DEL USUARIO
// ============================================
const estadoCajaUsuario = async (idUsuario, idCajaUsuario) => {
  try {
    if (idCajaUsuario) {
      const res = await query(
        `SELECT id_caja, nombre_caja, total, estado
         FROM caja WHERE id_caja = $1`,
        [idCajaUsuario]
      );
      if (res.rows.length === 0) {
        return {
          success: true,
          tieneCaja: false,
          abierta: false,
          caja: null,
          message: "La caja asignada no existe.",
        };
      }
      const c = res.rows[0];
      return {
        success: true,
        tieneCaja: true,
        abierta: c.estado === "abierta",
        caja: {
          id_caja: c.id_caja,
          nombre_caja: c.nombre_caja,
          total: Number(c.total ?? 0),
          estado: c.estado,
        },
        message:
          c.estado === "abierta"
            ? "Caja abierta. Puedes registrar entregas."
            : "Caja cerrada. Debes abrir la caja para poder entregar.",
      };
    }

    const res = await query(
      `SELECT id_caja, nombre_caja, total, estado
       FROM caja
       WHERE estado = 'abierta'
       ORDER BY id_caja DESC LIMIT 1`
    );

    if (res.rows.length === 0) {
      return {
        success: true,
        tieneCaja: false,
        abierta: false,
        caja: null,
        message: "No hay cajas abiertas. Debes abrir una caja para poder entregar en efectivo.",
      };
    }

    const c = res.rows[0];
    return {
      success: true,
      tieneCaja: true,
      abierta: true,
      caja: {
        id_caja: c.id_caja,
        nombre_caja: c.nombre_caja,
        total: Number(c.total ?? 0),
        estado: c.estado,
      },
      message: "Caja abierta. Puedes registrar entregas.",
    };
  } catch (error) {
    console.error("Error al consultar estado de caja:", error);
    throw error;
  }
};

// ============================================
// VALIDAR CAJA ANTES DE ENTREGAR
// ============================================
async function validarCajaAbierta(client, idCajaUsuario, esEfectivo) {
  if (!esEfectivo) return { ok: true, idCaja: null };

  if (idCajaUsuario) {
    const res = await client.query(
      `SELECT id_caja, estado FROM caja WHERE id_caja = $1 FOR UPDATE`,
      [idCajaUsuario]
    );
    if (res.rows.length === 0) {
      return { ok: false, message: "La caja asignada no existe." };
    }
    const c = res.rows[0];
    if (c.estado !== "abierta") {
      return {
        ok: false,
        message:
          "La caja está cerrada. Debes abrir la caja para poder registrar entregas en efectivo.",
      };
    }
    return { ok: true, idCaja: c.id_caja };
  }

  const res = await client.query(
    `SELECT id_caja, estado FROM caja WHERE estado = 'abierta' ORDER BY id_caja DESC LIMIT 1 FOR UPDATE`
  );
  if (res.rows.length === 0) {
    return {
      ok: false,
      message:
        "No hay cajas abiertas. Debes abrir una caja para poder registrar entregas en efectivo.",
    };
  }
  return { ok: true, idCaja: res.rows[0].id_caja };
}

// ============================================
// ENTREGAR (TRANSACCIÓN) — UNA SOLA RECEPCIÓN
// ============================================
const entregar = async (idRecepcion, metodoPago, idUsuario, idCajaUsuario) => {
  return entregarMultiple([idRecepcion], metodoPago, idUsuario, idCajaUsuario);
};

// ============================================
// ENTREGAR MÚLTIPLES RECEPCIONES (TRANSACCIÓN)
// ============================================
const entregarMultiple = async (
  idsRecepcion,
  metodoPago,
  idUsuario,
  idCajaUsuario
) => {
  if (!Array.isArray(idsRecepcion) || idsRecepcion.length === 0) {
    throw new Error("Debes seleccionar al menos una recepción");
  }

  // Normalizar ids únicos
  const idsUnicos = [...new Set(idsRecepcion.map((n) => Number(n)))];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Bloquear y validar TODAS las recepciones
    const cabRes = await client.query(
      `SELECT id_recepcion, codigo_recepcion, fecha_recepcion, estado
       FROM recepcion
       WHERE id_recepcion = ANY($1::int[])
       FOR UPDATE`,
      [idsUnicos]
    );

    if (cabRes.rows.length !== idsUnicos.length) {
      throw new Error("Una o más recepciones no fueron encontradas");
    }

    for (const cab of cabRes.rows) {
      if (cab.estado !== "pendiente") {
        throw new Error(
          `La recepción ${cab.codigo_recepcion} ya no está pendiente`
        );
      }
    }

    // 2. Obtener TODOS los items de TODAS las recepciones
    const itemsRes = await client.query(
      `SELECT tr.id_tamano_recepcion, tr.precio_tamano, tr.id_recepcion
       FROM tamano_recepcion tr
       WHERE tr.id_recepcion = ANY($1::int[])`,
      [idsUnicos]
    );

    if (itemsRes.rows.length === 0) {
      throw new Error("Las recepciones seleccionadas no tienen items");
    }

    // 3. Calcular total combinado
    let totalGeneral = 0;
    const detallesPorRecepcion = [];

    for (const cab of cabRes.rows) {
      const itemsRecepcion = itemsRes.rows.filter(
        (it) => it.id_recepcion === cab.id_recepcion
      );
      const baseRecepcion = itemsRecepcion.reduce(
        (s, it) => s + Number(it.precio_tamano),
        0
      );
      const { total, semanas, multiplicador } = calcularTotal(
        baseRecepcion,
        cab.fecha_recepcion
      );
      totalGeneral += total;
      detallesPorRecepcion.push({
        id_recepcion: cab.id_recepcion,
        codigo_recepcion: cab.codigo_recepcion,
        base: baseRecepcion,
        total,
        semanas,
        multiplicador,
        items: itemsRecepcion,
      });
    }
    totalGeneral = Number(totalGeneral.toFixed(2));

    const esEfectivo = metodoPago !== "QR";

    // 4. Validar caja si es efectivo
    const cajaValida = await validarCajaAbierta(client, idCajaUsuario, esEfectivo);
    if (!cajaValida.ok) {
      throw new Error(cajaValida.message);
    }
    const idCajaObjetivo = cajaValida.idCaja;

    // 5. Crear UNA sola venta con el total combinado
    const descripcion = detallesPorRecepcion
      .map(
        (d) =>
          `${d.codigo_recepcion} (${d.semanas} sem · x${d.multiplicador} · ${d.items.length} paq)`
      )
      .join(" | ");

    const ventaRes = await client.query(
      `INSERT INTO venta (id_usuario, descripcion, total, metodo_pago)
       VALUES ($1, $2, $3, $4)
       RETURNING id_venta`,
      [
        idUsuario,
        `Entrega múltiple: ${descripcion}`,
        totalGeneral,
        esEfectivo ? "Efectivo" : "QR",
      ]
    );
    const idVenta = ventaRes.rows[0].id_venta;

    // 6. Detalle de venta (todos los items de todas las recepciones)
    for (const it of itemsRes.rows) {
      await client.query(
        `INSERT INTO detalle_venta (id_venta, id_tamano_recepcion)
         VALUES ($1, $2)`,
        [idVenta, it.id_tamano_recepcion]
      );
    }

    // 7. Marcar TODAS las recepciones como entregadas
    await client.query(
      `UPDATE recepcion SET estado = 'entregado'
       WHERE id_recepcion = ANY($1::int[])`,
      [idsUnicos]
    );

    // 8. Afectar caja solo si es efectivo
    if (esEfectivo && idCajaObjetivo) {
      const cajaRes = await client.query(
        `SELECT id_caja, total FROM caja WHERE id_caja = $1 FOR UPDATE`,
        [idCajaObjetivo]
      );

      if (cajaRes.rows.length === 0) {
        throw new Error("La caja seleccionada no existe");
      }

      const idCaja = cajaRes.rows[0].id_caja;
      const montoAnterior = Number(cajaRes.rows[0].total);
      const montoNuevo = Number((montoAnterior + totalGeneral).toFixed(2));

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
          totalGeneral,
          `Entrega múltiple (${idsUnicos.length} recepciones) - Efectivo`,
          idVenta,
        ]
      );
    }

    await client.query("COMMIT");

    return {
      success: true,
      id_venta: idVenta,
      total: totalGeneral,
      recepciones_entregadas: idsUnicos.length,
      codigos: detallesPorRecepcion.map((d) => d.codigo_recepcion),
      detalles: detallesPorRecepcion.map((d) => ({
        id_recepcion: d.id_recepcion,
        codigo_recepcion: d.codigo_recepcion,
        total: d.total,
        semanas: d.semanas,
        multiplicador: d.multiplicador,
      })),
      metodo_pago: esEfectivo ? "Efectivo" : "QR",
      message: esEfectivo
        ? `Se entregaron ${idsUnicos.length} recepción(es) (afecta caja)`
        : `Se entregaron ${idsUnicos.length} recepción(es) (no afecta caja)`,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error al entregar recepciones:", error);
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  buscarRecepciones,
  previewEntrega,
  entregar,
  entregarMultiple,
  estadoCajaUsuario,
};