// ============================================================
// INBOX + DICCIONARIO — Captura rápida de palabras sueltas
// ============================================================
// Flujo:
//   1. doPost recibe cualquier texto libre (sin "/") que le escribas
//      -> se guarda YA MISMO en la hoja "Inbox" (appendRow, operación
//         liviana, no escanea nada) -> responde inmediato a Telegram,
//         sin tocar WoerterDesTages para nada.
//   2. Un trigger de tiempo (cada 1 min) procesa el Inbox:
//      -> por cada palabra pendiente, busca la próxima celda vacía en
//         WoerterDesTages columna R (usa PropertiesService como caché
//         del puntero de fila, para no escanear toda la columna cada vez)
//      -> escribe la palabra en R y la fecha de captura en S
//      -> borra las filas ya procesadas del Inbox
//   3. /dictionary [DD/MM/YYYY] muestra las palabras guardadas ese día
//      (default: hoy), + avisa si algo sigue pendiente de procesar
//
// IMPORTANTE: corré crearTriggerInbox() UNA SOLA VEZ a mano desde el
// editor de Apps Script para instalar el trigger. No hace falta
// volver a correrlo (ya valida que no se duplique).
// ============================================================

const NOMBRE_TAB_INBOX = "Inbox";
const COL_R_PALABRA    = 18; // columna R
const COL_S_FECHA      = 19; // columna S
const PROP_PUNTERO_R   = "PUNTERO_FILA_R";

// ------------------------------------------------------------
// 1. Captura rápida — se llama desde doPost con texto libre
// ------------------------------------------------------------
function guardarEnInbox(chatId, texto) {
  const ss = SpreadsheetApp.openById(ID_HOJA_F);
  let hoja = ss.getSheetByName(NOMBRE_TAB_INBOX);
  if (!hoja) hoja = crearHojaInbox(ss);

  hoja.appendRow([new Date(), chatId, texto]);
}

function crearHojaInbox(ss) {
  const hoja = ss.insertSheet(NOMBRE_TAB_INBOX);
  hoja.appendRow(["Timestamp", "ChatId", "Palabra"]);
  hoja.setFrozenRows(1);
  return hoja;
}

function probarInboxManual() {
  guardarEnInbox("test", "palabraDePrueba");
  Logger.log("Listo, revisá la hoja Inbox en el Sheet.");
}

// ------------------------------------------------------------
// 2. Procesar Inbox -> escribir en columna R/S de WoerterDesTages
//    Disparado por el trigger de tiempo (crearTriggerInbox, abajo)
// ------------------------------------------------------------
function procesarInbox() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    Logger.log("procesarInbox: no se pudo tomar el lock, se salta esta corrida.");
    return;
  }

  try {
    const ss        = SpreadsheetApp.openById(ID_HOJA_F);
    const hojaInbox  = ss.getSheetByName(NOMBRE_TAB_INBOX);
    if (!hojaInbox) return;

    const ultimaFila = hojaInbox.getLastRow();
    if (ultimaFila < 2) return; // solo encabezado, nada pendiente

    const pendientes = hojaInbox.getRange(2, 1, ultimaFila - 1, 3).getValues();
    if (pendientes.length === 0) return;

    const hojaPrincipal = ss.getSheetByName(NOMBRE_TAB_F);
    let filaR = obtenerProximaFilaR(hojaPrincipal);

    pendientes.forEach(function(fila) {
      const timestamp = fila[0];
      const palabra   = fila[2];
      if (!palabra) return;

      const fecha = Utilities.formatDate(new Date(timestamp), ZONA_HOR_F, "dd/MM/yyyy");
      hojaPrincipal.getRange(filaR, COL_R_PALABRA).setValue(palabra);
      hojaPrincipal.getRange(filaR, COL_S_FECHA).setValue(fecha);
      filaR++;
    });

    // Guardamos el puntero para la próxima corrida (evita reescanear la columna)
    PropertiesService.getScriptProperties().setProperty(PROP_PUNTERO_R, String(filaR));

    // Borramos ya procesado del Inbox
    hojaInbox.deleteRows(2, ultimaFila - 1);

  } finally {
    lock.releaseLock();
  }
}

function obtenerProximaFilaR(hojaPrincipal) {
  const props    = PropertiesService.getScriptProperties();
  const guardado = props.getProperty(PROP_PUNTERO_R);

  if (guardado) {
    const fila = parseInt(guardado);
    // Verificación rápida: si esa celda ya tiene algo (p.ej. alguien
    // escribió manualmente en la hoja), el puntero quedó desactualizado
    if (fila > 0 && !hojaPrincipal.getRange(fila, COL_R_PALABRA).getValue()) {
      return fila;
    }
  }

  // Fallback: escanear columna R para encontrar la primera celda vacía
  const ultimaFila = Math.max(hojaPrincipal.getLastRow(), 2);
  const valores = hojaPrincipal.getRange(2, COL_R_PALABRA, ultimaFila - 1, 1).getValues();
  for (let i = 0; i < valores.length; i++) {
    if (!valores[i][0]) return i + 2;
  }
  return ultimaFila + 1;
}

// ------------------------------------------------------------
// 3. /dictionary [DD/MM/YYYY]
// ------------------------------------------------------------
function manejarDictionary(chatId, texto) {
  const arg = texto.replace(/^\/dictionary\s*/i, "").trim();
  const fechaObjetivo = arg || Utilities.formatDate(new Date(), ZONA_HOR_F, "dd/MM/yyyy");

  if (!fechaObjetivo.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
    responderTelegram(chatId, "⚠️ Formato: <code>/dictionary DD/MM/YYYY</code> (o sin fecha para hoy)");
    return;
  }

  const ss   = SpreadsheetApp.openById(ID_HOJA_F);
  const hoja = ss.getSheetByName(NOMBRE_TAB_F);
  const ultimaFila = hoja.getLastRow();

  let palabras = [];
  if (ultimaFila >= 2) {
    const datos = hoja.getRange(2, COL_R_PALABRA, ultimaFila - 1, 2).getValues(); // R y S
    palabras = datos
      .filter(function(fila) { return fila[0] && fila[1] === fechaObjetivo; })
      .map(function(fila) { return fila[0]; });
  }

  const hojaInbox   = ss.getSheetByName(NOMBRE_TAB_INBOX);
  const pendientes  = hojaInbox ? Math.max(0, hojaInbox.getLastRow() - 1) : 0;

  let respuesta = `📖 <b>Diccionario · ${fechaObjetivo}</b>\n\n`;
  respuesta += palabras.length
    ? palabras.map(function(p) { return "• " + p; }).join("\n")
    : "📭 Nada guardado ese día todavía.";

  if (pendientes > 0) {
    respuesta += `\n\n⏳ ${pendientes} palabra(s) recién llegada(s), se procesan en el próximo minuto.`;
  }

  responderTelegram(chatId, respuesta);
}

// ------------------------------------------------------------
// Instalar el trigger de tiempo — CORRER UNA SOLA VEZ A MANO
// ------------------------------------------------------------
function crearTriggerInbox() {
  const yaExiste = ScriptApp.getProjectTriggers()
    .some(function(t) { return t.getHandlerFunction() === "procesarInbox"; });

  if (yaExiste) {
    Logger.log("El trigger de procesarInbox ya existe, no se crea otro.");
    return;
  }
  ScriptApp.newTrigger("procesarInbox")
    .timeBased()
    .everyMinutes(1)
    .create();
  Logger.log("Trigger creado: procesarInbox cada 1 minuto.");
}