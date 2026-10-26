# TASKS — Octubre 2026

Features pedidas para octubre. Misma convención que [TASKS-sept.md](TASKS-sept.md):
**urgencia** (1-5, 5 = más urgente) y **dificultad** (1-5, 5 = más compleja).

## 1. Bitácora de errores: hoja `BD_FEHLER` — 🔶 EN PROGRESO

**Urgencia: 3 — Dificultad: 3**

Hoja nueva `BD_FEHLER` en el Spreadsheet de alemán, con la misma idea de
bitácora que `VHS_INPUT` / `VHS_OUTPUT`, pero para **errores** en vez de
palabras sueltas. Cada categoría de la skill `/deu` es un bloque de columnas.

**Fuente de datos:** tabla `mistakes_de` de la D1 `de-berichtigung-db`.
Alimentada por `/deu`; la hoja es solo una vista de lectura para repasar.

### Layout

- **Columna A = fecha**, como en VHS (`Mon 21`): solo en el primer error del
  día; al empezar un día nuevo todos los bloques se alinean a la misma fila.
  Los bloques de categorías empiezan en la columna B.
- **Fila 1 fija** (`setFrozenRows(1)`), con el nombre de cada categoría sobre
  su primera columna, en este orden:
  Grammatik · Präposition und Verbvalenz · Kollokation & Satzbau · Vokabeln · Orthographie
- Cada categoría tiene **su propio número de columnas** (borrador, a confirmar):

| Categoría (valor en D1)          | Columnas | Contenido                                                                 |
|----------------------------------|----------|---------------------------------------------------------------------------|
| Grammatik & Zeichensetzung       | 3        | original · corregido · Grund (etiquetas), errores en MAYÚSCULA + negrita  |
| Präpositionen und Verbvalenz     | 2        | original · corregido (la frase va como nota, ver abajo)                   |
| Kollokationen & Satzbau          | 3        | falsch · richtig · español (la frase va como nota)                        |
| Vokabeln                         | 4        | falsch · richtig · español de falsch · español de richtig                 |
| Orthographie                     | 1        | `original, corregido` con el error en MAYÚSCULA + negrita                 |

- **Vokabeln:** las 2 columnas en español se calculan con
  `=IFERROR(GOOGLETRANSLATE(<celda alemana>;"de";"es");"-")`, una para
  *falsch* y otra para *richtig* (el `"-"` cubre palabras que no traduce).
- Por defecto cada bloque muestra **lo que escribí y cómo debería ser**, con
  el fragmento erróneo resaltado en **MAYÚSCULA y negrita a la vez**.
- **Frase entera (prioridad baja):** en Kollokationen, Präpositionen y
  Vokabeln se guarda la columna `context` de la D1 como **nota de celda**
  (`setNote`) sobre la celda "falsch", para no ocupar columnas. Sirve para
  recordar en qué estaba pensando al escribirlo.

### Mapeo D1 → hoja

| Columna D1    | Va a                                              |
|---------------|---------------------------------------------------|
| `category`    | decide el bloque de columnas                      |
| `original`    | columna "falsch"/original                         |
| `corrected`   | columna "richtig"/corregido                       |
| `explanation` | "Grund" (Grammatik, Präp.) o traducción (Vokabeln) |
| `context`     | nota de celda (Kollokation, Präp., Vokabeln)      |
| `created_at`  | columna A (fecha, solo 1er error del día)         |
| `id`          | no se muestra; se guarda el último `id` importado |

### Implementación (GAS, repo `Sprachen`)

- Quién escribe la hoja: **solo GAS** (un único escritor, sin conflicto con
  mis ediciones manuales ni con el repo del bot).
- Trigger diario a las **21:30 Europe/Berlin**:
  1. Leer `mistakes_de` por la API REST de D1 (`UrlFetchApp`,
     `WHERE id > ULTIMO_ID_FEHLER ORDER BY id`).
  2. Para cada fila, elegir el bloque según `category` y hacer `appendRow`
     en la **primera fila libre de ese bloque** (los bloques crecen
     independientes, como los punteros por columna de `Telegram.gs`).
  3. Poner el fragmento erróneo en MAYÚSCULA y negrita con `RichTextValue`.
  4. Guardar el último `id` en `PropertiesService` (`ULTIMO_ID_FEHLER`).
- Token de Cloudflare con **solo lectura** sobre D1, guardado en
  `PropertiesService` (no en el repo). `.clasp.json` ya está en `.gitignore`.
- Crear la hoja desde GAS: `getSheetByName("BD_FEHLER") || insertSheet(...)`,
  más `setFrozenRows(1)` y los encabezados (función `prepararBdFehler()`,
  idempotente).

### Checklist

- [x] `prepararBdFehler()`: crear hoja, fila 1 y 2 fijas, encabezados.
- [x] `importarFehler()`: lectura de D1 + escritura por bloque.
- [x] Fecha en columna A solo en el primer error del día (`Mon 21`) y
      alineación de todos los bloques al empezar día nuevo.
- [x] Orden de bloques: Grammatik · P&V · K&S · Vokabeln · Orthographie.
- [x] Resaltado: MAYÚSCULA + negrita solo en letras; palabra entera solo negrita.
- [x] Crear token D1 de solo lectura y guardarlo en las propiedades del script.
- [x] **Importación inicial de prueba:** los 10 errores del 2026-10-21,
      con la fecha en columna A.
- [x] Notas de celda con la frase completa (baja prioridad).
- [x] `ajustarAlturasBdFehler()` disponible a mano (no se llama desde
      `importarFehler`).
- [ ] `crearTriggerFehler()`: función escrita; falta correrla a mano una
      vez (importación diaria 21:30 Europe/Berlin).
- [ ] Abrir la importación a todo el histórico (hoy `FEHLER_DESDE_INICIAL`
      limita la primera importación a 2026-10-21).

## 2. Repaso de errores por Telegram — 🔶 EN PROGRESO

**Urgencia: 3 — Dificultad: 2**

Un solo mensaje diario a las 21:30 con hasta 6 errores de la D1
(`enviarRepasoFehler()` en [Fehler.js](Fehler.js)).

- [x] Sin Orthographie; Grammatik solo si el error cambia un artículo.
- [x] Lo correcto en `<tg-spoiler>`, con la frase original como contexto.
- [x] Intervalos configurables en `FEHLER_REPASO_DIAS`, intercalando para que
      ningún intervalo quede fuera al recortar a `FEHLER_REPASO_MAX`.
- [ ] Correr `crearTriggerRepasoFehler()` una vez a mano.
- [ ] Probar `enviarRepasoFehler()` y ajustar intervalos definitivos (hoy el
      código tiene `[0, 1, 3, 7]` para pruebas).
