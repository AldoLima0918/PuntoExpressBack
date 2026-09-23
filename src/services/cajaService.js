// src/services/cajaService.js
const { query, pool } = require("../../db");

// ============================================
// OBTENER ESTADO ACTUAL DE CAJA
// ============================================
const obtenerEstadoCaja = async () => {
  try {
    const result = await query(
      `SELECT id_caja, nombre_caja, total, estado
       FROM caja
       ORDER BY id_caja ASC
       LIMIT 1`
    );

    if (result.rows.length === 0) {
      return {
        success: true,
        caja: null,
        abierta: false,
        total: 0,
      };
    }

    const caja = result.rows[0];
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
}) => {
  try {
    // ─── 1. Obtener la caja única ────────────
    const cajaRes = await query(
      `SELECT id_caja FROM caja ORDER BY id_caja ASC LIMIT 1`
    );

    if (cajaRes.rows.length === 0) {
      return {
        success: true,
        transacciones: [],
        resumen: { ingresos: 0, egresos: 0, total: 0 },
      };
    }

    const idCaja = cajaRes.rows[0].id_caja;

    // ─── 2. Filtros dinámicos ────────────────
    const condiciones = ["tc.id_caja = $1"];
    const params = [idCaja];
    let idx = 2;

    // 👇 FIX: usamos ::date para ignorar la hora y evitar bugs de timezone.
    //    "desde" incluye desde las 00:00:00 del día.
    //    "hasta" incluye hasta las 23:59:59.999 del día (usando < día+1).
    if (desde) {
      condiciones.push(`tc.fecha >= $${idx}::date`);
      params.push(desde);
      idx++;
    }
    if (hasta) {
      condiciones.push(`tc.fecha < ($${idx}::date + INTERVAL '1 day')`);
      params.push(hasta);
      idx++;
    }
    if (soloMias && idUsuario) {
      condiciones.push(`tc.id_usuario = $${idx}`);
      params.push(idUsuario);
      idx++;
    }

    const where = condiciones.join(" AND ");

    // ─── 3. Traer transacciones ──────────────
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

    // ─── 4. Resumen del período ──────────────
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
}) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ─── 1. Obtener la caja única (FOR UPDATE) ───
    const cajaRes = await client.query(
      `SELECT id_caja, nombre_caja, total, estado
       FROM caja
       ORDER BY id_caja ASC
       LIMIT 1
       FOR UPDATE`
    );

    // ─── 2. Si no existe caja, solo se permite apertura ───
    if (cajaRes.rows.length === 0) {
      if (tipo !== "apertura") {
        throw new Error(
          "No hay una caja abierta. Debes realizar la apertura primero"
        );
      }

      // Crear la PRIMERA (y única) caja
      const nueva = await client.query(
        `INSERT INTO caja (nombre_caja, total, estado)
         VALUES ($1, $2, 'abierta')
         RETURNING id_caja, nombre_caja, total, estado`,
        ["Caja Principal", monto]
      );

      const idCaja = nueva.rows[0].id_caja;

      // Registrar la transacción de apertura
      const txRes = await client.query(
        `INSERT INTO transaccion_caja
           (id_caja, id_usuario, monto_nuevo, monto_anterior, monto,
            tipo_movimiento, descripcion)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id_transaccion_caja, fecha`,
        [idCaja, idUsuario, monto, 0, monto, "apertura", descripcion]
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
          monto_nuevo: monto,
          monto_anterior: 0,
          monto,
          tipo_movimiento: "apertura",
          descripcion,
          id_venta: null,
        },
        caja: {
          id_caja: idCaja,
          nombre_caja: "Caja Principal",
          total: monto,
          estado: "abierta",
        },
        message: "Apertura registrada",
      };
    }

    // ─── 3. Ya existe la caja: trabajar sobre ella ───
    const { id_caja: idCaja, total, estado } = cajaRes.rows[0];
    const montoAnterior = Number(total);
    const estadoActual = estado;

    // ─── 4. Validaciones según tipo ──────────
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

    // ─── 5. Calcular nuevo monto y nuevo estado ───
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

    // ─── 6. Actualizar la MISMA caja ─────────
    await client.query(
      `UPDATE caja
       SET total = $1, estado = $2
       WHERE id_caja = $3`,
      [montoNuevo, nuevoEstado, idCaja]
    );

    // ─── 7. Insertar transacción ─────────────
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

    // ─── 8. Datos del usuario ────────────────
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