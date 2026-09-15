//Las mas importantes de toodo el mes

function copiarCeldasUltimoMes(filaInicio, filaFin) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getActiveSheet();

  // 🔧 Parámetros por defecto si no se pasan
  filaInicio = filaInicio || 730;
  filaFin = filaFin || 901;

  const boldColumns = [
    { col: 9, name: "I", tag: "Erriner!" }, // I Erriner!
    { col: 2, name: "B", tag: "Neue" }, // B
    { col: 5, name: "E", tag: "Wichtigste"}  // E
  ];

  // Dejelo mas similar a worteDesTages, que appende a la ultima fila, mas no que vuelva a escribirla desde cero.
  // ToDo y ya no es necesario crear la hoja,ahi esta
  const outputName = "WoerteDesMonatsCSV";
  let outputSheet = ss.getSheetByName(outputName);
  if (!outputSheet) {
    outputSheet = ss.insertSheet(outputName);
  } else {
    outputSheet.clear();
  }

  outputSheet.appendRow([
    "Tag",
    "Name",
    "Texto",
    "Traducción (DE → ES)"
  ]);

  //  let outputRow = 2;
  let outputRow = outputSheet.getLastRow() + 1;


  // 🔍 Columnas B y E (solo negrilla)
  boldColumns.forEach(({ col, name, tag }) => {
    const range = sheet.getRange(filaInicio, col, filaFin - filaInicio + 1, 1);
    const richTextValues = range.getRichTextValues();

    richTextValues.forEach((row, i) => {
      const richText = row[0];
      if (!richText) return;

      const runs = richText.getRuns();
      const isBold = runs.some(run => run.getTextStyle().isBold());
      const text = richText.getText().trim();

      if (isBold && text !== "") {
        outputSheet.getRange(outputRow, 1).setValue(tag);
        outputSheet.getRange(outputRow, 2).setValue(name);
        outputSheet.getRange(outputRow, 3).setValue(text);
        outputSheet
          .getRange(outputRow, 4)
          .setFormula(`=GOOGLETRANSLATE(C${outputRow};"de";"es")`);
        outputRow++;
      }
    });
  });


  //SpreadsheetApp.getUi().alert("✅ Proceso completado con éxito.");
}


// de las de cada dia

function worteDesTages(startRow, endRow) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 🔁 AJUSTA ESTE NOMBRE a la hoja del vocabulario del mes
  const sourceSheet = ss.getSheetByName("WoerterDesTages");
  if (!sourceSheet) {
    SpreadsheetApp.getUi().alert("❌ No se encontró la hoja WoerterDesTages");
    return;
  }

  const targetSheet = ss.getSheetByName("WoerteDesMonatsCSV");
  if (!targetSheet) {
    SpreadsheetApp.getUi().alert("❌ No existe la hoja 'WoerteDesMonatsCSV'");
    return;
  }

  const columns = [
    { col: 2, name: "B", tag: "WortDesTages" },
    { col: 3, name: "C", tag: "WortDesTages" },
    { col: 4, name: "D", tag: "TagErriner!" } // D tiene prioridad
  ];

  let outputRow = targetSheet.getLastRow() + 1;

  columns.forEach(({ col, name, tag }) => {
    const range = sourceSheet.getRange(
      startRow,
      col,
      endRow - startRow + 1,
      1
    );

    const richTextValues = range.getRichTextValues();
    const plainValues = range.getValues();

    /**
     * 
     */

    richTextValues.forEach((row, i) => {
      const richText = row[0];
      const text = plainValues[i][0];

      if (!text || text.toString().trim() === "") return;

      let isBold = false;
      if (richText) {
        const runs = richText.getRuns();
        isBold = runs.some(run => run.getTextStyle().isBold());
      }

        targetSheet.getRange(outputRow, 1).setValue(isBold ? "WichtigDesTages" : tag );
        targetSheet.getRange(outputRow, 2).setValue(name);
        targetSheet.getRange(outputRow, 3).setValue(text);
        targetSheet
          .getRange(outputRow, 4)
          .setFormula(`=GOOGLETRANSLATE(C${outputRow};"de";"es")`);
        
    
        outputRow++;
    });
  });

  //SpreadsheetApp.getUi().alert("🟠 Worte des Tages añadidos correctamente.");
}

