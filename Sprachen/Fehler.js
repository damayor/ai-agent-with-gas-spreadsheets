// ============================================================
// BD_FEHLER — bitácora de errores del skill /deu (D1 `de-berichtigung-db`,
// tabla `mistakes_de`) como hoja del Spreadsheet de alemán (ID_HOJA).
//
// Layout: columna A = fecha (created_at); luego un bloque de columnas por
// categoría, en el orden de FEHLER_BLOQUES. Fila 1 = nombre de la
// categoría (fija), fila 2 = nombre de cada columna, datos desde la fila 3.
// Cada bloque crece independiente (su propia "primera fila libre").
//
// Depende de: ID_HOJA (Telegram.gs).
// ============================================================

const FEHLER_HOJA        = "BD_FEHLER";
const FEHLER_FILA_DATOS  = 3;
const FEHLER_COL_FECHA   = 1;

// `categoria` = valor exacto de la columna `category` en la D1.
const FEHLER_BLOQUES = [
  { titulo: "Grammatik",               categoria: "Grammatik & Zeichensetzung",
    columnas: ["original", "corregido", "Grund"] },
  { titulo: "Präposition und Verbvalenz", categoria: "Präpositionen und Verbvalenz",
    columnas: ["original", "corregido"] },
  { titulo: "Kollokation & Satzbau",   categoria: "Kollokationen & Satzbau",
    columnas: ["falsch", "richtig"] },
  { titulo: "Vokabeln",                categoria: "Vokabeln",
    columnas: ["falsch", "richtig", "falsch (ES)", "richtig (ES)"] },
  { titulo: "Orthographie",            categoria: "Orthographie",
    columnas: ["original, corregido"] },
  // Directorio de sustantivos con su artículo correcto, alimentado desde los
  // errores de Grammatik que dependen del artículo/caso (ver esErrorDeCaso),
  // con las formas de color der ▲ azul, das ■ verde, die ● rojo, plural ∞ naranja.
  // `categoria` ficticia: nunca coincide con la D1. `directorio`: cada
  // columna lleva su propio puntero de fila (alineado al día) y sin repetidos.
  // `huecoAntes` = columnas vacías antes del bloque (queda en O-Q).
  { titulo: "Artikel",                 categoria: "Artikel", huecoAntes: 1, directorio: true,
    columnas: ["▲ Der", "■ Das", "● Die", "∞ Plural"] },
];

// Orden de las columnas de "Artikel": der ▲, das ■, die ● (como se aprende) y
// una cuarta para plurales, que son lo más difícil de formar.
const FEHLER_GENEROS = [
  { art: "der", simbolo: "▲", color: "#1a5fb4" },
  { art: "das", simbolo: "■", color: "#26a269" },
  { art: "die", simbolo: "●", color: "#c01c28" },
  { art: "plural", simbolo: "∞", color: "#e66100" },
];

// Devuelve los bloques con su columna inicial en la hoja (A es la fecha).
function fehlerBloquesConColumna() {
  let col = FEHLER_COL_FECHA + 1;
  return FEHLER_BLOQUES.map(b => {
    col += b.huecoAntes || 0;
    const conCol = Object.assign({}, b, { colInicio: col });
    col += b.columnas.length;
    return conCol;
  });
}

// Idempotente: crea la hoja si falta y (re)escribe encabezados y fila fija.
function prepararBdFehler() {
  const ss = SpreadsheetApp.openById(ID_HOJA);
  const sheet = ss.getSheetByName(FEHLER_HOJA) || ss.insertSheet(FEHLER_HOJA);
  const bloques = fehlerBloquesConColumna();

  sheet.getRange(1, FEHLER_COL_FECHA).setValue("Fecha");

  bloques.forEach(b => {
    sheet.getRange(1, b.colInicio).setValue(b.titulo);
    sheet.getRange(2, b.colInicio, 1, b.columnas.length).setValues([b.columnas]);
  });

  const ultimaCol = bloques[bloques.length - 1].colInicio +
                    bloques[bloques.length - 1].columnas.length - 1;
  const art = bloques.filter(b => b.directorio)[0];
  if (art) FEHLER_GENEROS.forEach((g, i) =>
    sheet.getRange(2, art.colInicio + i).setFontColor(g.color));
  sheet.getRange(1, 1, 2, ultimaCol).setFontWeight("bold");
  sheet.getRange(2, 1, 1, ultimaCol).setFontStyle("italic");
  sheet.setFrozenRows(2);

  Logger.log("BD_FEHLER lista: " + bloques.length + " bloques, " + ultimaCol + " columnas.");
}

