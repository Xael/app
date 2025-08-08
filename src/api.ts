// api.ts — MESMA pasta do index.tsx

// ===== Base =====
const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
if (!API_BASE) console.warn("VITE_API_BASE_URL não está definida no Vercel.");

type Json = Record<string, any>;

// Monta URL com path já normalizado
function urlJoin(path: string) {
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

async function request<T = any>(
  path: string,
  opts: RequestInit = {}
): Promise<T> {
  const res = await fetch(urlJoin(path), {
    ...opts,
  });

  const ctype = res.headers.get("content-type") || "";
  const isJson = ctype.includes("application/json");
  const data = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    const msg =
      (data && (data.detail || data.message)) ||
      `HTTP ${res.status} ${res.statusText}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return (data as T) ?? (undefined as any);
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

// ===== Tipos =====
export type Role = "ADMIN" | "OPERATOR" | "FISCAL";

export type ApiUser = {
  id: number;
  email: string;
  role: Role;
  assigned_city?: string | null;
  username?: string | null; // se seu backend tiver
  created_at?: string;
};

export type ApiLocation = {
  id: number;
  city: string;
  name: string;
  area: number;
  lat?: number | null;
  lng?: number | null;
  created_at?: string;
};

export type ApiRecord = {
  id: number;
  operator_id: number;
  operator_name?: string;
  service_type: string;
  location_id?: number | null;
  location_name: string;
  location_city?: string | null;
  location_area?: number | null;
  gps_used: boolean;
  start_time: string; // ISO
  end_time: string;   // ISO
  before_photos?: string[]; // URLs
  after_photos?: string[];  // URLs
  created_at?: string;
};

export type PhotoPhase = "BEFORE" | "AFTER";

// ===== Auth =====
export async function login(
  email: string,
  password: string
): Promise<{ access_token: string; token_type: "bearer" }> {
  return request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

// (opcional) Quem sou eu
export async function me(token: string): Promise<ApiUser> {
  return request("/api/auth/me", {
    headers: { ...auth(token) },
  });
}

// ===== Users =====
export async function listUsers(token: string): Promise<ApiUser[]> {
  return request("/api/users", { headers: { ...auth(token) } });
}

export async function createUser(
  token: string,
  payload: { email: string; password: string; role: Role; assigned_city?: string }
): Promise<ApiUser> {
  return request("/api/users", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...auth(token) },
    body: JSON.stringify(payload),
  });
}

export async function updateUser(
  token: string,
  id: number,
  payload: Partial<{ email: string; password: string; role: Role; assigned_city?: string }>
): Promise<ApiUser> {
  return request(`/api/users/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...auth(token) },
    body: JSON.stringify(payload),
  });
}

export async function deleteUser(token: string, id: number): Promise<{ ok: true }> {
  return request(`/api/users/${id}`, {
    method: "DELETE",
    headers: { ...auth(token) },
  });
}

// ===== Locations =====
export async function listLocations(token: string): Promise<ApiLocation[]> {
  return request("/api/locations", { headers: { ...auth(token) } });
}

export async function createLocation(
  token: string,
  payload: { city: string; name: string; area: number; lat?: number; lng?: number }
): Promise<ApiLocation> {
  const body: Json = { city: payload.city, name: payload.name, area: payload.area };
  if (typeof payload.lat === "number") body.lat = payload.lat;
  if (typeof payload.lng === "number") body.lng = payload.lng;

  return request("/api/locations", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...auth(token) },
    body: JSON.stringify(body),
  });
}

export async function updateLocation(
  token: string,
  id: number,
  payload: Partial<{ city: string; name: string; area: number; lat?: number; lng?: number }>
): Promise<ApiLocation> {
  return request(`/api/locations/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...auth(token) },
    body: JSON.stringify(payload),
  });
}

export async function deleteLocation(token: string, id: number): Promise<{ ok: true }> {
  return request(`/api/locations/${id}`, {
    method: "DELETE",
    headers: { ...auth(token) },
  });
}

// ===== Records =====
export async function listRecords(token: string): Promise<ApiRecord[]> {
  return request("/api/records", { headers: { ...auth(token) } });
}

export async function getRecord(token: string, id: number): Promise<ApiRecord> {
  return request(`/api/records/${id}`, { headers: { ...auth(token) } });
}

export async function createRecord(
  token: string,
  payload: {
    operator_id: number;
    service_type: string;
    location_id?: number;
    location_name?: string;
    location_city?: string;
    location_area?: number;
    gps_used: boolean;
    start_time: string; // ISO
    end_time: string;   // ISO
  }
): Promise<ApiRecord> {
  return request("/api/records", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...auth(token) },
    body: JSON.stringify(payload),
  });
}

export async function deleteRecord(token: string, id: number): Promise<{ ok: true }> {
  return request(`/api/records/${id}`, {
    method: "DELETE",
    headers: { ...auth(token) },
  });
}

// ===== Photos =====
// Envia arquivos reais (File/Blob) para o record
export async function uploadPhotos(
  token: string,
  recordId: number,
  phase: PhotoPhase,
  files: File[]
): Promise<{ urls: string[] } | any> {
  const form = new FormData();
  form.append("phase", phase);
  files.forEach((f) => form.append("files", f, f.name));

  const res = await fetch(urlJoin(`/api/records/${recordId}/photos`), {
    method: "POST",
    headers: { ...auth(token) }, // NÃO definir Content-Type manualmente
    body: form,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      (data && (data.detail || data.message)) || `HTTP ${res.status} ${res.statusText}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return data;
}

// Helper: transforma dataURL (base64) da câmera em File e manda pro backend
export async function uploadDataUrlsAsPhotos(
  token: string,
  recordId: number,
  phase: PhotoPhase,
  dataUrls: string[]
): Promise<any> {
  const files = dataUrls.map((d, idx) => dataURLtoFile(d, `photo_${phase.toLowerCase()}_${idx + 1}.jpg`));
  return uploadPhotos(token, recordId, phase, files);
}

// ===== Utils =====
export function parseJwt(token: string): any {
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(decodeURIComponent(escape(atob(base64))));
  } catch {
    return {};
  }
}

export function dataURLtoFile(dataUrl: string, filename: string): File {
  const [header, b64] = dataUrl.split(",");
  const mime = (header.match(/data:(.*?);/)?.[1]) || "image/jpeg";
  const binary = atob(b64);
  const len = binary.length;
  const u8arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) u8arr[i] = binary.charCodeAt(i);
  return new File([u8arr], filename, { type: mime });
}
