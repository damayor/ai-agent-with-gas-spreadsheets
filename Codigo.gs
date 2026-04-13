const tasksEndRow = 39
const SPREADSHEET_ID = '1fULXN0xEEM5gGVhuMwWK67fJqHAkUDdwI9EvwzNFtVs';

function limpiarCalendario() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  
  // Limpiar colores del área de calendario (C2:I49)
  sheet.getRange(2, 2, 48, 7).setBackground('#ffffff');
  
  SpreadsheetApp.getUi().alert('✅ Calendario limpiado!');
}

function aplicarFormatoCondicional() {
  var hoja = SpreadsheetApp.getActiveSheet();
  var reglas = [];
  
  // Lee tu tabla de referencia (ajusta el rango)
  var tablaRef = hoja.getRange(`K17:K${tasksEndRow}`).getValues();
  var colores = hoja.getRange(`L17:L${tasksEndRow}`).getBackgrounds();

  console.log("Refs", tablaRef, colores)

  hoja.getRange(`M17:M${tasksEndRow}`).setValues(colores);
  
  for (var i = 0; i < tablaRef.length; i++) {
    if (tablaRef[i][0]) { // Si hay palabras clave
      var palabras = tablaRef[i][0].toString().split(",");
      var patron = palabras.map(p => "REGEXMATCH(LOWER(C2); \"" + p.trim().toLowerCase() + "\")").join("; ");
      var formula = "=OR(" + patron + ")";
      var color = colores[i][0];
      
      var regla = SpreadsheetApp.newConditionalFormatRule()
        .whenFormulaSatisfied(formula)
        .setBackground(color)
        .setRanges([hoja.getRange("C2:I49")]) // Tu rango del calendario
        .build();
      
      reglas.push(regla);


    }
  }
  
  hoja.setConditionalFormatRules(reglas);
}

function actualizarHorasPorActividad() {
  const hoja = SpreadsheetApp.getActiveSheet();
  const range = hoja.getRange("C2:I49");

  const backgrounds = range.getBackgrounds().flat();
  const fontLines = range.getFontLines().flat();

  console.log("backgrounds", backgrounds);
  console.log("fontLines", fontLines);

  const conteo = {};

  // 1. Contar todos los backgrounds en una sola pasada
  for (let i = 0; i < backgrounds.length; i++) {

      const color = backgrounds[i];
      const tachado = fontLines[i] === "line-through";
      if(!tachado)
        conteo[color] = (conteo[color] || 0) +  1;
    
  }

  // 2. Leer lista de backgrounds (ej: M17:M39)
  const listaColores = hoja.getRange(`M17:M${tasksEndRow}`).getValues();

  // 3. Mapear resultados
  const mappedHours = listaColores.map(([color]) => {
    return [conteo[color]* 0.5 || 0];
  });

  console.log("backgrounds mappeados: ", mappedHours);

  // 4. Escribir resultados de una vez (N2:N31)
  hoja.getRange(`N17:N${tasksEndRow}`).setValues(mappedHours);
}

//to use in Mobile
function onEdit(e) {
  const rango = e.range;
  if (rango.getA1Notation() === "N13" && rango.getValue() === true) {
    actualizarHorasPorActividad(); // Aquí llamas a tu método

    for (let i = 0; i < 7  ; i++) {
     HORAS_LABORALES(i+3, 2, 49 ); 
    }

    rango.setValue(false); // Reinicia el "botón"
  }
/*
  if (rango.getA1Notation() === "B55" && rango.getValue() === true) {
    for (let i = 0; i < 7  ; i++) {
     HORAS_LABORALES(i+3, 2, 49 ); 
    }
    rango.setValue(false); // Reinicia el "botón"
  }*/
}


