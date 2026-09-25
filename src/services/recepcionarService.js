// src/services/recepcionarService.js
const { query, pool } = require("../../db");

// ============================================
// CREAR RECEPCIÓN (TRANSACCIÓN)
// ============================================
const crearRecepcion = async (data) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { codigo_recepcion, zona, dejo, recoge, items } = data;

    // 1. Insertar la recepción
    const recepcionQuery = `
      INSERT INTO recepcion (codigo_recepcion, zona, estado)
      VALUES ($1, $2, 'pendiente')
      RETURNING id_recepcion
    `;
    const zonaTexto = Number(zona) === 1 ? "Zona 1" : "Zona 2";
    const recepcionResult = await client.query(recepcionQuery, [
      codigo_recepcion,
      zonaTexto,
    ]);
    const idRecepcion = recepcionResult.rows[0].id_recepcion;

    // 2. Upsert de personas
    const idDejo = await upsertPersona(client, dejo);
    const idRecoge = await upsertPersona(client, recoge);

    await client.query(
      `INSERT INTO persona_recepcion (id_recepcion, id_persona, tipo)
       VALUES ($1, $2, 'deja'), ($1, $3, 'recoge')`,
      [idRecepcion, idDejo, idRecoge]
    );

    // 3. Insertar items
    for (const item of items) {
      const tamanoRes = await client.query(
        `SELECT id_tamano FROM tamano WHERE tamano = $1`,
        [item.tamano]
      );
      if (tamanoRes.rows.length === 0) {
        throw new Error(`Tamaño no encontrado: ${item.tamano}`);
      }
      const idTamano = tamanoRes.rows[0].id_tamano;

      const estanteRes = await client.query(
        `SELECT id_estante FROM estante WHERE estante = $1`,
        [item.estante]
      );
      if (estanteRes.rows.length === 0) {
        throw new Error(`Estante no encontrado: ${item.estante}`);
      }
      const idEstante = estanteRes.rows[0].id_estante;

      const precio = Number(item.precio);
      if (!Number.isFinite(precio)) {
        throw new Error(`Precio inválido en el paquete: ${item.precio}`);
      }

      await client.query(
        `INSERT INTO tamano_recepcion 
           (id_recepcion, id_tamano, precio_tamano, id_estante)
         VALUES ($1, $2, $3, $4)`,
        [idRecepcion, idTamano, precio, idEstante]
      );
    }

    await client.query("COMMIT");

    return {
      success: true,
      id_recepcion: idRecepcion,
      codigo_recepcion,
      message: "Recepción registrada exitosamente",
    };
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error al crear recepción:", error);
    throw error;
  } finally {
    client.release();
  }
};

// ============================================
// UPSERT PERSONA
// Reglas:
//  - Si viene carnet: buscar por carnet. Si existe, actualizar. Si no, insertar.
//  - Si NO viene carnet: buscar por celular. Si existe, actualizar. Si no, insertar con carnet autogenerado.
//  - El celular es único: si ya lo tiene otra persona, se lanza error.
// ============================================
async function upsertPersona(client, persona) {
  const carnet = (persona.carnet ?? "").trim();
  const { nombres, apellidos } = persona;
  const celular = (persona.celular ?? "").trim() || null;

  let idPersona = null;

  // 1. Buscar por carnet si viene
  if (carnet) {
    const porCarnet = await client.query(
      `SELECT id_persona FROM persona WHERE carnet = $1`,
      [carnet]
    );
    if (porCarnet.rows.length > 0) {
      idPersona = porCarnet.rows[0].id_persona;
    }
  }

  // 2. Si no se encontró por carnet, buscar por celular
  if (!idPersona && celular) {
    const porCelular = await client.query(
      `SELECT id_persona FROM persona WHERE celular = $1`,
      [celular]
    );
    if (porCelular.rows.length > 0) {
      idPersona = porCelular.rows[0].id_persona;
    }
  }

  // 3. Validar celular único si se va a usar
  if (celular) {
    const celularEnUso = await client.query(
      `SELECT id_persona FROM persona WHERE celular = $1 AND ($2::int IS NULL OR id_persona <> $2)`,
      [celular, idPersona]
    );
    if (celularEnUso.rows.length > 0) {
      throw new Error(
        `El celular ${celular} ya está registrado con otra persona.`
      );
    }
  }

  // 4. Actualizar si ya existe
  if (idPersona) {
    await client.query(
      `UPDATE persona 
       SET nombres = $1, apellidos = $2, celular = $3
       WHERE id_persona = $4`,
      [nombres, apellidos, celular, idPersona]
    );
    return idPersona;
  }

  // 5. Insertar nueva persona
  const carnetFinal = carnet || generarCarnetTemporal();
  const insert = await client.query(
    `INSERT INTO persona (carnet, nombres, apellidos, celular)
     VALUES ($1, $2, $3, $4) RETURNING id_persona`,
    [carnetFinal, nombres, apellidos, celular]
  );
  return insert.rows[0].id_persona;
}

