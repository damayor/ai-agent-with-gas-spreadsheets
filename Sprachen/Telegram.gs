// ============================================================
// TELEGRAM — comandos, polling y ruteo del bot Wörter des Tages
// ============================================================
// Comandos Telegram (ver mensaje de ayuda completo más abajo, en el
// bloque "/" desconocido de procesarUpdateTelegram):
//   /nueva DD/MM, idioma, p1, p2, p3   (1 a 3 palabras, sin año)
//   /ver DD/MM/YYYY
//   /hoy
//   /intervalos            -> muestra intervalos actuales
//   /intervalos meses ...  / /intervalos dias ...  -> los cambia
//   /intervalos meses reset / /intervalos dias reset
//   /modo de input | de output | en input | en output
//   (texto libre, sin "/")  -> se guarda como palabra suelta en la
//   hoja (VHS_INPUT/VHS_OUTPUT/VKBLY INPUT/VKBLY OUTPUT) del modo activo,
//   en la columna activa (default B / "alle").
//   Segundo parámetro opcional separado por coma para cambiar la
//   columna activa (por prefijo, queda fijo hasta el próximo cambio):
//   texto, alle -> B | texto, b2 -> E | texto, erin(ner) -> I | texto, verin(nerlich) -> L
//
// Mecanismo de entrada vigente: pollTelegram() (más abajo), llamado
// por tick() cada 1 minuto. El viejo webhook (doPost) sufría un 302
// intermitente propio de GAS Web App respondiendo a callers no
// autenticados -> Telegram no seguía el redirect y los mensajes se
// acumulaban en pending_update_count. Detalle completo en context.md.
// Solución: Apps Script inicia la llamada hacia Telegram (getUpdates,
// autenticada con el bot token) en vez de esperar que Telegram le
// pegue a /exec.
// ============================================================

const ID_HOJA      = "1yYJzqZmJOvM6lMMXLdf_ZWMEaa0_vvDWDeu87T2sm38";
const NOMBRE_TAB   = "WoerterDesTages";
const ZONA_HORARIA = "Europe/Berlin";

// ============================================================
// Ruteo de comandos — llamado por pollTelegram()
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
      "🤖 <b>Comandos disponibles</b>\n\n" +
      "/nueva <code>DD/MM, idioma, p1, p2, p3</code>\n" +
      "  Registra 1 a 3 palabras (Wort, C/D/E) para esa fecha en la hoja principal.\n\n" +
      "/ver <code>DD/MM/YYYY</code>\n" +
      "  Muestra las palabras y traducciones (spoiler) de esa fecha.\n\n" +
      "/hoy\n" +
      "  Igual que /ver, pero con la fecha de hoy.\n\n" +
      "/intervalos\n" +
      "  Muestra los intervalos de repaso actuales (meses y días).\n" +
      "/intervalos <code>meses 8 7 6 1</code>\n" +
      "  Cambia los intervalos en meses (mismo día calendario, N meses atrás).\n" +
      "/intervalos <code>dias 15 7 5</code>\n" +
      "  Cambia los intervalos en días (N días atrás exactos).\n" +
      "/intervalos <code>meses reset</code> | <code>dias reset</code>\n" +
      "  Vuelve ese array al default.\n\n" +
      "/modo\n" +
      "  Muestra el modo activo (idioma + dirección), la hoja destino y la columna activa.\n" +
      "/modo <code>de input</code> | <code>de output</code> | <code>en input</code> | <code>en output</code>\n" +
      "  Define idioma y dirección del texto libre (sin \"/\") que mandes después.\n\n" +
      "Texto libre (sin \"/\")\n" +
      "  Se guarda en la columna activa (default B, \"alle\") de la hoja del modo activo.\n" +
      "  Segundo parámetro opcional separado por coma para cambiar la columna activa (por prefijo, queda fijo hasta el próximo cambio):\n" +
      "  <code>palabra, alle</code> (vuelve a B) · <code>palabra, b2</code> (a E) · <code>palabra, erin</code> (a I) · <code>palabra, verin</code> (a L)\n\n" +
      "<b>Reacciones sobre un recordatorio de repaso</b> (Repaso.gs las procesa):\n" +
      "❤️  — sabías la palabra de memoria, sin leer la frase. Wort y Satz quedan en verde.\n" +
      "👍 / 👌  — te acordaste leyendo la frase de contexto. Wort en amarillo, Satz en verde.\n" +
      "👎 / 🤔  — no la reconociste ni con la frase. Wort y Satz en amarillo, y te respondo con la traducción al español."
    );
  }
  else {
    // Texto libre -> se escribe en la columna activa (ver
    // CONFIG_COL_ACTIVA / PROP_COL_ACTIVA), próxima fila vacía, de la
    // hoja del modo activo (ver CONFIG_MODO_PALABRA). Columna activa
    // default: B (alle). Segundo parámetro opcional separado por coma
    // para cambiarla YA y de forma persistente: alle -> B, b2 -> E,
    // erin(ner) -> I, verin(nerlich) -> L.
    const partes = texto.split(",").map(s => s.trim());
    const palabra = partes[0];
    const cambioColActiva = partes[1];
    const res = guardarPalabraSuelta(palabra, cambioColActiva);
    responderTelegram(chatId, res.ok
      ? `📥 <b>${palabra}</b> en ${res.hoja} ${res.columna}${res.fila}.`
      : `❌ ${res.mensaje}`
    );
  }
}

