import DOMPurify, { type Config } from 'dompurify';

// Strict hook: enforce no javascript: URLs and data: URLs only for images
if (typeof DOMPurify?.addHook === 'function') {
  DOMPurify.addHook('uponSanitizeAttribute', (_node: any, data: any) => {
    if (data.attrName === 'src' || data.attrName === 'href') {
      const val = String(data.attrValue || '').trim().toLowerCase();
      if (val.startsWith('javascript:') || val.startsWith('vbscript:')) {
        data.keepAttr = false;
      } else if (val.startsWith('data:') && !val.startsWith('data:image/')) {
        data.keepAttr = false;
      }
    }
  });
}

export const STRICT_PURIFY_CONFIG: Config = {
  ALLOWED_TAGS: [
    'p', 'br', 'b', 'i', 'strong', 'em', 'u', 's', 'strike',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
    'span', 'div', 'hr', 'blockquote', 'pre', 'code', 'sub', 'sup',
    'img', 'a',
  ],
  ALLOWED_ATTR: [
    'href', 'title', 'target', 'rel',
    'src', 'alt', 'width', 'height',
    'colspan', 'rowspan', 'scope',
    'align', 'dir', 'lang', 'class',
  ],
  // Disallow all script, style, iframe, object, embed, form tags
  FORBID_TAGS: [
    'script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'select', 'textarea',
    'link', 'meta', 'base', 'applet', 'svg', 'math', 'noscript'
  ],
  // Disallow all on* attributes and inline style attributes
  FORBID_ATTR: [
    'onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'onchange', 'onsubmit',
    'onmouseenter', 'onmouseleave', 'onkeydown', 'onkeypress', 'onkeyup', 'style'
  ],
  ALLOW_DATA_ATTR: false,
};

export function sanitizeHtml(dirty: string): string {
  if (!dirty || typeof dirty !== 'string') return '';
  return DOMPurify.sanitize(dirty, STRICT_PURIFY_CONFIG) as unknown as string;
}

export default sanitizeHtml;
