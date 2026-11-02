// Guia da Mesa — escolher quais usuários veem a barra flutuante
import { t, esc, getSetting, setSetting, toast } from "./util.js";
import { GdmWindow } from "./window.js";

export class AccessWindow extends GdmWindow {
  static open() {
    const w = GdmWindow.open.get("gdm-access") ?? new AccessWindow();
    return w.render();
  }

  constructor() {
    super("gdm-access", { title: t("Access.Title"), icon: "fa-solid fa-user-gear", width: 480, cls: "gdm-access-win" });
  }

  async content() {
    const hidden = getSetting("dockHiddenUsers") ?? [];
    const users = [...game.users].sort((a, b) => (b.isGM - a.isGM) || a.name.localeCompare(b.name));
    return `
      <div class="gdm-acc">
        <p class="gdm-acc-intro">${t("Access.Intro")}</p>
        <div class="gdm-acc-list">
          ${users.map((u) => `
            <label class="gdm-acc-row ${u.active ? "" : "gdm-offline"}">
              <span class="gdm-dot" style="background:${esc(u.color?.css ?? u.color ?? "#999")}"></span>
              <span class="gdm-acc-name">
                <b>${esc(u.name)}${u.id === game.user.id ? ` <small>(${t("Access.You")})</small>` : ""}</b>
                <small>${u.isGM ? t("Access.RoleGM") : t("Access.RolePlayer")}</small>
              </span>
              <span class="gdm-toggle"><input type="checkbox" data-user="${u.id}" ${hidden.includes(u.id) ? "" : "checked"}><span></span></span>
            </label>`).join("")}
        </div>
        <div class="gdm-card-actions">
          <button type="button" class="gdm-btn gdm-ghost gdm-sm" data-act="none"><i class="fa-solid fa-eye-slash"></i>${t("Access.HideAll")}</button>
          <button type="button" class="gdm-btn gdm-ghost gdm-sm" data-act="all"><i class="fa-solid fa-eye"></i>${t("Access.ShowAll")}</button>
          <span class="gdm-flex"></span>
          <small class="gdm-muted">v${esc(game.modules.get("guia-da-mesa")?.version ?? "?")}</small>
          <button type="button" class="gdm-btn gdm-primary" data-act="done"><i class="fa-solid fa-check"></i>${t("Access.Done")}</button>
        </div>
      </div>`;
  }

  activate(body) {
    const boxes = [...body.querySelectorAll("input[data-user]")];
    const save = async () => {
      await setSetting("dockHiddenUsers", boxes.filter((b) => !b.checked).map((b) => b.dataset.user));
    };
    boxes.forEach((b) => b.addEventListener("change", async () => {
      await save();
      const name = esc(game.users.get(b.dataset.user)?.name ?? "");
      toast(t(b.checked ? "Access.On" : "Access.Off", { name }), b.checked ? "fa-solid fa-eye" : "fa-solid fa-eye-slash");
    }));
    body.addEventListener("click", async (ev) => {
      const act = ev.target.closest("[data-act]")?.dataset.act;
      if (act === "all" || act === "none") {
        boxes.forEach((b) => { b.checked = act === "all"; });
        await save();
      }
      if (act === "done") this.close();
    });
  }
}
