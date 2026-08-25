// ============================================================
// WOERTER DES TAGES — Telegram Webhook (histórico) + comandos
// ============================================================
// Comandos Telegram:
//   /nueva DD/MM, idioma, p1, p2, p3   (1 a 3 palabras, sin año)
//   /ver DD/MM/YYYY
//   /hoy
//   /intervalos 30 14 7 3 2
//   /intervalos reset
//   (texto libre, sin "/")  -> se guarda como palabra suelta en col. R
// ============================================================

const ID_HOJA_F    = "1yYJzqZmJOvM6lMMXLdf_ZWMEaa0_vvDWDeu87T2sm38";
const NOMBRE_TAB_F = "WoerterDesTages";
const ZONA_HOR_F   = "Europe/Berlin";

// ============================================================
// doPost — Webhook Telegram
// ============================================================

// NOTA (migración a polling): doPost queda sin usar una vez corrido
// eliminarWebhook() — se deja como referencia histórica / por si algún
// día se quiere reactivar el webhook. El mecanismo vigente es
// pollTelegram() (ver Polling.gs), que llama a procesarUpdateTelegram
// por cada update nuevo.
function doPost(e) {
  try {
    const update = JSON.parse(e.postData.contents);
    procesarUpdateTelegram(update);
  } catch(err) {
    Logger.log("doPost error: " + err.message);
  }
  return okResponse();
}

// ============================================================
// Ruteo de comandos — usado tanto por doPost (histórico) como por
// pollTelegram (mecanismo vigente, ver Polling.gs)
// ============================================================

function procesarUpdateTelegram(update) {
  const updateId = String(update.update_id);

  // Deduplicación por update_id
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty("last_update_id") === updateId) return;
  props.setProperty("last_update_id", updateId);

  const msg = update.message || update.edited_message;
  if (!msg || !msg.text) return;

  const chatId = msg.chat.id.toString();
  const texto  = msg.text.trim();

  if (texto.startsWith("/nueva"))            manejarNueva(chatId, texto);
  else if (texto.startsWith("/ver"))         manejarVer(chatId, texto);
  else if (texto.startsWith("/hoy"))         manejarHoy(chatId);
  else if (texto.startsWith("/intervalos"))  manejarIntervalos(chatId, texto);
  else if (texto.startsWith("/modo"))        manejarModo(chatId, texto);
  else if (texto.startsWith("/")) {
    responderTelegram(chatId,
      "🤖 Comandos disponibles:\n\n" +
      "/nueva <code>DD/MM, idioma, p1, p2, p3</code>  — 1 a 3 palabras\n" +
      "/ver <code>DD/MM/YYYY</code>\n" +
      "/hoy\n" +
      "/intervalos <code>30 14 7 3</code>  — cambia intervalos\n" +
      "/intervalos <code>reset</code>  — vuelve al default\n" +
      "/modo <code>input</code> | <code>output</code>  — a qué hoja va el texto libre\n\n" +
      "También podés escribirme una palabra suelta (sin \"/\") y la guardo directo en la hoja del modo activo."
    );
  }
  else {
    // Texto libre -> se escribe directo en VHS_INPUT o VHS_OUTPUT
    // (columna B, próxima fila vacía) según el modo activo.
    const res = guardarPalabraSuelta(texto);
    responderTelegram(chatId, res.ok
      ? `📥 <b>${texto}</b> en B${res.fila}.`
      : `❌ ${res.mensaje}`
    );
  }
}

function okResponse() {
  return ContentService.createTextOutput("OK");
}

// ============================================================
// Comando /intervalos
// ============================================================

