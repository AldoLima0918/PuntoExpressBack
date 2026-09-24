// src/services/cajaService.js
const { query, pool } = require("../../db");

// ============================================
// HELPER: caja asignada al usuario
// ============================================
const obtenerCajaDeUsuario = async (idUsuario) => {
  const result = await query(
    `SELECT id_caja FROM usuario WHERE id_usuario = $1 AND estado <> 'eliminado'`,
    [idUsuario]
  );
  if (result.rows.length === 0) return null;
  return result.rows[0].id_caja ?? null;
};

// ============================================
// HELPER: caja por id
// ============================================
const obtenerCajaPorId = async (idCaja) => {
  const result = await query(
    `SELECT id_caja, nombre_caja, total, estado FROM caja WHERE id_caja = $1`,
    [idCaja]
  );
  return result.rows[0] ?? null;
};

// ============================================
// HELPER: normaliza fecha a YYYY-MM-DD
// ============================================
const normalizarFecha = (valor) => {
  if (!valor) return null;
  const s = String(valor).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
};

// ============================================
// OBTENER ESTADO ACTUAL DE CAJA
// ============================================
const obtenerEstadoCaja = async ({ idUsuario, rol, idCajaQuery }) => {
  try {
    const esAdmin = rol === "administrador";

    if (esAdmin) {
      if (!idCajaQuery) {
        const lista = await query(
          `SELECT id_caja, nombre_caja, total, estado
           FROM caja
           ORDER BY id_caja ASC`
        );

        return {
          success: true,
          caja: null,
          abierta: false,
          total: 0,
          cajas: lista.rows.map((c) => ({
            id_caja: c.id_caja,
            nombre_caja: c.nombre_caja,
            total: Number(c.total),
            estado: c.estado,
          })),
        };
      }

      const caja = await obtenerCajaPorId(Number(idCajaQuery));
      if (!caja) {
        return {
          success: false,
          caja: null,
          abierta: false,
          total: 0,
          message: "La caja seleccionada no existe",
        };
      }

      return {
        success: true,
        caja: {
          id_caja: caja.id_caja,
          nombre_caja: caja.nombre_caja,
          total: Number(caja.total),
          estado: caja.estado,
        },
        abierta: caja.estado === "abierta",
        total: Number(caja.total),
      };
    }

    const idCajaUsuario = await obtenerCajaDeUsuario(idUsuario);

    if (!idCajaUsuario) {
      return {
        success: false,
        caja: null,
        abierta: false,
        total: 0,
        sinCaja: true,
        message: "No tienes una caja asignada. Contacta al administrador.",
      };
    }

    const caja = await obtenerCajaPorId(idCajaUsuario);
    if (!caja) {
      return {
        success: false,
        caja: null,
        abierta: false,
        total: 0,
        sinCaja: true,
        message: "Tu caja asignada ya no existe. Contacta al administrador.",
      };
    }

    return {
      success: true,
      caja: {
        id_caja: caja.id_caja,
        nombre_caja: caja.nombre_caja,
        total: Number(caja.total),
        estado: caja.estado,
      },
      abierta: caja.estado === "abierta",
      total: Number(caja.total),
    };
  } catch (error) {
    console.error("Error al obtener estado de caja:", error);
    throw error;
  }
};

// ============================================
// LISTAR TRANSACCIONES
// ============================================
const listarTransacciones = async ({
  desde,
  hasta,
  soloMias,
  idUsuario,
  rol,
  idCajaQuery,
}) => {
  try {
    const esAdmin = rol === "administrador";

    // ── Determinar qué caja ────────────────────
    let idCaja;
    if (esAdmin) {
      if (!idCajaQuery) {
        return {
          success: true,
          transacciones: [],
          resumen: { ingresos: 0, egresos: 0, total: 0 },
        };
      }
      idCaja = Number(idCajaQuery);
    } else {
      idCaja = await obtenerCajaDeUsuario(idUsuario);
      if (!idCaja) {
        return {
          success: true,
          transacciones: [],
          resumen: { ingresos: 0, egresos: 0, total: 0 },
        };
      }
    }

    // ── Normalizar fechas ──────────────────────
    const desdeNorm = normalizarFecha(desde);
    const hastaNorm = normalizarFecha(hasta);

    // ── Filtros dinámicos ─────────────────────
    const condiciones = ["tc.id_caja = $1"];
    const params = [idCaja];
    let idx = 2;

    if (desdeNorm) {
      condiciones.push(`tc.fecha::date >= $${idx}::date`);
      params.push(desdeNorm);
      idx++;
    }
    if (hastaNorm) {
      condiciones.push(`tc.fecha::date <= $${idx}::date`);
      params.push(hastaNorm);
      idx++;
    }
    if (soloMias && idUsuario) {
      condiciones.push(`tc.id_usuario = $${idx}`);
      params.push(idUsuario);
      idx++;
    }

    const where = condiciones.join(" AND ");

    // Log temporal para verificar (quitar después)
    console.log("[CAJA] WHERE:", where);
    console.log("[CAJA] PARAMS:", params);

    const result = await query(
      `SELECT
         tc.id_transaccion_caja,
         tc.id_caja,
         tc.fecha,
         tc.id_usuario,
         tc.monto_nuevo,
         tc.monto_anterior,
         tc.monto,
         tc.tipo_movimiento,
         tc.descripcion,
         tc.id_venta,
         p.nombres   AS usuario_nombre,
         p.apellidos AS usuario_apellido
       FROM transaccion_caja tc
       INNER JOIN usuario u ON tc.id_usuario = u.id_usuario
       INNER JOIN persona p ON u.id_persona = p.id_persona
       WHERE ${where}
       ORDER BY tc.fecha DESC, tc.id_transaccion_caja DESC`,
      params
    );

    const transacciones = result.rows.map((row) => ({
      id_transaccion_caja: row.id_transaccion_caja,
      id_caja: row.id_caja,
      fecha: row.fecha,
      id_usuario: row.id_usuario,
      usuario_nombre: row.usuario_nombre,
      usuario_apellido: row.usuario_apellido,
      monto_nuevo: Number(row.monto_nuevo),
      monto_anterior: Number(row.monto_anterior),
      monto: Number(row.monto),
      tipo_movimiento: row.tipo_movimiento,
      descripcion: row.descripcion,
      id_venta: row.id_venta,
    }));

    const ingresos = transacciones
      .filter((t) => t.tipo_movimiento === "ingreso")
      .reduce((s, t) => s + t.monto, 0);

    const egresos = transacciones
      .filter((t) => t.tipo_movimiento === "egreso")
      .reduce((s, t) => s + t.monto, 0);

    return {
      success: true,
      transacciones,
      resumen: {
        ingresos: Number(ingresos.toFixed(2)),
        egresos: Number(egresos.toFixed(2)),
        total: Number((ingresos - egresos).toFixed(2)),
      },
    };
  } catch (error) {
    console.error("Error al listar transacciones:", error);
    throw error;
  }
};

