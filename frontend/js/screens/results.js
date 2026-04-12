/**
 * ResultsScreen — winner, leaderboard, replay grid with waveforms.
 */
import { authHeadersMultipart, fetchMe } from "../authApi.js";
import { getApiBase } from "../apiOrigin.js";
import { mountAuthCornerLeave } from "../authCorner.js";
import { RANK_BASELINE_KEY, RANK_PENDING_KEY } from "../rankUi.js";
import { playSfxMinor } from "../sfx.js";

function getWaveSurfer() {
  const g = globalThis;
  if (g.WaveSurfer && typeof g.WaveSurfer.create === "function") return g.WaveSurfer;
  throw new Error("WaveSurfer not loaded");
}

/**
 * @param {HTMLElement} waveWrap
 * @param {HTMLAudioElement} audio
 */
function bindWaveformPlayback(waveWrap, audio) {
  let clickFull = false;
  audio.addEventListener("ended", () => {
    clickFull = false;
  });
  waveWrap.addEventListener("click", (e) => {
    e.preventDefault();
    if (!audio.src) return;
    clickFull = true;
    audio.currentTime = 0;
    audio.play().catch(() => {});
  });
  waveWrap.addEventListener("mouseenter", () => {
    if (!audio.src) return;
    if (clickFull) return;
    audio.currentTime = 0;
    audio.play().catch(() => {});
  });
  waveWrap.addEventListener("mouseleave", () => {
    if (clickFull) return;
    audio.pause();
    audio.currentTime = 0;
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function mountResultsScreen(root, ctx) {
  mountAuthCornerLeave(ctx);

  const wsSock = ctx.mpWs;
  const r = ctx.results || {};
  const winners = r.winners || [];
  const board = r.leaderboard || [];
  const beats = Array.isArray(r.beats) ? r.beats : [];
  const playerId = ctx.playerId ? String(ctx.playerId) : "";
  const apiBase = getApiBase();

  const winnerBlock =
    winners.length > 0
      ? `<div class="results-winner">WINNER<br/><span class="results-winner-name">${escapeHtml(
          winners.join(" · "),
        )}</span></div>`
      : `<p class="arcade-hint">No winner this round.</p>`;

  const rows = board
    .map(
      (row, i) => `
    <div class="results-row">
      <span class="results-rank">${i + 1}.</span>
      <span class="results-name">${escapeHtml(row.name)}</span>
      <span class="results-votes">${row.votes}</span>
    </div>
  `,
    )
    .join("");

  const beatsSection =
    beats.length > 0 && playerId
      ? `
      <section class="results-beats-section" aria-label="Replay beats">
        <p class="results-beats-hint">Beats — hover or click waveform to replay</p>
        <div class="grid results-beat-grid" id="results-beat-grid"></div>
      </section>
    `
      : beats.length > 0
        ? `<p class="arcade-hint results-beats-miss">Sign in required to replay beats.</p>`
        : "";

  root.innerHTML = `
    <div class="screen results arcade-panel">
      <h2 class="arcade-heading">RESULTS</h2>
      ${winnerBlock}
      <div class="results-board">${rows}</div>
      ${beatsSection}
      <button type="button" class="arcade-btn arcade-btn-primary" id="results-home">Main menu</button>
    </div>
  `;

  /** @type {{ destroy: () => void }[]} */
  const waveCleanups = [];
  /** @type {string[]} */
  const objectUrls = [];

  const gridEl = root.querySelector("#results-beat-grid");

  const revealGrid = () => {
    if (!gridEl) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        gridEl.classList.add("results-beat-grid--reveal");
      });
    });
  };

  if (beats.length > 0 && playerId && gridEl) {
    let pending = beats.length;

    const oneDone = () => {
      pending -= 1;
      if (pending <= 0) revealGrid();
    };

    beats.forEach((b, i) => {
      const pid = String(b.player_id ?? "");
      const name = String(b.name ?? pid);
      const path = String(b.url ?? "");
      if (!path) {
        oneDone();
        return;
      }

      const card = document.createElement("article");
      card.className = "card results-beat-card";
      card.style.setProperty("--stagger", String(i));

      const head = document.createElement("div");
      head.className = "card-head";
      const title = document.createElement("h2");
      title.className = "card-title";
      title.textContent = name;

      head.appendChild(title);

      const waveWrap = document.createElement("div");
      waveWrap.className = "waveform-wrap empty";
      waveWrap.textContent = "…";

      const audio = document.createElement("audio");
      audio.preload = "auto";
      bindWaveformPlayback(waveWrap, audio);

      card.append(head, waveWrap, audio);
      gridEl.appendChild(card);

      const fullUrl = `${apiBase}${path}?requester=${encodeURIComponent(playerId)}`;

      void (async () => {
        try {
          const res = await fetch(fullUrl, { headers: authHeadersMultipart() });
          if (!res.ok) throw new Error(String(res.status));
          const blob = await res.blob();
          const objUrl = URL.createObjectURL(blob);
          objectUrls.push(objUrl);
          audio.src = objUrl;

          waveWrap.textContent = "";
          waveWrap.classList.remove("empty");

          const WaveSurfer = getWaveSurfer();
          const wsur = WaveSurfer.create({
            container: waveWrap,
            height: 72,
            waveColor: "#b01010",
            progressColor: "#ffffff",
            cursorWidth: 0,
            interact: false,
            url: objUrl,
          });
          waveCleanups.push({
            destroy: () => {
              try {
                wsur.destroy();
              } catch {
                /* ignore */
              }
            },
          });
        } catch {
          waveWrap.textContent = "—";
          waveWrap.classList.add("empty");
        } finally {
          oneDone();
        }
      })();
    });
  }

  root.querySelector("#results-home")?.addEventListener("click", async () => {
    playSfxMinor();
    try {
      wsSock.close();
    } catch {
      /* ignore */
    }
    const before = Number(sessionStorage.getItem(RANK_BASELINE_KEY) || "0");
    try {
      const me = await fetchMe();
      const after = Number(me.rank_index ?? 0);
      if (after > before && me.rank) {
        sessionStorage.setItem(
          RANK_PENDING_KEY,
          JSON.stringify({
            label: me.rank.label,
            abbrev: me.rank.abbrev,
            color: me.rank.color,
          }),
        );
      }
    } catch {
      /* ignore */
    }
    sessionStorage.removeItem(RANK_BASELINE_KEY);
    import("./modeSelect.js").then((m) => ctx.navigate(m.mountModeSelectScreen));
  });

  return () => {
    waveCleanups.forEach((c) => c.destroy());
    waveCleanups.length = 0;
    objectUrls.forEach((u) => URL.revokeObjectURL(u));
    objectUrls.length = 0;
    root.innerHTML = "";
    try {
      wsSock.close();
    } catch {
      /* ignore */
    }
  };
}
