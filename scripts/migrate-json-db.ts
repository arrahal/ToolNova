import fs from 'fs';
import path from 'path';
import {
  PROTECTOR_DB_FILE,
  VAULT_STORE_FILE,
  PROJECT_ROOT,
} from '../server/config';
import {
  getProtectorRepository,
  ProtectedFileRecord,
} from '../server/storage';
import { adminDb } from '../server/firebaseAdmin';

/**
 * Migration Script (Requirement 7)
 * Reads legacy .protector_db.json and .vault_quotas.json and migrates records into
 * the Repository interface and Firestore database.
 * Safe to re-run (idempotent).
 */
export async function migrateJsonDb(): Promise<{
  migratedFiles: number;
  skippedFiles: number;
  migratedQuotas: number;
}> {
  console.log('--- Starting JSON DB Migration ---');
  const repo = getProtectorRepository();

  let migratedFiles = 0;
  let skippedFiles = 0;
  let migratedQuotas = 0;

  // 1. Migrate Protected Files
  if (fs.existsSync(PROTECTOR_DB_FILE)) {
    try {
      const raw = fs.readFileSync(PROTECTOR_DB_FILE, 'utf-8');
      const filesMap: Record<string, ProtectedFileRecord> = JSON.parse(raw);
      const entries = Object.entries(filesMap);
      console.log(`Found ${entries.length} records in ${PROTECTOR_DB_FILE}`);

      for (const [fileId, record] of entries) {
        if (!fileId || !record) continue;

        const existing = await repo.get(fileId);
        if (!existing) {
          await repo.save(record);
          migratedFiles++;
          console.log(`[Migrated] File: ${fileId} (${record.originalName})`);
        } else {
          skippedFiles++;
        }
      }
    } catch (err) {
      console.error(`Error reading ${PROTECTOR_DB_FILE}:`, err);
    }
  } else {
    console.log(`No legacy file found at ${PROTECTOR_DB_FILE} - skipping file migration.`);
  }

  // 2. Migrate Vault Quotas if present
  if (fs.existsSync(VAULT_STORE_FILE)) {
    try {
      const raw = fs.readFileSync(VAULT_STORE_FILE, 'utf-8');
      const quotasMap: Record<string, any> = JSON.parse(raw);
      const entries = Object.entries(quotasMap);
      console.log(`Found ${entries.length} quota entries in ${VAULT_STORE_FILE}`);

      for (const [uid, quotaData] of entries) {
        if (!uid || !quotaData) continue;
        if (adminDb && typeof adminDb.collection === 'function') {
          try {
            const entRef = adminDb.collection('entitlements').doc(uid);
            const snap = await entRef.get();
            if (!snap.exists) {
              await entRef.set(
                {
                  uid,
                  planId: quotaData.planId || 'free',
                  maxProtectedFiles: quotaData.maxProtectedFiles || 5,
                  maxFileSizeMB: quotaData.maxFileSizeMB || 15,
                  maxWorkflows: quotaData.maxWorkflows || 3,
                  migratedAt: Date.now(),
                },
                { merge: true }
              );
              migratedQuotas++;
              console.log(`[Migrated] Quota for UID: ${uid}`);
            }
          } catch (dbErr) {
            console.warn(`Could not sync quota for ${uid} to Firestore:`, dbErr);
          }
        }
      }
    } catch (err) {
      console.error(`Error reading ${VAULT_STORE_FILE}:`, err);
    }
  } else {
    console.log(`No legacy file found at ${VAULT_STORE_FILE} - skipping quota migration.`);
  }

  console.log('--- Migration Finished ---');
  console.log(`Summary: Migrated ${migratedFiles} files (${skippedFiles} already existed), ${migratedQuotas} quotas.`);
  return { migratedFiles, skippedFiles, migratedQuotas };
}

// Run immediately if invoked directly
const isDirectRun = process.argv[1]?.includes('migrate-json-db');
if (isDirectRun) {
  migrateJsonDb()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
