# TASKS — Migración webhook → polling (Telegram + GAS)

Contexto completo en [context.md](context.md). Decisión tomada: **Opción A**
— eliminar el webhook por completo, depender 100% de `pollTelegram()`, y
fusionar el trigger con `procesarInbox()` en un `tick()` único.

## Hecho (código, pendiente de pegar/probar en GAS — ver abajo)

- [x] 1. Extraída la lógica de manejo de updates de `doPost` a
      `procesarUpdateTelegram(update)` en [Form.gs](Form.gs). `doPost`
      quedó como wrapper fino (referencia histórica, sin trigger de
      entrada activo).
- [x] 2. Implementado `pollTelegram()` en [Polling.gs](Polling.gs)
      (archivo nuevo): lee `TG_OFFSET`, arma el query string a mano
      (`getUpdates?offset=...&timeout=0`), llama a
      `procesarUpdateTelegram(update)` por cada update, actualiza y
      guarda el offset.
- [x] 3. `tick()` en [Polling.gs](Polling.gs) fusiona `pollTelegram()`
      + `procesarInbox()` en una sola corrida con `LockService`, para
      no acumular triggers de 1 minuto.
- [x] 4. `crearTriggerTick()` instala el trigger (chequea que no
      exista ya). Se removió `crearTriggerInbox()` de
      [Inboxdiccionario.gs](Inboxdiccionario.gs) — el trigger viejo de
      `procesarInbox` solo ya no aplica.
- [x] `context.md` actualizado para reflejar que el mecanismo vigente
      es polling, no webhook.

## Pendiente — pasos manuales en Google Apps Script

- [x] **Pegar `Polling.gs`** como archivo nuevo en el proyecto de Apps
      Script (Extensiones → Apps Script → ➕ → Script), nombrarlo
      `Polling.gs`, pegar el contenido completo.
- [x] **Actualizar `Form.gs`** en el editor con los cambios (doPost +
      nueva función `procesarUpdateTelegram`).
- [x] **Actualizar `Inboxdiccionario.gs`** en el editor (se removió
      `crearTriggerInbox`).
- [x] **Si ya existe un trigger viejo de `procesarInbox` cada 1 min**:
      borrarlo a mano desde el editor (ícono del reloj ⏰ en la barra
      lateral izquierda → borrar el trigger de `procesarInbox`) para
      no duplicar ejecuciones. `crearTriggerTick()` NO lo borra solo.
- [x] **Correr `crearTriggerTick()` una vez a mano** desde el editor
      (seleccionar la función en el dropdown de arriba → ▶ Ejecutar).
      Revisar los logs (Ver → Registros) para confirmar
      "Trigger creado: tick cada 1 minuto...".
- [x] **Probar end-to-end**: se detectó que mientras el webhook seguía
      registrado, Telegram le entregaba los updates a `doPost` (con
      el 302 de siempre) y `pollTelegram` nunca los veía —
      `verWebhookInfo()` confirmó `pending_update_count: 3` y
      `last_error_message` con el 302. Solución: no hace falta tener
      webhook + polling en paralelo, Telegram no reparte el mismo
      update por los dos canales.
- [x] **Correr `eliminarWebhook()`** — corrido, limpió los 3 pendientes
      atascados (`drop_pending_updates=true`). Confirmado con `/hoy`:
      el siguiente `tick()` respondió bien por Telegram.
- [x] Agregado `Logger.log("pollTelegram: procesado update " +
      update.update_id)` en [Polling.gs](Polling.gs) dentro del
      `forEach` de `pollTelegram()`, para que cada `tick` con mensajes
      nuevos deje rastro visible en Cloud-Logs (antes no había logs en
      el camino feliz, solo en el catch de errores). **Pendiente:
      pegar este cambio en el editor de Apps Script.**
- [ ] Mandar varios mensajes seguidos (comandos y texto libre) y
      confirmar que todos se procesan sin acumularse, y que el log
      nuevo aparece en Cloud-Logs por cada uno.
- [ ] Correr `verWebhookInfo()` una vez más para reconfirmar que queda
      sin `url` registrada y `pending_update_count: 0` en estado
      estable (no solo justo después de eliminar el webhook).

