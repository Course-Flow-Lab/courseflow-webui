import test from 'node:test';
import assert from 'node:assert/strict';
import { createApi, coursePath } from '../src/api.js';

test('同源请求保留 Cookie、CSRF 和不透明课程标识', async (t) => {
  const path = coursePath('平台/甲', { id: '课程/1', recruit_id: '班级?2#3' }) + '/jobs';
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, '/api/platforms/%E5%B9%B3%E5%8F%B0%2F%E7%94%B2/courses/%E8%AF%BE%E7%A8%8B%2F1/%E7%8F%AD%E7%BA%A7%3F2%233/jobs');
    assert.equal(options.credentials, 'same-origin');
    assert.equal(options.headers['x-courseflow-csrf'], 'synthetic-csrf');
    assert.deepEqual(JSON.parse(options.body), { operation: 'study' });
    return Response.json({ ok: true });
  });
  assert.deepEqual(await createApi(() => 'synthetic-csrf')(path, { method: 'POST', body: { operation: 'study' } }), { ok: true });
});

test('网关 HTML、无效 JSON 和连接失败显示中文错误，取消请求仍保持取消语义', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch');
  const api = createApi(() => '');
  for (const status of [502, 503, 504]) {
    fetch.mock.mockImplementation(async () => new Response('<h1>Gateway error</h1>', { status }));
    await assert.rejects(api('/api/bootstrap'), error => error.code === 'backend_unavailable' && error.status === status && /后端暂时不可用/.test(error.message));
  }
  fetch.mock.mockImplementation(async () => new Response('<html>wrong proxy</html>'));
  await assert.rejects(api('/api/bootstrap'), error => error.code === 'invalid_response' && /部署配置/.test(error.message));
  fetch.mock.mockImplementation(async () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(api('/api/bootstrap'), /无法连接后端/);
  const abort = new DOMException('Cancelled', 'AbortError');
  fetch.mock.mockImplementation(async () => { throw abort; });
  await assert.rejects(api('/api/bootstrap'), error => error === abort);
});

test('Bootstrap 检查 HTTP 契约版本，不误用模块协议版本', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch');
  const api = createApi(() => '');
  for (const version of [undefined, 0, 2, '1']) {
    fetch.mock.mockImplementation(async () => Response.json({ module_api: 1, web_api_version: version }));
    await assert.rejects(api('/api/bootstrap'), error => error.code === 'web_api_mismatch' && /不兼容/.test(error.message));
  }
  fetch.mock.mockImplementation(async () => Response.json({ module_api: 2, web_api_version: 1 }));
  assert.equal((await api('/api/bootstrap')).web_api_version, 1);
});

test('日志下载保留文件名，过期会话和服务端错误保留语义', async (t) => {
  let expired = 0;
  const api = createApi(() => '', () => { expired += 1; });
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response('合成日志', { headers: { 'content-disposition': 'attachment; filename="courseflow-test.log"' } }));
  const result = await api('/api/logs/export', { download: true });
  assert.equal(result.filename, 'courseflow-test.log');
  assert.equal(await result.blob.text(), '合成日志');
  fetch.mock.mockImplementation(async () => Response.json({ error: { code: 'unauthorized', message: '会话已过期' } }, { status: 401 }));
  await assert.rejects(api('/api/logs/export', { download: true }), error => error.status === 401 && error.code === 'unauthorized');
  assert.equal(expired, 1);
  await assert.rejects(api('/api/me'), /会话已过期/);
  assert.equal(expired, 1);
});