// ============================================================
// Comando /intervalos
// ============================================================

function manejarIntervalos(chatId, texto) {
  const args = texto.replace(/^\/intervalos\s*/i, "").trim();

  if (!args) {
    const dias  = obtenerIntervalosDias();
    const meses = obtenerIntervalosMeses();
    responderTelegram(chatId,
      `📊 <b>Intervalos actuales</b>\n` +
      `Meses: ${meses.map(m => `+${m}m`).join(" · ")}\n` +
      `Días: ${dias.map(d => `+${d}d`).join(" · ")}\n\n` +
      `Orden de disparo: meses primero, luego días.\n\n` +
      `Para cambiar: <code>/intervalos dias 15 7 5</code>\n` +
      `             <code>/intervalos meses 8 7 6 1</code>\n` +
      `Para resetear: <code>/intervalos dias reset</code>\n` +
      `              <code>/intervalos meses reset</code>`
    );
    return;
  }

  const match = args.match(/^(dias|meses)\s*(.*)$/i);
  if (!match) {
    responderTelegram(chatId, "⚠️ Usá <code>/intervalos dias ...</code> o <code>/intervalos meses ...</code>");
    return;
  }
  const tipo = match[1].toLowerCase();
  const resto = match[2].trim();
  const esDias = tipo === "dias";
  const guardar   = esDias ? guardarIntervalosDias   : guardarIntervalosMeses;
  const obtener   = esDias ? obtenerIntervalosDias    : obtenerIntervalosMeses;
  const propKey   = esDias ? "INTERVALOS_DIAS" : "INTERVALOS_MESES";
  const sufijo    = esDias ? "d" : "m";

  if (resto.toLowerCase() === "reset") {
    PropertiesService.getScriptProperties().deleteProperty(propKey);
    responderTelegram(chatId,
      `↩️ Intervalos de ${tipo} reseteados al default.\n` +
      `Actuales: ${obtener().map(n => `+${n}${sufijo}`).join(" · ")}`
    );
    return;
  }

  // Parsear números separados por espacios o comas
  const nuevos = resto.split(/[\s,]+/)
    .map(s => parseInt(s.trim()))
    .filter(n => !isNaN(n) && n > 0);

  if (nuevos.length === 0 || nuevos.length > 7) {
    responderTelegram(chatId, `⚠️ Enviá entre 1 y 7 números. Ej: <code>/intervalos ${tipo} 30 14 7</code>`);
    return;
  }

  guardar(nuevos);

  responderTelegram(chatId,
    `✅ <b>Intervalos de ${tipo} actualizados:</b>\n` +
    nuevos.map((n, i) => `  ${i+1}. Activador → +${n}${sufijo}`).join("\n") + "\n\n" +
    `<i>El cambio aplica desde el próximo disparo automático.</i>`
  );
}

// ============================================================
// Comando /modo — idioma + dirección del texto libre
// ============================================================
// Formato: /modo <idioma> <direccion>  (ej. /modo en input, /modo de output)
// 4 combinaciones posibles: de-input, de-output, en-input, en-output.

const PROP_MODO_PALABRA = "MODO_PALABRA";

const ID_HOJA_EN = "1BGkECkcjR9TS4YwW-H_iTJeV6egqTcnGc0K2WWZLszk";

// modo ("de-input" etc.) -> { spreadsheetId, hoja }
const CONFIG_MODO_PALABRA = {
  "de-input":  { spreadsheetId: ID_HOJA,    hoja: "VHS_INPUT"    },
  "de-output": { spreadsheetId: ID_HOJA,    hoja: "VHS_OUTPUT"   },
  "en-input":  { spreadsheetId: ID_HOJA_EN, hoja: "VKBLY_INPUT"  },
  "en-output": { spreadsheetId: ID_HOJA_EN, hoja: "VKBLY_OUTPUT" },
};
const MODO_PALABRA_DEFAULT = "de-input";