## Pendientes — nuevas features (pedido 17/08/2026)

Antes de implementar, varios puntos necesitan aclaración de David — ver
notas debajo de cada uno. No arrancar código hasta resolver esas dudas.

- [ ] **1. Palabra nueva del día va a C/D/E, no a columna R.** Cuando
      llega una palabra suelta (texto libre, hoy via `guardarEnInbox`
      → Inbox → columnas R/S), en vez de eso debe escribirse
      directamente en la fila de la fecha de HOY, en la primera
      columna vacía entre C, D, E de `WoerterDesTages`. Si las tres
      están ocupadas, ver punto 5 (desborda a columna P).
      Reemplaza/reemplaza el flujo de Inbox para texto libre — ver
      también punto 6a (¿sigue haciendo falta la hoja Inbox?).
- [ ] **2. Comando `translate`: dado fecha + palabra (o solo palabra),
      devolver su traducción según el mapeo C→G, D→H, E→I** (columna
      de palabra → columna de traducción español correspondiente en
      la misma fila). Falta definir: ¿nombre exacto del comando
      (`/translate`?) y formato de argumentos (`/translate DD/MM,
      palabra`? ¿o busca la palabra en cualquier fecha si no se da
      fecha?).
- [ ] **3. Colorear celda según emoji-reacción recibido en los
      recordatorios de repaso espaciado.** Confirmado con captura: son
      reacciones NATIVAS de Telegram (❤️/👍/👎/🤔 aparecen como ícono
      chico debajo del mensaje del bot), no texto escrito por el
      usuario, y aplican sobre los mensajes que manda
      `enviarRecordatorioHoy()` en
      [SpacedRepetition.gs](SpacedRepetition.gs) — no sobre `/ver` ni
      `/hoy` (esos siguen como están).
      **Mapeo de colores**: ❤️ o 👍 → verde `#00ff00` de background;
      👎 o 🤔 → naranja.
      **Mecanismo definido**:
      1. `enviarRecordatorioHoy()` ya arma `obtenerPalabras()` con un
         array de objetos `{orig, spoiler, fecha}` por cada C/D/E no
         vacía — hay que sumarles `fila` y `col` (índice de columna,
         3/4/5) al armar `pares` dentro de `obtenerPalabras`
         ([SpacedRepetition.gs:141-145](SpacedRepetition.gs#L141-L145)),
         ya que hoy no se trackea la celda de origen, solo el valor.
      2. Al mandar cada mensaje de palabra (bucle
         `for (const p of todas)`,
         [SpacedRepetition.gs:194-198](SpacedRepetition.gs#L194-L198)),
         `enviarTelegram` debe devolver el `message_id` de la
         respuesta de `sendMessage` (hoy no lo hace, solo devuelve
         `true`/`false`) — hay que capturarlo.
      3. Guardar en `PropertiesService` (o una hoja aparte si crece
         mucho) el mapeo `message_id → {fila, col}`, con TTL de 7
         días (ver definición más abajo) para no acumular basura.
      4. `pollTelegram()` en [Polling.gs](Polling.gs) hoy solo procesa
         `update.message`/`update.edited_message`. Hay que sumar el
         manejo de `update.message_reaction`: leer
         `message_reaction.message_id` y
         `message_reaction.new_reaction` (array de emojis actuales
         tras el cambio), buscar la celda mapeada, y pintar el
         background según el emoji.
      5. **Requisito de Telegram**: el bot necesita tener habilitado
         recibir `message_reaction` — hay que sumarlo a
         `allowed_updates` (Telegram por default NO manda
         `message_reaction` a menos que se pida explícitamente al
         hacer polling/webhook). Revisar si `getUpdates` necesita el
         parámetro `allowed_updates` en la URL de
         `pollTelegram()`.
      **TTL definido: 7 días** — entradas del mapeo con más de 7 días
      se descartan/ignoran (limpiar al escribir nuevas, o chequear
      antigüedad al leer). Si llega una reacción para un `message_id`
      que ya no está en el mapeo (vencido o nunca se guardó), se
      ignora silenciosamente.
- [ ] **4. Nuevo comando `/erinner`**: igual a `/nueva` pero solo
      escribe en columna E — busca la fila de la fecha dada, o si esa
      E ya está ocupada, sigue buscando hacia ARRIBA (fechas
      anteriores) la primera fila con E vacía. **Confirmado**: si la
      fecha dada no existe todavía, crea la fila (mismo comportamiento
      que `/nueva`).
- [ ] **5. Desborde de palabras.**
      **`VHS_INPUT`** es una hoja aparte del mismo Sheet, con 3
      categorías de vocabulario que David no sabe todavía ("Erinner
      mal!", "Wichtig", "tiefer Vokabeln"). La columna P de
      `WoerterDesTages` está vacía a propósito, como colchón de
      seguridad para no pisar datos existentes.
      5.1: si la fecha del día ya tiene 3 palabras (C/D/E llenas) y
      llega una más, escribirla en columna P de `WoerterDesTages`
      (misma fila).
      5.2: escribir TAMBIÉN (no excluyente con 5.1) en la hoja
      `VHS_INPUT`, columna E — categoría fija **"Wichtig"** — en la
      próxima fila totalmente vacía buscando desde abajo (actualmente
      ~fila 2268, tiene `-` y fórmulas ya puestas en filas usadas).
      Falta definir el algoritmo exacto para encontrar esa fila vacía
      (¿cachear un puntero en PropertiesService como
      `PUNTERO_FILA_R`, o escanear hacia abajo desde una fila
      conocida cada vez?).
- [ ] **6. Reestructuración de arquitectura**:
  - [ ] **a. ¿Sigue haciendo falta la hoja "Inbox"?** Si el punto 1
        reemplaza el flujo Inbox→R/S por escritura directa a C/D/E,
        evaluar borrar `guardarEnInbox`, `crearHojaInbox`,
        `probarInboxManual`, `procesarInbox`, `obtenerProximaFilaR`,
        y la llamada a `procesarInbox()` dentro de `tick()`
        ([Inboxdiccionario.gs](Inboxdiccionario.gs),
        [Polling.gs](Polling.gs)). Ojo: `manejarDictionary` también
        lee columnas R/S — ver si `/dictionary` sigue teniendo sentido
        tal cual o cambia de fuente de datos.
  - [ ] **b. ¿Sigue haciendo falta el formulario HTML (`doGet` +
        `paginaHTML`)?** Si ya no se usa, borrar `doGet`,
        `paginaHTML()` completa (bloque grande de HTML/CSS/JS
        inline), y evaluar si `guardarPalabras`/`manejarNueva` pueden
        simplificarse al no tener que soportar el formato
        `palabra1/2/3` del formulario (dejar solo el array
        `datos.palabras` usado por `/nueva`).
  - [ ] **c. Unificar archivos .gs.** Hoy son 6:
        [Form.gs](Form.gs), [Inboxdiccionario.gs](Inboxdiccionario.gs),
        [SpacedRepetition.gs](SpacedRepetition.gs),
        [PegarFrases.gs](PegarFrases.gs), [Polling.gs](Polling.gs),
        [Codigo.gs](Codigo.gs). `Codigo.gs` (funciones de menú manual
        para exportar CSV / detectar duplicados / copiar último mes)
        parece un dominio aparte (mantenimiento manual de
        `WoerteDesMonatsCSV`, no Telegram) — candidato a quedar
        separado. El resto (Form, Inbox, Polling, SpacedRepetition,
        PegarFrases) todo gira en torno al bot de Telegram + la hoja
        `WoerterDesTages` — candidatos a fusionar, a definir cuántos
        archivos finales y con qué corte (ej. uno solo `Telegram.gs` +
        `Mantenimiento.gs`, o mantener alguna separación temática).
        Confirmar con David el corte deseado antes de mover código.

## Aprendizajes ya confirmados (no repetir diagnóstico)

- El 302 intermitente es un límite conocido de la plataforma GAS Web App
  respondiendo a callers no autenticados — no es bug de código propio.
  Fuente: https://habr.com/ru/articles/1066054/ (ruso).
- Revisado `Form.gs` e `Inboxdiccionario.gs` (2026-08-04): no hay choque de
  nombres de función/constante entre archivos, el resto del sistema Inbox
  → R/S funciona bien.
