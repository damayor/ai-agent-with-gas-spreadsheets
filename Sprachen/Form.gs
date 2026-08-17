// ============================================================
// WOERTER DES TAGES — Formulario web + Telegram Webhook
// ============================================================
// Comandos Telegram:
//   /nueva DD/MM/YYYY | p1 | p2 | p3 | idioma
//   /ver DD/MM/YYYY
//   /hoy
//   /dictionary [DD/MM/YYYY]
//   /intervalos 30 14 7 3 2
//   /intervalos reset
//   (texto libre, sin "/")  -> se guarda como palabra suelta en col. R
// ============================================================

const ID_HOJA_F    = "1yYJzqZmJOvM6lMMXLdf_ZWMEaa0_vvDWDeu87T2sm38";
const NOMBRE_TAB_F = "WoerterDesTages";
const ZONA_HOR_F   = "Europe/Berlin";

// ============================================================
// doGet — Formulario web
// ============================================================

function doGet(e) {
  const template = HtmlService.createHtmlOutput(paginaHTML());
  template.setTitle("Wörter des Tages");
  template.addMetaTag("viewport", "width=device-width, initial-scale=1");
  return template;
}

// ============================================================
// doPost — Webhook Telegram
// ============================================================

function doPost(e) {
  try {
    const update   = JSON.parse(e.postData.contents);
    const updateId = String(update.update_id);

    // Deduplicación por update_id
    const props = PropertiesService.getScriptProperties();
    if (props.getProperty("last_update_id") === updateId) return okResponse();
    props.setProperty("last_update_id", updateId);

    const msg = update.message || update.edited_message;
    if (!msg || !msg.text) return okResponse();

    const chatId = msg.chat.id.toString();
    const texto  = msg.text.trim();

    if (texto.startsWith("/nueva"))            manejarNueva(chatId, texto);
    else if (texto.startsWith("/ver"))         manejarVer(chatId, texto);
    else if (texto.startsWith("/hoy"))         manejarHoy(chatId);
    else if (texto.startsWith("/dictionary"))  manejarDictionary(chatId, texto);
    else if (texto.startsWith("/intervalos"))  manejarIntervalos(chatId, texto);
    else if (texto.startsWith("/")) {
      responderTelegram(chatId,
        "🤖 Comandos disponibles:\n\n" +
        "/nueva <code>DD/MM/YYYY | p1 | p2 | p3 | idioma</code>\n" +
        "/ver <code>DD/MM/YYYY</code>\n" +
        "/hoy\n" +
        "/dictionary <code>[DD/MM/YYYY]</code>  — palabras sueltas guardadas ese día\n" +
        "/intervalos <code>30 14 7 3</code>  — cambia intervalos\n" +
        "/intervalos <code>reset</code>  — vuelve al default\n\n" +
        "También podés escribirme una palabra suelta (sin \"/\") y la guardo directo."
      );
    }
    else {
      // Texto libre -> se guarda rápido en el Inbox, sin tocar
      // WoerterDesTages (eso lo hace el trigger procesarInbox aparte)
      guardarEnInbox(chatId, texto);
      responderTelegram(chatId, `📥 <b>${texto}</b> guardada. Se escribe en la hoja en el próximo minuto.`);
    }
  } catch(err) {
    Logger.log("doPost error: " + err.message);
  }
  return okResponse();
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
    const actuales = obtenerIntervalosF();
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
      `Actuales: ${obtenerIntervalosF().map(d => `+${d}d`).join(" · ")}`
    );
    return;
  }

  // Parsear números separados por espacios o comas
  const nuevos = args.split(/[\s,]+/)
    .map(s => parseInt(s.trim()))
    .filter(n => !isNaN(n) && n > 0);

  if (nuevos.length === 0 || nuevos.length > 5) {
    responderTelegram(chatId, "⚠️ Enviá entre 1 y 5 números. Ej: <code>/intervalos 30 14 7</code>");
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

function obtenerIntervalosF() {
  const props    = PropertiesService.getScriptProperties();
  const guardado = props.getProperty("INTERVALOS");
  if (guardado) { try { return JSON.parse(guardado); } catch(e) {} }
  return [30, 14, 7, 3, 2]; // mismo default que SpacedRepetition.gs
}

// ============================================================
// Comando /nueva
// ============================================================

function manejarNueva(chatId, texto) {
  const sinComando = texto.replace(/^\/nueva\s*/i, "").trim();
  const partes     = sinComando.split("|").map(s => s.trim());

  if (partes.length < 5) {
    responderTelegram(chatId,
      "⚠️ Formato:\n<code>/nueva DD/MM/YYYY | p1 | p2 | p3 | idioma</code>\n\n" +
      "Ejemplo:\n<code>/nueva 25/06/2026 | absolvieren | hingehen | ertragen | de</code>"
    );
    return;
  }

  const datos = { fecha: partes[0], palabra1: partes[1], palabra2: partes[2], palabra3: partes[3], idioma: partes[4].toLowerCase() };

  if (!datos.fecha.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
    responderTelegram(chatId, "⚠️ Fecha inválida. Formato: <code>DD/MM/YYYY</code>"); return;
  }
  if (!["de","en"].includes(datos.idioma)) {
    responderTelegram(chatId, "⚠️ Idioma: <code>de</code> o <code>en</code>"); return;
  }

  const res      = guardarPalabras(datos);
  const bandera  = datos.idioma === "en" ? "🇬🇧" : "🇩🇪";

  responderTelegram(chatId, res.ok
    ? `${res.nueva ? "✅ Fila nueva" : "✏️ Actualizada"} · ${datos.fecha}\n\n` +
      `${bandera} <b>${datos.palabra1}</b>  ·  <b>${datos.palabra2}</b>  ·  <b>${datos.palabra3}</b>`
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

    const words = [datos.palabra1.trim(), datos.palabra2.trim(), datos.palabra3.trim()];

    if (fila === -1) {
      const nueva = hoja.getLastRow() + 1;
      hoja.getRange(nueva, 2).setValue(datos.fecha.trim());
      hoja.getRange(nueva, 3).setValue(words[0]);
      hoja.getRange(nueva, 4).setValue(words[1]);
      hoja.getRange(nueva, 5).setValue(words[2]);
      hoja.getRange(nueva, 6).setValue(datos.idioma);
      return { ok: true, mensaje: "Fila nueva.", nueva: true };
    } else {
      hoja.getRange(fila, 3).setValue(words[0]);
      hoja.getRange(fila, 4).setValue(words[1]);
      hoja.getRange(fila, 5).setValue(words[2]);
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

// ============================================================
// Formulario HTML
// ============================================================

function paginaHTML() {
  const hoy = Utilities.formatDate(new Date(), ZONA_HOR_F, "dd/MM/yyyy");
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Wörter des Tages</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f0f0f7; min-height: 100vh; padding: 0 0 40px; }
    .header { background: linear-gradient(135deg, #4f46e5, #7c3aed); padding: 28px 20px 24px; text-align: center; color: white; }
    .header h1 { font-size: 22px; font-weight: 700; margin-top: 6px; }
    .header p  { font-size: 13px; opacity: 0.8; margin-top: 4px; }
    .card { background: white; border-radius: 14px; margin: 20px 16px 0; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #888; margin-bottom: 12px; }
    label { display: block; font-size: 13px; font-weight: 600; color: #444; margin-bottom: 5px; margin-top: 14px; }
    label:first-of-type { margin-top: 0; }
    input[type="text"] { width: 100%; padding: 12px 14px; border: 1.5px solid #e0e0e8; border-radius: 10px; font-size: 16px; color: #1a1a2e; outline: none; transition: border-color 0.2s; background: #fafafa; }
    input:focus { border-color: #4f46e5; background: white; }
    .idioma-group { display: flex; gap: 10px; margin-top: 4px; }
    .idioma-btn { flex: 1; padding: 12px; border: 2px solid #e0e0e8; border-radius: 10px; background: white; font-size: 15px; font-weight: 600; color: #666; cursor: pointer; text-align: center; transition: all 0.15s; }
    .idioma-btn.selected { border-color: #4f46e5; background: #f0f0ff; color: #4f46e5; }
    .btn-submit { width: calc(100% - 32px); margin: 20px 16px 0; padding: 16px; background: linear-gradient(135deg, #4f46e5, #7c3aed); color: white; border: none; border-radius: 14px; font-size: 17px; font-weight: 700; cursor: pointer; box-shadow: 0 4px 12px rgba(79,70,229,0.35); }
    .btn-submit:disabled { opacity: 0.6; cursor: not-allowed; }
    .toast { display: none; margin: 16px 16px 0; padding: 14px 18px; border-radius: 12px; font-size: 14px; font-weight: 600; text-align: center; }
    .toast.ok    { background: #d1fae5; color: #065f46; display: block; }
    .toast.error { background: #fee2e2; color: #991b1b; display: block; }
    .spinner { display: none; text-align: center; padding: 10px; color: #888; font-size: 14px; }
  </style>
</head>
<body>
  <div class="header"><div style="font-size:32px;">🇩🇪</div><h1>Wörter des Tages</h1><p>Ingresá las palabras del día</p></div>
  <div class="card">
    <div class="section-title">📅 Fecha</div>
    <label for="fecha">DD/MM/YYYY</label>
    <input type="text" id="fecha" placeholder="ej: 25/06/2026" value="${hoy}" maxlength="10">
  </div>
  <div class="card">
    <div class="section-title">📝 Palabras</div>
    <label for="p1">Palabra 1 (col C)</label>
    <input type="text" id="p1" placeholder="ej: absolvieren" autocomplete="off">
    <label for="p2">Palabra 2 (col D)</label>
    <input type="text" id="p2" placeholder="ej: hingehen" autocomplete="off">
    <label for="p3">Palabra 3 (col E)</label>
    <input type="text" id="p3" placeholder="ej: ertragen" autocomplete="off">
  </div>
  <div class="card">
    <div class="section-title">🌐 Idioma (col F)</div>
    <div class="idioma-group">
      <div class="idioma-btn selected" id="btn-de" onclick="seleccionarIdioma('de')">🇩🇪 Alemán</div>
      <div class="idioma-btn" id="btn-en" onclick="seleccionarIdioma('en')">🇬🇧 Inglés</div>
    </div>
  </div>
  <div class="toast" id="toast"></div>
  <div class="spinner" id="spinner">Guardando... ⏳</div>
  <button class="btn-submit" id="btnGuardar" onclick="guardar()">Guardar palabras</button>
<script>
  let idiomaSeleccionado = 'de';
  function seleccionarIdioma(i) {
    idiomaSeleccionado = i;
    document.getElementById('btn-de').classList.toggle('selected', i==='de');
    document.getElementById('btn-en').classList.toggle('selected', i==='en');
  }
  function mostrarToast(msg, tipo) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.className = 'toast ' + tipo;
    t.scrollIntoView({ behavior: 'smooth' });
  }
  function guardar() {
    const fecha=document.getElementById('fecha').value.trim();
    const p1=document.getElementById('p1').value.trim();
    const p2=document.getElementById('p2').value.trim();
    const p3=document.getElementById('p3').value.trim();
    if (!fecha.match(/^\\d{2}\\/\\d{2}\\/\\d{4}$/)) { mostrarToast('⚠️ Fecha: DD/MM/YYYY','error'); return; }
    if (!p1||!p2||!p3) { mostrarToast('⚠️ Completá las 3 palabras.','error'); return; }
    const btn=document.getElementById('btnGuardar'); btn.disabled=true;
    document.getElementById('spinner').style.display='block';
    document.getElementById('toast').className='toast';
    google.script.run
      .withSuccessHandler(function(res){
        document.getElementById('spinner').style.display='none'; btn.disabled=false;
        if(res.ok){ mostrarToast(res.mensaje,'ok'); document.getElementById('p1').value=''; document.getElementById('p2').value=''; document.getElementById('p3').value=''; }
        else mostrarToast(res.mensaje,'error');
      })
      .withFailureHandler(function(err){ document.getElementById('spinner').style.display='none'; btn.disabled=false; mostrarToast('❌ '+err.message,'error'); })
      .guardarPalabras({fecha,palabra1:p1,palabra2:p2,palabra3:p3,idioma:idiomaSeleccionado});
  }
</script>
</body>
</html>`;
}