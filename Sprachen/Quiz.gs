// ============================================================
// QUIZ SEMANAL — genera un quiz de opción múltiple (sin IA) con las
// palabras/gramática de la última semana registrada en la hoja de
// vocabulario, y lo manda a Telegram como polls tipo "quiz".
//
// Uso: generarQuizSemanal("de-input")  / "de-output" / "en-input" / "en-output"
//      (mismos 4 modos de CONFIG_MODO_PALABRA en Telegram.gs)
//      Segundo parámetro opcional offsetSemanas (0 = última semana
//      detectada, 1 = la anterior a esa, etc. — default 0).
//
// Rango de una semana: se busca en columna A la última fila que
// matchee "Mon <día>" (marca de inicio de semana ya presente en la
// hoja) y se toma desde ahí hasta la fila justo antes del próximo
// "Mon" hacia abajo (o el final de datos si no hay uno posterior).
//
// Pools de preguntas:
//   - vocab: columnas B/C (Alle die Wörter) y E/F (Wichtigste) — solo
//     si la celda de la palabra (B o E) está en negrilla, cursiva,
//     tiene fondo de color, o la columna D dice "B2".
//   - grammar: columnas Q/R (bug -> fix) y S/T (to/-ing, grammar).
//
// Cada pregunta se arma con la respuesta correcta + 3 distractores al
// azar tomados del mismo pool (mismo tipo), para que las opciones
// sean del mismo "estilo" y no triviales de descartar a ojo.
// ============================================================

const QUIZ_COL_A = 1;   // fecha / marca de semana
const QUIZ_COL_B = 2;   // Alle die Wörter (palabra)
const QUIZ_COL_C = 3;   // traducción de B
const QUIZ_COL_D = 4;   // nivel (ej. "B2")
const QUIZ_COL_E = 5;   // Wichtigste (palabra)
const QUIZ_COL_F = 6;   // traducción de E
const QUIZ_COL_Q = 17;  // bug
const QUIZ_COL_R = 18;  // fix
const QUIZ_COL_S = 19;  // to or -ing
const QUIZ_COL_T = 20;  // grammar

const QUIZ_CANTIDAD_PREGUNTAS = 10;
const QUIZ_CANTIDAD_OPCIONES  = 4; // 1 correcta + 3 distractores

function generarQuizSemanal(modo, offsetSemanas) {
  modo = modo || obtenerModoPalabra();
  offsetSemanas = offsetSemanas || 0;

  const config = CONFIG_MODO_PALABRA[modo];
  if (!config) throw new Error(`Modo inválido: ${modo}`);

  const ss   = SpreadsheetApp.openById(config.spreadsheetId);
  const hoja = ss.getSheetByName(config.hoja);
  if (!hoja) throw new Error(`No existe la hoja ${config.hoja}.`);

  const rango = detectarRangoSemana(hoja, offsetSemanas);
  if (!rango) {
    Logger.log(`generarQuizSemanal: no se encontró ningún "Mon" en columna A de ${config.hoja}.`);
    enviarTelegram(`⚠️ No pude armar el quiz: no encontré marca de semana ("Mon ...") en ${config.hoja}.`);
    return;
  }

  Logger.log(
    `generarQuizSemanal [${modo}] hoja=${config.hoja} offsetSemanas=${offsetSemanas} -> ` +
    `rango filas ${rango.filaInicio}-${rango.filaFin} (${rango.filaFin - rango.filaInicio + 1} filas).`
  );

  const candidatos = extraerCandidatos(hoja, rango.filaInicio, rango.filaFin);
  Logger.log(
    `generarQuizSemanal: candidatos encontrados -> vocab=${candidatos.vocab.length}, grammar=${candidatos.grammar.length}`
  );

  const pool = candidatos.vocab.concat(candidatos.grammar);
  if (pool.length === 0) {
    Logger.log("generarQuizSemanal: sin candidatos en el rango, no se manda quiz.");
    enviarTelegram(`⚠️ No pude armar el quiz: no encontré palabras/gramática marcadas en el rango ${config.hoja} filas ${rango.filaInicio}-${rango.filaFin}.`);
    return;
  }

  const preguntas = armarPreguntas(pool, QUIZ_CANTIDAD_PREGUNTAS);
  Logger.log(`generarQuizSemanal: ${preguntas.length} preguntas armadas, enviando a Telegram.`);

  enviarTelegram(
    `📝 <b>Quiz semanal</b> (${config.hoja}, filas ${rango.filaInicio}-${rango.filaFin})\n` +
    `${preguntas.length} preguntas — respondé cada poll:`
  );

  preguntas.forEach(p => enviarQuizPoll(p));
}