// ============================================================
// IMPORTACIÓN D1 → BD_FEHLER
// Token de Cloudflare (solo lectura sobre D1) en PropertiesService: CF_D1_TOKEN.
// ============================================================

const CF_ACCOUNT_ID = "efc0c11d332cff0aeca9869a5044bc3a";
const CF_D1_DB_ID   = "1a99e1de-190e-49bb-9f91-06e2640a0ee7";

// Primera importación (sin ULTIMO_ID_FEHLER guardado): solo desde esta fecha,
// para probar con pocos datos antes de abrirlo a todo el histórico.
const FEHLER_DESDE_INICIAL = "2026-10-21";

// `dbId` opcional: por defecto la D1 de alemán (la de inglés la pasa FehlerEng.js).
function consultarD1(sql, params, dbId) {
  const token = PropertiesService.getScriptProperties().getProperty("CF_D1_TOKEN");
  if (!token) throw new Error("Falta la propiedad CF_D1_TOKEN en PropertiesService");

  const url = "https://api.cloudflare.com/client/v4/accounts/" + CF_ACCOUNT_ID +
              "/d1/database/" + (dbId || CF_D1_DB_ID) + "/query";
  const resp = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + token },
    payload: JSON.stringify({ sql: sql, params: params || [] }),
    muteHttpExceptions: true,
  });
  const body = JSON.parse(resp.getContentText());
  if (resp.getResponseCode() !== 200 || !body.success) {
    throw new Error("D1 respondió " + resp.getResponseCode() + ": " + resp.getContentText());
  }
  return body.result[0].results;
}

// Marca qué caracteres de `a` y `b` difieren. Compara por palabras: las que
// no están en el otro texto se emparejan en orden y, dentro de cada par, se
// recortan prefijo/sufijo comunes (así "bekommen"/"bekomMen" marca solo "m").
// Devuelve rangos [inicio, fin) para cada texto.
function diferenciasFehler(a, b) {
  const tokens = txt => {
    const out = [];
    const re = /\S+/g;
    let m;
    while ((m = re.exec(txt)) !== null) out.push({ t: m[0], ini: m.index });
    return out;
  };
  const ta = tokens(a), tb = tokens(b);
  const setA = new Set(ta.map(x => x.t)), setB = new Set(tb.map(x => x.t));
  const dA = ta.filter(x => !setB.has(x.t)), dB = tb.filter(x => !setA.has(x.t));
  const rA = [], rB = [];

  if (dA.length === dB.length) {
    dA.forEach((x, i) => {
      const y = dB[i];
      let p = 0;
      while (p < x.t.length && p < y.t.length && x.t[p] === y.t[p]) p++;
      let s = 0;
      while (s < x.t.length - p && s < y.t.length - p &&
             x.t[x.t.length - 1 - s] === y.t[y.t.length - 1 - s]) s++;
      if (x.t.length - p - s > 0) rA.push([x.ini + p, x.ini + x.t.length - s]);
      if (y.t.length - p - s > 0) rB.push([y.ini + p, y.ini + y.t.length - s]);
    });
  } else {
    dA.forEach(x => rA.push([x.ini, x.ini + x.t.length]));
    dB.forEach(y => rB.push([y.ini, y.ini + y.t.length]));
  }
  return { rA: rA, rB: rB };
}

// MAYÚSCULA (char a char, para no cambiar la longitud con la ß) + negrita.
// Si el rango cubre palabras completas el error es la palabra entera, así que
// solo va en negrita (la mayúscula se reserva para marcar letras dentro de
// una palabra).
function richTextFehler(texto, rangos) {
  const chars = texto.split("");
  const esEspacio = c => c === undefined || /\s/.test(c);
  rangos.forEach(r => {
    if (esEspacio(texto[r[0] - 1]) && esEspacio(texto[r[1]])) return;
    for (let i = r[0]; i < r[1]; i++) {
      chars[i] = chars[i] === "ß" ? "ẞ" : chars[i].toUpperCase();
    }
  });
  const bold = SpreadsheetApp.newTextStyle().setBold(true).build();
  const builder = SpreadsheetApp.newRichTextValue().setText(chars.join(""));
  rangos.forEach(r => builder.setTextStyle(r[0], r[1], bold));
  return builder.build();
}

