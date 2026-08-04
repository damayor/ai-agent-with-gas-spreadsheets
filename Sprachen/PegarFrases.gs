// ============================================================
// PEGAR FRASES — función reutilizable
// ============================================================
// Solo escribe en una celda si está vacía, tiene "..." o termina en "..."
// No sobreescribe frases reales ya existentes.
// ============================================================

const ID_HOJA_PF    = "1yYJzqZmJOvM6lMMXLdf_ZWMEaa0_vvDWDeu87T2sm38";
const NOMBRE_TAB_PF = "WoerterDesTages";

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

  const ss   = SpreadsheetApp.openById(ID_HOJA_PF);
  const hoja = ss.getSheetByName(NOMBRE_TAB_PF);
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