# GAS — proyectos personales de Google Apps Script

Automatizaciones propias hechas con Google Apps Script + Google Sheets + Telegram como
interfaz de chat. 

## Contenido

- **[Sprachen/](Sprachen/README.md)** — estudio de vocabulario alemán/inglés
  con repaso espaciado y quiz semanal, vía Telegram.
- **[Stundenplan/](Stundenplan/README.md)** — horario/agenda personal
  gestionado desde Telegram.

Cada carpeta es un proyecto de Apps Script independiente (su propio
`scriptId`, su propio bot de Telegram, su propio Spreadsheet). Ver el README
de cada uno para el detalle de arquitectura y comandos.

## Credenciales

Ningún token va hardcodeado en el código: viven en `PropertiesService.
getScriptProperties()` de cada proyecto de Apps Script (`TELEGRAM_TOKEN`,
`TELEGRAM_CHAT_ID`, IDs de spreadsheet), fuera del repo. Si alguna vez ves un
token en texto plano en un commit, hay que rotarlo en @BotFather de
inmediato y tratarlo como comprometido, sin importar si el repo es privado.

## Estado

Uso personal, en desarrollo continuo. `TASKS*.md` en cada carpeta lleva el
detalle de qué está implementado y qué falta.
