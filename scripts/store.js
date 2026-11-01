// Guia da Mesa — armazenamento dos tutoriais (configuração do mundo) e progresso dos jogadores
import { MODULE_ID, getSetting, setSetting, randomId, deepClone } from "./util.js";

export function newStep(partial = {}) {
  return {
    id: randomId(),
    title: "",
    text: "",
    image: "",
    target: { type: "none" },
    before: { action: "none", value: "" },
    position: "auto",
    effects: { dim: true, ring: true, arrow: true },
    advance: "button",
    ...partial
  };
}

export function newTour(partial = {}) {
  return {
    id: randomId(),
    name: "",
    description: "",
    icon: "fa-solid fa-compass",
    autoStart: false,
    showInHelp: true,
    steps: [],
    ...partial
  };
}

/** Normaliza dados vindos de importação/versões antigas */
export function sanitizeTour(raw) {
  const tour = newTour({ ...deepClone(raw ?? {}) });
  tour.steps = (Array.isArray(raw?.steps) ? raw.steps : []).map((s) => {
    const st = newStep(deepClone(s));
    st.effects = { dim: true, ring: true, arrow: true, ...(s?.effects ?? {}) };
    st.before = { action: "none", value: "", ...(s?.before ?? {}) };
    st.target = s?.target?.type ? s.target : { type: "none" };
    return st;
  });
  return tour;
}

export function getTours() {
  const list = getSetting("tours");
  return Array.isArray(list) ? list : [];
}

export function getTour(id) {
  return getTours().find((tr) => tr.id === id) ?? null;
}

export async function saveTour(tour) {
  const list = deepClone(getTours());
  const i = list.findIndex((x) => x.id === tour.id);
  if (i >= 0) list[i] = deepClone(tour);
  else list.push(deepClone(tour));
  await setSetting("tours", list);
}

export async function deleteTour(id) {
  await setSetting("tours", getTours().filter((x) => x.id !== id));
}

/* ---- Progresso por jogador (flag no próprio usuário) ---- */
export function isCompleted(user, tourId) {
  return !!user?.getFlag?.(MODULE_ID, "completed")?.[tourId];
}

/** status: "done" (concluiu) ou "skipped" (pulou) */
export function completionStatus(user, tourId) {
  const v = user?.getFlag?.(MODULE_ID, "completed")?.[tourId];
  if (!v) return null;
  return v === "skipped" ? "skipped" : "done";
}

export async function markCompleted(tourId, status = "done") {
  const prev = game.user.getFlag(MODULE_ID, "completed") ?? {};
  if (prev[tourId] && prev[tourId] !== "skipped" && status === "skipped") return; // não rebaixa
  const done = { ...prev, [tourId]: status };
  try { await game.user.setFlag(MODULE_ID, "completed", done); }
  catch (e) { console.warn(`${MODULE_ID} | não foi possível salvar o progresso`, e); }
}

export async function resetCompletion(tourId) {
  for (const u of game.users) {
    if (!u.getFlag(MODULE_ID, "completed")?.[tourId]) continue;
    try { await u.update({ [`flags.${MODULE_ID}.completed.-=${tourId}`]: null }); }
    catch (e) { console.warn(e); }
  }
}
