// ============================================================
// D1_MISTAKES — bitácora de errores del skill /eng (D1 `eng-feedback-bot`,
// tabla `mistakes`) como hoja del Spreadsheet de inglés (ID_HOJA_EN).
//
// Mismo layout que BD_FEHLER (Fehler.js): columna A = fecha; luego un bloque
// de columnas por categoría. Fila 1 = categoría, fila 2 = columnas, datos
// desde la fila 3.
//
// Depende de: ID_HOJA_EN (Telegram.js), consultarD1 y CF_ACCOUNT_ID (Fehler.js).
// Token: el mismo CF_D1_TOKEN (PropertiesService) con lectura sobre ambas D1.
// ============================================================

const ENG_HOJA       = "D1_MISTAKES";
const CF_D1_DB_ID_EN = "b7faffb3-9a05-4170-8cf5-466ad4a531e2";
const ENG_CHAT_ID    = "6471003088";

// `categoria` = valor exacto de la columna `category` en la D1.
// La `explanation` va como nota de la celda "corrected" (Grammar y Register).
const ENG_BLOQUES = [
  { titulo: "Grammar and Prepositions", categoria: "Grammar and Prepositions",
    columnas: ["original", "corrected"] },
  { titulo: "Vocabulary",              categoria: "Vocabulary",
    columnas: ["wrong", "right", "wrong (ES)", "right (ES)"] },
  { titulo: "Spelling",                categoria: "Spelling",
    columnas: ["original, corrected"] },
  // Register (tono/formalidad, ej. "gonna" en un email formal) comparte este bloque.
  { titulo: "Collocations & Register", categoria: "Collocations or Verb patterns",
    tambien: ["Register"], columnas: ["wrong", "right"] },
  // Directorio de preposiciones, alimentado desde los errores de Grammar and
  // Prepositions donde la corrección añade/cambia una preposición: guarda
  // "verbo/adjetivo + prep" (ej. "depend ON") en la columna de su preposición.
  // `categoria` ficticia: nunca coincide con la D1. `directorio`: cada columna
  // lleva su propio puntero de fila (alineado al día). Para añadir otra
  // preposición, agregarla al final de ENG_PREPOSICIONES (y de las columnas).
  { titulo: "Prepositions",            categoria: "Prepositions", directorio: true, huecoAntes: 1,
    columnas: ["IN", "ON", "AT", "TO", "FOR", "OF", "WITH"] },
];

const ENG_PREPOSICIONES = ["in", "on", "at", "to", "for", "of", "with"];

function engBloquesConColumna() {
  let col = 2; // A es la fecha
  return ENG_BLOQUES.map(b => {
    col += b.huecoAntes || 0;
    const conCol = Object.assign({}, b, { colInicio: col });
    col += b.columnas.length;
    return conCol;
  });
}

// Idempotente: crea la hoja si falta y (re)escribe encabezados y fila fija.
function prepararD1Mistakes() {
  const ss = SpreadsheetApp.openById(ID_HOJA_EN);
  const sheet = ss.getSheetByName(ENG_HOJA) || ss.insertSheet(ENG_HOJA);
  const bloques = engBloquesConColumna();

  sheet.getRange(1, 1).setValue("Fecha");
  bloques.forEach(b => {
    sheet.getRange(1, b.colInicio).setValue(b.titulo);
    sheet.getRange(2, b.colInicio, 1, b.columnas.length).setValues([b.columnas]);
  });

  const ult = bloques[bloques.length - 1];
  const ultimaCol = ult.colInicio + ult.columnas.length - 1;
  sheet.getRange(1, 1, 2, ultimaCol).setFontWeight("bold");
  sheet.getRange(2, 1, 1, ultimaCol).setFontStyle("italic");
  sheet.setFrozenRows(2);
  Logger.log("D1_MISTAKES lista: " + bloques.length + " bloques, " + ultimaCol + " columnas.");
}

// Prueba de conexión: cuenta errores por categoría en la D1 de inglés y avisa
// de las categorías que no tienen bloque en ENG_BLOQUES.
function probarConexionD1Eng() {
  const filas = consultarD1(
    "SELECT category, COUNT(*) AS n, MAX(id) AS max_id FROM mistakes WHERE chat_id=? GROUP BY category",
    [ENG_CHAT_ID], CF_D1_DB_ID_EN);
  filas.forEach(f => {
    const ok = ENG_BLOQUES.some(b => b.categoria === f.category);
    Logger.log((ok ? "OK   " : "SIN BLOQUE ") + "'" + f.category + "': " + f.n + " (max id " + f.max_id + ")");
  });
  Logger.log("Conexión OK: " + filas.length + " categorías en eng-feedback-bot.");
}

// ============================================================
// IMPORTACIÓN D1 → D1_MISTAKES
// ============================================================

// Primera importación (sin ULTIMO_ID_ENG guardado): solo desde esta fecha.
const ENG_DESDE_INICIAL = "2026-09-08";

