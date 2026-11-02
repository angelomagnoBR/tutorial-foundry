// Guia da Mesa — Gerenciador de tutoriais e editor de passos (narrador)
import {
  t, esc, html, emit, deepClone, saveJSON, pickJSONFile, openFilePicker, sleep, toast, getSetting, setSetting
} from "./util.js";
import { GdmWindow, confirmBox } from "./window.js";
import {
  getTours, getTour, saveTour, deleteTour, newTour, newStep, sanitizeTour,
  completionStatus, resetCompletion
} from "./store.js";
import { starterTour } from "./templates.js";
import { PRESETS, presetTarget, summarizeTarget, targetFromElement, targetFromRect, resolveTarget } from "./targets.js";
import { pick } from "./picker.js";
import { TourRunner, runBefore } from "./tour-runner.js";
import { Spotlight } from "./spotlight.js";

const SIDEBAR_TABS = ["chat", "combat", "scenes", "actors", "items", "journal", "tables", "cards", "playlists", "compendium", "settings"];

/* ================================================================ */
/*  Escolher jogadores                                              */
/* ================================================================ */
export function chooseUsers(title) {
  return new Promise((resolve) => {
    const players = game.users.filter((u) => u.id !== game.user.id);
    const el = html(`
      <div class="gdm-modal">
        <form class="gdm-modal-card">
          <h3>${esc(title)}</h3>
          <div class="gdm-chips gdm-chips-col">
            ${players.map((u) => `<label class="gdm-check ${u.active ? "" : "gdm-offline"}">
               <input type="checkbox" name="u" value="${u.id}" ${u.active ? "checked" : ""}>
               <span class="gdm-dot" style="background:${esc(u.color?.css ?? u.color ?? "#999")}"></span>
               ${esc(u.name)} <small>${u.active ? t("Common.Online") : t("Common.Offline")}</small></label>`).join("")
            || `<p class="gdm-muted">${t("Manager.NoPlayers")}</p>`}
          </div>
          <div class="gdm-card-actions">
            <button type="button" class="gdm-btn gdm-ghost" data-v="0">${t("Common.Cancel")}</button>
            <span class="gdm-flex"></span>
            <button type="submit" class="gdm-btn gdm-primary"><i class="fa-solid fa-paper-plane"></i>${t("Manager.SendNow")}</button>
          </div>
        </form>
      </div>`);
    document.body.append(el);
    requestAnimationFrame(() => el.classList.add("gdm-in"));
    const done = (v) => { el.remove(); resolve(v); };
    el.addEventListener("click", (ev) => {
      if (ev.target === el || ev.target.closest("[data-v='0']")) done(null);
    });
    el.querySelector("form").addEventListener("submit", (ev) => {
      ev.preventDefault();
      done([...el.querySelectorAll("input[name=u]:checked")].map((i) => i.value));
    });
  });
}

/* ================================================================ */
/*  Gerenciador                                                     */
/* ================================================================ */
export class TourManager extends GdmWindow {
  static instance = null;

  static open() {
    if (!TourManager.instance?.el) TourManager.instance = new TourManager();
    return TourManager.instance.render();
  }

  static refresh() { if (TourManager.instance?.el) TourManager.instance.render(); }

  constructor() {
    super("gdm-manager", { title: t("Manager.Title"), icon: "fa-solid fa-signs-post", width: 720, cls: "gdm-manager" });
  }