function obtenerModoPalabra() {
  const props = PropertiesService.getScriptProperties();
  return props.getProperty(PROP_MODO_PALABRA) || MODO_PALABRA_DEFAULT;
}

function manejarModo(chatId, texto) {
  const arg = texto.replace(/^\/modo\s*/i, "").trim().toLowerCase();

  if (!arg) {
    const actual   = obtenerModoPalabra();
    const colActiva = obtenerColActiva();
    responderTelegram(chatId,
      `🔧 Modo actual: <b>${actual}</b> (hoja <b>${CONFIG_MODO_PALABRA[actual].hoja}</b>)\n` +
      `📌 Columna activa: <b>${colActiva.prefijo}</b> (columna <b>${colActiva.letra}</b>)\n\n` +
      `Para cambiar el modo: <code>/modo de input</code>, <code>/modo de output</code>, ` +
      `<code>/modo en input</code> o <code>/modo en output</code>\n` +
      `Para cambiar la columna activa: mandá <code>palabra, alle|b2|erin|verin</code>`
    );
    return;
  }

  const partes = arg.split(/\s+/);
  const idioma = partes[0];
  const direccion = partes[1];
  const modo = `${idioma}-${direccion}`;

  if (!CONFIG_MODO_PALABRA[modo]) {
    responderTelegram(chatId,
      "⚠️ Modo inválido. Usá <code>/modo de input</code>, <code>/modo de output</code>, " +
      "<code>/modo en input</code> o <code>/modo en output</code>"
    );
    return;
  }

  PropertiesService.getScriptProperties().setProperty(PROP_MODO_PALABRA, modo);
  responderTelegram(chatId, `✅ Modo cambiado a <b>${modo}</b>. El texto libre ahora se guarda en <b>${CONFIG_MODO_PALABRA[modo].hoja}</b>.`);
}

// ------------------------------------------------------------
// Guarda una palabra suelta en la columna activa (ver
// CONFIG_COL_ACTIVA/PROP_COL_ACTIVA) de la hoja del modo activo
// (VHS_INPUT/VHS_OUTPUT en alemán, VKBLY INPUT/OUTPUT en inglés).
// La hoja tiene huecos reales en esas columnas (no son continuas),
// así que buscar la primera celda vacía desde arriba encontraría
// huecos viejos en medio de los datos en vez del final real de la
// data. En cambio: la fila de destino es la siguiente a la última
// fila que tenga contenido en B, E, I o L (columnas con datos reales
// esparcidos — ver categorías "Alle die Worter"/"Wichtigste"/
// "Erinner Mall"/"verinerliche!").
//
// Optimización: en vez de escanear desde la fila 1 cada vez, se
// cachea en PropertiesService la última fila usada por hoja
// (PUNTERO_FILA_<nombre>) y se arranca la búsqueda desde ahí. Solo
// se recorre hacia adelante desde el puntero, no toda la hoja.
// ------------------------------------------------------------
const COLS_DATO_PALABRA = [2, 5, 9, 12]; // B, E, I, L

// Columna activa donde se guarda el texto libre ("interiorizar", al
// estilo /modo). Se fija mandando "palabra, <prefijo>" — el cambio
// aplica YA a esa palabra y queda persistente para los mensajes sin
// coma que vengan después. Match por prefijo (ej. "erin" alcanza
// para "erinner"). "alle" vuelve al comportamiento base: columna B
// (Alle die Wörter).
const PROP_COL_ACTIVA = "COL_ACTIVA_PALABRA";
const CONFIG_COL_ACTIVA = [
  { prefijo: "alle",  col: 2,  letra: "B" },
  { prefijo: "b2",    col: 5,  letra: "E" },
  { prefijo: "erin",  col: 9,  letra: "I" },
  { prefijo: "verin", col: 12, letra: "L" },
];
const COL_ACTIVA_DEFAULT = "alle";

// Cada columna de datos tiene su propio puntero de fila y su propia
// fecha de último acceso. Cuando cambia el día, se reinician todos.
const PROP_FECHA_ULTIMA = "FECHA_ULTIMA_";
const PROP_PUNTERO_COL = "PUNTERO_COL_";
const CONFIG_OFFSET_DIA_HORAS = 2;  // Día comienza a las 2 AM
const CONFIG_VALIDAR_PUNTERO_ATRAS = 10;  // Revisar máximo 10 filas hacia atrás