function manejarIntervalos(chatId, texto) {
  const args = texto.replace(/^\/intervalos\s*/i, "").trim();

  if (!args) {
    const actuales = obtenerIntervalos();
    responderTelegram(chatId,
      `📊 <b>Intervalos actuales:</b> ${actuales.map(d => `+${d}d`).join(" · ")}\n\n` +
      `Para cambiar: <code>/intervalos 30 14 7 3</code>\n` +
      `Para resetear: <code>/intervalos reset</code>`
    );
    return;
  }

  if (args.toLowerCase() === "reset") {
    PropertiesService.getScriptProperties().deleteProperty("INTERVALOS");
    responderTelegram(chatId,
      `↩️ Intervalos reseteados al default.\n` +
      `Actuales: ${obtenerIntervalos().map(d => `+${d}d`).join(" · ")}`
    );
    return;
  }

  // Parsear números separados por espacios o comas
  const nuevos = args.split(/[\s,]+/)
    .map(s => parseInt(s.trim()))
    .filter(n => !isNaN(n) && n > 0);

  if (nuevos.length === 0 || nuevos.length > 7) {
    responderTelegram(chatId, "⚠️ Enviá entre 1 y 7 números. Ej: <code>/intervalos 30 14 7</code>");
    return;
  }

  // Guardar en PropertiesService (compartido con SpacedRepetition.gs)
  PropertiesService.getScriptProperties().setProperty("INTERVALOS", JSON.stringify(nuevos));

  responderTelegram(chatId,
    `✅ <b>Intervalos actualizados:</b>\n` +
    nuevos.map((d, i) => `  ${i+1}. Activador del día → +${d}d`).join("\n") + "\n\n" +
    `<i>El cambio aplica desde el próximo disparo automático.</i>`
  );
}

// ============================================================
// Comando /modo — a qué hoja va el texto libre (VHS_INPUT/VHS_OUTPUT)
// ============================================================

const PROP_MODO_PALABRA = "MODO_PALABRA";
const HOJA_VHS_INPUT    = "VHS_INPUT";
const HOJA_VHS_OUTPUT   = "VHS_OUTPUT";
const COL_B_PALABRA     = 2;

function obtenerModoPalabra() {
  const props = PropertiesService.getScriptProperties();
  return props.getProperty(PROP_MODO_PALABRA) || "input";
}

function manejarModo(chatId, texto) {
  const arg = texto.replace(/^\/modo\s*/i, "").trim().toLowerCase();

  if (!arg) {
    responderTelegram(chatId,
      `🔧 Modo actual: <b>${obtenerModoPalabra().toUpperCase()}</b>\n\n` +
      `Para cambiar: <code>/modo input</code> o <code>/modo output</code>`
    );
    return;
  }

  if (!["input", "output"].includes(arg)) {
    responderTelegram(chatId, "⚠️ Modo inválido. Usá <code>/modo input</code> o <code>/modo output</code>");
    return;
  }

  PropertiesService.getScriptProperties().setProperty(PROP_MODO_PALABRA, arg);
  responderTelegram(chatId, `✅ Modo cambiado a <b>${arg.toUpperCase()}</b>. El texto libre ahora se guarda en <b>${arg === "input" ? HOJA_VHS_INPUT : HOJA_VHS_OUTPUT}</b>.`);
}

// ------------------------------------------------------------
// Guarda una palabra suelta en columna B de VHS_INPUT/VHS_OUTPUT.
// La hoja tiene huecos reales en columna B (no es continua), así que
// buscar la primera B vacía desde arriba encuentra huecos viejos en
// medio de los datos (ej. B15) en vez del final real de la data.
// En cambio: la fila de destino es la siguiente a la última fila
// que tenga contenido en B, E, I o L (columnas con datos reales
// esparcidos — ver categorías "Alle die Worter"/"Wichtigste"/
// "Erinner Mall"/"verinerliche!").
//
// Optimización: en vez de escanear desde la fila 1 cada vez, se
// cachea en PropertiesService la última fila usada por hoja
// (PUNTERO_FILA_<nombre>) y se arranca la búsqueda desde ahí. Solo
// se recorre hacia adelante desde el puntero, no toda la hoja.
// ------------------------------------------------------------
const COLS_DATO_PALABRA = [2, 5, 9, 12]; // B, E, I, L

