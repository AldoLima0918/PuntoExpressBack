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

const listarRecepcionesActivas = async (filtros = {}) => {
  try {
    const pagina = Math.max(1, Math.min(1000000, Number.parseInt(filtros.pagina, 10) || 1));
    const limite = 30;
    const condiciones = ["r.estado = 'pendiente'"];
    const valores = [];
    const agregar = (condicion, valor) => {
      valores.push(valor);
      condiciones.push(condicion.replaceAll('?', `$${valores.length}`));
    };

    const busqueda = String(filtros.q || '').trim();
    if (busqueda) {
      agregar(`(
        r.codigo_recepcion ILIKE ?
        OR EXISTS (
          SELECT 1 FROM persona_recepcion pr
          JOIN persona p ON p.id_persona = pr.id_persona
          WHERE pr.id_recepcion = r.id_recepcion AND (
            p.carnet ILIKE $${valores.length + 1}
            OR (p.nombres || ' ' || p.apellidos) ILIKE $${valores.length + 1}
          )
        )
        OR EXISTS (
          SELECT 1 FROM tamano_recepcion tr
          LEFT JOIN estante e ON e.id_estante = tr.id_estante
          WHERE tr.id_recepcion = r.id_recepcion AND (
            tr.descripcion ILIKE $${valores.length + 1} OR e.estante ILIKE $${valores.length + 1}
          )
        )
      )`, `%${busqueda}%`);
    }
    // La zona visible es la zona efectiva calculada según los días almacenados.
    // No filtrar por r.zona: representa solamente la zona original.
    const zonaSolicitada = ['1', '2'].includes(String(filtros.zona))
      ? Number(filtros.zona)
      : null;
    const alianza = String(filtros.alianza || 'todas');
    if (alianza === 'local') condiciones.push("COALESCE(r.tipo_operacion, 'local') = 'local'");
    else if (/^[1-9]\d*$/.test(alianza)) agregar('r.id_alianza = ?', Number(alianza));

    const operacion = String(filtros.operacion || 'todas');
    if (['local', 'entrada', 'salida'].includes(operacion)) {
      agregar("COALESCE(r.tipo_operacion, 'local') = ?", operacion);
    }
    const traslado = String(filtros.traslado || 'todos');
    if (traslado === 'local') condiciones.push("COALESCE(r.tipo_operacion, 'local') = 'local'");
    else if (traslado === 'entrada') condiciones.push("r.tipo_operacion = 'entrada'");
    else if (['pendiente_envio', 'en_transito', 'recibido'].includes(traslado)) {
      agregar("r.tipo_operacion = 'salida' AND r.estado_traslado = ?", traslado);
    }

    const where = condiciones.join(' AND ');
    const totalRes = zonaSolicitada === null
      ? await query(
          `SELECT COUNT(*)::int AS total FROM recepcion r WHERE ${where}`,
          valores
        )
      : null;

    // Para el filtro de zona necesitamos evaluar la misma lógica de zona efectiva
    // utilizada al presentar cada paquete. Se consultan únicamente ID, fecha y zona
    // de las coincidencias; los detalles siguen cargándose de 30 en 30.
    let idsZona = null;
    if (zonaSolicitada !== null) {
      const candidatos = await query(
        `SELECT r.id_recepcion,
                to_char(r.fecha_recepcion, 'YYYY-MM-DD"T"HH24:MI:SS') AS fecha_recepcion,
                r.zona
         FROM recepcion r
         WHERE ${where}
         ORDER BY r.fecha_recepcion ASC, r.id_recepcion ASC`,
        valores
      );
      idsZona = candidatos.rows
        .filter((r) => {
          const { dias } = calcularDiasYSemanas(r.fecha_recepcion);
          const efectiva = calcularZonaEfectiva(r.zona, dias);
          return efectiva === `Zona ${zonaSolicitada}`;
        })
        .map((r) => r.id_recepcion);
    }

    const total = idsZona === null ? totalRes.rows[0].total : idsZona.length;
    const totalPaginas = Math.max(1, Math.ceil(total / limite));
    const paginaActual = Math.min(pagina, totalPaginas);
    const offset = (paginaActual - 1) * limite;

    const cabeceras = idsZona === null
      ? await query(
          `SELECT r.id_recepcion, r.codigo_recepcion,
                  to_char(r.fecha_recepcion, 'YYYY-MM-DD"T"HH24:MI:SS') AS fecha_recepcion,
                  r.zona, r.estado, r.monto_pagado_inicial, r.metodo_pago_inicial,
                  r.id_venta_inicial, r.fecha_pago_inicial, r.tipo_operacion,
                  r.id_alianza, r.estado_traslado, r.alianza_nombre, r.alianza_ubicacion
           FROM recepcion r WHERE ${where}
           ORDER BY r.fecha_recepcion ASC, r.id_recepcion ASC
           LIMIT $${valores.length + 1} OFFSET $${valores.length + 2}`,
          [...valores, limite, offset]
        )
      : await query(
          `SELECT r.id_recepcion, r.codigo_recepcion,
                  to_char(r.fecha_recepcion, 'YYYY-MM-DD"T"HH24:MI:SS') AS fecha_recepcion,
                  r.zona, r.estado, r.monto_pagado_inicial, r.metodo_pago_inicial,
                  r.id_venta_inicial, r.fecha_pago_inicial, r.tipo_operacion,
                  r.id_alianza, r.estado_traslado, r.alianza_nombre, r.alianza_ubicacion
           FROM recepcion r
           WHERE r.id_recepcion = ANY($1::int[])
           ORDER BY r.fecha_recepcion ASC, r.id_recepcion ASC`,
          [idsZona.slice(offset, offset + limite)]
        );

    const conteosRes = await query(
      `SELECT
         COUNT(*) FILTER (WHERE COALESCE(tipo_operacion, 'local') = 'local')::int AS locales,
         COUNT(*) FILTER (WHERE tipo_operacion = 'entrada')::int AS entradas,
         COUNT(*) FILTER (WHERE tipo_operacion = 'salida' AND estado_traslado = 'pendiente_envio')::int AS pendientes,
         COUNT(*) FILTER (WHERE tipo_operacion = 'salida' AND estado_traslado = 'en_transito')::int AS transito,
         COUNT(*) FILTER (WHERE tipo_operacion = 'salida' AND estado_traslado = 'recibido')::int AS recibidos
       FROM recepcion WHERE estado = 'pendiente'`
    );
    const conteos = conteosRes.rows[0];
    const ids = cabeceras.rows.map((r) => r.id_recepcion);
    if (ids.length === 0) {
      return { success: true, recepciones: [], pagina: paginaActual, limite, total, totalPaginas, conteos };
    }

    // Consultas por lotes: 30 cabeceras + personas + items, no una consulta por paquete.
    const [personasRes, itemsRes] = await Promise.all([
      query(
        `SELECT pr.id_recepcion, pr.tipo, p.carnet, p.nombres, p.apellidos, p.celular
         FROM persona_recepcion pr JOIN persona p ON p.id_persona = pr.id_persona
         WHERE pr.id_recepcion = ANY($1::int[])`, [ids]
      ),
      query(
        `SELECT tr.id_recepcion, tr.id_tamano_recepcion, tr.precio_tamano, tr.descripcion,
                t.tamano, e.estante, e.id_estante
         FROM tamano_recepcion tr
         JOIN tamano t ON tr.id_tamano = t.id_tamano
         LEFT JOIN estante e ON e.id_estante = tr.id_estante
         WHERE tr.id_recepcion = ANY($1::int[])
         ORDER BY tr.id_tamano_recepcion`, [ids]
      ),
    ]);
    const personasPorRecepcion = new Map();
    for (const persona of personasRes.rows) {
      if (!personasPorRecepcion.has(persona.id_recepcion)) {
        personasPorRecepcion.set(persona.id_recepcion, {});
      }
      const { id_recepcion, tipo, ...datos } = persona;
      personasPorRecepcion.get(id_recepcion)[tipo] = datos;
    }
    const itemsPorRecepcion = new Map();
    for (const item of itemsRes.rows) {
      const { id_recepcion, ...datos } = item;
      if (!itemsPorRecepcion.has(id_recepcion)) itemsPorRecepcion.set(id_recepcion, []);
      itemsPorRecepcion.get(id_recepcion).push({
        ...datos, estante_id: datos.id_estante,
        precio_tamano: Number(datos.precio_tamano),
      });
    }
    const recepciones = cabeceras.rows.map((r) => {
      const items = itemsPorRecepcion.get(r.id_recepcion) || [];
      const personas = personasPorRecepcion.get(r.id_recepcion) || {};
      const base = items.reduce((s, it) => s + it.precio_tamano, 0);
      const { dias, semanas } = calcularDiasYSemanas(r.fecha_recepcion);
      const { total: totalCalculado, multiplicador } = calcularTotal(base, r.fecha_recepcion);
      const zonaEfectiva = calcularZonaEfectiva(r.zona, dias);
      const montoPagadoInicial = Number(r.monto_pagado_inicial ?? 0);
      return {
        ...r, zonaEfectiva, dias, semanas, multiplicador,
        base, total: totalCalculado,
        monto_pagado_inicial: montoPagadoInicial,
        metodo_pago_inicial: r.metodo_pago_inicial ?? null,
        id_venta_inicial: r.id_venta_inicial ?? null,
        fecha_pago_inicial: r.fecha_pago_inicial ?? null,
        saldo_pendiente: Number(Math.max(0, totalCalculado - montoPagadoInicial).toFixed(2)),
        tipo_operacion: r.tipo_operacion ?? 'local',
        id_alianza: r.id_alianza ?? null,
        estado_traslado: r.estado_traslado ?? null,
        alianza_nombre: r.alianza_nombre ?? null,
        alianza_ubicacion: r.alianza_ubicacion ?? null,
        dejo: personas.deja || null,
        recoge: personas.recoge || null,
        items,
      };
    });
    return { success: true, recepciones, pagina: paginaActual, limite, total, totalPaginas, conteos };
  } catch (error) {
    console.error('Error al listar recepciones activas:', error);
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