// DEBUG TEMPORAL: colorea el borde inferior de la última celda escrita en
// cada columna activa, para poder comparar visualmente si los punteros de
// las distintas columnas quedan alineados en la misma fila o no.
const DEBUG_COLOR_BORDE_POR_COL = {
  2:  "#691ae8", // alle -> azul
  12: "#a64d79", // verin -> violeta
  5:  "#e69138", // b2 -> naranja
  9:  "#38761d", // erin -> verde
};

// Recuerda la última celda marcada por hoja+columna para poder borrar
// su borde antes de marcar la nueva (si no, quedan bordes viejos
// duplicados en filas anteriores).
const PROP_DEBUG_ULTIMA_CELDA = "DEBUG_ULTIMA_CELDA_";

function marcarUltimaCeldaDebug(hoja, fila, col) {
  try {
    const props = PropertiesService.getScriptProperties();
    const clave = `${PROP_DEBUG_ULTIMA_CELDA}${hoja.getName()}_${col}`;
    const filaAnterior = parseInt(props.getProperty(clave) || "0");

    if (filaAnterior && filaAnterior !== fila) {
      hoja.getRange(filaAnterior, col).setBorder(
        null, null, false, null, null, null
      );
    }

    const color = DEBUG_COLOR_BORDE_POR_COL[col] || "#cc0000";
    hoja.getRange(fila, col).setBorder(
      null, null, true, null, null, null, color, SpreadsheetApp.BorderStyle.SOLID_THICK
    );
    props.setProperty(clave, String(fila));
  } catch (e) {
    // No romper el flujo principal si falla el formateo de debug.
    Logger.log(`marcarUltimaCeldaDebug: error en ${hoja.getName()} fila=${fila} col=${col}: ${e.message}`);
  }
}

// ------------------------------------------------------------
// Alineación de punteros al empezar un día nuevo (2 AM), por hoja.
// Recalcula, para las 4 columnas de datos (B/E/I/L), cuál es la
// última fila realmente escrita, alinea TODOS los punteros a
// "esa fila + 1" (la fila del día nuevo) y repinta el borde de
// cada columna en su última celda con contenido real (no en la
// fila nueva vacía). Así, aunque cada columna reciba su primera
// palabra del día en momentos distintos, el índice de fila ya
// queda fijado desde las 2 AM en vez de ir quedando desalineado
// palabra a palabra (ver guardarPalabraSuelta).
// ------------------------------------------------------------
function alinearNuevoDiaHoja(spreadsheetId, nombreHoja) {
  const ss   = SpreadsheetApp.openById(spreadsheetId);
  const hoja = ss.getSheetByName(nombreHoja);
  if (!hoja) throw new Error(`No existe la hoja ${nombreHoja}.`);

  const props   = PropertiesService.getScriptProperties();
  const maxRows = hoja.getMaxRows();

  const ahora = new Date();
  const ahoraConZona = new Date(ahora.toLocaleString('en-US', { timeZone: ZONA_HORARIA }));
  const horas = ahoraConZona.getHours();
  const diaAjustado = horas < CONFIG_OFFSET_DIA_HORAS ? new Date(ahoraConZona.getTime() - 24*60*60*1000) : ahoraConZona;
  const hoy = Utilities.formatDate(diaAjustado, "UTC", "yyyy-MM-dd");

  // Última fila con dato real, por columna, y el máximo absoluto entre
  // las 4 (header = fila 1).
  let maxFilaConDato = 1;
  const ultimaFilaPorCol = {};
  for (const col of CONFIG_COL_ACTIVA) {
    const valores = hoja.getRange(1, col.col, maxRows, 1).getValues();
    let ultima = 1;
    for (let i = valores.length - 1; i >= 0; i--) {
      if (valores[i][0].toString().trim()) { ultima = i + 1; break; }
    }
    ultimaFilaPorCol[col.col] = ultima;
    if (ultima > maxFilaConDato) maxFilaConDato = ultima;
  }

  const filaNueva = maxFilaConDato + 1;
  for (const col of CONFIG_COL_ACTIVA) {
    props.setProperty(`${PROP_PUNTERO_COL}${nombreHoja}_${col.col}`, String(filaNueva));
    props.setProperty(`${PROP_FECHA_ULTIMA}${nombreHoja}_${col.col}`, hoy);
    // Repintar el borde en la fila nueva común (el índice compartido de
    // hoy), no en la última celda con dato real de cada columna — así
    // las 4 quedan visualmente alineadas en la misma fila aunque sus
    // últimas palabras reales hayan quedado en filas distintas.
    marcarUltimaCeldaDebug(hoja, filaNueva, col.col);
  }

  // Única fuente de la fecha en A: se escribe acá, tanto si dispara el
  // trigger de las 2 AM como si dispara lazy desde guardarPalabraSuelta.
  const fechaDisplay = Utilities.formatDate(diaAjustado, "UTC", "EEE d");
  hoja.getRange(filaNueva, 1).setValue(fechaDisplay);

  Logger.log(`alinearNuevoDiaHoja: ${nombreHoja} -> filaNueva=${filaNueva} (${hoy})`);
  return { hoja: nombreHoja, filaNueva, hoy, ultimaFilaPorCol };
}