function guardarPalabraSuelta(texto) {
  try {
    const modo   = obtenerModoPalabra();
    const nombre = modo === "output" ? HOJA_VHS_OUTPUT : HOJA_VHS_INPUT;

    const ss   = SpreadsheetApp.openById(ID_HOJA_F);
    const hoja = ss.getSheetByName(nombre);
    if (!hoja) throw new Error(`No existe la hoja ${nombre}.`);

    const props      = PropertiesService.getScriptProperties();
    const propPuntero = `PUNTERO_FILA_${nombre}`;
    const maxRows     = hoja.getMaxRows();
    const desde        = parseInt(props.getProperty(propPuntero) || "1");

    const filasARevisar = maxRows - desde + 1;
    let ultimaFilaConDato = desde > 1 ? desde - 1 : 1; // fila 1 = header

    if (filasARevisar > 0) {
      for (const col of COLS_DATO_PALABRA) {
        const valores = hoja.getRange(desde, col, filasARevisar, 1).getValues();
        for (let i = valores.length - 1; i >= 0; i--) {
          if (valores[i][0].toString().trim()) {
            const filaAbs = desde + i;
            if (filaAbs > ultimaFilaConDato) ultimaFilaConDato = filaAbs;
            break;
          }
        }
      }
    }

    const fila = ultimaFilaConDato + 1;
    hoja.getRange(fila, COL_B_PALABRA).setValue(texto);
    props.setProperty(propPuntero, String(fila));
    return { ok: true, hoja: nombre, fila };
  } catch(err) {
    return { ok: false, mensaje: err.message };
  }
}

// ============================================================
// Comando /nueva
// ============================================================

function manejarNueva(chatId, texto) {
  const sinComando = texto.replace(/^\/nueva\s*/i, "").trim();
  const partes     = sinComando.split(",").map(s => s.trim()).filter(s => s.length > 0);

  if (partes.length < 3) {
    responderTelegram(chatId,
      "⚠️ Formato:\n<code>/nueva DD/MM, idioma, p1, p2, p3</code>\n" +
      "(entre 1 y 3 palabras)\n\n" +
      "Ejemplo:\n<code>/nueva 25/06, de, absolvieren, hingehen, ertragen</code>"
    );
    return;
  }

  const fechaCorta = partes[0];
  const idioma     = partes[1].toLowerCase();
  const palabras   = partes.slice(2, 5);

  if (!fechaCorta.match(/^\d{2}\/\d{2}$/)) {
    responderTelegram(chatId, "⚠️ Fecha inválida. Formato: <code>DD/MM</code> (sin año, se usa el año actual)"); return;
  }
  if (!["de","en"].includes(idioma)) {
    responderTelegram(chatId, "⚠️ Idioma: <code>de</code> o <code>en</code>"); return;
  }
  if (palabras.length === 0 || palabras.some(p => !p)) {
    responderTelegram(chatId, "⚠️ Enviá entre 1 y 3 palabras."); return;
  }

  const anioActual = Utilities.formatDate(new Date(), ZONA_HOR_F, "yyyy");
  const fecha       = `${fechaCorta}/${anioActual}`;
  const datos       = { fecha, idioma, palabras };

  const res      = guardarPalabras(datos);
  const bandera  = idioma === "en" ? "🇬🇧" : "🇩🇪";

  responderTelegram(chatId, res.ok
    ? `${res.nueva ? "✅ Fila nueva" : "✏️ Actualizada"} · ${fecha}\n\n` +
      `${bandera} ` + palabras.map(p => `<b>${p}</b>`).join("  ·  ")
    : `❌ ${res.mensaje}`
  );
}

// ============================================================
// Comando /ver
// ============================================================

function manejarVer(chatId, texto) {
  const fecha = texto.replace(/^\/ver\s*/i, "").trim();
  if (!fecha.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
    responderTelegram(chatId, "⚠️ Formato: <code>/ver DD/MM/YYYY</code>"); return;
  }

  const fila = buscarFilaPorFecha(fecha);
  if (!fila) { responderTelegram(chatId, `📭 Sin palabras para el <b>${fecha}</b>.`); return; }

  const idioma  = (fila[5]||"").toString().trim().toLowerCase();
  const bandera = idioma === "en" ? "🇬🇧" : "🇩🇪";
  const campos  = [
    { p: (fila[2]||"—").toString().trim(), t: (fila[6]||"—").toString().trim() },
    { p: (fila[3]||"—").toString().trim(), t: (fila[7]||"—").toString().trim() },
    { p: (fila[4]||"—").toString().trim(), t: (fila[8]||"—").toString().trim() },
  ];

  responderTelegram(chatId,
    `📅 <b>${fecha}</b> ${bandera}\n\n` +
    campos.map(c => `• <b>${c.p}</b>  →  <tg-spoiler>${c.t}</tg-spoiler>`).join("\n")
  );
}

function manejarHoy(chatId) {
  manejarVer(chatId, "/ver " + Utilities.formatDate(new Date(), ZONA_HOR_F, "dd/MM/yyyy"));
}

