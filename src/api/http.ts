export class ApiError extends Error {
  status: number;

  code: string | number;

  constructor(message: string, status: number, code: string | number = status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

interface ApiEnvelope<T> {
  code: string | number;
  data: T;
  message?: string;
}

const isSuccessCode = (code: string | number | undefined) => code === 'OK' || code === 0;

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type') && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(path.startsWith('/api/') ? path : `/api${path}`, {
    ...init,
    credentials: 'same-origin',
    headers,
  });

  const payload = (await response.json().catch((): null => null)) as ApiEnvelope<T> | null;
  if (!response.ok || !payload || !isSuccessCode(payload.code)) {
    throw new ApiError(
      payload?.message || `请求失败（${response.status}）`,
      response.status,
      payload?.code ?? response.status,
    );
  }
  return payload.data;
}

export const jsonBody = (value: unknown): Pick<RequestInit, 'body'> => ({
  body: JSON.stringify(value),
});

export const versionHeaders = (version: number): Pick<RequestInit, 'headers'> => ({
  headers: { 'If-Match': `"${version}"` },
});
