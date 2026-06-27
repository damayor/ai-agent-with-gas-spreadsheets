// ============================================================
// WOERTER DES TAGES — Formulario web + Telegram Webhook
// ============================================================
// Archivo: Formulario.gs
//
// Funciones:
//   doGet()  → página web mobile-friendly para ingresar palabras
//   doPost() → webhook de Telegram para comandos /nueva /ver /hoy
//
// Comandos Telegram:
//   /nueva 25/06/2026 | absolvieren | hingehen | ertragen | de
//   /ver 25/06/2026
//   /hoy
//
// PASOS PARA ACTIVAR (ver abajo en comentarios)
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
// doPost — Webhook de Telegram
// ============================================================

function doPost(e) {
  try {
    const update = JSON.parse(e.postData.contents);
    const msg    = update.message || update.edited_message;
    if (!msg || !msg.text) return okResponse();

    const chatId = msg.chat.id.toString();
    const texto  = msg.text.trim();

    if (texto.startsWith("/nueva")) {
      manejarNueva(chatId, texto);
    } else if (texto.startsWith("/ver")) {
      manejarVer(chatId, texto);
    } else if (texto.startsWith("/hoy")) {
      manejarHoy(chatId);
    } else {
      responderTelegram(chatId,
        "🤖 Comandos disponibles:\n\n" +
        "/nueva <code>DD/MM/YYYY | p1 | p2 | p3 | idioma</code>\n" +
        "/ver <code>DD/MM/YYYY</code>\n" +
        "/hoy"
      );
    }
  } catch (err) {
    Logger.log("doPost error: " + err.message);
  }
  return okResponse();
}

function okResponse() {
  return ContentService.createTextOutput("OK");
}

// ============================================================
// Comandos
// ============================================================

function manejarNueva(chatId, texto) {
  // Formato: /nueva 25/06/2026 | absolvieren | hingehen | ertragen | de
  const sinComando = texto.replace(/^\/nueva\s*/i, "").trim();
  const partes     = sinComando.split("|").map(s => s.trim());

  if (partes.length < 5) {
    responderTelegram(chatId,
      "⚠️ Formato incorrecto. Usá:\n\n" +
      "<code>/nueva DD/MM/YYYY | palabra1 | palabra2 | palabra3 | idioma</code>\n\n" +
      "Ejemplo:\n" +
      "<code>/nueva 25/06/2026 | absolvieren | hingehen | ertragen | de</code>"
    );
    return;
  }

  const datos = {
    fecha:    partes[0],
    palabra1: partes[1],
    palabra2: partes[2],
    palabra3: partes[3],
    idioma:   partes[4].toLowerCase(),
  };

  if (!datos.fecha.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
    responderTelegram(chatId, "⚠️ Fecha inválida. Formato: <code>DD/MM/YYYY</code>");
    return;
  }
  if (!["de", "en"].includes(datos.idioma)) {
    responderTelegram(chatId, "⚠️ Idioma inválido. Usá <code>de</code> para alemán o <code>en</code> para inglés.");
    return;
  }

  const res = guardarPalabras(datos);
  const bandera = datos.idioma === "en" ? "🇬🇧" : "🇩🇪";

  if (res.ok) {
    responderTelegram(chatId,
      `${res.nueva ? "✅ Fila nueva creada" : "✏️ Fila actualizada"} · ${datos.fecha}\n\n` +
      `${bandera} <b>${datos.palabra1}</b>  ·  <b>${datos.palabra2}</b>  ·  <b>${datos.palabra3}</b>\n\n` +
      `<i>Se recordarán según los intervalos configurados.</i>`
    );
  } else {
    responderTelegram(chatId, `❌ ${res.mensaje}`);
  }
}

//ToTest
function manejarVer(chatId, texto) {
  // Formato: /ver 25/06/2026
  const fecha = texto.replace(/^\/ver\s*/i, "").trim();

  if (!fecha.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
    responderTelegram(chatId, "⚠️ Formato: <code>/ver DD/MM/YYYY</code>");
    return;
  }

  const fila = buscarFilaPorFecha(fecha);
  if (!fila) {
    responderTelegram(chatId, `📭 No hay palabras registradas para el <b>${fecha}</b>.`);
    return;
  }

  const idioma  = (fila[5] || "").toString().trim().toLowerCase();
  const bandera = idioma === "en" ? "🇬🇧" : "🇩🇪";
  const p1 = (fila[2] || "—").toString().trim();
  const p2 = (fila[3] || "—").toString().trim();
  const p3 = (fila[4] || "—").toString().trim();
  const t1 = (fila[6] || "—").toString().trim();
  const t2 = (fila[7] || "—").toString().trim();
  const t3 = (fila[8] || "—").toString().trim();

  responderTelegram(chatId,
    `📅 <b>${fecha}</b> ${bandera}\n\n` +
    `• <b>${p1}</b>  →  <tg-spoiler>${t1}</tg-spoiler>\n` +
    `• <b>${p2}</b>  →  <tg-spoiler>${t2}</tg-spoiler>\n` +
    `• <b>${p3}</b>  →  <tg-spoiler>${t3}</tg-spoiler>`
  );
}

