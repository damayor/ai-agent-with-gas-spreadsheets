# TASKS — Septiembre 2026

Nuevas features pedidas para la semana del 2026-09-01. Puntaje de
**urgencia** (1-5, 5 = más urgente) y **dificultad** (1-5, 5 = más
compleja) por tarea, para priorizar el orden de implementación.

## 1. Separar ALEMÁN / INGLÉS: 4 modos de guardado — ✅ IMPLEMENTADA

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

## 2. Resumen semanal + quiz — 🔶 EN PROGRESO (versión sin IA)

**Urgencia: 2 — Dificultad: 5**

Probado en Telegram y funciona: llegan los polls tipo quiz y marca
correcto/incorrecto solo. Implementado en `Quiz.gs`.

**Cómo arma cada quiz:**
- Rango = última marca "Mon &lt;día&gt;" en columna A hasta la fila previa
  al siguiente "Mon" (o fin de datos). No se agregó marca nueva.
- Vocab (B/C, E/F): solo palabras en negrilla, cursiva, con color de
  fondo, o nivel "B2". Grammar (Q/R bug→fix, S/T to/-ing): cualquier
  fila no vacía.
- 10 preguntas, 4 opciones c/u (distractores al azar del mismo tipo).

**Triggers agregados (falta correr una sola vez):** `quizSemanalDeutsch`
(de-input + de-output) domingo 12:00, `quizSemanalEnglish` (en-input +
en-output) jueves 12:00, ambos Europe/Berlin. Instalar corriendo
`crearTriggersQuizSemanal()` una vez desde el editor de Apps Script.

**Descartado por ahora:** redactar el quiz con la API de Claude
(~$0.02-0.03/semana con Sonnet) — se puede retomar más adelante.

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

## 4+7. Columna activa persistente para guardar palabra suelta — ✅ IMPLEMENTADA

**Urgencia: 3 — Dificultad: 3**

La tarea 4 original (segundo parámetro que sumaba una columna extra a
B) quedó reemplazada por este diseño, decidido junto con la tarea 7:
en vez de "B + columna extra", hay una única **columna activa**
persistente (estilo `/modo`) donde se guarda el texto libre.

- Columna activa default: `alle` → columna B (comportamiento
  original, sin cambios si nunca se toca nada).
- Segundo parámetro separado por coma en cualquier mensaje de palabra
  suelta cambia la columna activa **ya mismo** (esa palabra se guarda
  en la columna nueva, no en B) y la deja **fijada** para los
  mensajes sin coma que vengan después:
  - `, alle` → vuelve a columna B.
  - `, b2` → columna E.
  - `, erin` (o cualquier string que empiece así, ej. `erinner`) →
    columna I.
  - `, verin` (o `verinnerlich`, etc.) → columna L.
- Match por **prefijo** (`startsWith`), no palabra exacta.
- Mismas columnas B/E/I/L para los 4 modos (input-de, output-de,
  input-en, output-en) por igual — confirmado, no cambian según hoja.
- `/modo` sin argumento ahora también muestra la columna activa
  (además del modo idioma/dirección y la hoja destino).

Implementado en `guardarPalabraSuelta` / `CONFIG_COL_ACTIVA` /
`PROP_COL_ACTIVA` / `obtenerColActiva` (Telegram.gs).

## 5. Avisar cuando un día de repaso no tiene ninguna palabra

**Urgencia: 3 — Dificultad: 2**

En `enviarRecordatorioHoy()` (repaso espaciado), cuando el día
objetivo de repaso (ej. hace 180 días) no tiene ninguna palabra
registrada ese día, hoy simplemente no se manda nada para ese caso.
Se pide que en cambio mande una notificación por Telegram avisando
que ese día quedó vacío, para poder revisar los apuntes manualmente y
confirmar que efectivamente no hubo palabras ese día (vs. un error de
carga de datos).

**Estado:** parcialmente hecho — en `Repaso.gs:232` el caso
`todas.length === 0` solo hace `Logger.log(...)`, todavía no manda el
aviso por Telegram. Falta agregar el `enviarTelegram(...)` ahí.

## 6. Ampliar la lista de días a recordar: también por meses — ✅ IMPLEMENTADA

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

## 8. Bug: el puntero de última fila no ve reubicaciones manuales — ✅ IMPLEMENTADA

**Urgencia: (a definir) — Dificultad: (a definir)**

`guardarPalabraSuelta` (Telegram.gs) usa un puntero cacheado
(`PUNTERO_FILA_<hoja>`) y busca la última fila con dato **desde ese
puntero hacia adelante** para decidir la próxima fila libre. Problema:
a veces se reubican palabras a mano en la hoja (se mueven de fila),
lo que puede correr la última fila con dato real hacia una posición
**anterior** al puntero cacheado — y el puntero no lo detecta porque
nunca mira hacia atrás.

Se pide que la búsqueda de la última fila con dato también revise
unas filas **antes** del puntero cacheado (no solo desde ahí hacia
adelante), para no pisar datos reubicados ni dejar huecos.

A definir antes de programar: cuántas filas hacia atrás conviene
revisar (¿un margen fijo, ej. 5-10 filas, o releer desde una fila fija
más temprana?).

## 9. Bug: fila guardada puede caer en la fila equivocada cerca de las 2 AM

**Urgencia: (a definir) — Dificultad: (a definir)**
revisa weil auf deutsch angebittet habe.

**NO DESARROLLAR AÚN.**