// Primera fila libre (desde FEHLER_FILA_DATOS) en la columna inicial de un bloque.
function primeraFilaLibreBloque(sheet, colInicio) {
  const ultima = sheet.getLastRow();
  if (ultima < FEHLER_FILA_DATOS) return FEHLER_FILA_DATOS;
  const vals = sheet.getRange(FEHLER_FILA_DATOS, colInicio, ultima - FEHLER_FILA_DATOS + 1, 1).getValues();
  for (let i = vals.length - 1; i >= 0; i--) {
    if (vals[i][0] !== "") return FEHLER_FILA_DATOS + i + 1;
  }
  return FEHLER_FILA_DATOS;
}

function escribirFilaFehler(sheet, bloque, fila, e) {
  const c = bloque.colInicio;
  const { rA, rB } = diferenciasFehler(e.original, e.corrected);
  // Sin diferencias detectadas (ej. solo cambió el orden): marcar todo.
  const marcaA = rA.length || rB.length ? rA : [[0, e.original.length]];
  const marcaB = rA.length || rB.length ? rB : [[0, e.corrected.length]];

  if (bloque.categoria === "Orthographie") {
    // Una sola celda "original, corregido".
    const off = e.original.length + 2;
    const texto = e.original + ", " + e.corrected;
    const rangos = marcaA.concat(marcaB.map(r => [r[0] + off, r[1] + off]));
    sheet.getRange(fila, c).setRichTextValue(richTextFehler(texto, rangos));
    return;
  }

  const celdaOrig = sheet.getRange(fila, c);
  celdaOrig.setRichTextValue(richTextFehler(e.original, marcaA));
  sheet.getRange(fila, c + 1).setRichTextValue(richTextFehler(e.corrected, marcaB));

  if (bloque.categoria === "Vokabeln") {
    const a1 = sheet.getRange(fila, c).getA1Notation();
    const a2 = sheet.getRange(fila, c + 1).getA1Notation();
    sheet.getRange(fila, c + 2).setFormula('=IFERROR(GOOGLETRANSLATE(' + a1 + ';"de";"es");"-")');
    sheet.getRange(fila, c + 3).setFormula('=IFERROR(GOOGLETRANSLATE(' + a2 + ';"de";"es");"-")');
  } else if (bloque.categoria === "Grammatik & Zeichensetzung") {
    sheet.getRange(fila, c + 2).setValue(e.explanation);
  }

  // Baja prioridad: la frase completa como nota de la celda "falsch".
  const conNota = ["Vokabeln", "Präpositionen und Verbvalenz", "Kollokationen & Satzbau"];
  if (e.context && conNota.indexOf(bloque.categoria) !== -1) celdaOrig.setNote(e.context);
}

