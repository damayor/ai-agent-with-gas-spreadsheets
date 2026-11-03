// ============================================================
// VOCAB APP — conexión con la PWA (endpoint web de SOLO LECTURA)
// ============================================================
// Devuelve las palabras del día con la misma lógica que
// enviarRecordatorioHoy() (Repaso.js), sin enviar nada a Telegram
// ni escribir en la hoja (no toca el contador de disparos).
//
// GET ?t=<VOCAB_APP_TOKEN>[&d=yyyy-MM-dd]
//   t — obligatorio, debe coincidir con la Script Property VOCAB_APP_TOKEN
//   d — opcional, solo para pruebas (por defecto hoy en ZONA_HORARIA)
// ============================================================

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  const params = (e && e.parameter) || {};
  const esperado = PropertiesService.getScriptProperties().getProperty("VOCAB_APP_TOKEN");
  if (!esperado || !params.t || params.t !== esperado) {
    return jsonOut({ error: "unauthorized" });
  }

  const fechaStr = params.d || Utilities.formatDate(new Date(), ZONA_HORARIA, "yyyy-MM-dd");
  const m = fechaStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return jsonOut({ error: "bad_date" });

  return jsonOut(construirHoy(new Date(+m[1], +m[2] - 1, +m[3])));
}

function construirHoy(fecha) {
  fecha.setHours(0,0,0,0);
  const slots = [];

  obtenerActivadoresDelDia().forEach((activador, i) => {
    const { palabrasDE, palabrasEN } = activador.tipo === "meses"
      ? obtenerPalabras(fecha, null, restarMeses(fecha, activador.valor))
      : obtenerPalabras(fecha, activador.valor);

    if (palabrasDE.length === 0 && palabrasEN.length === 0) return;

    slots.push({
      pos: i + 1,
      hour: HORAS_TRIGGER_REPASO[i] !== undefined ? HORAS_TRIGGER_REPASO[i] : null,
      kind: activador.tipo,
      value: activador.valor,
      words: palabrasDE.map(w => ({ orig: w.orig, frase: w.frase || "", trad: w.trad })),
    });
  });

  return { date: Utilities.formatDate(fecha, ZONA_HORARIA, "yyyy-MM-dd"), slots };
}

// --- Token ---------------------------------------------------
// Genera un token aleatorio, lo guarda en VOCAB_APP_TOKEN y lo muestra
// en el log (cópialo a la PWA). Si ya existe, no lo sobreescribe.
// Para rotarlo: borra la propiedad a mano y vuelve a correrla.

function crearTokenVocabApp() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty("VOCAB_APP_TOKEN")) {
    Logger.log("VOCAB_APP_TOKEN ya existe, no se sobreescribe.");
    return;
  }
  const token = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
  props.setProperty("VOCAB_APP_TOKEN", token);
  Logger.log("VOCAB_APP_TOKEN creado: " + token);
}

// --- Prueba (misma fecha que probarSimulacion) ---------------

function probarHoy() {
  Logger.log(JSON.stringify(construirHoy(new Date(2026, 5, 27)), null, 2));
}
