
function doGet(e) {
  console.log("trying to GET" + SPREADSHEET_ID)  
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheets()[0];

  sheet.getRange("C89").setValue("Hello World GET");

  return ContentService
    .createTextOutput("ok")
    .setMimeType(ContentService.MimeType.TEXT);
}

//M to S in Columnas 3 to 9
// Rango de escritura vía Telegram: C2:I49 — mismo rango de producción
// que usa Codigo.gs (formato condicional por color, HORAS_LABORALES).
// Fila 2 = bloque 0:00-0:29, +1 fila por cada bloque de 30 min, hasta
// fila 49 = bloque 23:30-23:59.
const TELEGRAM_FILA_BASE = 2;

// Margen único (minutos) alrededor del cambio de bloque de 30 min. Si un
// mensaje llega a menos de N min de terminar el bloque o a menos de N min
// de haber empezado el nuevo, es ambiguo y el bot pregunta (botones) si se
// graba en el bloque que acaba o en el que se acaba de abrir.
const MARGEN_BLOQUE_MIN = 2;

function calcularFila(date){

  const h = date.getHours();
  const m = date.getMinutes();

  return TELEGRAM_FILA_BASE + (h * 2) + (m >= 30 ? 1 : 0);
}

function calcularColumna(date){

  const day = date.getDay(); // 0 domingo
  return day === 0 ? 9 : day + 2;
}

function testCelda(tag) {

  const sheet = SpreadsheetApp
    .openById(SPREADSHEET_ID)
    .getSheets()[0];

  const now = new Date();

  const fila = calcularFila(now);
  const col = calcularColumna(now);
  console.log("row and column to update ", fila,";",  col)

  const cell = sheet.getRange(fila, col);

  cell.setValue(tag);
  cell.setFontWeight("bold");
  cell.setFontStyle("italic");
  cell.setFontLine("none"); // quita el tachado del planning para que sí sume en HORAS_LABORALES

}

// "/2" es SIEMPRE input explícito del usuario (Ticket #12): decide CUÁNTO
// cuenta el bloque (0.5h o 0.25h), nunca se infiere del minuto.
// El bloque destino es el que contiene "momento" (hora del mensaje), más
// "ajusteBloque" (-1 = el anterior, +1 = el siguiente). La ambigüedad cerca
// del cambio de bloque (MARGEN_BLOQUE_MIN) se resuelve antes, en
// procesarUpdateTelegram, preguntando al usuario.
//
// Relleno hacia atrás (cantidad/offset): el mismo valor se escribe en
// "cantidad" bloques consecutivos que terminan en el bloque calculado
// arriba, desplazado "offset" bloques hacia atrás. Ej. cantidad=4 ->
// bloque calculado + los 3 anteriores (últimos 2:00); offset=1 -> el
// rango termina en el bloque previo al actual. Se recorta en 00:00.
function procesarActividad(tag, esMedioBloqueInput = false, cantidad = 1, offset = 0, momento = new Date(), ajusteBloque = 0){

  const sheet = SpreadsheetApp
    .openById(SPREADSHEET_ID)
    .getSheets()[0];
  const now = momento;
  const minutoReal = now.getMinutes(); // sin redondear, para el sufijo ":MM" en la celda

  const adjusted = new Date(now.getTime() + ajusteBloque * 30 * 60 * 1000);

  console.log("Hora original:", now);
  console.log("Hora ajustada:", adjusted);

  const row = calcularFila(adjusted);
  const col = calcularColumna(adjusted);

  const filaUltima = row - offset;
  // cantidad puede traer .5 (ej. 2.5): se escriben ceil(cantidad) celdas y
  // la más antigua (la primera) lleva "/2" -> GAS /2, GAS, GAS.
  const hayMediaCelda = cantidad % 1 !== 0;
  const celdas = Math.ceil(cantidad);
  const filaPrimera = Math.max(filaUltima - (celdas - 1), TELEGRAM_FILA_BASE);
  if (filaUltima < TELEGRAM_FILA_BASE) {
    console.error("Offset fuera del día: no hay bloques que escribir.");
    return null;
  }

  const cell = sheet.getRange(filaPrimera, col, filaUltima - filaPrimera + 1, 1);
  // La media celda solo aplica si no se recortó la primera por llegar a 00:00.
  const primeraEsMedia = hayMediaCelda && !esMedioBloqueInput && (filaUltima - filaPrimera + 1) === celdas;

  const minutoTexto = (minutoReal < 10 ? "0" : "") + minutoReal;
  const valorCelda = esMedioBloqueInput
    ? `${tag} /2 :${minutoTexto}`
    : `${tag} :${minutoTexto}`;

  console.log("Escribiendo en rango", cell.getA1Notation(),
    "(filas", filaPrimera, "-", filaUltima, "col", col, ") — día:", adjusted.getDay(),
    "| valor:", valorCelda);

  // Negrilla + itálica: distingue lo escrito vía Telegram (tiempo real)
  // de lo planeado a inicio de semana (texto normal) en el mismo rango
  // de producción C2:I49.
  // Resetea el fondo estático: el formato condicional solo pinta si hay match,
  // así que un color viejo (ENG, Graphics) persistiría con un tag sin regla.
  cell.setBackground('#ffffff');
  cell.setValue(valorCelda);
  if (primeraEsMedia) {
    sheet.getRange(filaPrimera, col).setValue(`${tag} /2 :${minutoTexto}`);
  }
  cell.setFontWeight("bold");
  cell.setFontStyle("italic");
  cell.setFontLine("none"); // quita el tachado del planning para que sí sume en HORAS_LABORALES

  console.log("Escritura confirmada en", cell.getA1Notation());

  // Rango horario cubierto (inicio del primer bloque - fin del último),
  // para informarlo en la confirmación de Telegram.
  const textoHora = (idx, finDeBloque) => {
    const h = Math.floor(idx / 2);
    const m = (idx % 2) * 30 + (finDeBloque ? 29 : 0);
    return `${h < 10 ? "0" : ""}${h}:${m < 10 ? "0" : ""}${m}`;
  };
  const rangoBloqueTexto = `${textoHora(filaPrimera - TELEGRAM_FILA_BASE, false)}-${textoHora(filaUltima - TELEGRAM_FILA_BASE, true)}`;

  return {
    celda: cell.getA1Notation(),
    rangoBloque: rangoBloqueTexto,
    esMedioBloque: esMedioBloqueInput,
    bloques: filaUltima - filaPrimera + 1
  };
}

