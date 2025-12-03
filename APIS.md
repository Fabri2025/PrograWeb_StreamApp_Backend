## API de regalos, saldo, chat y niveles (espectador)

### Requerimientos cubiertos
1) Como espectador, puedo ver la lista de regalos con nombre, costo y puntos para elegir que enviar.  
2) Como espectador, puedo ver mi saldo de monedas en el encabezado/menu para decidir compras y envios.  
3) Como espectador, puedo enviar mensajes y sumar 1 punto por participacion.  
4) Como espectador, puedo comprar y enviar un regalo que descuente monedas y sume mis puntos para apoyar al streamer y progresar.  
5) Como espectador, puedo recibir una notificacion cuando subo de nivel para enterarme y celebrar (se almacena en chat como mensaje de sistema y se expone por endpoint).
6) Como streamer, puedo ver una barra con las horas que faltan para mi siguiente nivel para planificar transmisiones.
7) Como streamer, puedo ver un overlay animado cuando recibo un regalo para reconocer al espectador y dinamizar el directo.
8) Como espectador, puedo ver mi nivel y puntos actuales en mi perfil para seguir mi progreso (incluye avance hacia el siguiente nivel).

### Entornos y variables
- `DATABASE_URL` (Render Postgres, SSL required). Ejemplo: `postgresql://.../pw_db_gl86?sslmode=require`
- `PORT` (por defecto 3000)

### Endpoints

#### 1) Lista de regalos por streamer
- `GET /api/streamers/:streamerId/regalos`
- Devuelve regalos activos del streamer o globales (`streamer_id IS NULL`), ordenados por `costo_coins`.
- Path params: `streamerId` (number).
- Respuestas:
  - 200 OK: arreglo de `{ id, nombre, costo_usd, costo_coins, puntos_otorgados }`
  - 400 si `streamerId` no es numerico.

#### 2) Lista global de regalos
- `GET /api/regalos`
- Devuelve todos los regalos activos (con o sin streamer) ordenados por `streamer_id` y `costo_coins`.
- Respuestas: 200 OK con arreglo de `{ id, streamer_id, nombre, costo_usd, costo_coins, puntos_otorgados }`.

#### 3) Saldo de monedas del espectador
- `GET /api/viewers/:viewerId/saldo`
- Une `perfiles_viewer -> usuarios -> billeteras` y devuelve saldo en coins.
- Respuestas:
  - 200 OK: `{ "viewerId": 1, "usuarioId": 2, "saldo_coins": 300 }`
  - 400 si `viewerId` no es numerico; 404 si no existe.

#### 4) Perfil/progreso del espectador (nivel y puntos)
- `GET /api/viewers/:viewerId/progreso`
- Devuelve nivel_actual, puntos, horas_vistas, saldo_coins y el avance al siguiente nivel (si existe en `reglas_nivel_viewer`).
- Respuesta 200 OK:
  ```json
  {
    "viewerId": 1,
    "usuarioId": 2,
    "nivel_actual": 4,
    "puntos": 850,
    "horas_vistas": 55.5,
    "saldo_coins": 300,
    "siguiente_nivel": 5,
    "puntos_objetivo": 1000,
    "puntos_restantes": 150,
    "avance_porcentaje": 85
  }
  ```
- Si no hay siguiente nivel configurado: `siguiente_nivel=null`, `puntos_objetivo=null`, `puntos_restantes=null`, `avance_porcentaje=100`.
- Errores: 400 si `viewerId` no es numerico; 404 si no existe.

#### 5) Enviar mensaje y sumar puntos de participacion
- `POST /api/streams/:streamId/mensajes`
- Body JSON: `{ "viewerId": 1, "mensaje": "Hola!" }`
- Flujo:
  - Valida parametros y existencia de viewer/stream.
  - Transaccion: suma +1 punto en `perfiles_viewer`, revisa `reglas_nivel_viewer`; si alcanza un nuevo nivel, actualiza `nivel_actual`, otorga `recompensa_coins` en billetera (movimiento `recarga` referencia `recompensa_nivel`) e inserta mensaje de sistema en `mensajes_chat` (`tipo='sistema'`).
  - Inserta mensaje de chat (`tipo='texto'`) con el nivel mas reciente.
