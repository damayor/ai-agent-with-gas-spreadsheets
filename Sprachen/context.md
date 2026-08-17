# WoerterDesTages — Sistema de vocabulario (DE/EN) con Telegram + Google Apps Script

## Objetivo del proyecto

Sistema personal de estudio de vocabulario alemán/inglés. Google Sheets es la
base de datos, Telegram es la interfaz de chat (registrar palabras, ver el
día, comandos), y Google Apps Script (GAS) es el backend que conecta todo.
Incluye repaso espaciado (spaced repetition) vía recordatorios automáticos.

## Arquitectura actual

Todos los `.gs` viven en **un solo proyecto de Apps Script** (mismo scope
global, sin imports — cuidado con nombres duplicados entre archivos, un
choque de identificador rompe la compilación de TODO el proyecto, no solo
del archivo afectado).

- **`Formulario.gs`** — `doGet` (formulario web) + `doPost` (webhook de
  Telegram). Comandos: `/nueva`, `/ver`, `/hoy`, `/dictionary`,
  `/intervalos`. Texto libre (sin `/`) se trata como palabra suelta.
- **`InboxDiccionario.gs`** — capa agregada recientemente:
  - `guardarEnInbox(chatId, texto)`: `appendRow` rápido a una hoja "Inbox"
    (creada automáticamente la primera vez, vía `crearHojaInbox`).
  - `procesarInbox()`: trigger de tiempo cada 1 min. Mueve palabras del
    Inbox a columnas **R** (palabra) y **S** (fecha) de `WoerterDesTages`,
    usando un puntero de fila cacheado en `PropertiesService`
    (`PUNTERO_FILA_R`) para no reescanear toda la columna. Usa
    `LockService` para evitar corridas simultáneas.
  - `manejarDictionary(chatId, texto)`: comando `/dictionary [DD/MM/YYYY]`,
    lee R/S filtrando por fecha.
  - `crearTriggerInbox()`: instala el trigger (correr una sola vez a mano).
- **`SpacedRepetition.gs`** — recordatorios diarios de repaso espaciado,
  intervalos configurables en `INTERVALOS` (`PropertiesService`, default
  `[30, 14, 7, 3, 2]`), cada recordatorio manda 4 mensajes Telegram
  separados (1 header + 1 por palabra) para que los `<tg-spoiler>` se
  revelen independientes.
- **`PegarFrases.gs`** — `pegarFrasesParametrizado(payload)`, escribe
  oraciones de contexto en columnas K/L/M sin pisar oraciones reales ya
  existentes (solo pisa placeholders `...`).

## Constantes / recursos

- Spreadsheet ID: `1yYJzqZmJOvM6lMMXLdf_ZWMEaa0_vvDWDeu87T2sm38`
- Tab principal: `WoerterDesTages`
- Zona horaria: `Europe/Berlin`
- Columnas de `WoerterDesTages`: B=fecha, C/D/E=palabras, F=idioma
  (`en` o vacío=alemán), G/H/I=traducciones español, K/L/M=oraciones de
  contexto, **R=palabra suelta (Inbox), S=fecha de captura** (agregado
  recién, ver abajo)
- Deployment URL actual (`/exec`):
  `https://script.google.com/macros/s/AKfycbwwMFNs4yJy5K1Rai-SpaJrZ5e_A5shmgzyJDSrGrxFrlSEArPDPtH8F7fdnqDtwIVF/exec`
- El token de Telegram vive en `PropertiesService.getScriptProperties()`
  como `TELEGRAM_TOKEN` (nunca hardcodeado en el código).

## Estado actual (04/08/2026) — EN PROGRESO, bug activo

### ✅ Ya resuelto hoy
- El sistema Inbox → columna R/S funciona de punta a punta (probado a
  mano con `guardarEnInbox("test","palabraDePrueba")`): crea la hoja
  Inbox sola, el trigger la procesa y escribe en R/S de
  `WoerterDesTages`, borra la fila del Inbox.
- El webhook estuvo mal registrado en un punto (`"url":""` en
  `getWebhookInfo`) — se corrigió corriendo `registrarWebhook()` con la
  URL de despliegue correcta.

### 🔴 Bug activo — esto es lo que hay que resolver

**Síntoma:** después de re-registrar el webhook, el bot responde bien a
la PRIMERA interacción (`/hoy`, o una palabra suelta) — pero
inmediatamente después, `getWebhookInfo` empieza a mostrar:

```json
"last_error_message":"Wrong response from the webhook: 302 Found"
```

y los mensajes siguientes se quedan en `pending_update_count` sin
procesarse.

**Diagnóstico confirmado (fuente externa, ver referencia abajo):** esto
es un comportamiento conocido de Google Apps Script, no un bug de
nuestro código. El endpoint `https://script.google.com/macros/s/{id}/exec`
desplegado como Web App puede responder a un caller NO autenticado (como
Telegram, que no tiene sesión de Google) con un redirect `302` hacia
`script.googleusercontent.com` en lugar de un `200` directo — de forma
**intermitente**. El sistema de entrega de webhooks de Telegram no sigue
redirects: si no recibe `200` directo, cuenta la entrega como fallida y
reintenta más tarde. Por eso el patrón es "funciona una vez, después
falla solo" — no es una condición de carrera de nuestro código ni un
choque de nombres entre `.gs`.

Fuente: artículo reciente que documenta exactamente este mismo síntoma
con GAS + Telegram Bot API:
https://habr.com/ru/articles/1066054/ (ruso, usar traducción). Cita
clave: la solución de quien lo diagnosticó fue abandonar el webhook
(`doPost`) por completo y migrar a **polling**.

