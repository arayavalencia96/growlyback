# Integración Cashy y transferencias internas

## Alcance

Growly registra la cartera y sus movimientos. Cashy conserva el presupuesto mensual. La integración permite vincular una cuenta, consultar el presupuesto de Cashy y confirmar aportes asociados a ese presupuesto.

Las transferencias de Growly son registros internos entre objetivos y plataformas. No envían dinero ni activos a un banco, broker o red, no convierten monedas y no consumen ni restituyen presupuesto de Cashy.

## Configuración

Las variables están documentadas en `.env.template`. Para habilitar la integración se requieren URLs HTTPS en producción y dos secretos distintos de al menos 32 caracteres.

`CORS_ALLOWED_ORIGINS` acepta una lista separada por comas. Si no se declara:

- producción permite únicamente `https://growly-1a68d.web.app`;
- desarrollo permite además `http://localhost:5173`.

CORS solo controla navegadores. La comunicación backend a backend usa autenticación HMAC y no depende de CORS.

## Aportes desde Cashy

1. El formulario consulta el disponible cuando se abre.
2. Growly registra la solicitud con una clave idempotente.
3. Cashy reserva y confirma el impacto presupuestario.
4. Si el resultado queda pendiente, el cliente consulta el estado antes de permitir un reintento.
5. Las correcciones y anulaciones conservan revisiones y trazabilidad.

La desvinculación impide nuevas operaciones, pero no elimina aportes ya confirmados ni su efecto histórico.

## Transferencias internas

Se admiten:

- efectivo en ARS o USD;
- BTC y USDT identificados por el catálogo confiable;
- cambio de objetivo, plataforma o ambos;
- comisión en la misma unidad transferida;
- transferencias dentro de un mismo objetivo si cambia la plataforma.

No se admiten:

- origen y destino idénticos;
- acciones, CEDEAR, ETF u otros títulos;
- conversiones de moneda o activo;
- cantidades o comisiones superiores al saldo disponible;
- fechas retroactivas;
- un activo que no exista en el objetivo y plataforma de origen.

### Consistencia

- Cada solicitud lleva una clave UUID de idempotencia.
- Repetir la misma clave y contenido devuelve la operación existente.
- Reutilizar la clave con otro contenido produce conflicto.
- El débito, crédito y comisión se ejecutan dentro de una transacción MongoDB.
- El servidor coordina ambos objetivos para evitar carreras de saldo.
- El costo contable se traslada proporcionalmente; la comisión reduce el patrimonio entre objetivos.
- Un estado `pending` debe resolverse mediante consulta de estado. El reintento permanece bloqueado mientras la solicitud está procesándose.

MongoDB debe soportar transacciones. La aplicación valida esa capacidad al iniciar y falla de forma explícita si no está disponible.

## Baja de objetivos

La baja es lógica. El objetivo deja de estar disponible para nuevas operaciones, pero sus referencias históricas se conservan. Si una referencia no puede resolverse, la API informa `Objetivo no disponible` en vez de impedir la baja.

## Endpoints principales

Todos usan el prefijo `/api/v1`.

- `GET /assets/catalog`: catálogo de activos y política de transferencia.
- `GET /transfers/form-context`: orígenes, destinos y saldos habilitados.
- `POST /transfers/preview`: validación sin registrar.
- `POST /transfers`: registra una solicitud idempotente.
- `GET /transfers/by-key/:idempotencyKey`: recupera el resultado conocido.
- `POST /transfers/:id/retry`: reintenta únicamente una operación pendiente no procesada.
- `GET /transfers`: historial del usuario.
- `GET /integration/allocation`: presupuesto mensual de Cashy.
- `POST /integration/contribution/confirm`: confirma un aporte desde Cashy.

## Verificación

```bash
npm run lint:check
npm run test:unit
npm run build
```

Para una prueba manual completa deben existir dos objetivos con efectivo o BTC/USDT en plataformas distintas. Verificar éxito, saldo insuficiente, origen inexistente, destino idéntico, doble clic y recuperación de una solicitud pendiente.

### Diagnóstico en producción

Al iniciar, `integration_config_loaded` informa URLs, longitudes y huellas
truncadas de los secretos sin exponerlos. La huella `outboundFingerprint` de
Growly debe coincidir con `inboundFingerprint` de Cashy.

Cada llamada al peer emite:

- `integration_peer_request_started`: destino y timeout efectivos;
- `integration_peer_request_completed`: estado HTTP y duración;
- `integration_peer_request_rejected`: respuesta HTTP rechazada;
- `integration_peer_request_failed`: error de DNS, conexión, TLS o timeout;
- `integration_request_failed`: error que finalmente recibe el frontend.

Los eventos comparten `requestId` cuando pertenecen a la misma llamada saliente.
