// ============================================================
// WOERTER DES TAGES — Spaced Repetition + Pegar Frases
// ============================================================
// ID_HOJA, NOMBRE_TAB, ZONA_HORARIA, enviarTelegram y parsearFecha
// están definidos en Telegram.gs (compartidos entre ambos archivos).
// ============================================================

const EMAIL_DESTINO = "dr.mayorga20@gmail.com";

// INTERVALOS_DIAS / INTERVALOS_MESES — se pueden sobreescribir desde
// Telegram con /intervalos dias ... y /intervalos meses ...
// Si hay un valor guardado en PropertiesService, ese tiene prioridad.
// Para resetear al valor de acá, usá /intervalos dias reset (o meses reset).
const INTERVALOS_DIAS_DEFAULT  = [15, 7, 5];
const INTERVALOS_MESES_DEFAULT = [8, 7, 6, 1];
const HORAS_TRIGGER_REPASO = [9, 11, 13, 15, 17, 19, 21];

function obtenerIntervalosDias() {
  const props = PropertiesService.getScriptProperties();
  const guardado = props.getProperty("INTERVALOS_DIAS");
  if (guardado) {
    try { return JSON.parse(guardado); } catch(e) {}
  }
  return INTERVALOS_DIAS_DEFAULT;
}

function guardarIntervalosDias(arr) {
  PropertiesService.getScriptProperties().setProperty("INTERVALOS_DIAS", JSON.stringify(arr));
}

function obtenerIntervalosMeses() {
  const props = PropertiesService.getScriptProperties();
  const guardado = props.getProperty("INTERVALOS_MESES");
  if (guardado) {
    try { return JSON.parse(guardado); } catch(e) {}
  }
  return INTERVALOS_MESES_DEFAULT;
}

function guardarIntervalosMeses(arr) {
  PropertiesService.getScriptProperties().setProperty("INTERVALOS_MESES", JSON.stringify(arr));
}

// Lista combinada de activadores del día: primero meses, luego días.
// Cada entrada es { tipo: "meses"|"dias", valor: n }.
function obtenerActivadoresDelDia() {
  return [
    ...obtenerIntervalosMeses().map(valor => ({ tipo: "meses", valor })),
    ...obtenerIntervalosDias().map(valor => ({ tipo: "dias", valor })),
  ];
}

// --- Contador diario -----------------------------------------

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
  const props = PropertiesService.getScriptProperties();
  const hoy   = Utilities.formatDate(new Date(), ZONA_HORARIA, "yyyy-MM-dd");
  Logger.log(`Disparos hoy (${hoy}): ${props.getProperty(`disparos_${hoy}`) || "0"}`);
}

// --- Utilidades ----------------------------------------------

function etiquetaDias(activador, fechaOrigen, esUltimo) {
  const sufijo = esUltimo ? " ✅" : "";

  // Formato: "Lun 23 Jun (+3d)" o "Lun 23 Mar (+6m)"
  const diasSemana = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const diaSem     = diasSemana[fechaOrigen.getDay()];
  const diaMes     = fechaOrigen.getDate().toString().padStart(2, "0");
  const mesCorto   = fechaOrigen.toLocaleString('de-DE', { month: 'short' });
  const sufijoTipo = activador.tipo === "meses" ? "m" : "d";

  return `${diaSem} ${diaMes}-${mesCorto} (+${activador.valor}${sufijoTipo})${sufijo}`;
}

function tieneFrase(celda) {
  const val = (celda || "").toString().trim();
  if (!val || val === "-" || val === "–" || val === "...") return false;
  if (val.endsWith("...")) return false;
  return true;
}

// --- Telegram --------------------------------------------------