  async content() {
    const tours = getTours();
    const players = game.users.filter((u) => !u.isGM);
    const hidden = getSetting("dockHiddenUsers") ?? [];
    const statusChip = (u, tour) => {
      const s = completionStatus(u, tour.id);
      const icon = s === "done" ? "fa-solid fa-circle-check" : s === "skipped" ? "fa-solid fa-forward" : "fa-regular fa-circle";
      const tip = s === "done" ? t("Manager.StatusDone") : s === "skipped" ? t("Manager.StatusSkipped") : t("Manager.StatusPending");
      return `<span class="gdm-who gdm-${s ?? "pending"}" data-tooltip="${esc(tip)}"><i class="${icon}"></i>${esc(u.name)}</span>`;
    };
    return `
      <div class="gdm-mgr">
        <div class="gdm-toolbar">
          <button type="button" class="gdm-btn gdm-primary" data-act="new"><i class="fa-solid fa-plus"></i>${t("Manager.New")}</button>
          <button type="button" class="gdm-btn" data-act="starter"><i class="fa-solid fa-wand-magic-sparkles"></i>${t("Manager.Starter")}</button>
          <span class="gdm-flex"></span>
          <button type="button" class="gdm-btn gdm-ghost" data-act="import"><i class="fa-solid fa-file-import"></i>${t("Manager.Import")}</button>
        </div>
        ${tours.length ? "" : `
          <div class="gdm-empty">
            <i class="fa-solid fa-map-location-dot"></i>
            <h3>${t("Manager.EmptyTitle")}</h3>
            <p>${t("Manager.EmptyText")}</p>
          </div>`}
        <div class="gdm-tour-list" data-keep-scroll>
          ${tours.map((tour) => `
            <article class="gdm-tour" data-id="${tour.id}">
              <div class="gdm-tour-icon"><i class="${esc(tour.icon || "fa-solid fa-compass")}"></i></div>
              <div class="gdm-tour-main">
                <h3>${esc(tour.name || t("Manager.Untitled"))}</h3>
                ${tour.description ? `<p>${esc(tour.description)}</p>` : ""}
                <div class="gdm-tags">
                  <span class="gdm-tag"><i class="fa-solid fa-list-ol"></i>${t("Manager.Steps", { n: tour.steps.length })}</span>
                  ${tour.autoStart ? `<span class="gdm-tag gdm-tag-accent"><i class="fa-solid fa-bolt"></i>${t("Manager.AutoTag")}</span>` : ""}
                  ${tour.showInHelp ? `<span class="gdm-tag"><i class="fa-solid fa-circle-question"></i>${t("Manager.HelpTag")}</span>` : ""}
                </div>
                ${players.length ? `<div class="gdm-whos">${players.map((u) => statusChip(u, tour)).join("")}</div>` : ""}
              </div>
              <div class="gdm-tour-actions">
                <button type="button" class="gdm-btn gdm-primary" data-act="send"><i class="fa-solid fa-paper-plane"></i>${t("Manager.Send")}</button>
                <div class="gdm-btn-row">
                  <button type="button" class="gdm-btn" data-act="edit"><i class="fa-solid fa-pen"></i>${t("Manager.Edit")}</button>
                  <button type="button" class="gdm-btn" data-act="test"><i class="fa-solid fa-play"></i>${t("Manager.Test")}</button>
                </div>
                <div class="gdm-btn-row gdm-icons">
                  <button type="button" class="gdm-icon-btn" data-act="dup" data-tooltip="${t("Manager.Duplicate")}"><i class="fa-regular fa-copy"></i></button>
                  <button type="button" class="gdm-icon-btn" data-act="export" data-tooltip="${t("Manager.Export")}"><i class="fa-solid fa-file-export"></i></button>
                  <button type="button" class="gdm-icon-btn" data-act="reset" data-tooltip="${t("Manager.ResetProgress")}"><i class="fa-solid fa-rotate-left"></i></button>
                  <button type="button" class="gdm-icon-btn gdm-danger-txt" data-act="delete" data-tooltip="${t("Manager.Delete")}"><i class="fa-solid fa-trash"></i></button>
                </div>
              </div>
            </article>`).join("")}
        </div>
        ${players.length ? `
        <div class="gdm-access">
          <div class="gdm-access-head">
            <i class="fa-solid fa-user-gear"></i>
            <span><b>${t("Manager.AccessTitle")}</b><small>${t("Manager.AccessHint")}</small></span>
          </div>
          <div class="gdm-chips">
            ${players.map((u) => `<label class="gdm-chip-btn ${u.active ? "" : "gdm-offline"}">
              <input type="checkbox" data-access value="${u.id}" ${hidden.includes(u.id) ? "" : "checked"}>
              <span class="gdm-dot" style="background:${esc(u.color?.css ?? u.color ?? "#999")}"></span>${esc(u.name)}</label>`).join("")}
          </div>
        </div>` : ""}
        <div class="gdm-tip"><i class="fa-solid fa-lightbulb"></i><span>${t("Manager.Tip")}</span></div>
      </div>`;
  }

