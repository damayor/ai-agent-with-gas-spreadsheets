// ============================================================
// POLLING — reemplazo del webhook de Telegram
// ============================================================
// Motivo: el webhook (doPost, ver Form.gs) sufre un 302 intermitente
// propio de la plataforma GAS Web App respondiendo a callers no
// autenticados (Telegram no tiene sesión de Google) -> Telegram no
// sigue el redirect, cuenta la entrega como fallida, y los mensajes
// se acumulan en pending_update_count. Fuente:
// https://habr.com/ru/articles/1066054/ (ruso). Detalle completo y
// diagnóstico en context.md.
//
// Solución: Apps Script inicia la llamada hacia Telegram (salida,
// autenticada con el bot token) en vez de esperar que Telegram le
// pegue a /exec (entrada, propensa al 302). Un solo trigger de 1 min
// (tick, abajo) llama a pollTelegram() para no acumular triggers de
// 1 minuto innecesarios (cuota diaria de ejecución de triggers en
// cuenta gratuita: ~90 min/día).
//
// IMPORTANTE: corré crearTriggerTick() UNA SOLA VEZ a mano desde el
// editor de Apps Script para instalar el trigger.
// ============================================================

const PROP_TG_OFFSET = "TG_OFFSET";

// ------------------------------------------------------------
// Trae y procesa updates nuevos de Telegram vía getUpdates
// ------------------------------------------------------------
function pollTelegram() {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty("TELEGRAM_TOKEN");
  if (!token) { Logger.log("pollTelegram: falta TELEGRAM_TOKEN."); return; }

  let offset = Number(props.getProperty(PROP_TG_OFFSET) || "0");

  // OJO: UrlFetchApp.fetch con method "get" NO serializa `payload` como
  // query params -> hay que armar el query string a mano en la URL.
  // allowed_updates incluye message_reaction: por default Telegram NO
  // manda reacciones a menos que se pidan explícitamente.
  const allowedUpdates = encodeURIComponent(JSON.stringify(
    ["message", "edited_message", "message_reaction"]
  ));
  const url = `https://api.telegram.org/bot${token}/getUpdates?offset=${offset}&timeout=0&allowed_updates=${allowedUpdates}`;
  const resp = UrlFetchApp.fetch(url, { method: "get", muteHttpExceptions: true });
  const data = JSON.parse(resp.getContentText());

  if (!data.ok || !data.result.length) return;

  data.result.forEach(function(update) {
    try {
      if (update.message_reaction) {
        procesarReaccionTelegram(update.message_reaction);
      } else {
        procesarUpdateTelegram(update);
      }
      Logger.log("pollTelegram: procesado update " + update.update_id);
    } catch(err) {
      Logger.log("pollTelegram: error procesando update " + update.update_id + ": " + err.message);
    }
    offset = update.update_id + 1;
  });

  props.setProperty(PROP_TG_OFFSET, String(offset));
}

// ------------------------------------------------------------
// Reacciones nativas de Telegram (❤️/👍/👌/👎/🤔) sobre los mensajes
// de enviarRecordatorioHoy():
//   ❤️      -> sabía la palabra de memoria, sin leer la frase.
//              Wort (C/D/E) Y Satz (K/L/M) verde.
//   👍 / 👌 -> se acordó leyendo la frase.
//              Wort amarillo, Satz verde.
//   👎 / 🤔 -> no la entendió ni con el contexto de la frase.
//              Wort Y Satz amarillo + responde con la traducción
//              española (G/H/I).
// ------------------------------------------------------------
const VERDE_REACCION    = "#d9ead3";
const AMARILLO_REACCION = "#fff2cc";

// col (3/4/5, índice de la palabra en C/D/E) -> índice de columna de
// la frase (K/L/M) y de la traducción española (G/H/I).
const COL_FRASE_POR_PALABRA = { 3: 11, 4: 12, 5: 13 };
const COL_TRAD_POR_PALABRA  = { 3: 7,  4: 8,  5: 9  };

function procesarReaccionTelegram(messageReaction) {
  const messageId = messageReaction.message_id;
  const nuevas    = messageReaction.new_reaction || [];
  if (!nuevas.length) return; // reacción quitada, no reacción nueva

  const emoji = nuevas[0].emoji;
  if (!emoji) return;

  const mapeo = obtenerMapeoReaccion(messageId);
  if (!mapeo) {
    Logger.log("procesarReaccionTelegram: sin mapeo (vencido o inexistente) para message_id " + messageId);
    return;
  }

  const ss       = SpreadsheetApp.openById(ID_HOJA);
  const hoja     = ss.getSheetByName(NOMBRE_TAB);
  const colFrase = COL_FRASE_POR_PALABRA[mapeo.col];

  const esCorazon = emoji === "❤" || emoji === "❤️";
  const esOk      = emoji === "👍" || emoji === "👌";
  const esNoSabe  = emoji === "👎" || emoji === "🤔";

  if (esCorazon) {
    hoja.getRange(mapeo.fila, mapeo.col).setBackground(VERDE_REACCION);
    hoja.getRange(mapeo.fila, colFrase).setBackground(VERDE_REACCION);
    return;
  }

  if (esOk) {
    hoja.getRange(mapeo.fila, mapeo.col).setBackground(AMARILLO_REACCION);
    hoja.getRange(mapeo.fila, colFrase).setBackground(VERDE_REACCION);
    return;
  }

  if (esNoSabe) {
    hoja.getRange(mapeo.fila, mapeo.col).setBackground(AMARILLO_REACCION);
    hoja.getRange(mapeo.fila, colFrase).setBackground(AMARILLO_REACCION);
    responderTraduccion(hoja, mapeo);
    return;
  }

  Logger.log("procesarReaccionTelegram: emoji sin mapeo de acción: " + emoji);
}

function responderTraduccion(hoja, mapeo) {
  const colTrad = COL_TRAD_POR_PALABRA[mapeo.col];
  const trad = hoja.getRange(mapeo.fila, colTrad).getValue().toString().trim();
  enviarTelegram(`🇪🇸 <b>${mapeo.orig}</b> → ${trad || "(sin traducción)"}`);
}

// ------------------------------------------------------------
// tick() — un solo trigger de 1 min que dispara polling
// ------------------------------------------------------------
function tick() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    Logger.log("tick: no se pudo tomar el lock, se salta esta corrida.");
    return;
  }
  try {
    pollTelegram();
  } finally {
    lock.releaseLock();
  }
}

// ------------------------------------------------------------
// Instalar el trigger de tiempo — CORRER UNA SOLA VEZ A MANO
// ------------------------------------------------------------
function crearTriggerTick() {
  const yaExiste = ScriptApp.getProjectTriggers()
    .some(function(t) { return t.getHandlerFunction() === "tick"; });

  if (yaExiste) {
    Logger.log("El trigger de tick ya existe, no se crea otro.");
    return;
  }
  ScriptApp.newTrigger("tick")
    .timeBased()
    .everyMinutes(1)
    .create();
  Logger.log("Trigger creado: tick cada 1 minuto (pollTelegram).");
}
