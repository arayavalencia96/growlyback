# Growly API

Backend REST de Growly, una aplicación para organizar objetivos financieros y registrar el efectivo, los aportes, las extracciones y las operaciones de inversión asociadas a cada objetivo.

La API permite comenzar un seguimiento desde cero o registrar una cartera existente. Los resúmenes se calculan a partir de los movimientos de caja y las compras y ventas cargadas por el usuario.

## Tecnologías

- Node.js 24, npm 11, NestJS 11 y TypeScript
- MongoDB Atlas, Mongoose y MongoDB Driver
- JWT, Passport, access token y refresh token
- Brevo y Handlebars para correos transaccionales
- Swagger/OpenAPI
- Jest, ESLint, Prettier y Husky
- Docker

## Requisitos

- Node.js `24.x`
- npm `11.x`
- Una base de datos en MongoDB Atlas
- Una cuenta de Brevo y un remitente verificado
- Docker Desktop, solamente para ejecutar con contenedores

```bash
node --version
npm --version
```

## Configuración inicial

### 1. Instalar dependencias

Desde la raíz de `growlyback`:

```bash
npm ci
```

El script `prepare` instala los hooks de Husky.

### 2. Crear el archivo de entorno

PowerShell:

```powershell
Copy-Item .env.template .env
```

Bash:

```bash
cp .env.template .env
```

Completa `.env`:

```env
PORT=3001
CORS_ALLOWED_ORIGINS=http://localhost:5173,https://growly-1a68d.web.app

MONGO_URI=mongodb+srv://USUARIO:PASSWORD@CLUSTER.mongodb.net/growly?retryWrites=true&w=majority&appName=CLUSTER

JWT_ACCESS_SECRET=SECRETO_ALEATORIO_PARA_ACCESS_TOKEN
JWT_REFRESH_SECRET=SECRETO_ALEATORIO_DISTINTO_PARA_REFRESH_TOKEN

BREVO_API_KEY=TU_API_KEY
BREVO_SENDER_EMAIL=correo-verificado@dominio.com
BREVO_SENDER_NAME=Growly
MAIL_SUPPORT=soporte@dominio.com
MAIL_FROM=Growly <correo-verificado@dominio.com>

FRONTEND_PASSWORD_RESET_URL=http://localhost:5173/reset-password
FRONTEND_BLOCKED_PASSWORD_CHANGE_URL=http://localhost:5173/change-password
```

Genera cada secreto JWT con:

```bash
node -e "console.log(require('node:crypto').randomBytes(64).toString('hex'))"
```

Ejecuta el comando dos veces. Ambos secretos deben ser diferentes.

Consideraciones:

- No subas `.env` al repositorio.
- Codifica para URL los caracteres especiales de la contraseña de MongoDB.
- Especifica `/growly` en la URI para no utilizar accidentalmente la base predeterminada `test`.
- Las URLs del frontend son rutas de la SPA, no endpoints del backend.

### 3. Preparar MongoDB Atlas

1. Crea un cluster.
2. En `Database Access`, crea un usuario de base de datos.
3. En `Network Access`, autoriza tu IP pública.
4. Copia el connection string.
5. Agrega la base `/growly` y asigna la URI completa a `MONGO_URI`.

En un despliegue también debes autorizar las IP de salida del proveedor donde se ejecute la API.

### 4. Preparar Brevo

1. Crea una API key.
2. Verifica el correo o dominio remitente.
3. Configura `BREVO_API_KEY`, `BREVO_SENDER_EMAIL` y `BREVO_SENDER_NAME`.
4. Configura `MAIL_SUPPORT` con el correo visible en las plantillas.

Sin Brevo, los flujos que envían códigos o enlaces de recuperación no podrán completarse.

## Ejecutar localmente

```bash
npm run start:dev
```

La API estará disponible en:

```text
http://localhost:3001/api/v1
```

- Swagger: `http://localhost:3001/api/v1/docs`
- Health check: `http://localhost:3001/api/v1/health`

El health check valida la API y la conexión con MongoDB.

## Ejecutar con Docker

```bash
docker build -t growlyback .
docker run --name growlyback --env-file .env -p 3001:3001 growlyback
```

Para detener y eliminar el contenedor:

```bash
docker stop growlyback
docker rm growlyback
```

El Dockerfile usa una compilación multi-stage y ejecuta las dependencias de producción con un usuario sin privilegios.

## Scripts