  activate(body) {
    // quem vê o botão de ajuda
    body.querySelectorAll("input[data-access]").forEach((box) => box.addEventListener("change", async () => {
      const hiddenIds = [...body.querySelectorAll("input[data-access]")].filter((b) => !b.checked).map((b) => b.value);
      await setSetting("dockHiddenUsers", hiddenIds);
      const name = game.users.get(box.value)?.name ?? "";
      toast(t(box.checked ? "Manager.AccessOn" : "Manager.AccessOff", { name: esc(name) }), box.checked ? "fa-solid fa-eye" : "fa-solid fa-eye-slash");
    }));

    body.addEventListener("click", async (ev) => {
      const b = ev.target.closest("[data-act]");
      if (!b) return;
      const id = b.closest("[data-id]")?.dataset.id;
      const tour = id ? getTour(id) : null;
      switch (b.dataset.act) {
        case "new": {
          const tr = newTour({ name: t("Manager.NewName"), steps: [newStep({ title: t("Editor.FirstStepTitle"), text: `<p>${t("Editor.FirstStepText")}</p>` })] });
          await saveTour(tr);
          TourEditor.open(tr.id);
          break;
        }
        case "starter": {
          const tr = starterTour();
          await saveTour(tr);
          toast(t("Manager.StarterAdded"), "fa-solid fa-wand-magic-sparkles");
          TourEditor.open(tr.id);
          break;
        }
        case "import": {
          const data = await pickJSONFile();
          if (!data) return;
          const list = Array.isArray(data) ? data : [data];
          for (const raw of list) {
            const tr = sanitizeTour(raw);
            if (getTour(tr.id)) tr.id = newTour().id;
            await saveTour(tr);
          }
          toast(t("Manager.Imported", { n: list.length }), "fa-solid fa-file-import");
          break;
        }
        case "edit": TourEditor.open(id); break;
        case "test": {
          this.hide();
          TourRunner.start(tour, { preview: true, onEnd: () => this.show() });
          break;
        }
        case "send": {
          const users = await chooseUsers(t("Manager.SendTitle", { name: tour.name }));
          if (!users?.length) return;
          emit({ action: "startTour", tourId: id, users });
          toast(t("Manager.Sent", { n: users.length }), "fa-solid fa-paper-plane");
          break;
        }
        case "dup": {
          const copy = sanitizeTour({ ...deepClone(tour), id: newTour().id, name: `${tour.name} (${t("Manager.Copy")})` });
          copy.steps.forEach((s) => { s.id = newStep().id; });
          await saveTour(copy);
          break;
        }
        case "export": saveJSON(tour, `tutorial-${(tour.name || "guia").toLowerCase().replace(/[^a-z0-9]+/gi, "-")}.json`); break;
        case "reset":
          if (await confirmBox(t("Manager.ResetConfirm", { name: esc(tour.name) }))) {
            await resetCompletion(id);
            await sleep(200);
            this.render();
          }
          break;
        case "delete":
          if (await confirmBox(t("Manager.DeleteConfirm", { name: esc(tour.name) }), { danger: true, okLabel: t("Manager.Delete") })) {
            await deleteTour(id);
          }
          break;
      }
    });
  }
}

/* ================================================================ */
/*  Editor de tutorial                                              */
/* ================================================================ */
export class TourEditor extends GdmWindow {
  static open(tourId) {
    const tour = getTour(tourId);
    if (!tour) return;
    const existing = GdmWindow.open.get(`gdm-editor-${tourId}`);
    if (existing) return existing.show();
    return new TourEditor(tour).render();
  }

  constructor(tour) {
    super(`gdm-editor-${tour.id}`, { title: t("Editor.Title"), icon: "fa-solid fa-pen-ruler", width: 940, height: 680, cls: "gdm-editor" });
    this.tour = sanitizeTour(tour);
    this.sel = 0;
    this.dirty = false;
  }

  get step() { return this.tour.steps[this.sel] ?? null; }

