// Thin client for the /api/storage serverless function backed by Vercel KV
// (Upstash Redis under the hood). Mirrors the get/set shape the app used
// against the Claude artifact's window.storage, so App.jsx stays simple.

export async function kvGet(key) {
  const res = await fetch(`/api/storage?key=${encodeURIComponent(key)}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.value ?? null;
}

export async function kvSet(key, value) {
  const res = await fetch("/api/storage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value }),
  });
  if (!res.ok) throw new Error("Storage write failed");
  return true;
}
