# WoerterDesTages — Vocabulario DE/EN con Telegram + Google Apps Script

Sistema personal de estudio de vocabulario alemán/inglés. Google Sheets es la
base de datos, Telegram es la interfaz de chat, y Google Apps Script (GAS) es
el backend. Incluye repaso espaciado (spaced repetition) vía recordatorios
automáticos por Telegram.

## Archivos del proyecto

Todos los `.gs` viven en **un solo proyecto de Apps Script** (scope global
compartido, sin imports — un choque de nombre de función/constante entre
archivos rompe la compilación de TODO el proyecto, no solo del archivo
afectado).

- **`Telegram.gs`** — todo lo relacionado a Telegram: polling
  (`pollTelegram`, `tick`), ruteo de comandos (`procesarUpdateTelegram`),
  comandos `/intervalos`, `/modo`, `/nueva`, `/ver`, `/hoy`, reacciones
  (👍/👎/🤔 sobre mensajes de repaso) y sus efectos en la hoja. Entrada de
  texto libre con gestión de filas por columna, punteros independientes por
  columna y día, con validación de huecos y date range headings.
- **`Repaso.gs`** — repaso espaciado: arma y envía los recordatorios diarios
  (`enviarRecordatorioHoy`), intervalos configurables en días y meses,
  mapeo mensaje→celda para reacciones de Telegram.
- **`Codigo.gs`** — utilidades puntuales sobre la hoja (ej.
  `copiarCeldasUltimoMes`, exportar celdas en negrilla del mes a una hoja
  aparte con traducción automática).
- **`TASKS.md`** / **`TASKS-sept.md`** — features pedidas, con puntaje de
  urgencia/dificultad para priorizar el orden de implementación.

## Mecanismo de entrada: polling (no webhook)

El bot usa **polling**, no `doPost`/webhook. `tick()` es el handler de un
trigger de tiempo cada 1 minuto: llama a `pollTelegram()` (trae updates
nuevos de Telegram vía `getUpdates` con offset guardado en
`PropertiesService` como `TG_OFFSET`) y rutea cada uno con
`procesarUpdateTelegram(update)`. `crearTriggerTick()` instala el trigger —
correr una sola vez a mano, revisa que no exista ya antes de duplicar.

Se abandonó el webhook porque Apps Script responde de forma intermitente
con un `302 Found` a callers no autenticados (como Telegram) en vez de un
`200` directo — Telegram no sigue redirects, así que los mensajes quedaban
sin procesar después del primero. Es una limitación de la plataforma, no
del código.

## Repaso espaciado

`enviarRecordatorioHoy()` corre en cada uno de los `HORAS_TRIGGER_REPASO`
(7 disparos por día). Cada disparo atiende una posición de una lista
combinada de "activadores del día", en este orden fijo:

1. **Meses** (`INTERVALOS_MESES`, default `[8, 7, 6, 1]`) — busca palabras
   anotadas el *mismo día calendario* hace N meses.
2. **Días** (`INTERVALOS_DIAS`, default `[15, 7, 5]`) — busca palabras
   anotadas hace exactamente N días (comportamiento clásico de repaso
   espaciado por offset).

Ambos arrays son configurables en runtime vía Telegram, sin tocar código:

```
/intervalos                     → muestra los arrays actuales
/intervalos meses 8 7 6 1       → redefine INTERVALOS_MESES
/intervalos dias 15 7 5         → redefine INTERVALOS_DIAS
/intervalos meses reset         → vuelve al default
/intervalos dias reset          → vuelve al default
```

El total de activadores (meses + días) debe calzar con la cantidad de
horas en `HORAS_TRIGGER_REPASO` — si cambiás la cantidad de intervalos,
ajustá también esa constante y los triggers instalados
(`crearTriggersRepaso`).

Cada recordatorio manda varios mensajes de Telegram por separado (1 header
+ 1 por palabra) para que los `<tg-spoiler>` (traducción oculta) se revelen
independientes.

**Si cambiaste los intervalos a mitad del día**, el contador diario de
disparos (`disparos_YYYY-MM-DD` en `PropertiesService`) puede quedar
desalineado con la nueva lista combinada. Corré `resetearContadorHoy()`
una vez desde el editor de Apps Script para que el próximo disparo
retome desde la posición 0.

## Gestión de entrada de texto libre (palabra suelta)

El comando de texto libre (sin `/`) guarda palabras en la columna activa de
la hoja del modo actual. Cada columna (B/E/I/L) mantiene su propio puntero
de última fila (`PUNTERO_COL_<hoja>_<columna>`) y fecha de último acceso
(`FECHA_ULTIMA_<hoja>_<columna>`):

- **Por día**: cuando cambia el día (offset configurable a las 2 AM), se
  reinicia el puntero de esa columna y se anota la fecha en columna A
  (formato `Wed 11`).
- **Validación de puntero**: cada vez que se guarda, se revisa hacia atrás
  hasta `CONFIG_VALIDAR_PUNTERO_ATRAS` filas (default 10) para detectar
  huecos y ajustarse al verdadero último dato.
- **Configurables** en `Telegram.gs`:
  - `CONFIG_OFFSET_DIA_HORAS` — hora en que comienza el "día" (default 2)
  - `CONFIG_VALIDAR_PUNTERO_ATRAS` — filas máximas a revisar hacia atrás (default 10)

## Constantes / recursos

- Spreadsheet ID: `1yYJzqZmJOvM6lMMXLdf_ZWMEaa0_vvDWDeu87T2sm38`
- Tab principal: `WoerterDesTages`
- Zona horaria: `Europe/Berlin`
- Columnas de `WoerterDesTages`: A=date range heading, B=fecha, C/D/E=palabras (Wort),
  F=idioma (`en` o vacío=alemán), G/H/I=traducciones español, K/L/M=oraciones de
  contexto (Satz)
- El token de Telegram vive en `PropertiesService.getScriptProperties()`
  como `TELEGRAM_TOKEN` (nunca hardcodeado en el código).

## Aprendizajes clave (para no repetir errores)

- Apps Script comparte scope global entre todos los `.gs` del proyecto —
  nombres de función/constante duplicados rompen la compilación entera.
- El deployment `/exec` necesita "Ejecutar como: Yo" + "Quién tiene
  acceso: Cualquier usuario" — pero incluso bien configurado, sufre el
  302 intermitente si se usa webhook. Por eso el mecanismo vigente es
  polling.
- `getWebhookInfo` (`https://api.telegram.org/bot<token>/getWebhookInfo`)
  sirve para diagnosticar si quedó algún webhook registrado por error.
- Parseo de fechas: rama `instanceof Date` primero, después
  `DD/MM/YYYY` string — Sheets auto-convierte algunas fechas.
- Construir un índice fecha→fila al inicio de operaciones pesadas sobre
  la hoja evita escaneos repetidos de `getDataRange()`.

## Preferencias de David

- Prefiere funciones compactas, parametrizadas, de responsabilidad única.
- Al regenerar código, preservar credenciales y constantes exactas — sin
  placeholders.
- Comunicación informal, español colombiano (no argentino).