function enviarTelegram(mensaje) {
  const props  = PropertiesService.getScriptProperties();
  const token  = props.getProperty("TELEGRAM_TOKEN");
  const chatId = props.getProperty("TELEGRAM_CHAT_ID");
  if (!token || !chatId) { Logger.log("⚠️ Faltan credenciales Telegram."); return false; }

  try {
    const resp = UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "post", contentType: "application/json",
      payload: JSON.stringify({ chat_id: chatId, text: mensaje, parse_mode: "HTML" }),
      muteHttpExceptions: true,
    });
    const res = JSON.parse(resp.getContentText());
    if (!res.ok) { Logger.log("❌ Telegram: " + JSON.stringify(res)); return false; }
    return res.result.message_id;
  } catch(e) { Logger.log("❌ " + e.message); return false; }
}

// --- Mapeo message_id → celda (para reacciones de Telegram) --

const TTL_MAPEO_REACCION_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

function guardarMapeoReaccion(messageId, fila, col, orig) {
  const props = PropertiesService.getScriptProperties();
  props.setProperty(`react_${messageId}`, JSON.stringify({
    fila, col, orig, ts: Date.now(),
  }));
}

function obtenerMapeoReaccion(messageId) {
  const props = PropertiesService.getScriptProperties();
  const clave = `react_${messageId}`;
  const guardado = props.getProperty(clave);
  if (!guardado) return null;

  let datos;
  try { datos = JSON.parse(guardado); } catch(e) { props.deleteProperty(clave); return null; }

  if (Date.now() - datos.ts > TTL_MAPEO_REACCION_MS) {
    props.deleteProperty(clave);
    return null;
  }
  return datos;
}

// --- Lógica principal ----------------------------------------

function restarMeses(fecha, n) {
  const f = new Date(fecha);
  f.setHours(0,0,0,0);
  const diaOriginal = f.getDate();
  f.setMonth(f.getMonth() - n);
  // Si el mes destino no tiene ese día (ej. 31 → Feb), setMonth lo
  // desborda al mes siguiente; lo corregimos al último día del mes destino.
  if (f.getDate() !== diaOriginal) f.setDate(0);
  return f;
}

function obtenerPalabras(fechaRef, dias, fechaExacta) {
  const hoy  = new Date(fechaRef); hoy.setHours(0,0,0,0);
  const ss   = SpreadsheetApp.openById(ID_HOJA);
  const hoja = ss.getSheetByName(NOMBRE_TAB);
  const data = hoja.getDataRange().getValues();

  const palabrasDE = [];
  const palabrasEN = [];

  for (let i = 0; i < data.length; i++) {
    const fila           = data[i];
    const fechaAnotacion = parsearFecha(fila[1]);
    if (!fechaAnotacion) continue;

    if (fechaExacta) {
      if (fechaAnotacion.getTime() !== fechaExacta.getTime()) continue;
    } else {
      const diffDias = Math.round(
        (hoy.getTime() - fechaAnotacion.getTime()) / (1000*60*60*24)
      );
      if (diffDias !== dias) continue;
    }

    const esIngles = (fila[5]||"").toString().trim().toLowerCase() === "en";

    const pares = [
      { orig: fila[2], trad: fila[6],  frase: fila[10], col: 3 },
      { orig: fila[3], trad: fila[7],  frase: fila[11], col: 4 },
      { orig: fila[4], trad: fila[8],  frase: fila[12], col: 5 },
    ];

    for (const par of pares) {
      const orig  = (par.orig  || "").toString().trim();
      const trad  = (par.trad  || "").toString().trim();
      const frase = (par.frase || "").toString().trim();
      if (!orig || orig === "-" || orig === "–") continue;
      if (!trad || trad === "-" || trad === "–") continue;

      const spoiler = tieneFrase(frase) ? frase : trad;
      (esIngles ? palabrasEN : palabrasDE).push({
        orig, spoiler, fecha: fechaAnotacion, fila: i + 1, col: par.col,
      });
    }
  }

  return { palabrasDE, palabrasEN };
}

