// src/services/ventasService.js
const { query } = require("../../db");

// ============================================
// LISTAR VENTAS POR RANGO DE FECHAS + FILTROS
// ============================================
const listarVentas = async ({ desde, hasta, idUsuario, esAdmin, idCaja }) => {
  try {
    const fechaDesde = desde || "1900-01-01";
    const fechaHasta = hasta || "2999-12-31";

    const condiciones = [
      `v.fecha_venta::date BETWEEN $1::date AND $2::date`,
    ];
    const params = [fechaDesde, fechaHasta];

    // Filtro por usuario (ayudante solo ve las suyas)
    if (!esAdmin && idUsuario) {
      params.push(idUsuario);
      condiciones.push(`v.id_usuario = $${params.length}`);
    }

    // Filtro por caja (solo admin y solo si se especifica)
    if (esAdmin && idCaja) {
      params.push(idCaja);
      condiciones.push(`tc.id_caja = $${params.length}`);
    }

    const ventasRes = await query(
      `SELECT
          v.id_venta,
          v.fecha_venta,
          v.descripcion,
          v.total,
          v.metodo_pago,
          v.id_usuario,
          u.usuario AS usuario_usuario,
          p.nombres AS usuario_nombre,
          p.apellidos AS usuario_apellido,
          tc.id_caja,
          c.nombre_caja
       FROM venta v
       INNER JOIN usuario u ON v.id_usuario = u.id_usuario
       INNER JOIN persona p ON u.id_persona = p.id_persona
       LEFT JOIN transaccion_caja tc ON tc.id_venta = v.id_venta
       LEFT JOIN caja c ON tc.id_caja = c.id_caja
       WHERE ${condiciones.join(" AND ")}
       ORDER BY v.fecha_venta DESC, v.id_venta DESC`,
      params
    );

    const ventas = [];

    for (const v of ventasRes.rows) {
      const detalleRes = await query(
        `SELECT DISTINCT
            r.codigo_recepcion,
            r.id_recepcion
         FROM detalle_venta dv
         INNER JOIN tamano_recepcion tr
           ON dv.id_tamano_recepcion = tr.id_tamano_recepcion
         INNER JOIN recepcion r
           ON tr.id_recepcion = r.id_recepcion
         WHERE dv.id_venta = $1
         LIMIT 1`,
        [v.id_venta]
      );

      let codigoRecepcion = null;
      let clienteNombre = null;
      let clienteApellido = null;

      if (detalleRes.rows.length > 0) {
        codigoRecepcion = detalleRes.rows[0].codigo_recepcion;
        const idRecepcion = detalleRes.rows[0].id_recepcion;

        const clienteRes = await query(
          `SELECT p.nombres, p.apellidos
           FROM persona_recepcion pr
           INNER JOIN persona p ON pr.id_persona = p.id_persona
           WHERE pr.id_recepcion = $1 AND pr.tipo = 'recoge'
           LIMIT 1`,
          [idRecepcion]
        );
        if (clienteRes.rows.length > 0) {
          clienteNombre = clienteRes.rows[0].nombres;
          clienteApellido = clienteRes.rows[0].apellidos;
        }
      }

      ventas.push({
        id_venta: v.id_venta,
        fecha_venta: v.fecha_venta,
        descripcion: v.descripcion,
        total: Number(v.total),
        metodo_pago: v.metodo_pago,
        id_usuario: v.id_usuario,
        usuario_nombre: v.usuario_nombre,
        usuario_apellido: v.usuario_apellido,
        id_caja: v.id_caja ?? null,
        nombre_caja: v.nombre_caja ?? null,
        codigo_recepcion: codigoRecepcion,
        cliente_nombre: clienteNombre,
        cliente_apellido: clienteApellido,
      });
    }

    const totales = ventas.reduce(
      (acc, v) => {
        acc.total += v.total;
        acc.cantidad += 1;
        if (v.metodo_pago === "QR") acc.qr += v.total;
        else acc.efectivo += v.total;
        return acc;
      },
      { total: 0, efectivo: 0, qr: 0, cantidad: 0 }
    );

    totales.total = Number(totales.total.toFixed(2));
    totales.efectivo = Number(totales.efectivo.toFixed(2));
    totales.qr = Number(totales.qr.toFixed(2));

    return { success: true, ventas, totales };
  } catch (error) {
    console.error("Error al listar ventas:", error);
    throw error;
  }
};

// ============================================
// LISTAR CAJAS (para el filtro del admin)
// ============================================
const listarCajas = async () => {
  try {
    const result = await query(
      `SELECT id_caja, nombre_caja, total, estado
       FROM caja
       ORDER BY id_caja`
    );
    return {
      success: true,
      cajas: result.rows.map((c) => ({
        id_caja: c.id_caja,
        nombre_caja: c.nombre_caja,
        total: Number(c.total ?? 0),
        estado: c.estado,
      })),
    };
  } catch (error) {
    console.error("Error al listar cajas:", error);
    throw error;
  }
};

module.exports = {
  listarVentas,
  listarCajas,
};