# Stundenplan — conteo de horas

Calendario semanal en Google Sheets que cuenta cuántas horas dedicas a cada actividad según el **color** de cada bloque de 30 minutos.

## Cómo funciona

- **Calendario:** `C2:I49`. Cada columna es un día (Lun–Dom) y cada fila un bloque de 30 min (fila 2 = 00:00).
- **Tabla de actividades:** filas 17 a 40.
  - Columna **K**: palabras clave de la actividad, separadas por coma (ej. `zzz,siesta`).
  - Columna **L**: el color de la actividad (pinta el fondo de la celda).
  - Columna **M**: copia del color de L. La llena el script.
  - Columna **N**: horas contadas. La llena el script.
- **Proyectos (opcional):** filas 22 a 32. Sus colores en la columna L cuentan como horas laborales.
- **Horas laborales por día:** `C52:I52`.

Escribes una palabra clave en una celda del calendario (por ejemplo `siesta`) y la celda se pinta sola con el color de esa actividad.

Reglas de conteo:
- Cada bloque cuenta **0,5 h**.
- Si el texto de la celda contiene `/2`, cuenta **0,25 h**.
- Las celdas con texto **tachado** no cuentan.

## Menú «📅 Calendario Semanal»

Aparece al abrir la hoja (si no aparece, recarga la página).

| Botón | Qué hace |
|---|---|
| **Sincronizar tags con colores** | Lee las palabras clave (K) y los colores (L) de la tabla y crea las reglas que pintan el calendario. Copia los colores a M. Úsalo cada vez que cambies una palabra clave o un color. |
| **Actualizar contar horas por color** | Cuenta los bloques del calendario por color y escribe las horas de cada actividad en la columna N. |
| **Actualizar total diario de horas** | Hace lo de arriba y además recalcula las horas laborales de cada día en `C52:I52`. |

## Casillas de verificación (útiles desde el móvil)

El menú no existe en la app del móvil. Estas casillas lo reemplazan: se marcan, hacen su trabajo y se desmarcan solas.

| Celda | Qué hace |
|---|---|
| **N13** | Igual que «Actualizar total de horas». |
| **N5** | Pone fondo blanco a las celdas vacías del calendario. |

## Primera vez

1. Abre la hoja y recarga la página para ver el menú.
2. La primera ejecución pide **autorizar** el script: acepta los permisos.
3. Rellena la tabla de actividades (K y L) y pulsa **Sincronizar tags con colores**.
4. Pulsa **Actualizar total de horas** para ver los resultados.

## Desarrollo (clasp + TypeScript)

El código está en `src/TareasManagement.ts`. Se compila con `tsc` a `dist/` y se sube con clasp.

```bash
npm install      # solo la primera vez
npm run push     # compila y hace clasp push
```

El `scriptId` va en `.clasp.json` junto con `"rootDir": "dist"`.
