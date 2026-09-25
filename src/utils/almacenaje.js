// src/utils/almacenaje.js

const DIA_MS = 86_400_000;
const DIAS_POR_PERIODO = 10; // 👈 antes era 7

/**
 * Calcula días y periodos de 10 días completos desde la fecha de recepción.
 * Nota: el campo se sigue llamando "semanas" para no romper el frontend,
 * pero ahora representa periodos de 10 días.
 * @param {string|Date} fechaRecepcion
 * @returns {{ dias: number, semanas: number }}
 */
function calcularDiasYSemanas(fechaRecepcion) {
  const fecha = new Date(fechaRecepcion).getTime();
  const ms = Date.now() - fecha;
  const dias = Math.max(Math.floor(ms / DIA_MS), 0);
  const semanas = Math.max(Math.floor(dias / DIAS_POR_PERIODO), 0);
  return { dias, semanas };
}

/**
 * Calcula el multiplicador por periodos: 1 + periodos.
 * Ej: 0 periodos -> 1, 1 periodo (10 días) -> 2,
 *     2 periodos (20 días) -> 3, etc.
 */
function multiplicadorPorSemanas(semanas) {
  return semanas + 1;
}

/**
 * Zona efectiva:
 *  - Zona 2 si pasaron 10 días o más (dias >= 10) o si la zona original era Zona 2.
 *  - Zona 1 en caso contrario.
 * Nota: el texto en BD es "Zona 1" / "Zona 2".
 */
function calcularZonaEfectiva(zonaOriginal, dias) {
  if (dias >= DIAS_POR_PERIODO) return "Zona 2";
  return zonaOriginal === "Zona 2" ? "Zona 2" : "Zona 1";
}

/**
 * Dado un precio base (suma de precio_tamano de todos los items)
 * y la fecha de recepción, calcula el total a cobrar.
 */
function calcularTotal(base, fechaRecepcion) {
  const { semanas } = calcularDiasYSemanas(fechaRecepcion);
  const multiplicador = multiplicadorPorSemanas(semanas);
  const total = Number((base * multiplicador).toFixed(2));
  return { total, semanas, multiplicador };
}

module.exports = {
  DIA_MS,
  DIAS_POR_PERIODO,
  calcularDiasYSemanas,
  multiplicadorPorSemanas,
  calcularZonaEfectiva,
  calcularTotal,
};