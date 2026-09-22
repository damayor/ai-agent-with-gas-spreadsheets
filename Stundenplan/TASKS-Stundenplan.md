# TASKS — Stundenplan, Septiembre 2026

Puntaje de **urgencia** (1-5, 5 = más urgente) y **dificultad** (1-5, 5 =
más compleja) por tarea, para priorizar el orden de implementación.

## 1. Formato de escritura del payload vía Telegram

**Urgencia: 5 — Dificultad: 3 — Estado: en progreso**

Cambiar cómo se interpreta el mensaje de Telegram al escribir la celda:
saber en qué rango de minutos se escribió, y si contó como bloque
completo o como `/2`.

- [x] Rango de minutos del bloque + si contó completo o `/2` en la
      confirmación de Telegram (ver [verbindung.gs](verbindung.gs)
      `procesarActividad`).
- [x] `Tag, end` recibido en los primeros `MARGEN_CIERRE_BLOQUE_ANTERIOR`
      (7) minutos del bloque actual se escribe en el bloque **anterior**
      como completo (0.5h), en vez de marcar el bloque entrante como
      `/2`. Ejemplo: son las 10:02 y llega `Tag, end` → se escribe en el
      bloque anterior, no en el de las 10:00.
- [ ] **Dos actividades en el mismo bloque, ambas `/2`** — escritas por
      David en **un solo mensaje** de Telegram, separadas por ` + `:
      `TagA /2 + TagB /2`. Cada una ocupa 15 min del bloque de 30.