`guardarPalabraSuelta` (Telegram.gs) elige la fila de destino como la
siguiente a la última fila con dato en B/E/I/L, sin ninguna noción de
fecha/día. Problema observado (ver captura): cerca de la fila 652 hay
varias columnas con datos de días distintos ya mezclados en filas
consecutivas (ej. fila 657 "new week", fila 658 "monday") — la próxima
palabra puede terminar escrita en una fila que en realidad "pertenece"
a una columna de un día distinto, o pegada de más cerca a datos que no
son del mismo día, en vez de arrancar una fila nueva y vacía para el
día en curso.

Se pide: si ya pasaron las 2 AM del día siguiente (zona horaria
`ZONA_HORARIA` / `Europe/Berlin`) desde el último guardado, forzar que
la próxima palabra se escriba en una fila nueva y completamente vacía
(no en la "siguiente a la última con dato" calculada de la forma
actual), para no mezclar palabras de días distintos en filas
contiguas o cercanas.

A definir antes de programar:
- Cómo trackear "cuándo fue el último guardado" (¿timestamp en
  PropertiesService junto al puntero de fila, por hoja?).
- Qué significa exactamente "fila nueva y vacía" acá: ¿la fila
  siguiente al máximo absoluto usado en la hoja (ignorando huecos), o
  dejar directamente una fila en blanco de separación antes de
  escribir?
- Relación con la tarea 8 (bug del puntero mirando hacia atrás): ambas
  tocan la misma función de cálculo de fila destino, conviene
  revisarlas/diseñarlas juntas.

## 10. Bug: al empezar un nuevo día, las columnas no arrancan alineadas en la misma fila — ✅ IMPLEMENTADA

**Urgencia: (a definir) — Dificultad: (a definir)**

`guardarPalabraSuelta` (Telegram.gs) resetea el puntero por columna de
forma **independiente** (`propPunteroCol`, líneas ~308-313): al
detectar que `fechaUltima !== hoy`, borra solo el puntero de la
columna activa de ese mensaje, sin mirar el puntero de las demás
columnas (B/E/I/L). Como cada columna puede tener distinta cantidad de
filas escritas el día anterior, la primera palabra del día nuevo de
cada columna puede terminar en una fila distinta — se ven tags de
fecha repetidos (ej. "Fri 4") en filas distintas de la columna A en
vez de una sola fila "cabecera" común para el día.

Se pide: cuando se detecta cambio de día, calcular el **máximo**
puntero/última-fila-con-dato entre las 4 columnas (B/E/I/L) de la hoja,
y alinear el puntero de la columna que está escribiendo a esa fila
máxima + 1, para que la fecha nueva en columna A quede visualmente
marcando el inicio de una "tabla nueva" con todas las columnas
arrancando en la misma fila.

A definir antes de programar:
- Cómo obtener el puntero/última fila de las columnas que **no** son
  la activa en ese momento (leer sus `propPunteroCol` guardados, o
  recalcular con el mismo escaneo hacia atrás que ya existe).
- Relación con las tareas 8 y 9 (misma función de cálculo de fila
  destino) — conviene diseñarlas juntas.

**Implementación final:** `alinearNuevoDiaHoja(spreadsheetId, nombreHoja)`
(Telegram.gs) — calcula la última fila real por columna (B/E/I/L), alinea
los 4 punteros + fecha en A a "máximo + 1", y pinta el borde grueso de
color de las 4 columnas en esa fila nueva común (no en la última celda
con dato real de cada una). `guardarPalabraSuelta` delega ahí mismo
cuando detecta cambio de día (red de seguridad lazy). Trigger diario:
`alinearNuevoDiaTodasHojas()` corre esto para las 4 hojas
(VHS_INPUT/OUTPUT, VKBLY_INPUT/OUTPUT) a las 2 AM Europe/Berlin, instalado
con `crearTriggerAlinearNuevoDia()`. Testeo manual: `testAlinearNuevoDia()`.

**A revisar:** el borde quedó pintado en el borde **inferior** de la
celda de la fila nueva (línea gruesa de color abajo de esa celda). No
confirmado si conviene mover a borde **superior** en su lugar —
particularmente cuando el día ya tenía alguna palabra escrita antes de
correr `testAlinearNuevoDia()` (probado un viernes 11 con datos ya
cargados ese mismo día), para chequear si cambia la lectura visual.

---

## Resumen de prioridad sugerida (por urgencia, luego dificultad ascendente)

1. Tarea 6 — urgencia 4, dificultad 4 (✅ implementada)
2. Tarea 1 — urgencia 4, dificultad 4 (✅ implementada)
3. Tarea 3 — urgencia 3, dificultad 2 (pendiente)
4. Tarea 5 — urgencia 3, dificultad 2 (parcial — falta el envío a Telegram)
5. Tarea 4+7 — urgencia 3, dificultad 3 (✅ implementada)
6. Tarea 2 — urgencia 2, dificultad 5 (en progreso — `Quiz.gs`, falta trigger automático)
7. Tarea 8 — urgencia/dificultad a definir (✅ implementada)
8. Tarea 9 — urgencia/dificultad a definir (no desarrollar aún; relacionada con tarea 8)
9. Tarea 10 — urgencia/dificultad a definir (✅ implementada)

La fecha la pone bien, pero sigue poniendo las palabras, mas arriba

pongame siempre los bordes cuando se actualize siempre la fecha
y actualiceme la fecha y los index y los bordes a las 2am de cada dia!


heyy si pongo en nueva, me ssrcibe la que puse antes!