function enviarRecordatorioHoy() {
  const activadores = obtenerActivadoresDelDia();
  const posicion     = obtenerIndiceDeHoy();
  const activador     = activadores[posicion];

  if (activador === undefined) {
    Logger.log(`ℹ️ Disparo #${posicion+1} ignorado — solo hay ${activadores.length} activadores.`);
    return;
  }

  const etiquetaActivador = `+${activador.valor}${activador.tipo === "meses" ? "m" : "d"}`;
  Logger.log(`Disparo #${posicion+1} → ${etiquetaActivador}`);

  const hoy = new Date();
  const { palabrasDE, palabrasEN } = activador.tipo === "meses"
    ? obtenerPalabras(hoy, null, restarMeses(hoy, activador.valor))
    : obtenerPalabras(hoy, activador.valor);

  const todas = [
    ...palabrasDE.map(p => ({ ...p, bandera: "🇩🇪" })),
    ...palabrasEN.map(p => ({ ...p, bandera: "🇬🇧" })),
  ];

  if (todas.length === 0) { Logger.log(`No hay palabras para ${etiquetaActivador} hoy.`); return; }

  const correoNum  = posicion + 1;
  const totalAct   = activadores.length;
  const fechaOrig  = todas[0].fecha;
  const esUltimo   = posicion === activadores.length - 1;
  const etiqueta   = etiquetaDias(activador, fechaOrig, esUltimo);

  // Mensaje 1 — Header
  enviarTelegram(
    `🧠 <b>Repaso ${correoNum}/${totalAct}</b>\n` +
    `📅 ${etiqueta}\n`
  );

  // Mensajes 2, 3, 4 — una palabra por mensaje
  for (const p of todas) {
    const messageId = enviarTelegram(
      `${p.bandera} <b>${p.orig}</b>\n<tg-spoiler>${p.spoiler}</tg-spoiler>`
    );
    if (messageId) guardarMapeoReaccion(messageId, p.fila, p.col, p.orig);
  }

  Logger.log(`Enviados: 1 header + ${todas.length} palabras (${etiquetaActivador})`);
}

// --- Triggers de repaso — uno por cada posición de la lista combinada
// (obtenerActivadoresDelDia: meses primero, luego días) --------

// Horas de disparo (una por activador, en orden). enviarRecordatorioHoy()
// sigue usando su contador secuencial de disparos del día
// (obtenerIndiceDeHoy) para saber qué posición de la lista le toca —
// estos triggers solo fijan A QUÉ HORA se dispara cada llamada.

function crearTriggersRepaso() {
  const existentes = ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === "enviarRecordatorioHoy");

  if (existentes.length > 0) {
    Logger.log(`Ya existen ${existentes.length} trigger(s) de enviarRecordatorioHoy, no se crean más. Borralos a mano si querés recrearlos.`);
    return;
  }

  HORAS_TRIGGER_REPASO.forEach(hora => {
    ScriptApp.newTrigger("enviarRecordatorioHoy")
      .timeBased()
      .atHour(hora)
      .nearMinute(23)
      .everyDays(1)
      .inTimezone(ZONA_HORARIA)
      .create();
  });

  Logger.log(`Triggers creados: ${HORAS_TRIGGER_REPASO.length} disparos de enviarRecordatorioHoy a las horas ${HORAS_TRIGGER_REPASO.join(", ")}.`);
}

// --- Recordatorio diario para agregar palabras nuevas ---------

function enviarRecordatorioAgregarPalabras() {
  enviarTelegram(
    `📝 <b>¿Palabras nuevas hoy?</b>\n` +
    `Mandalas con:\n<code>/nueva DD/MM, idioma, p1, p2, p3</code>\n` +
    `Ejemplo:\n<code>/nueva 25/06, de, absolvieren, hingehen, ertragen</code>`
  );
}

