/**
 * Resolution: sessionStorage beatBattleApiBase → port 8000 (local uvicorn) →
 * meta cookup-api (or beat-battle-api) if set → window.location.origin (e.g. Render).
 *
 * Override API: sessionStorage.setItem("beatBattleApiBase", "https://api.example.com"); location.reload();
 */
function readMetaApiBase() {
  const el =
    document.querySelector('meta[name="cookup-api"]') ||
    document.querySelector('meta[name="beat-battle-api"]');
  const c = el?.getAttribute("content")?.trim();
  return c && c.length > 0 ? c.replace(/\/$/, "") : "";
}

export function getApiBase() {
  const fromStorage = sessionStorage.getItem("beatBattleApiBase")?.trim();
  if (fromStorage) return fromStorage.replace(/\/$/, "");
  if (window.location.port === "8000") {
    return window.location.origin;
  }
  const fromMeta = readMetaApiBase();
  if (fromMeta) return fromMeta;
  return window.location.origin;
}

/** Must match authApi.js TOKEN_KEY (avoid importing authApi here — circular). */
const WS_TOKEN_KEY = "cookup_token";

/** WebSocket URL for multiplayer (same host as API); appends JWT query param when logged in. */
export function getWsUrl() {
  const u = new URL(getApiBase());
  const proto = u.protocol === "https:" ? "wss:" : "ws:";
  const base = `${proto}//${u.host}/ws`;
  try {
    const t = localStorage.getItem(WS_TOKEN_KEY)?.trim();
    if (t) return `${base}?token=${encodeURIComponent(t)}`;
  } catch {
    /* ignore */
  }
  return base;
}
