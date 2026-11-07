import { createServer } from 'node:http';

type Recorded = { method: string; body: unknown };
const messages: Recorded[] = [];
let fail = false;
const port = Number(process.env.TELEGRAM_STUB_PORT ?? 54321);

createServer(async (request, response) => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  let body: unknown = {};
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
  catch { response.writeHead(400).end(); return; }
  const path = new URL(request.url ?? '/', 'http://localhost').pathname;
  const json = (status: number, data: unknown) => {
    response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(data));
  };
  if (request.method === 'GET' && path === '/__messages') { json(200, messages); return; }
  if (request.method === 'POST' && path === '/__clear') { messages.length = 0; json(200, { ok: true }); return; }
  if (request.method === 'POST' && path === '/__mode') { fail = (body as { fail?: boolean }).fail === true; json(200, { ok: true, fail }); return; }
  const match = /^\/bot[^/]+\/([A-Za-z][A-Za-z0-9]*)$/.exec(path);
  if (request.method !== 'POST' || !match) { json(404, { ok: false }); return; }
  const method = match[1];
  messages.push({ method, body });
  if (fail && method === 'sendMessage') { json(500, { ok: false, error_code: 500, description: 'Stub failure' }); return; }
  const payload = body as { chat_id?: number | string; text?: string };
  json(200, { ok: true, result: method === 'sendMessage'
    ? { message_id: messages.length, date: Math.floor(Date.now() / 1000), chat: { id: Number(payload.chat_id), type: 'private' }, text: payload.text }
    : method === 'getMe' ? { id: 123, is_bot: true, first_name: 'Stub', username: 'stub_bot' } : true });
}).listen(port, '127.0.0.1', () => console.log(`Telegram stub: http://127.0.0.1:${port}`));
