// ============================================================
// WOERTER DES TAGES — Spaced Repetition Email Reminder
// ============================================================
// Intervalos: día+1, día+3, día+5 desde la fecha de anotación
// Después del día+5 → no se vuelve a mostrar
//
// CONFIGURACIÓN — cambia estos valores:
const EMAIL_DESTINO = "dr.mayorga20@gmail.com";        // ← tu correo
const ID_HOJA       = "1yYJzqZmJOvM6lMMXLdf_ZWMEaa0_vvDWDeu87T2sm38";
const NOMBRE_TAB    = "Woerte des Tages";    // nombre exacto del tab
// ============================================================

function enviarRecordatorioHoy() {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const ss   = SpreadsheetApp.openById(ID_HOJA);
  const hoja = ss.getSheetByName(NOMBRE_TAB);
  const data = hoja.getDataRange().getValues();

  // Palabras a recordar hoy, agrupadas por intervalo
  const grupos = { 1: [], 3: [], 5: [] };

  for (let i = 0; i < data.length; i++) {
    const fila = data[i];

    // Columna B (índice 1) debe tener una fecha válida
    const celdaFecha = fila[1];
    if (!celdaFecha || typeof celdaFecha === "string") continue;

    let fechaAnotacion;
    try {
      fechaAnotacion = new Date(celdaFecha);
      fechaAnotacion.setHours(0, 0, 0, 0);
      if (isNaN(fechaAnotacion.getTime())) continue;
    } catch (e) {
      continue;
    }

    // Calcular diferencia en días
    const diffMs   = hoy.getTime() - fechaAnotacion.getTime();
    const diffDias = Math.round(diffMs / (1000 * 60 * 60 * 24));

    // Solo procesar días exactos: 1, 3 o 5
    if (![1, 3, 5].includes(diffDias)) continue;

    // Extraer pares alemán→español de las columnas C/G, D/H, E/I
    // Índices: C=2, D=3, E=4, G=6, H=7, I=8
    const pares = [
      { de: fila[2], es: fila[6] },
      { de: fila[3], es: fila[7] },
      { de: fila[4], es: fila[8] },
    ];

    for (const par of pares) {
      const de = (par.de || "").toString().trim();
      const es = (par.es || "").toString().trim();

      // Ignorar celdas vacías o con guiones
      if (!de || de === "-" || de === "–") continue;
      if (!es || es === "-" || es === "–") continue;

      grupos[diffDias].push({ de, es, fecha: fechaAnotacion });
    }
  }

  // Verificar si hay algo que enviar
  const total = grupos[1].length + grupos[3].length + grupos[5].length;
  if (total === 0) {
    Logger.log("Hoy no hay palabras para recordar.");
    return;
  }

  // Construir el correo en HTML
  const htmlBody = construirEmail(grupos, hoy);
  const asunto   = `🇩🇪 Wörter des Tages — ${total} palabra${total > 1 ? "s" : ""} para recordar hoy`;

  MailApp.sendEmail({
    to:       EMAIL_DESTINO,
    subject:  asunto,
    htmlBody: htmlBody,
  });

  Logger.log(`Correo enviado: ${total} palabras para ${EMAIL_DESTINO}`);
}

