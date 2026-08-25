// ============================================================
// WOERTER DES TAGES — Spaced Repetition · Telegram Edition
// ============================================================
//
// ÚNICA CONFIGURACIÓN — solo tocás esta sección
// ============================================================
const EMAIL_DESTINO = "dr.mayorga20@gmail.com";
const ID_HOJA       = "1yYJzqZmJOvM6lMMXLdf_ZWMEaa0_vvDWDeu87T2sm38";
const NOMBRE_TAB    = "WoerterDesTages";
const ZONA_HORARIA  = "Europe/Berlin";

// INTERVALOS — se puede sobreescribir desde Telegram con /intervalos
// Si hay un valor guardado en PropertiesService, ese tiene prioridad.
// Para resetear al valor de acá, usá /intervalos reset desde Telegram.
const INTERVALOS_DEFAULT = [2, 5, 7, 14, 30, 120, 90];
const HORAS_TRIGGER_REPASO = [9, 11, 13, 15, 17, 19, 21];

// ============================================================
// NO es necesario tocar nada debajo de esta línea
// ============================================================

function obtenerIntervalos() {
  const props = PropertiesService.getScriptProperties();
  const guardado = props.getProperty("INTERVALOS");
  if (guardado) {
    try { return JSON.parse(guardado); } catch(e) {}
  }
  return INTERVALOS_DEFAULT;
}

function guardarIntervalos(arr) {
  PropertiesService.getScriptProperties().setProperty("INTERVALOS", JSON.stringify(arr));
}

// --- Contador diario -----------------------------------------

function obtenerIndiceDeHoy() {
  const props    = PropertiesService.getScriptProperties();
  const hoy      = Utilities.formatDate(new Date(), ZONA_HORARIA, "yyyy-MM-dd");
  const clave    = `disparos_${hoy}`;
  const disparos = parseInt(props.getProperty(clave) || "0");
  props.setProperty(clave, String(disparos + 1));
  const ayer = Utilities.formatDate(new Date(Date.now() - 86400000), ZONA_HORARIA, "yyyy-MM-dd");
  props.deleteProperty(`disparos_${ayer}`);
  return disparos;
}

function resetearContadorHoy() {
  const props = PropertiesService.getScriptProperties();
  const hoy   = Utilities.formatDate(new Date(), ZONA_HORARIA, "yyyy-MM-dd");
  props.deleteProperty(`disparos_${hoy}`);
  Logger.log("✅ Contador de hoy reseteado.");
}

function verContadorHoy() {
  const props = PropertiesService.getScriptProperties();
  const hoy   = Utilities.formatDate(new Date(), ZONA_HORARIA, "yyyy-MM-dd");
  Logger.log(`Disparos hoy (${hoy}): ${props.getProperty(`disparos_${hoy}`) || "0"}`);
}

// --- Utilidades ----------------------------------------------

function etiquetaDias(dias, fechaOrigen) {
  const INTERVALOS = obtenerIntervalos();
  const esUltimo   = dias === INTERVALOS[INTERVALOS.length - 1];
  const sufijo     = esUltimo ? " ✅" : "";

  // Formato: "Lun 23 Jun (+3d)"
  const diasSemana = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const diaSem     = diasSemana[fechaOrigen.getDay()];
  const diaMes     = fechaOrigen.getDate().toString().padStart(2, "0");
  const mesCorto   = fechaOrigen.toLocaleString('de-DE', { month: 'short' });

  return `${diaSem} ${diaMes}-${mesCorto} (+${dias}d)${sufijo}`;
}

function parsearFecha(celda) {
  if (!celda) return null;
  if (celda instanceof Date) {
    if (isNaN(celda.getTime())) return null;
    const d = new Date(celda); d.setHours(0,0,0,0); return d;
  }
  const str   = celda.toString().trim();
  const match = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) {
    const d = new Date(parseInt(match[3]), parseInt(match[2])-1, parseInt(match[1]));
    d.setHours(0,0,0,0); return d;
  }
  return null;
}

function tieneFrase(celda) {
  const val = (celda || "").toString().trim();
  if (!val || val === "-" || val === "–" || val === "...") return false;
  if (val.endsWith("...")) return false;
  return true;
}

// --- Telegram ------------------------------------------------

