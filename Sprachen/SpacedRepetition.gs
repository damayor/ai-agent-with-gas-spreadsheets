// ============================================================
// WOERTER DES TAGES — Spaced Repetition Email Reminder
// ============================================================
//
// ÚNICA CONFIGURACIÓN — solo tocás esta sección
// ============================================================
const EMAIL_DESTINO = "dr.mayorga20@gmail.com";
const ID_HOJA       = "1yYJzqZmJOvM6lMMXLdf_ZWMEaa0_vvDWDeu87T2sm38";
const NOMBRE_TAB    = "WoertedesTages";
const ZONA_HORARIA  = "Europe/Berlin";

// Define los intervalos en días. El orden importa:
//   posición 0 → 9am, posición 1 → 12pm, posición 2 → 15pm,
//   posición 3 → 18pm, posición 4 → 21pm  (máximo 5)
// Ejemplos:
//   [1, 5, 7, 30]     → 4 correos al día
//   [1, 7, 30]        → 3 correos al día
//   [1, 3, 7, 14, 30] → 5 correos al día
const INTERVALOS = [1, 5, 7, 30];

// ============================================================
// NO es necesario tocar nada debajo de esta línea
// ============================================================

const HORAS_DISPONIBLES = [9, 12, 15, 18, 21];

function obtenerIntervaloDeHoraActual() {
  const horaActual = parseInt(Utilities.formatDate(new Date(), ZONA_HORARIA, "H"));
  for (let i = 0; i < HORAS_DISPONIBLES.length; i++) {
    if (Math.abs(horaActual - HORAS_DISPONIBLES[i]) <= 1) {
      return { dias: INTERVALOS[i] || null, posicion: i };
    }
  }
  return { dias: null, posicion: -1 };
}

function etiquetaDias(dias) {
  const esUltimo = dias === INTERVALOS[INTERVALOS.length - 1];
  const sufijo   = esUltimo ? " — ¡último repaso!" : "";
  if (dias === 1)  return `📅 Ayer (día +1)${sufijo}`;
  if (dias === 7)  return `📆 Hace una semana (día +7)${sufijo}`;
  if (dias === 14) return `📆 Hace dos semanas (día +14)${sufijo}`;
  if (dias === 30) return `🗓️ Hace un mes (día +30)${sufijo}`;
  return `📆 Hace ${dias} días (día +${dias})${sufijo}`;
}

function parsearFecha(celda) {
  // Acepta tanto objetos Date (de Sheets) como strings "DD/MM/YYYY"
  if (!celda) return null;
  if (celda instanceof Date) {
    if (isNaN(celda.getTime())) return null;
    const d = new Date(celda);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  const str = celda.toString().trim();
  const match = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) {
    const d = new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]));
    d.setHours(0, 0, 0, 0);
    return d;
  }
  return null;
}

