const { query, pool } = require("../../db");
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


const listarRetirosVendedor = async (paginaSolicitada, filtroCobro = 'todos', busqueda = '', desde = '', hasta = '') => {
  const pagina = Math.max(1, Math.min(1000000, parseInt(paginaSolicitada, 10) || 1));
  const limite = 30;
  const condiciones = [];
  const valores = [];
  const tipoCobro = String(filtroCobro || 'todos');
  if (tipoCobro === 'sin_cobro') condiciones.push('rv.monto_cobrado = 0');
  if (tipoCobro === 'con_cobro') condiciones.push('rv.monto_cobrado > 0');
  const texto = String(busqueda || '').trim();
  if (texto) {
    valores.push(`%${texto}%`);
    condiciones.push(`(r.codigo_recepcion ILIKE $${valores.length} OR rv.nombre_vendedor ILIKE $${valores.length} OR rv.motivo ILIKE $${valores.length})`);
  }
  const fechaValida = (valor) => /^\d{4}-\d{2}-\d{2}$/.test(valor) && !Number.isNaN(Date.parse(`${valor}T12:00:00`));
  const fechaDesde = String(desde || '').trim();
  const fechaHasta = String(hasta || '').trim();
  if (fechaDesde && !fechaValida(fechaDesde)) return { success: false, message: 'Fecha desde inválida', retiros: [], total: 0, pagina: 1, totalPaginas: 1, limite };
  if (fechaHasta && !fechaValida(fechaHasta)) return { success: false, message: 'Fecha hasta inválida', retiros: [], total: 0, pagina: 1, totalPaginas: 1, limite };
  if (fechaDesde && fechaHasta && fechaDesde > fechaHasta) return { success: false, message: 'Rango de fechas inválido', retiros: [], total: 0, pagina: 1, totalPaginas: 1, limite };
  if (fechaDesde) {
    valores.push(fechaDesde);
    condiciones.push(`rv.fecha_retiro >= $${valores.length}::date`);
  }
  if (fechaHasta) {
    valores.push(fechaHasta);
    condiciones.push(`rv.fecha_retiro < ($${valores.length}::date + INTERVAL '1 day')`);
  }
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const totalRes = await query(
    `SELECT COUNT(*)::int AS total FROM retiro_vendedor rv
     JOIN recepcion r ON r.id_recepcion=rv.id_recepcion ${where}`, valores
  );
  const total = totalRes.rows[0].total;
  const totalPaginas = Math.max(1, Math.ceil(total / limite));
  const actual = Math.min(pagina, totalPaginas);
  const resultado = await query(
    `SELECT rv.id_retiro_vendedor, rv.nombre_vendedor, rv.motivo, rv.modalidad,
            rv.total_calculado, rv.monto_pagado_previo, rv.monto_cobrado, rv.metodo_pago,
            to_char(rv.fecha_retiro, 'YYYY-MM-DD"T"HH24:MI:SS') AS fecha_retiro,
            r.codigo_recepcion, r.alianza_nombre, rv.id_usuario,
            COALESCE(
              NULLIF(BTRIM(CONCAT_WS(' ', NULLIF(to_jsonb(u)->>'nombres', ''), NULLIF(to_jsonb(u)->>'apellidos', ''))), ''),
              NULLIF(BTRIM(CONCAT_WS(' ', NULLIF(to_jsonb(u)->>'nombre', ''), NULLIF(to_jsonb(u)->>'apellido', ''))), ''),
              NULLIF(to_jsonb(u)->>'nombre_completo', ''),
              NULLIF(to_jsonb(u)->>'nombre_usuario', ''),
              NULLIF(to_jsonb(u)->>'usuario', ''),
              NULLIF(to_jsonb(u)->>'username', ''),
              NULLIF(to_jsonb(u)->>'email', '')
            ) AS nombre_usuario
     FROM retiro_vendedor rv
     JOIN recepcion r ON r.id_recepcion=rv.id_recepcion
     LEFT JOIN usuario u ON u.id_usuario=rv.id_usuario
     ${where}
     ORDER BY rv.fecha_retiro DESC, rv.id_retiro_vendedor DESC
     LIMIT $${valores.length + 1} OFFSET $${valores.length + 2}`,
    [...valores, limite, (actual - 1) * limite]
  );
  return { success: true, retiros: resultado.rows, total, pagina: actual, totalPaginas, limite };
};