// ------------------------------------------------------------
// Detecta el rango [filaInicio, filaFin] de una semana en columna A.
// offsetSemanas 0 = la última marca "Mon" encontrada escaneando desde
// abajo; 1 = la anterior a esa; etc.
// ------------------------------------------------------------
function detectarRangoSemana(hoja, offsetSemanas) {
  const maxRows = hoja.getMaxRows();
  const valoresA = hoja.getRange(1, QUIZ_COL_A, maxRows, 1).getValues();
  const regexMon = /^Mon\s*\d+/i;

  const filasMon = [];
  for (let i = 0; i < valoresA.length; i++) {
    const val = valoresA[i][0].toString().trim();
    if (regexMon.test(val)) filasMon.push(i + 1); // fila 1-indexed
  }
  if (filasMon.length === 0) return null;

  const idx = filasMon.length - 1 - offsetSemanas;
  if (idx < 0) return null;

  const filaInicio = filasMon[idx];
  const filaFin = idx + 1 < filasMon.length ? filasMon[idx + 1] - 1 : ultimaFilaConDato(hoja);

  return { filaInicio, filaFin };
}

function ultimaFilaConDato(hoja) {
  const data = hoja.getDataRange().getValues();
  for (let i = data.length - 1; i >= 0; i--) {
    if (data[i].some(c => c.toString().trim())) return i + 1;
  }
  return 1;
}

// ------------------------------------------------------------
// Recorre filaInicio..filaFin y arma dos pools de candidatos.
// ------------------------------------------------------------
function extraerCandidatos(hoja, filaInicio, filaFin) {
  const nFilas = filaFin - filaInicio + 1;
  const vocab = [];
  const grammar = [];
  if (nFilas <= 0) return { vocab, grammar };

  const rangoB = hoja.getRange(filaInicio, QUIZ_COL_B, nFilas, 3); // B,C,D
  const valB = rangoB.getValues();
  const negB = rangoB.getFontWeights();
  const cursB = rangoB.getFontStyles();
  const bgB = rangoB.getBackgrounds();

  const rangoE = hoja.getRange(filaInicio, QUIZ_COL_E, nFilas, 2); // E,F
  const valE = rangoE.getValues();
  const negE = rangoE.getFontWeights();
  const cursE = rangoE.getFontStyles();
  const bgE = rangoE.getBackgrounds();

  const rangoQT = hoja.getRange(filaInicio, QUIZ_COL_Q, nFilas, 4); // Q,R,S,T
  const valQT = rangoQT.getValues();

  for (let i = 0; i < nFilas; i++) {
    const fila = filaInicio + i;

    const palabraB = valB[i][0].toString().trim();
    const tradB = valB[i][1].toString().trim();
    const nivelB = valB[i][2].toString().trim();
    if (palabraB && tradB && esCandidatoMarcado(negB[i][0], cursB[i][0], bgB[i][0], nivelB)) {
      vocab.push({ tipo: "vocab", pregunta: palabraB, respuesta: tradB, fila });
    }

    const palabraE = valE[i][0].toString().trim();
    const tradE = valE[i][1].toString().trim();
    if (palabraE && tradE && esCandidatoMarcado(negE[i][0], cursE[i][0], bgE[i][0], "")) {
      vocab.push({ tipo: "vocab", pregunta: palabraE, respuesta: tradE, fila });
    }

    const bug = valQT[i][0].toString().trim();
    const fix = valQT[i][1].toString().trim();
    if (bug && fix) {
      grammar.push({ tipo: "grammar", pregunta: `Corregí: "${bug}"`, respuesta: fix, fila });
    }

    const toIng = valQT[i][2].toString().trim();
    const gram = valQT[i][3].toString().trim();
    if (toIng && gram) {
      grammar.push({ tipo: "grammar", pregunta: toIng, respuesta: gram, fila });
    }
  }

  return { vocab, grammar };
}

