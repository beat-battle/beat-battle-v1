/**
 * Rank badge HTML + sessionStorage keys for rank-up popups.
 */

export const RANK_BASELINE_KEY = "cookup_match_rank_index";
export const RANK_PENDING_KEY = "cookup_pending_rank_up";

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Small tag next to a name — rank comes from /me or lobby payload. */
export function rankBadgeHtml(rank) {
  if (!rank || !rank.abbrev) return "";
  const c = String(rank.color || "#fff").replace(/[<>'"]/g, "");
  return ` <span class="rank-badge" style="color:${c}">${escapeHtml(rank.abbrev)}</span>`;
}

export function showRankUpOverlay(payload) {
  const label = payload?.label || "New rank";
  const abbrev = payload?.abbrev || "";
  const color = String(payload?.color || "#cd7f32").replace(/[<>'"]/g, "");

  const wrap = document.createElement("div");
  wrap.className = "rank-up-overlay";
  wrap.setAttribute("role", "dialog");
  wrap.setAttribute("aria-modal", "true");
  wrap.setAttribute("aria-label", "Rank unlocked");
  wrap.innerHTML = `
    <div class="rank-up-card" style="--rank-up-accent: ${color}">
      <p class="rank-up-kicker">Rank unlocked</p>
      <p class="rank-up-title">${escapeHtml(label)}</p>
      <p class="rank-up-abbrev">${escapeHtml(abbrev)}</p>
      <button type="button" class="arcade-btn arcade-btn-primary rank-up-dismiss">OK</button>
    </div>
  `;

  const close = () => {
    wrap.classList.add("rank-up-overlay--out");
    window.setTimeout(() => wrap.remove(), 320);
  };

  wrap.addEventListener("click", (e) => {
    if (e.target === wrap) close();
  });
  wrap.querySelector(".rank-up-dismiss")?.addEventListener("click", close);

  document.body.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add("rank-up-overlay--in"));
}
