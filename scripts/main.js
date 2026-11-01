// Guia da Mesa — ponto de entrada
import { MODULE_ID, SOCKET, t, getSetting, applyTheme, toast, playChime, esc } from "./util.js";
import { getTour, getTours, completionStatus } from "./store.js";
import { TourRunner } from "./tour-runner.js";
import { TourManager } from "./editor.js";
import { pointLive, clearLive, receiveHighlight, receiveAck } from "./live.js";
import { renderDock, onResize } from "./dock.js";

Hooks.once("init", () => {
  const reg = (key, data) => game.settings.register(MODULE_ID, key, data);
  const rerender = () => renderDock();

  reg("tours", { scope: "world", config: false, type: Array, default: [], onChange: () => TourManager.refresh() });
  reg("accentColor", {
    name: "GDM.Settings.Accent.Name", hint: "GDM.Settings.Accent.Hint",
    scope: "world", config: true, type: String, default: "#e8b04b", onChange: applyTheme
  });
  reg("dimOpacity", {
    name: "GDM.Settings.Dim.Name", hint: "GDM.Settings.Dim.Hint",
    scope: "world", config: true, type: Number, range: { min: 0.3, max: 0.9, step: 0.05 }, default: 0.68, onChange: applyTheme
  });
  reg("playerHelpButton", {
    name: "GDM.Settings.HelpButton.Name", hint: "GDM.Settings.HelpButton.Hint",
    scope: "world", config: true, type: Boolean, default: true, onChange: rerender
  });
  reg("showDockGM", {
    name: "GDM.Settings.DockGM.Name", hint: "GDM.Settings.DockGM.Hint",
    scope: "client", config: true, type: Boolean, default: true, onChange: rerender
  });
  reg("echoToGM", {
    name: "GDM.Settings.Echo.Name", hint: "GDM.Settings.Echo.Hint",
    scope: "client", config: true, type: Boolean, default: true
  });
  reg("sound", {
    name: "GDM.Settings.Sound.Name", hint: "GDM.Settings.Sound.Hint",
    scope: "client", config: true, type: Boolean, default: true
  });
  reg("dockPosition", { scope: "client", config: false, type: Object, default: {} });
  reg("liveOptions", { scope: "client", config: false, type: Object, default: {} });

  game.keybindings.register(MODULE_ID, "point", {
    name: "GDM.Keys.Point", editable: [{ key: "KeyG", modifiers: ["Alt"] }],
    restricted: true, onDown: () => { pointLive("element"); return true; }
  });
  game.keybindings.register(MODULE_ID, "area", {
    name: "GDM.Keys.Area", editable: [{ key: "KeyG", modifiers: ["Alt", "Shift"] }],
    restricted: true, onDown: () => { pointLive("area"); return true; }
  });
  game.keybindings.register(MODULE_ID, "clear", {
    name: "GDM.Keys.Clear", editable: [],
    restricted: true, onDown: () => { clearLive({ broadcast: true }); return true; }
  });
  game.keybindings.register(MODULE_ID, "manager", {
    name: "GDM.Keys.Manager", editable: [],
    restricted: true, onDown: () => { TourManager.open(); return true; }
  });
});

Hooks.once("ready", () => {
  applyTheme();
  renderDock();
  window.addEventListener("resize", onResize);

  game.socket.on(SOCKET, onSocket);

  // API pública (macros)
  const mod = game.modules.get(MODULE_ID);
  if (mod) mod.api = {
    openManager: () => TourManager.open(),
    startTour: (idOrName) => {
      const tour = getTour(idOrName) ?? getTours().find((x) => x.name === idOrName);
      return TourRunner.start(tour);
    },
    point: pointLive,
    clear: () => clearLive({ broadcast: true })
  };

  // Tutorial automático para quem ainda não viu
  if (!game.user.isGM) {
    const pending = getTours().find((tr) => tr.autoStart && tr.steps?.length && !completionStatus(game.user, tr.id));
    if (pending) setTimeout(() => { if (!TourRunner.current) TourRunner.start(pending); }, 1800);
  }
});

Hooks.on("updateUser", (user, change) => {
  if (game.user.isGM && change?.flags?.[MODULE_ID]) TourManager.refresh();
});

function onSocket(data) {
  if (!data?.action) return;
  switch (data.action) {
    case "startTour":
      if (game.user.isGM || (data.users?.length && !data.users.includes(game.user.id))) return;
      { const tour = getTour(data.tourId); if (tour) TourRunner.start(tour); }
      break;
    case "highlight": receiveHighlight(data); break;
    case "clear": clearLive(); break;
    case "ack": receiveAck(data); break;
    case "tourDone":
      if (!game.user.isGM) return;
      {
        const name = esc(game.users.get(data.from)?.name ?? "?");
        const tour = esc(getTour(data.tourId)?.name ?? "");
        toast(t(data.status === "skipped" ? "Notify.TourSkipped" : "Notify.TourDone", { name, tour }),
          data.status === "skipped" ? "fa-solid fa-forward" : "fa-solid fa-graduation-cap");
        TourManager.refresh();
      }
      break;
    case "help":
      if (!game.user.isGM) return;
      playChime();
      toast(t("Notify.HelpCalled", { name: esc(game.users.get(data.from)?.name ?? "?") }), "fa-solid fa-hand");
      break;
  }
}