// ============================================================
// NOTA (migración a polling, ver Polling.gs):
// Mismo bug que en Sprachen — el webhook (doPost) sufre un 302
// intermitente propio de GAS Web App respondiendo a callers no
// autenticados; Telegram no sigue el redirect, cuenta la entrega
// como fallida y reintenta el mismo update en loop, escribiendo
// muchas horas seguidas en celdas contiguas.
//
// Solución: igual que en Sprachen, Apps Script llama hacia afuera a
// Telegram (getUpdates, autenticado con el bot token) en vez de
// esperar que Telegram le pegue a /exec. Ver Polling.gs: tick() cada
// 1 min llama a pollTelegram(), que llama a procesarUpdateTelegram()
// por cada update nuevo.
//
// El BOT_TOKEN ya no vive hardcodeado acá — se movió a Script
// Properties como "TELEGRAM_TOKEN" (Extensiones > Apps Script >
// Configuración del proyecto > Propiedades del script). doPost queda
// abajo solo como referencia histórica, sin usar mientras el webhook
// esté eliminado.
// ============================================================

function getBotToken() {
  return PropertiesService.getScriptProperties().getProperty("TELEGRAM_TOKEN");
}

function clearTelegramWebhook() {
  const token = getBotToken();

  // Elimina el webhook y descarta la cola de updates pendientes/atascados
  const del = UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/deleteWebhook?drop_pending_updates=true`);

  console.log("Webhook eliminado:", del.getContentText());
}

// ============================================================
// Comando /calend [ayer] — resumen de actividades del día por Telegram.
// Reutiliza resumenDiaActividades (Codigo.gs), que ya arma el texto
// línea por línea agrupado por color y ordenado cronológicamente.
// ============================================================
function manejarComandoCalend(msgText, chatId) {
  const arg = msgText.trim().split(/\s+/)[1]?.toLowerCase();
  const dia = arg === "ayer" ? new Date(Date.now() - 86400000) : new Date();

  const { lineas } = resumenDiaActividades(dia);
  const titulo = arg === "ayer" ? "Resumen de ayer" : "Resumen de hoy";
  const texto = `${titulo}\n\n${lineas.join("\n")}`;

  const token = getBotToken();
  if (chatId && token) {
    try {
      UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify({
          chat_id: chatId,
          text: texto
        })
      });
    } catch(err) {
      console.error("manejarComandoCalend: fallo enviando resumen:", err.toString());
    }
  }
}

// ============================================================
// Resumen nocturno automático — llama a manejarComandoCalend() con el
// chat_id guardado (ver TELEGRAM_CHAT_ID en procesarUpdateTelegram), ya
// que un trigger de tiempo no tiene chat_id propio. Requiere haber
// mandado al menos un mensaje al bot antes (lo que sea) para que el
// chat_id quede guardado.
// ============================================================
function enviarResumenNocturno() {
  const chatId = PropertiesService.getScriptProperties().getProperty("TELEGRAM_CHAT_ID");

  if (!chatId) {
    console.error("enviarResumenNocturno: no hay TELEGRAM_CHAT_ID guardado — manda cualquier mensaje al bot primero.");
    return;
  }

  manejarComandoCalend("/calend", chatId);
}

//Bug sigue mostrando agrupadas,
// Instalar el trigger diario a las 23:00 — CORRER UNA SOLA VEZ A MANO
// desde el editor de Apps Script.
function crearTriggerResumenNocturno() {
  const yaExiste = ScriptApp.getProjectTriggers()
    .some(t => t.getHandlerFunction() === "enviarResumenNocturno");

  if (yaExiste) {
    console.log("El trigger de resumen nocturno ya existe, no se crea otro.");
    return;
  }

  ScriptApp.newTrigger("enviarResumenNocturno")
    .timeBased()
    .everyDays(1)
    .atHour(23)
    .nearMinute(0)
    .inTimezone(Session.getScriptTimeZone())
    .create();

  console.log("Trigger creado: resumen nocturno diario a las 23:00.");
}

// ============================================================
// Comando /agenda — lo PROGRAMADO para hoy (tarea 4), el espejo de
// /calend. Reutiliza resumenDiaProgramado (Codigo.js), que ya arma las
// líneas bloque por bloque con los consecutivos colapsados.
// ============================================================
function manejarComandoAgenda(chatId) {
  const { lineas, horaInicio } = resumenDiaProgramado();

  // horaInicio null = no hay nada planeado; en ese caso "lineas" ya trae
  // el aviso y no tiene sentido el encabezado con hora de arranque.
  const titulo = horaInicio
    ? `Agenda de hoy — arranca ${horaInicio}`
    : "Agenda de hoy";
  const texto = `${titulo}\n\n${lineas.join("\n")}`;

  const token = getBotToken();
  if (chatId && token) {
    try {
      UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify({
          chat_id: chatId,
          text: texto
        })
      });
    } catch(err) {
      console.error("manejarComandoAgenda: fallo enviando agenda:", err.toString());
    }
  }
}

// ============================================================
// Agenda matutina automática. Mismo patrón que enviarResumenNocturno:
// usa el TELEGRAM_CHAT_ID guardado, porque un trigger de tiempo no
// tiene chat_id propio.
//
// La hora cambia según el día (7:00 entre semana, 8:30 fin de semana) y
// Apps Script no permite variar la hora dentro de un solo trigger — se
// crean dos, y cada uno se auto-filtra por día. Así, el de las 7:00 no
// manda nada sábado/domingo y el de las 8:30 solo manda esos dos días.
// ============================================================
function enviarAgendaEntreSemana() {
  const diaSemana = new Date().getDay(); // 0 domingo, 6 sábado
  if (diaSemana === 0 || diaSemana === 6) return;

  enviarAgendaMatutina();
}

function enviarAgendaFinDeSemana() {
  const diaSemana = new Date().getDay();
  if (diaSemana !== 0 && diaSemana !== 6) return;

  enviarAgendaMatutina();
}

function enviarAgendaMatutina() {
  const chatId = PropertiesService.getScriptProperties().getProperty("TELEGRAM_CHAT_ID");

  if (!chatId) {
    console.error("enviarAgendaMatutina: no hay TELEGRAM_CHAT_ID guardado — manda cualquier mensaje al bot primero.");
    return;
  }

  manejarComandoAgenda(chatId);
}

// Instalar los dos triggers de la agenda — CORRER UNA SOLA VEZ A MANO
// desde el editor de Apps Script.
function crearTriggerAgendaMatutina() {
  const handlers = ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction());

  if (!handlers.includes("enviarAgendaEntreSemana")) {
    ScriptApp.newTrigger("enviarAgendaEntreSemana")
      .timeBased()
      .everyDays(1)
      .atHour(7)
      .nearMinute(0)
      .inTimezone(Session.getScriptTimeZone())
      .create();
    console.log("Trigger creado: agenda 7:00 (lunes a viernes).");
  } else {
    console.log("El trigger de agenda entre semana ya existe, no se crea otro.");
  }

  if (!handlers.includes("enviarAgendaFinDeSemana")) {
    ScriptApp.newTrigger("enviarAgendaFinDeSemana")
      .timeBased()
      .everyDays(1)
      .atHour(8)
      .nearMinute(30)
      .inTimezone(Session.getScriptTimeZone())
      .create();
    console.log("Trigger creado: agenda 8:30 (sábado y domingo).");
  } else {
    console.log("El trigger de agenda de fin de semana ya existe, no se crea otro.");
  }
}

// ============================================================
// Ruteo de update — usado tanto por doPost (histórico) como por
// pollTelegram (mecanismo vigente, ver Polling.gs)
// ============================================================
function procesarUpdateTelegram(update) {
  if (update.callback_query) {
    manejarCallbackBloque(update.callback_query);
    return;
  }
  const updateId = update.update_id?.toString();
  const msgText = update.message?.text;
  const chatId = update.message?.chat?.id;

  console.log("update_id:", updateId, "| chat_id:", chatId, "| texto:", msgText);

  if (!msgText) return;

  // Guarda el chat_id del último mensaje recibido — lo necesita
  // enviarResumenNocturno() (trigger de tiempo) para saber a quién
  // mandarle el resumen, ya que un trigger de tiempo no tiene chat_id
  // propio (no viene de un update de Telegram).
  if (chatId) {
    PropertiesService.getScriptProperties().setProperty("TELEGRAM_CHAT_ID", chatId.toString());
  }

  // Comando /calend [ayer] — resumen del día por Telegram (ver
  // resumenDiaActividades en Codigo.gs). Sin argumento = hoy.
  if (msgText.trim().toLowerCase().startsWith("/calend")) {
    manejarComandoCalend(msgText, chatId);
    return;
  }

  // Comando /agenda — lo programado para hoy (ver resumenDiaProgramado
  // en Codigo.js). Sin argumentos: siempre el día en curso.
  if (msgText.trim().toLowerCase().startsWith("/agenda")) {
    manejarComandoAgenda(chatId);
    return;
  }

  // Formato: "Tag[ /2][, xN][, vor MB | -MB]". El "/2" es siempre explícito (input del
  // usuario, ver Ticket #12) — nunca se infiere del minuto de llegada.
  const parts = msgText.split(",").map(p => p.trim());
  const primeraParteRaw = parts[0];
  const esMedioBloqueInput = /\/2\s*$/.test(primeraParteRaw);
  const tag = primeraParteRaw.replace(/\/2\s*$/, "").trim();
  const params = parts.slice(1).map(p => p.toLowerCase());

  // Relleno hacia atrás: "xN" = N bloques que terminan en el bloque
  // calculado; "vor MB" o "-MB" (B opcional) = ese rango termina M bloques antes (offset).
  let cantidad = 1;
  let offset = 0;
  for (const p of params) {
    const mx = p.match(/^x(\d+(?:\.\d+)?)$/);
    // acepta decimales (x2.5; la coma separa params, solo punto), redondeados a múltiplos de 0.5
    if (mx) cantidad = Math.max(0.5, Math.min(Math.round(parseFloat(mx[1]) * 2) / 2, 48));
    const mv = p.match(/^(?:vor\s+|-\s*)(\d+)\s*b?$/);
    if (mv) offset = parseInt(mv[1], 10);
  }

  // Hora real del mensaje (el polling puede llegar hasta 1 min tarde).
  const momento = update.message.date ? new Date(update.message.date * 1000) : new Date();

  console.log("tag:", tag, "| esMedioBloqueInput:", esMedioBloqueInput, "| cantidad:", cantidad, "| offset:", offset);

  // Cerca del cambio de bloque -> ambiguo: preguntar.
  const minEnBloque = momento.getMinutes() % 30;
  const recienAbierto = minEnBloque < MARGEN_BLOQUE_MIN;
  const porCerrar = minEnBloque >= 30 - MARGEN_BLOQUE_MIN;
  if (chatId && (recienAbierto || porCerrar)) {
    preguntarBloque(chatId, updateId, { tag, esMedioBloqueInput, cantidad, offset, ts: momento.getTime() }, recienAbierto);
    return;
  }

  const resultado = procesarActividad(tag, esMedioBloqueInput, cantidad, offset, momento, 0);
  confirmarActividad(chatId, tag, resultado);
}

function confirmarActividad(chatId, tag, resultado) {
  if (!chatId) return;
  try {
    const infoBloque = resultado
      ? `\n: ${resultado.rangoBloque} (${resultado.esMedioBloque ? "0.25h" : "0.5h"}${resultado.bloques > 1 ? " x" + resultado.bloques : ""})`
      : "\n⚠️ offset fuera del día, no se escribió nada";
    UrlFetchApp.fetch(`https://api.telegram.org/bot${getBotToken()}/sendMessage`, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({ chat_id: chatId, text: `✅ ${tag}${infoBloque}` })
    });
  } catch(err) {
    // No dejamos que un fallo al confirmar por Telegram bloquee la escritura en la celda
    console.error("confirmarActividad: fallo enviando confirmación:", err.toString());
  }
}

