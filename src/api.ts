const API = import.meta.env.VITE_API_BASE_URL!;

async function j(r: Response) {
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

export async function login(email: string, password: string) {
  const r = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return j(r) as Promise<{ access_token: string }>;
}

export async function listUsers(token: string) {
  const r = await fetch(`${API}/api/users`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return j(r);
}

export async function listLocations(token: string) {
  const r = await fetch(`${API}/api/locations`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return j(r);
}

export async function createLocation(token: string, payload: {
  city: string; name: string; area?: number; lat?: number; lng?: number;
}) {
  const r = await fetch(`${API}/api/locations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  return j(r);
}

export async function listRecords(token: string, city?: string) {
  const r = await fetch(`${API}/api/records${city ? `?city=${encodeURIComponent(city)}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return j(r);
}

export async function createRecord(token: string, payload: {
  operator_id: number; service_type: string;
  location_id?: number; location_name?: string; location_city?: string; location_area?: number;
  gps_used?: boolean; start_time?: string; end_time?: string;
}) {
  const r = await fetch(`${API}/api/records`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  return j(r);
}

export async function uploadPhotos(token: string, recordId: number, phase: "BEFORE"|"AFTER", files: File[]) {
  const fd = new FormData();
  fd.append("phase", phase);
  files.forEach(f => fd.append("files", f));
  const r = await fetch(`${API}/api/records/${recordId}/photos`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  return j(r);
}