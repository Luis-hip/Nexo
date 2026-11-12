## Qué cambia

<!-- Resumen breve. Flujo: Dev_<Nombre> → dev → main → produccion (ramas cortas → Dev_<Nombre>). -->

## Cómo probarlo

<!-- Pasos concretos: comandos, rutas, usuario de la semilla con el que entrar (dev login). -->

## Capturas

<!-- Obligatorio si toca la interfaz (claro/oscuro y móvil de 360 px). -->

## Lista de comprobación

- [ ] La CI está en verde.
- [ ] Va en el sentido del flujo (`Dev_<Nombre>` → `dev` → `main` → `produccion`) y la rama de origen está al día con la de destino.
- [ ] Si es una promoción (`dev` → `main` o `main` → `produccion`), se fusiona con «Create a merge commit».
- [ ] Commits en español con formato `tipo(modulo): descripción`.
- [ ] Si toca la BD: es una migración **nueva** y regeneré los tipos (`pnpm db:tipos`).
- [ ] Si tomé una decisión no definida en `docs/01`/`docs/02`: la anoté en `docs/decisiones.md`.
- [ ] Sin secretos ni `.env` en el cambio.
