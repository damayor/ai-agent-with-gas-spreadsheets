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

```
Tag, end
```

```
Tag /2, end
```

- `Tag`: el nombre de la actividad/proyecto a escribir en la celda.
- `/2` (opcional, pegado al final de `Tag`): marca el bloque como **medio bloque** (0.25h) en vez de completo (0.5h). **Siempre es input explícito** — el código nunca lo infiere del minuto en que llegó el mensaje.
- `, end` (opcional, no sensible a mayúsculas): indica que la actividad se cerró — ver más abajo a qué bloque afecta.

El bot escribe el tag en la celda del rango `C2:I49` que corresponde al bloque de 30 minutos y al día en que llega el mensaje, y responde confirmando en qué celda quedó, el rango horario del bloque y si contó como bloque completo o medio bloque.

## Regla única: `/2` decide cuánto, `end` decide dónde

- **`/2` decide CUÁNTO cuenta el bloque escrito**: sin `/2` → siempre bloque completo (0.5h). Con `/2` → siempre medio bloque (0.25h). Nunca se adivina por el minuto de llegada del mensaje, en ningún caso — ni con `end` ni sin él.
- **`end` decide A QUÉ bloque se escribe** (ver siguiente sección) — no afecta cuánto cuenta.

Ejemplos:
- `Tag` a las 09:07 → bloque 09:00–09:29, completo.
- `Tag /2` a las 09:07 → bloque 09:00–09:29, medio bloque.
- `Tag /2` a las 09:26 → medio bloque (el `/2` no cambia por la hora de llegada).

## `, end`: a qué bloque se escribe

`end` sin `/2` cierra un bloque **completo** — el anterior o el actual, según cuándo llega:

1. **Dentro de los primeros `MARGEN_CIERRE_BLOQUE_ANTERIOR` minutos** (7 por defecto) del bloque actual: se interpreta como "acabo de cerrar el bloque anterior, que ocupé entero". Se escribe en el bloque **anterior**, completo. El bloque actual no se toca.
   Ejemplo: son las 09:05 y llega `Tag, end` → se escribe `Tag END :05` en el bloque 08:30–08:59, completo.
2. **Del minuto `MARGEN_CIERRE_BLOQUE_ANTERIOR` en adelante**: se interpreta como "cierro el bloque actual, que ocupé entero". Se escribe en el bloque **actual**, completo.
   Ejemplo: son las 09:18 y llega `Tag, end` → se escribe `Tag END :18` en el bloque 09:00–09:29, completo.

Si además quieres que ese cierre cuente como medio bloque (no completo), agrega `/2` explícito: `Tag /2, end`. El `/2` sigue decidiendo cuánto cuenta, sin importar el minuto ni la ventana de `end`.

Ejemplo: son las 09:05 y llega `Tag /2, end` → se escribe `Tag END /2 :05` en el bloque 08:30–08:59, como medio bloque.

## Salto de bloque por margen de cierre (mensajes sin `end`)

Si al mensaje (sin `end`) le faltan **`MARGEN_SALTO_SIGUIENTE_BLOQUE` minutos o menos** (5 por defecto) para que termine el bloque de 30 min en curso, se considera que ya no alcanza y se escribe directo en el **siguiente** bloque.

Ejemplo: son las 09:26 (bloque 09:00–09:29, faltan 4 min) → se escribe en el bloque 09:30–09:59.

Este margen es independiente del de `end` — ambos son configurables en `verbindung.gs` como `MARGEN_CIERRE_BLOQUE_ANTERIOR` y `MARGEN_SALTO_SIGUIENTE_BLOQUE`.

## Sufijo `:MM` en la celda

Además del tag (y del `/2` si aplica), la celda queda con el sufijo `:MM` con el minuto real (sin redondear) en que llegó el mensaje — por ejemplo `Tag /2 :18` o `Tag END /2 :05`.

## Comando `/calend [ayer]`

Manda por Telegram el resumen de actividades de un día: agrupa por color de celda, lista los tags distintos encontrados (no tachados) ordenados por el orden cronológico en que aparecieron ese día.

- `/calend` → resumen de hoy.
- `/calend ayer` → resumen de ayer.

Nota: las columnas C-I son fijas por día de la semana (sin fecha real escrita en la hoja) — "hoy"/"ayer" se resuelve por `getDay()`, no distingue una semana de otra.

## Otros tags a tener en cuenta

Aparte de `/2` y `end`, no hay más parámetros soportados. El mensaje se parsea como `Tag[ /2][, param]`; cualquier texto en `param` que no sea exactamente `end` (sin distinguir mayúsculas/minúsculas) se ignora silenciosamente.