// ============================================
// REGISTRAR MOVIMIENTO (transacción)
// ============================================
const registrarMovimiento = async ({
  tipo,
  descripcion,
  monto,
  idUsuario,
  rol,
  idCajaQuery,
}) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const esAdmin = rol === "administrador";

    let idCaja;
    if (esAdmin) {
      if (!idCajaQuery) {
        throw new Error("Debes seleccionar una caja primero");
      }
      idCaja = Number(idCajaQuery);
    } else {
      const idCajaUsuario = await obtenerCajaDeUsuario(idUsuario);
      if (!idCajaUsuario) {
        throw new Error(
          "No tienes una caja asignada. Contacta al administrador."
        );
      }
      idCaja = idCajaUsuario;
    }

    const cajaRes = await client.query(
      `SELECT id_caja, nombre_caja, total, estado
       FROM caja
       WHERE id_caja = $1
       FOR UPDATE`,
      [idCaja]
    );

    if (cajaRes.rows.length === 0) {
      throw new Error("La caja no existe");
    }

    const { total, estado } = cajaRes.rows[0];
    const montoAnterior = Number(total);
    const estadoActual = estado;

    if (tipo === "apertura") {
      if (estadoActual === "abierta") {
        throw new Error("La caja ya está abierta");
      }
    } else {
      if (estadoActual !== "abierta") {
        throw new Error(
          "La caja está cerrada. Realiza la apertura para continuar"
        );
      }
    }

    let montoNuevo;
    let nuevoEstado;

    if (tipo === "apertura") {
      montoNuevo = Number(monto.toFixed(2));
      nuevoEstado = "abierta";
    } else if (tipo === "cierre") {
      montoNuevo = Number(monto.toFixed(2));
      nuevoEstado = "cerrada";
    } else if (tipo === "ingreso") {
      montoNuevo = Number((montoAnterior + monto).toFixed(2));
      nuevoEstado = "abierta";
    } else {
      if (monto > montoAnterior) {
        throw new Error(
          `No hay suficiente saldo en caja. Disponible: ${montoAnterior.toFixed(2)}`
        );
      }
      montoNuevo = Number((montoAnterior - monto).toFixed(2));
      nuevoEstado = "abierta";
    }

    await client.query(
      `UPDATE caja SET total = $1, estado = $2 WHERE id_caja = $3`,
      [montoNuevo, nuevoEstado, idCaja]
    );

    const txRes = await client.query(
      `INSERT INTO transaccion_caja
         (id_caja, id_usuario, monto_nuevo, monto_anterior, monto,
          tipo_movimiento, descripcion)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id_transaccion_caja, fecha`,
      [
        idCaja,
        idUsuario,
        montoNuevo,
        montoAnterior,
        monto,
        tipo,
        descripcion,
      ]
    );

    const userRes = await client.query(
      `SELECT p.nombres, p.apellidos
       FROM usuario u
       INNER JOIN persona p ON u.id_persona = p.id_persona
       WHERE u.id_usuario = $1`,
      [idUsuario]
    );

    await client.query("COMMIT");

    return {
      success: true,
      transaccion: {
        id_transaccion_caja: txRes.rows[0].id_transaccion_caja,
        id_caja: idCaja,
        fecha: txRes.rows[0].fecha,
        id_usuario: idUsuario,
        usuario_nombre: userRes.rows[0]?.nombres ?? "",
        usuario_apellido: userRes.rows[0]?.apellidos ?? "",
        monto_nuevo: montoNuevo,
        monto_anterior: montoAnterior,
        monto,
        tipo_movimiento: tipo,
        descripcion,
        id_venta: null,
      },
      caja: {
        id_caja: idCaja,
        nombre_caja: cajaRes.rows[0].nombre_caja,
        total: montoNuevo,
        estado: nuevoEstado,
      },
      message: `${tipo.charAt(0).toUpperCase() + tipo.slice(1)} registrada`,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error al registrar movimiento:", error);
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  obtenerEstadoCaja,
  listarTransacciones,
  registrarMovimiento,
};