// Coloque este arquivo NO MESMO PASTA do index.tsx
// Importa a base da API do .env do Vercel
const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

if (!API_BASE) {
  // Ajuda a diagnosticar se a env não foi configurada
  console.warn("VITE_API_BASE_URL não está definida. Configure no Vercel!");
}

type Json = Record<string, any>;

async function request<T = any>(
  path: string,
  opts: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, opts);
  const isJson = (res.headers.get("content-type") || "").includes("application/json");
  const data = isJson ? await res.json() : (null as any);

  if (!res.ok) {
    const msg = (data && (data.detail || data.message)) || `HTTP ${res.status}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return data as T;
}

// ===== Auth
export async function login(email: string, password: string): Promise<{ access_token: string; token_type: string; }> {
  return request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

// ===== Users (opcional, depende do seu backend)
export async function listUsers(token: string): Promise<any[]> {
  return request("/api/users", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

// ===== Locations
export async function listLocations(token: string): Promise<any[]> {
  return request("/api/locations", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function createLocation(
  token: string,
  payload: { city: string; name: string; area: number; lat?: number; lng?: number }
): Promise<any> {
  const body: Json = { city: payload.city, name: payload.name, area: payload.area };
  if (typeof payload.lat === "number" && typeof payload.lng === "number") {
    body.lat = payload.lat;
    body.lng = payload.lng;
  }
  return request("/api/locations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

// ===== Records
export async function listRecords(token: string): Promise<any[]> {
  return request("/api/records", {
    headers: { Authorization: `Bearer ${token}` },
  });
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
    start_time: string;
    end_time: string;
  }
): Promise<any> {
  return request("/api/records", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

export type PhotoPhase = "BEFORE" | "AFTER";

export async function uploadPhotos(
  token: string,
  recordId: number,
  phase: PhotoPhase,
  files: File[]
): Promise<any[]> {
  const form = new FormData();
  form.append("phase", phase);
  files.forEach((f) => form.append("files", f, f.name));

  const url = `${API_BASE}/api/records/${recordId}/photos`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const data = await res.json();
  if (!res.ok) {
    const msg = (data && (data.detail || data.message)) || `HTTP ${res.status}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return data;
}