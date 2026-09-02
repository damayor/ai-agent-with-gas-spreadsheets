# Stundenplan — Telegram

## Cómo guardar una celda desde Telegram

Se le manda un mensaje de texto al bot con el formato:

```
Tag
```

o, para cerrar una actividad antes de tiempo:

```
Tag, end
```

- `Tag`: el nombre de la actividad/proyecto a escribir en la celda.
- `, end` (opcional, no sensible a mayúsculas): marca cierre temprano de la actividad.

El bot escribe el tag en la celda del rango `C2:I49` que corresponde al bloque de 30 minutos y al día en que llega el mensaje, y responde confirmando en qué celda quedó, el rango horario del bloque y si contó como bloque completo o medio bloque.

## ¿Cuándo cuenta el bloque completo (0.5h)?

Cuando el mensaje llega dentro de la **primera mitad** del bloque de 30 min (minuto dentro del bloque `< 15`) y no se usó `end`.

Ejemplo: bloque 09:00–09:29, mensaje llega a las 09:07 → bloque completo.

## ¿Cuándo cuenta medio bloque (`/2`, 0.25h)?

Dos casos:

1. **Inicio tardío**: el mensaje llega en la **segunda mitad** del bloque (minuto dentro del bloque `>= 15`), y no hubo salto de bloque por margen de cierre (ver abajo).
   Ejemplo: bloque 09:00–09:29, mensaje llega a las 09:18 → se asume que solo se alcanzó a trabajar la segunda mitad → `/2`.
2. **Cierre temprano (`, end`), a partir del minuto 7 del bloque**: si el mensaje trae `end` y llegó cuando ya pasaron 7 minutos o más dentro del bloque actual, el bloque actual/entrante cuenta como `/2`, sin importar el minuto real en que llegó — a diferencia de la regla de arriba, que es solo para inicios tardíos.

## Cierre del bloque anterior (`, end` en los primeros 7 min del bloque)

Si el mensaje trae `end` y llega dentro de los **primeros 7 minutos** del bloque actual (minuto dentro del bloque `< 7`), se interpreta al revés que el caso anterior: no se refiere al bloque que está por empezar, sino que avisa que se acaba de terminar una actividad que ocupó **todo** el bloque anterior.

En ese caso:
- Se escribe en el bloque **anterior** (no en el actual).
- Cuenta como **bloque completo** (0.5h), no `/2`.
- El bloque actual queda sin tocar.

Ejemplo: son las 09:05 y llega `Tag, end` → se escribe `Tag END :05` en el bloque 08:30–08:59 como bloque completo. El bloque 09:00–09:29 no se toca.

Este margen (7 min) y el del salto al bloque siguiente (5 min, ver abajo) son valores independientes, configurables en `verbindung.gs` como `MARGEN_CIERRE_BLOQUE_ANTERIOR` y `MARGEN_SALTO_SIGUIENTE_BLOQUE`.

## Salto de bloque por margen de cierre

Si al mensaje le faltan **5 minutos o menos** para que termine el bloque de 30 min en curso, se considera que ya no alcanza a contar como ese bloque y se salta directo al **siguiente** bloque. En ese caso nunca se marca como `/2` (salvo que además sea un `end`).

Ejemplo: son las 09:26 (bloque 09:00–09:29, faltan 4 min) → se escribe directamente en el bloque 09:30–09:59, como bloque completo.

## Sufijo `:MM` en la celda

Además del tag (y del `/2` si aplica), la celda queda con el sufijo `:MM` con el minuto real (sin redondear) en que llegó el mensaje — por ejemplo `Tag /2 :18` o `Tag END /2 :05`.

## Otros tags a tener en cuenta

Por ahora **no hay más parámetros soportados** aparte de `end`. El mensaje se parsea como `Tag[, param]`; cualquier texto en `param` que no sea exactamente `end` (sin distinguir mayúsculas/minúsculas) se ignora silenciosamente y se trata como si no se hubiera mandado nada extra.

## Pendiente

- Poder marcar explícitamente que un bloque solo dedicó media hora (sin depender de en qué minuto llegó el mensaje).
