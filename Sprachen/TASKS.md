# TASKS — Migración webhook → polling (Telegram + GAS)

Contexto completo en [context.md](context.md). Decisión tomada: **Opción A**
— eliminar el webhook por completo, depender 100% de `pollTelegram()`.

## Pendientes

- [ ] 1. Extraer la lógica de manejo de updates de `doPost` (en
      [Form.gs:33-76](Form.gs#L33-L76)) a una función reusable
      `procesarUpdateTelegram(update)` que reciba el `update` de Telegram y
      haga el ruteo de comandos (`/nueva`, `/ver`, `/hoy`, `/dictionary`,
      `/intervalos`, texto libre). `doPost` debe quedar como wrapper fino
      que solo parsea `e.postData.contents` y llama a esa función.
- [ ] 2. Implementar `pollTelegram()` (archivo nuevo, ej. `Polling.gs`, o
      dentro de `Form.gs`):
  - [ ] Leer `TG_OFFSET` de `PropertiesService` (default `0`).
  - [ ] Llamar a `getUpdates?offset=${offset}&timeout=0` armando el query
        string a mano en la URL — **`UrlFetchApp.fetch` con `method: "get"`
        NO serializa `payload` como query params**, hay que concatenarlo.
  - [ ] Por cada update: llamar a `procesarUpdateTelegram(update)`,
        actualizar `offset = update.update_id + 1`.
  - [ ] Guardar el nuevo offset en `TG_OFFSET`.
  - [ ] Usar `LockService` (mismo patrón que `procesarInbox` en
        [Inboxdiccionario.gs:50-91](Inboxdiccionario.gs#L50-L91)) para
        evitar corridas simultáneas.
- [ ] 3. Instalar el trigger de `pollTelegram` (mismo patrón que
      `crearTriggerInbox`, [Inboxdiccionario.gs:157-169](Inboxdiccionario.gs#L157-L169)):
      chequear que no exista ya antes de crear uno nuevo, `everyMinutes(1)`.
- [ ] 4. Considerar fusionar `pollTelegram` y `procesarInbox` en un mismo
      trigger/función para no acumular triggers de 1 minuto innecesarios
      (cuota diaria ~90 min/día en cuenta gratuita).
- [ ] 5. Eliminar el webhook: correr `eliminarWebhook()` una vez que
      `pollTelegram` esté probado y funcionando.
- [ ] 6. Limpiar `doPost` / `registrarWebhook()`: decidir si se borran del
      todo o se dejan comentados como referencia histórica. Actualizar
      `context.md` para reflejar que el mecanismo vigente es polling, no
      webhook (evitar confusión futura).
- [ ] 7. Probar end-to-end: mandar varios mensajes seguidos por Telegram
      (comandos y texto libre) y confirmar que todos se procesan sin
      `pending_update_count` acumulándose (chequear con `verWebhookInfo()`
      — debería quedar sin uso una vez fuera el webhook, o reemplazar por
      un chequeo equivalente de estado del polling).

## Aprendizajes ya confirmados (no repetir diagnóstico)

- El 302 intermitente es un límite conocido de la plataforma GAS Web App
  respondiendo a callers no autenticados — no es bug de código propio.
  Fuente: https://habr.com/ru/articles/1066054/ (ruso).
- Revisado `Form.gs` e `Inboxdiccionario.gs` (2026-08-04): no hay choque de
  nombres de función/constante entre archivos, el resto del sistema Inbox
  → R/S funciona bien.
