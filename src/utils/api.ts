let memoryToken: string | null = null;
let unauthorizedHandler: (() => void) | null = null;

const STORAGE_API_KEY = 'school_api_endpoint_v2';
const LEGACY_STORAGE_API_KEY = 'school_api_endpoint';

const ENV_API_BASE_URL = String(import.meta.env.VITE_API_BASE_URL || '')
  .trim()
  .replace(/\/+$/, '');

function normalizeEndpointUrl(raw: string): string {
  const cleaned = String(raw || '').trim();
  if (!cleaned) return '';
  return cleaned.replace(/\/+$/, '');
}

export function getApiEndpoint(): string {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (window.localStorage.getItem(LEGACY_STORAGE_API_KEY) !== null) {
        window.localStorage.removeItem(LEGACY_STORAGE_API_KEY);
      }
      if (window.location.search.includes('reset-api=1')) {
        window.localStorage.removeItem(STORAGE_API_KEY);
      }
      const saved = normalizeEndpointUrl(window.localStorage.getItem(STORAGE_API_KEY) || '');
      if (saved && window.location.protocol === 'https:' && /^http:\/\//i.test(saved)) {
        window.localStorage.removeItem(STORAGE_API_KEY);
        return '';
      }
      if (saved) return saved;
    }
  } catch {
    // ignore storage access errors
  }
  if (typeof window !== 'undefined' && window.location.protocol === 'https:' && /^http:\/\//i.test(ENV_API_BASE_URL)) {
    return '';
  }
  return ENV_API_BASE_URL;
}

export function setApiEndpoint(url: string): string {
  const normalized = normalizeEndpointUrl(url);
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (normalized) {
        window.localStorage.setItem(STORAGE_API_KEY, normalized);
      } else {
        window.localStorage.removeItem(STORAGE_API_KEY);
      }
    }
  } catch {
    // ignore storage access errors
  }
  return normalized;
}

export function isPhpEndpoint(endpoint: string = getApiEndpoint()): boolean {
  return /\.php(\?.*)?$/i.test(endpoint);
}

