# Contexto: Stundenplan (Google Sheets + Apps Script)

## Qué es este proyecto

Hoja de cálculo de horario/calendario (`SPREADSHEET_ID = 1fULXN0xEEM5gGVhuMwWK67fJqHAkUDdwI9EvwzNFtVs`)
con un grid de tiempo (columnas C:I = días, filas = bloques de 30 min) donde cada celda
representa una actividad. Hay formato condicional que colorea celdas según palabras clave
(`Codigo.gs`) y conteo de horas por color/actividad.

Objetivo actual: poder registrar actividades **desde Telegram**, escribiendo un mensaje al bot
con el tag de la actividad (y opcionalmente "end" para cerrarla), y que el script actualice
automáticamente la celda correspondiente al bloque de tiempo actual.

## Archivos

- **Codigo.gs**: lógica del calendario/hoja — limpiar colores, formato condicional por
  palabras clave, conteo de horas por actividad (por color de fondo).
- **Codigo copy.js**: copia/backup de Codigo.gs (mismo contenido al momento de escribir esto).
- **verbindung.gs**: toda la lógica de conexión con Telegram + el cálculo de fila/columna
  según la hora actual. Es el archivo en el que se ha intentado varias veces hacer funcionar
  la integración, sin éxito hasta ahora.

## Migración a Polling (2026-08-17)

Mismo bug que ya se dio en el proyecto **Sprachen**: el webhook (`doPost`) sufre un 302
intermitente propio de GAS Web App respondiendo a callers no autenticados — Telegram no
sigue el redirect, cuenta la entrega como fallida y **reintenta el mismo update en loop**,
lo que se traducía en el mismo tag escrito por muchas horas seguidas en celdas contiguas.

Solución aplicada (idéntica a `Sprachen/Polling.gs`): en vez de esperar que Telegram le
pegue a `/exec`, Apps Script llama hacia afuera a Telegram (`getUpdates`, autenticado con
el bot token) desde un trigger de tiempo cada 1 minuto.

- **Polling.gs** (nuevo): `pollTelegram()` trae updates nuevos vía `getUpdates` con offset
  guardado en Script Properties (`TG_OFFSET`), llama a `procesarUpdateTelegram(update)` por
  cada uno. `tick()` es el handler del trigger (con `LockService` para evitar corridas
  concurrentes). `crearTriggerTick()` instala el trigger — **correr una sola vez a mano**.
- **verbindung.gs**: se extrajo `procesarUpdateTelegram(update)` de `doPost` para que la
  use tanto el polling como (históricamente) el webhook. `doPost` queda sin usar, solo como
  referencia. `BOT_TOKEN` ya NO está hardcodeado — se movió a Script Properties como
  `TELEGRAM_TOKEN` (Extensiones > Apps Script > Configuración del proyecto > Propiedades
  del script). `clearTelegramWebhook()` ahora solo hace `deleteWebhook` (ya no re-registra
  ningún `setWebhook`, porque el webhook no se vuelve a usar).

**Rango de escritura**: desde el 2026-08-18, las celdas escritas vía Telegram van al rango
**C2:I49** de la primera hoja — el mismo rango de producción que usa `Codigo.gs` (formato
condicional por color, `HORAS_LABORALES`). Fila 2 = bloque 0:00-0:29, +1 fila por cada
bloque de 30 min, hasta fila 49 = bloque 23:30-23:59 (`TELEGRAM_FILA_BASE = 2`).
(Antes se probó en un rango aislado C76:I123 durante la migración a polling; ya no se usa.)

Para diferenciar lo escrito vía Telegram (tiempo real) de lo planeado a inicio de semana
(texto normal), la celda se escribe en **negrilla + itálica** (`setFontWeight("bold")` +
`setFontStyle("italic")`, en `procesarActividad` y `testCelda`, verbindung.gs).

Pasos manuales pendientes (una sola vez, desde el editor de Apps Script): ver checklist en
[TASKS-Stundenplan.md](TASKS-Stundenplan.md).

## Lógica en verbindung.gs

