// ============================================================
//  CONFIGURACIÓN — editar solo esta sección
// ============================================================

const SPREADSHEET_ID  = '1fULXN0xEEM5gGVhuMwWK67fJqHAkUDdwI9EvwzNFtVs';
const tasksEndRow     = 39;
const CHAT_ID         = 8520405167;

// Token guardado en PropertiesService, NO hardcodeado aquí.
// Para setearlo, ejecutá una vez: setTokenProperty()
function setTokenProperty() {
  PropertiesService.getScriptProperties().setProperty('BOT_TOKEN', 'PEGA_TU_TOKEN_AQUI');
}
function getBotToken() {
  return PropertiesService.getScriptProperties().getProperty('BOT_TOKEN');
}

// ============================================================
//  WEBHOOK — responde 200 inmediatamente, encola el trabajo
// ============================================================

function doPost(e) {

  // 1. Parsear lo antes posible
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (_) {
    return ok();
  }

  const updateId = data.update_id?.toString();

  // 2. Deduplicar con lock mínimo (solo lectura/escritura de una property)
  if (updateId) {
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(1000)) return ok();           // si no obtenemos lock en 1s, Telegram reintentará → lo ignoramos igual
    try {
      const props = PropertiesService.getScriptProperties();
      if (props.getProperty('uid_' + updateId)) {
        return ok();                                // duplicado — salir sin procesar
      }
      props.setProperty('uid_' + updateId, Date.now().toString());
    } finally {
      lock.releaseLock();
    }
  }

  // 3. Ignorar updates sin texto (inline queries, etc.)
  if (!data.message?.text) return ok();

  // 4. Encolar el payload completo para procesarlo async
  //    Usamos una property con prefijo "queue_" como cola simple
  const queueKey = 'queue_' + updateId;
  PropertiesService.getScriptProperties().setProperty(queueKey, e.postData.contents);

  // 5. Crear trigger one-time para procesar en background (no bloquea esta respuesta)
  ScriptApp.newTrigger('procesarCola')
    .timeBased()
    .after(1000)   // 1 segundo — mínimo permitido por GAS
    .create();

  // 6. Responder 200 inmediatamente — Telegram queda feliz
  return ok();
}

function ok() {
  return ContentService.createTextOutput('ok').setMimeType(ContentService.MimeType.TEXT);
}

// ============================================================
//  PROCESADOR ASYNC — se ejecuta via trigger, no desde webhook
// ============================================================

function procesarCola() {

  // Limpiar el trigger que nos llamó para no acumular triggers huérfanos
  limpiarTriggersProcesarCola();

  const props  = PropertiesService.getScriptProperties();
  const todas  = props.getProperties();

  const pendientes = Object.entries(todas)
    .filter(([k]) => k.startsWith('queue_'))
    .sort(([a], [b]) => a.localeCompare(b));   // FIFO por update_id

  if (pendientes.length === 0) return;

  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheets()[0];

  for (const [key, raw] of pendientes) {
    try {
      const data = JSON.parse(raw);
      const text = data.message?.text?.trim();
      if (!text) continue;

      const respuesta = manejarComando(text, sheet);
      enviarMensaje(respuesta);

    } catch (err) {
      console.error('Error procesando', key, err.toString());
    } finally {
      props.deleteProperty(key);   // siempre sacar de la cola aunque falle
    }
  }
}

function limpiarTriggersProcesarCola() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'procesarCola')
    .forEach(t => ScriptApp.deleteTrigger(t));
}

// ============================================================
//  LÓGICA DE COMANDOS
// ============================================================

/**
 * Interpreta el texto recibido y devuelve una respuesta string.
 * Formatos soportados:
 *   deep            → registra tag "deep" ahora
 *   deep,end        → registra "END" ahora  (isEnding)
 *   deep 9:00       → registra "deep" en hora específica
 *   /status         → resumen del día
 *   /tags           → lista de tags disponibles
 */
function manejarComando(text, sheet) {

  if (text.startsWith('/status')) {
    return buildStatusMessage(sheet);
  }

  if (text.startsWith('/tags')) {
    return buildTagsMessage(sheet);
  }

  // Formato: "tag[,end][ HH:MM]"
  const matchHora  = text.match(/(\d{1,2}):(\d{2})\s*$/);
  let   baseText   = matchHora ? text.replace(matchHora[0], '').trim() : text;
  const parts      = baseText.split(',');
  const tag        = parts[0].trim();
  const isEnding   = parts[1]?.trim() === 'end';

  let fecha;
  if (matchHora) {
    fecha = new Date();
    fecha.setHours(parseInt(matchHora[1]));
    fecha.setMinutes(parseInt(matchHora[2]));
    fecha.setSeconds(0);
  } else {
    fecha = new Date();
  }

  const { adjusted, mensajeAjuste } = ajustarHora(fecha);
  const row = calcularFila(adjusted);
  const col = calcularColumna(adjusted);
  const cell = sheet.getRange(row, col);

  const valor = isEnding ? 'END' : tag;
  cell.setValue(valor);

  const horaStr = `${adjusted.getHours()}:${String(adjusted.getMinutes()).padStart(2,'0')}`;
  return `✅ "${valor}" → ${horaStr}${mensajeAjuste ? '\n' + mensajeAjuste : ''}`;
}

