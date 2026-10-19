import express from 'express';
import helmet from 'helmet';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { PORT, NODE_ENV, PROJECT_ROOT, ALLOWED_ORIGINS } from './server/config';
import { protectorRouter } from './server/protectorRoutes';
import { billingRouter } from './server/billingRoutes';
import { workflowRouter } from './server/workflowRoutes';
import { billingLimiter } from './server/rateLimiters';

export function createExpressApp() {
  const app = express();

  // 1. Configurable Trust Proxy (Requirement 2)
  // When trust proxy is not set or false, req.ip uses req.socket.remoteAddress and ignores spoofed X-Forwarded-For
  const trustProxyEnv = process.env.TRUST_PROXY;
  if (trustProxyEnv !== undefined && trustProxyEnv !== '') {
    if (trustProxyEnv === 'true') {
      app.set('trust proxy', true);
    } else if (trustProxyEnv === 'false') {
      app.set('trust proxy', false);
    } else if (!isNaN(Number(trustProxyEnv))) {
      app.set('trust proxy', Number(trustProxyEnv));
    } else {
      app.set('trust proxy', trustProxyEnv);
    }
  } else {
    // Safe default: do not trust spoofed X-Forwarded-For headers
    app.set('trust proxy', false);
  }

  const isProd = process.env.NODE_ENV === 'production';

  // 2. Helmet with strict CSP & HSTS in production (Requirement 1)
  if (isProd) {
    app.use(
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            objectSrc: ["'none'"],
            baseUri: ["'none'"],
            frameAncestors: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
            connectSrc: ["'self'", 'https://*.googleapis.com', 'https://*.firebaseio.com'],
          },
        },
        crossOriginEmbedderPolicy: false,
        hsts: {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: true,
        },
      })
    );
  } else {
    // Relaxed in development mode so Vite dev server, HMR, inline scripts and tooling function properly
    app.use(
      helmet({
        contentSecurityPolicy: false,
        crossOriginEmbedderPolicy: false,
        hsts: false,
      })
    );
  }

  // 3. Security & CORS Headers with configurable allowlist from ALLOWED_ORIGINS (Requirement 1)
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (ALLOWED_ORIGINS && ALLOWED_ORIGINS.length > 0) {
      if (origin && ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
      }
    } else {
      // In dev/test with no allowlist configured, safely allow request origin or wildcard
      if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
      } else {
        res.setHeader('Access-Control-Allow-Origin', '*');
      }
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // 4. Strict 1MB JSON Body limit (Requirement 4)
  // Large files are uploaded via multipart streaming busboy in /api/protector/encrypt
  // verify hook preserves rawBody buffer for HMAC webhook signature verification
  app.use(
    express.json({
      limit: '1mb',
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    })
  );
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Early JSON payload size / syntax error handler
  app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err) {
      if (err.type === 'entity.too.large' || err.status === 413) {
        res.status(413).json({
          ok: false,
          error:
            'حجم بيانات الطلب كبير جداً ويتجاوز الحد الأقصى المسموح به (1 ميجابايت). للملفات الكبيرة يرجى استخدام رفع multipart.',
        });
        return;
      }
      if (err instanceof SyntaxError && 'body' in err) {
        res.status(400).json({
          ok: false,
          error: 'بيانات الطلب غير صالحة.',
        });
        return;
      }
    }
    next(err);
  });

  // 5. Mount API routers with per-route rate limiters (Requirements 2)
  app.use('/api/protector', protectorRouter);
  app.use('/api/billing', billingLimiter, billingRouter);
  app.use('/api/workflows', workflowRouter);

  // 6. Final Global Error Handler: Never leak stack traces or file system paths (Requirement 9)
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (res.headersSent) {
      return;
    }
    const statusCode = typeof err?.status === 'number' && err.status >= 400 && err.status < 600 ? err.status : 500;
    // Log server error internally without exposing to user
    console.error('[SERVER ERROR CAUGHT]', err?.message || err);

    res.status(statusCode).json({
      ok: false,
      error: 'حدث خطأ غير متوقع في الخادم. يرجى المحاولة مرة أخرى لاحقاً.',
    });
  });

  return app;
}

export async function startServer() {
  const app = createExpressApp();

  if (NODE_ENV !== 'production' && NODE_ENV !== 'test') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (NODE_ENV === 'production') {
    const distPath = path.join(PROJECT_ROOT, 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Only listen when not in test environment
  if (NODE_ENV !== 'test') {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`ToolNova Server running on http://localhost:${PORT}`);
    });
  }

  return app;
}

// Only auto-start when executed directly and not running under Vitest
const isTestEnv = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);
if (!isTestEnv) {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