### 🎯 Solución recomendada — migrar de webhook a polling

En vez de depender de que Telegram le pegue a `/exec` (entrada, propensa
al 302 intermitente), usar un trigger de tiempo que **Apps Script mismo
inicia** hacia Telegram (salida, autenticada con el bot token, no sufre
este problema):

```javascript
function pollTelegram() {
  const props  = PropertiesService.getScriptProperties();
  const token  = props.getProperty("TELEGRAM_TOKEN");
  const offset = Number(props.getProperty("TG_OFFSET") || "0");

  const resp = UrlFetchApp.fetch(
    `https://api.telegram.org/bot${token}/getUpdates?offset=${offset}&timeout=0`,
    { method: "get", muteHttpExceptions: true }
  );
  const data = JSON.parse(resp.getContentText());
  if (!data.ok || !data.result.length) return;

  data.result.forEach(update => {
    // reusar la misma lógica que hoy vive en doPost, extraída a una
    // función común, ej. procesarUpdateTelegram(update)
    offset = update.update_id + 1;
  });

  props.setProperty("TG_OFFSET", String(offset));
}
```

**Ojo con el detalle del bug "bonus" que menciona la misma fuente:**
`UrlFetchApp.fetch` con `method: "get"` NO convierte un `payload` en
query params — hay que armar el query string a mano en la URL (como en
el ejemplo de arriba), si no el offset nunca se manda y cada corrida
relee todo el backlog.

### Tareas concretas para Claude Code

1. **Diagnóstico primero, sin tocar nada:** confirmar leyendo
   `Formulario.gs` e `InboxDiccionario.gs` que no hay además un problema
   de código (choque de nombres de constantes/funciones entre archivos
   `.gs` — ya se sospechó esto antes en la sesión, doble-chequear igual
   aunque el 302 ya esté explicado, por si hay un problema secundario
   superpuesto).
2. **Extraer la lógica de manejo de updates** de `doPost` a una función
   reusable (ej. `procesarUpdateTelegram(update)`) que reciba el objeto
   `update` de Telegram y haga el ruteo de comandos (`/nueva`, `/ver`,
   `/hoy`, `/dictionary`, `/intervalos`, texto libre) — hoy esa lógica
   está inline dentro de `doPost`.
3. **Implementar `pollTelegram()`** en un archivo nuevo o en
   `Formulario.gs`, usando `TG_OFFSET` en `PropertiesService`, llamando
   a `procesarUpdateTelegram(update)` por cada update nuevo.
4. **Decidir qué hacer con `doPost` / el webhook actual:**
   - Opción A (recomendada por la fuente): eliminar el webhook
     (`eliminarWebhook()`) y depender 100% del polling.
   - Opción B (híbrida, más conservadora): dejar `doPost` como está por
     si algún día se resuelve el tema de Google, pero que el polling sea
     el mecanismo principal y real.
   - Confirmar con David cuál prefiere antes de eliminar el webhook.
5. **Instalar el trigger de `pollTelegram`** (mismo patrón que
   `crearTriggerInbox()`: chequear que no exista ya antes de crear uno
   nuevo, `everyMinutes(1)`).
6. **Considerar fusionar `pollTelegram` y `procesarInbox`** en un mismo
   trigger/función para no acumular triggers de 1 minuto innecesarios
   (hay cuota diaria de ejecución de triggers en Apps Script — cuenta
   gratuita ronda los 90 min/día totales).
7. Actualizar `registrarWebhook()` / documentación del proyecto para
   dejar claro cuál es el mecanismo vigente (webhook vs. polling) y
   evitar confusión futura.

## Aprendizajes clave (para no repetir errores)

- Apps Script comparte scope global entre todos los `.gs` del proyecto —
  nombres de función/constante duplicados rompen la compilación entera.
- `doPost` nunca debe hacer lecturas/escrituras pesadas de Sheets antes
  de responder — de ahí nació el patrón Inbox + trigger.
- El deployment `/exec` necesita "Ejecutar como: Yo" + "Quién tiene
  acceso: Cualquier usuario" — pero incluso bien configurado, sufre el
  302 intermitente descrito arriba. Esto es un límite de la plataforma,
  no de la configuración.
- Reimplementar con "Nueva versión" (editando el deployment existente)
  mantiene la misma URL `/exec` — no hace falta volver a llamar
  `registrarWebhook()` en ese caso. Solo hace falta si se crea un
  deployment nuevo (URL distinta).
- `getWebhookInfo` (`https://api.telegram.org/bot<token>/getWebhookInfo`)
  es la herramienta de diagnóstico más rápida: muestra `url` registrada,
  `pending_update_count` y `last_error_message`.
- Intervalos de repaso configurables en runtime vía `/intervalos` +
  `PropertiesService`, no hardcodeados.
- Building a date-to-row index map (`indiceFechas`) al inicio de
  operaciones sobre la hoja evita escaneos repetidos — mismo patrón que
  el puntero de fila R (`PUNTERO_FILA_R`).
- Parseo de fechas: rama `instanceof Date` primero, después
  `DD/MM/YYYY` string — Sheets auto-convierte algunas fechas.

## Preferencias de David

- Prefiere funciones compactas, parametrizadas, de responsabilidad única.
- Al regenerar código, preservar credenciales y constantes exactas — sin
  placeholders.
- Comunicación informal, español colombiano (no argentino).
- Evalúa herramientas nuevas con pragmatismo — rechazó migrar a
  OpenClaw cuando no daba beneficio claro sobre el stack ya funcional.