- Respuestas:
  - 201 Created:
    ```json
    {
      "mensajeId": 5,
      "streamId": 1,
      "viewerId": 1,
      "puntos_totales": 851,
      "nivel_actual": 5,
      "subio_nivel": true,
      "recompensa_coins": 100,
      "saldo_coins": 150,
      "notificacion_id": 12,
      "creado_en": "2024-06-10T15:00:00.000Z"
    }
    ```
  - Si no sube de nivel: `subio_nivel=false`, `recompensa_coins=0`, `notificacion_id=null`.
  - 400/404/500 en validaciones o errores.

#### 6) Comprar/enviar regalo (descontar coins y sumar puntos)
- `POST /api/streams/:streamId/regalos/:regaloId/enviar`
- Body JSON: `{ "viewerId": 1, "cantidad": 1, "mensaje": "Para ti" }`
- Flujo:
  - Valida parametros y existencia de viewer (incluye billetera), stream y regalo activo; valida pertenencia del regalo al streamer si aplica.
  - Transaccion: alinea secuencias, descuenta coins en billetera, registra envio en `envios_regalo`, registra movimiento en `movimientos_billetera` (`tipo='regalo'`), suma puntos en `perfiles_viewer`, revisa reglas de nivel y genera recompensa/mensaje de sistema si aplica, inserta mensaje de chat `tipo='regalo'` con el nivel mas reciente.
- Respuestas:
  - 201 Created:
    ```json
    {
      "envioId": 10,
      "streamId": 1,
      "streamerId": 1,
      "viewerId": 1,
      "coins_gastados": 200,
      "puntos_generados": 20,
      "puntos_totales": 870,
      "saldo_restante": 150,
      "nivel_actual": 5,
      "subio_nivel": true,
      "recompensa_coins": 100,
      "notificacion_id": 13,
      "creado_en": "2024-06-10T15:00:00.000Z"
    }
    ```
  - 400 si path/body invalido, saldo insuficiente o regalo no pertenece al streamer; 404 si viewer/stream/regalo no existen; 500 en error interno.

#### 7) Notificaciones de subida de nivel
- `GET /api/viewers/:viewerId/notificaciones-nivel`
- Devuelve las notificaciones de nivel almacenadas en `mensajes_chat` (`tipo='sistema'`) para ese viewer.
- Respuesta 200 OK:
  ```json
  [
    { "notificacionId": 13, "streamId": 1, "streamTitulo": "Ma\u00f1ana de Rust", "mensaje": "Felicidades, subiste al nivel 5", "nivel": 5, "creado_en": "2024-06-10T15:00:00.000Z" }
  ]
  ```
  - 400 si `viewerId` no es numerico; 404 si no existe.

#### 8) Progreso de nivel del streamer (horas faltantes)
- `GET /api/streamers/:streamerId/progreso-nivel`
- Devuelve cuanto le falta al streamer (horas) para alcanzar el siguiente nivel segun `reglas_nivel_streamer`.
- Respuesta 200 OK cuando hay siguiente nivel:
  ```json
  {
    "streamerId": 1,
    "nivel_actual": 3,
    "horas_totales": 120.5,
    "siguiente_nivel": 4,
    "horas_objetivo": 160,
    "horas_restantes": 39.5,
    "avance_porcentaje": 75.31
  }
  ```
- Si ya esta en el maximo nivel configurado: `siguiente_nivel=null`, `horas_objetivo=null`, `horas_restantes=0`, `avance_porcentaje=100`.
- Errores: 400 si `streamerId` no es numerico, 404 si no existe.

#### 9) Overlay de regalos para streamer
- `GET /api/streamers/:streamerId/overlays/regalos?streamId={optional}&limit=20`
- Devuelve envios de regalo recientes para mostrarlos en overlay (incluye datos de espectador y regalo).
- Respuesta 200 OK:
  ```json
  [
    {
      "envioId": 10,
      "streamId": 1,
      "streamTitulo": "Ma\u00f1ana de Rust",
      "streamerId": 1,
      "viewerId": 1,
      "viewerUsuarioId": 2,
      "viewerNombre": "pri",
      "viewerAvatarUrl": "https://...",
      "giftId": 1,
      "giftNombre": "Cafecito",
      "cantidad": 1,
      "coins_gastados": 200,
      "puntos_generados": 20,
      "mensaje": "Para ti",
      "creado_en": "2024-06-10T15:00:00.000Z"
    }
  ]
  ```