function manejarHoy(chatId) {
  const hoy = Utilities.formatDate(new Date(), ZONA_HOR_F, "dd/MM/yyyy");
  manejarVer(chatId, "/ver " + hoy);
}

// ============================================================
// Helpers de Sheet
// ============================================================

function parsearFechaF(celda) {
  if (!celda) return null;
  if (celda instanceof Date) {
    if (isNaN(celda.getTime())) return null;
    const d = new Date(celda);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  const p = celda.toString().trim().split("/");
  if (p.length !== 3) return null;
  const d = new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]));
  d.setHours(0, 0, 0, 0);
  return d;
}

function buscarFilaPorFecha(fechaStr) {
  const partes = fechaStr.split("/");
  const fechaBuscada = new Date(parseInt(partes[2]), parseInt(partes[1]) - 1, parseInt(partes[0]));
  fechaBuscada.setHours(0, 0, 0, 0);

  const ss   = SpreadsheetApp.openById(ID_HOJA_F);
  const hoja = ss.getSheetByName(NOMBRE_TAB_F);
  const data = hoja.getDataRange().getValues();

  for (let i = 0; i < data.length; i++) {
    const f = parsearFechaF(data[i][1]);
    if (f && f.getTime() === fechaBuscada.getTime()) return data[i];
  }
  return null;
}

function guardarPalabras(datos) {
  try {
    const partes = datos.fecha.trim().split("/");
    if (partes.length !== 3) throw new Error("Formato de fecha inválido.");

    const fechaBuscada = new Date(parseInt(partes[2]), parseInt(partes[1]) - 1, parseInt(partes[0]));
    fechaBuscada.setHours(0, 0, 0, 0);

    const ss   = SpreadsheetApp.openById(ID_HOJA_F);
    const hoja = ss.getSheetByName(NOMBRE_TAB_F);
    const data = hoja.getDataRange().getValues();

    let filaEncontrada = -1;
    for (let i = 0; i < data.length; i++) {
      const f = parsearFechaF(data[i][1]);
      if (f && f.getTime() === fechaBuscada.getTime()) {
        filaEncontrada = i + 1;
        break;
      }
    }

    const palabras = [datos.palabra1.trim(), datos.palabra2.trim(), datos.palabra3.trim()];

    if (filaEncontrada === -1) {
      const nueva = hoja.getLastRow() + 1;
      hoja.getRange(nueva, 2).setValue(datos.fecha.trim());
      hoja.getRange(nueva, 3).setValue(palabras[0]);
      hoja.getRange(nueva, 4).setValue(palabras[1]);
      hoja.getRange(nueva, 5).setValue(palabras[2]);
      hoja.getRange(nueva, 6).setValue(datos.idioma);
      return { ok: true, mensaje: `Fila nueva creada para el ${datos.fecha}.`, nueva: true };
    } else {
      hoja.getRange(filaEncontrada, 3).setValue(palabras[0]);
      hoja.getRange(filaEncontrada, 4).setValue(palabras[1]);
      hoja.getRange(filaEncontrada, 5).setValue(palabras[2]);
      hoja.getRange(filaEncontrada, 6).setValue(datos.idioma);
      return { ok: true, mensaje: `Fila ${filaEncontrada} actualizada.`, nueva: false };
    }
  } catch (err) {
    return { ok: false, mensaje: err.message };
  }
}

// ============================================================
// Telegram API
// ============================================================

function responderTelegram(chatId, texto) {
  const props  = PropertiesService.getScriptProperties();
  const token  = props.getProperty("TELEGRAM_TOKEN");
  if (!token) { Logger.log("Falta TELEGRAM_TOKEN"); return; }

  UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method:             "post",
    contentType:        "application/json",
    payload:            JSON.stringify({ chat_id: chatId, text: texto, parse_mode: "HTML" }),
    muteHttpExceptions: true,
  });
}

// ============================================================
// Registrar el webhook — ejecutar UNA SOLA VEZ después de
// publicar la aplicación web como nueva implementación.
// Reemplazá WEB_APP_URL con tu URL de implementación.
// ============================================================
function registrarWebhook() {
  const props  = PropertiesService.getScriptProperties();
  const token  = props.getProperty("TELEGRAM_TOKEN");
  const webAppUrl = "PEGA_AQUI_TU_URL_DE_IMPLEMENTACION";

  const resp = UrlFetchApp.fetch(
    `https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webAppUrl)}`,
    { muteHttpExceptions: true }
  );
  Logger.log(resp.getContentText());
}

