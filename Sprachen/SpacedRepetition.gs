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
const INTERVALOS_DEFAULT = [30, 120, 90, 14, 7, 5, 2];

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
    return true;
  } catch(e) { Logger.log("❌ " + e.message); return false; }
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
      { orig: fila[2], trad: fila[6],  frase: fila[10] },
      { orig: fila[3], trad: fila[7],  frase: fila[11] },
      { orig: fila[4], trad: fila[8],  frase: fila[12] },
    ];

    for (const par of pares) {
      const orig  = (par.orig  || "").toString().trim();
      const trad  = (par.trad  || "").toString().trim();
      const frase = (par.frase || "").toString().trim();
      if (!orig || orig === "-" || orig === "–") continue;
      if (!trad || trad === "-" || trad === "–") continue;

      const spoiler = tieneFrase(frase) ? frase : trad;
      (esIngles ? palabrasEN : palabrasDE).push({ orig, spoiler, fecha: fechaAnotacion });
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
    enviarTelegram(
      `${p.bandera} <b>${p.orig}</b>\n<tg-spoiler>${p.spoiler}</tg-spoiler>`
    );
  }

  Logger.log(`Enviados: 1 header + ${todas.length} palabras (+${dias}d)`);
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