// Importa los errores nuevos de la D1 a BD_FEHLER. Idempotente por id:
// ULTIMO_ID_FEHLER (PropertiesService) marca hasta dónde se importó.
function importarFehler() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) { Logger.log("importarFehler: otra ejecución en curso"); return; }

  try {
    const props = PropertiesService.getScriptProperties();
    const ultimoId = props.getProperty("ULTIMO_ID_FEHLER");

    const filas = ultimoId === null
      ? consultarD1("SELECT * FROM mistakes_de WHERE chat_id='david' AND created_at >= ? ORDER BY id", [FEHLER_DESDE_INICIAL])
      : consultarD1("SELECT * FROM mistakes_de WHERE chat_id='david' AND id > ? ORDER BY id", [Number(ultimoId)]);

    if (!filas.length) { Logger.log("importarFehler: nada nuevo"); return; }

    const sheet = SpreadsheetApp.openById(ID_HOJA).getSheetByName(FEHLER_HOJA);
    if (!sheet) throw new Error("No existe la hoja " + FEHLER_HOJA + " — correr prepararBdFehler()");

    const bloques = fehlerBloquesConColumna();
    const siguienteFila = {};
    // Un puntero por columna de seguimiento: una por bloque, salvo el
    // directorio (Artikel), que tiene una por género.
    const seguimiento = [];
    bloques.forEach(b => {
      if (b.directorio) b.columnas.forEach((_, i) => seguimiento.push({ clave: b.titulo + i, col: b.colInicio + i }));
      else seguimiento.push({ clave: b.titulo, col: b.colInicio });
    });
    seguimiento.forEach(c => { siguienteFila[c.clave] = primeraFilaLibreBloque(sheet, c.col); });

    // Como en VHS: la fecha ("Mon 21") se escribe en A solo en el primer error
    // del día, y al empezar un día nuevo todos los bloques se alinean a la
    // misma fila (la siguiente a la última escrita en cualquiera de ellos).
    let ultimoDia = props.getProperty("ULTIMO_DIA_FEHLER");
    let filaDia   = Number(props.getProperty("FILA_DIA_FEHLER")) || FEHLER_FILA_DATOS;

    let importadas = 0;
    filas.forEach(e => {
      const bloque = bloques.filter(b => b.categoria === e.category)[0];
      if (!bloque) { Logger.log("importarFehler: categoría desconocida '" + e.category + "' (id " + e.id + ")"); return; }

      const fecha = new Date(e.created_at);
      const dia = Utilities.formatDate(fecha, ZONA_HORARIA, "yyyy-MM-dd");
      if (dia !== ultimoDia) {
        filaDia = Math.max.apply(null, seguimiento.map(c => siguienteFila[c.clave]));
        seguimiento.forEach(c => { siguienteFila[c.clave] = filaDia; });
        sheet.getRange(filaDia, FEHLER_COL_FECHA).setValue(Utilities.formatDate(fecha, ZONA_HORARIA, "EEE d"));
        ultimoDia = dia;
      }
      // Un bloque sin nada aún en el día en curso arranca en la fila del día.
      siguienteFila[bloque.titulo] = Math.max(siguienteFila[bloque.titulo], filaDia);

      const fila = siguienteFila[bloque.titulo]++;
      escribirFilaFehler(sheet, bloque, fila, e);

      // Errores de Grammatik que dependen del artículo/caso: al directorio "Artikel".
      if (e.category === "Grammatik & Zeichensetzung" && esErrorDeCaso(e)) {
        const sus = sustantivoConArticulo(e);
        if (sus) {
          const bArt = bloques.filter(b => b.categoria === "Artikel")[0];
          const clave = bArt.titulo + sus.genero;
          siguienteFila[clave] = Math.max(siguienteFila[clave], filaDia);
          agregarAlDirectorio(sheet, bArt, sus, siguienteFila[clave]);
          siguienteFila[clave]++;
        }
        else Logger.log("importarFehler: sin sustantivo identificable para Artikel (id " + e.id + ")");
      }
      importadas++;
    });

    props.setProperty("ULTIMO_DIA_FEHLER", ultimoDia);
    props.setProperty("FILA_DIA_FEHLER", String(filaDia));
    props.setProperty("ULTIMO_ID_FEHLER", String(filas[filas.length - 1].id));
    Logger.log("importarFehler: " + importadas + "/" + filas.length + " filas importadas, último id " + filas[filas.length - 1].id);
  } finally {
    lock.releaseLock();
  }
}

// ------------------------------------------------------------
// Altura de filas (NO se llama desde importarFehler; usar a mano solo si el
// botón "Umbrechen" de Sheets no alcanza): por defecto 1 línea (texto recortado, sin ajuste). Solo si
// alguna celda de la fila no cabe en el ancho de su columna, la fila pasa a
// 2 líneas con ajuste de texto. El ancho de texto es una estimación.
// ------------------------------------------------------------
const FEHLER_ALTO_FILA    = 21;  // alto por defecto de Sheets (px)
const FEHLER_PX_POR_CHAR  = 7;   // ancho medio de un carácter (px)