function esCandidatoMarcado(fontWeight, fontStyle, background, nivelCelda) {
  if (fontWeight === "bold") return true;
  if (fontStyle === "italic") return true;
  if (background && background !== "#ffffff" && background.toLowerCase() !== "#ffffff") return true;
  if (nivelCelda && nivelCelda.toUpperCase() === "B2") return true;
  return false;
}

// ------------------------------------------------------------
// Arma hasta `cantidad` preguntas multiple-choice mezclando el pool
// y sacando distractores del mismo tipo.
// ------------------------------------------------------------
function armarPreguntas(pool, cantidad) {
  const mezclado = mezclarArray(pool.slice());
  const elegidas = mezclado.slice(0, Math.min(cantidad, mezclado.length));

  return elegidas.map(item => {
    const mismosTipo = pool.filter(p => p.tipo === item.tipo && p.respuesta !== item.respuesta);
    const distractores = mezclarArray(mismosTipo.slice())
      .slice(0, QUIZ_CANTIDAD_OPCIONES - 1)
      .map(p => p.respuesta);

    const opciones = mezclarArray([item.respuesta].concat(distractores));
    const correctIndex = opciones.indexOf(item.respuesta);

    return {
      pregunta: item.pregunta,
      opciones,
      correctIndex,
      fila: item.fila,
      tipo: item.tipo,
    };
  }).filter(p => p.opciones.length >= 2); // sendPoll exige al menos 2 opciones
}

// ------------------------------------------------------------
// Triggers semanales: Deutsch domingo mediodía, English jueves
// mediodía. CORRER crearTriggersQuizSemanal() UNA SOLA VEZ A MANO,
// después de validar con generarQuizSemanal() manual.
// ------------------------------------------------------------
function quizSemanalDeutsch() {
  generarQuizSemanal("de-input");
  generarQuizSemanal("de-output");
}

function quizSemanalEnglish() {
  generarQuizSemanal("en-input");
  generarQuizSemanal("en-output");
}

function crearTriggersQuizSemanal() {
  const handlers = ["quizSemanalDeutsch", "quizSemanalEnglish"];
  const existentes = ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction());

  if (!existentes.includes("quizSemanalDeutsch")) {
    ScriptApp.newTrigger("quizSemanalDeutsch")
      .timeBased()
      .onWeekDay(ScriptApp.WeekDay.SUNDAY)
      .atHour(12)
      .nearMinute(0)
      .inTimezone(ZONA_HORARIA)
      .create();
    Logger.log("Trigger creado: quizSemanalDeutsch domingo ~12:00 (Europe/Berlin).");
  } else {
    Logger.log("El trigger de quizSemanalDeutsch ya existe, no se crea otro.");
  }

  if (!existentes.includes("quizSemanalEnglish")) {
    ScriptApp.newTrigger("quizSemanalEnglish")
      .timeBased()
      .onWeekDay(ScriptApp.WeekDay.THURSDAY)
      .atHour(12)
      .nearMinute(0)
      .inTimezone(ZONA_HORARIA)
      .create();
    Logger.log("Trigger creado: quizSemanalEnglish jueves ~12:00 (Europe/Berlin).");
  } else {
    Logger.log("El trigger de quizSemanalEnglish ya existe, no se crea otro.");
  }
}

function mezclarArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ------------------------------------------------------------
// Envía una pregunta como Telegram poll en modo "quiz".
// ------------------------------------------------------------
function enviarQuizPoll(p) {
  const props  = PropertiesService.getScriptProperties();
  const token  = props.getProperty("TELEGRAM_TOKEN");
  const chatId = props.getProperty("TELEGRAM_CHAT_ID");
  if (!token || !chatId) { Logger.log("⚠️ Faltan credenciales Telegram."); return; }

  const payload = {
    chat_id: chatId,
    question: p.pregunta.slice(0, 300),
    options: JSON.stringify(p.opciones.map(o => o.slice(0, 100))),
    type: "quiz",
    correct_option_id: p.correctIndex,
    is_anonymous: false,
  };

  try {
    const resp = UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/sendPoll`, {
      method: "post", contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
    const res = JSON.parse(resp.getContentText());
    if (!res.ok) Logger.log("❌ sendPoll: " + JSON.stringify(res));
  } catch (e) {
    Logger.log("❌ sendPoll: " + e.message);
  }
}