function construirEmail(grupos, hoy) {
  const fechaStr = hoy.toLocaleDateString("es-DE", {
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  });

  const etiquetas = {
    1: "📅 Anotadas ayer (día +1)",
    3: "📆 Anotadas hace 3 días (día +3)",
    5: "🗓️ Anotadas hace 5 días (día +5) — ¡último repaso!",
  };

  let tablas = "";

  for (const dias of [1, 3, 5]) {
    const palabras = grupos[dias];
    if (palabras.length === 0) continue;

    const fechaOrigen = palabras[0].fecha.toLocaleDateString("es-DE", {
      day: "numeric", month: "long"
    });

    let filas = "";
    for (const p of palabras) {
      filas += `
        <tr>
          <td style="padding:10px 16px; font-size:17px; font-weight:600; color:#1a1a2e;">${p.de}</td>
          <td style="padding:10px 16px; font-size:16px; color:#4a4a6a;">${p.es}</td>
        </tr>`;
    }

    tablas += `
      <div style="margin-bottom:28px;">
        <div style="background:#4f46e5; color:white; padding:10px 16px; border-radius:8px 8px 0 0;
                    font-size:14px; font-weight:600; letter-spacing:0.3px;">
          ${etiquetas[dias]}
          <span style="font-weight:400; opacity:0.85; margin-left:8px;">(anotadas el ${fechaOrigen})</span>
        </div>
        <table style="width:100%; border-collapse:collapse; background:#ffffff;
                      border-radius:0 0 8px 8px; overflow:hidden;
                      box-shadow:0 1px 4px rgba(0,0,0,0.08);">
          <thead>
            <tr style="background:#f0f0f8;">
              <th style="padding:8px 16px; text-align:left; font-size:12px;
                         color:#666; font-weight:600; text-transform:uppercase;
                         letter-spacing:0.5px; width:50%;">Deutsch 🇩🇪</th>
              <th style="padding:8px 16px; text-align:left; font-size:12px;
                         color:#666; font-weight:600; text-transform:uppercase;
                         letter-spacing:0.5px; width:50%;">Español 🇪🇸</th>
            </tr>
          </thead>
          <tbody>${filas}</tbody>
        </table>
      </div>`;
  }

  return `
<!DOCTYPE html>
<html>
<body style="margin:0; padding:0; background:#f5f5f7; font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:560px; margin:32px auto; padding:0 16px;">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);
                border-radius:12px 12px 0 0; padding:24px 28px; text-align:center;">
      <div style="font-size:28px; margin-bottom:6px;">🇩🇪</div>
      <h1 style="margin:0; color:white; font-size:20px; font-weight:700;">
        Wörter des Tages
      </h1>
      <p style="margin:6px 0 0; color:rgba(255,255,255,0.8); font-size:14px;">
        ${fechaStr}
      </p>
    </div>

    <!-- Contenido -->
    <div style="background:#f5f5f7; padding:20px 0;">
      ${tablas}
    </div>

    <!-- Tip -->
    <div style="background:#fffbeb; border:1px solid #fde68a; border-radius:8px;
                padding:14px 18px; margin-bottom:24px; font-size:13px; color:#92400e;">
      💡 <strong>Tip:</strong> Intentá recordar la traducción antes de mirarla.
      La dificultad activa fortalece la memoria a largo plazo.
    </div>

    <!-- Footer -->
    <div style="text-align:center; font-size:12px; color:#999; padding-bottom:24px;">
      Generado automáticamente desde tu Google Sheet · Spaced Repetition System
    </div>

  </div>
</body>
</html>`;
}

// ============================================================
// FUNCIÓN DE PRUEBA — ejecutar manualmente para verificar
// ============================================================
function probarConFechaEspecifica() {
  // Simula que "hoy" es una fecha específica para ver qué enviaría
  // Cambia la fecha aquí para probar distintos días
  const fechaSimulada = new Date("2026-05-02"); // ← ajustar
  fechaSimulada.setHours(0, 0, 0, 0);

  Logger.log("=== SIMULACIÓN para: " + fechaSimulada.toDateString() + " ===");

  const ss   = SpreadsheetApp.openById(ID_HOJA);
  const hoja = ss.getSheetByName(NOMBRE_TAB);
  const data = hoja.getDataRange().getValues();

  const grupos = { 1: [], 3: [], 5: [] };

  for (let i = 0; i < data.length; i++) {
    const fila = data[i];
    const celdaFecha = fila[1];
    if (!celdaFecha || typeof celdaFecha === "string") continue;

    let fechaAnotacion;
    try {
      fechaAnotacion = new Date(celdaFecha);
      fechaAnotacion.setHours(0, 0, 0, 0);
      if (isNaN(fechaAnotacion.getTime())) continue;
    } catch (e) { continue; }

    const diffDias = Math.round(
      (fechaSimulada.getTime() - fechaAnotacion.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (![1, 3, 5].includes(diffDias)) continue;

    const pares = [
      { de: fila[2], es: fila[6] },
      { de: fila[3], es: fila[7] },
      { de: fila[4], es: fila[8] },
    ];

    for (const par of pares) {
      const de = (par.de || "").toString().trim();
      const es = (par.es || "").toString().trim();
      if (!de || de === "-" || !es || es === "-") continue;
      grupos[diffDias].push({ de, es, fecha: fechaAnotacion });
      Logger.log(`Día+${diffDias}: ${de} → ${es}`);
    }
  }

  const total = grupos[1].length + grupos[3].length + grupos[5].length;
  Logger.log(`Total palabras para esa fecha: ${total}`);
}