// Genera un carnet temporal único del estilo "TMP-XXXXXX"
function generarCarnetTemporal() {
  const sufijo = Math.floor(100000 + Math.random() * 900000);
  return `TMP-${sufijo}`;
}

// ============================================
// BUSCAR PERSONA (por carnet o celular)
// ============================================
const buscarPersona = async ({ carnet, celular }) => {
  try {
    const carn = (carnet ?? "").trim();
    const cel = (celular ?? "").trim();

    if (!carn && !cel) {
      return {
        success: false,
        message: "Debes enviar carnet o celular para buscar.",
      };
    }

    const condiciones = [];
    const params = [];

    if (carn) {
      params.push(carn);
      condiciones.push(`carnet = $${params.length}`);
    }
    if (cel) {
      params.push(cel);
      condiciones.push(`celular = $${params.length}`);
    }

    const result = await query(
      `SELECT id_persona, carnet, nombres, apellidos, celular
       FROM persona
       WHERE ${condiciones.join(" OR ")}
       LIMIT 1`,
      params
    );

    if (result.rows.length === 0) {
      return { success: false, message: "Persona no encontrada" };
    }

    const p = result.rows[0];
    return {
      success: true,
      persona: {
        carnet: p.carnet,
        nombres: p.nombres,
        apellidos: p.apellidos,
        celular: p.celular,
      },
    };
  } catch (error) {
    console.error("Error al buscar persona:", error);
    throw error;
  }
};

// ============================================
// BUSCAR PERSONA POR CARNET (compatibilidad)
// ============================================
const buscarPersonaPorCarnet = async (carnet) => {
  return buscarPersona({ carnet });
};

