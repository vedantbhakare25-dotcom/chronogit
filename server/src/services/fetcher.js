import axios from 'axios';

/** Thrown by fetchJson for every failure case, with a machine-readable `code`. */
export class FetchError extends Error {
  constructor(code, message, meta = {}) {
    super(message);
    this.name = 'FetchError';
    this.code = code; // TIMEOUT | TOO_LARGE | BAD_CONTENT_TYPE | INVALID_JSON | HTTP_ERROR | NETWORK_ERROR
    Object.assign(this, meta);
  }
}

export const DEFAULT_TIMEOUT_MS = 10_000;
export const DEFAULT_MAX_BYTES = 2 * 1024 * 1024; // 2 MB — plenty for a JSON API response

/**
 * Fetches a URL and returns its parsed JSON body, or throws a FetchError.
 * Deliberately conservative: this result becomes a monitor's schema
 * baseline, so a slow, huge, or non-JSON response should fail loudly
 * rather than silently produce a partial or wrong schema.
 *
 * @param {Object} options
 * @param {string} options.url
 * @param {Record<string,string>} [options.headers]
 * @param {number} [options.timeoutMs]
 * @param {number} [options.maxBytes]
 * @returns {Promise<{ json: unknown, status: number, responseTimeMs: number }>}
 */
export async function fetchJson({
  url,
  headers = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxBytes = DEFAULT_MAX_BYTES,
}) {
  const startedAt = Date.now();
  let response;

  try {
    response = await axios.get(url, {
      headers: { Accept: 'application/json', ...headers },
      timeout: timeoutMs,
      // axios enforces these while streaming the response, so an oversized
      // body is aborted mid-download rather than fully buffered first.
      maxContentLength: maxBytes,
      maxBodyLength: maxBytes,
      responseType: 'text', // read as text first so a bad content-type doesn't get silently JSON.parsed by axios
      validateStatus: () => true, // handle non-2xx ourselves, with our own error shape
      // Being a monitor, not a browser: don't chase redirects into a different endpoint.
      maxRedirects: 0,
    });
  } catch (err) {
    throw classifyAxiosError(err, timeoutMs, maxBytes);
  }

  const responseTimeMs = Date.now() - startedAt;

  if (response.status < 200 || response.status >= 300) {
    throw new FetchError('HTTP_ERROR', `Endpoint returned HTTP ${response.status}`, {
      status: response.status,
      responseTimeMs,
    });
  }

  const contentType = String(response.headers['content-type'] ?? '');
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new FetchError(
      'BAD_CONTENT_TYPE',
      `Expected a JSON response (Content-Type: application/json), got "${contentType || '(none)'}"`,
      { status: response.status, contentType, responseTimeMs }
    );
  }

  let json;
  try {
    json = JSON.parse(response.data);
  } catch {
    throw new FetchError('INVALID_JSON', 'Response Content-Type was JSON but the body did not parse', {
      status: response.status,
      responseTimeMs,
    });
  }

  return { json, status: response.status, responseTimeMs };
}

function classifyAxiosError(err, timeoutMs, maxBytes) {
  if (err.code === 'ECONNABORTED') {
    return new FetchError('TIMEOUT', `No response within ${timeoutMs}ms`, { cause: err.message });
  }
  if (err.code === 'ERR_FR_TOO_MANY_REDIRECTS' || err.response?.status === 302 || /redirect/i.test(err.message)) {
    return new FetchError('REDIRECT_NOT_FOLLOWED', 'Endpoint returned a redirect; point the monitor at the final URL', {
      cause: err.message,
    });
  }
  if (/maxContentLength|maxBodyLength/i.test(err.message)) {
    return new FetchError('TOO_LARGE', `Response exceeded the ${maxBytes}-byte limit`, { cause: err.message });
  }
  return new FetchError('NETWORK_ERROR', err.message || 'Request failed', { cause: err.code ?? err.message });
}