function ajustarAlturasFehler(sheet, filas) {
  if (!filas.length) return;
  SpreadsheetApp.flush(); // que GOOGLETRANSLATE ya tenga valor
  const ultimaCol = sheet.getLastColumn();
  const anchos = [];
  for (let c = 1; c <= ultimaCol; c++) anchos.push(sheet.getColumnWidth(c));

  filas.forEach(fila => {
    const valores = sheet.getRange(fila, 1, 1, ultimaCol).getDisplayValues()[0];
    const necesitaDos = valores.some((v, i) => v.length * FEHLER_PX_POR_CHAR > anchos[i] - 8);
    sheet.getRange(fila, 1, 1, ultimaCol).setWrapStrategy(
      necesitaDos ? SpreadsheetApp.WrapStrategy.WRAP : SpreadsheetApp.WrapStrategy.CLIP);
    sheet.setRowHeight(fila, necesitaDos ? 2 * FEHLER_ALTO_FILA : FEHLER_ALTO_FILA);
  });
}

// Reaplica la regla a todas las filas de datos ya existentes.
function ajustarAlturasBdFehler() {
  const sheet = SpreadsheetApp.openById(ID_HOJA).getSheetByName(FEHLER_HOJA);
  const filas = [];
  for (let f = FEHLER_FILA_DATOS; f <= sheet.getLastRow(); f++) filas.push(f);
  ajustarAlturasFehler(sheet, filas);
}

// Instala el trigger diario 21:30 Europe/Berlin (no duplica si ya existe).
function crearTriggerFehler() {
  const existe = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === "importarFehler");
  if (existe) { Logger.log("Trigger de importarFehler ya existe"); return; }
  ScriptApp.newTrigger("importarFehler").timeBased().atHour(21).nearMinute(30)
    .inTimezone("Europe/Berlin").everyDays(1).create();
  Logger.log("Trigger creado: importarFehler diario ~21:30 Europe/Berlin");
}

// Para volver a importar desde cero (borra solo el marcador, no la hoja).
function resetearUltimoIdFehler() {
  const props = PropertiesService.getScriptProperties();
  ["ULTIMO_ID_FEHLER", "ULTIMO_DIA_FEHLER", "FILA_DIA_FEHLER"].forEach(k => props.deleteProperty(k));
}

// ============================================================
// REPASO DE ERRORES (Telegram)
// Un solo mensaje diario con hasta FEHLER_REPASO_MAX errores de la D1,
// tomados de los días indicados en FEHLER_REPASO_DIAS (hace N días).
// Sin Orthographie; de Grammatik solo los errores de artículos.
// Lo correcto va en spoiler; la frase original se muestra como contexto.
// ============================================================

const FEHLER_REPASO_MAX  = 6;
const FEHLER_REPASO_DIAS = [0, 1, 3, 7];

// Orden de aparición en el mensaje (y categorías que participan).
const FEHLER_REPASO_CATEGORIAS = [
  { categoria: "Vokabeln",                     titulo: "Vokabeln" },
  { categoria: "Kollokationen & Satzbau",      titulo: "Kollokation & Satzbau" },
  { categoria: "Präpositionen und Verbvalenz", titulo: "Präposition & Verbvalenz" },
  { categoria: "Grammatik & Zeichensetzung",   titulo: "Grammatik (Artikel)" },
];

const FEHLER_ARTIKEL = ["der", "die", "das", "den", "dem", "des", "ein", "eine", "einen",
                        "einem", "einer", "eines", "kein", "keine", "keinen", "keinem", "keiner"];

// ¿La corrección cambia un artículo? (palabras que difieren entre original y corregido)
function esErrorDeArticulo(e) {
  if (/artikel/i.test(e.explanation || "")) return true;
  const pal = t => t.toLowerCase().split(/\s+/).filter(Boolean);
  const o = pal(e.original), c = pal(e.corrected);
  const difieren = o.filter(w => c.indexOf(w) === -1).concat(c.filter(w => o.indexOf(w) === -1));
  return difieren.some(w => FEHLER_ARTIKEL.indexOf(w) !== -1);
}

// ¿El error de Grammatik se debe a artículo/género/caso (declinación)? Amplía
// esErrorDeArticulo con la explicación: Kasus, Genus, adjetivos, Nebensatz...
const FEHLER_CASO_RE = /artikel|nominativ|akkusativ|dativ|genitiv|kasus|genus|deklination|adjektiv|endung|maskulin|feminin|neutrum|plural|nebensatz/i;
function esErrorDeCaso(e) {
  return esErrorDeArticulo(e) || FEHLER_CASO_RE.test(e.explanation || "");
}