  async content() {
    const tr = this.tour;
    const s = this.step;
    return `
      <div class="gdm-ed">
        <div class="gdm-ed-meta">
          <div class="gdm-ed-icon" data-tooltip="${t("Editor.IconHint")}"><i class="${esc(tr.icon)}"></i></div>
          <div class="gdm-ed-meta-fields">
            <input type="text" class="gdm-big" data-m="name" value="${esc(tr.name)}" placeholder="${t("Editor.NamePh")}">
            <input type="text" data-m="description" value="${esc(tr.description)}" placeholder="${t("Editor.DescPh")}">
            <div class="gdm-ed-meta-row">
              <label class="gdm-toggle"><input type="checkbox" data-m="autoStart" ${tr.autoStart ? "checked" : ""}><span>${t("Editor.AutoStart")}</span></label>
              <label class="gdm-toggle"><input type="checkbox" data-m="showInHelp" ${tr.showInHelp ? "checked" : ""}><span>${t("Editor.ShowInHelp")}</span></label>
              <span class="gdm-flex"></span>
              <input type="text" class="gdm-small" data-m="icon" value="${esc(tr.icon)}" placeholder="fa-solid fa-compass">
            </div>
          </div>
        </div>
        <div class="gdm-ed-main">
          <aside class="gdm-steps">
            <ol class="gdm-step-list" data-keep-scroll>
              ${tr.steps.map((st, i) => this._stepItem(st, i)).join("")}
            </ol>
            <div class="gdm-steps-add">
              <button type="button" class="gdm-btn gdm-primary" data-act="add-pick"><i class="fa-solid fa-crosshairs"></i>${t("Editor.AddFromScreen")}</button>
              <button type="button" class="gdm-btn" data-act="add"><i class="fa-solid fa-plus"></i>${t("Editor.AddStep")}</button>
            </div>
          </aside>
          <div class="gdm-step-form">
            ${s ? this._stepForm(s) : `<div class="gdm-empty"><i class="fa-solid fa-shoe-prints"></i><p>${t("Editor.NoSteps")}</p></div>`}
          </div>
        </div>
        <footer class="gdm-ed-foot">
          <button type="button" class="gdm-btn" data-act="test-here" ${s ? "" : "disabled"}><i class="fa-solid fa-play"></i>${t("Editor.TestHere")}</button>
          <button type="button" class="gdm-btn gdm-ghost" data-act="test-all" ${s ? "" : "disabled"}><i class="fa-solid fa-backward-step"></i>${t("Editor.TestAll")}</button>
          <span class="gdm-flex"></span>
          <span class="gdm-dirty ${this.dirty ? "gdm-on" : ""}"><i class="fa-solid fa-circle"></i>${t("Editor.Unsaved")}</span>
          <button type="button" class="gdm-btn gdm-primary" data-act="save"><i class="fa-solid fa-floppy-disk"></i>${t("Common.Save")}</button>
        </footer>
      </div>`;
  }

  _stepItem(st, i) {
    const sum = summarizeTarget(st.target);
    return `
      <li class="gdm-step-item ${i === this.sel ? "gdm-sel" : ""}" data-i="${i}" draggable="true">
        <span class="gdm-num">${i + 1}</span>
        <span class="gdm-step-txt">
          <b>${esc(st.title || t("Editor.NoTitle"))}</b>
          <small><i class="${sum.icon}"></i>${esc(sum.text)}</small>
        </span>
        <span class="gdm-step-tools">
          <button type="button" data-act="up" data-tooltip="${t("Editor.MoveUp")}"><i class="fa-solid fa-chevron-up"></i></button>
          <button type="button" data-act="down" data-tooltip="${t("Editor.MoveDown")}"><i class="fa-solid fa-chevron-down"></i></button>
          <button type="button" data-act="dup" data-tooltip="${t("Manager.Duplicate")}"><i class="fa-regular fa-copy"></i></button>
          <button type="button" data-act="del" data-tooltip="${t("Manager.Delete")}"><i class="fa-solid fa-trash"></i></button>
        </span>
      </li>`;
  }

