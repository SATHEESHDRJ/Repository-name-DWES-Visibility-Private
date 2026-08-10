import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  PayloadTooLargeException,
  Type,
  mixin,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import type { FastifyRequest } from 'fastify';

/**
 * Shape consumed by every upload endpoint. Field-for-field compatible with the
 * subset of Express.Multer.File the codebase used (buffer / originalname /
 * mimetype / size / fieldname), so UploadService stays untouched.
 */
export interface DwesUploadedFile {
  fieldname: string;
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/**
 * Fastify replacement for Multer's FileInterceptor(fieldName) preserving the
 * previous wire semantics exactly:
 * - non-multipart request  → request.file stays undefined; the controller's
 *   `if (!file) throw new BadRequestException('No file uploaded')` fires.
 * - text fields (in any wire order, before or after the file part) are
 *   collected into request.body so @Body() keeps working — Multer did this.
 * - a file part under a different field name, or a second file part
 *   → 400 "Unexpected field" (Multer's LIMIT_UNEXPECTED_FILE behaviour).
 * - a part exceeding the configured fileSize limit
 *   → 413 "File too large" (Multer's LIMIT_FILE_SIZE behaviour).
 *
 * The whole file is buffered in memory — identical to the previous
 * memory-storage Multer setup; size limits are enforced upstream by the
 * @fastify/multipart registration in main.ts.
 */
export function DwesFileInterceptor(fieldName: string): Type<NestInterceptor> {
  @Injectable()
  class MixinInterceptor implements NestInterceptor {
    async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
      const req = context.switchToHttp().getRequest<FastifyRequest>();
      // @fastify/multipart types `request.file` as its helper method; Nest's
      // @UploadedFile() reads the same slot as plain data. This view is how
      // the request is observed after parsing completes.
      const store = req as unknown as { file?: DwesUploadedFile; body?: Record<string, unknown> };

      // @fastify/multipart decorates request.file as a helper FUNCTION, which
      // is truthy — without this reset, a non-multipart request would sail
      // past the controllers' `if (!file)` guard and fail deep inside the
      // service instead of returning Multer's "No file uploaded" 400.
      store.file = undefined;

      if (typeof req.isMultipart !== 'function' || !req.isMultipart()) {
        return next.handle();
      }

      const fields: Record<string, unknown> = {};
      let file: DwesUploadedFile | undefined;

      try {
        for await (const part of req.parts()) {
          if (part.type === 'file') {
            if (file !== undefined || part.fieldname !== fieldName) {
              // Drain so the connection is not left mid-stream, then reject
              // with Multer's exact unexpected-field behaviour.
              part.file.resume();
              throw new BadRequestException('Unexpected field');
            }
            const buffer = await part.toBuffer();
            file = {
              fieldname: part.fieldname,
              originalname: part.filename,
              mimetype: part.mimetype,
              size: buffer.length,
              buffer,
            };
          } else if (part.fieldname !== '__proto__' && part.fieldname !== 'constructor') {
            fields[part.fieldname] = part.value;
          }
        }
      } catch (err) {
        const code = (err as { code?: string })?.code;
        if (code === 'FST_REQ_FILE_TOO_LARGE') {
          throw new PayloadTooLargeException('File too large');
        }
        if (code === 'FST_FILES_LIMIT') {
          throw new BadRequestException('Unexpected field');
        }
        if (code === 'FST_PARTS_LIMIT' || code === 'FST_FIELDS_LIMIT') {
          throw new BadRequestException('Too many parts');
        }
        throw err;
      }

      store.file = file;
      // Multer merged text fields into req.body; @Body() reads from there.
      store.body = { ...(typeof store.body === 'object' && store.body !== null ? store.body : {}), ...fields };

      return next.handle();
    }
  }
  return mixin(MixinInterceptor);
}
