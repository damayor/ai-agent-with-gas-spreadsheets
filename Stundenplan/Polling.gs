// ============================================================
// POLLING — reemplazo del webhook de Telegram
// ============================================================
// Motivo: el webhook (doPost, ver verbindung.gs) sufre un 302
// intermitente propio de la plataforma GAS Web App respondiendo a
// callers no autenticados (Telegram no tiene sesión de Google) ->
// Telegram no sigue el redirect, cuenta la entrega como fallida, y
// reintenta el mismo update en loop -> se queda escribiendo el mismo
// tag por muchas horas en celdas contiguas. Mismo bug ya resuelto así
// en Sprachen (ver Sprachen/Polling.gs y Sprachen/context.md).
//
// Solución: Apps Script inicia la llamada hacia Telegram (salida,
// autenticada con el bot token) en vez de esperar que Telegram le
// pegue a /exec (entrada, propensa al 302). Un solo trigger de 1 min
// (tick, abajo) llama a pollTelegram().
//
// IMPORTANTE: corré crearTriggerTick() UNA SOLA VEZ a mano desde el
// editor de Apps Script para instalar el trigger. Antes de eso, correr
// clearTelegramWebhook() (ver verbindung.gs) para eliminar el webhook
// viejo y no recibir updates por las dos vías a la vez.
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
  const url = `https://api.telegram.org/bot${token}/getUpdates?offset=${offset}&timeout=0`;
  const resp = UrlFetchApp.fetch(url, { method: "get", muteHttpExceptions: true });
  const data = JSON.parse(resp.getContentText());

  if (!data.ok || !data.result.length) return;

  data.result.forEach(function(update) {
    try {
      procesarUpdateTelegram(update);
      Logger.log("pollTelegram: procesado update " + update.update_id);
    } catch(err) {
      Logger.log("pollTelegram: error procesando update " + update.update_id + ": " + err.message);
    }
    offset = update.update_id + 1;
  });

  props.setProperty(PROP_TG_OFFSET, String(offset));
}

// ------------------------------------------------------------
// tick() — trigger de 1 min que dispara el polling
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
