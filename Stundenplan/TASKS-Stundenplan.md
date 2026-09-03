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
- [ ] **Dos actividades en el mismo bloque, ambas `/2`.** Hoy
      `cell.setValue(valorCelda)` **sobreescribe** cualquier contenido
      previo de la celda. Falta la regla de "no sobreescribir sino
      append" cuando ya hay algo escrito en esa celda y el nuevo valor
      también es `/2`.
      **Preguntas para David** (ver sección de preguntas abajo, #1-#3).

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

---

## Resumen de prioridad sugerida

1. Tarea 1 (parte pendiente: append de dos `/2`) — urgencia 5, dificultad 3
2. Tarea 2 — urgencia 4, dificultad 2
3. Tarea 3 — urgencia 3, dificultad 3

---

## Preguntas para David (antes de programar)

**Sobre la tarea 1 (append de dos `/2` en la misma celda):**

1. Cuando ya hay un tag `/2` en la celda y llega un segundo tag también
   `/2` para el mismo bloque, ¿el resultado se ve como `TagA /2 + TagB
   /2 :MM` (concatenado con algún separador), o hay un formato distinto
   que preferís?
2. ¿Qué pasa si llega un tercer tag para el mismo bloque (ya con dos
   `/2` puestos)? ¿Se permite, se ignora, se avisa por Telegram que el
   bloque ya está lleno?
3. ¿Qué pasa si el bloque ya tiene un tag de bloque **completo** (no
   `/2`, o sea ya "lleno" con 0.5h) y llega un mensaje nuevo para ese
   mismo bloque? ¿Se sobreescribe (comportamiento actual), se rechaza,
   o se avisa por Telegram del conflicto?

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

Vamos con tarea 1