  _stepForm(s) {
    const sum = summarizeTarget(s.target);
    const opt = (v, cur, label) => `<option value="${v}" ${v === cur ? "selected" : ""}>${label}</option>`;
    const b = s.before ?? { action: "none" };
    let beforeValue = "";
    if (b.action === "sidebarTab") {
      beforeValue = `<select data-f="before.value">${SIDEBAR_TABS.map((tb) => opt(tb, b.value, t(`Tab.${tb}`))).join("")}</select>`;
    } else if (b.action === "openJournal" || b.action === "runMacro") {
      beforeValue = `<input type="text" class="gdm-drop" data-f="before.value" value="${esc(b.value)}" placeholder="${t(b.action === "openJournal" ? "Editor.DropJournal" : "Editor.DropMacro")}">`;
    }
    const fx = s.effects ?? {};
    return `
      <div class="gdm-field">
        <label>${t("Editor.StepTitle")}</label>
        <input type="text" data-f="title" value="${esc(s.title)}" placeholder="${t("Editor.StepTitlePh")}">
      </div>
      <div class="gdm-field">
        <label>${t("Editor.StepText")}</label>
        <textarea data-f="text" rows="6" placeholder="${t("Editor.StepTextPh")}">${esc(s.text)}</textarea>
        <small>${t("Editor.StepTextHint")}</small>
      </div>

      <div class="gdm-field">
        <label>${t("Editor.Target")}</label>
        <div class="gdm-target-card">
          <i class="${sum.icon}"></i><span>${esc(sum.text)}</span>
          <span class="gdm-flex"></span>
          ${s.target?.type !== "none" ? `<button type="button" class="gdm-btn gdm-ghost gdm-sm" data-act="flash"><i class="fa-solid fa-eye"></i>${t("Editor.ShowMe")}</button>` : ""}
        </div>
        <div class="gdm-target-btns">
          <button type="button" class="gdm-btn gdm-sm" data-act="pick-element"><i class="fa-solid fa-crosshairs"></i>${t("Editor.PickElement")}</button>
          <button type="button" class="gdm-btn gdm-sm" data-act="pick-area"><i class="fa-regular fa-square"></i>${t("Editor.PickArea")}</button>
          <select class="gdm-sm" data-act="preset">
            <option value="">${t("Editor.Presets")}</option>
            ${PRESETS.map((p) => `<option value="${p.id}" ${s.target?.preset === p.id ? "selected" : ""}>${t(`Preset.${p.id}`)}</option>`).join("")}
          </select>
          <button type="button" class="gdm-btn gdm-sm gdm-ghost" data-act="target-none"><i class="fa-regular fa-message"></i>${t("Editor.NoTarget")}</button>
        </div>
        ${s.target?.type === "sheet" && s.target.docType !== "Item" ? `
          <label class="gdm-toggle gdm-mt"><input type="checkbox" data-f="target.mine" ${s.target.mine ? "checked" : ""}><span>${t("Editor.MineSheet")}</span></label>` : ""}
      </div>

      <div class="gdm-grid2">
        <div class="gdm-field">
          <label>${t("Editor.Before")}</label>
          <select data-f="before.action" data-rerender>
            ${["none", "sidebarTab", "openMySheet", "closeWindows", "openJournal", "runMacro"].map((a) => opt(a, b.action, t(`Before.${a}`))).join("")}
          </select>
          ${beforeValue}
        </div>
        <div class="gdm-field">
          <label>${t("Editor.Position")}</label>
          <select data-f="position">
            ${["auto", "top", "bottom", "left", "right", "center"].map((p) => opt(p, s.position, t(`Pos.${p}`))).join("")}
          </select>
        </div>
      </div>

      <div class="gdm-grid2">
        <div class="gdm-field">
          <label>${t("Editor.Effects")}</label>
          <div class="gdm-fx">
            <label class="gdm-toggle"><input type="checkbox" data-f="effects.dim" ${fx.dim !== false ? "checked" : ""}><span>${t("Fx.Dim")}</span></label>
            <label class="gdm-toggle"><input type="checkbox" data-f="effects.ring" ${fx.ring !== false ? "checked" : ""}><span>${t("Fx.Ring")}</span></label>
            <label class="gdm-toggle"><input type="checkbox" data-f="effects.arrow" ${fx.arrow !== false ? "checked" : ""}><span>${t("Fx.Arrow")}</span></label>
          </div>
        </div>
        <div class="gdm-field">
          <label>${t("Editor.Advance")}</label>
          <div class="gdm-seg gdm-seg-wide">
            <label><input type="radio" name="adv-${s.id}" data-f="advance" value="button" ${s.advance !== "click" ? "checked" : ""}><span><i class="fa-solid fa-forward"></i>${t("Editor.AdvButton")}</span></label>
            <label><input type="radio" name="adv-${s.id}" data-f="advance" value="click" ${s.advance === "click" ? "checked" : ""}><span><i class="fa-solid fa-hand-pointer"></i>${t("Editor.AdvClick")}</span></label>
          </div>
        </div>
      </div>

      <div class="gdm-field">
        <label>${t("Editor.Image")}</label>
        <div class="gdm-row">
          <input type="text" data-f="image" value="${esc(s.image)}" placeholder="${t("Editor.ImagePh")}">
          <button type="button" class="gdm-icon-btn" data-act="browse"><i class="fa-solid fa-folder-open"></i></button>
        </div>
      </div>`;
  }

