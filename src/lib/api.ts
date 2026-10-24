import { auth } from '../../firebaseConfig';

/** Same production API the web app uses when not on localhost. */
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL || 'https://feedecho-api.onrender.com/api';

type RequestOptions = {
  method?: string;
  body?: unknown;
  auth?: boolean;
  onUploadProgress?: (loaded: number, total: number) => void;
};

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export async function apiRequest<T = unknown>(path: string, options: RequestOptions = {}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (options.auth !== false) {
    const user = auth.currentUser;
    if (!user) {
      throw new ApiError('Not signed in', 401);
    }
    const token = await user.getIdToken();
    headers.Authorization = `Bearer ${token}`;
    headers['X-User-ID'] = user.uid;
  }

  const url = `${API_BASE_URL}${path}`;
  const method = options.method || (options.body ? 'POST' : 'GET');
  const bodyText = options.body !== undefined ? JSON.stringify(options.body) : undefined;

  if (options.onUploadProgress && bodyText) {
    return xhrJson<T>(url, method, headers, bodyText, options.onUploadProgress);
  }

  const response = await fetch(url, {
    method,
    headers,
    body: bodyText,
  });

  let data: any = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new ApiError(
      data?.error || data?.message || `Request failed (${response.status})`,
      response.status,
      data
    );
  }

  return data as T;
}

function xhrJson<T>(
  url: string,
  method: string,
  headers: Record<string, string>,
  bodyText: string,
  onUploadProgress: (loaded: number, total: number) => void
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    Object.entries(headers).forEach(([key, value]) => xhr.setRequestHeader(key, value));
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onUploadProgress(event.loaded, event.total);
    };
    xhr.onload = () => {
      let data: any = null;
      try {
        data = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        data = null;
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(
          new ApiError(
            data?.error || data?.message || `Request failed (${xhr.status})`,
            xhr.status,
            data
          )
        );
        return;
      }
      resolve(data as T);
    };
    xhr.onerror = () => reject(new ApiError('Network error', 0));
    xhr.send(bodyText);
  });
}