function crearTriggerRecordatorioPalabras() {
  const yaExiste = ScriptApp.getProjectTriggers()
    .some(t => t.getHandlerFunction() === "enviarRecordatorioAgregarPalabras");

  if (yaExiste) {
    Logger.log("El trigger de recordatorio de palabras ya existe, no se crea otro.");
    return;
  }
  ScriptApp.newTrigger("enviarRecordatorioAgregarPalabras")
    .timeBased()
    .atHour(23)
    .nearMinute(30)
    .everyDays(1)
    .inTimezone(ZONA_HORARIA)
    .create();
  Logger.log("Trigger creado: recordatorio de palabras nuevas a las 23:30.");
}

// --- Pruebas -------------------------------------------------

function probarTelegram() {
  enviarTelegram("✅ Conexión con Wörter des Tages funcionando correctamente.");
}

function probarSimulacion() {
  // ↓↓ EDITÁ ESTOS DOS VALORES ↓↓
  const fechaSimulada = new Date("2026-06-27");
  const posicionSim   = 4;
  // ↑↑ ————————————————————————— ↑↑

  const activadores = obtenerActivadoresDelDia();
  const activador = activadores[posicionSim];
  if (activador === undefined) { Logger.log("Posición inválida."); return; }

  fechaSimulada.setHours(0,0,0,0);
  const etiquetaActivador = `+${activador.valor}${activador.tipo === "meses" ? "m" : "d"}`;
  Logger.log(`=== SIMULACIÓN: ${fechaSimulada.toDateString()} · ${etiquetaActivador} ===`);

  const { palabrasDE, palabrasEN } = activador.tipo === "meses"
    ? obtenerPalabras(fechaSimulada, null, restarMeses(fechaSimulada, activador.valor))
    : obtenerPalabras(fechaSimulada, activador.valor);
  const todas = [
    ...palabrasDE.map(p => ({ ...p, bandera: "🇩🇪" })),
    ...palabrasEN.map(p => ({ ...p, bandera: "🇬🇧" })),
  ];

  todas.forEach(p => Logger.log(`  ${p.bandera} ${p.orig} → ${p.spoiler}`));
  Logger.log(`Total: ${todas.length}`);

  if (todas.length === 0) { Logger.log("Sin palabras."); return; }

  const esUltimo = posicionSim === activadores.length - 1;
  const etiqueta = etiquetaDias(activador, todas[0].fecha, esUltimo);

  // Header con tag [SIMULACIÓN]
  enviarTelegram(
    `🧪 <b>[SIMULACIÓN] ${posicionSim+1}/${activadores.length}</b>\n` +
    `📅 ${etiqueta}\n`
  );

  for (const p of todas) {
    enviarTelegram(
      `${p.bandera} <b>${p.orig}</b>\n<tg-spoiler>${p.spoiler}</tg-spoiler>`
    );
  }
}

// ============================================================
// PEGAR FRASES — función reutilizable
// ============================================================
// Solo escribe en una celda si está vacía, tiene "..." o termina en
// "...". No sobreescribe frases reales ya existentes.
// ============================================================

function necesitaFrase(celda) {
  // Devuelve true si la celda NO tiene aún una frase real
  const val = (celda || "").toString().trim();
  if (!val || val === "-" || val === "–" || val === "...") return true;
  if (val.endsWith("...")) return true;
  return false;
}

