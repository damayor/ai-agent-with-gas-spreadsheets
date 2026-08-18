const tasksEndRow = 39
const SPREADSHEET_ID = '1fULXN0xEEM5gGVhuMwWK67fJqHAkUDdwI9EvwzNFtVs';

function limpiarCalendario() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  
  // Limpiar colores del área de calendario (C2:I49)
  sheet.getRange("C2:I49").setBackground('#ffffff');
  
  SpreadsheetApp.getUi().alert('✅ Calendario limpiado!');
}

function aplicarFormatoCondicional() {
  var hoja = SpreadsheetApp.getActiveSheet();
  var reglas = [];
  
  // Lee tu tabla de referencia (ajusta el rango)
  var tablaRef = hoja.getRange(`K17:K${tasksEndRow}`).getValues();
  var colores = hoja.getRange(`L17:L${tasksEndRow}`).getBackgrounds();

  console.log("Refs", tablaRef, colores)

  hoja.getRange(`M17:M${tasksEndRow}`).setValues(colores);
  
  for (var i = 0; i < tablaRef.length; i++) {
    if (tablaRef[i][0]) { // Si hay palabras clave
      var palabras = tablaRef[i][0].toString().split(",");
      var patron = palabras.map(p => "REGEXMATCH(LOWER(C2); \"" + p.trim().toLowerCase() + "\")").join("; ");
      var formula = "=OR(" + patron + ")";
      
     // var formula = "=AND(LEN(C2)>0, OR(" + patron + "))";
      var color = colores[i][0];
      
      var regla = SpreadsheetApp.newConditionalFormatRule()
        .whenFormulaSatisfied(formula)
        .setBackground(color)
        .setRanges([hoja.getRange("C2:I49")]) // Tu rango del calendario
        .build();
      
      reglas.push(regla);


    }
  }
  
  hoja.setConditionalFormatRules(reglas);
}

function actualizarHorasPorActividad() {
  const hoja = SpreadsheetApp.getActiveSheet();
  const range = hoja.getRange("C2:I49");

  const backgrounds = range.getBackgrounds().flat();
  const fontLines = range.getFontLines().flat();

  console.log("backgrounds", backgrounds);
  console.log("fontLines", fontLines);

  const conteo = {};

  // 1. Contar todos los backgrounds en una sola pasada
  for (let i = 0; i < backgrounds.length; i++) {

      const color = backgrounds[i];
      const tachado = fontLines[i] === "line-through";
      if(!tachado)
        conteo[color] = (conteo[color] || 0) +  1;
    
  }

  // 2. Leer lista de backgrounds (ej: M17:M39)
  const listaColores = hoja.getRange(`M17:M${tasksEndRow}`).getValues();

  // 3. Mapear resultados
  const mappedHours = listaColores.map(([color]) => {
    return [conteo[color]* 0.5 || 0];
  });

  console.log("backgrounds mappeados: ", mappedHours);

  // 4. Escribir resultados de una vez (N2:N31)
  hoja.getRange(`N17:N${tasksEndRow}`).setValues(mappedHours);
}

//to use in Mobile
function onEdit(e) {
  const rango = e.range;
  if (rango.getA1Notation() === "N13" && rango.getValue() === true) {
    actualizarHorasPorActividad(); // Aquí llamas a tu método

    for (let i = 0; i < 7  ; i++) {
     HORAS_LABORALES(i+3, 2, 49 ); 
    }

    rango.setValue(false); // Reinicia el "botón"
  }
  /*
  if (rango.getA1Notation() === "B55" && rango.getValue() === true) {
    for (let i = 0; i < 7  ; i++) {
     HORAS_LABORALES(i+3, 2, 49 ); 
    }
    rango.setValue(false); // Reinicia el "botón"
  }*/

  if (rango.getA1Notation() === "N5" && rango.getValue() === true) {
      const hoja = SpreadsheetApp.getActiveSheet();

      const targetRange = hoja.getRange("C2:I49");
      console.log("bgs a blanco");


      const values = targetRange.getValues();
      const backgrounds = targetRange.getBackgrounds();

      for (let r = 0; r < values.length; r++) {
        for (let c = 0; c < values[r].length; c++) {
          if (values[r][c] === "") {
            backgrounds[r][c] = "#ffffff";
          }
      }
    }
  }
  

}

