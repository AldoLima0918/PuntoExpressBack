// src/services/configuracionService.js
const { query } = require("../../db");

// ============================================
// ─── ESTANTES ───────────────────────────────
// ============================================

const listarEstantes = async () => {
  try {
    const result = await query(
      `SELECT id_estante, estante
       FROM estante
       ORDER BY id_estante ASC`
    );

    return {
      success: true,
      estantes: result.rows.map((row) => ({
        id_estante: row.id_estante,
        estante: row.estante,
      })),
    };
  } catch (error) {
    console.error("Error al listar estantes:", error);
    throw error;
  }
};

const crearEstante = async (nombre) => {
  try {
    // Validar duplicado
    const existe = await query(`SELECT id_estante FROM estante WHERE estante = $1`, [
      nombre,
    ]);
    if (existe.rows.length > 0) {
      return { success: false, message: "Ese estante ya existe" };
    }

    const result = await query(
      `INSERT INTO estante (estante) VALUES ($1)
       RETURNING id_estante, estante`,
      [nombre]
    );

    return {
      success: true,
      estante: {
        id_estante: result.rows[0].id_estante,
        estante: result.rows[0].estante,
      },
      message: `Estante ${nombre} agregado`,
    };
  } catch (error) {
    console.error("Error al crear estante:", error);
    throw error;
  }
};

const editarEstante = async (idEstante, nombre) => {
  try {
    // Validar que exista
    const actual = await query(
      `SELECT id_estante FROM estante WHERE id_estante = $1`,
      [idEstante]
    );
    if (actual.rows.length === 0) {
      return { success: false, message: "Estante no encontrado" };
    }

    // Validar duplicado (excluyendo el actual)
    const dup = await query(
      `SELECT id_estante FROM estante WHERE estante = $1 AND id_estante <> $2`,
      [nombre, idEstante]
    );
    if (dup.rows.length > 0) {
      return { success: false, message: "Ya existe otro estante con ese nombre" };
    }

    const result = await query(
      `UPDATE estante SET estante = $1 WHERE id_estante = $2
       RETURNING id_estante, estante`,
      [nombre, idEstante]
    );

    return {
      success: true,
      estante: {
        id_estante: result.rows[0].id_estante,
        estante: result.rows[0].estante,
      },
      message: "Estante actualizado",
    };
  } catch (error) {
    console.error("Error al editar estante:", error);
    throw error;
  }
};

const eliminarEstante = async (idEstante) => {
  try {
    // Validar que exista
    const actual = await query(
      `SELECT id_estante FROM estante WHERE id_estante = $1`,
      [idEstante]
    );
    if (actual.rows.length === 0) {
      return { success: false, message: "Estante no encontrado" };
    }

    // Validar que no esté en uso
    const enUso = await query(
      `SELECT 1 FROM tamano_recepcion WHERE id_estante = $1 LIMIT 1`,
      [idEstante]
    );
    if (enUso.rows.length > 0) {
      return {
        success: false,
        message: "No se puede eliminar: el estante está en uso en una recepción",
      };
    }

    await query(`DELETE FROM estante WHERE id_estante = $1`, [idEstante]);

    return { success: true, message: "Estante eliminado" };
  } catch (error) {
    console.error("Error al eliminar estante:", error);
    throw error;
  }
};

// ============================================
// ─── TAMAÑOS ────────────────────────────────
// ============================================

const listarTamanos = async () => {
  try {
    const result = await query(
      `SELECT id_tamano, tamano, precio
       FROM tamano
       ORDER BY id_tamano ASC`
    );

    return {
      success: true,
      tamanos: result.rows.map((row) => ({
        id_tamano: row.id_tamano,
        tamano: row.tamano,
        precio: row.precio !== null ? Number(row.precio) : null,
      })),
    };
  } catch (error) {
    console.error("Error al listar tamaños:", error);
    throw error;
  }
};

const crearTamano = async (nombre, precio) => {
  try {
    // Validar duplicado
    const existe = await query(
      `SELECT id_tamano FROM tamano WHERE tamano ILIKE $1`,
      [nombre]
    );
    if (existe.rows.length > 0) {
      return { success: false, message: "Ese tamaño ya existe" };
    }

    const result = await query(
      `INSERT INTO tamano (tamano, precio) VALUES ($1, $2)
       RETURNING id_tamano, tamano, precio`,
      [nombre, precio]
    );

    return {
      success: true,
      tamano: {
        id_tamano: result.rows[0].id_tamano,
        tamano: result.rows[0].tamano,
        precio: Number(result.rows[0].precio),
      },
      message: `Tamaño ${nombre} agregado`,
    };
  } catch (error) {
    console.error("Error al crear tamaño:", error);
    throw error;
  }
};

const editarTamano = async (idTamano, nombre, precio) => {
  try {
    // Validar que exista
    const actual = await query(
      `SELECT id_tamano FROM tamano WHERE id_tamano = $1`,
      [idTamano]
    );
    if (actual.rows.length === 0) {
      return { success: false, message: "Tamaño no encontrado" };
    }

    // Validar duplicado (excluyendo el actual)
    const dup = await query(
      `SELECT id_tamano FROM tamano WHERE tamano ILIKE $1 AND id_tamano <> $2`,
      [nombre, idTamano]
    );
    if (dup.rows.length > 0) {
      return { success: false, message: "Ya existe otro tamaño con ese nombre" };
    }

    const result = await query(
      `UPDATE tamano SET tamano = $1, precio = $2 WHERE id_tamano = $3
       RETURNING id_tamano, tamano, precio`,
      [nombre, precio, idTamano]
    );

    return {
      success: true,
      tamano: {
        id_tamano: result.rows[0].id_tamano,
        tamano: result.rows[0].tamano,
        precio: Number(result.rows[0].precio),
      },
      message: "Tamaño actualizado",
    };
  } catch (error) {
    console.error("Error al editar tamaño:", error);
    throw error;
  }
};

const eliminarTamano = async (idTamano) => {
  try {
    // Validar que exista
    const actual = await query(
      `SELECT id_tamano FROM tamano WHERE id_tamano = $1`,
      [idTamano]
    );
    if (actual.rows.length === 0) {
      return { success: false, message: "Tamaño no encontrado" };
    }

    // Validar que no esté en uso
    const enUso = await query(
      `SELECT 1 FROM tamano_recepcion WHERE id_tamano = $1 LIMIT 1`,
      [idTamano]
    );
    if (enUso.rows.length > 0) {
      return {
        success: false,
        message: "No se puede eliminar: el tamaño está en uso en una recepción",
      };
    }

    await query(`DELETE FROM tamano WHERE id_tamano = $1`, [idTamano]);

    return { success: true, message: "Tamaño eliminado" };
  } catch (error) {
    console.error("Error al eliminar tamaño:", error);
    throw error;
  }
};

module.exports = {
  listarEstantes,
  crearEstante,
  editarEstante,
  eliminarEstante,
  listarTamanos,
  crearTamano,
  editarTamano,
  eliminarTamano,
};