- `calcularFila(date)` / `calcularColumna(date)`: mapean una fecha a la celda del grid vía
  Telegram (bloques de 30 min, filas desde `TELEGRAM_FILA_BASE = 76`; columnas C=3 a I=9,
  con domingo especial → 9).
- `procesarActividad(tag)`: toma la hora actual, la redondea al bloque de 30 min más cercano
  (con margen de 5 min para saltar al siguiente bloque), calcula fila/columna y escribe
  `tag` en la celda. Ya no recibe `isEnding` — ver nota abajo.
- `testCelda(tag)`: helper de prueba manual para escribir un tag en la celda actual.
- Telegram (mecanismo vigente: **polling**, ver `Polling.gs` — el webhook fue eliminado):
  - `getBotToken()`: lee `TELEGRAM_TOKEN` desde Script Properties.
  - `clearTelegramWebhook()`: solo hace `deleteWebhook` (ya no re-registra ningún
    `setWebhook`, porque el webhook no se usa más).
  - `procesarUpdateTelegram(update)`: parsea el tag del mensaje (`split(",")[0]`), envía
    confirmación de vuelta usando el `chat_id` del propio update (ya no una constante
    hardcodeada — ver historial), y llama a `procesarActividad(tag)`.
  - `doPost(e)`: queda como referencia histórica, sin usar mientras el webhook esté
    eliminado (llama a `procesarUpdateTelegram` igual que `pollTelegram`).
  - `testDoPost()`: simula un evento de Telegram con texto `"Hamburg, init"` para probar
    el flujo sin depender de Telegram real.
  - `limpiarProperties()`: borra todas las Script Properties (útil para resetear
    `TG_OFFSET` u otro estado).

### `isEnding` / "END" — resuelto (2026-08-17)

Se eliminó por completo el concepto de `isEnding`. Antes, mandar `"Tag, end"` sobrescribía
la celda del bloque actual con el string literal `"END"` — no cerraba ni resumía nada, y no
había ningún auto-relleno de bloques futuros en `Codigo.gs` que dependiera de eso. Se decidió
(2026-08-17) que el flujo correcto es: cada mensaje simplemente escribe su tag en el bloque
de 30 min actual; si no llega un mensaje nuevo, el bloque siguiente queda vacío por defecto.
No hace falta marcar el fin de una actividad explícitamente. `procesarActividad` ahora solo
recibe `tag`, y `procesarUpdateTelegram` ya no parsea ni envía `isEnding`.

## Estado actual / por qué "nunca funcionó"

- La lógica de extremo a extremo (recibir mensaje → parsear tag → escribir en la celda
  correcta) está implementada en `doPost`, pero **no hay confirmación de que haya funcionado
  end-to-end** en producción real (solo se ha probado parcialmente / vía `testDoPost`).
- Sospechas a revisar en la próxima sesión de debug:
  1. **WEBHOOK_URL desactualizada**: cada vez que se hace un nuevo deployment del Web App,
     la URL cambia y hay que volver a correr `clearTelegramWebhook()` con la URL nueva.
  2. **Permisos/deployment**: confirmar que el Web App está deployado con acceso "Anyone"
     (si no, Telegram no puede hacer POST).
  3. **Logs de ejecución**: revisar el log de ejecuciones de Apps Script (no los logs vía
     Telegram) para ver si `doPost` se está disparando y dónde falla — el bloque `catch`
     actual solo hace `console.error` y siempre responde "ok", así que un error silencioso
     ahí puede estar ocultando el problema real.
  4. **`isEnding` / "END"**: el manejo de fin de actividad está marcado como pendiente de
     arreglar (`//ToDo: To Fix here` en línea ~116) — probablemente sobrescribe con "END"
     en vez de, por ejemplo, aplicar tachado o cerrar el bloque de la actividad anterior.

## Seguridad

`BOT_TOKEN` está hardcodeado en texto plano en el archivo (línea 121, repetido en
`clearTelegramWebhook`). Debería moverse a `PropertiesService.getScriptProperties()` en vez
de quedar en el código fuente, especialmente si este repo se comparte o sube a algún lado.

## Próximos pasos sugeridos

Ver checklist en [TASKS-Stundenplan.md](TASKS-Stundenplan.md).