  /* ---------------- eventos ---------------- */
  activate(body) {
    // metadados
    body.querySelectorAll("[data-m]").forEach((inp) => {
      inp.addEventListener(inp.type === "checkbox" ? "change" : "input", () => {
        this.tour[inp.dataset.m] = inp.type === "checkbox" ? inp.checked : inp.value;
        if (inp.dataset.m === "icon") body.querySelector(".gdm-ed-icon i").className = inp.value;
        this._markDirty();
      });
    });

    // campos do passo
    body.querySelectorAll("[data-f]").forEach((inp) => {
      const evt = inp.type === "checkbox" || inp.type === "radio" || inp.tagName === "SELECT" ? "change" : "input";
      inp.addEventListener(evt, () => {
        const s = this.step;
        if (!s) return;
        let v = inp.type === "checkbox" ? inp.checked : inp.value;
        if (inp.type === "radio" && !inp.checked) return;
        setPath(s, inp.dataset.f, v);
        if (inp.dataset.f === "before.action") s.before.value = v === "sidebarTab" ? "chat" : "";
        this._markDirty();
        if (inp.hasAttribute("data-rerender") || inp.dataset.f === "target.mine") return this.render();
        if (inp.dataset.f === "title") {
          const li = body.querySelector(`.gdm-step-item[data-i="${this.sel}"] b`);
          if (li) li.textContent = v || t("Editor.NoTitle");
        }
      });
    });

    // arrastar diário/macro para o campo
    body.querySelectorAll(".gdm-drop").forEach((inp) => {
      inp.addEventListener("dragover", (ev) => ev.preventDefault());
      inp.addEventListener("drop", (ev) => {
        ev.preventDefault();
        try {
          const data = JSON.parse(ev.dataTransfer.getData("text/plain"));
          if (data?.uuid) {
            inp.value = data.uuid;
            inp.dispatchEvent(new Event("input"));
          }
        } catch (e) { /* não era um documento */ }
      });
    });

    // reordenar arrastando
    const list = body.querySelector(".gdm-step-list");
    let dragFrom = null;
    list?.addEventListener("dragstart", (ev) => {
      const li = ev.target.closest(".gdm-step-item");
      dragFrom = Number(li?.dataset.i);
      ev.dataTransfer.effectAllowed = "move";
      ev.dataTransfer.setData("text/plain", "gdm-step");
    });
    list?.addEventListener("dragover", (ev) => {
      if (dragFrom === null) return;
      ev.preventDefault();
      list.querySelectorAll(".gdm-drop-over").forEach((x) => x.classList.remove("gdm-drop-over"));
      ev.target.closest(".gdm-step-item")?.classList.add("gdm-drop-over");
    });
    list?.addEventListener("drop", (ev) => {
      ev.preventDefault();
      const to = Number(ev.target.closest(".gdm-step-item")?.dataset.i);
      if (dragFrom !== null && !Number.isNaN(to) && to !== dragFrom) this._move(dragFrom, to);
      dragFrom = null;
    });
    list?.addEventListener("dragend", () => { dragFrom = null; });

    // presets
    body.querySelector("[data-act=preset]")?.addEventListener("change", (ev) => {
      if (!ev.target.value || !this.step) return;
      this.step.target = presetTarget(ev.target.value);
      if (this.step.target.type === "sheet" && this.step.before.action === "none") this.step.before = { action: "openMySheet", value: "" };
      if (!this.step.title) this.step.title = this.step.target.label;
      this._markDirty();
      this.render();
    });

    body.addEventListener("click", (ev) => this._onClick(ev));
  }

