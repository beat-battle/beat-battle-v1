/**
 * VoteSelectionScreen — vote for best beat (not self) after unlock time.
 */
import { mountAuthCornerLeave } from "../authCorner.js";
import { playSfxMajor } from "../sfx.js";
import { mountResultsScreen } from "./results.js";

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function mountVoteSelectionScreen(root, ctx) {
  mountAuthCornerLeave(ctx);

  const wsSock = ctx.mpWs;
  const playerId = ctx.playerId;
  const beats = ctx.beats || [];
  const unlock = ctx.votesUnlockAt ?? 0;
  let preserveWs = false;
  let unlockInterval = 0;

  const targets = beats.filter((b) => b.player_id !== playerId);

  const renderLocked = () => {
    root.innerHTML = `
      <div class="screen vote arcade-panel">
        <h2 class="arcade-heading">VOTE</h2>
        <p class="arcade-hint">Votes unlock after the slideshow finishes…</p>
      </div>
    `;
  };

  const renderVote = () => {
    if (unlockInterval) {
      clearInterval(unlockInterval);
      unlockInterval = 0;
    }
    if (targets.length === 0) {
      root.innerHTML = `
        <div class="screen vote arcade-panel">
          <h2 class="arcade-heading">VOTE</h2>
          <p class="arcade-hint">No other beats to vote for.</p>
        </div>
      `;
      return;
    }
    const cards = targets
      .map(
        (b) => `
      <button type="button" class="vote-card arcade-btn arcade-btn-fire" data-target="${escapeHtml(b.player_id)}">
        ${escapeHtml(b.name)}
      </button>
    `,
      )
      .join("");
    root.innerHTML = `
      <div class="screen vote arcade-panel">
        <h2 class="arcade-heading">Vote for the best beat</h2>
        <p class="arcade-hint">Not your own track</p>
        <div class="vote-cards">${cards}</div>
        <p class="arcade-error" id="vote-err"></p>
      </div>
    `;
    root.querySelectorAll("[data-target]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tid = btn.getAttribute("data-target");
        if (!tid) return;
        playSfxMajor();
        wsSock.send(JSON.stringify({ type: "vote_cast", target_player_id: tid }));
        const err = root.querySelector("#vote-err");
        if (err) err.textContent = "Vote sent…";
      });
    });
  };

  if (Date.now() / 1000 >= unlock) {
    renderVote();
  } else {
    renderLocked();
    unlockInterval = window.setInterval(() => {
      if (Date.now() / 1000 >= unlock) {
        clearInterval(unlockInterval);
        unlockInterval = 0;
        renderVote();
      }
    }, 400);
  }

  const onMessage = (ev) => {
    let m;
    try {
      m = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (m.type === "error") {
      const err = root.querySelector("#vote-err");
      if (err) err.textContent = m.message || "Error";
    }
    if (m.type === "results") {
      preserveWs = true;
      ctx.navigate(mountResultsScreen, { mpWs: wsSock, results: m });
    }
  };
  wsSock.onmessage = onMessage;

  return () => {
    if (unlockInterval) clearInterval(unlockInterval);
    root.innerHTML = "";
    if (!preserveWs) {
      try {
        wsSock.close();
      } catch {
        /* ignore */
      }
    }
  };
}
