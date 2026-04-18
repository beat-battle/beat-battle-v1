/**
 * Shop — catalog and purchases (server-authoritative beatbucks).
 */
import { getApiBase } from "./apiOrigin.js";
import { authHeaders } from "./authApi.js";

export async function fetchShopCatalog() {
  const base = getApiBase();
  const res = await fetch(`${base}/api/shop/catalog`);
  if (!res.ok) throw new Error((await res.text()) || res.statusText);
  return res.json();
}

/**
 * Requires login. Returns 403 until server sets COOKUP_SHOP_PURCHASES_ENABLED.
 * After success, call fetchMe() (or reload auth UI) so beatbucks balance stays in sync.
 */
export async function purchaseProfileIcon(iconKey) {
  const base = getApiBase();
  const res = await fetch(`${base}/api/me/shop/purchase`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ icon_key: iconKey }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const d = data.detail;
    throw new Error(
      typeof d === "string" ? d : res.statusText || "Purchase failed",
    );
  }
  return data;
}
