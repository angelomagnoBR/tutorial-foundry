// Guia da Mesa — painel flutuante (narrador: apontar; jogador: ajuda)
import { t, esc, html, emit, getSetting, setSetting, toast } from "./util.js";
import { pointLive, clearLive } from "./live.js";
import { TourManager } from "./editor.js";
import { TourRunner } from "./tour-runner.js";
import { getTours, completionStatus } from "./store.js";

let dock = null;
let lastHelp = 0;

export function renderDock() {
  dock?.remove();
  dock = null;
  const gm = game.user.isGM;
  if (gm && !getSetting("showDockGM")) return;
  if (!gm && !getSetting("playerHelpButton")) return;

  dock = html(`
    <div id="gdm-dock" class="${gm ? "gdm-dock-gm" : "gdm-dock-player"}">
      <span class="gdm-grip" data-tooltip="${t("Dock.Drag")}"><i class="fa-solid fa-grip-vertical"></i></span>
      ${gm ? `
        <button type="button" data-act="point" data-tooltip="${t("Dock.Point")}"><i class="fa-solid fa-location-crosshairs"></i><span>${t("Dock.PointShort")}</span></button>
        <button type="button" data-act="area" data-tooltip="${t("Dock.Area")}"><i class="fa-regular fa-square"></i></button>
        <button type="button" data-act="clear" data-tooltip="${t("Dock.Clear")}"><i class="fa-solid fa-eraser"></i></button>
        <span class="gdm-sep"></span>
        <button type="button" data-act="manager" data-tooltip="${t("Dock.Manager")}"><i class="fa-solid fa-signs-post"></i></button>
      ` : `
        <button type="button" data-act="help" data-tooltip="${t("Dock.Help")}"><i class="fa-solid fa-circle-question"></i><span>${t("Dock.HelpShort")}</span></button>
        <button type="button" data-act="call" data-tooltip="${t("Dock.Call")}"><i class="fa-solid fa-hand"></i></button>
      `}
    </div>`);
  document.body.append(dock);
  placeDock();

  dock.addEventListener("click", (ev) => {
    const act = ev.target.closest("[data-act]")?.dataset.act;
    switch (act) {
      case "point": pointLive("element"); break;
      case "area": pointLive("area"); break;
      case "clear": clearLive({ broadcast: true }); toast(t("Dock.Cleared"), "fa-solid fa-eraser"); break;
      case "manager": TourManager.open(); break;
      case "help": toggleHelpMenu(); break;
      case "call": {
        if (Date.now() - lastHelp < 8000) return toast(t("Dock.CallWait"), "fa-solid fa-hourglass-half");
        lastHelp = Date.now();
        emit({ action: "help" });
        toast(t("Dock.Called"), "fa-solid fa-hand");
        break;
      }
    }
  });
  dragDock();
}

function placeDock() {
  const pos = getSetting("dockPosition");
  const W = window.innerWidth, H = window.innerHeight;
  const r = dock.getBoundingClientRect();
  let x, y;
  if (pos?.x != null) { x = pos.x * W; y = pos.y * H; }
  else {
    const sb = document.getElementById("sidebar")?.getBoundingClientRect();
    x = (sb?.left ?? W) - r.width - 16;
    y = H - r.height - 14;
  }
  dock.style.left = `${Math.min(Math.max(x, 4), W - r.width - 4)}px`;
  dock.style.top = `${Math.min(Math.max(y, 4), H - r.height - 4)}px`;
}

function dragDock() {
  const grip = dock.querySelector(".gdm-grip");
  grip.addEventListener("mousedown", (ev) => {
    ev.preventDefault();
    const r = dock.getBoundingClientRect();
    const dx = ev.clientX - r.left, dy = ev.clientY - r.top;
    dock.classList.add("gdm-dragging");
    const move = (e) => {
      dock.style.left = `${Math.min(Math.max(e.clientX - dx, 4), window.innerWidth - r.width - 4)}px`;
      dock.style.top = `${Math.min(Math.max(e.clientY - dy, 4), window.innerHeight - r.height - 4)}px`;
    };
    const up = () => {
      dock.classList.remove("gdm-dragging");
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      const nr = dock.getBoundingClientRect();
      setSetting("dockPosition", { x: nr.left / window.innerWidth, y: nr.top / window.innerHeight });
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  });
}

function toggleHelpMenu() {
  const old = document.getElementById("gdm-help-menu");
  if (old) return old.remove();
  const tours = getTours().filter((tr) => tr.showInHelp && tr.steps?.length);
  const menu = html(`
    <div id="gdm-help-menu" class="gdm-popover">
      <h4><i class="fa-solid fa-graduation-cap"></i>${t("Help.Title")}</h4>
      ${tours.length ? tours.map((tr) => {
        const st = completionStatus(game.user, tr.id);
        return `<button type="button" class="gdm-help-item" data-id="${tr.id}">
          <i class="${esc(tr.icon || "fa-solid fa-compass")}"></i>
          <span><b>${esc(tr.name)}</b>${tr.description ? `<small>${esc(tr.description)}</small>` : ""}</span>
          ${st === "done" ? `<i class="fa-solid fa-circle-check gdm-ok"></i>` : `<i class="fa-solid fa-play gdm-go"></i>`}
        </button>`;
      }).join("") : `<p class="gdm-muted">${t("Help.Empty")}</p>`}
    </div>`);
  document.body.append(menu);
  const r = dock.getBoundingClientRect();
  const mh = menu.offsetHeight, mw = menu.offsetWidth;
  const top = r.top - mh - 10 > 8 ? r.top - mh - 10 : r.bottom + 10;
  menu.style.top = `${top}px`;
  menu.style.left = `${Math.min(Math.max(r.left, 8), window.innerWidth - mw - 8)}px`;
  requestAnimationFrame(() => menu.classList.add("gdm-in"));
  menu.addEventListener("click", (ev) => {
    const id = ev.target.closest("[data-id]")?.dataset.id;
    if (!id) return;
    menu.remove();
    TourRunner.start(getTours().find((x) => x.id === id));
  });
  const away = (ev) => {
    if (menu.contains(ev.target) || dock?.contains(ev.target)) return;
    menu.remove();
    document.removeEventListener("mousedown", away, true);
  };
  document.addEventListener("mousedown", away, true);
}

export function onResize() { if (dock) placeDock(); }
