# Dashboard
curl -X GET "http://localhost:3000/api/streamers/USER_ID/dashboard"

# Iniciar stream
curl -X POST "http://localhost:3000/api/streams/start" \
  -H "Content-Type: application/json" \
  -d '{ "streamerId": 1, "titulo": "Mi stream" }'

# Finalizar stream
curl -X POST "http://localhost:3000/api/streams/end" \
  -H "Content-Type: application/json" \
  -d '{ "streamId": 10, "streamerId": 1 }'

# Listar paquetes
curl -X GET "http://localhost:3000/api/monetizacion/paquetes"

# Comprar monedas (paquete)
curl -X POST "http://localhost:3000/api/monetizacion/comprar" \
  -H "Content-Type: application/json" \
  -d '{ "usuarioId": 5, "paqueteId": 2 }'

# Comprar monedas (personalizado)
curl -X POST "http://localhost:3000/api/monetizacion/comprar" \
  -H "Content-Type: application/json" \
  -d '{ "usuarioId": 5, "cantidadPersonalizada": 500 }'