// ------------------------------------------------------------
// Pregunta de bloque (mensaje a ±MARGEN_BLOQUE_MIN del cambio de bloque).
// Guarda el pedido en Script Properties ("PEND_<id>") y manda dos botones;
// la respuesta llega como callback_query -> manejarCallbackBloque.
// ajuste: -1/0 si el bloque nuevo se acaba de abrir; 0/+1 si está por cerrar.
// ------------------------------------------------------------
function preguntarBloque(chatId, id, pedido, recienAbierto) {
  PropertiesService.getScriptProperties().setProperty("PEND_" + id, JSON.stringify(pedido));
  const hora = (ajuste) => {
    const d = new Date(pedido.ts + ajuste * 30 * 60 * 1000);
    const idx = d.getHours() * 2 + (d.getMinutes() >= 30 ? 1 : 0);
    const h = Math.floor(idx / 2), m = (idx % 2) * 30;
    return `${h < 10 ? "0" : ""}${h}:${m < 10 ? "0" : ""}${m}`;
  };
  const [aCierra, aAbre] = recienAbierto ? [-1, 0] : [0, 1];
  UrlFetchApp.fetch(`https://api.telegram.org/bot${getBotToken()}/sendMessage`, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({
      chat_id: chatId,
      text: `⏱ ${pedido.tag}: ¿en qué bloque?`,
      reply_markup: { inline_keyboard: [[
        { text: `Que acaba (${hora(aCierra)})`, callback_data: `blk|${id}|${aCierra}` },
        { text: `Nuevo (${hora(aAbre)})`, callback_data: `blk|${id}|${aAbre}` }
      ]] }
    })
  });
}

