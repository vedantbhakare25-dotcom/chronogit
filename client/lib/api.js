const EXPRESS_BASE_URL = process.env.EXPRESS_API_URL || 'http://localhost:4000';
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET || '';

export async function expressFetch(path, { userId, method = 'GET', body = null } = {}) {
  if (!INTERNAL_SECRET && process.env.NODE_ENV === 'production') {
    throw new Error('INTERNAL_API_SECRET is required in production');
  }
  const headers = {
    'Content-Type': 'application/json',
    'x-internal-secret': INTERNAL_SECRET,
  };

  if (userId) {
    headers['x-user-id'] = userId;
  }

  const options = {
    method,
    headers,
    cache: 'no-store',
  };

  if (body !== null && body !== undefined) {
    options.body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(`${EXPRESS_BASE_URL}${path}`, options);
  } catch (cause) {
    const error = new Error('Could not reach the API server');
    error.cause = cause;
    error.status = 503;
    throw error;
  }
  
  if (res.status === 204) return null;

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const error = new Error(data?.error || `Request failed with status ${res.status}`);
    error.status = res.status;
    error.details = data?.details;
    throw error;
  }

  return data;
}
