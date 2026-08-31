async function j(method, url, body) {
  const opts = { method, headers: {}, credentials: 'include' };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = new Error((data && data.error) || `${res.status} ${res.statusText}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export function isUnauthenticated(err) {
  return err?.status === 401 || err?.data?.code === 'UNAUTHENTICATED';
}

export const api = {
  get: (u) => j('GET', u),
  post: (u, b) => j('POST', u, b),
  put: (u, b) => j('PUT', u, b),
  del: (u) => j('DELETE', u),

  async parseFile(file) {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/parse', { method: 'POST', body: fd, credentials: 'include' });
    const data = await res.json();
    if (!res.ok) {
      const err = new Error(data.error || 'Parse failed');
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  },
};
