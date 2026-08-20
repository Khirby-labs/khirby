import { NestFactory } from '@nestjs/core';
import { NestFastifyApplication, FastifyAdapter } from '@nestjs/platform-fastify';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import fastifyHelmet from '@fastify/helmet';
import fastifyCors from '@fastify/cors';
import fastifyCookie from '@fastify/cookie';
import fastifySession from '@fastify/session';
import Redis from 'ioredis';

// connect-redis v9 requires node-redis API (sendCommand) — incompatible with ioredis.
// Minimal express-compatible session store wrapping ioredis directly.
class IoRedisSessionStore {
  constructor(private client: Redis) {}
  async get(sid: string, cb: (err: any, session?: any) => void) {
    try {
      const d = await this.client.get(`sess:${sid}`);
      cb(null, d ? JSON.parse(d) : null);
    } catch (e) {
      cb(e);
    }
  }
  async set(sid: string, session: any, cb: (err?: any) => void) {
    try {
      const ttl = session?.cookie?.maxAge ?? 7 * 24 * 60 * 60 * 1000;
      await this.client.set(`sess:${sid}`, JSON.stringify(session), 'PX', ttl);
      cb();
    } catch (e) {
      cb(e);
    }
  }
  async destroy(sid: string, cb: (err?: any) => void) {
    try {
      await this.client.del(`sess:${sid}`);
      cb();
    } catch (e) {
      cb(e);
    }
  }
}
import { AllExceptionsFilter } from './core/filters/all-exceptions.filter';
import { validationExceptionFactory } from './core/errors/validation-exception-factory';
import {
  parseCorsOrigin,
  resolveListenPort,
  resolveSessionSecret,
} from './core/security/bootstrap-env';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const isDev = process.env.NODE_ENV !== 'production';
  const sessionSecret = resolveSessionSecret(isDev);
  // Validate CORS allowlist before binding the server (fail-fast in production).
  const corsOrigin = parseCorsOrigin(process.env.CORS_ORIGIN, isDev);

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    // trustProxy: 1 hop (nginx). Boolean `true` would trust any X-Forwarded-For
    // and let clients spoof req.ip (throttlers / MCP). See docker/nginx.conf.
    new FastifyAdapter({ logger: false, trustProxy: 1 }),
    { logger: ['log', 'error', 'warn', 'debug', 'verbose'] },
  );

  if (isDev) {
    const httpLogger = new Logger('HTTP');
    const fastify = app.getHttpAdapter().getInstance();
    fastify.addHook('onResponse', (request, reply, done) => {
      httpLogger.log(
        `${request.method} ${request.url} ${reply.statusCode} ${Math.round(reply.elapsedTime)}ms`,
      );
      done();
    });
  }

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      // Per-field { field, constraint, message } instead of English sentences,
      // so the SPA can translate a DTO failure (ADR-0011).
      exceptionFactory: validationExceptionFactory,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  // Security headers
  await app.register(fastifyHelmet, {
    contentSecurityPolicy: isDev ? false : undefined,
  });

  // CORS — /api/public/* always open (landings / localhost embeds).
  // Other routes: CORS_ORIGIN allowlist (required in production).
  await app.register(fastifyCors, {
    delegator: (req, callback) => {
      const path = (req.url ?? '').split('?')[0];
      const isPublic = path.startsWith('/api/public/');
      if (isPublic) {
        callback(null, {
          origin: true,
          credentials: false,
          methods: ['GET', 'POST', 'OPTIONS'],
          allowedHeaders: ['Content-Type'],
        });
        return;
      }
      // MCP Streamable HTTP — bearer token, no session cookies.
      const isMcp = path === '/api/mcp' || path.startsWith('/api/mcp/');
      if (isMcp) {
        callback(null, {
          origin: true,
          credentials: false,
          methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
          allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Mcp-Session-Id'],
        });
        return;
      }
      callback(null, {
        origin: corsOrigin,
        credentials: true,
        methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type'],
      });
    },
  });

  // Redis session store
  const redisClient = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');

  await app.register(fastifyCookie);
  await app.register(fastifySession, {
    store: new IoRedisSessionStore(redisClient),
    secret: sessionSecret,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      // Production always Secure; nginx must send X-Forwarded-Proto (docker/nginx.conf).
      secure: isDev ? 'auto' : true,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  });

  // Swagger — tylko w dev
  if (isDev) {
    const { DocumentBuilder, SwaggerModule } = await import('@nestjs/swagger');
    const config = new DocumentBuilder()
      .setTitle('CRM Khirby API')
      .setDescription(
        'REST API dla CRM Khirby. ' +
          'Uwierzytelnianie przez session cookie — najpierw POST /api/auth/login, ' +
          'cookie connect.sid zostanie ustawione automatycznie.',
      )
      .setVersion('1.0')
      .addCookieAuth(
        'connect.sid',
        { type: 'apiKey', in: 'cookie', name: 'connect.sid' },
        'session',
      )
      .addTag('auth', 'Logowanie, wylogowanie, profil, zmiana hasła')
      .addTag('users', 'Zarządzanie użytkownikami (admin)')
      .addTag('contacts', 'Kontakty CRM')
      .addTag('forms', 'Formularze i zgłoszenia')
      .addTag('roles', 'Role i uprawnienia RBAC')
      .addTag('newsletter', 'Listy newslettera (Listmonk)')
      .addTag('plugins', 'Integracje i wtyczki')
      .build();
    const document = SwaggerModule.createDocument(app, config);
    await SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        tagsSorter: 'alpha',
        operationsSorter: 'alpha',
        withCredentials: true,
      },
    });
    const port = resolveListenPort();
    logger.log(`Swagger UI: http://localhost:${port}/api/docs`);
  }

  const port = resolveListenPort();
  await app.listen(port, '0.0.0.0');
  logger.log(`API listening on http://0.0.0.0:${port} [${isDev ? 'development' : 'production'}]`);
}

bootstrap();
