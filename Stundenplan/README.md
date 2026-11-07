# Stundenplan — Telegram

## Deploy con clasp (desde VSCode)

El proyecto es **container-bound**: el script vive dentro de la hoja
`StundenPlan der Woche` (`1fULXN0xEEM5gGVhuMwWK67fJqHAkUDdwI9EvwzNFtVs`), no es
standalone. Por eso el `scriptId` no aparece en Drive ni en `clasp list-scripts`
— hay que sacarlo del editor.

El `scriptId` ya está configurado en `.clasp.json`.

Comprobar qué se subiría antes de tocar nada:

```bash
clasp status     # debe listar appsscript.json, Código.js, Polling.js, verbindung.js
```

Subir cambios:

```bash
clasp push
```

Notas:

- Los archivos locales son `.js` (y `Código.js` con tilde) porque así se llaman
  en el editor — `clasp pull` los trae con el nombre remoto. No renombrarlos a
  `.gs`: tener `verbindung.gs` y `verbindung.js` a la vez hace que clasp falle
  con *"Conflicting files found"*.
- `skipSubdirectories: true` mantiene `archive/` fuera del push; los `.md`
  tampoco se suben (no están en `scriptExtensions`).
- `clasp pull` **sobrescribe** los `.gs` locales con lo que haya en el editor.
  Si se editó en ambos lados, revisar el diff antes de pushear.
- Las credenciales (`TELEGRAM_TOKEN`, `TELEGRAM_CHAT_ID`) viven en
  *Propiedades del script*, no en el repo — `clasp push` no las toca.
- El polling se apoya en triggers configurados en el editor; `clasp push` sube
  código pero **no** crea ni modifica triggers.

## Cómo guardar una celda desde Telegram

Se le manda un mensaje de texto al bot con el formato:

```
Tag
```

```
Tag /2
```

- `Tag`: el nombre de la actividad/proyecto a escribir en la celda.
- `/2` (opcional, pegado al final de `Tag`): marca el bloque como **medio bloque** (0.25h) en vez de completo (0.5h). **Siempre es input explícito** — el código nunca lo infiere del minuto en que llegó el mensaje.
- `, xN` (opcional): rellena N bloques hacia atrás. `, vor MB` o `, -MB` (B opcional; ej. `-1B`, `-1`): el rango termina M bloques antes del actual.

El bot escribe el tag en la celda del rango `C2:I49` que corresponde al bloque de 30 minutos y al día en que llega el mensaje, y responde confirmando en qué celda quedó, el rango horario del bloque y si contó como bloque completo o medio bloque.

## `/2` decide cuánto

- Sin `/2` → bloque completo (0.5h). Con `/2` → medio bloque (0.25h). Nunca se adivina por el minuto de llegada.

## Cambio de bloque: el bot pregunta

Si el mensaje llega a menos de **`MARGEN_BLOQUE_MIN`** minutos (2, en `verbindung.js`) de terminar el bloque, o a menos de 2 min de haber empezado el nuevo, es ambiguo: el bot responde con dos botones, "Que acaba" y "Nuevo", y escribe en el que elijas. Fuera de ese margen se escribe en el bloque en curso. Se usa la hora real del mensaje, no la del polling.

## Sufijo `:MM` en la celda

Además del tag (y del `/2` si aplica), la celda queda con el sufijo `:MM` con el minuto real (sin redondear) en que llegó el mensaje — por ejemplo `Tag /2 :18` o `Tag /2 :05`.

## Comando `/calend [ayer]`

Manda por Telegram el resumen de actividades de un día: agrupa por color de celda, lista los tags distintos encontrados (no tachados) ordenados por el orden cronológico en que aparecieron ese día.

- `/calend` → resumen de hoy.
- `/calend ayer` → resumen de ayer.

Nota: las columnas C-I son fijas por día de la semana (sin fecha real escrita en la hoja) — "hoy"/"ayer" se resuelve por `getDay()`, no distingue una semana de otra.

## Otros tags a tener en cuenta

Parámetros soportados: `/2`, `end` y el relleno hacia atrás `xN`. El mensaje se parsea como `Tag[ /2][, end][, xN][, vor MB]`; cualquier otro texto en un `param` se ignora silenciosamente.

### Relleno hacia atrás: `xN` y `vor MB`

- `Tag, x4` → escribe `Tag` en 4 bloques consecutivos que terminan en el bloque calculado (el actual, o el anterior con `end`): las últimas 2:00.
- `Tag, vor 1B` → 1 bloque, el previo al calculado ("hace 1 bloque" = 30 min atrás).
- `Tag, x4, vor 1B` → 4 bloques que terminan un bloque antes del calculado, sin tocar el actual.
- `vor` es independiente de `end`: `end` sigue decidiendo el bloque de anclaje y `vor` lo desplaza hacia atrás.
- `Tag, x2.5` → decimales (múltiplos de 0.5, con punto): 3 celdas, la más antigua con `/2`: `Tag /2`, `Tag`, `Tag` (0.25h + 0.5h + 0.5h).
- Máximo 48 bloques; se recorta en 00:00 (no pasa al día anterior). Sobrescribe lo que haya en esas celdas.
- Se puede combinar: `Tag /2, end, x4, vor 1B`.

## Varios tags en una celda: `+`

`CHK/2 + Verkauf/2` cuenta cada parte por separado, con el color de SU palabra clave (tabla K/L17:40, primera fila que matchee), no solo el color de fondo de la celda (el formato condicional pinta solo un color por celda). Cada parte lleva su propio `/2`: sin `/2` = bloque completo. Aplica a `actualizarHorasPorActividad`, `HORAS_LABORALES` y `/calend`.