function enviarTelegram(mensaje) {
  const props  = PropertiesService.getScriptProperties();
  const token  = props.getProperty("TELEGRAM_TOKEN");
  const chatId = props.getProperty("TELEGRAM_CHAT_ID");
  if (!token || !chatId) { Logger.log("⚠️ Faltan credenciales Telegram."); return false; }

  try {
    const resp = UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "post", contentType: "application/json",
      payload: JSON.stringify({ chat_id: chatId, text: mensaje, parse_mode: "HTML" }),
      muteHttpExceptions: true,
    });
    const res = JSON.parse(resp.getContentText());
    if (!res.ok) { Logger.log("❌ Telegram: " + JSON.stringify(res)); return false; }
    return res.result.message_id;
  } catch(e) { Logger.log("❌ " + e.message); return false; }
}

// --- Mapeo message_id → celda (para reacciones de Telegram) --

const TTL_MAPEO_REACCION_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

function guardarMapeoReaccion(messageId, fila, col, orig) {
  const props = PropertiesService.getScriptProperties();
  props.setProperty(`react_${messageId}`, JSON.stringify({
    fila, col, orig, ts: Date.now(),
  }));
}

function obtenerMapeoReaccion(messageId) {
  const props = PropertiesService.getScriptProperties();
  const clave = `react_${messageId}`;
  const guardado = props.getProperty(clave);
  if (!guardado) return null;

  let datos;
  try { datos = JSON.parse(guardado); } catch(e) { props.deleteProperty(clave); return null; }

  if (Date.now() - datos.ts > TTL_MAPEO_REACCION_MS) {
    props.deleteProperty(clave);
    return null;
  }
  return datos;
}

// --- Lógica principal ----------------------------------------

function obtenerPalabras(fechaRef, dias) {
  const hoy  = new Date(fechaRef); hoy.setHours(0,0,0,0);
  const ss   = SpreadsheetApp.openById(ID_HOJA);
  const hoja = ss.getSheetByName(NOMBRE_TAB);
  const data = hoja.getDataRange().getValues();

  const palabrasDE = [];
  const palabrasEN = [];

  for (let i = 0; i < data.length; i++) {
    const fila           = data[i];
    const fechaAnotacion = parsearFecha(fila[1]);
    if (!fechaAnotacion) continue;

    const diffDias = Math.round(
      (hoy.getTime() - fechaAnotacion.getTime()) / (1000*60*60*24)
    );
    if (diffDias !== dias) continue;

    const esIngles = (fila[5]||"").toString().trim().toLowerCase() === "en";

    const pares = [
      { orig: fila[2], trad: fila[6],  frase: fila[10], col: 3 },
      { orig: fila[3], trad: fila[7],  frase: fila[11], col: 4 },
      { orig: fila[4], trad: fila[8],  frase: fila[12], col: 5 },
    ];

    for (const par of pares) {
      const orig  = (par.orig  || "").toString().trim();
      const trad  = (par.trad  || "").toString().trim();
      const frase = (par.frase || "").toString().trim();
      if (!orig || orig === "-" || orig === "–") continue;
      if (!trad || trad === "-" || trad === "–") continue;

      const spoiler = tieneFrase(frase) ? frase : trad;
      (esIngles ? palabrasEN : palabrasDE).push({
        orig, spoiler, fecha: fechaAnotacion, fila: i + 1, col: par.col,
      });
    }
  }

  return { palabrasDE, palabrasEN };
}

function enviarRecordatorioHoy() {
  const INTERVALOS = obtenerIntervalos();
  const posicion   = obtenerIndiceDeHoy();
  const dias       = INTERVALOS[posicion];

  if (dias === undefined) {
    Logger.log(`ℹ️ Disparo #${posicion+1} ignorado — solo hay ${INTERVALOS.length} intervalos.`);
    return;
  }

  Logger.log(`Disparo #${posicion+1} → +${dias}d`);

  const { palabrasDE, palabrasEN } = obtenerPalabras(new Date(), dias);
  const todas = [
    ...palabrasDE.map(p => ({ ...p, bandera: "🇩🇪" })),
    ...palabrasEN.map(p => ({ ...p, bandera: "🇬🇧" })),
  ];

  if (todas.length === 0) { Logger.log(`No hay palabras para +${dias}d hoy.`); return; }

  const correoNum  = posicion + 1;
  const totalAct   = INTERVALOS.length;
  const fechaOrig  = todas[0].fecha;
  const etiqueta   = etiquetaDias(dias, fechaOrig);

  // Mensaje 1 — Header
  enviarTelegram(
    `🧠 <b>Repaso ${correoNum}/${totalAct}</b>\n` +
    `📅 ${etiqueta}\n`
  );

  // Mensajes 2, 3, 4 — una palabra por mensaje
  for (const p of todas) {
    const messageId = enviarTelegram(
      `${p.bandera} <b>${p.orig}</b>\n<tg-spoiler>${p.spoiler}</tg-spoiler>`
    );
    if (messageId) guardarMapeoReaccion(messageId, p.fila, p.col, p.orig);
  }

  Logger.log(`Enviados: 1 header + ${todas.length} palabras (+${dias}d)`);
}

