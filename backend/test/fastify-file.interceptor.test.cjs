const test = require('node:test');
const assert = require('node:assert/strict');
const { DwesFileInterceptor } = require('../dist/common/interceptors/fastify-file.interceptor');

function ctxFor(req) {
  return { switchToHttp: () => ({ getRequest: () => req }) };
}
const next = { handle: () => 'handled' };

function filePart(fieldname, filename, mimetype, buffer) {
  return {
    type: 'file',
    fieldname,
    filename,
    mimetype,
    file: { resume() {} },
    toBuffer: async () => buffer,
  };
}
function fieldPart(fieldname, value) {
  return { type: 'field', fieldname, value };
}

function multipartReq(parts) {
  return {
    isMultipart: () => true,
    async *parts() { yield* parts; },
    body: undefined,
    file: undefined,
  };
}

async function run(req) {
  const Interceptor = DwesFileInterceptor('file');
  const instance = new Interceptor();
  return instance.intercept(ctxFor(req), next);
}

test('collects the file and text fields arriving BEFORE the file part', async () => {
  const buf = Buffer.from('workbook-bytes');
  const req = multipartReq([
    fieldPart('sheet_name', 'WRING_FRAME'),
    fieldPart('mapping', '{"a":"b"}'),
    filePart('file', 'schedule.xlsx', 'application/vnd.ms-excel', buf),
  ]);
  assert.equal(await run(req), 'handled');
  assert.equal(req.file.originalname, 'schedule.xlsx');
  assert.equal(req.file.mimetype, 'application/vnd.ms-excel');
  assert.equal(req.file.size, buf.length);
  assert.deepEqual(req.file.buffer, buf);
  assert.deepEqual(req.body, { sheet_name: 'WRING_FRAME', mapping: '{"a":"b"}' });
});

test('collects text fields arriving AFTER the file part (wire order varies)', async () => {
  const req = multipartReq([
    filePart('file', 'drawing.pdf', 'application/pdf', Buffer.from('%PDF-')),
    fieldPart('replace_drawing_id', 'drw_123'),
    fieldPart('frame_id', 'frame_9'),
  ]);
  await run(req);
  assert.equal(req.file.originalname, 'drawing.pdf');
  assert.deepEqual(req.body, { replace_drawing_id: 'drw_123', frame_id: 'frame_9' });
});

test('non-multipart request passes through with request.file undefined', async () => {
  const req = { isMultipart: () => false };
  assert.equal(await run(req), 'handled');
  assert.equal(req.file, undefined);
});

test('the @fastify/multipart request.file helper FUNCTION is reset to undefined', async () => {
  // The plugin decorates request.file with a method; being truthy it would
  // bypass the controllers' `if (!file)` guard on non-multipart requests.
  const req = { isMultipart: () => false, file: async () => ({}) };
  await run(req);
  assert.equal(req.file, undefined);
});

test('oversize file maps to 413 "File too large" exactly like Multer', async () => {
  const tooLarge = Object.assign(new Error('request file too large'), { code: 'FST_REQ_FILE_TOO_LARGE' });
  const req = {
    isMultipart: () => true,
    // eslint-disable-next-line require-yield
    async *parts() { throw tooLarge; },
  };
  await assert.rejects(run(req), err => {
    assert.equal(err.getStatus(), 413);
    assert.equal(err.message, 'File too large');
    return true;
  });
});

test('file under a different field name is rejected as "Unexpected field"', async () => {
  const req = multipartReq([
    filePart('attachment', 'x.pdf', 'application/pdf', Buffer.from('%PDF-')),
  ]);
  await assert.rejects(run(req), err => {
    assert.equal(err.getStatus(), 400);
    assert.equal(err.message, 'Unexpected field');
    return true;
  });
});

test('a second file part is rejected as "Unexpected field"', async () => {
  const req = multipartReq([
    filePart('file', 'a.pdf', 'application/pdf', Buffer.from('%PDF-a')),
    filePart('file', 'b.pdf', 'application/pdf', Buffer.from('%PDF-b')),
  ]);
  await assert.rejects(run(req), err => {
    assert.equal(err.message, 'Unexpected field');
    return true;
  });
});

test('prototype-polluting field names are dropped', async () => {
  const req = multipartReq([
    fieldPart('__proto__', '{"polluted":true}'),
    filePart('file', 'a.pdf', 'application/pdf', Buffer.from('%PDF-a')),
  ]);
  await run(req);
  assert.equal(Object.prototype.hasOwnProperty.call(req.body, '__proto__'), false);
  assert.equal({}.polluted, undefined);
});