function cleanEmptyCells() {
    const stdRange = hoja.getRange("C2:I49");

    var data = stdRange.getValues();
    //Do a for
    if (rango.getValue() === "") {
        rango.setBackground("#ffffff"); // Set to white when empty
    }
    

  
}


//col starts en 1, no en 0
function HORAS_LABORALES(columna, filaInicio, filaFin) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const activeSheet = ss.getActiveSheet();
  var targetColors = activeSheet.getRange(`L22:L31`).getBackgrounds().flat();
  var arbeitColors = activeSheet.getRange(`L39`).getBackgrounds().flat();

  const range = activeSheet.getRange(filaInicio, columna, filaFin - filaInicio + 1, 1);
  const backgrounds = range.getBackgrounds().flat();
  const fontLines = range.getFontLines().flat();

  console.log("backgrounds", arbeitColors);

  let totalHoras = 0;

  for (let i = 0; i < backgrounds.length; i++) {
    const color = backgrounds[i];
    const tachado = fontLines[i] === "line-through";
    if (targetColors.includes(color.toLowerCase()) && !tachado) {
      totalHoras++;
    }

  }
  
  console.log(activeSheet.getName() + " - Horas de la col ", columna, ": ", totalHoras * 0.5);
  return totalHoras * 0.5;
}

function HORAS_LAB_DISPONIBLES(columna, filaInicio, filaFin) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const activeSheet = ss.getActiveSheet();
  var targetColor = "#990000"
  const range = activeSheet.getRange(filaInicio, columna, filaFin - filaInicio + 1, 1);
  const backgrounds = range.getBackgrounds().flat();
  const fontLines = range.getFontLines().flat();

  let totalHoras = 0;

  for (let i = 0; i < backgrounds.length; i++) {
    const color = backgrounds[i];
    
    if (targetColor ==  color.toLowerCase() ) {
      totalHoras++;
    }

  }
  
  console.log(activeSheet.getName() + "Horas de la col ", columna, ": ", totalHoras * 0.5);
  return totalHoras * 0.5;
}

/**
 * Devuelve si cumpliste las 8h laborales del día.
 * Uso: =CUMPLE_8H("C2:C100")
 * Devuelve: "✅ 9.5h / 8h" o "❌ 6h / 8h"
 *  =HORAS_LABORALES("B2:B50")        → número total de horas laborales del día
    =CUMPLE_8H("B2:B50")              → "✅ 8.5h / 8h"  o  "❌ 6h / 8h"
    =CUMPLE_8H("B2:B50", 6) 
 */
function CUMPLE_8H(sumRangeA1, metaHoras = 8) {
  const horas = HORAS_LABORALES(sumRangeA1);
  const cumple = horas >= metaHoras;
  return `${cumple ? "✅" : "❌"} ${horas}h / ${metaHoras}h`;
}




function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('📅 Calendario Semanal')
    .addItem('Limpiar Calendario', 'limpiarCalendario')
    .addItem('Sincronizar tags con colores', 'aplicarFormatoCondicional')
    .addItem('Actualizar contar horas por color', 'actualizarHorasPorActividad')
    .addItem('Test solo para update HORAS_LAB', 'test')
    .addItem('distribuirProyectos', 'distribuirProyectos')
    .addToUi();
}

function test() {
  
  
    for (let i = 0; i < 7  ; i++) {
     HORAS_LABORALES(i+3, 2, 49 ); 
    }
    rango.setValue(false); // Reinicia el "botón"
  
  //actualizarHorasPorActividad()

}