// --- Triggers de repaso — uno por cada posición de INTERVALOS -

// Horas de disparo (una por intervalo, en orden). enviarRecordatorioHoy()
// sigue usando su contador secuencial de disparos del día
// (obtenerIndiceDeHoy) para saber qué posición de INTERVALOS le toca —
// estos triggers solo fijan A QUÉ HORA se dispara cada llamada.

function crearTriggersRepaso() {
  const existentes = ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === "enviarRecordatorioHoy");

  if (existentes.length > 0) {
    Logger.log(`Ya existen ${existentes.length} trigger(s) de enviarRecordatorioHoy, no se crean más. Borralos a mano si querés recrearlos.`);
    return;
  }

  HORAS_TRIGGER_REPASO.forEach(hora => {
    ScriptApp.newTrigger("enviarRecordatorioHoy")
      .timeBased()
      .atHour(hora)
      .nearMinute(23)
      .everyDays(1)
      .inTimezone(ZONA_HORARIA)
      .create();
  });

  Logger.log(`Triggers creados: ${HORAS_TRIGGER_REPASO.length} disparos de enviarRecordatorioHoy a las horas ${HORAS_TRIGGER_REPASO.join(", ")}.`);
}

// --- Recordatorio diario para agregar palabras nuevas ---------

function enviarRecordatorioAgregarPalabras() {
  enviarTelegram(
    `📝 <b>¿Palabras nuevas hoy?</b>\n` +
    `Mandalas con:\n<code>/nueva DD/MM, idioma, p1, p2, p3</code>\n` +
    `Ejemplo:\n<code>/nueva 25/06, de, absolvieren, hingehen, ertragen</code>`
  );
}

function crearTriggerRecordatorioPalabras() {
  const yaExiste = ScriptApp.getProjectTriggers()
    .some(t => t.getHandlerFunction() === "enviarRecordatorioAgregarPalabras");

  if (yaExiste) {
    Logger.log("El trigger de recordatorio de palabras ya existe, no se crea otro.");
    return;
  }
  ScriptApp.newTrigger("enviarRecordatorioAgregarPalabras")
    .timeBased()
    .atHour(23)
    .nearMinute(30)
    .everyDays(1)
    .inTimezone(ZONA_HORARIA)
    .create();
  Logger.log("Trigger creado: recordatorio de palabras nuevas a las 23:30.");
}

// --- Pruebas -------------------------------------------------

function probarTelegram() {
  enviarTelegram("✅ Conexión con Wörter des Tages funcionando correctamente.");
}

function probarSimulacion() {
  // ↓↓ EDITÁ ESTOS DOS VALORES ↓↓
  const fechaSimulada = new Date("2026-06-27");
  const posicionSim   = 4;
  // ↑↑ ————————————————————————— ↑↑

  const INTERVALOS = obtenerIntervalos();
  const dias = INTERVALOS[posicionSim];
  if (dias === undefined) { Logger.log("Posición inválida."); return; }

  fechaSimulada.setHours(0,0,0,0);
  Logger.log(`=== SIMULACIÓN: ${fechaSimulada.toDateString()} · +${dias}d ===`);

  const { palabrasDE, palabrasEN } = obtenerPalabras(fechaSimulada, dias);
  const todas = [
    ...palabrasDE.map(p => ({ ...p, bandera: "🇩🇪" })),
    ...palabrasEN.map(p => ({ ...p, bandera: "🇬🇧" })),
  ];

  todas.forEach(p => Logger.log(`  ${p.bandera} ${p.orig} → ${p.spoiler}`));
  Logger.log(`Total: ${todas.length}`);

  if (todas.length === 0) { Logger.log("Sin palabras."); return; }

  const etiqueta = etiquetaDias(dias, todas[0].fecha);

  // Header con tag [SIMULACIÓN]
  enviarTelegram(
    `🧪 <b>[SIMULACIÓN] ${posicionSim+1}/${INTERVALOS.length}</b>\n` +
    `📅 ${etiqueta}\n`
  );

  for (const p of todas) {
    enviarTelegram(
      `${p.bandera} <b>${p.orig}</b>\n<tg-spoiler>${p.spoiler}</tg-spoiler>`
    );
  }
}