| Comando | Descripción |
| --- | --- |
| `npm run start:dev` | Inicia NestJS en modo watch. |
| `npm run build` | Compila en `dist`. |
| `npm run start:prod` | Ejecuta la compilación de producción. |
| `npm run lint:check` | Ejecuta ESLint sin modificar archivos. |
| `npm run lint` | Ejecuta ESLint aplicando correcciones. |
| `npm run format` | Formatea con Prettier. |
| `npm test` | Ejecuta Jest. |
| `npm run test:unit` | Ejecuta pruebas unitarias en serie. |
| `npm run test:cov` | Genera cobertura. |
| `npm run test:e2e` | Ejecuta pruebas end-to-end. |

Validación recomendada:

```bash
npm run lint:check
npm run test:unit
npm run build
```

## Módulos

- `auth`: registro, verificación, login, refresh, logout, recuperación, perfil y baja lógica.
- `goals`: administración de objetivos financieros.
- `goals-movements`: aportes, extracciones y saldos iniciales.
- `investment-operations`: compras, ventas y posiciones iniciales.
- `summaries`: resumen por objetivo y resumen global por plataforma.
- `assets`: catálogo confiable de activos transferibles.
- `transfers`: registro idempotente de transferencias internas entre objetivos y plataformas.
- `integration`: vinculación con Cashy, presupuesto mensual y aportes asociados.
- `health`: disponibilidad de la API y MongoDB.
- `common`: autenticación, base de datos, correo, contratos e infraestructura compartida.

Todos los endpoints usan `/api/v1`. Salvo los marcados con `@Public()`, están protegidos globalmente con JWT:

```http
Authorization: Bearer ACCESS_TOKEN
```

## Arquitectura y convenciones

La aplicación utiliza una arquitectura modular de NestJS. Cada dominio mantiene controladores, servicios, DTOs, entidades e interfaces; las dependencias transversales viven en `src/common`.

- Los controladores administran el transporte HTTP.
- Los servicios concentran reglas de negocio y orquestación.
- Los DTOs validan entradas con `class-validator`.
- Mongoose y los servicios compartidos encapsulan la persistencia.
- Cada recurso se filtra por el `userId` autenticado.
- La baja de usuario es lógica.
- La baja de objetivos es lógica y conserva referencias históricas.
- El access token es de corta duración y el refresh token pertenece a una sesión persistida.
- Las respuestas REST respetan un contrato uniforme.

La configuración y las reglas completas de integración, aportes, transferencias,
idempotencia y baja de objetivos están en
[`docs/INTEGRATION_AND_TRANSFERS.md`](docs/INTEGRATION_AND_TRANSFERS.md).

```ts
interface IResult<T> {
  result: T;
  message: string;
  description: string;
  statuscode: number;
  ok: boolean;
}
```

## Flujo de autenticación

1. El usuario se registra con nombre, correo, contraseña y aceptación de términos.
2. Recibe un código de seis dígitos con vencimiento.
3. Verifica el correo mediante `/auth/verify-code`.
4. Inicia sesión y recibe access token y refresh token.
5. El access token se envía en cada endpoint protegido.
6. `/auth/refresh` rota los tokens cuando vence el access token.
7. Tres contraseñas incorrectas bloquean la cuenta y obligan a verificar el correo y cambiar la contraseña.

La contraseña requiere ocho caracteres como mínimo, una mayúscula, un número y un carácter especial.

## Swagger

La documentación interactiva está en:

```text
http://localhost:3001/api/v1/docs
```

## Commits y Husky

- `pre-commit`: ejecuta ESLint y pruebas unitarias.
- `commit-msg`: exige que el mensaje coincida exactamente con la rama.

```bash
git switch -c feature/GROWLY-20
git add .
git commit -m "feature/GROWLY-20"
```

La regla también aplica en GitHub Desktop.

## Solución de problemas

### MongoDB no conecta

- Verifica la URI, el usuario y la contraseña.
- Confirma que tu IP esté autorizada en Atlas.
- Codifica los caracteres especiales de la contraseña.
- Consulta `/api/v1/health`.

### No llegan correos

- Verifica la API key y el remitente de Brevo.
- Confirma que `BREVO_SENDER_EMAIL` esté validado.
- Revisa los logs de NestJS.

### El frontend recibe `401 Unauthorized`

- Confirma el header `Authorization: Bearer <token>`.
- Renueva la sesión mediante `/auth/refresh`.
- Verifica que los secretos JWT no hayan cambiado durante una sesión activa.