export function resolveApiUrl(url: string, overrideEndpoint?: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  const endpoint = overrideEndpoint !== undefined ? normalizeEndpointUrl(overrideEndpoint) : getApiEndpoint();
  if (!endpoint) {
    return url.replace(/^\/+/, '');
  }

  const [rawPath, rawQuery = ''] = url.split('?');
  if (isPhpEndpoint(endpoint)) {
    const cleanPath = rawPath.replace(/^\/+api(?=\/|$)/i, '');
    const route = cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`;
    const basePhp = endpoint.split('?')[0];
    return `${basePhp}?_route=${route}${rawQuery ? `&${rawQuery}` : ''}`;
  }

  const normalizedPath = url.startsWith('/') ? url : `/${url}`;
  return `${endpoint}${normalizedPath}`;
}

export function getWebSocketUrl(): string | null {
  const endpoint = getApiEndpoint();
  if (endpoint) {
    if (isPhpEndpoint(endpoint)) return null;
    try {
      const parsed = new URL(endpoint);
      const wsProto = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${wsProto}//${parsed.host}/ws`;
    } catch {
      return null;
    }
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

export async function testApiEndpoint(endpointUrl: string): Promise<{
  ok: boolean;
  resolvedUrl: string;
  latencyMs: number;
  message: string;
}> {
  const normalized = normalizeEndpointUrl(endpointUrl);
  const resolvedUrl = resolveApiUrl('/api/public/meta', normalized);

  if (
    typeof window !== 'undefined' &&
    window.location.protocol === 'https:' &&
    /^http:\/\//i.test(normalized)
  ) {
    return {
      ok: false,
      resolvedUrl,
      latencyMs: 0,
      message:
        'Browser memblokir URL "http://" dari halaman "https://" (Mixed Content). Aktifkan SSL (https://) pada domain API PHP Anda atau buka aplikasi melalui http://.',
    };
  }

  const startedAt = Date.now();
  try {
    const res = await fetch(resolvedUrl, { method: 'GET' });
    const latencyMs = Date.now() - startedAt;
    const text = await res.text();
    let parsed: Record<string, unknown> = {};
    if (!text.trim()) {
      return {
        ok: false,
        resolvedUrl,
        latencyMs,
        message: `Endpoint merespons HTTP ${res.status} tetapi isinya kosong (0 byte). Pastikan backend server API berjalan dengan benar.`,
      };
    }
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return {
        ok: false,
        resolvedUrl,
        latencyMs,
        message: `Endpoint merespons status HTTP ${res.status} tetapi bukan format JSON API yang valid.`,
      };
    }

    if (!res.ok) {
      const msg = typeof parsed.message === 'string' ? parsed.message : `HTTP ${res.status}`;
      return {
        ok: false,
        resolvedUrl,
        latencyMs,
        message: `Gagal terhubung (${res.status}): ${msg}`,
      };
    }

    const sekolah =
      parsed.pengaturan && typeof parsed.pengaturan === 'object'
        ? String((parsed.pengaturan as { namaSekolah?: string }).namaSekolah || '')
        : '';

    return {
      ok: true,
      resolvedUrl,
      latencyMs,
      message: `Berhasil terhubung ke ${normalized || 'Server Default'} (${latencyMs} ms${sekolah ? ` · ${sekolah}` : ''}).`,
    };
  } catch (err) {
    return {
      ok: false,
      resolvedUrl,
      latencyMs: Date.now() - startedAt,
      message:
        err instanceof Error
          ? `Tidak dapat menjangkau endpoint (${err.message}). Pastikan server backend aktif, mengizinkan CORS, dan memakai HTTPS.`
          : 'Gagal menghubungi endpoint backend API.',
    };
  }
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function setAuthToken(token: string | null): void {
  memoryToken = token;
}

export function getAuthToken(): string | null {
  return memoryToken;
}

export function registerUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

export async function apiRequest<T = Record<string, unknown>>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (memoryToken) {
    headers.set('Authorization', `Bearer ${memoryToken}`);
    headers.set('X-Access-Token', memoryToken);
  }

  const targetUrl = resolveApiUrl(url);
  const activeEndpoint = getApiEndpoint();

  if (
    typeof window !== 'undefined' &&
    window.location.protocol === 'https:' &&
    /^http:\/\//i.test(targetUrl)
  ) {
    throw new ApiError(
      `Browser memblokir akses ke "${activeEndpoint}" karena halaman ini menggunakan HTTPS sedangkan API menggunakan HTTP.`,
      0
    );
  }

  let res: Response;
  try {
    res = await fetch(targetUrl, { ...options, headers });
  } catch {
    throw new ApiError(
      activeEndpoint
        ? `Gagal terhubung ke "${activeEndpoint}". Pastikan server backend aktif dan mendukung HTTPS.`
        : 'Gagal menghubungi server backend API. Pastikan server aktif dan koneksi internet stabil.',
      0
    );
  }

  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    if (res.status === 404) {
      throw new ApiError(
        'Server backend API tidak ditemukan (404). Pastikan server backend aktif.',
        404
      );
    }
    throw new ApiError(`Respons server tidak valid (${res.status})`, res.status);
  }

  if (!res.ok) {
    const errObj = data as { message?: string; error?: string };
    const message = errObj?.message || errObj?.error || `HTTP ${res.status}`;
    if (res.status === 401 && memoryToken) {
      unauthorizedHandler?.();
    }
    throw new ApiError(message, res.status);
  }

  return data as T;
}

export async function downloadProtectedFile(url: string, fallbackFileName: string): Promise<void> {
  const headers = new Headers();
  if (memoryToken) {
    headers.set('Authorization', `Bearer ${memoryToken}`);
    headers.set('X-Access-Token', memoryToken);
  }
  let res: Response;
  try {
    res = await fetch(resolveApiUrl(url), { headers });
  } catch {
    throw new Error('Gagal terhubung ke server untuk mengunduh berkas.');
  }
  if (!res.ok) {
    throw new Error('Gagal mengunduh berkas.');
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fallbackFileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}
