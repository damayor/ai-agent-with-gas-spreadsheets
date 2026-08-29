# TASKS — Stundenplan (migración a Polling)

Checklist de los pasos manuales pendientes tras migrar `verbindung.gs` de webhook a
polling (ver [context.md](context.md) para el detalle completo de la migración).

- [x] **1. Agregar `TELEGRAM_TOKEN` en Script Properties.**
      Extensiones > Apps Script > ⚙️ Configuración del proyecto > Propiedades del script >
      agregar propiedad `TELEGRAM_TOKEN`.
      Valor: el token del bot **MayStundenplan**, el mismo que estaba hardcodeado en
      `verbindung.gs` antes de la migración: `8766703385:AAGy8i_2adBysloHoX09qc_KevBS29JeUuo`.
      Ese token lo dio **@BotFather** al crear el bot — no hay que generarlo de nuevo. Si se
      quiere rotar (recomendado, porque estuvo expuesto en texto plano en el código), hablar
      con @BotFather sobre el bot MayStundenplan (`/mytoken` o `/revoke`) y usar el nuevo
      valor acá.

- [x] **2. Correr `clearTelegramWebhook()`** (en `verbindung.gs`, desde el editor de Apps
      Script) — elimina el webhook viejo y descarta la cola de updates pendientes/atascados.

- [x] **3. Correr `crearTriggerTick()`** (en `Polling.gs`) — instala el trigger de tiempo
      que llama a `tick()` cada 1 minuto. Correr una sola vez; la función ya chequea si el
      trigger existe para no duplicarlo.

- [x] **4. Probar end-to-end**: mandar un mensaje de prueba al bot MayStundenplan (ej.
      `"Hamburg, init"`) y confirmar:
      - que se escribe **una sola vez** (no en loop) en el rango **C76:I123** de la primera
        hoja, en la celda correspondiente al bloque de 30 min y día actual.
      - en el log de ejecuciones de Apps Script (Executions), que `tick()` → `pollTelegram()`
        → `procesarUpdateTelegram()` corrieron sin error.
      - Confirmado 2026-08-17 19:14: mensaje "Gym, init" → `chat_id` tomado del propio
        update (6471003088, ya no el hardcodeado que daba "chat not found") → escrito una
        sola vez en C114 (lunes 19:00) → `pollTelegram` sin error. El chat_id real resultó
        ser distinto al que estaba hardcodeado en el código viejo; ya se usa
        `update.message.chat.id` en vez de una constante (ver [verbindung.gs](verbindung.gs)).

- [x] **5. Resolver el TODO de `isEnding`/"END"** en `procesarActividad()` (verbindung.gs) —
      definir qué debe pasar realmente al finalizar una actividad (hoy solo sobrescribe la
      celda con el string `"END"`).
      Resuelto 2026-08-17: se eliminó `isEnding` por completo. Cada mensaje escribe su tag
      en el bloque actual; sin auto-relleno, el siguiente bloque queda vacío hasta el
      próximo mensaje. `procesarActividad(tag)` y `procesarUpdateTelegram` simplificados
      en consecuencia. Ver detalle en [context.md](context.md).

- [ ] **6. Rotar el bot token** si no se hizo en el paso 1 (quedó expuesto en texto plano en
      el historial de git antes de esta migración).

- [x] **7. Optimizar la fórmula `HORAS_LABORALES`.**
      Se está recalculando en cada minuto en el script Codigo.ts. Debería bastar con recalcularla un
      par de veces al día en vez de por minuto en la celdas que llaman a esta funcion (rango B52:I52 en todas las hojas). O mas bien solo llamarla en las primeras 3 hojas, una vez la hoja ya tiene mas de un mes de creada. dejar solo los valores actuales de cada celda
      Opciones a evaluar: mover el cálculo a
      una función de Apps Script que corra 1-2 veces al día vía trigger de tiempo
      (en vez de fórmula de hoja), o revisar si la fórmula actual usa algo volátil
      (`NOW()`, `TODAY()`, rangos completos de columna) que dispare recálculo en cada
      `tick()` aunque el rango de horas no haya cambiado.

      Resuelto 2026-08-17: la causa era que `HORAS_LABORALES(...)` estaba escrita como
      fórmula viva en C52:I52 — Sheets la recalcula como "función personalizada" en cada
      refresco de la hoja (de ahí las ~193 ejecuciones/semana solo de esa función, varias
      por segundo). Se quitó del rol de fórmula: `Codigo.gs` ahora tiene
      `actualizarHorasLaboralesFila52()`, que calcula las 7 columnas (C..I) y las pega como
      **valor plano** con `setValues` en C52:I52. Se llama solo al marcar el checkbox N13
      (dentro de `onEdit`), igual que ya hacía `actualizarHorasPorActividad()`.

      **Pendiente manual**: borrar las fórmulas `=HORAS_LABORALES(...)` que hoy están
      escritas en C52:I52 en cada hoja (Ctrl+/Cmd+ borrar contenido, no toda la fila) —
      si no, la fórmula sigue viva y el problema persiste. Después de borrarlas, marcar
      N13 una vez para que `onEdit` pegue los valores iniciales.

