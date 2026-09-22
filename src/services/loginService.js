// src/services/loginService.js
const { query } = require("../../db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

// ============================================
// AUTENTICAR USUARIO
// ============================================
const authenticateUser = async (username, password) => {
  try {
    console.log("=== authenticateUser ===");
    console.log("Username:", username);

    // 1. Buscar usuario en la base de datos
    const userQuery = `
      SELECT 
        u.id_usuario,
        u.id_persona,
        u.usuario,
        u.contrasena,
        u.rol,
        u.estado,
        p.carnet,
        p.nombres,
        p.apellidos,
        p.celular
      FROM usuario u
      INNER JOIN persona p ON u.id_persona = p.id_persona
      WHERE u.usuario = $1
    `;

    const result = await query(userQuery, [username]);

    if (result.rows.length === 0) {
      console.log("Usuario no encontrado");
      return {
        success: false,
        message: "Usuario no encontrado"
      };
    }

    const user = result.rows[0];
    console.log("Usuario encontrado:", user.usuario, "Rol:", user.rol);

    // 2. Verificar estado del usuario
    if (user.estado !== "activo") {
      console.log("Usuario inactivo");
      return {
        success: false,
        message: "Usuario inactivo"
      };
    }

    // 3. Verificar contraseña
    const isPasswordValid = await bcrypt.compare(password, user.contrasena);

    if (!isPasswordValid) {
      console.log("Contraseña incorrecta");
      return {
        success: false,
        message: "Credenciales incorrectas"
      };
    }

    console.log("Contraseña correcta");

    // 4. Generar token JWT
    const token = jwt.sign(
      {
        id_usuario: user.id_usuario,
        id_persona: user.id_persona,
        usuario: user.usuario,
        rol: user.rol
      },
      process.env.JWT_SECRET || "punto-express-secret-key-2024",
      { expiresIn: "24h" }
    );

    // 5. Preparar datos del usuario para retornar
    const userData = {
      id_usuario: user.id_usuario,
      id_persona: user.id_persona,
      username: user.usuario,
      name: user.nombres,
      lastname: user.apellidos,
      role: user.rol,
      phoneNumber: user.celular,
      status: user.estado
    };

    console.log("Datos de usuario a retornar:");
    console.log("- username:", userData.username);
    console.log("- role:", userData.role);

    return {
      success: true,
      message: "Autenticación exitosa",
      token,
      user: userData
    };

  } catch (error) {
    console.error("Error en authService:", error);
    throw new Error("Error al autenticar usuario");
  }
};

// ============================================
// CAMBIAR CONTRASEÑA
// ============================================
const changePassword = async (userId, currentPassword, newPassword) => {
  try {
    // 1. Obtener contraseña actual del usuario
    const userQuery = `
      SELECT contrasena 
      FROM usuario 
      WHERE id_usuario = $1
    `;

    const result = await query(userQuery, [userId]);

    if (result.rows.length === 0) {
      return {
        success: false,
        message: "Usuario no encontrado"
      };
    }

    const user = result.rows[0];

    // 2. Verificar contraseña actual
    const isPasswordValid = await bcrypt.compare(currentPassword, user.contrasena);

    if (!isPasswordValid) {
      return {
        success: false,
        message: "Contraseña actual incorrecta"
      };
    }

    // 3. Validar nueva contraseña
    if (newPassword.length < 6) {
      return {
        success: false,
        message: "La nueva contraseña debe tener al menos 6 caracteres"
      };
    }

    // 4. Hash de la nueva contraseña
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // 5. Actualizar contraseña en la base de datos
    const updateQuery = `
      UPDATE usuario 
      SET contrasena = $1 
      WHERE id_usuario = $2
    `;

    await query(updateQuery, [hashedPassword, userId]);

    return {
      success: true,
      message: "Contraseña cambiada exitosamente"
    };

  } catch (error) {
    console.error("Error al cambiar contraseña:", error);
    throw new Error("Error al cambiar contraseña");
  }
};

// ============================================
// OBTENER USUARIO POR USERNAME
// ============================================
const getUsuarioByUsername = async (username) => {
  try {
    const userQuery = `
      SELECT 
        u.id_usuario,
        u.id_persona,
        u.usuario,
        u.contrasena,
        u.rol,
        u.estado,
        p.carnet,
        p.nombres,
        p.apellidos,
        p.celular
      FROM usuario u
      INNER JOIN persona p ON u.id_persona = p.id_persona
      WHERE u.usuario = $1
    `;

    const result = await query(userQuery, [username]);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  } catch (error) {
    console.error("Error al obtener usuario:", error);
    return null;
  }
};

module.exports = {
  authenticateUser,
  changePassword,
  getUsuarioByUsername
};