// ============================================================
//  LÓGICA DE HORA — CORREGIDA
// ============================================================

/**
 * Ajusta una fecha al bloque de media hora más cercano.
 * Regla: si faltan ≤5 min para el próximo bloque → avanzar.
 *        si no → truncar al bloque actual.
 * 
 * FIX: el bug original usaba `minutes <= 30` para nextBlock,
 * lo que hacía que las 9:30 exactas saltaran a 10:00.
 * Ahora se usa `minutes < 30`.
 */
function ajustarHora(date) {
  let h = date.getHours();
  let m = date.getMinutes();

  let nextBlock, minutesToNext;

  if (m < 30) {
    nextBlock     = 30;
    minutesToNext = 30 - m;
  } else {
    nextBlock     = 60;
    minutesToNext = 60 - m;
  }

  let mensajeAjuste = '';

  if (minutesToNext <= 5) {
    // Redondear hacia arriba
    if (nextBlock === 60) {
      h += 1;
      m  = 0;
    } else {
      m = 30;
    }
    mensajeAjuste = `(redondeado +${60 - (nextBlock === 60 ? 60 - m : m)}min)`;
  } else {
    // Truncar al bloque actual
    m = m < 30 ? 0 : 30;
  }

  // Edge case: medianoche
  if (h >= 24) { h = 23; m = 30; }

  const adjusted = new Date(date);
  adjusted.setHours(h);
  adjusted.setMinutes(m);
  adjusted.setSeconds(0);

  return { adjusted, mensajeAjuste };
}

// M=col3 ... D=col9, fila 2 = 00:00
function calcularFila(date) {
  return 2 + (date.getHours() * 2) + (date.getMinutes() >= 30 ? 1 : 0);
}

function calcularColumna(date) {
  const day = date.getDay(); // 0=domingo
  return day === 0 ? 9 : day + 2;
}

// ============================================================
//  MENSAJES DE ESTADO
// ============================================================

function buildStatusMessage(sheet) {
  const hoy = new Date();
  const col  = calcularColumna(hoy);
  const colLetter = String.fromCharCode(64 + col); // col 3 → "C"

  // Leer toda la columna de hoy
  const valores = sheet.getRange(2, col, 48, 1).getValues().flat();
  const conteo  = {};
  valores.forEach(v => {
    const t = v?.toString().trim();
    if (t && t !== '') conteo[t] = (conteo[t] || 0) + 1;
  });

  if (Object.keys(conteo).length === 0) return '📭 No hay registros hoy todavía.';

  const diasSemana = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  const lineas = [`📊 *${diasSemana[hoy.getDay()]}*`];
  for (const [tag, bloques] of Object.entries(conteo)) {
    lineas.push(`  ${tag}: ${(bloques * 0.5).toFixed(1)}h`);
  }
  const total = Object.values(conteo).reduce((a, b) => a + b, 0);
  lineas.push(`\nTotal registrado: ${(total * 0.5).toFixed(1)}h`);

  return lineas.join('\n');
}

function buildTagsMessage(sheet) {
  const tags = sheet.getRange(`K17:K${tasksEndRow}`).getValues()
    .flat()
    .filter(v => v?.toString().trim());
  if (tags.length === 0) return 'No encontré tags en K17:K' + tasksEndRow;
  return '🏷 Tags disponibles:\n' + tags.map(t => `  • ${t}`).join('\n');
}

// ============================================================
//  TELEGRAM UTILS
// ============================================================

function enviarMensaje(texto) {
  const token = getBotToken();
  if (!token) { console.error('BOT_TOKEN no configurado'); return; }

  UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    payload: JSON.stringify({
      chat_id:    CHAT_ID,
      text:       texto,
      parse_mode: 'Markdown'
    })
  });
}

function setWebhook(webhookUrl) {
  const token = getBotToken();
  const del = UrlFetchApp.fetch(
    `https://api.telegram.org/bot${token}/deleteWebhook?drop_pending_updates=true`
  );
  console.log('Delete:', del.getContentText());

  const set = UrlFetchApp.fetch(
    `https://api.telegram.org/bot${token}/setWebhook?url=${webhookUrl}&drop_pending_updates=true`
  );
  console.log('Set:', set.getContentText());
}

// ============================================================
//  MANTENIMIENTO
// ============================================================

// Limpiar update_ids viejos (ejecutar con trigger diario o manualmente)
function limpiarPropertiesViejas() {
  const props    = PropertiesService.getScriptProperties();
  const todas    = props.getProperties();
  const hace24h  = Date.now() - 86400000;

  let borradas = 0;
  for (const [k, v] of Object.entries(todas)) {
    if (k.startsWith('uid_') && parseInt(v) < hace24h) {
      props.deleteProperty(k);
      borradas++;
    }
  }
  console.log(`Limpieza: ${borradas} uid_ eliminados`);
}

// ============================================================
//  TUS FUNCIONES ORIGINALES (sin cambios funcionales)
// ============================================================

