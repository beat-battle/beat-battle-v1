/**
 * Beatbucks shop — profile icons (preview only while “Coming soon” overlay is active).
 */
import { isLoggedIn } from "../authApi.js";
import { setAppErrorContext } from "../errorToast.js";
import { fetchShopCatalog } from "../shopApi.js";
import { mountAuthCornerGuest, mountAuthCornerMenu } from "../authCorner.js";
import { playSfxMinor } from "../sfx.js";
import { mountModeSelectScreen } from "./modeSelect.js";

const BEATBUCKS_ICON_SRC = new URL(
  "../../imgs/icons/beatbucks.png",
  import.meta.url,
).href;

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function mountShopScreen(root, ctx) {
  setAppErrorContext({ screen: "Shop", phase: "Catalog" });

  root.innerHTML = `
    <div class="screen shop-screen arcade-panel screen--vert-center">
      <div class="screen-topbar">
        <button type="button" class="arcade-back" id="shop-back" aria-label="Back">&lt;</button>
        <h2 class="arcade-heading screen-topbar-title">SHOP</h2>
        <span class="screen-topbar-spacer" aria-hidden="true"></span>
      </div>
      <p class="arcade-status" id="shop-status">Loading…</p>
      <div class="shop-scroll-wrap">
        <div class="shop-body" id="shop-body" inert aria-hidden="true">
          <section class="shop-section" aria-labelledby="shop-section-profile-icons">
            <h3 class="shop-section-title" id="shop-section-profile-icons">Profile icons</h3>
            <div class="shop-profile-icons-row" id="shop-icons-row"></div>
          </section>
        </div>
        <div class="shop-coming-soon-overlay" id="shop-coming-soon-overlay">
          <p class="shop-coming-soon-text" aria-live="polite">Coming soon</p>
        </div>
      </div>
    </div>
  `;

  if (isLoggedIn()) {
    mountAuthCornerMenu(ctx, { primary: "home" });
  } else {
    mountAuthCornerGuest(ctx, { showHome: true });
  }

  const statusEl = root.querySelector("#shop-status");
  const rowEl = root.querySelector("#shop-icons-row");
  const bodyEl = root.querySelector("#shop-body");

  root.querySelector("#shop-back")?.addEventListener("click", () => {
    playSfxMinor();
    ctx.navigate(mountModeSelectScreen);
  });

  fetchShopCatalog()
    .then((items) => {
      if (statusEl) statusEl.textContent = "";
      if (!rowEl) return;
      rowEl.innerHTML = (items || [])
        .map((item) => {
          const emoji = escapeHtml(item.emoji ?? "");
          const price = Number(item.price ?? 0);
          return `
            <div class="shop-icon-tile" data-icon-key="${escapeHtml(item.icon_key ?? "")}">
              <span class="shop-icon-tile-emoji" aria-hidden="true">${emoji}</span>
              <div class="shop-icon-tile-price">
                <span class="shop-icon-tile-price-num">${price}</span>
                <img src="${BEATBUCKS_ICON_SRC}" alt="" class="beatbucks-inline-icon shop-icon-tile-bb" width="16" height="16" decoding="async" />
              </div>
            </div>`;
        })
        .join("");
    })
    .catch(() => {
      if (statusEl) statusEl.textContent = "Could not load shop.";
    });

  return () => {
    root.innerHTML = "";
    if (bodyEl) bodyEl.removeAttribute("inert");
  };
}
