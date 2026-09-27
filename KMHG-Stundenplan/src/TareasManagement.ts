// ============================================================
// TareasManagement — conteo de horas por actividad (solo Google Sheets)
//
// Layout esperado de la hoja (primera pestaña):
//   C2:I49   calendario semanal (columnas = Lun..Dom, filas = bloques de 30 min)
//   K17:K40  tags de cada actividad, separados por coma (ej. "zzz,siesta")
//   L17:L40  color de cada actividad (fondo de la celda)
//   M17:M40  copia del color (la llena aplicarFormatoCondicional)
//   N17:N40  horas contadas por actividad (la llena actualizarHorasPorActividad)
//   K22:S32  proyectos: K = tags, O = horas objetivo, S = tamaños de bloque
//   L22:L32  colores de los proyectos (cuentan como horas laborales)
//   L40      color de "Arbeit"
//   C52:I52  horas laborales por día (la llena actualizarHorasLaboralesDiurnas)
//   N13      checkbox "botón" para recalcular horas (útil desde el móvil)
// ============================================================

const tasksEndRow = 40;
const projectsEndRow = 32;

// ------------------------------------------------------------
// Menú
// ------------------------------------------------------------
function onOpen(): void {
  SpreadsheetApp.getUi()
    .createMenu('📅 Calendario Semanal')
    .addItem('Sincronizar tags con colores', 'aplicarFormatoCondicional')
    .addItem('Actualizar horas por categoría', 'actualizarHorasPorActividad')
    .addItem('Actualizar horas por día', 'actualizarHorasLaboralesDiurnas')
    .addItem('Actualizar horas por categoría y por día', 'updateTotalAmountHours')
    .addToUi();
}

// Checkbox N13 = botón de recalcular (para usar desde el móvil).
// onEdit simple corre en modo restringido: solo puede tocar la hoja activa.
function onEdit(e: GoogleAppsScript.Events.SheetsOnEdit): void {
  const rango = e.range;

  if (rango.getA1Notation() === 'N13' && rango.getValue() === true) {
    updateTotalAmountHours();
    rango.setValue(false); // reinicia el "botón"
  }

  if (rango.getA1Notation() === 'N5' && rango.getValue() === true) {
    cleanEmptyCells();
    rango.setValue(false);
  }
}

// Para usar en escritorio
function updateTotalAmountHours(): void {
  actualizarHorasPorActividad();
  actualizarHorasLaboralesDiurnas();
}

// ------------------------------------------------------------
// Formato
// ------------------------------------------------------------
// Pone fondo blanco a las celdas vacías del calendario
function cleanEmptyCells(): void {
  const hoja = SpreadsheetApp.getActiveSheet();
  const targetRange = hoja.getRange('C2:I49');

  const values = targetRange.getValues();
  const backgrounds = targetRange.getBackgrounds();

  for (let r = 0; r < values.length; r++) {
    for (let c = 0; c < values[r].length; c++) {
      if (values[r][c] === '') {
        backgrounds[r][c] = '#ffffff';
      }
    }
  }

  targetRange.setBackgrounds(backgrounds);
}

// Crea una regla de formato condicional por actividad: si la celda contiene
// alguno de los tags de K, se pinta con el color de L.
function aplicarFormatoCondicional(): void {
  const hoja = SpreadsheetApp.getActiveSheet();
  const reglas: GoogleAppsScript.Spreadsheet.ConditionalFormatRule[] = [];

  const tablaRef = hoja.getRange(`K17:K${tasksEndRow}`).getValues();
  const colores = hoja.getRange(`L17:L${tasksEndRow}`).getBackgrounds();

  hoja.getRange(`M17:M${tasksEndRow}`).setValues(colores);

  for (let i = 0; i < tablaRef.length; i++) {
    if (tablaRef[i][0]) {
      const palabras = tablaRef[i][0].toString().split(',');
      const patron = palabras
        .map((p: string) => 'REGEXMATCH(LOWER(C2); "' + p.trim().toLowerCase() + '")')
        .join('; ');
      const formula = '=OR(' + patron + ')';

      reglas.push(
        SpreadsheetApp.newConditionalFormatRule()
          .whenFormulaSatisfied(formula)
          .setBackground(colores[i][0])
          .setRanges([hoja.getRange('C2:I49')])
          .build()
      );
    }
  }

  hoja.setConditionalFormatRules(reglas);
}

// ------------------------------------------------------------
// Conteo de horas
// ------------------------------------------------------------

// Cuenta bloques por color (no tachados) y escribe las horas en N17:N40.
// Un bloque = 0.5h; una celda con "/2" cuenta como medio bloque (0.25h).
function actualizarHorasPorActividad(): void {
  const hoja = SpreadsheetApp.getActiveSheet();
  const range = hoja.getRange('C2:I49');

  const backgrounds = range.getBackgrounds().flat();
  const fontLines = range.getFontLines().flat();
  const valores = range.getValues().flat();

  const conteo: { [color: string]: number } = {};

  for (let i = 0; i < backgrounds.length; i++) {
    const color = backgrounds[i];
    const tachado = fontLines[i] === 'line-through';
    if (!tachado) {
      const esMedioBloque = String(valores[i]).includes('/2');
      conteo[color] = (conteo[color] || 0) + (esMedioBloque ? 0.5 : 1);
    }
  }

  const listaColores = hoja.getRange(`M17:M${tasksEndRow}`).getValues();
  const mappedHours = listaColores.map(([color]) => [conteo[color] * 0.5 || 0]);

  hoja.getRange(`N17:N${tasksEndRow}`).setValues(mappedHours);
}

// Calcula las horas laborales de cada día (C..I) y las pega como valor
// plano en C52:I52 (B52 es etiqueta). Se pasa la hoja por parámetro para
// poder usarla también desde un trigger de tiempo (sin hoja "activa").
function actualizarHorasLaboralesDiurnas(hojaParam?: GoogleAppsScript.Spreadsheet.Sheet): void {
  const hoja = hojaParam || SpreadsheetApp.getActiveSheet();
  const valores: number[] = [];

  for (let i = 0; i < 7; i++) {
    valores.push(HORAS_LABORALES(hoja, i + 3, 2, 49));
  }

  hoja.getRange(52, 3, 1, 7).setValues([valores]);
}

// Horas de una columna cuyo fondo es de un proyecto (L22:L32), sin tachar.
// columna empieza en 1 (C = 3).
function HORAS_LABORALES(
  activeSheet: GoogleAppsScript.Spreadsheet.Sheet,
  columna: number,
  filaInicio: number,
  filaFin: number
): number {
  const targetColors = activeSheet.getRange(`L22:L${projectsEndRow}`).getBackgrounds().flat();

  const range = activeSheet.getRange(filaInicio, columna, filaFin - filaInicio + 1, 1);
  const backgrounds = range.getBackgrounds().flat();
  const fontLines = range.getFontLines().flat();
  const valores = range.getValues().flat();

  let totalHoras = 0;

  for (let i = 0; i < backgrounds.length; i++) {
    const tachado = fontLines[i] === 'line-through';
    if (targetColors.includes(backgrounds[i].toLowerCase()) && !tachado) {
      const esMedioBloque = String(valores[i]).includes('/2');
      totalHoras += esMedioBloque ? 1 : 2; // unidades de 0.25h
    }
  }

  return totalHoras * 0.25;
}
