// src/services/usuarioService.js
const bcrypt = require("bcrypt");
const { query, pool } = require("../../db");

// ============================================
// HELPERS
// ============================================
const SELECT_BASE = `
  SELECT
    u.id_usuario,
    u.id_persona,
    u.usuario,
    u.rol,
    u.estado,
    p.carnet,
    p.nombres,
    p.apellidos,
    p.celular
  FROM usuario u
  INNER JOIN persona p ON u.id_persona = p.id_persona
`;

const mapUsuario = (row) => ({
  id_usuario: row.id_usuario,
  id_persona: row.id_persona,
  carnet: row.carnet,
  nombres: row.nombres,
  apellidos: row.apellidos,
  celular: row.celular,
  usuario: row.usuario,
  rol: row.rol,
  estado: row.estado,
});

// ============================================
// LISTAR USUARIOS
// ============================================
const listarUsuarios = async (q) => {
  try {
    const texto = String(q || "").trim();

    let sql = `${SELECT_BASE}
      WHERE u.estado <> 'eliminado'`;
    const params = [];

    if (texto) {
      const like = `%${texto}%`;
      sql += ` AND (
        p.carnet ILIKE $1
        OR p.nombres ILIKE $1
        OR p.apellidos ILIKE $1
        OR (p.nombres || ' ' || p.apellidos) ILIKE $1
        OR p.celular ILIKE $1
        OR u.usuario ILIKE $1
      )`;
      params.push(like);
    }

    sql += ` ORDER BY u.id_usuario ASC`;

    const result = await query(sql, params);

    return {
      success: true,
      usuarios: result.rows.map(mapUsuario),
    };
  } catch (error) {
    console.error("Error al listar usuarios:", error);
    throw error;
  }
};

// ============================================
// OBTENER UN USUARIO
// ============================================
const obtenerUsuario = async (idUsuario) => {
  try {
    const result = await query(
      `${SELECT_BASE} WHERE u.id_usuario = $1 AND u.estado <> 'eliminado'`,
      [idUsuario]
    );

    if (result.rows.length === 0) {
      return { success: false, message: "Usuario no encontrado" };
    }

    return { success: true, usuario: mapUsuario(result.rows[0]) };
  } catch (error) {
    console.error("Error al obtener usuario:", error);
    throw error;
  }
};

// ============================================
// CREAR USUARIO (transacción)
// ============================================
const crearUsuario = async (data) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Validar que el carnet no exista
    const existePersona = await client.query(
      `SELECT id_persona FROM persona WHERE carnet = $1`,
      [data.carnet]
    );

    let idPersona;
    if (existePersona.rows.length > 0) {
      idPersona = existePersona.rows[0].id_persona;

      // Verificar que esa persona no tenga ya un usuario
      const existeUsuario = await client.query(
        `SELECT id_usuario FROM usuario WHERE id_persona = $1 AND estado <> 'eliminado'`,
        [idPersona]
      );
      if (existeUsuario.rows.length > 0) {
        throw new Error("Ya existe un usuario con ese carnet");
      }

      // Actualizar datos de la persona
      await client.query(
        `UPDATE persona
         SET nombres = $1, apellidos = $2, celular = $3
         WHERE id_persona = $4`,
        [data.nombres, data.apellidos, data.celular, idPersona]
      );
    } else {
      const nuevaPersona = await client.query(
        `INSERT INTO persona (carnet, nombres, apellidos, celular)
         VALUES ($1, $2, $3, $4)
         RETURNING id_persona`,
        [data.carnet, data.nombres, data.apellidos, data.celular]
      );
      idPersona = nuevaPersona.rows[0].id_persona;
    }

    // 2. Validar usuario único
    const existeUsername = await client.query(
      `SELECT id_usuario FROM usuario WHERE usuario = $1`,
      [data.usuario]
    );
    if (existeUsername.rows.length > 0) {
      throw new Error("El nombre de usuario ya está en uso");
    }

    // 3. Hashear contraseña
    const hash = await bcrypt.hash(data.contrasena, 10);

    // 4. Insertar usuario
    const nuevoUsuario = await client.query(
      `INSERT INTO usuario (id_persona, usuario, contrasena, rol, estado)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id_usuario`,
      [idPersona, data.usuario, hash, data.rol, data.estado || "activo"]
    );

    const idUsuario = nuevoUsuario.rows[0].id_usuario;

    // 5. Devolver el usuario completo
    const result = await client.query(
      `${SELECT_BASE} WHERE u.id_usuario = $1`,
      [idUsuario]
    );

    await client.query("COMMIT");

    return {
      success: true,
      usuario: mapUsuario(result.rows[0]),
      message: "Usuario creado exitosamente",
    };
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error al crear usuario:", error);
    throw error;
  } finally {
    client.release();
  }
};

