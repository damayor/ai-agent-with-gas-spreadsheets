// ============================================================
// WOERTER DES TAGES — Spaced Repetition · Telegram Edition
// ============================================================
//
// ÚNICA CONFIGURACIÓN — solo tocás esta sección
// ============================================================
const EMAIL_DESTINO = "dr.mayorga20@gmail.com";
const ID_HOJA       = "1yYJzqZmJOvM6lMMXLdf_ZWMEaa0_vvDWDeu87T2sm38";
const NOMBRE_TAB    = "Woerte des Tages";
const ZONA_HORARIA  = "Europe/Berlin";

// Define los intervalos en días. El orden importa:
//   1er Activador del día → INTERVALOS[0]
//   2do Activador del día → INTERVALOS[1]  etc.
// Máximo 5. Poné los Activadores en GAS a la hora que quieras.
const INTERVALOS = [30, 14, 7, 3, 1];

// ============================================================
// NO es necesario tocar nada debajo de esta línea
// ============================================================

// --- Contador diario de disparos ----------------------------

function obtenerIndiceDeHoy() {
  const props    = PropertiesService.getScriptProperties();
  const hoy      = Utilities.formatDate(new Date(), ZONA_HORARIA, "yyyy-MM-dd");
  const clave    = `disparos_${hoy}`;
  const disparos = parseInt(props.getProperty(clave) || "0");
  props.setProperty(clave, String(disparos + 1));

  // Limpiar ayer para no acumular basura
  const ayer = Utilities.formatDate(
    new Date(Date.now() - 86400000), ZONA_HORARIA, "yyyy-MM-dd"
  );
  props.deleteProperty(`disparos_${ayer}`);

  return disparos; // 0 = primer disparo, 1 = segundo, etc.
}

function resetearContadorHoy() {
  const props = PropertiesService.getScriptProperties();
  const hoy   = Utilities.formatDate(new Date(), ZONA_HORARIA, "yyyy-MM-dd");
  props.deleteProperty(`disparos_${hoy}`);
  Logger.log("✅ Contador de hoy reseteado.");
}

function verContadorHoy() {
  const props    = PropertiesService.getScriptProperties();
  const hoy      = Utilities.formatDate(new Date(), ZONA_HORARIA, "yyyy-MM-dd");
  const disparos = props.getProperty(`disparos_${hoy}`) || "0";
  Logger.log(`Disparos hoy (${hoy}): ${disparos}`);
}

// --- Utilidades ---------------------------------------------

function etiquetaDias(dias) {
  const esUltimo = dias === INTERVALOS[INTERVALOS.length - 1];
  const sufijo   = esUltimo ? " — último repaso ✅" : "";
  if (dias === 1)  return `Ayer (+1d)${sufijo}`;
  if (dias === 7)  return `Hace una semana (+7d)${sufijo}`;
  if (dias === 14) return `Hace dos semanas (+14d)${sufijo}`;
  if (dias === 30) return `Hace un mes (+30d)${sufijo}`;
  return `Hace ${dias} días (+${dias}d)${sufijo}`;
}

function parsearFecha(celda) {
  if (!celda) return null;
  if (celda instanceof Date) {
    if (isNaN(celda.getTime())) return null;
    const d = new Date(celda);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  const str   = celda.toString().trim();
  const match = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) {
    const d = new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]));
    d.setHours(0, 0, 0, 0);
    return d;
  }
  return null;
}

// --- Telegram -----------------------------------------------

function enviarTelegram(mensaje) {
  const props  = PropertiesService.getScriptProperties();
  const token  = props.getProperty("TELEGRAM_TOKEN");
  const chatId = props.getProperty("TELEGRAM_CHAT_ID");

  if (!token || !chatId) {
    Logger.log("⚠️ Faltan TELEGRAM_TOKEN o TELEGRAM_CHAT_ID en Propiedades del script.");
    return false;
  }

  const url  = `https://api.telegram.org/bot${token}/sendMessage`;
  const body = JSON.stringify({
    chat_id:    chatId,
    text:       mensaje,
    parse_mode: "HTML",
  });

  try {
    const resp      = UrlFetchApp.fetch(url, {
      method:             "post",
      contentType:        "application/json",
      payload:            body,
      muteHttpExceptions: true,
    });
    const resultado = JSON.parse(resp.getContentText());
    if (!resultado.ok) {
      Logger.log("❌ Telegram error: " + JSON.stringify(resultado));
      return false;
    }
    Logger.log("✅ Mensaje Telegram enviado.");
    return true;
  } catch (e) {
    Logger.log("❌ Excepción al llamar Telegram: " + e.message);
    return false;
  }
}

// --- Lógica principal ---------------------------------------

