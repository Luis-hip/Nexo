# Nexo · Seguridad y secretos

> Política de la Fase 2.5 (DEC-026, `07_Cambios_de_Alcance_Fase2.md`, sección 3). **En este documento solo hay nombres de variables, nunca valores.**

## 1. Qué cuenta como secreto

Lista de **nombres** (dónde vive cada uno y quién accede):

| Secreto | Local | CI | Producción | Acceso |
|---|---|---|---|---|
| `DATABASE_URL` (con contraseña; en producción, rol `nexo_app`) | `.env` (ignorado) | Valor desechable en el flujo | Panel de Render | Administradores del alojamiento |
| `DATABASE_URL_MIGRACIONES` (rol `nexo_migraciones`) | `.env` | Valor desechable | Panel de Render / secretos de la CI | Administradores |
| `SESSION_SECRET` | `.env` | Valor desechable | Panel de Render | Administradores |
| `ENCRYPTION_KEY` (64 hex) | `.env` | Valor desechable | Panel de Render | Administradores |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` | `.env` (modo real) | — | Panel de Render | Administradores |
| Credenciales de correo, claves del alojamiento, tokens de GitHub, contraseñas de roles de la BD, claves de terceros | — | GitHub → Settings → Secrets and variables → Actions | Panel del proveedor | Mínimo necesario |

## 2. Reglas

1. **Nunca** en el repositorio, commits, issues, PR, capturas, registros ni documentos.
2. `.env` está en `.gitignore`; solo se sube `.env.example` con valores **falsos**.
3. **El navegador no recibe secretos:** todo `VITE_*` es **público**. WhatsApp, correo y terceros los llama solo la API.
4. **Producción:** solo en variables de entorno del alojamiento y, para la CI, en los secretos de GitHub Actions. La CI de pruebas usa valores **desechables**.
5. **Un secreto distinto por entorno** (local, CI, producción).
6. **En la BD**, los tokens de terceros van **cifrados** (AES-256-GCM con `ENCRYPTION_KEY`); la API **nunca los devuelve** (solo `configurado: true/false`).
7. **Registros:** `pino` con redacción de `authorization`, `cookie`, `set-cookie`, `token`, `password`, `secret`, `*.token`, `*.clave`. Prohibido registrar cuerpos completos de login o de WhatsApp.
8. **Arranque seguro:** la API valida las variables con Zod y **no arranca** en producción si falta o es débil un secreto, si son los valores de `.env.example`, o si `DEV_LOGIN_ENABLED=true`.
9. **Detección:** secret scanning y push protection de GitHub, y **gitleaks** en la CI.
10. **Si algo se filtra:** no basta borrarlo; **rotarlo de inmediato** (nuevo valor, actualizarlo en el proveedor, revocar el viejo) y anotarlo en `docs/seguridad-incidentes.md` **sin escribir el valor**.
11. **Acceso mínimo:** escritura en GitHub solo los desarrolladores; accesos a Meta, alojamiento y BD de producción solo a quien los necesita; verificación en dos pasos.
12. **Peticiones entre sitios:** la API comprueba el encabezado `Origin` en las peticiones que modifican datos (debe ser `APP_URL`).

> **Repositorio público.** Cualquiera puede leer código y documentos; no es problema si se cumplen estas reglas, pero un secreto subido **se considera robado** al instante. Decidir si pasa a privado (ver DEC-001: las protecciones de ramas no se hacen cumplir en repositorios privados con el plan gratuito).

## 3. Rotación

| Secreto | Efecto y pasos |
|---|---|
| `SESSION_SECRET` | Invalida las sesiones. Generar uno nuevo (≥ 32 bytes aleatorios), cargarlo en el panel, reiniciar. |
| `ENCRYPTION_KEY` | Hay que **re-cifrar** lo guardado (tokens de WhatsApp, 2FA): descifrar con la vieja y cifrar con la nueva en un script supervisado, y recién entonces cambiar la variable. Nunca cambiarla sin re-cifrar. |
| Token de WhatsApp | Generar uno nuevo en Meta for Developers, cargarlo en la configuración del equipo (se cifra), revocar el anterior. |
| `DATABASE_URL*` | Cambiar la contraseña del rol en la BD, actualizar la variable en el panel y reiniciar. |

## 4. Ante una filtración

1. Rotar el secreto **de inmediato** (sección 3) y revocar el viejo.
2. Revisar registros y accesos del periodo expuesto.
3. Anotar fecha, qué se filtró (nombre, **no el valor**), alcance y acciones en `docs/seguridad-incidentes.md`.
4. Si estaba en el historial de Git, rotarlo igual: reescribir el historial no basta.

## 5. Lista de verificación previa a producción

- [ ] gitleaks en verde y secret scanning con push protection activados.
- [ ] Ningún secreto en el repositorio ni en el historial (informe de la Fase 2.5).
- [ ] Variables de producción cargadas **solo** en los paneles; distintas de las de local y CI.
- [ ] `NODE_ENV=production`, `DEV_LOGIN_ENABLED=false`, `APP_URL` y `API_URL` definidas.
- [ ] Ningún valor de `.env.example` en producción (la API se niega a arrancar).
- [ ] Cookie `HttpOnly; Secure; SameSite=Lax`; CORS solo al origen del front; `Origin` verificado.
- [ ] La API usa el rol `nexo_app`; las migraciones, `nexo_migraciones`; la semilla no se carga.
- [ ] Verificación en dos pasos en GitHub, alojamiento y Meta.
- [ ] Procedimientos de rotación probados al menos una vez en local.