// ============================================
// LISTAR TAMAÑOS
// ============================================
const listarTamanos = async () => {
  try {
    const result = await query(
      `SELECT id_tamano, tamano, precio FROM tamano ORDER BY id_tamano`
    );
    return {
      success: true,
      tamanos: result.rows.map((r) => ({
        id_tamano: r.id_tamano,
        tamano: r.tamano,
        precio: r.precio == null ? null : Number(r.precio),
      })),
    };
  } catch (error) {
    console.error("Error al listar tamaños:", error);
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

// ============================================
// CREAR ESTANTE
// ============================================
const crearEstante = async (nombre) => {
  try {
    const limpio = String(nombre).trim().toUpperCase();
    if (!limpio) {
      return { success: false, message: "El nombre del estante no puede estar vacío" };
    }

    const existe = await query(
      `SELECT id_estante FROM estante WHERE UPPER(estante) = $1`,
      [limpio]
    );
    if (existe.rows.length > 0) {
      return { success: false, message: `El estante ${limpio} ya existe` };
    }

    const result = await query(
      `INSERT INTO estante (estante) VALUES ($1) RETURNING id_estante, estante`,
      [limpio]
    );

    return {
      success: true,
      estante: {
        id_estante: result.rows[0].id_estante,
        estante: result.rows[0].estante,
      },
      message: `Estante ${limpio} creado`,
    };
  } catch (error) {
    console.error("Error al crear estante:", error);
    throw error;
  }
};

// ============================================
// EDITAR ESTANTE
// ============================================
const editarEstante = async (idEstante, nombreNuevo) => {
  try {
    const limpio = String(nombreNuevo).trim().toUpperCase();
    if (!limpio) {
      return { success: false, message: "El nombre del estante no puede estar vacío" };
    }

    const actual = await query(
      `SELECT estante FROM estante WHERE id_estante = $1`,
      [idEstante]
    );
    if (actual.rows.length === 0) {
      return { success: false, message: "Estante no encontrado" };
    }

    const enUso = await query(
      `SELECT id_estante FROM estante WHERE UPPER(estante) = $1 AND id_estante <> $2`,
      [limpio, idEstante]
    );
    if (enUso.rows.length > 0) {
      return { success: false, message: `El estante ${limpio} ya existe` };
    }

    const result = await query(
      `UPDATE estante SET estante = $1 WHERE id_estante = $2 RETURNING id_estante, estante`,
      [limpio, idEstante]
    );

    return {
      success: true,
      estante: {
        id_estante: result.rows[0].id_estante,
        estante: result.rows[0].estante,
      },
      message: `Estante actualizado a ${limpio}`,
    };
  } catch (error) {
    console.error("Error al editar estante:", error);
    throw error;
  }
};

// ============================================
// ELIMINAR ESTANTE
// ============================================
const eliminarEstante = async (idEstante) => {
  try {
    const enUso = await query(
      `SELECT COUNT(*)::int AS total FROM tamano_recepcion WHERE id_estante = $1`,
      [idEstante]
    );
    if (enUso.rows[0].total > 0) {
      return {
        success: false,
        message: `No se puede eliminar: hay ${enUso.rows[0].total} paquete(s) usando este estante`,
      };
    }

    const result = await query(
      `DELETE FROM estante WHERE id_estante = $1 RETURNING estante`,
      [idEstante]
    );

    if (result.rows.length === 0) {
      return { success: false, message: "Estante no encontrado" };
    }

    return { success: true, message: `Estante ${result.rows[0].estante} eliminado` };
  } catch (error) {
    console.error("Error al eliminar estante:", error);
    throw error;
  }
};

// ============================================
// SIGUIENTE CÓDIGO DE RECEPCIÓN (ALEATORIO ÚNICO)
// ============================================
const siguienteCodigo = async () => {
  try {
    // Generar un código aleatorio de 6 dígitos y verificar que no exista.
    // Se intentan hasta 20 veces.
    for (let intento = 0; intento < 20; intento++) {
      const numero = Math.floor(100000 + Math.random() * 900000); // 100000 - 999999
      const codigo = `PX-${numero}`;

      const existe = await query(
        `SELECT 1 FROM recepcion WHERE codigo_recepcion = $1`,
        [codigo]
      );
      if (existe.rows.length === 0) {
        return { success: true, codigo };
      }
    }

    // Si después de 20 intentos no encontramos uno libre, devolvemos error.
    return {
      success: false,
      message: "No se pudo generar un código único. Intenta de nuevo.",
    };
  } catch (error) {
    console.error("Error al obtener siguiente código:", error);
    throw error;
  }
};

// ============================================
// LISTAR RECEPCIONES
// ============================================
const listarRecepciones = async () => {
  try {
    const recepcionesRes = await query(
      `SELECT id_recepcion, codigo_recepcion, fecha_recepcion, zona, estado
       FROM recepcion WHERE estado != 'eliminado'
       ORDER BY fecha_recepcion DESC`
    );

    const {
      calcularDiasYSemanas,
      calcularZonaEfectiva,
      calcularTotal,
    } = require("../utils/almacenaje");

    const recepciones = [];
    for (const r of recepcionesRes.rows) {
      const personasRes = await query(
        `SELECT pr.tipo, p.carnet, p.nombres, p.apellidos, p.celular
         FROM persona_recepcion pr
         INNER JOIN persona p ON pr.id_persona = p.id_persona
         WHERE pr.id_recepcion = $1`,
        [r.id_recepcion]
      );
      const dejo = personasRes.rows.find((p) => p.tipo === "deja") || null;
      const recoge = personasRes.rows.find((p) => p.tipo === "recoge") || null;

      const itemsRes = await query(
        `SELECT tr.id_tamano_recepcion, tr.precio_tamano, t.tamano, e.estante
         FROM tamano_recepcion tr
         INNER JOIN tamano t ON tr.id_tamano = t.id_tamano
         LEFT JOIN estante e ON tr.id_estante = e.id_estante
         WHERE tr.id_recepcion = $1`,
        [r.id_recepcion]
      );

      const items = itemsRes.rows.map((it) => ({
        id_tamano_recepcion: it.id_tamano_recepcion,
        precio_tamano: it.precio_tamano == null ? null : Number(it.precio_tamano),
        tamano: it.tamano,
        estante: it.estante,
      }));

      const base = items.reduce((s, it) => s + (it.precio_tamano ?? 0), 0);
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
    console.error("Error al listar recepciones:", error);
    throw error;
  }
};

module.exports = {
  crearRecepcion,
  buscarPersona,
  buscarPersonaPorCarnet,
  listarTamanos,
  listarEstantes,
  listarRecepciones,
  crearEstante,
  editarEstante,
  eliminarEstante,
  siguienteCodigo,
};