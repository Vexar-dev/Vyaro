const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';

export interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
  requestId?: string;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { accessToken?: string } = {},
): Promise<ApiEnvelope<T>> {
  const { accessToken, ...rest } = options;
  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    credentials: 'include', // sends the HttpOnly refresh-token cookie
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(rest.headers ?? {}),
    },
  });
  return res.json();
}