function distribuirProyectos() {
  var hoja = SpreadsheetApp.getActiveSheet();
  
  // GUARDAR ESTADO ANTERIOR PARA DESHACER
  //guardarEstadoAnterior();
  
  // 1. LEER PROYECTOS (filas 22-31)
  var proyectos = [];
  var datosProyectos = hoja.getRange("K22:S31").getValues();
  
  for (var i = 0; i < datosProyectos.length; i++) {
    var tags = datosProyectos[i][0]; // Columna K
    var horasObjetivo = datosProyectos[i][4]; // Columna O
    var bloques = datosProyectos[i][8]; // Columna S
    
    if (tags && horasObjetivo > 0) {
      var nombreProyecto = tags.toString().split(",")[0].trim();
      var tamanosBloques = bloques.toString().split(",").map(function(b) {
        return parseFloat(b.trim());
      }).filter(function(b) { return !isNaN(b); });
      
      proyectos.push({
        nombre: nombreProyecto,
        horasObjetivo: parseFloat(horasObjetivo),
        tamanosBloques: tamanosBloques,
        horasAsignadas: 0,
        asignacionesPorDia: [0, 0, 0, 0, 0, 0, 0] // Contador por día
      });
    }
  }
  
  Logger.log("Proyectos detectados: " + proyectos.length);
  
  // 2. DETECTAR BLOQUES ROJOS DISPONIBLES (C2:I49)
  var rangoCalendario = hoja.getRange("C2:I49");
  var valores = rangoCalendario.getValues();
  var colores = rangoCalendario.getBackgrounds();
  
  var bloquesLibres = [];
  
  // Detectar bloques rojos consecutivos
  for (var col = 0; col < 7; col++) { // 7 días (C a I)
    var bloqueActual = null;
    
    for (var fila = 0; fila < valores.length; fila++) {
      var color = colores[fila][col].toLowerCase();
      var esRojo = color.includes("99") || color.includes("cc0000") || 
                   color.includes("8b0000") || color.includes("a00000") ||
                   color.includes("800000");
      
      if (esRojo) {
        if (bloqueActual === null) {
          bloqueActual = {
            col: col,
            filaInicio: fila,
            tamanioOriginal: 0.5,
            fragmentos: [] // Para trackear cómo se subdivide
          };
        } else {
          bloqueActual.tamanioOriginal += 0.5;
        }
      } else {
        if (bloqueActual !== null) {
          bloquesLibres.push(bloqueActual);
          bloqueActual = null;
        }
      }
    }
    
    if (bloqueActual !== null) {
      bloquesLibres.push(bloqueActual);
    }
  }
  
  Logger.log("Bloques libres detectados: " + bloquesLibres.length);
  
  // 3. ALGORITMO DE ASIGNACIÓN MEJORADO
  var asignaciones = [];
  
  // Round-robin: asignar 1 bloque por proyecto en cada pasada
  var proyectosActivos = proyectos.slice();
  var intentos = 0;
  var maxIntentos = 1000; // Evitar loops infinitos

  // Ordenar proyectos: primero los que tienen bloques más grandes
  proyectos.sort(function(a, b) {
    var maxBloqueA = Math.max.apply(Math, a.tamanosBloques);
    var maxBloqueB = Math.max.apply(Math, b.tamanosBloques);
    return maxBloqueB - maxBloqueA; // Mayor a menor
  });

  // Ordenar bloques libres: primero los más grandes
  bloquesLibres.sort(function(a, b) {
    return b.tamanioOriginal - a.tamanioOriginal;
  });
    
  while (proyectosActivos.length > 0 && intentos < maxIntentos) {
    intentos++;
    
    for (var p = proyectosActivos.length - 1; p >= 0; p--) {
      var proyecto = proyectosActivos[p];
      
      if (proyecto.horasAsignadas >= proyecto.horasObjetivo) {
        proyectosActivos.splice(p, 1);
        continue;
      }
      
      // Calcular horas restantes
      var horasRestantes = proyecto.horasObjetivo - proyecto.horasAsignadas;
      
      // Seleccionar tamanio de bloque ideal
      var tamanioDeseado = seleccionarTamanioBloque(proyecto.tamanosBloques, horasRestantes);
      
      // Buscar el mejor bloque disponible
      var mejorBloque = encontrarMejorBloque(bloquesLibres, proyecto, tamanioDeseado);
      
      if (mejorBloque) {
        // Asignar
        var horasAAsignar = Math.min(tamanioDeseado, mejorBloque.bloque.tamanioOriginal, horasRestantes);
        
        asignaciones.push({
          proyecto: proyecto.nombre,
          col: mejorBloque.bloque.col,
          filaInicio: mejorBloque.bloque.filaInicio,
          tamanio: horasAAsignar
        });
        
        proyecto.horasAsignadas += horasAAsignar;
        proyecto.asignacionesPorDia[mejorBloque.bloque.col] += horasAAsignar;
        
        // Actualizar el bloque libre
        var numCeldas = Math.round(horasAAsignar * 2);
        mejorBloque.bloque.filaInicio += numCeldas;
        mejorBloque.bloque.tamanioOriginal -= horasAAsignar;
        
        if (mejorBloque.bloque.tamanioOriginal <= 0) {
          bloquesLibres.splice(mejorBloque.indice, 1);
        }
      } else {
        // No hay más bloques para este proyecto
        Logger.log("⚠️ No hay más bloques disponibles para " + proyecto.nombre);
        proyectosActivos.splice(p, 1);
      }
    }
  }
  
  // 4. ESCRIBIR ASIGNACIONES EN EL CALENDARIO
  for (var a = 0; a < asignaciones.length; a++) {
    var asig = asignaciones[a];
    var numCeldas = Math.round(asig.tamanio * 2);
    
    for (var c = 0; c < numCeldas; c++) {
      var fila = asig.filaInicio + c + 2;
      var columna = asig.col + 3;
      
      hoja.getRange(fila, columna).setValue(asig.proyecto);
    }
  }

  actualizarHorasPorActividad();
  
  // 5. REPORTE
  var mensaje = "✅ Distribución completada:\n\n";
  proyectos.forEach(function(p) {
    mensaje += p.nombre + ": " + p.horasAsignadas + "h de " + p.horasObjetivo + "h";
    if (p.horasAsignadas >= p.horasObjetivo) {
      mensaje += " ✓\n";
    } else {
      mensaje += " ⚠️\n";
    }
  });


  
  SpreadsheetApp.getUi().alert(mensaje);
}