// RETIRO POR VENDEDOR. La transacción evita cobrar dos veces y mantiene trazabilidad.
const retirarPorVendedor = async (idRecepcion, datos, idUsuario, idCajaUsuario) => {
  if (!Number.isInteger(idRecepcion) || idRecepcion <= 0) {
    return { success: false, message: "Recepción inválida" };
  }
  const { nombre_vendedor, motivo, modalidad, monto, metodo_pago } = datos || {};
  const nombre = String(nombre_vendedor || "").trim();
  const observacion = String(motivo || "").trim();
  if (nombre.length < 3 || nombre.length > 150 || observacion.length < 5 || observacion.length > 500) {
    return { success: false, message: "Indica el nombre de quien retira y un motivo de al menos 5 caracteres." };
  }
  if (!["sin_cobro", "total", "personalizado"].includes(modalidad)) {
    return { success: false, message: "Selecciona una modalidad de cobro válida" };
  }
  if (modalidad !== "sin_cobro" && !["Efectivo", "QR"].includes(metodo_pago)) {
    return { success: false, message: "Selecciona Efectivo o QR" };
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const r = await client.query(
      `SELECT id_recepcion, codigo_recepcion, estado, tipo_operacion, estado_traslado,
              fecha_recepcion, monto_pagado_inicial
       FROM recepcion WHERE id_recepcion = $1 FOR UPDATE`, [idRecepcion]
    );
    if (!r.rows.length || r.rows[0].estado !== "pendiente") {
      throw new Error("La recepción ya no está disponible para retiro");
    }
    const recepcion = r.rows[0];
    if (recepcion.tipo_operacion === 'salida' && recepcion.estado_traslado !== 'pendiente_envio') {
      throw new Error("No se puede retirar por vendedor un paquete ya enviado a una alianza");
    }
    const itemsRes = await client.query(
      `SELECT id_tamano_recepcion, precio_tamano FROM tamano_recepcion WHERE id_recepcion=$1`,
      [idRecepcion]
    );
    if (!itemsRes.rows.length) throw new Error("La recepción no tiene productos");
    const base = itemsRes.rows.reduce((s, i) => s + Number(i.precio_tamano), 0);
    const { total } = calcularTotal(base, recepcion.fecha_recepcion);
    const pagado = Number(recepcion.monto_pagado_inicial || 0);
    const saldo = Number(Math.max(0, total - pagado).toFixed(2));
    let cobro = 0;
    if (modalidad === "total") cobro = saldo;
    if (modalidad === "personalizado") {
      const cantidad = Number(monto);
      if (monto === '' || monto === null || monto === undefined || !Number.isFinite(cantidad) || cantidad < 0 || Math.round(cantidad * 100) !== cantidad * 100 || cantidad > saldo) {
        throw new Error(`Monto personalizado inválido. Debe ser entre 0 y ${saldo.toFixed(2)} Bs`);
      }
      cobro = cantidad;
    }
    let idVenta = null;
    if (cobro > 0) {
      let idCaja = null;
      if (metodo_pago === 'Efectivo') {
        const caja = idCajaUsuario
          ? await client.query('SELECT id_caja, total, estado FROM caja WHERE id_caja=$1 FOR UPDATE', [idCajaUsuario])
          : await client.query("SELECT id_caja, total, estado FROM caja WHERE estado='abierta' ORDER BY id_caja DESC LIMIT 1 FOR UPDATE");
        if (!caja.rows.length || caja.rows[0].estado !== 'abierta') throw new Error('Se requiere una caja abierta para cobrar en efectivo');
        idCaja = caja.rows[0].id_caja;
        const anterior = Number(caja.rows[0].total);
        const nuevo = Number((anterior + cobro).toFixed(2));
        const venta = await client.query(
          `INSERT INTO venta(id_usuario, descripcion, total, metodo_pago)
           VALUES ($1,$2,$3,$4) RETURNING id_venta`,
          [idUsuario, `Retiro por vendedor ${recepcion.codigo_recepcion} - ${nombre}`, cobro, metodo_pago]
        );
        idVenta = venta.rows[0].id_venta;
        for (const item of itemsRes.rows) await client.query(
          'INSERT INTO detalle_venta(id_venta,id_tamano_recepcion) VALUES ($1,$2)',
          [idVenta, item.id_tamano_recepcion]
        );
        await client.query('UPDATE caja SET total=$1 WHERE id_caja=$2', [nuevo, idCaja]);
        await client.query(
          `INSERT INTO transaccion_caja(id_caja,id_usuario,monto_nuevo,monto_anterior,monto,tipo_movimiento,descripcion,id_venta)
           VALUES ($1,$2,$3,$4,$5,'ingreso',$6,$7)`,
          [idCaja,idUsuario,nuevo,anterior,cobro,`Retiro vendedor ${recepcion.codigo_recepcion}`,idVenta]
        );
      } else {
        const venta = await client.query(
          `INSERT INTO venta(id_usuario, descripcion, total, metodo_pago)
           VALUES ($1,$2,$3,$4) RETURNING id_venta`,
          [idUsuario, `Retiro por vendedor ${recepcion.codigo_recepcion} - ${nombre}`, cobro, metodo_pago]
        );
        idVenta = venta.rows[0].id_venta;
        for (const item of itemsRes.rows) await client.query(
          'INSERT INTO detalle_venta(id_venta,id_tamano_recepcion) VALUES ($1,$2)',
          [idVenta, item.id_tamano_recepcion]
        );
      }
    }
    await client.query(
      `INSERT INTO retiro_vendedor(id_recepcion,id_usuario,nombre_vendedor,motivo,modalidad,total_calculado,
         monto_pagado_previo,monto_cobrado,metodo_pago,id_venta)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [idRecepcion,idUsuario,nombre,observacion,modalidad,total,pagado,cobro,cobro>0?metodo_pago:null,idVenta]
    );
    await client.query("UPDATE recepcion SET estado = 'retirado_vendedor' WHERE id_recepcion=$1",[idRecepcion]);
    await client.query('COMMIT');
    return { success:true, codigo_recepcion:recepcion.codigo_recepcion, monto_cobrado:cobro,
      message:`Retiro por vendedor registrado. Cobro: Bs ${cobro.toFixed(2)}` };
  } catch(error) {
    await client.query('ROLLBACK');
    console.error('Error en retiro por vendedor:',error);
    return {success:false,message:error.message || 'No se pudo registrar el retiro'};
  } finally { client.release(); }
};

module.exports = {
  listarRecepcionesActivas, listarAlianzasControl, cambiarEstadoTraslado, retirarPorVendedor, listarRetirosVendedor,
  editarEstanteItem, listarEstantes,
};