//col starts en 1, no en 0
function HORAS_LABORALES(columna, filaInicio, filaFin) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const activeSheet = ss.getActiveSheet();
  var targetColors = activeSheet.getRange(`L22:L31`).getBackgrounds().flat();
  const range = activeSheet.getRange(filaInicio, columna, filaFin - filaInicio + 1, 1);
  const backgrounds = range.getBackgrounds().flat();
  const fontLines = range.getFontLines().flat();

  //console.log("backgrounds", backgrounds);
  //console.log("fontLines", fontLines);

  let totalHoras = 0;

  for (let i = 0; i < backgrounds.length; i++) {
    const color = backgrounds[i];
    const tachado = fontLines[i] === "line-through";
    if (targetColors.includes(color.toLowerCase()) && !tachado) {
      totalHoras++;
    }

  }
  
  console.log("Horas de la col ", columna, ": ", totalHoras * 0.5);
  return totalHoras * 0.5;
}

/**
 * Devuelve si cumpliste las 8h laborales del día.
 * Uso: =CUMPLE_8H("C2:C100")
 * Devuelve: "✅ 9.5h / 8h" o "❌ 6h / 8h"
 *  =HORAS_LABORALES("B2:B50")        → número total de horas laborales del día
    =CUMPLE_8H("B2:B50")              → "✅ 8.5h / 8h"  o  "❌ 6h / 8h"
    =CUMPLE_8H("B2:B50", 6) 
 */
function CUMPLE_8H(sumRangeA1, metaHoras = 8) {
  const horas = HORAS_LABORALES(sumRangeA1);
  const cumple = horas >= metaHoras;
  return `${cumple ? "✅" : "❌"} ${horas}h / ${metaHoras}h`;
}




function doGet(e) {
  console.log("trying to GET" + SPREADSHEET_ID)  
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheets()[0];

  sheet.getRange("C89").setValue("Hello World GET");

  return ContentService
    .createTextOutput("ok")
    .setMimeType(ContentService.MimeType.TEXT);
}

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('📅 Calendario Semanal')
    .addItem('Limpiar Calendario', 'limpiarCalendario')
    .addItem('Sincronizar tags con colores', 'aplicarFormatoCondicional')
    .addItem('Actualizar contar horas por color', 'actualizarHorasPorActividad')
    .addItem('Test solo para update HORAS_LAB', 'test')
    .addToUi();
}

function test() {
  
  HORAS_LABORALES(9, 2, 49)
  //actualizarHorasPorActividad()

}

//M to S in Columnas 3 to 9
function calcularFila(date){

  const h = date.getHours();
  const m = date.getMinutes();

  return 2 + (h * 2) + (m >= 30 ? 1 : 0);
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

}

