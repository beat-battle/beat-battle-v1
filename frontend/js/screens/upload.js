/**
 * UploadScreen — mp3/wav upload during upload phase.
 */
import { authHeadersMultipart } from "../authApi.js";
import { mountAuthCornerLeave } from "../authCorner.js";
import { playSfxMajor } from "../sfx.js";
import { mountVotingSlideshowScreen } from "./votingSlideshow.js";

export function mountUploadScreen(root, ctx) {
  const ws = ctx.mpWs;
  const playerId = ctx.playerId;
  const lobbyId = ctx.lobbyId;
  let preserveWs = false;

  mountAuthCornerLeave(ctx);

  root.innerHTML = `
    <div class="screen upload arcade-panel">
      <h2 class="arcade-heading">UPLOAD BEAT</h2>
      <p class="arcade-hint">MP3 or WAV · max 15MB</p>
      <form id="upload-form" class="upload-form">
        <input type="file" id="beat-file" accept=".mp3,.wav,audio/mpeg,audio/wav" required />
        <button type="submit" class="arcade-btn arcade-btn-primary" id="upload-submit">Upload</button>
      </form>
      <p class="arcade-status" id="upload-status"></p>
    </div>
  `;

  const form = root.querySelector("#upload-form");
  const statusEl = root.querySelector("#upload-status");

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = root.querySelector("#beat-file");
    const file = input?.files?.[0];
    if (!file) return;
    playSfxMajor();
    if (statusEl) statusEl.textContent = "Uploading…";
    const fd = new FormData();
    fd.append("player_id", playerId);
    fd.append("file", file);
    try {
      const res = await fetch(`${ctx.apiBase}/upload/beat/${encodeURIComponent(lobbyId)}`, {
        method: "POST",
        headers: authHeadersMultipart(),
        body: fd,
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || res.statusText);
      }
      if (statusEl) statusEl.textContent = "Uploaded. Waiting for others…";
    } catch (err) {
      if (statusEl)
        statusEl.textContent = err instanceof Error ? err.message : "Upload failed";
    }
  });

  const onMessage = (ev) => {
    let m;
    try {
      m = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (m.type === "voting_start") {
      preserveWs = true;
      ctx.navigate(mountVotingSlideshowScreen, {
        mpWs: ws,
        playerId,
        lobbyId: ctx.lobbyId,
        beats: m.beats || [],
        votesUnlockAt: m.votes_unlock_at,
      });
    }
  };
  ws.onmessage = onMessage;

  return () => {
    root.innerHTML = "";
    if (!preserveWs) {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    }
  };
}