  async _onClick(ev) {
    const btn = ev.target.closest("[data-act]");
    const li = ev.target.closest(".gdm-step-item");
    if (btn?.tagName === "SELECT") return;
    if (li && !btn) {
      this.sel = Number(li.dataset.i);
      return this.render();
    }
    if (!btn) return;
    const act = btn.dataset.act;
    const i = li ? Number(li.dataset.i) : this.sel;
    const steps = this.tour.steps;
    switch (act) {
      case "up": if (i > 0) this._move(i, i - 1); break;
      case "down": if (i < steps.length - 1) this._move(i, i + 1); break;
      case "dup": {
        const copy = deepClone(steps[i]);
        copy.id = newStep().id;
        steps.splice(i + 1, 0, copy);
        this.sel = i + 1;
        this._markDirty();
        this.render();
        break;
      }
      case "del":
        if (!(await confirmBox(t("Editor.DeleteStep", { n: i + 1 }), { danger: true, okLabel: t("Manager.Delete") }))) return;
        steps.splice(i, 1);
        this.sel = Math.max(0, Math.min(this.sel, steps.length - 1));
        this._markDirty();
        this.render();
        break;
      case "add":
        steps.splice(this.sel + 1, 0, newStep());
        this.sel = steps.length === 1 ? 0 : this.sel + 1;
        this._markDirty();
        this.render();
        break;
      case "add-pick": {
        const target = await this._pickTarget("element");
        if (!target) return;
        const st = newStep({ title: target.label ?? "", target });
        if (target.type === "sheet") st.before = { action: "openMySheet", value: "" };
        steps.splice(steps.length ? this.sel + 1 : 0, 0, st);
        this.sel = steps.indexOf(st);
        this._markDirty();
        await this.render();
        this.el?.querySelector("[data-f=text]")?.focus();
        break;
      }
      case "pick-element":
      case "pick-area": {
        const target = await this._pickTarget(act === "pick-area" ? "area" : "element");
        if (!target) return;
        this.step.target = target;
        if (target.type === "sheet" && this.step.before.action === "none") this.step.before = { action: "openMySheet", value: "" };
        if (!this.step.title && target.type !== "area") this.step.title = target.label ?? "";
        this._markDirty();
        await this.render();
        this._flash();
        break;
      }
      case "target-none":
        this.step.target = { type: "none" };
        this._markDirty();
        this.render();
        break;
      case "flash": this._flash(); break;
      case "browse":
        openFilePicker({
          type: "image", current: this.step.image,
          callback: (path) => { this.step.image = path; this._markDirty(); this.render(); }
        });
        break;
      case "test-here": this._test(this.sel); break;
      case "test-all": this._test(0); break;
      case "save": await this.save(); break;
    }
  }

  _move(from, to) {
    const steps = this.tour.steps;
    const [s] = steps.splice(from, 1);
    steps.splice(to, 0, s);
    this.sel = to;
    this._markDirty();
    this.render();
  }

  async _pickTarget(mode) {
    this.hide();
    TourManager.instance?.hide();
    const res = await pick({ mode, title: t("Editor.PickTitle") });
    this.show();
    TourManager.instance?.show();
    if (!res) return null;
    return res.element ? targetFromElement(res.element, { forTour: true }) : targetFromRect(res.rect);
  }

  /** Mostra rapidamente onde o alvo está */
  async _flash() {
    const s = this.step;
    if (!s || s.target?.type === "none") return;
    this.hide();
    TourManager.instance?.hide();
    if (s.target.type === "sheet") await runBefore({ action: "openMySheet" });
    const res = await resolveTarget(s.target, { open: true, timeout: 1500 });
    if (res.kind === "missing") toast(t("Editor.NotFound"), "fa-solid fa-triangle-exclamation");
    else {
      const sp = new Spotlight("live");
      sp.show({ getRect: res.getRect, card: null, dim: true, ring: true, arrow: true, blockOutside: false, interactive: true });
      await sleep(1700);
      sp.destroy();
    }
    this.show();
    TourManager.instance?.show();
  }

  _test(startAt) {
    this.hide();
    TourManager.instance?.hide();
    TourRunner.start(deepClone(this.tour), {
      preview: true,
      startAt,
      onEnd: () => { this.show(); TourManager.instance?.show(); }
    });
  }

  _markDirty() {
    this.dirty = true;
    this.el?.querySelector(".gdm-dirty")?.classList.add("gdm-on");
  }

  async save() {
    await saveTour(sanitizeTour(this.tour));
    this.dirty = false;
    this.el?.querySelector(".gdm-dirty")?.classList.remove("gdm-on");
    toast(t("Editor.Saved"), "fa-solid fa-floppy-disk");
  }

  async close() {
    if (this.dirty && this.el) {
      const ok = await confirmBox(t("Editor.DiscardConfirm"), { okLabel: t("Editor.SaveAndClose"), cancelLabel: t("Editor.Discard") });
      if (ok) await this.save();
    }
    super.close();
  }
}

function setPath(obj, path, value) {
  const keys = path.split(".");
  let o = obj;
  for (const k of keys.slice(0, -1)) o = o[k] ??= {};
  o[keys.at(-1)] = value;
}