function manejarCallbackBloque(cb) {
  const token = getBotToken();
  const api = (metodo, payload) => UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/${metodo}`, {
    method: "post", contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true
  });
  const m = (cb.data || "").match(/^blk\|(\d+)\|(-?\d)$/);
  if (!m) { api("answerCallbackQuery", { callback_query_id: cb.id }); return; }

  const props = PropertiesService.getScriptProperties();
  const raw = props.getProperty("PEND_" + m[1]);
  api("answerCallbackQuery", { callback_query_id: cb.id });
  if (!raw) return; // ya procesado (doble toque) o expirado
  props.deleteProperty("PEND_" + m[1]);

  const p = JSON.parse(raw);
  const resultado = procesarActividad(p.tag, p.esMedioBloqueInput, p.cantidad, p.offset, new Date(p.ts), parseInt(m[2], 10));
  // Quita los botones del mensaje de la pregunta y confirma.
  const chatId = cb.message && cb.message.chat.id;
  if (chatId) api("editMessageReplyMarkup", { chat_id: chatId, message_id: cb.message.message_id, reply_markup: { inline_keyboard: [] } });
  confirmarActividad(chatId, p.tag, resultado);
}

// NOTA (migración a polling): doPost queda sin usar una vez corrido
// clearTelegramWebhook() — se deja como referencia histórica / por si
// algún día se quiere reactivar el webhook.
function doPost(e) {
  try {
    const update = JSON.parse(e.postData.contents);
    procesarUpdateTelegram(update);
  } catch(err) {
    console.error("doPost error:", err.toString());
  }
  return ContentService.createTextOutput("ok");
}

function limpiarProperties() {
  PropertiesService.getScriptProperties().deleteAllProperties();
}

function testDoPost() {

  const fakeEvent = {
    postData: {
      contents: JSON.stringify({
        update_id: 1,
        message: {
          text: "Hamburg, init"
        }
      })
    }
  };

  doPost(fakeEvent);

}

// NOTA: el resumen diario de actividades (enviarResumenDiaActividades) se
// movió a Codigo.gs — no tiene relación con el webhook/polling de Telegram,
// y reutiliza la misma lectura de backgrounds/fontLines que
// actualizarHorasPorActividad (ver Codigo.gs).