function exportToCSV() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("WoerteDesMonatsCSV");

  if (!sheet) {
    SpreadsheetApp.getUi().alert("❌ Sheet 'WoerteDesMonatsCSV' not found.");
    return;
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    SpreadsheetApp.getUi().alert("⚠️ No data to export.");
    return;
  }
  //console.log(`este es el rango`)


  // Read columns C & D (values only)
  const range = sheet.getRange(2, 3, lastRow - 1, 2);
  const values = range.getDisplayValues(); // ensures formulas → text

  // Build CSV
  let csv = "";
  values.forEach(row => {
    const german = row[0]?.toString().replace(/"/g, '""') || "";
    const spanish = row[1]?.toString().replace(/"/g, '""') || "";
    if (german && spanish) {
      csv += `${german},${spanish}\n`;
      //console.log(`${german},${spanish}\n`)
    }
  });

  // Create file in Drive
  const dayNextMonth = 3;
  const month = Utilities.formatDate(new Date(Date.now() - ((dayNextMonth  +1) * 24 * 60 * 60 * 1000)) , Session.getScriptTimeZone(), "yyyy-MM");
  const fileName = `Quizlet_${month}.csv`;

  const file = DriveApp.createFile(fileName, csv, MimeType.CSV);
  const url = "https://drive.google.com/uc?export=download&id=" + file.getId();

  console.log(url);
  Logger.log(url);

  /*SpreadsheetApp.getUi().alert(
    `✅ CSV created successfully!\n\nFile: ${fileName}\nLocation: Google Drive`
  );*/
}

function highlightDuplicatedWords(endRow) {
  

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  endRow = endRow || 350;

  const targetSheet = ss.getSheetByName("WoerteDesMonatsCSV");
  const rango = targetSheet.getRange("C2:C"+endRow);
  const valores = rango.getValues();

  const mapa = {};
  const colores = [];

  // 1. Contar ocurrencias
  valores.forEach(([valor]) => {
    if (valor) {
      mapa[valor] = (mapa[valor] || 0) + 1;
    }
  });

  // 2. Pintar colores
  valores.forEach(([valor]) => {
    if (valor && mapa[valor] > 1) {
      colores.push(["#ff9999"]); // rojo
    } else {
      colores.push([null]); // sin color
    }
  });

  // 3. Aplicar colores
  rango.setBackgrounds(colores);
}

  
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('Sync Wörter')
    .addItem('Wörter des Tages', 'copylastMonth')
    .addItem('Export Wörter des Monats to CSV', 'exportToCSV')
    .addItem('Highlight duplicates', 'highlightDuplicatedWords')
    .addToUi();
}

function copylastMonth() {
  worteDesTages(3, 35) ;
}

/**
 * Modo de uso: 
 * Prioridad de palabras: 
 * Wort des Tages , y aun mas ultima columna de erinnern! Llama a worteDesTages()
 * Negrillas en el ultimo mes
 */

function boldLastMonth() {

  //Write rows of last month

  worteDesTages(3, 33) ;
 // copiarCeldasUltimoMes(901, 1150);

  //highlightDuplicatedWords(207);
  //highlightDuplicatedWords(177);
}

function findDuplicatesInColumnI() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

  const lastRow = sheet.getLastRow();
  const values = sheet.getRange(`I1:I${lastRow}`).getValues();

  const map = {};

  values.forEach((row, index) => {
    const originalValue = String(row[0]).trim();

    if (!originalValue) return;

    const normalizedValue = normalizeText(originalValue);

    if (!map[normalizedValue]) {
      map[normalizedValue] = {
        rows: [],
        originals: []
      };
    }

    map[normalizedValue].rows.push(index + 1);
    map[normalizedValue].originals.push(originalValue);
  });

  const duplicates = Object.entries(map)
    .filter(([_, data]) => data.rows.length > 1)
    .sort((a, b) => b[1].rows.length - a[1].rows.length);

  console.log("===== DUPLICADOS ORDENADOS =====");

  duplicates.forEach(([normalized, data], idx) => {
    console.log(`
    #${idx + 1}
    Normalizado: ${normalized}
    Cantidad: ${data.rows.length}
    Filas: ${data.rows.join(", ")}
    Ejemplos: ${[...new Set(data.originals)].slice(0, 5).join(" | ")}
    `);
  });

  console.log("================================");
  console.log(`Valores duplicados distintos: ${duplicates.length}`);

  const totalDuplicateCells =
    duplicates.reduce((sum, d) => sum + d[1].rows.length, 0);

  console.log(`Total celdas duplicadas: ${totalDuplicateCells}`);
}

function normalizeText(text) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // elimina acentos
    .toUpperCase()
    .replace(/[^\p{L}\p{N}]/gu, "") // elimina puntuación y espacios
    .trim();
}