- [x] **8. Registrar y contar bloques de 15 minutos (medio bloque de 30 min).**
      Hoy cada bloque de 30 min se pinta de un solo color = 0.5h completas en
      `HORAS_LABORALES` (Codigo.gs). No hay forma de marcar que solo se trabajaron 15 min
      de ese bloque (ej. algo que arrancó a xx:15 o terminó a xx:45).

      Definición propuesta (a validar):
      - **Notación en el texto de la celda**: agregar un sufijo al tag que indique "medio
        bloque", ej. `Gym/2` o `Gym'` (evitar `0.5` como sufijo — se presta a confundirse
        con las propias 0.5h de un bloque completo). Sugerencia: `/2` porque es corto,
        no choca con el separador `,` que ya usa Telegram (`"tag,end"` — aunque `end` ya se
        eliminó, ver punto 5), y se lee bien tanto en la celda como en el texto que manda
        el bot.
      - **Formato de celda para que se note a simple vista que es medio bloque** (no todo el
        color plano de un bloque completo): opciones de Apps Script que no rompen el
        formato condicional existente (`aplicarFormatoCondicional` en Codigo.gs):
        - Texto en cursiva o con un ícono (`⯨`, `◐`, `½`) antepuesto al tag para
          marcar visualmente "medio bloque" sin pelear con la API de bordes/rellenos.
        - Revisar en la hoja real qué opción se ve mejor antes de implementar — este punto
          necesita una prueba visual, no solo código.
      - **Conteo en `HORAS_LABORALES`**: al iterar `backgrounds`/valores del rango, si el
        texto de la celda tiene el sufijo de medio bloque, sumar `0.25` en vez de `0.5`.
        Requiere leer `range.getValues()` además de `getBackgrounds()` (hoy solo lee
        backgrounds + `getFontLines()` para tachado).
      - **En `verbindung.gs`/Telegram**: decidir si el bot acepta el sufijo directamente en
        el mensaje (ej. `"Gym/2, init"`) y lo escribe tal cual en la celda, o si el sufijo
        solo se agrega manualmente en la hoja.

      Pendiente: definir el sufijo final y confirmar el formato visual mirando la hoja
      real antes de tocar código.

      **Fase 1 hecha (2026-08-18) — solo texto/formato, sin tocar el conteo todavía:**
      `procesarActividad` (verbindung.gs) ahora escribe `"{tag} :MM"` en la celda, con el
      minuto real (sin redondear) en que llegó el mensaje de Telegram — ej. `"Gym :14"` si
      llegó a las 19:14, aunque el bloque calculado siga siendo 19:00 (el redondeo de
      `procesarActividad` a bloques de 30 min con margen de 5 min ya existía y no se tocó:
      si el mensaje llega a ≤5 min del siguiente bloque, salta directo a ese bloque, como
      ya hacía antes). Confirmado que no rompe `aplicarFormatoCondicional`
      (`REGEXMATCH` hace match por substring, así que "Gym :14" sigue coloreando igual
      que "Gym"). Formato bold+italic (ticket 9) se mantiene.

      **Fase 2 hecha (2026-08-18) — regla de conteo:**
      Regla acordada: dentro del bloque de 30 min ya asignado, si el minuto real del
      mensaje es **< 15 → bloque completo (0.5h)**; si es **>= 15 → medio bloque (0.25h)**,
      salvo que el mensaje ya haya saltado al siguiente bloque por el margen de 5 min
      existente (`saltoDeBloque` en `procesarActividad`) — en ese caso siempre cuenta como
      inicio de bloque nuevo, nunca medio bloque.

      `procesarActividad` (verbindung.gs) ahora antepone el sufijo **`/2`** al minuto
      cuando aplica medio bloque, ej. `"GAS /2 :20"` (antes de `:MM`, como se pidió).
      `HORAS_LABORALES` (Codigo.gs) ahora también lee `range.getValues()` (antes solo
      `getBackgrounds()`/`getFontLines()`): por cada celda con color+sin tachar, si el
      texto contiene `"/2"` suma 0.25h, si no suma 0.5h (internamente acumula en unidades
      de 0.25h y multiplica al final, para no perder precisión de punto flotante sumando
      0.5 muchas veces).

