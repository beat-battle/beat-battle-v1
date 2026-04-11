/**
 * Beat Battle — screen router and shared context.
 */
import { getApiBase } from "./apiOrigin.js";
import { clearAuthCorner } from "./authCorner.js";
import { getUsername, isLoggedIn, validateSession } from "./authApi.js";
import { playSfxBeatBattle } from "./sfx.js";
import { mountModeSelectScreen } from "./screens/modeSelect.js";

function boot() {
  playSfxBeatBattle();

  const root = document.getElementById("app-root");
  if (!root) return;

  let unmount = null;

  /** @param {(el: HTMLElement, ctx: object) => () => void} mountFn */
  const navigate = (mountFn, extra = {}) => {
    if (unmount) unmount();
    clearAuthCorner();
    const ctx = {
      apiBase: getApiBase(),
      navigate,
      username: getUsername(),
      ...extra,
    };
    unmount = mountFn(root, ctx);
  };

  navigate(mountModeSelectScreen);

  if (isLoggedIn()) {
    void validateSession().then((ok) => {
      if (!ok) navigate(mountModeSelectScreen);
    });
  }
}

document.addEventListener("DOMContentLoaded", boot);