function limpiarCalendario() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  sheet.getRange(2, 3, 48, 7).setBackground('#ffffff'); // FIX: col 3 (C), no 2 (B)
  SpreadsheetApp.getUi().alert('✅ Calendario limpiado!');
}

function aplicarFormatoCondicional() {
  const hoja    = SpreadsheetApp.getActiveSheet();
  const tablaRef = hoja.getRange(`K17:K${tasksEndRow}`).getValues();
  const colores  = hoja.getRange(`L17:L${tasksEndRow}`).getBackgrounds();
  hoja.getRange(`M17:M${tasksEndRow}`).setValues(colores);
  const reglas = [];
  for (let i = 0; i < tablaRef.length; i++) {
    if (!tablaRef[i][0]) continue;
    const palabras = tablaRef[i][0].toString().split(',');
    const patron   = palabras.map(p => `REGEXMATCH(LOWER(C2);"${p.trim().toLowerCase()}")`).join(';');
    const formula  = `=OR(${patron})`;
    reglas.push(
      SpreadsheetApp.newConditionalFormatRule()
        .whenFormulaSatisfied(formula)
        .setBackground(colores[i][0])
        .setRanges([hoja.getRange('C2:I49')])
        .build()
    );
  }
  hoja.setConditionalFormatRules(reglas);
}

function actualizarHorasPorActividad() {
  const hoja       = SpreadsheetApp.getActiveSheet();
  const range      = hoja.getRange('C2:I49');
  const backgrounds = range.getBackgrounds().flat();
  const fontLines  = range.getFontLines().flat();
  const conteo     = {};
  for (let i = 0; i < backgrounds.length; i++) {
    if (fontLines[i] !== 'line-through')
      conteo[backgrounds[i]] = (conteo[backgrounds[i]] || 0) + 1;
  }
  const listaColores = hoja.getRange(`M17:M${tasksEndRow}`).getValues();
  const mappedHours  = listaColores.map(([c]) => [conteo[c] * 0.5 || 0]);
  hoja.getRange(`N17:N${tasksEndRow}`).setValues(mappedHours);
}

// FIX: usa openById para funcionar también desde webhook/triggers
function HORAS_LABORALES(columna, filaInicio, filaFin) {
  const sheet       = SpreadsheetApp.openById(SPREADSHEET_ID).getSheets()[0];
  const targetColors = sheet.getRange('L22:L31').getBackgrounds().flat();
  const range       = sheet.getRange(filaInicio, columna, filaFin - filaInicio + 1, 1);
  const backgrounds = range.getBackgrounds().flat();
  const fontLines   = range.getFontLines().flat();
  let total = 0;
  for (let i = 0; i < backgrounds.length; i++) {
    if (targetColors.includes(backgrounds[i].toLowerCase()) && fontLines[i] !== 'line-through')
      total++;
  }
  return total * 0.5;
}

function onEdit(e) {
  const rango = e.range;
  if (rango.getA1Notation() === 'N13' && rango.getValue() === true) {
    actualizarHorasPorActividad();
    for (let i = 0; i < 7; i++) HORAS_LABORALES(i + 3, 2, 49);
    rango.setValue(false);
  }
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📅 Calendario Semanal')
    .addItem('Limpiar Calendario',                    'limpiarCalendario')
    .addItem('Sincronizar tags con colores',           'aplicarFormatoCondicional')
    .addItem('Actualizar contar horas por color',      'actualizarHorasPorActividad')
    .addItem('⚙️ Configurar token del bot',            'setTokenProperty')
    .addItem('🔗 Registrar webhook',                   'promptSetWebhook')
    .addItem('🗑️ Limpiar properties viejas',           'limpiarPropertiesViejas')
    .addToUi();
}

function promptSetWebhook() {
  const ui  = SpreadsheetApp.getUi();
  const res = ui.prompt('URL del webhook (tu /exec de Apps Script):');
  if (res.getSelectedButton() === ui.Button.OK) {
    setWebhook(res.getResponseText().trim());
    ui.alert('✅ Webhook registrado');
  }
}

// ============================================================
//  TEST LOCAL (no usa bot)
// ============================================================

function testDoPost() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheets()[0];
  // Probá distintos casos:
  console.log(manejarComando('deep', sheet));          // ahora
  console.log(manejarComando('deep 9:00', sheet));     // hora manual
  console.log(manejarComando('deep,end', sheet));      // cierre
  console.log(manejarComando('/status', sheet));
  console.log(manejarComando('/tags', sheet));
}

function testAjusteHora() {
  const casos = [
    [9,  0], [9,  5], [9, 25], [9, 26],
    [9, 28], [9, 29], [9, 30], [9, 31],
    [9, 55], [9, 56], [23,55]
  ];
  for (const [h, m] of casos) {
    const d   = new Date(); d.setHours(h); d.setMinutes(m); d.setSeconds(0);
    const {adjusted} = ajustarHora(d);
    console.log(`${h}:${String(m).padStart(2,'0')} → ${adjusted.getHours()}:${String(adjusted.getMinutes()).padStart(2,'0')}`);
  }
}