function enviarRecordatorioHoy() {
  const { dias, posicion } = obtenerIntervaloDeHoraActual();

  if (dias === null) {
    Logger.log("No hay intervalo configurado para esta hora — nada que enviar.");
    return;
  }

  Logger.log(`Hora actual (Berlin) → intervalo: +${dias} días`);

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const ss   = SpreadsheetApp.openById(ID_HOJA);
  const hoja = ss.getSheetByName(NOMBRE_TAB);
  const data = hoja.getDataRange().getValues();

  const palabras = [];

  for (let i = 0; i < data.length; i++) {
    const fila = data[i];

    const fechaAnotacion = parsearFecha(fila[1]); // columna B
    if (!fechaAnotacion) continue;

    const diffDias = Math.round(
      (hoy.getTime() - fechaAnotacion.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (diffDias !== dias) continue;

    // Detectar idioma: columna F (índice 5) contiene 'en' → inglés
    const idiomaFlag = (fila[5] || "").toString().trim().toLowerCase();
    const esIngles   = idiomaFlag === "en";
    const idioma     = esIngles ? "en" : "de";

    // Pares: C/G, D/H, E/I → índices 2/6, 3/7, 4/8
    const pares = [
      { orig: fila[2], trad: fila[6] },
      { orig: fila[3], trad: fila[7] },
      { orig: fila[4], trad: fila[8] },
    ];

    for (const par of pares) {
      const orig = (par.orig || "").toString().trim();
      const trad = (par.trad || "").toString().trim();
      if (!orig || orig === "-" || orig === "–") continue;
      if (!trad || trad === "-" || trad === "–") continue;
      palabras.push({ orig, trad, idioma, fecha: fechaAnotacion });
    }
  }

  if (palabras.length === 0) {
    Logger.log(`No hay palabras para el intervalo +${dias} días hoy.`);
    return;
  }

  const htmlBody = construirEmail(palabras, dias, hoy, posicion);
  const asunto   = `🧠 +${dias}d — ${palabras.length} palabra${palabras.length > 1 ? "s" : ""} para repasar`;

  MailApp.sendEmail({
    to:       EMAIL_DESTINO,
    subject:  asunto,
    htmlBody: htmlBody,
  });

  Logger.log(`Correo enviado: ${palabras.length} palabras (intervalo +${dias}d)`);
}

function construirEmail(palabras, dias, hoy, posicion) {
  const fechaStr    = Utilities.formatDate(hoy, ZONA_HORARIA, "EEEE, d 'de' MMMM yyyy");
  const fechaOrigen = Utilities.formatDate(palabras[0].fecha, ZONA_HORARIA, "d 'de' MMMM");
  const correoNum   = posicion + 1;
  const totalHoy    = INTERVALOS.length;

  // Separar por idioma
  const palabrasDE = palabras.filter(p => p.idioma === "de");
  const palabrasEN = palabras.filter(p => p.idioma === "en");

  function buildSection(lista, bandera, nombreIdioma, colorHeader) {
    if (lista.length === 0) return "";

    // PRIMERO: solo las palabras originales (sin traducción)
    let filasOcultas = "";
    lista.forEach((p, idx) => {
      const bg = idx % 2 === 0 ? "#ffffff" : "#f9f9fc";
      filasOcultas += `
        <tr style="background:${bg};">
          <td style="padding:14px 18px; font-size:18px; font-weight:700;
                     color:#1a1a2e; letter-spacing:0.3px;">${p.orig}</td>
        </tr>`;
    });

    // DESPUÉS: separador + traducciones reveladas
    let filasReveladas = "";
    lista.forEach((p, idx) => {
      const bg = idx % 2 === 0 ? "#ffffff" : "#f9f9fc";
      filasReveladas += `
        <tr style="background:${bg};">
          <td style="padding:10px 18px; font-size:17px; font-weight:700;
                     color:#1a1a2e;">${p.orig}</td>
          <td style="padding:10px 18px; font-size:16px; color:#4a4a6a;">${p.trad}</td>
        </tr>`;
    });

    return `
      <!-- Sección ${nombreIdioma} -->
      <div style="margin-bottom:32px;">

        <!-- Header idioma -->
        <div style="background:${colorHeader}; color:white; padding:10px 18px;
                    border-radius:8px 8px 0 0; font-size:13px; font-weight:700;
                    letter-spacing:0.5px; text-transform:uppercase;">
          ${bandera} ${nombreIdioma}
          <span style="font-weight:400; opacity:0.8; margin-left:6px; font-size:12px;">
            (anotadas el ${fechaOrigen})
          </span>
        </div>

        <!-- Tabla solo palabras — intentá recordar la traducción -->
        <table style="width:100%; border-collapse:collapse; background:#ffffff;
                      box-shadow:0 1px 4px rgba(0,0,0,0.08);">
          <thead>
            <tr style="background:#f0f0f8;">
              <th style="padding:8px 18px; text-align:left; font-size:11px; color:#888;
                         font-weight:700; text-transform:uppercase; letter-spacing:0.8px;">
                ¿Recordás la traducción? 👇 hacé scroll para verla
              </th>
            </tr>
          </thead>
          <tbody>${filasOcultas}</tbody>
        </table>

        <!-- Espaciador visual — separa la pregunta de la respuesta -->
        <div style="height:60px; background:repeating-linear-gradient(
          45deg, #f0f0f8, #f0f0f8 10px, #e8e8f0 10px, #e8e8f0 20px);
          display:flex; align-items:center; justify-content:center;">
          <span style="background:#fff; padding:6px 16px; border-radius:20px;
                       font-size:12px; color:#888; font-weight:600; letter-spacing:0.5px;
                       box-shadow:0 1px 4px rgba(0,0,0,0.1);">
            ▼ TRADUCCIÓN ▼
          </span>
        </div>

        <!-- Tabla con traducciones reveladas -->
        <table style="width:100%; border-collapse:collapse; background:#ffffff;
                      border-radius:0 0 8px 8px; overflow:hidden;
                      box-shadow:0 1px 4px rgba(0,0,0,0.08);">
          <thead>
            <tr style="background:#e8f5e9;">
              <th style="padding:8px 18px; text-align:left; font-size:11px; color:#2e7d32;
                         font-weight:700; text-transform:uppercase; letter-spacing:0.8px; width:50%;">
                ${bandera} Original
              </th>
              <th style="padding:8px 18px; text-align:left; font-size:11px; color:#2e7d32;
                         font-weight:700; text-transform:uppercase; letter-spacing:0.8px; width:50%;">
                🇪🇸 Traducción
              </th>
            </tr>
          </thead>
          <tbody>${filasReveladas}</tbody>
        </table>

      </div>`;
  }

  const seccionDE = buildSection(palabrasDE, "🇩🇪", "Deutsch",  "#4f46e5");
  const seccionEN = buildSection(palabrasEN, "🇬🇧", "English",  "#0f766e");

  return `
<!DOCTYPE html>
<html>
<body style="margin:0; padding:0; background:#f5f5f7; font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:580px; margin:32px auto; padding:0 16px;">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);
                border-radius:12px 12px 0 0; padding:24px 28px; text-align:center;">
      <div style="font-size:11px; color:rgba(255,255,255,0.6); text-transform:uppercase;
                  letter-spacing:1px; margin-bottom:6px;">
        Repaso ${correoNum} de ${totalHoy} hoy
      </div>
      <div style="font-size:26px; margin-bottom:4px;">🧠</div>
      <h1 style="margin:0; color:white; font-size:20px; font-weight:700;">Wörter des Tages</h1>
      <p style="margin:6px 0 4px; color:rgba(255,255,255,0.85); font-size:14px;">${fechaStr}</p>
      <div style="display:inline-block; background:rgba(255,255,255,0.15); border-radius:20px;
                  padding:4px 14px; font-size:13px; color:white; margin-top:4px;">
        ${etiquetaDias(dias)}
      </div>
    </div>

    <!-- Tip -->
    <div style="background:#fffbeb; border-left:4px solid #f59e0b;
                padding:12px 16px; margin:20px 0 24px; font-size:13px; color:#92400e;
                border-radius:0 6px 6px 0;">
      💡 <strong>Mirá primero solo la palabra.</strong> Intentá recordar la traducción
      antes de hacer scroll. La dificultad activa fortalece la memoria a largo plazo.
    </div>

    <!-- Secciones por idioma -->
    ${seccionDE}
    ${seccionEN}

    <!-- Footer -->
    <div style="text-align:center; font-size:11px; color:#aaa; padding-bottom:28px; margin-top:8px;">
      Spaced Repetition · Intervalos: ${INTERVALOS.map(d => `+${d}d`).join(" · ")}
    </div>

  </div>
</body>
</html>`;
}

// ============================================================
// FUNCIÓN DE PRUEBA — simula fecha y hora específicas
// ============================================================
function probarSimulacion() {
  const fechaSimulada = new Date("2026-06-23"); // ← fecha a simular (YYYY-MM-DD)
  const horaSimulada  = 9;                       // ← hora: 9, 12, 15, 18 o 21

  const posicion = HORAS_DISPONIBLES.findIndex(h => h === horaSimulada);
  const dias     = INTERVALOS[posicion];

  if (!dias) {
    Logger.log(`No hay intervalo para las ${horaSimulada}hs.`);
    return;
  }

  fechaSimulada.setHours(0, 0, 0, 0);
  Logger.log(`=== SIMULACIÓN: ${fechaSimulada.toDateString()} a las ${horaSimulada}hs → +${dias}d ===`);

  const ss   = SpreadsheetApp.openById(ID_HOJA);
  const hoja = ss.getSheetByName(NOMBRE_TAB);
  const data = hoja.getDataRange().getValues();

  let total = 0;

  for (let i = 0; i < data.length; i++) {
    const fila           = data[i];
    const fechaAnotacion = parsearFecha(fila[1]);
    if (!fechaAnotacion) continue;

    const diffDias = Math.round(
      (fechaSimulada.getTime() - fechaAnotacion.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (diffDias !== dias) continue;

    const idiomaFlag = (fila[5] || "").toString().trim().toLowerCase();
    const idioma     = idiomaFlag === "en" ? "🇬🇧 EN" : "🇩🇪 DE";

    const pares = [
      { orig: fila[2], trad: fila[6] },
      { orig: fila[3], trad: fila[7] },
      { orig: fila[4], trad: fila[8] },
    ];

    for (const par of pares) {
      const orig = (par.orig || "").toString().trim();
      const trad = (par.trad || "").toString().trim();
      if (!orig || orig === "-" || !trad || trad === "-") continue;
      Logger.log(`  ${idioma}  ${orig} → ${trad}`);
      total++;
    }
  }

  Logger.log(`Total: ${total} palabras para esa fecha/hora.`);
}