// Función para seleccionar el mejor tamanio de bloque
function seleccionarTamanioBloque(tamaniosDisponibles, horasRestantes) {
  // Ordenar de mayor a menor
  var ordenados = tamaniosDisponibles.slice().sort(function(a, b) { return b - a; });
  
  // Intentar usar el más grande que quepa
  for (var i = 0; i < ordenados.length; i++) {
    if (ordenados[i] <= horasRestantes) {
      return ordenados[i];
    }
  }
  
  // Si ninguno cabe, usar el más pequenio
  return ordenados[ordenados.length - 1];
}
// Función para encontrar el mejor bloque (prioriza distribución en la semana)
function encontrarMejorBloque(bloquesLibres, proyecto, tamanioDeseado) {
  var candidatos = [];
  
  for (var i = 0; i < bloquesLibres.length; i++) {
    var bloque = bloquesLibres[i];
    
    if (bloque.tamañoOriginal >= tamanioDeseado || bloque.tamanioOriginal >= 0.5) {
      // Calcular score: priorizar días con menos asignaciones de este proyecto
      var horasEnEsteDia = proyecto.asignacionesPorDia[bloque.col];
      var score = -horasEnEsteDia; // Menor score = mejor (menos saturado)
      
      candidatos.push({
        bloque: bloque,
        indice: i,
        score: score
      });
    }
  }
  
  if (candidatos.length === 0) {
    return null;
  }
  
  // Ordenar por score (mejor primero)
  candidatos.sort(function(a, b) { return b.score - a.score; });
  
  // Tomar uno de los top 3 aleatoriamente para más variedad
  var topCandidatos = candidatos.slice(0, Math.min(3, candidatos.length));
  return topCandidatos[Math.floor(Math.random() * topCandidatos.length)];
}

// ============================================
// FUNCIONES PARA DESHACER
// ============================================

// Función para limpiar solo los proyectos asignados y dejar las celdas rojas con el tag Arbeit!
function limpiarProyectos() {
  var hoja = SpreadsheetApp.getActiveSheet();
  var rango = hoja.getRange("C2:I49");
  var valores = rango.getValues();
  
  // Leer nombres de proyectos
  var datosProyectos = hoja.getRange("K22:K31").getValues();
  var nombresProyectos = [];
  
  for (var i = 0; i < datosProyectos.length; i++) {
    if (datosProyectos[i][0]) {
      var nombre = datosProyectos[i][0].toString().split(",")[0].trim();
      nombresProyectos.push(nombre);
    }
  }
  
  // Limpiar celdas que contengan nombres de proyectos
  for (var i = 0; i < valores.length; i++) {
    for (var j = 0; j < valores[i].length; j++) {
      var valorCelda = valores[i][j].toString().trim();
      
      if (nombresProyectos.indexOf(valorCelda) !== -1) {
        valores[i][j] = "Arbeit";
      }
    }
  }
  
  rango.setValues(valores);
  SpreadsheetApp.getUi().alert("✅ Proyectos limpiados. Celdas rojas intactas.");
}

