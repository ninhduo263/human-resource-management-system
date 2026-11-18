export async function apiRequest<T = any>(
  path: string,
  body?: Record<string, any> | null,
  method: string = body ? 'POST' : 'GET'
): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const err = new Error(data?.error || 'Không thể xử lý yêu cầu.') as Error & {
      status?: number;
    };
    err.status = res.status;
    throw err;
  }

  return data as T;
}