function escribirFilaEng(sheet, bloque, fila, e) {
  const c = bloque.colInicio;
  const { rA, rB } = diferenciasFehler(e.original, e.corrected);
  // Sin diferencias detectadas: marcar todo.
  const marcaA = rA.length || rB.length ? rA : [[0, e.original.length]];
  const marcaB = rA.length || rB.length ? rB : [[0, e.corrected.length]];

  if (bloque.categoria === "Spelling") {
    // Una sola celda "original, corrected".
    const off = e.original.length + 2;
    const texto = e.original + ", " + e.corrected;
    const rangos = marcaA.concat(marcaB.map(r => [r[0] + off, r[1] + off]));
    sheet.getRange(fila, c).setRichTextValue(richTextFehler(texto, rangos));
    return;
  }

  sheet.getRange(fila, c).setRichTextValue(richTextFehler(e.original, marcaA));
  sheet.getRange(fila, c + 1).setRichTextValue(richTextFehler(e.corrected, marcaB));

  if (bloque.categoria === "Vocabulary") {
    const a1 = sheet.getRange(fila, c).getA1Notation();
    const a2 = sheet.getRange(fila, c + 1).getA1Notation();
    sheet.getRange(fila, c + 2).setFormula('=IFERROR(GOOGLETRANSLATE(' + a1 + ';"en";"es");"-")');
    sheet.getRange(fila, c + 3).setFormula('=IFERROR(GOOGLETRANSLATE(' + a2 + ';"en";"es");"-")');
  } else if (e.explanation && (e.category === "Grammar and Prepositions" || e.category === "Register")) {
    sheet.getRange(fila, c + 1).setNote(e.explanation);
  }
}

// Palabras que no sirven de ancla: si la que precede a la preposición es una de
// ellas se retrocede una más ("help me with"), y si la sigue un determinante se
// incluye también el nombre ("in the morning").
const ENG_DETERMINANTES = ["the", "a", "an", "my", "your", "his", "her", "our", "their", "this", "that", "these", "those", "some", "any"];
const ENG_PRONOMBRES    = ["i", "me", "you", "him", "us", "them", "it", "we", "they", "he", "she"];

// Preposición que introduce la corrección: la primera palabra de ENG_PREPOSICIONES
// presente en `corrected` y no en `original`. Devuelve { col, texto } con el
// contexto mínimo útil ("depend on him", "in the morning", "help me with"); null si no hay.
function prepEnError(e) {
  const limpiar = w => w.toLowerCase().replace(/^[^a-z']+|[^a-z']+$/g, "");
  const puntua = w => /[,.;:!?]$/.test(w);
  const raw = e.corrected.split(/\s+/).filter(Boolean);
  const corr = raw.map(limpiar);
  const restantes = e.original.split(/\s+/).map(limpiar).filter(Boolean);
  for (let i = 0; i < corr.length; i++) {
    const k = restantes.indexOf(corr[i]);
    if (k !== -1) { restantes.splice(k, 1); continue; }
    const col = ENG_PREPOSICIONES.indexOf(corr[i]);
    if (col === -1) continue;

    let ini = i - 1;
    if (ini >= 0 && (ENG_DETERMINANTES.indexOf(corr[ini]) !== -1 || ENG_PRONOMBRES.indexOf(corr[ini]) !== -1)) ini--;
    if (ini < 0 || puntua(raw[ini])) ini = (i > 0 && !puntua(raw[i - 1])) ? i - 1 : i;
    let fin = i;
    if (!puntua(raw[i]) && i + 1 < corr.length) {
      fin = i + 1;
      if (ENG_DETERMINANTES.indexOf(corr[fin]) !== -1 && !puntua(raw[fin]) && fin + 1 < corr.length) fin++;
    }
    return { col: col, texto: corr.slice(ini, fin + 1).join(" ") };
  }
  return null;
}

// Añade la entrada al directorio: normal la 1ª vez, negrita la 3ª, MAYÚSCULAS desde la 4ª.
function agregarPrepAlDirectorio(sheet, bloque, p, fila) {
  const col = bloque.colInicio + p.col;
  const ultima = sheet.getLastRow();
  let previas = 0;
  if (ultima >= FEHLER_FILA_DATOS) {
    const vals = sheet.getRange(FEHLER_FILA_DATOS, col, ultima - FEHLER_FILA_DATOS + 1, 1).getValues();
    previas = vals.filter(v => String(v[0]).toLowerCase() === p.texto).length;
  }
  const vez = previas + 1;
  const texto = vez >= 4 ? p.texto.toUpperCase() : p.texto;
  const estilo = SpreadsheetApp.newTextStyle().setBold(vez >= 3).build();
  sheet.getRange(fila, col).setRichTextValue(
    SpreadsheetApp.newRichTextValue().setText(texto).setTextStyle(0, texto.length, estilo).build());
}