// ============================================
// EDITAR USUARIO (transacción)
// ============================================
const editarUsuario = async (idUsuario, data) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Cargar usuario + persona
    const actualRes = await client.query(
      `SELECT u.id_usuario, u.id_persona
       FROM usuario u
       WHERE u.id_usuario = $1 AND u.estado <> 'eliminado'
       FOR UPDATE`,
      [idUsuario]
    );

    if (actualRes.rows.length === 0) {
      throw new Error("Usuario no encontrado");
    }

    const { id_persona: idPersona } = actualRes.rows[0];

    // 2. Validar carnet único (excluyendo esta persona)
    const carnetDup = await client.query(
      `SELECT id_persona FROM persona WHERE carnet = $1 AND id_persona <> $2`,
      [data.carnet, idPersona]
    );
    if (carnetDup.rows.length > 0) {
      throw new Error("El carnet ya está registrado en otra persona");
    }

    // 3. Validar usuario único (excluyendo este usuario)
    const userDup = await client.query(
      `SELECT id_usuario FROM usuario WHERE usuario = $1 AND id_usuario <> $2`,
      [data.usuario, idUsuario]
    );
    if (userDup.rows.length > 0) {
      throw new Error("El nombre de usuario ya está en uso");
    }

    // 4. Actualizar persona
    await client.query(
      `UPDATE persona
       SET carnet = $1, nombres = $2, apellidos = $3, celular = $4
       WHERE id_persona = $5`,
      [data.carnet, data.nombres, data.apellidos, data.celular, idPersona]
    );

    // 5. Actualizar usuario (contraseña solo si viene)
    if (data.contrasena) {
      const hash = await bcrypt.hash(data.contrasena, 10);
      await client.query(
        `UPDATE usuario
         SET usuario = $1, contrasena = $2, rol = $3, estado = $4
         WHERE id_usuario = $5`,
        [data.usuario, hash, data.rol, data.estado, idUsuario]
      );
    } else {
      await client.query(
        `UPDATE usuario
         SET usuario = $1, rol = $2, estado = $3
         WHERE id_usuario = $4`,
        [data.usuario, data.rol, data.estado, idUsuario]
      );
    }

    // 6. Devolver actualizado
    const result = await client.query(
      `${SELECT_BASE} WHERE u.id_usuario = $1`,
      [idUsuario]
    );

    await client.query("COMMIT");

    return {
      success: true,
      usuario: mapUsuario(result.rows[0]),
      message: "Usuario actualizado exitosamente",
    };
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error al editar usuario:", error);
    throw error;
  } finally {
    client.release();
  }
};

// ============================================
// CAMBIAR ESTADO
// ============================================
const cambiarEstado = async (idUsuario, estado) => {
  try {
    const result = await query(
      `UPDATE usuario
       SET estado = $1
       WHERE id_usuario = $2 AND estado <> 'eliminado'
       RETURNING id_usuario`,
      [estado, idUsuario]
    );

    if (result.rows.length === 0) {
      return { success: false, message: "Usuario no encontrado" };
    }

    const full = await query(
      `${SELECT_BASE} WHERE u.id_usuario = $1`,
      [idUsuario]
    );

    return {
      success: true,
      usuario: mapUsuario(full.rows[0]),
      message: `Usuario ${estado === "activo" ? "habilitado" : "inhabilitado"}`,
    };
  } catch (error) {
    console.error("Error al cambiar estado:", error);
    throw error;
  }
};

// ============================================
// ELIMINAR (SOFT DELETE)
// ============================================
const eliminarUsuario = async (idUsuario) => {
  try {
    const result = await query(
      `UPDATE usuario
       SET estado = 'eliminado'
       WHERE id_usuario = $1 AND estado <> 'eliminado'
       RETURNING id_usuario`,
      [idUsuario]
    );

    if (result.rows.length === 0) {
      return { success: false, message: "Usuario no encontrado" };
    }

    return { success: true, message: "Usuario eliminado exitosamente" };
  } catch (error) {
    console.error("Error al eliminar usuario:", error);
    throw error;
  }
};

module.exports = {
  listarUsuarios,
  obtenerUsuario,
  crearUsuario,
  editarUsuario,
  cambiarEstado,
  eliminarUsuario,
};