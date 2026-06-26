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
//   posición 0 → 9am, posición 1 → 12pm, posición 2 → 15pm,
//   posición 3 → 18pm, posición 4 → 21pm  (máximo 5)
const INTERVALOS = [1, 5, 7, 30];

// ============================================================
// NO es necesario tocar nada debajo de esta línea
// ============================================================

const HORAS_DISPONIBLES = [9, 12, 15, 18, 21];

function obtenerIntervaloDeHoraActual() {
  const horaActual = parseInt(Utilities.formatDate(new Date(), ZONA_HORARIA, "H"));
  for (let i = 0; i < HORAS_DISPONIBLES.length; i++) {
    if (Math.abs(horaActual - HORAS_DISPONIBLES[i]) <= 1) {
      return { dias: INTERVALOS[i] || null, posicion: i };
    }
  }
  return { dias: null, posicion: -1 };
}

function etiquetaDias(dias) {
  const esUltimo = dias === INTERVALOS[INTERVALOS.length - 1];
  const sufijo   = esUltimo ? " — último repaso ✅" : "";
  if (dias === 1)  return `Anotadas ayer (+1d)${sufijo}`;
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

function enviarTelegram(mensaje) {
  const props   = PropertiesService.getScriptProperties();
  const token   = props.getProperty("TELEGRAM_TOKEN");
  const chatId  = props.getProperty("TELEGRAM_CHAT_ID");

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

  const opciones = {
    method:      "post",
    contentType: "application/json",
    payload:     body,
    muteHttpExceptions: true,
  };

  try {
    const resp     = UrlFetchApp.fetch(url, opciones);
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

function enviarRecordatorioHoy() {
  const { dias, posicion } = obtenerIntervaloDeHoraActual();

  if (dias === null) {
    Logger.log("No hay intervalo para esta hora — nada que enviar.");
    return;
  }

  Logger.log(`Hora actual (Berlin) → intervalo: +${dias} días`);

  const hoy = new Date();
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

    const idiomaFlag = (fila[5] || "").toString().trim().toLowerCase();
    const esIngles   = idiomaFlag === "en";

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

  const total = palabrasDE.length + palabrasEN.length;

  if (total === 0) {
    Logger.log(`No hay palabras para +${dias}d hoy.`);
    return;
  }

  // Construir mensaje Telegram
  // PRIMERO: solo las palabras (sin traducción) → el usuario intenta recordar
  // LUEGO: spoiler con la traducción (Telegram oculta el texto en spoiler)
  const correoNum = posicion + 1;
  const totalHoy  = INTERVALOS.length;

  let msg = `🧠 <b>Repaso ${correoNum}/${totalHoy} · ${etiquetaDias(dias)}</b>\n\n`;
  msg += `Intentá recordar cada traducción antes de tocar el texto 👇\n`;
  msg += `<i>(las traducciones están ocultas — tocá para revelar)</i>\n\n`;

  if (palabrasDE.length > 0) {
    msg += `🇩🇪 <b>Deutsch</b>\n`;
    msg += `<code>─────────────────────</code>\n`;
    for (const p of palabrasDE) {
      msg += `• <b>${p.orig}</b>  →  <tg-spoiler>${p.trad}</tg-spoiler>\n`;
    }
    msg += `\n`;
  }

  if (palabrasEN.length > 0) {
    msg += `🇬🇧 <b>English</b>\n`;
    msg += `<code>─────────────────────</code>\n`;
    for (const p of palabrasEN) {
      msg += `• <b>${p.orig}</b>  →  <tg-spoiler>${p.trad}</tg-spoiler>\n`;
    }
    msg += `\n`;
  }

  msg += `<i>Intervalos activos: ${INTERVALOS.map(d => `+${d}d`).join(" · ")}</i>`;

  enviarTelegram(msg);

  // También mandar email como respaldo (podés comentar estas líneas si no querés email)
  // const htmlBody = construirEmail(...);
  // MailApp.sendEmail({ to: EMAIL_DESTINO, subject: asunto, htmlBody: htmlBody });

  Logger.log(`Notificación enviada: ${total} palabras (+${dias}d)`);
}

// ============================================================
// FUNCIÓN DE PRUEBA — ejecutar manualmente para verificar
// ============================================================
function probarTelegram() {
  // Prueba de conexión pura — verifica token y chat_id
  enviarTelegram("✅ Conexión con Wörter des Tages funcionando correctamente.");
}

function probarSimulacion() {
  const fechaSimulada = new Date("2026-06-23"); // ← fecha a simular
  const horaSimulada  = 9;                       // ← hora: 9, 12, 15, 18 o 21

  const posicion = HORAS_DISPONIBLES.findIndex(h => h === horaSimulada);
  const dias     = INTERVALOS[posicion];

  if (!dias) {
    Logger.log(`No hay intervalo para las ${horaSimulada}hs.`);
    return;
  }

  fechaSimulada.setHours(0, 0, 0, 0);
  Logger.log(`=== SIMULACIÓN: ${fechaSimulada.toDateString()} · +${dias}d ===`);

  const ss   = SpreadsheetApp.openById(ID_HOJA);
  const hoja = ss.getSheetByName(NOMBRE_TAB);
  const data = hoja.getDataRange().getValues();

  let total = 0;

  for (let i = 0; i < data.length; i++) {
    const fila           = data[i];
    const fechaAnotacion = parsearFecha(fila[1]);
    if (!fechaAnotacion) continue;

    const diffDias = Math.round(
      (fechaSimulada.getTime() - fechaAnotacion.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (diffDias !== dias) continue;

    const idiomaFlag = (fila[5] || "").toString().trim().toLowerCase();
    const idioma     = idiomaFlag === "en" ? "🇬🇧" : "🇩🇪";

    const pares = [
      { orig: fila[2], trad: fila[6] },
      { orig: fila[3], trad: fila[7] },
      { orig: fila[4], trad: fila[8] },
    ];

    for (const par of pares) {
      const orig = (par.orig || "").toString().trim();
      const trad = (par.trad || "").toString().trim();
      if (!orig || orig === "-" || !trad || trad === "-") continue;
      Logger.log(`  ${idioma} ${orig} → ${trad}`);
      total++;
    }
  }

  Logger.log(`Total: ${total} palabras.`);
}