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

- [x] **1. Palabra nueva del día va a `VHS_INPUT` o `VHS_OUTPUT`, no a
      columna R.** Reemplazado: en vez del flujo Inbox (texto libre →
      `guardarEnInbox` → columnas R/S), el texto libre ahora se
      escribe directo en columna B de `VHS_INPUT` (si la palabra es en
      alemán) o `VHS_OUTPUT` (si es en español), en la próxima fila
      vacía de esa columna B (no `getLastRow()` de toda la hoja —
      hay fórmulas arrastradas más abajo en C/F/J que la inflarían).
      **Modo activo** (INPUT u OUTPUT) se guarda en
      `PropertiesService` vía comando `/modo input` / `/modo output`
      (sin argumento muestra el modo actual); persiste entre mensajes
      hasta el próximo cambio. Implementado en
      [Form.gs](Form.gs): `manejarModo`, `obtenerModoPalabra`,
      `guardarPalabraSuelta`, enganchado en `procesarUpdateTelegram`.
      **Descartado por ahora**: el caso TAGESWORT (escribir en C/D/E
      de `WoerterDesTages`) que estaba documentado antes acá — no se
      implementa por el momento, queda como posible tercer modo futuro.
      Ver también punto 6a (¿sigue haciendo falta la hoja Inbox y
      `guardarEnInbox`, ahora que el texto libre no pasa por ahí?).
      **Pendiente**: pegar este cambio en el editor de Apps Script y
      probar `/modo`, `/modo input`, `/modo output` y un texto libre
      en cada modo end-to-end.
- [ ] **2. Comando `translate`: dado fecha + palabra (o solo palabra),
      devolver su traducción según el mapeo C→G, D→H, E→I** (columna
      de palabra → columna de traducción español correspondiente en
      la misma fila). Falta definir: ¿nombre exacto del comando
      (`/translate`?) y formato de argumentos (`/translate DD/MM,
      palabra`? ¿o busca la palabra en cualquier fecha si no se da
      fecha?).
- [x] **3. Colorear celda según emoji-reacción recibido en los
      recordatorios de repaso espaciado.** Implementado en
      [Polling.gs](Polling.gs) (`procesarReaccionTelegram`,
      `responderTraduccion`) y [SpacedRepetition.gs](SpacedRepetition.gs)
      (`obtenerPalabras` ahora trackea `fila`/`col`, `enviarTelegram`
      devuelve `message_id`, `guardarMapeoReaccion`/
      `obtenerMapeoReaccion` con TTL 7 días en `PropertiesService`).
      Reacciones nativas de Telegram sobre los mensajes de
      `enviarRecordatorioHoy()` (no aplica a `/ver` ni `/hoy`).
      **Mapeo final** (Wort = C/D/E, Satz = K/L/M):
      - ❤️ → sabía la palabra de memoria: Wort **y** Satz verde
        `#d9ead3`.
      - 👍 / 👌 → se acordó leyendo la frase: Wort amarillo
        `#fff2cc`, Satz verde `#d9ead3`.
      - 👎 / 🤔 → no la entendió ni con contexto: Wort **y** Satz
        amarillo `#fff2cc` + responde por Telegram con la traducción
        española (columna G/H/I según C/D/E).
      `allowed_updates` en `pollTelegram()` ahora incluye
      `message_reaction` (Telegram no lo manda por default).
      **Pendiente**: pegar el código actualizado en el editor de Apps
      Script y probar los 5 emojis (❤️ 👍 👌 👎 🤔) end-to-end.
      **Sin implementar todavía** (idea de David, queda para después):
      función que revise, para cada palabra, si hace un mes (mismo
      día) hay una celda verde — si la hay, la palabra sigue
      "aprendida" y no hace falta re-testear; si no, incluirla en el
      próximo repaso. Sirve para desactivar palabras ya aprendidas y
      enfocar los tests en las amarillas.
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
- [x] **6. Reestructuración de arquitectura**:
  - [x] **a. ¿Sigue haciendo falta la hoja "Inbox"?** Confirmado que
        no — el punto 1 reemplazó el flujo Inbox→R/S por escritura
        directa a columna B (VHS_INPUT/VHS_OUTPUT). Borrado
        [Inboxdiccionario.gs](Inboxdiccionario.gs) completo
        (`guardarEnInbox`, `crearHojaInbox`, `probarInboxManual`,
        `procesarInbox`, `obtenerProximaFilaR`). Sacada la llamada a
        `procesarInbox()` de `tick()` en [Polling.gs](Polling.gs) —
        ahora solo llama a `pollTelegram()`. También borrado
        `manejarDictionary` (comando `/dictionary`) de
        [Form.gs](Form.gs), ya que leía las columnas R/S que ya no se
        llenan. **Pendiente**: pegar estos cambios en el editor de
        Apps Script (borrar el archivo Inboxdiccionario.gs ahí
        también) y confirmar que no queda ningún trigger viejo
        apuntando a `procesarInbox`.
  - [x] **b. ¿Sigue haciendo falta el formulario HTML (`doGet` +
        `paginaHTML`)?** Ya eliminado por David directamente en el
        editor de Apps Script.