// ============================================================
// Formulario web (doGet)
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
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #f0f0f7; min-height: 100vh; padding: 0 0 40px;
    }
    .header {
      background: linear-gradient(135deg, #4f46e5, #7c3aed);
      padding: 28px 20px 24px; text-align: center; color: white;
    }
    .header h1 { font-size: 22px; font-weight: 700; margin-top: 6px; }
    .header p  { font-size: 13px; opacity: 0.8; margin-top: 4px; }
    .card {
      background: white; border-radius: 14px;
      margin: 20px 16px 0; padding: 20px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    }
    .section-title {
      font-size: 11px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.8px; color: #888; margin-bottom: 12px;
    }
    label {
      display: block; font-size: 13px; font-weight: 600;
      color: #444; margin-bottom: 5px; margin-top: 14px;
    }
    label:first-of-type { margin-top: 0; }
    input[type="text"] {
      width: 100%; padding: 12px 14px; border: 1.5px solid #e0e0e8;
      border-radius: 10px; font-size: 16px; color: #1a1a2e;
      outline: none; transition: border-color 0.2s; background: #fafafa;
    }
    input:focus { border-color: #4f46e5; background: white; }
    .idioma-group { display: flex; gap: 10px; margin-top: 4px; }
    .idioma-btn {
      flex: 1; padding: 12px; border: 2px solid #e0e0e8;
      border-radius: 10px; background: white; font-size: 15px;
      font-weight: 600; color: #666; cursor: pointer; text-align: center;
      transition: all 0.15s;
    }
    .idioma-btn.selected { border-color: #4f46e5; background: #f0f0ff; color: #4f46e5; }
    .btn-submit {
      width: calc(100% - 32px); margin: 20px 16px 0; padding: 16px;
      background: linear-gradient(135deg, #4f46e5, #7c3aed); color: white;
      border: none; border-radius: 14px; font-size: 17px; font-weight: 700;
      cursor: pointer; box-shadow: 0 4px 12px rgba(79,70,229,0.35);
    }
    .btn-submit:disabled { opacity: 0.6; cursor: not-allowed; }
    .toast {
      display: none; margin: 16px 16px 0; padding: 14px 18px;
      border-radius: 12px; font-size: 14px; font-weight: 600; text-align: center;
    }
    .toast.ok    { background: #d1fae5; color: #065f46; display: block; }
    .toast.error { background: #fee2e2; color: #991b1b; display: block; }
    .spinner { display: none; text-align: center; padding: 10px; color: #888; font-size: 14px; }
  </style>
</head>
<body>
  <div class="header">
    <div style="font-size:32px;">🇩🇪</div>
    <h1>Wörter des Tages</h1>
    <p>Ingresá las palabras del día</p>
  </div>
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
  function seleccionarIdioma(idioma) {
    idiomaSeleccionado = idioma;
    document.getElementById('btn-de').classList.toggle('selected', idioma === 'de');
    document.getElementById('btn-en').classList.toggle('selected', idioma === 'en');
  }
  function mostrarToast(msg, tipo) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.className = 'toast ' + tipo;
    t.scrollIntoView({ behavior: 'smooth' });
  }
  function guardar() {
    const fecha    = document.getElementById('fecha').value.trim();
    const palabra1 = document.getElementById('p1').value.trim();
    const palabra2 = document.getElementById('p2').value.trim();
    const palabra3 = document.getElementById('p3').value.trim();
    if (!fecha.match(/^\\d{2}\\/\\d{2}\\/\\d{4}$/)) {
      mostrarToast('⚠️ La fecha debe tener el formato DD/MM/YYYY', 'error'); return;
    }
    if (!palabra1 || !palabra2 || !palabra3) {
      mostrarToast('⚠️ Completá las 3 palabras antes de guardar.', 'error'); return;
    }
    const btn = document.getElementById('btnGuardar');
    btn.disabled = true;
    document.getElementById('spinner').style.display = 'block';
    document.getElementById('toast').className = 'toast';
    google.script.run
      .withSuccessHandler(function(res) {
        document.getElementById('spinner').style.display = 'none';
        btn.disabled = false;
        if (res.ok) {
          mostrarToast(res.mensaje, 'ok');
          document.getElementById('p1').value = '';
          document.getElementById('p2').value = '';
          document.getElementById('p3').value = '';
        } else { mostrarToast(res.mensaje, 'error'); }
      })
      .withFailureHandler(function(err) {
        document.getElementById('spinner').style.display = 'none';
        btn.disabled = false;
        mostrarToast('❌ Error: ' + err.message, 'error');
      })
      .guardarPalabras({ fecha, palabra1, palabra2, palabra3, idioma: idiomaSeleccionado });
  }
</script>
</body>
</html>`;
}