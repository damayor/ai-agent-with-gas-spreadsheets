# TASKS — Septiembre 2026

Nuevas features pedidas para la semana del 2026-09-01. Puntaje de
**urgencia** (1-5, 5 = más urgente) y **dificultad** (1-5, 5 = más
compleja) por tarea, para priorizar el orden de implementación.

## 1. Separar ALEMÁN / INGLÉS: 4 modos de guardado

**Urgencia: 4 — Dificultad: 4**

Hoy existe un solo par de modos (`/modo input` / `/modo output`) que
escribe en `VHS_INPUT` / `VHS_OUTPUT` del Spreadsheet de alemán. Se
agrega vocabulario en inglés, en otro Spreadsheet
(`1BGkECkcjR9TS4YwW-H_iTJeV6egqTcnGc0K2WWZLszk`), hojas
`VKBLY INPUT` / `VKBLY OUTPUT`.

**Decisiones confirmadas:**
- Mismo proyecto de Apps Script: se abre el segundo Spreadsheet con
  `SpreadsheetApp.openById(...)`, sin crear un proyecto GAS nuevo.
- 4 modos: `input-de`, `output-de` (como ahora, VHS_INPUT/VHS_OUTPUT),
  `input-en`, `output-en` (nuevos, VKBLY INPUT/VKBLY OUTPUT).

**A definir antes de programar:**
- Comando exacto para elegir idioma+dirección (¿`/modo input-en`,
  `/modo en input`, o un segundo comando `/idioma`?).
- ID de columna en las hojas de inglés (¿misma estructura columna B
  que VHS_INPUT/OUTPUT, o distinta?).

## 2. Resumen semanal + quiz

**Urgencia: 2 — Dificultad: 5 (a definir)**

Idea: generar un resumen/quiz de las palabras de la semana (domingo a
sábado, ventana desde las 3am del domingo, no medianoche), y dejar una
línea en el Excel marcando el inicio de cada semana de evaluación.

**Queda pendiente de diseño** — no arrancar código todavía. Falta
definir: trigger (comando manual vs automático), formato del quiz en
Telegram, y el mecanismo exacto de la marca de "inicio de semana" en
la hoja.

## 3. No mostrar traducción al reaccionar 👎/🤔 si el mensaje ya es la traducción

**Urgencia: 3 — Dificultad: 2**

Hoy, al reaccionar con 👎 o 🤔 sobre un recordatorio, se responde
siempre con la traducción (columna G/H/I). Se debe omitir esa
respuesta cuando el mensaje reaccionado ya era la palabra/traducción
en sí (Wort, columnas C/D/E) en vez de la frase de ejemplo (Satz,
columnas K/L/M).

**Implementación:** usar el mapeo fila/columna que ya trackea
`guardarMapeoReaccion`/`obtenerMapeoReaccion` (de la feature de
colorear celdas) para distinguir si la reacción cayó sobre un mensaje
de Wort o de Satz, y solo responder con la traducción en el caso Satz.

## 4. Segundo parámetro para "interiorizar" al guardar palabra

**Urgencia: 3 — Dificultad: 3**

Al guardar una palabra suelta en modo input/output (los 4 modos de la
tarea 1), se agrega un segundo parámetro opcional separado por coma:

- Sin coma → se guarda solo en columna B (comportamiento actual, sin
  cambios).
- `, B2` → además se guarda en columna E.
- `, erinner` → además se guarda en columna I.
- `, verinnerlich` → además se guarda en columna L.

Aplica a los 4 modos (input-de, output-de, input-en, output-en) por
igual.

**A definir antes de programar:** ¿las columnas E/I/L son siempre las
mismas sin importar el modo/idioma, o cambian según la hoja
(VHS_INPUT/OUTPUT vs VKBLY INPUT/OUTPUT)? Revisar estructura real de
las hojas de inglés antes de fijar los índices de columna.

## 5. Avisar cuando un día de repaso no tiene ninguna palabra

**Urgencia: 3 — Dificultad: 2**

En `enviarRecordatorioHoy()` (repaso espaciado), cuando el día
objetivo de repaso (ej. hace 180 días) no tiene ninguna palabra
registrada ese día, hoy simplemente no se manda nada para ese caso.
Se pide que en cambio mande una notificación por Telegram avisando
que ese día quedó vacío, para poder revisar los apuntes manualmente y
confirmar que efectivamente no hubo palabras ese día (vs. un error de
carga de datos).

## 6. Ampliar la lista de días a recordar: también por meses

**Urgencia: 4 — Dificultad: 4**

`enviarRecordatorioHoy()` hoy arma la lista de fechas a repasar solo
dentro del mes en curso. Se pide ampliarla: la lista final combina dos
mitades —
- Primera mitad: días del mes actual (comportamiento actual).
- Segunda mitad: mismo día calendario de hace 6, 7 y 8 meses atrás
  (ej. si hoy es 01.09.2026, agrega 01.03.2026, 01.02.2026 y
  01.01.2026).

Ambas mitades se combinan en un único array antes de buscar las
palabras a repasar.

---

## Resumen de prioridad sugerida (por urgencia, luego dificultad ascendente)

1. Tarea 6 — urgencia 4, dificultad 4
2. Tarea 1 — urgencia 4, dificultad 4
3. Tarea 3 — urgencia 3, dificultad 2
4. Tarea 5 — urgencia 3, dificultad 2
5. Tarea 4 — urgencia 3, dificultad 3
6. Tarea 2 — urgencia 2, dificultad 5 (bloqueada por definición de diseño)
