# Security Notice: Historical Sensitive Files & Remediation

## 1. Incidental Sensitive Files
During earlier prototyping stages of ToolNova's Secure File Protector, local encrypted metadata (`.protector_db.json`) and encrypted payload blobs (`.secure_storage/*.enc`, `.vault_quotas.json`) were committed or stored directly within the repository working tree.

## 2. Immediate Risk & Compromise Warning
- **Compromised Passwords**: Any password or passphrase previously used to protect files tracked in historical commits must be **treated as compromised**.
- **Action Required**: Users and administrators must revoke any such protected files, rotate any passwords used, and generate fresh encrypted containers.

## 3. Mandatory Git History Purge
The working tree copies of `.protector_db.json` and `.secure_storage/*.enc` have been deleted, and `.gitignore` has been updated to prevent future commits. However, to eliminate references from historical commits, repository administrators must run a git history rewrite using `git-filter-repo` or BFG Repo-Cleaner:

```bash
# Using git-filter-repo
git filter-repo --invert-paths \
  --path .protector_db.json \
  --path .vault_quotas.json \
  --path-glob '.secure_storage/*' \
  --path-glob '*.enc' \
  --path-glob '.env*' \
  --path-glob '.server_master_key*'

# Force push to remote mirrors (coordinate with team before running)
git push origin --force --all
git push origin --force --tags
```

## 4. Current Storage Architecture
All file metadata is now stored in Firestore (via `IProtectorRepository` with transactions) with local memory mutex fallback. Encrypted binaries reside strictly in external or isolated volume storage (`STORAGE_DIR`), ensuring secrets and ciphertexts are never checked into version control.
