// src/utils/almacenaje.js

const DIA_MS = 86_400_000;

/**
 * Calcula días y semanas completas desde la fecha de recepción.
 * @param {string|Date} fechaRecepcion
 * @returns {{ dias: number, semanas: number }}
 */
function calcularDiasYSemanas(fechaRecepcion) {
  const fecha = new Date(fechaRecepcion).getTime();
  const ms = Date.now() - fecha;
  const dias = Math.max(Math.floor(ms / DIA_MS), 0);
  const semanas = Math.max(Math.floor(dias / 7), 0);
  return { dias, semanas };
}

/**
 * Calcula el multiplicador por semanas: 1 + semanas.
 * Ej: 0 semanas -> 1, 1 semana -> 2, 2 semanas -> 3, etc.
 */
function multiplicadorPorSemanas(semanas) {
  return semanas + 1;
}

/**
 * Zona efectiva:
 *  - Zona 2 si pasaron 7 días o más (dias >= 7) o si la zona original era Zona 2.
 *  - Zona 1 en caso contrario.
 * Nota: el texto en BD es "Zona 1" / "Zona 2".
 */
function calcularZonaEfectiva(zonaOriginal, dias) {
  if (dias >= 7) return "Zona 2";
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
  calcularDiasYSemanas,
  multiplicadorPorSemanas,
  calcularZonaEfectiva,
  calcularTotal,
};