- [x] **7. Recordatorio diario para agregar palabras nuevas.**
      Implementado en [SpacedRepetition.gs](SpacedRepetition.gs):
      `enviarRecordatorioAgregarPalabras()` manda por Telegram el
      formato de `/nueva` (con ejemplo); `crearTriggerRecordatorioPalabras()`
      instala un trigger diario a las 23:30 (`Europe/Berlin`).
      **Pendiente**: pegar en el editor de Apps Script y correr
      `crearTriggerRecordatorioPalabras()` una vez a mano.
  - [x] **c. Unificar archivos .gs.** Reducido de 5 a 3:
        [Telegram.gs](Telegram.gs) (fusión de Form.gs + Polling.gs —
        comandos, ruteo, polling, reacciones), [Repaso.gs](Repaso.gs)
        (fusión de SpacedRepetition.gs + PegarFrases.gs — repaso
        espaciado y pegado de frases), y [Codigo.gs](Codigo.gs) sin
        tocar (dominio aparte: mantenimiento manual de
        `WoerteDesMonatsCSV`, no Telegram).
        De paso, unificadas constantes duplicadas con el mismo valor
        en los 3 archivos originales (`ID_HOJA_F`/`ID_HOJA`/
        `ID_HOJA_PF` → `ID_HOJA` único en Telegram.gs, ídem
        `NOMBRE_TAB`/`ZONA_HORARIA`), la función de parseo de fecha
        duplicada (`parsearFechaF`/`parsearFecha` → una sola
        `parsearFecha` en Repaso.gs) y las dos funciones de envío a
        Telegram (`responderTelegram` se mantuvo para respuestas por
        `chatId` directo desde comandos; `enviarTelegram` se mantuvo
        para envíos proactivos vía `TELEGRAM_CHAT_ID` guardado, que
        además devuelve `message_id` para el mapeo de reacciones —
        no se fusionaron porque tienen firmas y usos distintos).
        Eliminado código muerto del webhook histórico: `doPost`,
        `okResponse`, `registrarWebhook` (el mecanismo vigente es
        `pollTelegram()`; si se quiere reactivar el webhook, está en
        el historial de git). `eliminarWebhook`/`verWebhookInfo` se
        mantuvieron para diagnóstico.
        **Pendiente**: pegar `Telegram.gs` y `Repaso.gs` en el editor
        de Apps Script (borrar ahí también los 4 archivos viejos:
        Form.gs, Polling.gs, SpacedRepetition.gs, PegarFrases.gs) y
        confirmar que los triggers existentes (`tick`,
        `enviarRecordatorioHoy`, `enviarRecordatorioAgregarPalabras`)
        siguen apuntando bien a las funciones (mismo nombre, ahora en
        archivo distinto — GAS resuelve por nombre de función a nivel
        de proyecto, no debería requerir recrearlos, pero conviene
        confirmar en la lista de triggers del editor).

## Aprendizajes ya confirmados (no repetir diagnóstico)

- El 302 intermitente es un límite conocido de la plataforma GAS Web App
  respondiendo a callers no autenticados — no es bug de código propio.
  Fuente: https://habr.com/ru/articles/1066054/ (ruso).
- Revisado `Form.gs` e `Inboxdiccionario.gs` (2026-08-04): no hay choque de
  nombres de función/constante entre archivos, el resto del sistema Inbox
  → R/S funciona bien.


## New Tasks
      	
1. separeme ENG de ALEMAN: 4 modos output. Pues tenemos otro Google Spreadsheet de las palabras en Ingles https://docs.google.com/spreadsheets/d/1BGkECkcjR9TS4YwW-H_iTJeV6egqTcnGc0K2WWZLszk/edit?usp=sharing. En donde la idea principal es que INOUT O OUTPUT los guarde en las hojas "VKBLY INPUT" Y "VKBLY OUTPUT". Lo dejo a tu disposicion de que me digas si toca crear otro proyecto en GAS o con este podemos editar 2 archivos distintos de google spreadsheets.
	
2. Deme el resumen de la semana, hagame un quiz, algo…
		pre: para tal fecha tienen q estar todos las palabras del ultimo domingo al sabado .
		
		Pre: pues ponga la fecha en la columna A, una vez se reciba el primer elemento recibido o buscado… no desde media noche, sino desde 3am por aquello de…

            Deja una nuea linea en el excel donde se note que empieza esa semana de evaluacion
	
	
3. no me muestre la traduccion al reponder el emoji con 👎 / 🤔 si el mensaje es la traduccion en vez de la frase donde se usa.
	
4. nuevo param en modo guardar palabra, ya no solo en la columna B, sino agregar un segundo parametro para interiorizar despues de una ",". 
Si viene ", B2"  en la columna "E"
si recibe ", erinner" en la columna "I"
si recibe ", verinnerlich", en la columna "L"

5. si no hay palabras de un dia entero, diga un aviso o algo... pero que si llegue la notificacion de que el evento estaba scheduled

6. la lista de dias a recordar, ya no es solo por dias, sino tambien por meses, y al final se crea un nuevo array por todos los dias...
    Las primeras del dia son de ese mismo mes. La segunda mitad es de una nueva funcion tipo. El dia de hoy 01.09.2026 - pero de hace 8, 7 y 6 meses