//ToTest  9:05  Unity,false
function procesarActividad(tag, isEnding){

  const sheet = SpreadsheetApp
    .openById(SPREADSHEET_ID)
    .getSheets()[0];
  const now = new Date();

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
  if (minutesToNext <= 5) {

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

  console.log("Row:", row, "Col:", col);

  const cell = sheet.getRange(row, col);

  if (!isEnding) {

    cell.setValue(tag);

  } else {

    cell.setValue("END"); //ToDo: To Fix here;

  }
}

  const BOT_TOKEN = "8766703385:AAGy8i_2adBysloHoX09qc_KevBS29JeUuo";

function clearTelegramWebhook() {
  const TOKEN = "8766703385:AAGy8i_2adBysloHoX09qc_KevBS29JeUuo";
  
  // 1. Elimina y re-registra el webhook (limpia la cola)
  const del = UrlFetchApp.fetch(`https://api.telegram.org/bot${TOKEN}/deleteWebhook?drop_pending_updates=true`);
  
  console.log("Delete:", del.getContentText());

  const WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbz03ZcenVhTC8aOZtxfYw7yJ2mFiQ9pWEdwZMHAoRbLrh6yk5gQcrwRY3tgv95ZV3RnAQ/exec"
  const set = UrlFetchApp.fetch(`https://api.telegram.org/bot${TOKEN}/setWebhook?url=${WEBHOOK_URL}&drop_pending_updates=true`);
  
  console.log("Webhook limpiado y re-registrado");
  console.log("Set:", set.getContentText());

}

function backDoPost(e) {
  console.log("Webhook triggered 15.3");
  
  const CHAT_ID = 8520405167; // tu chat personal con el bot

  SpreadsheetApp.flush(); // fuerza contexto de ejecución loggeable
  console.log("RAW:", JSON.stringify(e));

  try {
    console.log(e.postData.contents);


    const data = JSON.parse(e.postData.contents);

    // Last try Envíate el update_id y texto como mensaje de Telegram
    const updateId = data.update_id?.toString();
    const msgText = data.message?.text || "sin texto";
    
    UrlFetchApp.fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({
        chat_id: CHAT_ID,
        text: `update_id: ${updateId}\ntexto: ${msgText}`
      })
    });

    // ✅ Siempre responder OK aunque no haya mensaje
    if (!data.message || !data.message.text) {
      return ContentService.createTextOutput("ok");
    }

    // ✅ Deduplicar por update_id para evitar el loop
    console.log("updateId", updateId);
    if (updateId) {
      const cache = CacheService.getScriptCache();
      if (cache.get(updateId)) {
        console.log("Update ya procesado, ignorando:", updateId);
        return ContentService.createTextOutput("ok");
      }
      cache.put(updateId, "1", 3600); // guarda por 1 hora
    }

    const text = data.message.text;
    const parts = text.split(",");

    const tag = parts[0];
    const isEnding = parts[1] === "end";

    console.log("tag:", tag, "| isEnding:", isEnding);

    const output = ContentService.createTextOutput("ok");

    //procesarActividad(tag, isEnding);

    return output;
  }
  catch(err){
    console.error("ERRORRR:", err.toString());

    console.error(err);
    return ContentService.createTextOutput("ok");

  }
}

function doPost(e) {

  console.log("Webhook triggered 19.3");
  
  const CHAT_ID = 8520405167; // tu chat personal con el bot

  SpreadsheetApp.flush(); // fuerza contexto de ejecución loggeable
  console.log("RAW:", JSON.stringify(e));


  try {
    const data = JSON.parse(e.postData.contents);
    const updateId = data.update_id?.toString();

    // 🔒 Lock para evitar concurrencia
    const lock = LockService.getScriptLock();
    lock.waitLock(3000);

    try {
      // ✅ PropertiesService persiste entre instancias (CacheService no garantiza esto)
      const props = PropertiesService.getScriptProperties();
      if (updateId && props.getProperty(updateId)) {
        console.log("Duplicado bloqueado:", updateId);
        return ContentService.createTextOutput("ok");
      }
      if (updateId) props.setProperty(updateId, "1");
    } finally {
      lock.releaseLock();
    }

    if (!data.message?.text) {
      return ContentService.createTextOutput("ok");
    }

    const text = data.message.text;
    const parts = text.split(",");
    const tag = parts[0].trim();
    const isEnding = parts[1]?.trim() === "end";

    console.log("update_id:", updateId, "| tag:", tag, "| isEnding:", isEnding);

    UrlFetchApp.fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({
        chat_id: CHAT_ID,
        text: `✅ update_id: ${updateId}\ntag: ${tag}\nisEnding: ${isEnding}`
      })
    });

    procesarActividad(tag, isEnding);

    return ContentService.createTextOutput("ok");

  } catch(err) {
    console.error("ERROR:", err.toString());
    return ContentService.createTextOutput("ok");
  }
}

function limpiarProperties() {
  PropertiesService.getScriptProperties().deleteAllProperties();
}

function testDoPost() {

  const fakeEvent = {
    postData: {
      contents: JSON.stringify({
        message: {
          text: "Hamburg, init"
        }
      })
    }
  };

  doPost(fakeEvent);

}