// ============================================================
// Helpers Sheet
// ============================================================

function parsearFechaF(celda) {
  if (!celda) return null;
  if (celda instanceof Date) {
    if (isNaN(celda.getTime())) return null;
    const d = new Date(celda); d.setHours(0,0,0,0); return d;
  }
  const p = celda.toString().trim().split("/");
  if (p.length !== 3) return null;
  const d = new Date(parseInt(p[2]), parseInt(p[1])-1, parseInt(p[0]));
  d.setHours(0,0,0,0); return d;
}

function buscarFilaPorFecha(fechaStr) {
  const p = fechaStr.split("/");
  const target = new Date(parseInt(p[2]), parseInt(p[1])-1, parseInt(p[0]));
  target.setHours(0,0,0,0);

  const ss   = SpreadsheetApp.openById(ID_HOJA_F);
  const hoja = ss.getSheetByName(NOMBRE_TAB_F);
  const data = hoja.getDataRange().getValues();

  for (let i = 0; i < data.length; i++) {
    const f = parsearFechaF(data[i][1]);
    if (f && f.getTime() === target.getTime()) return data[i];
  }
  return null;
}

function guardarPalabras(datos) {
  try {
    const p = datos.fecha.trim().split("/");
    if (p.length !== 3) throw new Error("Fecha inválida.");

    const target = new Date(parseInt(p[2]), parseInt(p[1])-1, parseInt(p[0]));
    target.setHours(0,0,0,0);

    const ss   = SpreadsheetApp.openById(ID_HOJA_F);
    const hoja = ss.getSheetByName(NOMBRE_TAB_F);
    const data = hoja.getDataRange().getValues();

    let fila = -1;
    for (let i = 0; i < data.length; i++) {
      const f = parsearFechaF(data[i][1]);
      if (f && f.getTime() === target.getTime()) { fila = i+1; break; }
    }

    const words = datos.palabras.map(w => w.trim());

    if (fila === -1) {
      const nueva = hoja.getLastRow() + 1;
      hoja.getRange(nueva, 2).setValue(datos.fecha.trim());
      words.forEach((w, i) => hoja.getRange(nueva, 3 + i).setValue(w));
      hoja.getRange(nueva, 6).setValue(datos.idioma);
      return { ok: true, mensaje: "Fila nueva.", nueva: true };
    } else {
      words.forEach((w, i) => hoja.getRange(fila, 3 + i).setValue(w));
      hoja.getRange(fila, 6).setValue(datos.idioma);
      return { ok: true, mensaje: "Fila actualizada.", nueva: false };
    }
  } catch(err) {
    return { ok: false, mensaje: err.message };
  }
}

// ============================================================
// Telegram API
// ============================================================

function responderTelegram(chatId, texto) {
  const token = PropertiesService.getScriptProperties().getProperty("TELEGRAM_TOKEN");
  if (!token) return;
  UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "post", contentType: "application/json",
    payload: JSON.stringify({ chat_id: chatId, text: texto, parse_mode: "HTML" }),
    muteHttpExceptions: true,
  });
}

// ============================================================
// Registrar / eliminar webhook
// ============================================================

function registrarWebhook() {
  const token     = PropertiesService.getScriptProperties().getProperty("TELEGRAM_TOKEN");
  const webAppUrl = "https://script.google.com/macros/s/AKfycbwwMFNs4yJy5K1Rai-SpaJrZ5e_A5shmgzyJDSrGrxFrlSEArPDPtH8F7fdnqDtwIVF/exec";
  const resp = UrlFetchApp.fetch(
    `https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webAppUrl)}`,
    { muteHttpExceptions: true }
  );
  Logger.log(resp.getContentText());
}

function eliminarWebhook() {
  const token = PropertiesService.getScriptProperties().getProperty("TELEGRAM_TOKEN");
  const resp  = UrlFetchApp.fetch(
    `https://api.telegram.org/bot${token}/deleteWebhook?drop_pending_updates=true`,
    { muteHttpExceptions: true }
  );
  Logger.log(resp.getContentText());
}

//Debug y ver si tiene queue

function verWebhookInfo() {
  const token = PropertiesService.getScriptProperties().getProperty("TELEGRAM_TOKEN");
  const resp = UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
  Logger.log(resp.getContentText());
}