function pegarFrasesParametrizado(payload) {
  if (!payload || !payload.frases || payload.frases.length === 0) {
    Logger.log("⚠️ payload vacío o sin frases.");
    return { ok: false, mensaje: "payload vacío." };
  }

  const idioma = payload.idioma || "?";
  Logger.log(`=== pegarFrasesParametrizado · idioma: ${idioma} · ${payload.frases.length} entradas ===`);

  const ss   = SpreadsheetApp.openById(ID_HOJA);
  const hoja = ss.getSheetByName(NOMBRE_TAB);
  const data = hoja.getDataRange().getValues();

  // Índice fecha → fila base 1
  const indiceFechas = {};
  for (let i = 0; i < data.length; i++) {
    const f = normalizarFecha(data[i][1]);
    if (f) indiceFechas[f] = i + 1;
  }

  const resultado = { ok: true, actualizadas: [], omitidas: [], noEncontradas: [], errores: [] };

  for (const entrada of payload.frases) {
    if (!entrada.fecha) { resultado.errores.push("Sin fecha."); continue; }

    const fechaNorm = normalizarFechaStr(entrada.fecha);
    const fila      = indiceFechas[fechaNorm];

    if (!fila) {
      Logger.log(`⚠️ No encontrada: ${entrada.fecha}`);
      resultado.noEncontradas.push(entrada.fecha);
      continue;
    }

    const filaData = data[fila - 1]; // datos actuales de esa fila
    let cambios = 0;

    // Col K (índice 10) — solo escribe si necesita frase
    if (entrada.k && entrada.k.trim()) {
      if (necesitaFrase(filaData[10])) {
        hoja.getRange(fila, 11).setValue(entrada.k.trim());
        cambios++;
      } else {
        Logger.log(`  ⏭️ ${entrada.fecha} K ya tiene frase — omitido.`);
        resultado.omitidas.push(`${entrada.fecha}:K`);
      }
    }

    // Col L (índice 11)
    if (entrada.l && entrada.l.trim()) {
      if (necesitaFrase(filaData[11])) {
        hoja.getRange(fila, 12).setValue(entrada.l.trim());
        cambios++;
      } else {
        Logger.log(`  ⏭️ ${entrada.fecha} L ya tiene frase — omitido.`);
        resultado.omitidas.push(`${entrada.fecha}:L`);
      }
    }

    // Col M (índice 12)
    if (entrada.m && entrada.m.trim()) {
      if (necesitaFrase(filaData[12])) {
        hoja.getRange(fila, 13).setValue(entrada.m.trim());
        cambios++;
      } else {
        Logger.log(`  ⏭️ ${entrada.fecha} M ya tiene frase — omitido.`);
        resultado.omitidas.push(`${entrada.fecha}:M`);
      }
    }

    if (cambios > 0) {
      Logger.log(`✅ ${entrada.fecha} (fila ${fila}) — ${cambios} celda(s) escritas.`);
      resultado.actualizadas.push(entrada.fecha);
    }
  }

  Logger.log(`\nResumen: ${resultado.actualizadas.length} filas actualizadas, ${resultado.omitidas.length} celdas omitidas (ya tenían frase).`);
  return resultado;
}

function normalizarFecha(celda) {
  if (!celda) return null;
  if (celda instanceof Date) {
    if (isNaN(celda.getTime())) return null;
    const d = celda.getDate().toString().padStart(2, "0");
    const m = (celda.getMonth() + 1).toString().padStart(2, "0");
    return `${d}/${m}/${celda.getFullYear()}`;
  }
  const str = celda.toString().trim();
  if (str.match(/^\d{2}\/\d{2}\/\d{4}$/)) return str;
  return null;
}

function normalizarFechaStr(str) {
  str = str.trim();
  if (str.match(/^\d{2}\/\d{2}\/\d{4}$/)) return str;
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return str;
}

// ============================================================
// Fecha — parseo compartido con Telegram.gs
// ============================================================

function parsearFecha(celda) {
  if (!celda) return null;
  if (celda instanceof Date) {
    if (isNaN(celda.getTime())) return null;
    const d = new Date(celda); d.setHours(0,0,0,0); return d;
  }
  const str   = celda.toString().trim();
  const match = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) {
    const d = new Date(parseInt(match[3]), parseInt(match[2])-1, parseInt(match[1]));
    d.setHours(0,0,0,0); return d;
  }
  return null;
}

// function pegarFrasesSeptiembre() {
//   const payload = {
//     idioma: "de/en",
//     // frases
//   };
//   pegarFrasesParametrizado(payload);
// }