// Sustantivo con su artículo, p. ej. {genero: 0, nombre: "Hotspot"} (genero =
// índice en FEHLER_GENEROS). Primero busca "der/die/das X" en la explicación;
// si no, toma el género de la explicación y el sustantivo (primera palabra con
// mayúscula) de la frase corregida. null si no se puede saber.
function sustantivoConArticulo(e) {
  const expl = e.explanation || "";
  if (/substantiviert/i.test(expl)) return null; // "etwas Ähnliches": no es un sustantivo de verdad
  const esPlural = /plural/i.test(expl) && !/person\s+plural/i.test(expl);
  const m = esPlural ? null : expl.match(/\b(der|die|das)\s+([A-ZÄÖÜ][\wäöüßÄÖÜ-]*)/);
  if (m) {
    const g = FEHLER_GENEROS.map(x => x.art).indexOf(m[1].toLowerCase());
    return { genero: g, nombre: m[2] };
  }

  let g = -1;
  if (esPlural) g = 3;
  else if (/maskulin/i.test(expl)) g = 0;
  else if (/neutrum/i.test(expl)) g = 1;
  else if (/feminin/i.test(expl)) g = 2;
  if (g === -1) return null;

  const palabras = (e.corrected || "").split(/\s+/).map(w => w.replace(/^[^\wäöüßÄÖÜ]+|[^\wäöüßÄÖÜ-]+$/g, ""));
  const mayus = palabras.filter((w, i) => /^[A-ZÄÖÜ]/.test(w) && !(i === 0 && palabras.length > 1 && /^(Sie|Ihnen|Ich|Wir|Es)$/.test(w)));
  if (!mayus.length) return null;
  return { genero: g, nombre: mayus[0] };
}

// Escribe "▲ Nombre" en `fila`, bajo su género. El formato depende de cuántas
// veces estuvo ya el sustantivo en la columna (error repetido):
//   1.ª vez: solo el símbolo en color
//   2.ª vez: todo el texto en color
//   3.ª vez: color + negrita
//   4.ª vez o más: color + negrita + MAYÚSCULAS
// Devuelve siempre true.
function agregarAlDirectorio(sheet, bloque, s, fila) {
  const gen = FEHLER_GENEROS[s.genero];
  const col = bloque.colInicio + s.genero;
  const base = gen.simbolo + " " + s.nombre;
  const ultima = sheet.getLastRow();
  let previas = 0;
  if (ultima >= FEHLER_FILA_DATOS) {
    const vals = sheet.getRange(FEHLER_FILA_DATOS, col, ultima - FEHLER_FILA_DATOS + 1, 1).getValues();
    previas = vals.filter(v => String(v[0]).toLowerCase() === base.toLowerCase()).length;
  }
  const vez = previas + 1;
  // Char a char para no cambiar la longitud con la ß (como richTextFehler).
  const texto = vez >= 4
    ? base.split("").map(c => c === "ß" ? "ẞ" : c.toUpperCase()).join("")
    : base;
  const estilo = SpreadsheetApp.newTextStyle().setForegroundColor(gen.color).setBold(vez >= 3).build();
  sheet.getRange(fila, col).setRichTextValue(
    SpreadsheetApp.newRichTextValue().setText(texto)
      .setTextStyle(0, vez === 1 ? gen.simbolo.length : texto.length, estilo).build());
  return true;
}

