// src/services/reportesService.js
const { query } = require("../../db");
const {
  calcularDiasYSemanas,
  calcularZonaEfectiva,
  calcularTotal,
} = require("../utils/almacenaje");

const MESES = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];

// ============================================
// RECEPCIONES ACTIVAS (pendientes)
// ============================================
const listarRecepcionesActivas = async () => {
  try {
    // 1. Traer todas las recepciones pendientes
    const cabRes = await query(
      `SELECT id_recepcion, codigo_recepcion, fecha_recepcion, zona
       FROM recepcion
       WHERE estado = 'pendiente'
       ORDER BY fecha_recepcion ASC`
    );

    if (cabRes.rows.length === 0) {
      return { success: true, recepciones: [] };
    }

    const ids = cabRes.rows.map((r) => r.id_recepcion);

    // 2. Traer items con estantes de todas las recepciones (1 sola query)
    const itemsRes = await query(
      `SELECT tr.id_recepcion, tr.precio_tamano, e.estante
       FROM tamano_recepcion tr
       LEFT JOIN estante e ON tr.id_estante = e.id_estante
       WHERE tr.id_recepcion = ANY($1::int[])`,
      [ids]
    );

    // 3. Traer personas "recoge" de todas las recepciones (1 sola query)
    const recogeRes = await query(
      `SELECT pr.id_recepcion,
              p.carnet, p.nombres, p.apellidos, p.celular
       FROM persona_recepcion pr
       INNER JOIN persona p ON pr.id_persona = p.id_persona
       WHERE pr.tipo = 'recoge'
         AND pr.id_recepcion = ANY($1::int[])`,
      [ids]
    );

    // 4. Agrupar por id_recepcion
    const itemsPorRecepcion = new Map();
    for (const it of itemsRes.rows) {
      const lista = itemsPorRecepcion.get(it.id_recepcion) ?? [];
      lista.push(it);
      itemsPorRecepcion.set(it.id_recepcion, lista);
    }

    const recogePorRecepcion = new Map();
    for (const r of recogeRes.rows) {
      recogePorRecepcion.set(r.id_recepcion, {
        carnet: r.carnet,
        nombres: r.nombres,
        apellidos: r.apellidos,
        celular: r.celular,
      });
    }

    // 5. Armar respuesta
    const recepciones = cabRes.rows.map((cab) => {
      const items = itemsPorRecepcion.get(cab.id_recepcion) ?? [];

      // Sumar base
      const base = items.reduce(
        (s, it) => s + Number(it.precio_tamano || 0),
        0
      );

      // Estantes únicos (no nulos)
      const estantes = [
        ...new Set(items.map((i) => i.estante).filter(Boolean)),
      ];

      // Cálculos de almacenaje
      const { dias, semanas } = calcularDiasYSemanas(cab.fecha_recepcion);
      const { total, multiplicador } = calcularTotal(
        base,
        cab.fecha_recepcion
      );
      const zonaEfectiva = calcularZonaEfectiva(cab.zona, dias);

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
        estantes,
        recoge: recogePorRecepcion.get(cab.id_recepcion) ?? null,
      };
    });

    return { success: true, recepciones };
  } catch (error) {
    console.error("Error al listar recepciones activas:", error);
    throw error;
  }
};

// ============================================
// TENDENCIA MENSUAL (ventas agrupadas por mes)
// ============================================
const obtenerTendenciaMensual = async () => {
  try {
    const result = await query(
      `SELECT
         EXTRACT(YEAR FROM fecha_venta)::int  AS anio,
         EXTRACT(MONTH FROM fecha_venta)::int AS mes,
         COUNT(*)::int                        AS ventas,
         COALESCE(SUM(total), 0)::numeric     AS monto
       FROM venta
       GROUP BY anio, mes
       ORDER BY anio ASC, mes ASC`
    );

    const tendencia = result.rows.map((row) => {
      const mesIdx = row.mes - 1; // 0..11
      return {
        clave: `${row.anio}-${mesIdx}`,
        mes: `${MESES[mesIdx]} ${row.anio}`,
        ventas: row.ventas,
        monto: Number(row.monto),
      };
    });

    return { success: true, tendencia };
  } catch (error) {
    console.error("Error al obtener tendencia mensual:", error);
    throw error;
  }
};

module.exports = {
  listarRecepcionesActivas,
  obtenerTendenciaMensual,
};