function obtenerPalabras(fechaRef, dias) {
  const hoy  = new Date(fechaRef);
  hoy.setHours(0, 0, 0, 0);

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
      (hoy.getTime() - fechaAnotacion.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (diffDias !== dias) continue;

    const esIngles = (fila[5] || "").toString().trim().toLowerCase() === "en";

    const pares = [
      { orig: fila[2], trad: fila[6] },
      { orig: fila[3], trad: fila[7] },
      { orig: fila[4], trad: fila[8] },
    ];

    for (const par of pares) {
      const orig = (par.orig || "").toString().trim();
      const trad = (par.trad || "").toString().trim();
      if (!orig || orig === "-" || orig === "–") continue;
      if (!trad || trad === "-" || trad === "–") continue;
      (esIngles ? palabrasEN : palabrasDE).push({ orig, trad });
    }
  }

  return { palabrasDE, palabrasEN };
}

function construirMensaje(palabrasDE, palabrasEN, dias, posicion, esSimulacion, fechaSimulada) {
  const total    = palabrasDE.length + palabrasEN.length;
  const correoNum = posicion + 1;
  const totalAct  = INTERVALOS.length;

  let msg = esSimulacion
    ? `🧪 <b>[SIMULACIÓN] Repaso ${correoNum}/${totalAct} · ${etiquetaDias(dias)}</b>\n`
    + `<i>Fecha simulada: ${fechaSimulada.toLocaleDateString("es-DE")}</i>\n\n`
    : `🧠 <b>Repaso ${correoNum}/${totalAct} · ${etiquetaDias(dias)}</b>\n\n`;

  msg += `Intentá recordar antes de tocar 👇\n`;
  msg += `<i>(traducciones ocultas — tocá para revelar)</i>\n\n`;

  if (palabrasDE.length > 0) {
    msg += `🇩🇪 <b>Deutsch</b>\n<code>─────────────────────</code>\n`;
    for (const p of palabrasDE) {
      msg += `• <b>${p.orig}</b>  →  <tg-spoiler>${p.trad}</tg-spoiler>\n`;
    }
    msg += `\n`;
  }

  if (palabrasEN.length > 0) {
    msg += `🇬🇧 <b>English</b>\n<code>─────────────────────</code>\n`;
    for (const p of palabrasEN) {
      msg += `• <b>${p.orig}</b>  →  <tg-spoiler>${p.trad}</tg-spoiler>\n`;
    }
    msg += `\n`;
  }

  msg += `<i>Intervalos activos: ${INTERVALOS.map(d => `+${d}d`).join(" · ")}</i>`;
  return { msg, total };
}

// --- Función principal (llamada por los Activadores) --------

function enviarRecordatorioHoy() {
  const posicion = obtenerIndiceDeHoy();
  const dias     = INTERVALOS[posicion];

  if (dias === undefined) {
    Logger.log(`ℹ️ Disparo #${posicion + 1} ignorado — solo hay ${INTERVALOS.length} intervalos definidos.`);
    return;
  }

  Logger.log(`Disparo #${posicion + 1} → intervalo +${dias}d`);

  const { palabrasDE, palabrasEN } = obtenerPalabras(new Date(), dias);
  const total = palabrasDE.length + palabrasEN.length;

  if (total === 0) {
    Logger.log(`No hay palabras para +${dias}d hoy.`);
    return;
  }

  const { msg } = construirMensaje(palabrasDE, palabrasEN, dias, posicion, false, null);
  enviarTelegram(msg);
  Logger.log(`Notificación enviada: ${total} palabras (+${dias}d)`);
}

// --- Funciones de prueba ------------------------------------

function probarTelegram() {
  // Prueba de conexión pura — no toca el contador
  enviarTelegram("✅ Conexión con Wörter des Tages funcionando correctamente.");
}

function probarSimulacion() {
  // ↓↓ EDITÁ ESTOS DOS VALORES PARA PROBAR ↓↓
  const fechaSimulada = new Date("2026-06-23"); // fecha a simular (YYYY-MM-DD)
  const posicionSim   = 0;                      // 0=1er disparo, 1=2do, 2=3ro...
  // ↑↑ ————————————————————————————————————— ↑↑

  const dias = INTERVALOS[posicionSim];
  if (dias === undefined) {
    Logger.log(`No hay intervalo en posición ${posicionSim}.`);
    return;
  }

  fechaSimulada.setHours(0, 0, 0, 0);
  Logger.log(`=== SIMULACIÓN: ${fechaSimulada.toDateString()} · posición ${posicionSim} → +${dias}d ===`);

  const { palabrasDE, palabrasEN } = obtenerPalabras(fechaSimulada, dias);
  const total = palabrasDE.length + palabrasEN.length;

  // Log en consola
  [...palabrasDE.map(p => `🇩🇪 ${p.orig} → ${p.trad}`),
   ...palabrasEN.map(p => `🇬🇧 ${p.orig} → ${p.trad}`)
  ].forEach(l => Logger.log(`  ${l}`));
  Logger.log(`Total: ${total} palabras.`);

  if (total === 0) {
    Logger.log("No hay palabras para esta simulación.");
    return;
  }

  // Enviar por Telegram (no toca el contador de disparos reales)
  const { msg } = construirMensaje(palabrasDE, palabrasEN, dias, posicionSim, true, fechaSimulada);
  enviarTelegram(msg);
}