import type { BoardState } from '../model';

export interface SignedInUser { id: number; email: string }
export interface CloudSnapshot { board: BoardState | null; revision: number }
export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = 'ApiError'; }
}
async function json<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...init });
  } catch {
    throw new ApiError('Unable to reach My Tasker. Check your connection and try again.', 0);
  }
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof body === 'object' && body && 'detail' in body &&
      typeof body.detail === 'string' ? body.detail : 'Request failed. Please try again.';
    throw new ApiError(message, response.status);
  }
  return body as T;
}
export async function getSession(): Promise<SignedInUser | null> {
  try { return (await json<{user: SignedInUser}>('/api/auth/me/')).user; }
  catch (error) { if (error instanceof ApiError && error.status === 401) return null; throw error; }
}
export async function config(): Promise<{captcha_site_key: string}> {
  return json('/api/config/');
}
async function mutation<T>(url: string, body: unknown, method: 'POST' | 'PUT' | 'DELETE' = 'POST'): Promise<T> {
  const { csrf_token } = await json<{csrf_token: string}>('/api/auth/csrf/');
  return json<T>(url, {
    method, headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf_token },
    body: JSON.stringify(body)
  });
}
export const signup = (email: string, password: string, captcha_token: string) =>
  mutation<{detail: string}>('/api/auth/signup/',{email,password,captcha_token});
export const verifyOtp = (email: string, otp: string) =>
  mutation<{detail: string}>('/api/auth/verify-otp/',{email,otp});
export const resendOtp = (email: string) =>
  mutation<{detail: string}>('/api/auth/resend-otp/',{email});
export const login = async (email: string, password: string): Promise<SignedInUser> =>
  (await mutation<{user: SignedInUser}>('/api/auth/login/',{email,password})).user;
export const logout = () => mutation<{detail: string}>('/api/auth/logout/',{});
export const requestReset = (email: string) => mutation<{detail: string}>('/api/auth/request-password-reset/',{email});
export const resetPassword = (email: string, otp: string, password: string) =>
  mutation<{detail: string}>('/api/auth/reset-password/',{email,otp,password});
export const loadBoard = (): Promise<CloudSnapshot> => json('/api/board/');
export const saveBoard = (board: BoardState, revision: number) =>
  mutation<{revision: number}>('/api/board/',{board,revision},'PUT');
export const deleteAccount = (password: string) =>
  mutation<{detail: string}>('/api/account/',{password},'DELETE');
