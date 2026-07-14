import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

/** Resolve the uploads root exactly like FrameStore (UPLOAD_DIR env or <cwd>/uploads). */
export function uploadRootDir(): string {
  return process.env.UPLOAD_DIR
    ? path.isAbsolute(process.env.UPLOAD_DIR)
      ? process.env.UPLOAD_DIR
      : path.join(process.cwd(), process.env.UPLOAD_DIR)
    : path.join(process.cwd(), 'uploads');
}

/** Atomic write via temp-file rename so readers never observe a partial file. */
export function atomicWriteFile(filePath: string, data: Buffer | string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}-${crypto.randomBytes(5).toString('hex')}`;
  fs.writeFileSync(tmp, data);
  try {
    fs.renameSync(tmp, filePath);
  } catch (error) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    fs.renameSync(tmp, filePath);
    if (!fs.existsSync(filePath)) throw error;
  }
}