Decisiones ya tomadas (ver respuestas #1-#3):

- El bloque de 30 min se parte en **exactamente dos mitades de 15 min**.
  El ` + ` en el mensaje es lo que indica que ambas comparten el bloque.
- **No hay caso de tercer tag** — la idea es dividir el bloque en dos
  espacios iguales, nada más.
- Si el bloque ya tiene un tag **completo** (no `/2`) y llega un mensaje
  nuevo, **se sobreescribe**, como hoy. No hay append entre mensajes
  distintos: las dos tareas vienen juntas o no vienen.

Implementación:

- [ ] **Parsear el ` + ` en `procesarUpdateTelegram`**
      ([verbindung.js:315-318](verbindung.js#L315-L318)). Hoy
      `esMedioBloqueInput` usa `/\/2\s*$/`, que solo mira el final del
      string: con `TagA /2 + TagB /2` el tag quedaría como el literal
      `TagA /2 + TagB`. Hay que separar por ` + ` **primero** y parsear
      cada mitad por separado.
- [ ] El `, end` sigue aplicando al mensaje entero (se separa por `,`
      antes que por `+`), no por tarea.
- [ ] `procesarActividad` recibe las dos tareas y escribe la celda como
      `TagA /2 + TagB /2 :MM`, con **un solo** sufijo `:MM` al final (el
      minuto de llegada del mensaje — uno solo, porque es un solo
      mensaje).
- [ ] **Corregir el conteo de horas**, que hoy queda mal con dos tags en
      una celda: `actualizarHorasPorActividad` y el bloque de la línea 70
      en [Codigo.js](Codigo.js) usan `String(valores[i]).includes("/2")`,
      un booleano por celda — con `TagA /2 + TagB /2` cuentan 0.25h en
      total cuando en realidad son 0.25h + 0.25h = 0.5h. Hay que contar
      **cuántos** `/2` hay en la celda, no si hay alguno.
### Conteo de bloques compartidos (resuelve #12)

El problema: el conteo agrupa por **color de fondo**, pero una celda
tiene un solo color y `Arbeit /2 + Sport /2` son dos grupos distintos.

La clave es que **el color ya se deriva del texto**: el formato
condicional de `aplicarFormatoCondicional` pinta la celda con
`REGEXMATCH` sobre las palabras clave de `K17:K39` → color de
`L/M17:M39`. O sea, el texto es la fuente de verdad y el color es un
reflejo. No hace falta mezclar colores ni escribir el color en la celda:
alcanza con contar por texto en el caso compartido.

- [ ] Extraer un helper `grupoDeTexto(texto, tablaRef, listaColores)`
      que haga el mismo match de palabras clave que
      `aplicarFormatoCondicional`, pero en JS: devuelve el color/grupo
      que le correspondería a ese texto. Es la misma tabla K/L/M, leída
      una sola vez.
- [ ] En `actualizarHorasPorActividad` ([Codigo.js:65-74](Codigo.js#L65-L74)),
      reemplazar el `includes("/2")` booleano por: separar el valor de la
      celda por ` + `; si hay **una** parte, contar como hoy (por color
      de fondo, 0.5h o 0.25h según `/2`); si hay **dos**, resolver el
      grupo de cada parte con `grupoDeTexto` y sumar **0.25h a cada
      grupo**.
- [ ] Mismo tratamiento en el otro conteo
      ([Codigo.js:319-329](Codigo.js#L319-L329)), que hoy hace
      `totalHoras += esMedioBloque ? 1 : 2` en unidades de 0.25h.
- [ ] El color de fondo de la celda compartida queda como lo pinte el
      formato condicional (probablemente el de la primera palabra que
      matchee) — es **solo visual**, el conteo ya no depende de él. Vale
      la pena confirmar que la celda no quede sin color si el texto
      combinado no matchea ninguna regla.
- [ ] Lo mismo en el resumen (`resumenDiaActividades`): el regex de la
      línea 144 corta el tag en el primer `/2`, así que de
      `TagA /2 + TagB /2 :MM` solo saca `TagA`. Hay que separar por ` + `
      antes de parsear cada tag.
- [ ] Validar que no lleguen 3+ tareas en un mensaje (`TagA + TagB +
      TagC`): avisar por Telegram en vez de escribir algo que rompa el
      conteo.

## 2. Quitar el color vinotinto al borrar contenido de una celda

**Urgencia: 4 — Dificultad: 2 — Estado: no iniciado**

Al borrar el texto de una celda (del rango de producción), debe quitarse
también el color de fondo vinotinto que quedó puesto — hoy solo se borra
el texto y el color se queda.

No encontré en el código actual (`Codigo.gs`, `verbindung.gs`) ningún
manejo de "vinotinto" ni un `onEdit` que reaccione a borrado de
contenido para limpiar el fondo — sigue pendiente de implementar pese a
que el ítem original estaba tildado `[x]`.
**Pregunta para David** (ver #4 abajo).

## 3. Resumen de fin de día

**Urgencia: 3 — Dificultad: 3 — Estado: no iniciado**

Al final del día, mandar (¿por Telegram?) un resumen de las actividades
que quedaron hechas/guardadas ese día — incluyendo lo escrito vía
Telegram y lo editado manualmente después — pero **solo** las que
cumplen el formato esperado (o sea, celdas que no están tachadas).

**Preguntas para David** (ver #5-#8 abajo).

## 4. Resumen de inicio de día (agenda de la mañana)

**Urgencia: 3 — Dificultad: 2 — Estado: implementado, falta correr `crearTriggerAgendaMatutina` a mano**

El espejo de la tarea 3: en vez de contar lo que ya hice, avisar al
arrancar el día lo que está **programado** — **7:00 de lunes a viernes,
8:30 sábado y domingo**.

El mensaje lista los bloques en orden cronológico y dice explícitamente
la **hora del primer bloque** — o sea a qué hora arranca realmente el
día, que no tiene por qué coincidir con la hora del aviso.

Decisiones ya tomadas (ver respuestas #9-#11):

- **Bloques consecutivos con el mismo texto se colapsan** en una sola
  línea con el rango completo. "Mismo texto" es el contenido de la celda,
  no solo el tag: si difieren en algo, van en líneas separadas.
- **Se lista el día entero**, incluidos los bloques anteriores a la hora
  del aviso — la agenda no arranca desde la hora actual.

Formato:

```
Agenda de hoy — arranca 6:30

06:30-06:59  Sport
08:30-08:59  Deutsch
09:00-10:59  Arbeit
```

Implementación (reutiliza lo que ya existe):

- [x] `resumenDiaProgramado(dia)` en [Codigo.js](Codigo.js), calcado de
      `resumenDiaActividades` (misma columna vía `calcularColumna`, mismo
      rango 48 filas desde la fila 2) pero **sin** agrupar por color:
      devuelve los bloques en orden cronológico, cada uno con su rango
      horario.
- [x] La hora del bloque se deriva del índice de fila, invirtiendo
      `calcularFila` (`etiquetaHoraBloque`/`etiquetaFinBloque`).
- [x] **Corrección tras primera versión:** no se filtra por tachado ni
      por negrita/itálica. Tachado (`line-through`) solo saca al bloque
      del **conteo de horas** (`actualizarHorasPorActividad`), no de lo
      programado — David tacha lo que no cumplió, pero sigue siendo
      planning. Y negrita+itálica (escrito vía Telegram, ver
      `procesarActividad` en [verbindung.js](verbindung.js)) sigue
      siendo parte de la agenda: si ya está registrado es porque ese
      bloque todavía no pasó. La agenda lista cualquier celda no vacía.
- [x] **Colapsar bloques consecutivos con el mismo texto**, comparando
      el **valor crudo de la celda** (no el tag parseado): `Arbeit /2
      :15` y `Arbeit :00` no se colapsan. El fin del rango es el minuto
      59 del último bloque de la corrida (`09:00` + `09:30` → texto
      idéntico → `09:00-09:59`); una fila vacía o un texto distinto
      corta la corrida. Probado con `node` fuera de GAS antes de subir.
- [x] Primer bloque = el primero que sobrevive al filtro (puede ser
      anterior a la hora del aviso, se lista igual); si no hay ninguno,
      devuelve "Nada programado para hoy." sin encabezado de hora.
- [x] Comando manual de Telegram `/agenda`
      (`manejarComandoAgenda` en [verbindung.js](verbindung.js)), calcado
      de `manejarComandoCalend`.
- [x] Dos triggers diarios (`crearTriggerAgendaMatutina`), usando el
      `TELEGRAM_CHAT_ID` guardado en Script Properties: uno a las 7:00
      que se auto-descarta sábado/domingo (`enviarAgendaEntreSemana`), y
      otro a las 8:30 que solo corre esos dos días
      (`enviarAgendaFinDeSemana`).
- [ ] **Pendiente correr a mano**: `crearTriggerAgendaMatutina()` desde
      el editor de Apps Script, una sola vez, para instalar los dos
      triggers (igual que se hizo con `crearTriggerResumenNocturno`).

Preguntas #9-#11 ya respondidas — la tarea está lista para programar.

---

## Resumen de prioridad sugerida

1. Tarea 1 (parte pendiente: append de dos `/2`) — urgencia 5, dificultad 3
2. Tarea 2 — urgencia 4, dificultad 2
3. Tarea 3 — urgencia 3, dificultad 3
4. Tarea 4 — urgencia 3, dificultad 2 (conviene hacerla junto con la 3:
   comparten el armado del mensaje y el trigger)

---

## Preguntas para David (antes de programar)

**Sobre la tarea 1 (append de dos `/2` en la misma celda) — RESPONDIDAS:**

1. Formato `TagA /2 + TagB /2 :MM` — el ` + ` indica que comparten el
   bloque, **15 min para cada uno**. Lo escribe David en **un solo
   mensaje**; no es concatenación de dos mensajes separados.
2. **No hay tercer tag** — el bloque se divide en dos espacios iguales
   únicamente.
3. Bloque ya completo + mensaje nuevo → **se sobreescribe** (como hoy).

**Sobre la tarea 1 — PENDIENTE:**

12. **RESUELTA** — ver "Conteo de bloques compartidos" en la tarea 1.
    Se descartaron (a) "son del mismo grupo" y (b) "todo al color de la
    primera": la idea es cronometrar bien cada tarea. Se va por (c),
    repartir 0.25h a cada grupo, contando **por texto en vez de por
    color** para las celdas con ` + `.

**Sobre la tarea 2 (color vinotinto al borrar):**

4. ¿Dónde se pone ese color vinotinto hoy — es manual (lo pintás vos a
   mano en el Sheet) o hay alguna función/formato condicional que lo
   aplica automáticamente? Si es formato condicional, decime la regla
   (o el rango) para poder ubicarla; si es manual, ¿el pedido es que un
   `onEdit` detecte cuando una celda del rango de producción queda
   vacía y le quite el `setBackground` a mano (blanco/sin color)?

**Sobre la tarea 3 (resumen de fin de día):**

5. ¿El resumen se manda por Telegram (como las confirmaciones de
   escritura), se escribe en alguna celda/hoja del Sheet, o ambas?
6. ¿A qué hora se dispara — trigger fijo (ej. 23:55) o un comando manual
   que vos mandás cuando querés el resumen?
7. "Que cumplan el formato" — ¿el criterio exacto es: celda no vacía y
   sin tachado (`setFontLine`), sin importar si es `/2` o completo? ¿Se
   incluyen las celdas escritas a mano al planear la semana (texto
   normal, no negrita/itálica) o solo las marcadas como reales (vía
   Telegram o editadas después, en negrita/itálica)?
8. ¿El resumen agrupa por tag (ej. "Tag A: 2.5h, Tag B: 1h") o lista
   cada bloque individualmente con su rango horario?

**Sobre la tarea 4 (agenda de la mañana) — RESPONDIDAS:**

9. Bloques consecutivos con el mismo tag: **se colapsan**, siempre y
    cuando tengan el mismo texto adentro.
10. Hora del aviso: **7:00 de lunes a viernes, 8:30 sábado y domingo**.
11. Bloques anteriores a la hora del aviso: **se listan igual** — la
    agenda no arranca desde la hora actual.

Vamos con tarea 1

Vuelvalo .js
y que se pueda subir solito a GAS