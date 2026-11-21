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
    const textoCodigo = texto.replace(/\s+/g, "");
    const esCodigo = /^[A-Za-z]{1,12}-[A-Za-z0-9-]+$/.test(textoCodigo);
    const like = `%${texto}%`;
    const digitos = texto.replace(/\D/g, "");
    const terminosNombre = texto
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .split(/\s+/)
      .filter(Boolean);
    // Los códigos se buscan exactamente; las búsquedas por persona
    // toleran espacios adicionales, tildes y nombres en distinto orden.
    const directasRes = esCodigo
      ? await query(
          `SELECT r.id_recepcion
           FROM recepcion r
           WHERE r.estado = 'pendiente'
             AND COALESCE(r.tipo_operacion, 'local') <> 'salida'
              AND UPPER(REPLACE(r.codigo_recepcion, ' ', '')) = UPPER($1)
           ORDER BY r.id_recepcion DESC
           LIMIT 50`,
          [textoCodigo]
        )
      : await query(
          `SELECT DISTINCT r.id_recepcion
           FROM recepcion r
           LEFT JOIN persona_recepcion pr_deja
             ON pr_deja.id_recepcion = r.id_recepcion AND pr_deja.tipo = 'deja'
           LEFT JOIN persona p_deja ON p_deja.id_persona = pr_deja.id_persona
           LEFT JOIN persona_recepcion pr_recoge
             ON pr_recoge.id_recepcion = r.id_recepcion AND pr_recoge.tipo = 'recoge'
           LEFT JOIN persona p_recoge ON p_recoge.id_persona = pr_recoge.id_persona
           LEFT JOIN tamano_recepcion tr ON tr.id_recepcion = r.id_recepcion
           WHERE r.estado = 'pendiente'
             AND COALESCE(r.tipo_operacion, 'local') <> 'salida'
             AND (
               r.codigo_recepcion ILIKE $1
               OR p_deja.carnet ILIKE $1
               OR p_recoge.carnet ILIKE $1
               OR (p_recoge.nombres || ' ' || p_recoge.apellidos) ILIKE $1
               OR p_recoge.nombres ILIKE $1
               OR p_recoge.apellidos ILIKE $1
               OR p_recoge.celular ILIKE $1
               OR tr.descripcion ILIKE $1
               OR ($2 <> '' AND REPLACE(REPLACE(REPLACE(p_recoge.celular, ' ', ''), '-', ''), '+', '') LIKE '%' || $2 || '%')
               OR (
                 cardinality($3::text[]) > 0
                 AND NOT EXISTS (
                   SELECT 1
                   FROM unnest($3::text[]) AS termino(palabra)
                   WHERE translate(
                     UPPER(concat_ws(' ', p_recoge.nombres, p_recoge.apellidos)),
                     'ÁÉÍÓÚÜÑ', 'AEIOUUN'
                   ) NOT LIKE '%' || termino.palabra || '%'
                 )
               )
             )
           ORDER BY r.id_recepcion DESC
           LIMIT 50`,
          [like, digitos, terminosNombre]
        );
    if (directasRes.rows.length === 0) {
      return { success: true, recepciones: [] };
    }
    const idsDirectos = directasRes.rows.map((row) => row.id_recepcion);
    // Buscar el destinatario (tipo recoge) de las recepciones encontradas.
    // Luego incluir TODAS sus recepciones pendientes, no solo la del código.
    // La asociación se hace por ID real de persona, no por similitud de nombre.
    const vinculadasRes = await query(
      `WITH destinatarios AS (
         SELECT DISTINCT pr.id_persona
         FROM persona_recepcion pr
         WHERE pr.tipo = 'recoge'
           AND pr.id_recepcion = ANY($1::int[])
       )
       SELECT DISTINCT r.id_recepcion,
         CASE WHEN r.id_recepcion = ANY($1::int[]) THEN 0 ELSE 1 END AS prioridad
       FROM recepcion r
       LEFT JOIN persona_recepcion pr
         ON pr.id_recepcion = r.id_recepcion AND pr.tipo = 'recoge'
       WHERE r.estado = 'pendiente'
         AND COALESCE(r.tipo_operacion, 'local') <> 'salida'
         AND (
           r.id_recepcion = ANY($1::int[])
           OR pr.id_persona IN (SELECT id_persona FROM destinatarios)
         )
       ORDER BY prioridad ASC, r.id_recepcion DESC`,
      [idsDirectos]
    );
    const recepciones = [];
    for (const row of vinculadasRes.rows) {
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
    `SELECT id_recepcion, codigo_recepcion,
            fecha_recepcion, zona, estado,
            monto_pagado_inicial,
            metodo_pago_inicial,
            id_venta_inicial,
            fecha_pago_inicial
     FROM recepcion
     WHERE id_recepcion = $1 AND estado = 'pendiente'
       AND COALESCE(tipo_operacion, 'local') <> 'salida'`,
    [idRecepcion]
  );
  if (cabRes.rows.length === 0) return null;
  const cab = cabRes.rows[0];
  const personasRes = await query(
    `SELECT pr.tipo, p.carnet, p.nombres,
            p.apellidos, p.celular
     FROM persona_recepcion pr
     INNER JOIN persona p
       ON pr.id_persona = p.id_persona
     WHERE pr.id_recepcion = $1`,
    [idRecepcion]
  );
  const dejoRow =
    personasRes.rows.find((p) => p.tipo === "deja") || null;
  const recogeRow =
    personasRes.rows.find((p) => p.tipo === "recoge") || null;
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
    `SELECT tr.id_tamano_recepcion,
            tr.precio_tamano,
            tr.descripcion,
            t.tamano,
            e.estante
     FROM tamano_recepcion tr
     INNER JOIN tamano t
       ON tr.id_tamano = t.id_tamano
     LEFT JOIN estante e
       ON tr.id_estante = e.id_estante
     WHERE tr.id_recepcion = $1
     ORDER BY tr.id_tamano_recepcion`,
    [idRecepcion]
  );
  const items = itemsRes.rows.map((it) => ({
    id_tamano_recepcion: it.id_tamano_recepcion,
    tamano: it.tamano,
    estante: it.estante,
    precio_tamano: Number(it.precio_tamano),
    descripcion: it.descripcion,
  }));
  const base = items.reduce(
    (s, it) => s + it.precio_tamano,
    0
  );
  const { dias, semanas } = calcularDiasYSemanas(
    cab.fecha_recepcion
  );
  const { total, multiplicador } = calcularTotal(
    base,
    cab.fecha_recepcion
  );
  const zonaEfectiva = calcularZonaEfectiva(
    cab.zona,
    dias
  );
  const montoPagadoInicial = Number(
    cab.monto_pagado_inicial ?? 0
  );
  const saldoPendiente = Number(
    Math.max(0, total - montoPagadoInicial).toFixed(2)
  );
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
    monto_pagado_inicial: montoPagadoInicial,
    metodo_pago_inicial: cab.metodo_pago_inicial ?? null,
    id_venta_inicial: cab.id_venta_inicial ?? null,
    fecha_pago_inicial: cab.fecha_pago_inicial ?? null,
    saldo_pendiente: saldoPendiente,
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
    const detalle = await obtenerRecepcionCompleta(
      idRecepcion
    );
    if (!detalle) {
      return {
        success: false,
        message: "Recepción no encontrada o ya entregada",
      };
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
      monto_pagado_inicial: detalle.monto_pagado_inicial,
      saldo_pendiente: detalle.saldo_pendiente,
    };
  } catch (error) {
    console.error("Error en previewEntrega:", error);
    throw error;
  }
};
// ============================================
// ESTADO DE LA CAJA DEL USUARIO
// ============================================
const estadoCajaUsuario = async (
  idUsuario,
  idCajaUsuario
) => {
  try {
    if (idCajaUsuario) {
      const res = await query(
        `SELECT id_caja, nombre_caja, total, estado
         FROM caja
         WHERE id_caja = $1`,
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
        message:
          "No hay cajas abiertas. Debes abrir una caja para poder entregar en efectivo.",
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
    console.error(
      "Error al consultar estado de caja:",
      error
    );
    throw error;
  }
};
// ============================================
// VALIDAR CAJA ANTES DE ENTREGAR
// ============================================
async function validarCajaAbierta(
  client,
  idCajaUsuario,
  esEfectivo
) {
  if (!esEfectivo) {
    return { ok: true, idCaja: null };
  }
  if (idCajaUsuario) {
    const res = await client.query(
      `SELECT id_caja, estado
       FROM caja
       WHERE id_caja = $1
       FOR UPDATE`,
      [idCajaUsuario]
    );
    if (res.rows.length === 0) {
      return {
        ok: false,
        message: "La caja asignada no existe.",
      };
    }
    const c = res.rows[0];
    if (c.estado !== "abierta") {
      return {
        ok: false,
        message:
          "La caja está cerrada. Debes abrir la caja para poder registrar entregas en efectivo.",
      };
    }
    return {
      ok: true,
      idCaja: c.id_caja,
    };
  }
  const res = await client.query(
    `SELECT id_caja, estado
     FROM caja
     WHERE estado = 'abierta'
     ORDER BY id_caja DESC
     LIMIT 1
     FOR UPDATE`
  );
  if (res.rows.length === 0) {
    return {
      ok: false,
      message:
        "No hay cajas abiertas. Debes abrir una caja para poder registrar entregas en efectivo.",
    };
  }
  return {
    ok: true,
    idCaja: res.rows[0].id_caja,
  };
}
// ============================================
// ENTREGAR UNA SOLA RECEPCIÓN
// ============================================
const entregar = async (
  idRecepcion,
  metodoPago,
  idUsuario,
  idCajaUsuario
) => {
  return entregarMultiple(
    [idRecepcion],
    metodoPago,
    idUsuario,
    idCajaUsuario
  );
};
// ============================================
// ENTREGAR MÚLTIPLES RECEPCIONES
// ============================================
const entregarMultiple = async (
  idsRecepcion,
  metodoPago,
  idUsuario,
  idCajaUsuario
) => {
  if (
    !Array.isArray(idsRecepcion) ||
    idsRecepcion.length === 0
  ) {
    throw new Error(
      "Debes seleccionar al menos una recepción"
    );
  }
  const idsUnicos = [
    ...new Set(
      idsRecepcion.map((n) => Number(n))
    ),
  ];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const cabRes = await client.query(
      `SELECT id_recepcion, codigo_recepcion,
              fecha_recepcion, estado, tipo_operacion,
              monto_pagado_inicial,
              metodo_pago_inicial
       FROM recepcion
       WHERE id_recepcion = ANY($1::int[])
       FOR UPDATE`,
      [idsUnicos]
    );
    if (cabRes.rows.length !== idsUnicos.length) {
      throw new Error(
        "Una o más recepciones no fueron encontradas"
      );
    }
    for (const cab of cabRes.rows) {
      if (cab.estado !== "pendiente" || cab.tipo_operacion === "salida") {
        throw new Error(
          `La recepción ${cab.codigo_recepcion} no está disponible para entrega local`
        );
      }
    }
    const itemsRes = await client.query(
      `SELECT tr.id_tamano_recepcion,
              tr.precio_tamano,
              tr.id_recepcion
       FROM tamano_recepcion tr
       WHERE tr.id_recepcion = ANY($1::int[])`,
      [idsUnicos]
    );
    if (itemsRes.rows.length === 0) {
      throw new Error(
        "Las recepciones seleccionadas no tienen items"
      );
    }
    let totalGeneral = 0;
    let totalPagadoInicial = 0;
    let saldoGeneral = 0;
    const detallesPorRecepcion = [];
    for (const cab of cabRes.rows) {
      const itemsRecepcion = itemsRes.rows.filter(
        (it) => it.id_recepcion === cab.id_recepcion
      );
      const baseRecepcion = itemsRecepcion.reduce(
        (s, it) => s + Number(it.precio_tamano),
        0
      );
      const {
        total,
        semanas,
        multiplicador,
      } = calcularTotal(
        baseRecepcion,
        cab.fecha_recepcion
      );
      const montoPagadoInicial = Number(
        cab.monto_pagado_inicial ?? 0
      );
      const saldoRecepcion = Number(
        Math.max(
          0,
          total - montoPagadoInicial
        ).toFixed(2)
      );
      totalGeneral += total;
      totalPagadoInicial += montoPagadoInicial;
      saldoGeneral += saldoRecepcion;
      detallesPorRecepcion.push({
        id_recepcion: cab.id_recepcion,
        codigo_recepcion: cab.codigo_recepcion,
        base: baseRecepcion,
        total,
        semanas,
        multiplicador,
        monto_pagado_inicial: montoPagadoInicial,
        metodo_pago_inicial:
          cab.metodo_pago_inicial ?? null,
        saldo_pendiente: saldoRecepcion,
        items: itemsRecepcion,
      });
    }
    totalGeneral = Number(
      totalGeneral.toFixed(2)
    );
    totalPagadoInicial = Number(
      totalPagadoInicial.toFixed(2)
    );
    saldoGeneral = Number(
      saldoGeneral.toFixed(2)
    );
    const esEfectivo = metodoPago !== "QR";
    const cajaValida = await validarCajaAbierta(
      client,
      idCajaUsuario,
      esEfectivo && saldoGeneral > 0
    );
    if (!cajaValida.ok) {
      throw new Error(cajaValida.message);
    }
    const idCajaObjetivo = cajaValida.idCaja;
    const descripcionDetalle = detallesPorRecepcion
      .map((d) => {
        const partes = [
          `${d.codigo_recepcion}`,
          `${d.semanas} sem`,
          `x${d.multiplicador}`,
          `${d.items.length} paq`,
        ];
        if (d.monto_pagado_inicial > 0) {
          partes.push(
            `pagó ${d.monto_pagado_inicial.toFixed(2)}`
          );
        }
        partes.push(
          `saldo ${d.saldo_pendiente.toFixed(2)}`
        );
        return `(${partes.join(" · ")})`;
      })
      .join(" | ");
    const descripcionVenta =
      detallesPorRecepcion.length > 1
        ? `Entrega múltiple: ${descripcionDetalle}`
        : `Entrega ${descripcionDetalle}`;
    let idVenta = null;
    if (saldoGeneral > 0) {
      const ventaRes = await client.query(
        `INSERT INTO venta
           (id_usuario, descripcion, total, metodo_pago)
         VALUES ($1, $2, $3, $4)
         RETURNING id_venta`,
        [
          idUsuario,
          descripcionVenta,
          saldoGeneral,
          esEfectivo ? "Efectivo" : "QR",
        ]
      );
      idVenta = ventaRes.rows[0].id_venta;
      for (const it of itemsRes.rows) {
        await client.query(
          `INSERT INTO detalle_venta
             (id_venta, id_tamano_recepcion)
           VALUES ($1, $2)`,
          [
            idVenta,
            it.id_tamano_recepcion,
          ]
        );
      }
      if (esEfectivo && idCajaObjetivo) {
        const cajaRes = await client.query(
          `SELECT id_caja, total
           FROM caja
           WHERE id_caja = $1
           FOR UPDATE`,
          [idCajaObjetivo]
        );
        if (cajaRes.rows.length === 0) {
          throw new Error(
            "La caja seleccionada no existe"
          );
        }
        const idCaja = cajaRes.rows[0].id_caja;
        const montoAnterior = Number(
          cajaRes.rows[0].total
        );
        const montoNuevo = Number(
          (
            montoAnterior + saldoGeneral
          ).toFixed(2)
        );
        await client.query(
          `UPDATE caja
           SET total = $1,
               estado = 'abierta'
           WHERE id_caja = $2`,
          [
            montoNuevo,
            idCaja,
          ]
        );
        await client.query(
          `INSERT INTO transaccion_caja
             (
               id_caja,
               id_usuario,
               monto_nuevo,
               monto_anterior,
               monto,
               tipo_movimiento,
               descripcion,
               id_venta
             )
           VALUES (
             $1, $2, $3, $4, $5,
             'ingreso', $6, $7
           )`,
          [
            idCaja,
            idUsuario,
            montoNuevo,
            montoAnterior,
            saldoGeneral,
            descripcionVenta,
            idVenta,
          ]
        );
      }
    }
    await client.query(
      `UPDATE recepcion
       SET estado = 'entregado'
       WHERE id_recepcion = ANY($1::int[])`,
      [idsUnicos]
    );
    await client.query("COMMIT");
    return {
      success: true,
      id_venta: idVenta,
      total: totalGeneral,
      total_pagado_inicial: totalPagadoInicial,
      saldo_cobrado: saldoGeneral,
      recepciones_entregadas: idsUnicos.length,
      codigos: detallesPorRecepcion.map(
        (d) => d.codigo_recepcion
      ),
      detalles: detallesPorRecepcion.map(
        (d) => ({
          id_recepcion: d.id_recepcion,
          codigo_recepcion: d.codigo_recepcion,
          total: d.total,
          semanas: d.semanas,
          multiplicador: d.multiplicador,
          monto_pagado_inicial:
            d.monto_pagado_inicial,
          saldo_pendiente: d.saldo_pendiente,
        })
      ),
      metodo_pago:
        saldoGeneral > 0
          ? esEfectivo
            ? "Efectivo"
            : "QR"
          : null,
      message:
        saldoGeneral > 0
          ? esEfectivo
            ? `Se entregaron ${idsUnicos.length} recepción(es). Cobrado ${saldoGeneral.toFixed(2)} en efectivo (afecta caja).`
            : `Se entregaron ${idsUnicos.length} recepción(es). Cobrado ${saldoGeneral.toFixed(2)} por QR (no afecta caja).`
          : `Se entregaron ${idsUnicos.length} recepción(es). Ya estaban pagadas, no se cobró nada.`,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(
      "Error al entregar recepciones:",
      error
    );
    throw error;
  } finally {
    client.release();
  }
};

// ============================================
// ENVÍOS A ALIANZAS: LISTADOS POR ESTADO
// ============================================
const listarEnviosAlianza = async (estado, idAlianza) => {
  if (!['pendiente_envio', 'en_transito'].includes(estado)) {
    return { success: false, message: 'Estado de envío inválido', envios: [], alianzas: [] };
  }
  const alianzaId = idAlianza == null || idAlianza === '' ? null : Number(idAlianza);
  if (alianzaId !== null && (!Number.isInteger(alianzaId) || alianzaId <= 0)) {
    return { success: false, message: 'Alianza inválida', envios: [], alianzas: [] };
  }
  const [alianzasRes, enviosRes] = await Promise.all([
    query('SELECT id_alianza, nombre, ubicacion FROM alianza ORDER BY nombre'),
    query(`SELECT r.id_recepcion, r.codigo_recepcion,
                  to_char(r.fecha_recepcion, 'YYYY-MM-DD"T"HH24:MI:SS') AS fecha_recepcion,
                  r.id_alianza, COALESCE(r.alianza_nombre, a.nombre) AS alianza_nombre,
                  COALESCE(r.alianza_ubicacion, a.ubicacion) AS alianza_ubicacion,
                  r.estado_traslado,
                  (SELECT COUNT(*)::int FROM tamano_recepcion tr WHERE tr.id_recepcion = r.id_recepcion) AS cantidad_paquetes,
                  COALESCE(NULLIF(TRIM(CONCAT_WS(' ', pd.nombres, pd.apellidos)), ''), '—') AS remitente,
                  COALESCE(NULLIF(TRIM(CONCAT_WS(' ', pr.nombres, pr.apellidos)), ''), '—') AS destinatario,
                  COALESCE(pr.celular, '') AS celular_destinatario
           FROM recepcion r
           JOIN alianza a ON a.id_alianza = r.id_alianza
           LEFT JOIN persona_recepcion pdr ON pdr.id_recepcion = r.id_recepcion AND pdr.tipo = 'deja'
           LEFT JOIN persona pd ON pd.id_persona = pdr.id_persona
           LEFT JOIN persona_recepcion prr ON prr.id_recepcion = r.id_recepcion AND prr.tipo = 'recoge'
           LEFT JOIN persona pr ON pr.id_persona = prr.id_persona
           WHERE r.estado = 'pendiente' AND r.tipo_operacion = 'salida'
             AND r.estado_traslado = $1
             AND ($2::int IS NULL OR r.id_alianza = $2)
           ORDER BY r.fecha_recepcion ASC, r.id_recepcion ASC`, [estado, alianzaId])
  ]);
  return { success: true, alianzas: alianzasRes.rows, envios: enviosRes.rows };
};

// ============================================
// CAMBIAR ESTADO DE VARIOS ENVÍOS, ATÓMICAMENTE
// ============================================
const cambiarEnviosMasivo = async (idsRecepciones, estado) => {
  if (!Array.isArray(idsRecepciones) || idsRecepciones.length === 0 || idsRecepciones.length > 500 ||
      idsRecepciones.some(id => !Number.isInteger(id) || id <= 0 || id > 2147483647) ||
      new Set(idsRecepciones).size !== idsRecepciones.length) {
    return { success: false, message: 'Selecciona entre 1 y 500 envíos válidos, sin duplicados.' };
  }
  if (!['en_transito', 'recibido'].includes(estado)) {
    return { success: false, message: 'Estado de traslado inválido' };
  }
  const anterior = estado === 'en_transito' ? 'pendiente_envio' : 'en_transito';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const res = await client.query(
      `SELECT id_recepcion, codigo_recepcion, estado, tipo_operacion, estado_traslado
       FROM recepcion WHERE id_recepcion = ANY($1::int[]) ORDER BY id_recepcion FOR UPDATE`,
      [idsRecepciones]
    );
    if (res.rows.length !== idsRecepciones.length || res.rows.some(r =>
      r.estado !== 'pendiente' || r.tipo_operacion !== 'salida' || r.estado_traslado !== anterior
    )) {
      await client.query('ROLLBACK');
      return { success: false, message: 'Uno o más envíos ya cambiaron de estado. Actualiza el listado y vuelve a intentarlo.' };
    }
    await client.query(
      `UPDATE recepcion SET estado_traslado = $1 WHERE id_recepcion = ANY($2::int[])`,
      [estado, idsRecepciones]
    );
    await client.query('COMMIT');
    return { success: true, cantidad: res.rows.length, codigos: res.rows.map(r => r.codigo_recepcion),
      message: estado === 'en_transito' ? `${res.rows.length} envío(s) marcado(s) como despachado(s).` : `${res.rows.length} envío(s) confirmado(s) como recibido(s) por la alianza.` };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al actualizar envíos en lote:', error);
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  listarEnviosAlianza,
  cambiarEnviosMasivo,
  buscarRecepciones,
  previewEntrega,
  entregar,
  entregarMultiple,
  estadoCajaUsuario,
};