- [x] **9. Pasar la escritura de Telegram al rango de producción C2:I49.**
      Hecho 2026-08-18: `TELEGRAM_FILA_BASE` pasó de 76 a 2 en `verbindung.gs` —
      `procesarActividad` y `testCelda` ya escriben directamente en C2:I49, el mismo rango
      que usa `Codigo.gs` para el formato condicional por color y `HORAS_LABORALES`. El
      rango de pruebas C76:I123 queda sin uso.
      Para diferenciar lo escrito en tiempo real (vía Telegram) de lo planeado al inicio de
      semana, la celda se pone en **negrilla + itálica** (`setFontWeight("bold")` +
      `setFontStyle("italic")`) al escribirse.

      **A tener en cuenta**: si luego alguien reescribe manualmente esa celda (para
      corregir un tag, por ejemplo), el formato bold+italic queda pegado a menos que se
      quite a mano — no hay lógica que lo revierta automáticamente.

- [x] **10. Soportar cierre temprano de actividad: "Tag END" en los primeros ~15 min de un bloque.**
      Caso de uso: mandas `"Freelancer END"` a las 15:45 (±5 min). El bloque 15:30-15:59
      recién empieza a esa hora, pero la actividad solo se trabajó esos primeros minutos
      antes de terminar — debe contar como **medio bloque (0.25h)**, igual que la regla
      `/2` del ticket 8, pero para el caso simétrico: ahí `/2` se dispara cuando el
      mensaje llega tarde dentro del bloque (minuto >= 15); acá se dispara cuando el
      mensaje llega temprano pero marca *fin*, no inicio.

      Definición acordada (2026-08-18):
      - El mensaje `"Tag END"` a las 15:45 marca el bloque **actual/entrante**
        (15:30-15:59, no el anterior) con `/2`, porque solo se alcanzó a trabajar la
        primera mitad antes de cerrar.
      - Formato de celda: mismo patrón que ya existe (`tag` + `/2` + `:MM`), agregando la
        palabra `END` para diferenciarlo de un inicio normal de actividad. Ej. resultado
        esperado: `"Freelancer END /2 :45"`.

      Decisiones finales (2026-08-19):
      - Formato del mensaje: **con coma**, `"Tag,end"` (reintroduce el patrón viejo en vez
        de texto libre) — parseo inequívoco vía `split(",")`, sin riesgo de que un tag real
        contenga la palabra END.
      - `/2` se marca **siempre** que el mensaje sea un cierre (`isEnding`), sin importar el
        minuto real ni `saltoDeBloque` — no hay caso "minuto >= 15 -> bloque completo" para
        cierres, a diferencia de la regla de inicios tardíos.

      Implementado:
      - `procesarUpdateTelegram` (verbindung.gs): parsea `parts[1]?.toLowerCase() === "end"`
        y pasa `isEnding` a `procesarActividad(tag, isEnding)`.
      - `procesarActividad`: nuevo parámetro `isEnding = false`. Cuando es `true`, fuerza
        `esMedioBloque = true` y antepone `" END"` al tag en la celda — resultado ej.
        `"Freelancer END /2 :45"`.
      - `HORAS_LABORALES` no requirió cambios — ya lee `/2` por substring (ticket 8).

## Nuevas Tasks

  cambia el formato de escritura

  una que permita escribir en la celda anterior, algo asi como end, y si son :05 escriba antes...

  los pinches colores vinotinto si borro algo pues eghh quitelos.