import type {
  TelegramAuthResponse,
  PublicUser,
  CreateNicknameRequest,
} from '@ml/shared';

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api';

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(body.message ?? 'Request failed');
  }
  return res.json() as Promise<T>;
}

export function authenticate(initData: string): Promise<TelegramAuthResponse> {
  return request<TelegramAuthResponse>('/auth/telegram', {
    method: 'POST',
    body: JSON.stringify({ initData }),
  });
}

export function createNickname(payload: CreateNicknameRequest): Promise<PublicUser> {
  return request<PublicUser>('/user/create-nickname', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
