import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

/** Atomically replace a JSON file without truncating a previously valid value. */
export function writeJsonAtomically(filePath, value, fsApi = fs) {
  const directory = path.dirname(filePath);
  const tempPath = path.join(directory, `.${path.basename(filePath)}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`);
  try {
    fsApi.mkdirSync(directory, { recursive: true });
    fsApi.writeFileSync(tempPath, JSON.stringify(value, null, 2), { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    fsApi.renameSync(tempPath, filePath);
    return true;
  } catch {
    try { fsApi.unlinkSync(tempPath); } catch { /* no temp file or cleanup denied */ }
    return false;
  }
}
