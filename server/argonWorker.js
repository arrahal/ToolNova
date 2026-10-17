import { parentPort } from 'node:worker_threads';
import { argon2id } from '@noble/hashes/argon2.js';

if (parentPort) {
  parentPort.on('message', (msg) => {
    try {
      const { id, password, saltHex, t, m, p } = msg;
      const passBuf = Buffer.from(password, 'utf-8');
      const saltBuf = Buffer.from(saltHex, 'hex');
      const out = argon2id(passBuf, saltBuf, {
        t,
        m,
        p,
        dkLen: 64,
      });
      const resultHex = Buffer.from(out).toString('hex');
      parentPort.postMessage({ id, success: true, resultHex });
    } catch (err) {
      parentPort.postMessage({
        id: msg?.id,
        success: false,
        error: err?.message || 'Argon2id derivation failed',
      });
    }
  });
}