// Corre alinearNuevoDiaHoja para las 4 hojas de palabra suelta
// (VHS_INPUT/VHS_OUTPUT/VKBLY_INPUT/VKBLY_OUTPUT). Pensado para
// llamarse desde un trigger diario a las 2 AM.
function alinearNuevoDiaTodasHojas() {
  const vistos = new Set();
  Object.values(CONFIG_MODO_PALABRA).forEach(config => {
    const clave = `${config.spreadsheetId}_${config.hoja}`;
    if (vistos.has(clave)) return;
    vistos.add(clave);
    try {
      alinearNuevoDiaHoja(config.spreadsheetId, config.hoja);
    } catch (e) {
      Logger.log(`alinearNuevoDiaTodasHojas: error en ${config.hoja}: ${e.message}`);
    }
  });
}

// TESTEO: correr a mano desde el editor de Apps Script para probar
// con una sola hoja antes de habilitar el trigger diario.
function testAlinearNuevoDia() {
  const resultado = alinearNuevoDiaHoja(ID_HOJA, "VHS_INPUT");
  Logger.log(JSON.stringify(resultado, null, 2));
}

// Instalar el trigger diario — CORRER UNA SOLA VEZ A MANO, después
// de validar con testAlinearNuevoDia().
function crearTriggerAlinearNuevoDia() {
  const yaExiste = ScriptApp.getProjectTriggers()
    .some(function(t) { return t.getHandlerFunction() === "alinearNuevoDiaTodasHojas"; });

  if (yaExiste) {
    Logger.log("El trigger de alinearNuevoDiaTodasHojas ya existe, no se crea otro.");
    return;
  }
  ScriptApp.newTrigger("alinearNuevoDiaTodasHojas")
    .timeBased()
    .atHour(CONFIG_OFFSET_DIA_HORAS)
    .nearMinute(0)
    .everyDays(1)
    .inTimezone(ZONA_HORARIA)
    .create();
  Logger.log("Trigger creado: alinearNuevoDiaTodasHojas diario ~2 AM (Europe/Berlin).");
}

function obtenerColActiva() {
  const clave = PropertiesService.getScriptProperties().getProperty(PROP_COL_ACTIVA) || COL_ACTIVA_DEFAULT;
  return CONFIG_COL_ACTIVA.find(c => c.prefijo === clave) || CONFIG_COL_ACTIVA[0];
}

