# Cambios recientes (priscila)

## Como espectador, notificación al subir de nivel
- Endpoints que devuelven `leveled_up` y `nivel_actual` tras sumar puntos:
  - `POST /api/streams/:streamId/mensajes`
  - `POST /api/streams/:streamId/regalos/:regaloId/enviar`
- Uso: cuando la respuesta trae `leveled_up: true`, mostrar la animación/aviso de level-up.

## Como espectador, ver nivel y puntos en mi perfil
- Endpoint: `GET /api/viewers/:viewerId/perfil`
- Devuelve: `viewerId, usuarioId, nombre, avatar_url, nivel_actual, puntos, horas_vistas, saldo_coins`.
- Ejemplo: `curl http://localhost:3000/api/viewers/1/perfil`

## Como streamer, barra de horas hacia el siguiente nivel
- Endpoint: `GET /api/streamers/:streamerId/progreso-nivel`
- Devuelve horas totales y cuánto falta para el próximo nivel (`falta_horas`, `progreso_porcentaje`), o marca `es_nivel_maximo` si ya no hay siguiente nivel.
- Ejemplo: `curl http://localhost:3000/api/streamers/1/progreso-nivel`

## Como streamer, overlay animado de regalos
- Endpoint: `GET /api/streams/:streamId/eventos/regalos?limit=20`
- Devuelve envíos recientes con datos del regalo y del viewer (`viewer_nombre`, `avatar_url`) para disparar animaciones.
- Ejemplo: `curl http://localhost:3000/api/streams/1/eventos/regalos?limit=10`