// Reconstruye "Artikel" desde los errores que ya están en Grammatik (B-D): cada
// entrada queda en la MISMA fila que su error (misma fecha). Borra antes las
// filas de datos de O-R (incluye lo escrito a mano ahí). Correr tras prepararBdFehler().
function rellenarArtikelDesdeHoja() {
  const sheet = SpreadsheetApp.openById(ID_HOJA).getSheetByName(FEHLER_HOJA);
  const bloques = fehlerBloquesConColumna();
  const gram = bloques.filter(b => b.categoria === "Grammatik & Zeichensetzung")[0];
  const art  = bloques.filter(b => b.categoria === "Artikel")[0];
  const ultima = sheet.getLastRow();
  if (ultima < FEHLER_FILA_DATOS) return;

  const vals = sheet.getRange(FEHLER_FILA_DATOS, gram.colInicio, ultima - FEHLER_FILA_DATOS + 1, 3).getValues();
  sheet.getRange(FEHLER_FILA_DATOS, art.colInicio, ultima - FEHLER_FILA_DATOS + 1, art.columnas.length).clearContent();
  let nuevas = 0;
  vals.forEach((v, i) => {
    const e = { original: String(v[0]), corrected: String(v[1]), explanation: String(v[2]) };
    if (!e.corrected || !esErrorDeCaso(e)) return;
    const sus = sustantivoConArticulo(e);
    if (sus && agregarAlDirectorio(sheet, art, sus, FEHLER_FILA_DATOS + i)) nuevas++;
  });
  Logger.log("rellenarArtikelDesdeHoja: " + nuevas + " entradas escritas");
}

function escaparHtml(t) {
  return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Candidatos de los días objetivo, intercalados (uno por intervalo, en rondas)
// para que ningún intervalo se quede sin representación al recortar a MAX.
function elegirErroresRepaso() {
  const fechas = FEHLER_REPASO_DIAS.map(n =>
    Utilities.formatDate(new Date(Date.now() - n * 86400000), ZONA_HORARIA, "yyyy-MM-dd"));
  const cats = FEHLER_REPASO_CATEGORIAS.map(c => c.categoria);

  const filas = consultarD1(
    "SELECT id, category, original, corrected, explanation, context, date(created_at) AS dia " +
    "FROM mistakes_de WHERE chat_id='david' " +
    "AND category IN (" + cats.map(() => "?").join(",") + ") " +
    "AND date(created_at) IN (" + fechas.map(() => "?").join(",") + ") ORDER BY id",
    cats.concat(fechas));

  const validas = filas.filter(e => e.category !== "Grammatik & Zeichensetzung" || esErrorDeArticulo(e));
  const porDia = fechas.map(f => validas.filter(e => e.dia === f));

  const elegidos = [];
  let ronda = 0, quedan = true;
  while (quedan) {
    quedan = false;
    porDia.forEach(lista => {
      if (ronda < lista.length) { elegidos.push(lista[ronda]); quedan = true; }
    });
    ronda++;
  }
  return { elegidos: elegidos.slice(0, FEHLER_REPASO_MAX), total: elegidos.length };
}

function enviarRepasoFehler() {
  const { elegidos, total } = elegirErroresRepaso();
  if (!elegidos.length) { Logger.log("enviarRepasoFehler: sin errores para repasar hoy"); return; }

  let msg = "🧠 <b>Fehler-Repaso</b>\n";
  FEHLER_REPASO_CATEGORIAS.forEach(c => {
    const lista = elegidos.filter(e => e.category === c.categoria);
    if (!lista.length) return;
    msg += "\n<b>" + c.titulo + "</b>\n";
    lista.forEach(e => {
      msg += "❌ " + escaparHtml(e.original) + "\n" +
             "✅ <tg-spoiler>" + escaparHtml(e.corrected) + "</tg-spoiler>\n";
      if (e.context) msg += "💬 <i>" + escaparHtml(e.context) + "</i>\n";
      msg += "\n";
    });
  });
  if (total > elegidos.length) msg += "+" + (total - elegidos.length) + " más sin mostrar\n";

  enviarTelegram(msg.trim());
  Logger.log("enviarRepasoFehler: " + elegidos.length + "/" + total + " errores enviados");
}

// Instala el trigger diario 21:30 Europe/Berlin (no duplica si ya existe).
function crearTriggerRepasoFehler() {
  const existe = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === "enviarRepasoFehler");
  if (existe) { Logger.log("Trigger de enviarRepasoFehler ya existe"); return; }
  ScriptApp.newTrigger("enviarRepasoFehler").timeBased().atHour(21).nearMinute(30)
    .inTimezone(ZONA_HORARIA).everyDays(1).create();
  Logger.log("Trigger creado: enviarRepasoFehler diario ~21:30 " + ZONA_HORARIA);
}
