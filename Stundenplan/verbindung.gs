
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

// Ventanas de margen (en minutos dentro del bloque de 30 min) usadas por
// procesarActividad para decidir a qué bloque va un mensaje de Telegram.
// MARGEN_CIERRE_BLOQUE_ANTERIOR: "Tag, end" en los primeros N min del
// bloque actual se interpreta como cierre del bloque ANTERIOR completo.
// MARGEN_SALTO_SIGUIENTE_BLOQUE: mensaje (sin end) a N min o menos de
// terminar el bloque actual salta directo al bloque siguiente.
const MARGEN_CIERRE_BLOQUE_ANTERIOR = 7;
const MARGEN_SALTO_SIGUIENTE_BLOQUE = 5;

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

// Ticket #12: "/2" pasó a ser SIEMPRE input explícito del usuario — el
// código ya no infiere medio bloque por el minuto de llegada del mensaje
// en ningún caso (ni con "end" ni sin él). Regla única:
//   - esMedioBloqueInput decide CUÁNTO cuenta el bloque escrito (0.5h o
//     0.25h) — nunca se adivina por minuto de llegada.
//   - isEnding decide A QUÉ bloque se escribe (ver más abajo): dentro de
//     la ventana de gracia MARGEN_CIERRE_BLOQUE_ANTERIOR se interpreta
//     como "acabo de cerrar el bloque anterior" (retrocede un bloque);
//     fuera de esa ventana, "end" cierra el bloque actual/entrante.
//   - Sin "end", el mensaje simplemente escribe en el bloque en curso
//     (o salta al siguiente si llega en el margen de cierre del bloque,
//     MARGEN_SALTO_SIGUIENTE_BLOQUE, para no pisar un bloque que ya casi
//     terminó).
function procesarActividad(tag, isEnding = false, esMedioBloqueInput = false){

  const sheet = SpreadsheetApp
    .openById(SPREADSHEET_ID)
    .getSheets()[0];
  const now = new Date();
  const minutoReal = now.getMinutes(); // sin redondear, para el sufijo ":MM" en la celda

  let minutes = now.getMinutes();
  let hours = now.getHours();

  const minutoDentroBloqueActual = minutes % 30;
  const esCierreDeBloqueAnterior = isEnding && minutoDentroBloqueActual < MARGEN_CIERRE_BLOQUE_ANTERIOR;

  if (isEnding) {

    if (esCierreDeBloqueAnterior) {
      // "Tag, end" en los primeros MARGEN_CIERRE_BLOQUE_ANTERIOR min del
      // bloque actual -> se refiere al bloque ANTERIOR, que se acaba de
      // cerrar. Retrocede un bloque de 30 min.
      if (minutes < 30) {
        hours -= 1;
        minutes = 30;
      } else {
        minutes = 0;
      }
    } else {
      // "Tag, end" fuera de esa ventana -> cierra el bloque actual/entrante.
      if (minutes < 30) {
        minutes = 0;
      } else {
        minutes = 30;
      }
    }

  } else {

    // Sin "end": escribe en el bloque en curso, salvo que falten
    // MARGEN_SALTO_SIGUIENTE_BLOQUE min o menos para que termine — en ese
    // caso se considera que ya no alcanza y salta al bloque siguiente.
    const nextBlock = minutes <= 30 ? 30 : 60;
    const minutesToNext = nextBlock - minutes;

    if (minutesToNext <= MARGEN_SALTO_SIGUIENTE_BLOQUE) {
      if (nextBlock === 60) {
        hours += 1;
        minutes = 0;
      } else {
        minutes = 30;
      }
    } else {
      minutes = minutes < 30 ? 0 : 30;
    }

  }

  const adjusted = new Date(now);
  adjusted.setHours(hours);
  adjusted.setMinutes(minutes);
  adjusted.setSeconds(0);

  console.log("Hora original:", now);
  console.log("Hora ajustada:", adjusted);

  const row = calcularFila(adjusted);
  const col = calcularColumna(adjusted);

  const cell = sheet.getRange(row, col);

  const minutoTexto = (minutoReal < 10 ? "0" : "") + minutoReal;
  const valorCelda = esMedioBloqueInput
    ? `${tag} /2 :${minutoTexto}`
    : `${tag} :${minutoTexto}`;

  console.log("Escribiendo en celda", cell.getA1Notation(),
    "(fila", row, "col", col, ") — día:", adjusted.getDay(),
    "hora ajustada:", Utilities.formatDate(adjusted, Session.getScriptTimeZone(), "HH:mm"),
    "| valor:", valorCelda);

  // Negrilla + itálica: distingue lo escrito vía Telegram (tiempo real)
  // de lo planeado a inicio de semana (texto normal) en el mismo rango
  // de producción C2:I49.
  cell.setValue(valorCelda);
  cell.setFontWeight("bold");
  cell.setFontStyle("italic");
  cell.setFontLine("none"); // quita el tachado del planning para que sí sume en HORAS_LABORALES

  console.log("Escritura confirmada en", cell.getA1Notation());

  // Rango de minutos del bloque de 30 min en el que quedó escrita la celda,
  // para poder informarlo en la confirmación de Telegram.
  const minutoInicioBloque = adjusted.getMinutes();
  const minutoFinBloque = minutoInicioBloque + 29;
  const horaTexto = (adjusted.getHours() < 10 ? "0" : "") + adjusted.getHours();
  const rangoBloqueTexto = `${horaTexto}:${(minutoInicioBloque < 10 ? "0" : "") + minutoInicioBloque}-${horaTexto}:${minutoFinBloque}`;

  return {
    celda: cell.getA1Notation(),
    rangoBloque: rangoBloqueTexto,
    esMedioBloque: esMedioBloqueInput
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
// Ruteo de update — usado tanto por doPost (histórico) como por
// pollTelegram (mecanismo vigente, ver Polling.gs)
// ============================================================
function procesarUpdateTelegram(update) {
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

  // Formato: "Tag[ /2][, end]". El "/2" es siempre explícito (input del
  // usuario, ver Ticket #12) — nunca se infiere del minuto de llegada.
  const parts = msgText.split(",").map(p => p.trim());
  const primeraParteRaw = parts[0];
  const esMedioBloqueInput = /\/2\s*$/.test(primeraParteRaw);
  const tag = primeraParteRaw.replace(/\/2\s*$/, "").trim();
  const isEnding = parts[1]?.toLowerCase() === "end";

  console.log("tag:", tag, "| isEnding:", isEnding, "| esMedioBloqueInput:", esMedioBloqueInput);

  const resultado = procesarActividad(tag, isEnding, esMedioBloqueInput);

  const token = getBotToken();
  if (chatId) {
    try {
      const infoBloque = resultado
        ? `\n: ${resultado.rangoBloque} (${resultado.esMedioBloque ? "0.25h" : "0.5h"})`
        : "";
      UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify({
          chat_id: chatId,
          text: `✅ ${tag}${infoBloque}`
        })
      });
    } catch(err) {
      // No dejamos que un fallo al confirmar por Telegram bloquee la escritura en la celda
      console.error("procesarUpdateTelegram: fallo enviando confirmación:", err.toString());
    }
  }
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