- Query params: `streamId` (opcional para filtrar solo el stream actual), `limit` entre 1 y 100 (por defecto 20).
- Errores: 400 si ids/limit son invalidos, 404 si el streamer no existe.

### Comandos de prueba (curl)
- Regalos por streamer:  
  `curl http://localhost:3000/api/streamers/1/regalos`
- Regalos globales:  
  `curl http://localhost:3000/api/regalos`
- Saldo de espectador:  
  `curl http://localhost:3000/api/viewers/1/saldo`
- Progreso/nivel del espectador:  
  `curl http://localhost:3000/api/viewers/1/progreso`
- Enviar mensaje (+notificacion de nivel si aplica):  
  `curl -X POST http://localhost:3000/api/streams/1/mensajes -H "Content-Type: application/json" -d "{\"viewerId\":1,\"mensaje\":\"Hola chat\"}"`
- Enviar regalo (+notificacion de nivel si aplica):  
  `curl -X POST http://localhost:3000/api/streams/1/regalos/1/enviar -H "Content-Type: application/json" -d "{\"viewerId\":1,\"cantidad\":1,\"mensaje\":\"Para ti\"}"`
- Listar notificaciones de nivel:  
  `curl http://localhost:3000/api/viewers/1/notificaciones-nivel`
- Progreso de nivel de streamer:  
  `curl http://localhost:3000/api/streamers/1/progreso-nivel`
- Overlay de regalos del streamer (ultimos):  
  `curl "http://localhost:3000/api/streamers/1/overlays/regalos?limit=10"`
  - Solo del stream actual: `curl "http://localhost:3000/api/streamers/1/overlays/regalos?streamId=1&limit=10"`

### Notas de nivel
- Se usa `reglas_nivel_viewer` (solo registros `activo=true`). Se toma el nivel mas alto cuyo `puntos_requeridos <= puntos_totales` y que sea mayor al `nivel_actual`.
- Al subir de nivel se actualiza `perfiles_viewer.nivel_actual`, se acredita `recompensa_coins` en la billetera del viewer y se registra un mensaje de sistema en `mensajes_chat` para que el frontend pueda anunciarlo.
- Los mensajes de sistema usan el `stream_id` donde se genero la accion (mensaje/regalo) para que aparezcan en ese chat.

### Criterios de aceptacion rapidos
- Endpoints GET devuelven 200 con datos validos; paths invalidos 400; viewer inexistente 404.
- En el POST de mensaje, cada llamado valido incrementa `puntos` en `perfiles_viewer` en 1, genera mensaje de chat y, si corresponde, actualiza nivel y notificacion.
- En el POST de regalo se descuentan coins, se generan puntos, se actualiza nivel/notificacion si corresponde y se devuelve el saldo final despues de recompensa.
- Campos presentes:
  - Regalos: `id, nombre, costo_usd, costo_coins, puntos_otorgados` (y `streamer_id` en la global).
  - Saldo: `viewerId, usuarioId, saldo_coins`.
  - Perfil/progreso viewer: `viewerId, usuarioId, nivel_actual, puntos, horas_vistas, saldo_coins, siguiente_nivel, puntos_objetivo, puntos_restantes, avance_porcentaje`.
  - Mensaje: `mensajeId, streamId, viewerId, puntos_totales, nivel_actual, subio_nivel, recompensa_coins, saldo_coins, notificacion_id, creado_en`.
  - Envio regalo: `envioId, streamId, streamerId, viewerId, coins_gastados, puntos_generados, puntos_totales, saldo_restante, nivel_actual, subio_nivel, recompensa_coins, notificacion_id, creado_en`.
  - Notificaciones de nivel: `notificacionId, streamId, streamTitulo, mensaje, nivel, creado_en`.
  - Progreso streamer: `streamerId, nivel_actual, horas_totales, siguiente_nivel, horas_objetivo, horas_restantes, avance_porcentaje`.
  - Overlay regalos: `envioId, streamId, streamTitulo, streamerId, viewerId, viewerUsuarioId, viewerNombre, viewerAvatarUrl, giftId, giftNombre, cantidad, coins_gastados, puntos_generados, mensaje, creado_en`.
