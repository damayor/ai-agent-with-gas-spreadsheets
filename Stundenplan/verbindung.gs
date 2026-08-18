
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

//ToTest  9:05  Unity
function procesarActividad(tag){

  const sheet = SpreadsheetApp
    .openById(SPREADSHEET_ID)
    .getSheets()[0];
  const now = new Date();
  const minutoReal = now.getMinutes(); // sin redondear, para el sufijo ":MM" en la celda

  let minutes = now.getMinutes();
  let hours = now.getHours();

  // calcular siguiente bloque
  let nextBlock = null;

  if (minutes <= 30) {
    nextBlock = 30;
  } else {
    nextBlock = 60;
  }

  const minutesToNext = nextBlock - minutes;

  // si faltan 8 min o menos, saltamos al siguiente bloque
  let saltoDeBloque = false;
  if (minutesToNext <= 5) {

    saltoDeBloque = true;

    if (nextBlock === 60) {
      hours += 1;
      minutes = 0;
    } else {
      minutes = 30;
    }

  }
  else {

    if (minutes < 30) {
      minutes = 0;
    } else {
      minutes = 30;
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

  // Sufijo ":MM" con el minuto real (sin redondear) en que llegó el
  // mensaje. Regla de conteo (leída por HORAS_LABORALES en Codigo.gs):
  // si el minuto real cae en la 2da mitad del bloque de 30 min (minuto
  // dentro del bloque >= 15), se asume que solo se alcanzó a trabajar
  // esa mitad -> se marca con el sufijo "/2" y cuenta 0.25h en vez de
  // 0.5h. Si el mensaje ya saltó al siguiente bloque por el margen de
  // 5 min (saltoDeBloque), se considera que arrancó ese bloque nuevo
  // -> nunca es "/2" en ese caso.
  const minutoDentroDelBloque = minutoReal % 30;
  const esMedioBloque = !saltoDeBloque && minutoDentroDelBloque >= 15;

  const minutoTexto = (minutoReal < 10 ? "0" : "") + minutoReal;
  const valorCelda = esMedioBloque
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
// Ruteo de update — usado tanto por doPost (histórico) como por
// pollTelegram (mecanismo vigente, ver Polling.gs)
// ============================================================
function procesarUpdateTelegram(update) {
  const updateId = update.update_id?.toString();
  const msgText = update.message?.text;
  const chatId = update.message?.chat?.id;

  console.log("update_id:", updateId, "| chat_id:", chatId, "| texto:", msgText);

  if (!msgText) return;

  const tag = msgText.split(",")[0].trim();

  console.log("tag:", tag);

  const token = getBotToken();
  if (chatId) {
    try {
      UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify({
          chat_id: chatId,
          text: `✅ update_id: ${updateId}\ntag: ${tag}`
        })
      });
    } catch(err) {
      // No dejamos que un fallo al confirmar por Telegram bloquee la escritura en la celda
      console.error("procesarUpdateTelegram: fallo enviando confirmación:", err.toString());
    }
  }

  procesarActividad(tag);
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
