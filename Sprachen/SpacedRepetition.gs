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

// Intervalos en días (orden = orden de disparo del día):
//   1er Activador → INTERVALOS[0], 2do → INTERVALOS[1], etc.
const INTERVALOS = [30, 14, 7, 3, 2];

// ============================================================
// NO es necesario tocar nada debajo de esta línea
// ============================================================

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
  const props    = PropertiesService.getScriptProperties();
  const hoy      = Utilities.formatDate(new Date(), ZONA_HORARIA, "yyyy-MM-dd");
  Logger.log(`Disparos hoy (${hoy}): ${props.getProperty(`disparos_${hoy}`) || "0"}`);
}

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

function tieneFrase(celda) {
  const val = (celda || "").toString().trim();
  if (!val || val === "-" || val === "–" || val === "...") return false;
  if (val.endsWith("...")) return false;
  return true;
}

function enviarTelegram(mensaje) {
  const props  = PropertiesService.getScriptProperties();
  const token  = props.getProperty("TELEGRAM_TOKEN");
  const chatId = props.getProperty("TELEGRAM_CHAT_ID");
  if (!token || !chatId) { Logger.log("⚠️ Faltan TELEGRAM_TOKEN o TELEGRAM_CHAT_ID."); return false; }

  try {
    const resp = UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method:             "post",
      contentType:        "application/json",
      payload:            JSON.stringify({ chat_id: chatId, text: mensaje, parse_mode: "HTML" }),
      muteHttpExceptions: true,
    });
    const res = JSON.parse(resp.getContentText());
    if (!res.ok) { Logger.log("❌ Telegram error: " + JSON.stringify(res)); return false; }
    Logger.log("✅ Mensaje enviado.");
    return true;
  } catch (e) {
    Logger.log("❌ Excepción: " + e.message);
    return false;
  }
}

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

    // C/G/K=2/6/10, D/H/L=3/7/11, E/I/M=4/8/12
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
      (esIngles ? palabrasEN : palabrasDE).push({ orig, spoiler });
    }
  }

  return { palabrasDE, palabrasEN };
}

function construirMensaje(palabrasDE, palabrasEN, dias, posicion, esSimulacion, fechaSimulada) {
  const correoNum = posicion + 1;
  const totalAct  = INTERVALOS.length;

  let msg = esSimulacion
    ? `🧪 <b>[SIMULACIÓN] Repaso ${correoNum}/${totalAct} · ${etiquetaDias(dias)}</b>\n`
    + `<i>Fecha simulada: ${fechaSimulada.toLocaleDateString("es-DE")}</i>\n\n`
    : `🧠 <b>Repaso ${correoNum}/${totalAct} · ${etiquetaDias(dias)}</b>\n\n`;

  msg += `Tocá cada palabra para revelarla 👇\n\n`;

  if (palabrasDE.length > 0) {
    msg += `🇩🇪 <b>Deutsch</b>\n<code>─────────────────────</code>\n`;
    for (const p of palabrasDE) {
      // Palabra visible + spoiler en línea separada = reveal independiente por tap
      msg += `• <b>${p.orig}</b>\n<tg-spoiler>${p.spoiler}</tg-spoiler>\n\n`;
    }
  }

  if (palabrasEN.length > 0) {
    msg += `🇬🇧 <b>English</b>\n<code>─────────────────────</code>\n`;
    for (const p of palabrasEN) {
      msg += `• <b>${p.orig}</b>\n<tg-spoiler>${p.spoiler}</tg-spoiler>\n\n`;
    }
  }

  msg += `<i>Intervalos: ${INTERVALOS.map(d => `+${d}d`).join(" · ")}</i>`;
  return msg;
}

function enviarRecordatorioHoy() {
  const posicion = obtenerIndiceDeHoy();
  const dias     = INTERVALOS[posicion];

  if (dias === undefined) {
    Logger.log(`ℹ️ Disparo #${posicion + 1} ignorado — solo hay ${INTERVALOS.length} intervalos.`);
    return;
  }

  Logger.log(`Disparo #${posicion + 1} → +${dias}d`);

  const { palabrasDE, palabrasEN } = obtenerPalabras(new Date(), dias);
  const total = palabrasDE.length + palabrasEN.length;

  if (total === 0) { Logger.log(`No hay palabras para +${dias}d hoy.`); return; }

  enviarTelegram(construirMensaje(palabrasDE, palabrasEN, dias, posicion, false, null));
  Logger.log(`Enviadas: ${total} palabras (+${dias}d)`);
}

function probarTelegram() {
  enviarTelegram("✅ Conexión con Wörter des Tages funcionando correctamente.");
}

function probarSimulacion() {
  // ↓↓ EDITÁ ESTOS DOS VALORES ↓↓
  const fechaSimulada = new Date("2026-06-24");
  const posicionSim   = 0;
  // ↑↑ ————————————————————————— ↑↑

  const dias = INTERVALOS[posicionSim];
  if (dias === undefined) { Logger.log("Posición inválida."); return; }

  fechaSimulada.setHours(0, 0, 0, 0);
  Logger.log(`=== SIMULACIÓN: ${fechaSimulada.toDateString()} · +${dias}d ===`);

  const { palabrasDE, palabrasEN } = obtenerPalabras(fechaSimulada, dias);
  const total = palabrasDE.length + palabrasEN.length;

  [...palabrasDE.map(p => `🇩🇪 ${p.orig} → ${p.spoiler}`),
   ...palabrasEN.map(p => `🇬🇧 ${p.orig} → ${p.spoiler}`)
  ].forEach(l => Logger.log(`  ${l}`));
  Logger.log(`Total: ${total}`);

  if (total === 0) { Logger.log("Sin palabras para esta simulación."); return; }
  enviarTelegram(construirMensaje(palabrasDE, palabrasEN, dias, posicionSim, true, fechaSimulada));
}