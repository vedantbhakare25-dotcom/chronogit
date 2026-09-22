import http from 'node:http';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fetchJson, FetchError } from '../../src/services/fetcher.js';

/**
 * A tiny local HTTP server standing in for a third-party API, so these
 * tests exercise real network I/O (timeouts, streamed bodies, headers)
 * without calling out to the internet.
 */
let server;
let baseUrl;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const send = (status, headers, body) => {
      res.writeHead(status, headers);
      res.end(body);
    };

    if (req.url === '/ok') {
      return send(200, { 'content-type': 'application/json' }, JSON.stringify({ temp: 32 }));
    }
    if (req.url === '/charset') {
      return send(200, { 'content-type': 'application/json; charset=utf-8' }, JSON.stringify({ ok: true }));
    }
    if (req.url === '/not-json-content-type') {
      return send(200, { 'content-type': 'text/plain' }, JSON.stringify({ temp: 32 }));
    }
    if (req.url === '/malformed-json') {
      return send(200, { 'content-type': 'application/json' }, '{ temp: 32, ');
    }
    if (req.url === '/server-error') {
      return send(500, { 'content-type': 'application/json' }, JSON.stringify({ error: 'boom' }));
    }
    if (req.url === '/not-found') {
      return send(404, { 'content-type': 'application/json' }, JSON.stringify({ error: 'nope' }));
    }
    if (req.url === '/redirect') {
      return send(302, { location: '/ok' }, '');
    }
    if (req.url === '/slow') {
      setTimeout(() => send(200, { 'content-type': 'application/json' }, '{}'), 500);
      return;
    }
    if (req.url === '/huge') {
      // A JSON array well over any sane test size cap.
      const body = JSON.stringify({ blob: 'x'.repeat(50_000) });
      return send(200, { 'content-type': 'application/json' }, body);
    }
    return send(404, {}, 'unknown route');
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(() => new Promise((resolve) => server.close(resolve)));

describe('fetchJson: happy path', () => {
  it('parses a plain application/json response', async () => {
    const result = await fetchJson({ url: `${baseUrl}/ok` });
    expect(result.json).toEqual({ temp: 32 });
    expect(result.status).toBe(200);
    expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('accepts a content-type with a charset suffix', async () => {
    const result = await fetchJson({ url: `${baseUrl}/charset` });
    expect(result.json).toEqual({ ok: true });
  });

  it('sends custom headers through to the request', async () => {
    let seen;
    const probe = http.createServer((req, res) => {
      seen = req.headers['x-api-key'];
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{}');
    });
    await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
    const { port } = probe.address();

    await fetchJson({ url: `http://127.0.0.1:${port}`, headers: { 'x-api-key': 'secret123' } });
    expect(seen).toBe('secret123');

    await new Promise((resolve) => probe.close(resolve));
  });
});

describe('fetchJson: failure classification', () => {
  it('rejects a non-2xx status as HTTP_ERROR', async () => {
    await expect(fetchJson({ url: `${baseUrl}/server-error` })).rejects.toMatchObject({
      name: 'FetchError',
      code: 'HTTP_ERROR',
      status: 500,
    });
    await expect(fetchJson({ url: `${baseUrl}/not-found` })).rejects.toMatchObject({ code: 'HTTP_ERROR', status: 404 });
  });

  it('rejects a non-JSON content-type as BAD_CONTENT_TYPE, without parsing the body', async () => {
    await expect(fetchJson({ url: `${baseUrl}/not-json-content-type` })).rejects.toMatchObject({
      code: 'BAD_CONTENT_TYPE',
    });
  });

  it('rejects a malformed body as INVALID_JSON even with the right content-type', async () => {
    await expect(fetchJson({ url: `${baseUrl}/malformed-json` })).rejects.toMatchObject({
      code: 'INVALID_JSON',
    });
  });

  it('rejects a redirect instead of silently following it', async () => {
    const result = fetchJson({ url: `${baseUrl}/redirect` });
    await expect(result).rejects.toThrow(FetchError);
  });

  it('times out on a slow endpoint', async () => {
    await expect(fetchJson({ url: `${baseUrl}/slow`, timeoutMs: 100 })).rejects.toMatchObject({
      code: 'TIMEOUT',
    });
  }, 2000);

  it('rejects a response over the byte cap', async () => {
    await expect(fetchJson({ url: `${baseUrl}/huge`, maxBytes: 1000 })).rejects.toMatchObject({
      code: 'TOO_LARGE',
    });
  });

  it('rejects an unreachable host as NETWORK_ERROR', async () => {
    await expect(fetchJson({ url: 'http://127.0.0.1:1' })).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    });
  }, 5000);
});