function guardarPalabraSuelta(texto, cambioColActiva) {
  try {
    let colInfo;
    if (cambioColActiva) {
      const clave = cambioColActiva.toLowerCase();
      const encontrada = CONFIG_COL_ACTIVA.find(c => clave.startsWith(c.prefijo));
      if (!encontrada) throw new Error(`Segundo parámetro inválido: "${cambioColActiva}". Usá alle, b2, erin(ner) o verin(nerlich).`);
      PropertiesService.getScriptProperties().setProperty(PROP_COL_ACTIVA, encontrada.prefijo);
      colInfo = encontrada;
    } else {
      colInfo = obtenerColActiva();
    }

    const modo   = obtenerModoPalabra();
    const config = CONFIG_MODO_PALABRA[modo];
    const nombre = config.hoja;

    const ss   = SpreadsheetApp.openById(config.spreadsheetId);
    const hoja = ss.getSheetByName(nombre);
    if (!hoja) throw new Error(`No existe la hoja ${nombre}.`);

    const props      = PropertiesService.getScriptProperties();

    // Calcular el "día" con offset configurable
    const ahora = new Date();
    const ahoraConZona = new Date(ahora.toLocaleString('en-US', { timeZone: ZONA_HORARIA }));
    const horas = ahoraConZona.getHours();
    // Si es antes del offset configurado, usar el día anterior
    const diaAjustado = horas < CONFIG_OFFSET_DIA_HORAS ? new Date(ahoraConZona.getTime() - 24*60*60*1000) : ahoraConZona;
    const hoy = Utilities.formatDate(diaAjustado, "UTC", "yyyy-MM-dd");

    // Puntero y fecha específicos por columna
    const propPunteroCol = `${PROP_PUNTERO_COL}${nombre}_${colInfo.col}`;
    const propFechaCol   = `${PROP_FECHA_ULTIMA}${nombre}_${colInfo.col}`;

    const maxRows = hoja.getMaxRows();

    // Si cambió el día, delegar la alineación de TODAS las columnas
    // activas (B/E/I/L) — punteros, fecha en A y bordes — a la misma
    // función que usa el trigger de las 2 AM (alinearNuevoDiaHoja), así
    // no hay dos lugares con lógica distinta para lo mismo. Esto es la
    // red de seguridad lazy por si el trigger diario no llegó a correr.
    const fechaUltima = props.getProperty(propFechaCol);
    const huboCambioDeDia = fechaUltima !== hoy;
    if (huboCambioDeDia) {
      alinearNuevoDiaHoja(config.spreadsheetId, nombre);
    }

    let desde = parseInt(props.getProperty(propPunteroCol) || "1");

    // Validar el puntero: revisar si realmente es el último o hay huecos
    // Mirar hacia atrás según CONFIG_VALIDAR_PUNTERO_ATRAS.
    // Se omite justo después de un cambio de día: el puntero recién quedó
    // alineado a una fila nueva y vacía, y mirar atrás metería datos del
    // día anterior.
    if (desde > 1 && !huboCambioDeDia) {
      const rango_check = Math.max(1, desde - CONFIG_VALIDAR_PUNTERO_ATRAS);
      const valores_check = hoja.getRange(rango_check, colInfo.col, desde - rango_check + 1, 1).getValues();
      let ultimo_encontrado = desde - 1;

      // Recorrer hacia atrás desde la posición del puntero
      for (let i = valores_check.length - 1; i >= 0; i--) {
        if (valores_check[i][0].toString().trim()) {
          ultimo_encontrado = rango_check + i;
          break;
        }
      }
      desde = ultimo_encontrado + 1;
    }

    // Buscar última fila con dato EN ESTA COLUMNA ESPECÍFICA desde el desde ajustado
    const filasARevisar = maxRows - desde + 1;
    let ultimaFilaConDato = desde > 1 ? desde - 1 : 1; // fila 1 = header

    if (filasARevisar > 0) {
      const valores = hoja.getRange(desde, colInfo.col, filasARevisar, 1).getValues();
      for (let i = valores.length - 1; i >= 0; i--) {
        if (valores[i][0].toString().trim()) {
          const filaAbs = desde + i;
          if (filaAbs > ultimaFilaConDato) ultimaFilaConDato = filaAbs;
          break;
        }
      }
    }

    const fila = ultimaFilaConDato + 1;

    // Caso borde: hoja sin ningún puntero inicializado todavía (nunca
    // hubo cambio de día detectado porque nunca se guardó nada). La
    // fecha en A del día en curso ya la escribió alinearNuevoDiaHoja
    // arriba en el caso normal (huboCambioDeDia).
    if (desde === 1 && !huboCambioDeDia) {
      const fechaDisplay = Utilities.formatDate(diaAjustado, "UTC", "EEE d");
      hoja.getRange(fila, 1).setValue(fechaDisplay);
    }

    hoja.getRange(fila, colInfo.col).setValue(texto);
    props.setProperty(propPunteroCol, String(fila));

    // DEBUG TEMPORAL: marcar visualmente la última celda escrita por columna,
    // para verificar si los punteros de cada columna coinciden de fila.
    marcarUltimaCeldaDebug(hoja, fila, colInfo.col);

    return { ok: true, hoja: nombre, fila, columna: colInfo.letra };
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

  const anioActual = Utilities.formatDate(new Date(), ZONA_HORARIA, "yyyy");
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
  manejarVer(chatId, "/ver " + Utilities.formatDate(new Date(), ZONA_HORARIA, "dd/MM/yyyy"));
}

// ============================================================
// Helpers Sheet
// ============================================================

function buscarFilaPorFecha(fechaStr) {
  const p = fechaStr.split("/");
  const target = new Date(parseInt(p[2]), parseInt(p[1])-1, parseInt(p[0]));
  target.setHours(0,0,0,0);

  const ss   = SpreadsheetApp.openById(ID_HOJA);
  const hoja = ss.getSheetByName(NOMBRE_TAB);
  const data = hoja.getDataRange().getValues();

  for (let i = 0; i < data.length; i++) {
    const f = parsearFecha(data[i][1]);
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

    const ss   = SpreadsheetApp.openById(ID_HOJA);
    const hoja = ss.getSheetByName(NOMBRE_TAB);
    const data = hoja.getDataRange().getValues();

    let fila = -1;
    for (let i = 0; i < data.length; i++) {
      const f = parsearFecha(data[i][1]);
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
      const existentes = data[fila-1].slice(2, 5).map(v => (v||"").toString().trim());
      const libres = [0,1,2].filter(i => !existentes[i]);

      if (words.length > libres.length) {
        return { ok: false, mensaje: `Ya hay ${3-libres.length} palabra(s) ese día. Quedan ${libres.length} lugar(es) libre(s).` };
      }

      words.forEach((w, i) => hoja.getRange(fila, 3 + libres[i]).setValue(w));
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
// Diagnóstico webhook (el webhook en sí ya no está activo, ver
// arriba — se usa solo para confirmar que Telegram no tiene una URL
// registrada y que no queda cola de pending updates)
// ============================================================

function eliminarWebhook() {
  const token = PropertiesService.getScriptProperties().getProperty("TELEGRAM_TOKEN");
  const resp  = UrlFetchApp.fetch(
    `https://api.telegram.org/bot${token}/deleteWebhook?drop_pending_updates=true`,
    { muteHttpExceptions: true }
  );
  Logger.log(resp.getContentText());
}

function verWebhookInfo() {
  const token = PropertiesService.getScriptProperties().getProperty("TELEGRAM_TOKEN");
  const resp = UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
  Logger.log(resp.getContentText());
}

// ============================================================
// POLLING — reemplazo del webhook de Telegram
// ============================================================
// Un solo trigger de 1 min (tick, abajo) llama a pollTelegram() para
// no acumular triggers de 1 minuto innecesarios (cuota diaria de
// ejecución de triggers en cuenta gratuita: ~90 min/día).
//
// IMPORTANTE: corré crearTriggerTick() UNA SOLA VEZ a mano desde el
// editor de Apps Script para instalar el trigger.
// ============================================================

const PROP_TG_OFFSET = "TG_OFFSET";

// ------------------------------------------------------------
// Trae y procesa updates nuevos de Telegram vía getUpdates
// ------------------------------------------------------------
function pollTelegram() {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty("TELEGRAM_TOKEN");
  if (!token) { Logger.log("pollTelegram: falta TELEGRAM_TOKEN."); return; }

  let offset = Number(props.getProperty(PROP_TG_OFFSET) || "0");

  // OJO: UrlFetchApp.fetch con method "get" NO serializa `payload` como
  // query params -> hay que armar el query string a mano en la URL.
  // allowed_updates incluye message_reaction: por default Telegram NO
  // manda reacciones a menos que se pidan explícitamente.
  const allowedUpdates = encodeURIComponent(JSON.stringify(
    ["message", "edited_message", "message_reaction"]
  ));
  const url = `https://api.telegram.org/bot${token}/getUpdates?offset=${offset}&timeout=0&allowed_updates=${allowedUpdates}`;
  const resp = UrlFetchApp.fetch(url, { method: "get", muteHttpExceptions: true });
  const data = JSON.parse(resp.getContentText());

  if (!data.ok || !data.result.length) return;

  data.result.forEach(function(update) {
    try {
      if (update.message_reaction) {
        procesarReaccionTelegram(update.message_reaction);
      } else {
        procesarUpdateTelegram(update);
      }
      Logger.log("pollTelegram: procesado update " + update.update_id);
    } catch(err) {
      Logger.log("pollTelegram: error procesando update " + update.update_id + ": " + err.message);
    }
    offset = update.update_id + 1;
  });

  props.setProperty(PROP_TG_OFFSET, String(offset));
}

// ------------------------------------------------------------
// Reacciones nativas de Telegram (❤️/👍/👌/👎/🤔) sobre los mensajes
// de enviarRecordatorioHoy() (ver Repaso.gs):
//   ❤️      -> sabía la palabra de memoria, sin leer la frase.
//              Wort (C/D/E) Y Satz (K/L/M) verde.
//   👍 / 👌 -> se acordó leyendo la frase.
//              Wort amarillo, Satz verde.
//   👎 / 🤔 -> no la entendió ni con el contexto de la frase.
//              Wort Y Satz amarillo + responde con la traducción
//              española (G/H/I).
// ------------------------------------------------------------
const VERDE_REACCION    = "#d9ead3";
const AMARILLO_REACCION = "#fff2cc";

// col (3/4/5, índice de la palabra en C/D/E) -> índice de columna de
// la frase (K/L/M) y de la traducción española (G/H/I).
const COL_FRASE_POR_PALABRA = { 3: 11, 4: 12, 5: 13 };
const COL_TRAD_POR_PALABRA  = { 3: 7,  4: 8,  5: 9  };

function procesarReaccionTelegram(messageReaction) {
  const messageId = messageReaction.message_id;
  const nuevas    = messageReaction.new_reaction || [];
  if (!nuevas.length) return; // reacción quitada, no reacción nueva

  const emoji = nuevas[0].emoji;
  if (!emoji) return;

  const mapeo = obtenerMapeoReaccion(messageId);
  if (!mapeo) {
    Logger.log("procesarReaccionTelegram: sin mapeo (vencido o inexistente) para message_id " + messageId);
    return;
  }

  const ss       = SpreadsheetApp.openById(ID_HOJA);
  const hoja     = ss.getSheetByName(NOMBRE_TAB);
  const colFrase = COL_FRASE_POR_PALABRA[mapeo.col];

  const esCorazon = emoji === "❤" || emoji === "❤️";
  const esOk      = emoji === "👍" || emoji === "👌";
  const esNoSabe  = emoji === "👎" || emoji === "🤔";

  if (esCorazon) {
    hoja.getRange(mapeo.fila, mapeo.col).setBackground(VERDE_REACCION);
    hoja.getRange(mapeo.fila, colFrase).setBackground(VERDE_REACCION);
    return;
  }

  if (esOk) {
    hoja.getRange(mapeo.fila, mapeo.col).setBackground(AMARILLO_REACCION);
    hoja.getRange(mapeo.fila, colFrase).setBackground(VERDE_REACCION);
    return;
  }

  if (esNoSabe) {
    hoja.getRange(mapeo.fila, mapeo.col).setBackground(AMARILLO_REACCION);
    hoja.getRange(mapeo.fila, colFrase).setBackground(AMARILLO_REACCION);
    responderTraduccion(hoja, mapeo);
    return;
  }

  Logger.log("procesarReaccionTelegram: emoji sin mapeo de acción: " + emoji);
}

function responderTraduccion(hoja, mapeo) {
  const colTrad = COL_TRAD_POR_PALABRA[mapeo.col];
  const trad = hoja.getRange(mapeo.fila, colTrad).getValue().toString().trim();
  enviarTelegram(`🇪🇸 <b>${mapeo.orig}</b> → ${trad || "(sin traducción)"}`);
}

// ------------------------------------------------------------
// tick() — un solo trigger de 1 min que dispara polling
// ------------------------------------------------------------
function tick() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    Logger.log("tick: no se pudo tomar el lock, se salta esta corrida.");
    return;
  }
  try {
    pollTelegram();
  } finally {
    lock.releaseLock();
  }
}

// ------------------------------------------------------------
// DEBUG TEMPORAL: vuelca en Logger.log el estado actual de los
// punteros/fechas por columna (B/E/I/L) de las hojas de palabra
// suelta, para diagnosticar desalineaciones entre columnas al
// cambiar de día. Correr a mano desde el editor de Apps Script.
// ------------------------------------------------------------
function debugPunterosPalabraSuelta() {
  const props = PropertiesService.getScriptProperties();
  const hojas = new Set(Object.values(CONFIG_MODO_PALABRA).map(c => c.hoja));

  hojas.forEach(nombre => {
    Logger.log(`--- Hoja: ${nombre} ---`);
    CONFIG_COL_ACTIVA.forEach(col => {
      const puntero = props.getProperty(`${PROP_PUNTERO_COL}${nombre}_${col.col}`);
      const fecha   = props.getProperty(`${PROP_FECHA_ULTIMA}${nombre}_${col.col}`);
      Logger.log(`  ${col.prefijo} (col ${col.letra}/${col.col}): puntero=${puntero} fechaUltima=${fecha}`);
    });
  });

  const ahora = new Date();
  const ahoraConZona = new Date(ahora.toLocaleString('en-US', { timeZone: ZONA_HORARIA }));
  const horas = ahoraConZona.getHours();
  const diaAjustado = horas < CONFIG_OFFSET_DIA_HORAS ? new Date(ahoraConZona.getTime() - 24*60*60*1000) : ahoraConZona;
  const hoy = Utilities.formatDate(diaAjustado, "UTC", "yyyy-MM-dd");
  Logger.log(`"Hoy" calculado (offset ${CONFIG_OFFSET_DIA_HORAS}h): ${hoy}`);
}

// ------------------------------------------------------------
// Instalar el trigger de tiempo — CORRER UNA SOLA VEZ A MANO
// ------------------------------------------------------------
function crearTriggerTick() {
  const yaExiste = ScriptApp.getProjectTriggers()
    .some(function(t) { return t.getHandlerFunction() === "tick"; });

  if (yaExiste) {
    Logger.log("El trigger de tick ya existe, no se crea otro.");
    return;
  }
  ScriptApp.newTrigger("tick")
    .timeBased()
    .everyMinutes(1)
    .create();
  Logger.log("Trigger creado: tick cada 1 minuto (pollTelegram).");
}
