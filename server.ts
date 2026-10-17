import express from 'express';
import helmet from 'helmet';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { PORT, NODE_ENV, PROJECT_ROOT } from './server/config';
import { protectorRouter } from './server/protectorRoutes';
import { vaultRouter } from './server/vaultRoutes';

export function createExpressApp() {
  const app = express();

  const isProd = process.env.NODE_ENV === 'production';
  // Helmet with strict CSP in production, relaxed in development to keep Vite dev mode functional
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
      })
    );
  } else {
    // Relaxed in development mode so Vite dev server, HMR, inline scripts and tooling function properly
    app.use(
      helmet({
        contentSecurityPolicy: false,
        crossOriginEmbedderPolicy: false,
      })
    );
  }

  // Security & CORS Headers
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
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

  // Support up to 150MB JSON body for base64 file uploads (allows large files)
  app.use(express.json({ limit: '150mb' }));
  app.use(express.urlencoded({ extended: true, limit: '150mb' }));

  // JSON Error handler to return clean JSON when file exceeds limit or JSON is malformed
  app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err) {
      if (err.type === 'entity.too.large' || err.status === 413) {
        res.status(413).json({
          ok: false,
          error:
            'حجم الملف المرفوع كبير جداً ويتجاوز سعة خادم التشفير. يرجى اختيار ملف بحجم مناسب (أقل من 75 ميجابايت).',
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

  // Mount API routers
  app.use('/api/protector', protectorRouter);
  app.use('/api/vault', vaultRouter);

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