// Importa los errores nuevos de la D1 de inglés a D1_MISTAKES. Idempotente por
// id: ULTIMO_ID_ENG (PropertiesService) marca hasta dónde se importó.
function importarEng() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) { Logger.log("importarEng: otra ejecución en curso"); return; }

  try {
    const props = PropertiesService.getScriptProperties();
    const ultimoId = props.getProperty("ULTIMO_ID_ENG");

    const filas = ultimoId === null
      ? consultarD1("SELECT * FROM mistakes WHERE chat_id=? AND created_at >= ? ORDER BY id",
                    [ENG_CHAT_ID, ENG_DESDE_INICIAL], CF_D1_DB_ID_EN)
      : consultarD1("SELECT * FROM mistakes WHERE chat_id=? AND id > ? ORDER BY id",
                    [ENG_CHAT_ID, Number(ultimoId)], CF_D1_DB_ID_EN);

    if (!filas.length) { Logger.log("importarEng: nada nuevo"); return; }

    const sheet = SpreadsheetApp.openById(ID_HOJA_EN).getSheetByName(ENG_HOJA);
    if (!sheet) throw new Error("No existe la hoja " + ENG_HOJA + " — correr prepararD1Mistakes()");

    const bloques = engBloquesConColumna();
    const siguienteFila = {};
    // Un puntero por columna de seguimiento: una por bloque, salvo el
    // directorio (Prepositions), que tiene una por preposición.
    const seguimiento = [];
    bloques.forEach(b => {
      if (b.directorio) b.columnas.forEach((_, i) => seguimiento.push({ clave: b.titulo + i, col: b.colInicio + i }));
      else seguimiento.push({ clave: b.titulo, col: b.colInicio });
    });
    seguimiento.forEach(c => { siguienteFila[c.clave] = primeraFilaLibreBloque(sheet, c.col); });

    // Como en BD_FEHLER: la fecha ("Mon 21") va en A solo en el primer error
    // del día, y al empezar un día nuevo todos los bloques se alinean a la
    // misma fila (la siguiente a la última escrita en cualquiera).
    let ultimoDia = props.getProperty("ULTIMO_DIA_ENG");
    let filaDia   = Number(props.getProperty("FILA_DIA_ENG")) || FEHLER_FILA_DATOS;

    let importadas = 0;
    filas.forEach(e => {
      const bloque = bloques.filter(b => b.categoria === e.category || (b.tambien || []).indexOf(e.category) !== -1)[0];
      if (!bloque) { Logger.log("importarEng: categoría desconocida '" + e.category + "' (id " + e.id + ")"); return; }

      const fecha = new Date(e.created_at);
      const dia = Utilities.formatDate(fecha, ZONA_HORARIA, "yyyy-MM-dd");
      if (dia !== ultimoDia) {
        filaDia = Math.max.apply(null, seguimiento.map(c => siguienteFila[c.clave]));
        seguimiento.forEach(c => { siguienteFila[c.clave] = filaDia; });
        sheet.getRange(filaDia, FEHLER_COL_FECHA).setValue(Utilities.formatDate(fecha, ZONA_HORARIA, "EEE d"));
        ultimoDia = dia;
      }
      siguienteFila[bloque.titulo] = Math.max(siguienteFila[bloque.titulo], filaDia);

      escribirFilaEng(sheet, bloque, siguienteFila[bloque.titulo]++, e);

      // Errores de preposición: al directorio "Prepositions".
      if (e.category === "Grammar and Prepositions") {
        const prep = prepEnError(e);
        if (prep) {
          const bPrep = bloques.filter(b => b.categoria === "Prepositions")[0];
          const clave = bPrep.titulo + prep.col;
          siguienteFila[clave] = Math.max(siguienteFila[clave], filaDia);
          agregarPrepAlDirectorio(sheet, bPrep, prep, siguienteFila[clave]++);
        }
      }
      importadas++;
    });

    props.setProperty("ULTIMO_DIA_ENG", ultimoDia);
    props.setProperty("FILA_DIA_ENG", String(filaDia));
    props.setProperty("ULTIMO_ID_ENG", String(filas[filas.length - 1].id));
    Logger.log("importarEng: " + importadas + "/" + filas.length + " filas importadas, último id " + filas[filas.length - 1].id);
  } finally {
    lock.releaseLock();
  }
}

// Instala el trigger diario 07:30 Europe/Berlin (no duplica si ya existe).
function crearTriggerEng() {
  const existe = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === "importarEng");
  if (existe) { Logger.log("Trigger de importarEng ya existe"); return; }
  ScriptApp.newTrigger("importarEng").timeBased().atHour(7).nearMinute(30)
    .inTimezone("Europe/Berlin").everyDays(1).create();
  Logger.log("Trigger creado: importarEng diario ~07:30 Europe/Berlin");
}

// Para volver a importar desde cero (borra solo el marcador, no la hoja).
function resetearUltimoIdEng() {
  const props = PropertiesService.getScriptProperties();
  ["ULTIMO_ID_ENG", "ULTIMO_DIA_ENG", "FILA_DIA_ENG"].forEach(k => props.deleteProperty(k));
}
