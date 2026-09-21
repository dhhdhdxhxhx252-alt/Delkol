import type { Macro } from '../data';
import { getAutomation, MACRO_META, parameterLabel, type MacroAutomation } from './automation';
import { FishingSim, MinigameController, FISHING_POLL_MS, NEVERFISH } from './engine';

/** neverfish engine objects carried on every MacroRuntime. */
export interface RuntimeEngine {
  fishing?: {
    sim: FishingSim;
    controller: MinigameController;
    state: 'idle' | 'waitBite' | 'hooking' | 'minigame' | 'waitCatch';
    stateSecs: number;
    lastDecision: string;
    biteEventSent: boolean;
  };
}

export type MacroPhase = 'waiting' | 'running' | 'break' | 'retry' | 'paused' | 'stopped';
export interface MacroRuntime {
  clock: number;
  nextAt: number;
  resumeAt: number;
  cycles: number;
  cursor: number;
  attempts: number;
  metric: number;
  items: number;
  resource: number;
  spent: number;
  restored: boolean;
  retries: number;
  phase: MacroPhase;
  /** neverfish engine objects (not persisted — rebuilt on load). */
  engine: RuntimeEngine;
  lastDetail: string;
}

export interface RuntimeEvent { title: string; detail: string; type: 'success' | 'info' | 'warning' }
export interface RuntimeResult { runtime: MacroRuntime; completed: boolean; stopReason?: string; event?: RuntimeEvent }
export interface PlanStep { title: string; seconds: number }
export type PreviewScenario = 'normal' | 'error' | 'hidden';

// ---------------------------------------------------------------------------
// neverfish engine bridge (src/macros/engine.ts)
// ---------------------------------------------------------------------------

type FishingEngine = NonNullable<RuntimeEngine['fishing']>;

function ensureFishingEngine(runtime: MacroRuntime): FishingEngine {
  if (!runtime.engine.fishing) {
    runtime.engine.fishing = { sim: new FishingSim(), controller: new MinigameController(), state: 'idle', stateSecs: 0, lastDecision: '', biteEventSent: false };
  }
  return runtime.engine.fishing;
}

type FishingTick =
  | { mode: 'wait'; detail: string; event?: RuntimeEvent }
  | { mode: 'caught'; weight: number; kept: boolean; detail: string }
  | { mode: 'failed'; reason: string; warning: boolean };

/** One App tick (≈1s) of the neverfish state machine, at 80ms poll granularity. */
function runFishingTick(macro: Macro, a: MacroAutomation, runtime: MacroRuntime, delta: number): FishingTick {
  const eng = ensureFishingEngine(runtime);
  const p = a.parameters;
  const polls = Math.round((delta * 1000) / FISHING_POLL_MS);
  eng.stateSecs += delta;

  const fail = (reason: string): FishingTick => {
    eng.state = 'idle';
    eng.stateSecs = 0;
    return { mode: 'failed', reason, warning: true };
  };

  switch (eng.state) {
    case 'idle': {
      eng.sim.cast();
      eng.state = 'waitBite';
      eng.stateSecs = 0;
      eng.biteEventSent = false;
      return { mode: 'wait', detail: `Заброс ${Number(p.castPower)}% / наживка: ${parameterLabel('fishing', 'bait', p.bait)}. Ждём поклёвку.` };
    }
    case 'waitBite': {
      for (let i = 0; i < polls; i += 1) {
        const sample = eng.sim.poll();
        if (sample.bite) {
          eng.state = 'hooking';
          eng.stateSecs = 0;
          const reaction = Number(p.reactionMs);
          const event: RuntimeEvent | undefined = eng.biteEventSent ? undefined : { title: `Поклёвка: ${macro.name}`, detail: `Синяя дуга у индикатора F. Подсечка через ${reaction} мс.`, type: 'info' };
          eng.biteEventSent = true;
          return { mode: 'wait', detail: `Поклёвка! Подсечка через ${reaction} мс.`, event };
        }
      }
      // neverfish fallback: a free re-cast beats stalling on a missed signal.
      if (eng.stateSecs >= NEVERFISH.WAIT_BITE_FALLBACK_SECS * 1.4) return fail(`Нет поклёвки ${Math.round(eng.stateSecs)} с — перезаброс (F).`);
      return { mode: 'wait', detail: `Ожидание поклёвки… ${Math.round(eng.stateSecs)} с.` };
    }
    case 'hooking': {
      if (eng.stateSecs * 1000 >= Number(p.reactionMs)) {
        const inWindow = Number(p.reactionMs) < Number(p.hookWindowMs);
        eng.sim.hook(inWindow);
        eng.stateSecs = 0;
        if (!inWindow) return fail('Окно подсечки пропущено — рыба ушла.');
        eng.controller.reset();
        eng.state = 'minigame';
        return { mode: 'wait', detail: 'Подсечка удалась. Мини-игра: удерживай стрелку в зелёной зоне.' };
      }
      return { mode: 'wait', detail: 'Подсечка (F)…' };
    }
    case 'minigame': {
      const t0 = performance.now();
      for (let i = 0; i < polls; i += 1) {
        const sample = eng.sim.poll();
        if (eng.sim.state !== 'minigame') break; // landed or escaped inside poll()
        if (!sample.bar) continue;
        const decision = eng.controller.step(sample.bar.yellow, sample.bar.left, sample.bar.right, t0 + i * FISHING_POLL_MS, 30, 70);
        if (decision.key) eng.sim.applyHold(decision.key, decision.holdMs);
        eng.lastDecision = decision.detail;
      }
      if (eng.sim.outcome === 'landed') {
        eng.state = 'waitCatch';
        eng.stateSecs = 0;
        return { mode: 'wait', detail: `Баланс выдержан (${eng.lastDecision}). Рыба выловлена.` };
      }
      if (eng.sim.outcome === 'escaped') return fail('Рыба сорвалась: стрелка вышла из зелёной зоны.');
      if (eng.stateSecs >= NEVERFISH.MINIGAME_TIMEOUT_SECS) return fail(`Тайм-аут мини-игры ${NEVERFISH.MINIGAME_TIMEOUT_SECS} с — возврат к забросу.`);
      return { mode: 'wait', detail: `Мини-игра: ${eng.lastDecision || 'ловим стрелку…'}` };
    }
    case 'waitCatch': {
      // Dismiss-with-verify: 0.4s verify + post-catch jitter 600–1200ms.
      if (eng.stateSecs >= NEVERFISH.POPUP_VERIFY_DELAY_SECS + 0.9) {
        const weight = eng.sim.catchWeight(p.bait as 'universal' | 'insects' | 'lure');
        eng.sim.dismissPopup();
        eng.state = 'idle';
        eng.stateSecs = 0;
        const rare = weight >= 7;
        const kept = !(p.releaseSmall && weight < Number(p.minWeight)) && (p.catchMode === 'all' || (p.catchMode === 'rare' && rare) || (p.catchMode === 'trophy' && weight >= 12));
        return { mode: 'caught', weight, kept, detail: `Попап закрыт после проверки. Вес: ${weight} кг${kept ? '' : ' — отпущена'}.` };
      }
      return { mode: 'wait', detail: 'Проверка улова и закрытие попапа…' };
    }
  }
}

const QUESTS = [
  { name: 'Доставка посылки', type: 'daily', difficulty: 1, combat: false, energy: 8, duration: 2.5, reward: 80, distance: 2 },
  { name: 'Помощь жителям', type: 'daily', difficulty: 1, combat: false, energy: 10, duration: 3, reward: 100, distance: 1 },
  { name: 'Патруль квартала', type: 'daily', difficulty: 2, combat: true, energy: 18, duration: 4, reward: 150, distance: 4 },
  { name: 'Поиск потерянного', type: 'daily', difficulty: 2, combat: false, energy: 12, duration: 3.5, reward: 120, distance: 3 },
  { name: 'Городское поручение', type: 'weekly', difficulty: 2, combat: false, energy: 20, duration: 5, reward: 250, distance: 5 },
  { name: 'Сложное испытание', type: 'weekly', difficulty: 3, combat: true, energy: 28, duration: 6, reward: 400, distance: 6 },
  { name: 'Небольшая просьба', type: 'side', difficulty: 1, combat: false, energy: 8, duration: 2, reward: 70, distance: 2 },
  { name: 'Необычная находка', type: 'side', difficulty: 2, combat: false, energy: 14, duration: 3.5, reward: 170, distance: 3 },
];
const MENU: Record<string, { label: string; price: number; seconds: number }> = {
  coffee: { label: 'кофе', price: 65, seconds: 1.4 }, tea: { label: 'чай', price: 50, seconds: .9 },
  dessert: { label: 'десерт', price: 110, seconds: 1.7 }, meal: { label: 'блюдо', price: 180, seconds: 2.3 },
};

function questList(a: MacroAutomation) {
  const p = a.parameters;
  const maxDifficulty = p.difficulty === 'easy' ? 1 : p.difficulty === 'normal' ? 2 : 3;
  const list = QUESTS.filter((task) => (p.types as string[]).includes(task.type) && task.difficulty <= maxDifficulty && !(p.skipCombat && task.combat));
  return list.sort((left, right) => p.priority === 'quick' ? left.duration - right.duration : p.priority === 'reward' ? right.reward - left.reward : left.distance - right.distance);
}

function orderList(a: MacroAutomation, index: number) {
  const p = a.parameters;
  const menu = (p.menu as string[]).map((key) => MENU[key]);
  if (p.orderPolicy === 'quick') menu.sort((left, right) => left.seconds - right.seconds);
  if (p.orderPolicy === 'profit') menu.sort((left, right) => right.price - left.price);
  return Array.from({ length: Number(p.parallelOrders) }, (_, offset) => menu[p.orderPolicy === 'queue' ? (index + offset) % menu.length : offset % menu.length]);
}

export function cyclePlan(macro: Macro, index = 0, automation = getAutomation(macro)): PlanStep[] {
  const p = automation.parameters;
  if (macro.kind === 'fishing') return [
    { title: `Заброс (F) с силой ${p.castPower}% — ${parameterLabel(macro.kind, 'location', p.location)}`, seconds: .8 },
    { title: `Ожидание поклёвки — наживка: ${parameterLabel(macro.kind, 'bait', p.bait)}`, seconds: p.bait === 'lure' ? 3 : p.bait === 'insects' ? 3.5 : 2.5 },
    { title: `Подсечка (F) с задержкой ${p.reactionMs} мс`, seconds: Math.max(.4, Number(p.reactionMs) / 1000) },
    { title: 'Мини-игра: удержание стрелки в зелёной зоне (A/D)', seconds: 4.5 },
    { title: `Закрытие попапа улова — режим: ${parameterLabel(macro.kind, 'catchMode', p.catchMode)}`, seconds: 1.2 },
  ];
  if (macro.kind === 'racing') return [
    { title: p.route === 'custom' ? String(p.routeName) : parameterLabel(macro.kind, 'route', p.route), seconds: 1.2 },
    { title: `${p.laps} круга / до ${p.speedLimit} км/ч`, seconds: Number(p.laps) * (p.route === 'coast' ? 4.5 : 3.4) * (140 / Number(p.speedLimit)) * (p.driving === 'careful' ? 1.2 : p.driving === 'fast' ? .85 : 1) * (p.boost ? p.boostMode === 'straight' ? .8 : .9 : 1) },
    { title: p.brakeAssist ? 'Прохождение поворотов с торможением' : 'Прохождение поворотов без помощи', seconds: p.brakeAssist ? 1.4 : .7 },
    { title: `Проверка результата: ${parameterLabel(macro.kind, 'goal', p.goal)}`, seconds: .8 },
  ];
  if (macro.kind === 'cafe') {
    const orders = orderList(automation, index);
    return [
      { title: `Приём: ${parameterLabel(macro.kind, 'station', p.station)}`, seconds: .6 },
      { title: `Приготовить: ${orders.map((item) => item.label).join(', ')}`, seconds: orders.reduce((sum, item) => sum + item.seconds, 0) * (p.quality === 'premium' ? 1.3 : 1) },
      { title: `Подача / пауза ${p.serveDelayMs} мс`, seconds: Number(p.serveDelayMs) / 1000 },
      { title: p.collectTips ? 'Оплата и чаевые' : 'Получение оплаты', seconds: .8 },
    ];
  }
  if (macro.kind === 'quests') {
    const tasks = questList(automation);
    const task = tasks[index % tasks.length];
    if (!task) return [{ title: 'Нет заданий с выбранными фильтрами', seconds: 1 }];
    return [
      { title: `${task.name} / ${parameterLabel(macro.kind, 'route', p.route)} путь`, seconds: task.duration * (p.route === 'short' ? .8 : 1.1) },
      { title: p.skipDialog ? 'Пропуск знакомого диалога' : 'Ожидание завершения диалога', seconds: p.skipDialog ? .3 : 2.5 },
      { title: `Подтверждение через ${p.interactionMs} мс`, seconds: Number(p.interactionMs) / 1000 },
      { title: p.autoCollect ? 'Выполнение и получение награды' : 'Выполнение без получения награды', seconds: p.autoCollect ? 1.2 : .7 },
    ];
  }
  return [
    { title: `${parameterLabel(macro.kind, 'zone', p.zone)} / ${parameterLabel(macro.kind, 'route', p.route)}`, seconds: p.route === 'nearest' ? 1.2 : 2 },
    { title: `Сканирование в радиусе ${p.scanRadius} м`, seconds: Number(p.scanRadius) / 30 },
    { title: `Фильтр: ${parameterLabel(macro.kind, 'rarity', p.rarity)}`, seconds: p.ignoreOwned ? .8 : .4 },
    { title: p.autoPickup ? `Сбор через ${p.pickupDelayMs} мс` : 'Разведка без сбора', seconds: p.autoPickup ? Number(p.pickupDelayMs) / 1000 + .4 : .2 },
  ];
}

export function cycleSeconds(macro: Macro, index = 0, automation = getAutomation(macro)): number {
  return Math.max(1, Math.round(cyclePlan(macro, index, automation).reduce((sum, step) => sum + step.seconds, 0) * 10) / 10);
}

/** Which step of the cycle plan is running right now (for live narration). */
function stageDetail(macro: Macro, a: MacroAutomation, state: MacroRuntime): string {
  const steps = cyclePlan(macro, state.cursor, a);
  if (!steps.length) return state.lastDetail;
  const elapsed = Math.max(0, state.clock - state.resumeAt);
  let acc = 0;
  for (let i = 0; i < steps.length; i += 1) {
    acc += Math.max(.5, steps[i].seconds);
    if (elapsed < acc) return `Этап ${i + 1}/${steps.length}: ${steps[i].title}`;
  }
  return `Этап ${steps.length}/${steps.length}: ${steps[steps.length - 1].title}`;
}

export function createRuntime(macro: Macro): MacroRuntime {
  const a = getAutomation(macro);
  return { clock: 0, nextAt: a.execution.startDelay + Math.min(cycleSeconds(macro), a.safety.cycleTimeout), resumeAt: a.execution.startDelay, cycles: 0, cursor: 0, attempts: 0, metric: 0, items: 0, resource: 100, spent: 0, restored: false, retries: 0, phase: a.execution.startDelay ? 'waiting' : 'running', lastDetail: 'Ожидание запуска', engine: {} };
}

export function advanceRuntime(macro: Macro, previous: MacroRuntime, delta: number, hidden = false, forceFailure = false): RuntimeResult {
  const a = getAutomation(macro);
  const p = a.parameters;
  if (previous.phase === 'stopped') return { runtime: previous, completed: false };
  if (hidden && a.safety.pauseWhenHidden) return { runtime: { ...previous, phase: 'paused' }, completed: false };
  let state = { ...previous, clock: previous.clock + delta };
  state.phase = state.clock < state.resumeAt ? previous.phase === 'paused' ? 'waiting' : previous.phase : 'running';
  const finish = (reason: string, completed = false, warning = false): RuntimeResult => ({
    runtime: { ...state, phase: 'stopped', lastDetail: reason }, completed, stopReason: reason,
    event: { title: `Макрос «${macro.name}» завершён`, detail: reason, type: warning ? 'warning' : 'success' },
  });
  if (a.execution.maxMinutes > 0 && state.clock >= a.execution.maxMinutes * 60) return finish(`Достигнут лимит: ${a.execution.maxMinutes} мин.`);

  // --- neverfish fishing engine: advances every tick, manages its own loop ---
  if (macro.kind === 'fishing') {
    if (forceFailure) {
      // Keep the editor's "model recognition error" drill working for fishing too.
      const tick = { mode: 'failed' as const, reason: 'Тестовая ошибка распознавания', warning: true };
      if (a.safety.onError === 'stop') return finish(tick.reason, false, true);
      const retry = a.safety.onError === 'retry';
      state.lastDetail = tick.reason;
      state.phase = retry ? 'retry' : 'waiting';
      state.resumeAt = state.clock + (retry ? a.safety.retryDelay : 1);
      state.nextAt = state.resumeAt;
      return { runtime: state, completed: false, event: { title: retry ? `Повтор: ${macro.name}` : `Неудача: ${macro.name}`, detail: tick.reason, type: 'warning' } };
    }
    const tick = runFishingTick(macro, a, state, delta);
    if (tick.mode === 'wait') {
      state.lastDetail = tick.detail;
      return { runtime: state, completed: false, event: tick.event };
    }
    if (tick.mode === 'failed') {
      if (a.safety.onError === 'stop') return finish(tick.reason, false, true);
      const retry = a.safety.onError === 'retry';
      state.lastDetail = tick.reason;
      state.phase = retry ? 'retry' : 'waiting';
      state.resumeAt = state.clock + (retry ? a.safety.retryDelay : 1);
      state.nextAt = state.resumeAt;
      return { runtime: state, completed: false, event: { title: retry ? `Повтор: ${macro.name}` : `Неудача: ${macro.name}`, detail: tick.reason, type: 'warning' } };
    }
    // Caught: the cycle completed through the full state machine.
    state.cycles += 1;
    state.cursor += 1;
    state.retries = 0;
    if (tick.kept) { state.metric += 1; state.items += 1; }
    state.lastDetail = tick.detail;
    let goal = '';
    if (!p.autoRecast) goal = 'Один заброс выполнен. Повторный заброс выключен.';
    if (Number(p.catchTarget) > 0 && state.metric >= Number(p.catchTarget)) goal = `Целевой улов собран: ${state.metric} рыб.`;
    if (p.stopOnFull && state.items >= Number(p.capacity)) goal = `Инвентарь заполнен: ${state.items} мест.`;
    if (macro.repeats > 0 && state.cycles >= macro.repeats) goal = `Выполнено повторений: ${macro.repeats}.`;
    if (goal) return finish(`${goal} ${tick.detail}`, true);
    state.resumeAt = state.clock + NEVERFISH.POPUP_VERIFY_DELAY_SECS + 0.6;
    state.nextAt = state.resumeAt;
    state.phase = 'waiting';
    const event: RuntimeEvent | undefined = a.safety.logLevel === 'verbose' || (a.safety.logLevel === 'normal' && state.cycles % 3 === 0)
      ? { title: `Цикл выполнен: ${macro.name}`, detail: tick.detail, type: 'success' } : undefined;
    return { runtime: state, completed: true, event };
  }

  if (state.clock < state.nextAt) {
    // Live stage narration for the staged kinds (neverfish-style progress).
    state.lastDetail = stageDetail(macro, a, state);
    return { runtime: state, completed: false };
  }

  const confidence = [98, 94, 97, 91, 96, 95, 78, 93][state.attempts % 8];
  const timeout = cycleSeconds(macro, state.cursor, a) > a.safety.cycleTimeout;
  const collision = macro.kind === 'racing' && p.driving === 'fast' && !p.brakeAssist && state.attempts % 6 === 5;
  state.attempts += 1;
  if (forceFailure || timeout || confidence < a.safety.confidence || collision) {
    const reason = forceFailure ? 'Тестовая ошибка распознавания' : timeout ? `Тайм-аут цикла: ${a.safety.cycleTimeout} сек.` : collision ? 'Модель: ошибка прохождения поворота' : `Модель: уверенность ${confidence}% ниже порога ${a.safety.confidence}%`;
    if (a.safety.onError === 'stop' || (a.safety.onError === 'retry' && state.retries >= a.safety.retryLimit)) return finish(reason + (a.safety.onError === 'retry' ? '. Повторные попытки исчерпаны.' : ''), false, true);
    const retry = a.safety.onError === 'retry';
    if (!retry) state.cursor += 1;
    if (!retry && macro.kind === 'quests' && p.stopWhenComplete && state.cursor >= questList(a).length) return finish(`Список завершён. Последний цикл пропущен: ${reason}.`, false, true);
    if (!retry && macro.kind === 'artifacts' && !p.trackRespawn && state.cursor >= 6) return finish(`Маршрут завершён. Последняя точка пропущена: ${reason}.`, false, true);
    state = { ...state, retries: retry ? state.retries + 1 : 0, phase: retry ? 'retry' : 'waiting', resumeAt: state.clock + (retry ? a.safety.retryDelay : macro.delay), lastDetail: reason };
    state.nextAt = state.resumeAt + Math.min(cycleSeconds(macro, state.cursor, a), a.safety.cycleTimeout);
    return { runtime: state, completed: false, event: { title: retry ? `Повтор: ${macro.name}` : `Цикл пропущен: ${macro.name}`, detail: `${reason}. ${retry ? `Попытка ${state.retries} из ${a.safety.retryLimit}` : 'Переход к следующему циклу'}`, type: 'warning' } };
  }

  let detail = '';
  let goal = '';
  let extraPause = 0;
  const index = state.cursor;
  if (macro.kind === 'racing') {
    const position = [2, 1, 3, 1, 4, 2][index % 6];
    if (p.goal === 'finish' || (p.goal === 'podium' && position <= 3) || (p.goal === 'win' && position === 1)) state.metric += 1;
    state.resource = Math.max(0, state.resource - Number(p.laps) * (p.driving === 'fast' ? 10 : p.driving === 'careful' ? 4 : 7));
    detail = `Финиш: ${position}-е место. Прочность: ${state.resource}%.`;
    if (p.autoRepair && state.resource <= Number(p.repairAt)) { state.resource = 100; extraPause = 10; detail += ' Обслуживание: пауза 10 сек.'; }
    if (!p.autoRepair && state.resource <= 10) goal = 'Требуется обслуживание автомобиля.';
    if (Number(p.targetWins) > 0 && state.metric >= Number(p.targetWins)) goal = `Цель выполнена: ${state.metric} успешных заездов.`;
  } else if (macro.kind === 'cafe') {
    const orders = orderList(a, index);
    const revenue = Math.round(orders.reduce((sum, item) => sum + item.price, 0) * (p.quality === 'premium' ? 1.3 : 1) * (p.collectTips ? 1.1 : 1));
    if (state.resource < orders.length * 8) return finish('Недостаточно ингредиентов для следующего заказа.');
    state.metric += revenue; state.items += orders.length; state.resource -= orders.length * 8;
    detail = `Подано: ${orders.length}. Выручка +${revenue}, всего ${state.metric}. Запасы: ${state.resource}%.`;
    if (p.autoRestock && state.resource <= Number(p.restockAt)) {
      if (state.spent + 200 <= Number(p.restockBudget)) { state.spent += 200; state.resource = 100; extraPause = 5; detail += ' Запасы пополнены за 200 монет.'; }
      else goal = 'Бюджет закупок исчерпан.';
    }
    if (!p.autoRestock && state.resource < orders.length * 8) goal = 'Запасы закончились. Автопополнение выключено.';
    if (Number(p.revenueTarget) > 0 && state.metric >= Number(p.revenueTarget)) goal = `Целевая выручка достигнута: ${state.metric} монет.`;
    if (Number(p.ordersTarget) > 0 && state.items >= Number(p.ordersTarget)) goal = `Выполнен лимит заказов: ${state.items}.`;
  } else if (macro.kind === 'quests') {
    const tasks = questList(a);
    const task = tasks[index % tasks.length];
    if (!task) return finish('Нет заданий, соответствующих выбранным фильтрам.');
    if (state.resource - task.energy < Number(p.energyReserve)) {
      if (p.useConsumables && !state.restored && 100 - task.energy >= Number(p.energyReserve)) { state.resource = 100; state.restored = true; extraPause = 3; }
      else return finish(`Достигнут резерв энергии: ${p.energyReserve}%.`);
    }
    state.resource -= task.energy; state.metric += 1;
    detail = `${task.name}. ${p.autoCollect ? `Награда получена: ${task.reward}.` : 'Награда ожидает получения.'} Энергия: ${state.resource}%.`;
    if (p.stopWhenComplete && index + 1 >= tasks.length) goal = 'Все подходящие задания в списке выполнены.';
    if (Number(p.target) > 0 && state.metric >= Number(p.target)) goal = `Выполнено заданий: ${state.metric}.`;
  } else {
    const rarity = ['rare', 'common', 'epic', 'rare', 'common', 'epic'][index % 6];
    const type = ['relics', 'materials', 'fragments'][index % 3];
    const duplicate = index > 0 && index % 4 === 3;
    const allowed = (p.types as string[]).includes(type) && (p.rarity === 'all' || (p.rarity === 'rare' && rarity !== 'common') || rarity === 'epic') && !(p.ignoreOwned && duplicate);
    const count = allowed && p.autoPickup ? (Number(p.scanRadius) >= 60 ? 2 : 1) : 0;
    state.metric += count; state.items += count;
    detail = count ? `Найдено: ${count}. ${parameterLabel(macro.kind, 'types', [type])}. Заполнение: ${state.items}%.` : `Точка проверена. ${!p.autoPickup ? 'Разведка без сбора.' : duplicate && p.ignoreOwned ? 'Дубликат пропущен.' : 'Предмет не соответствует фильтрам.'}`;
    if (state.items >= Number(p.inventoryLimit)) goal = `Инвентарь достиг порога ${p.inventoryLimit}%.`;
    if (Number(p.target) > 0 && state.metric >= Number(p.target)) goal = `Собрано предметов: ${state.metric}.`;
    if ((index + 1) % 6 === 0) { if (p.trackRespawn) { extraPause = Number(p.respawnWait); detail += ` Ожидание точек: ${extraPause} сек.`; } else goal = 'Маршрут пройден. Повторный обход выключен.'; }
  }

  state.cycles += 1; state.cursor += 1; state.retries = 0; state.lastDetail = detail;
  if (macro.repeats > 0 && state.cycles >= macro.repeats) goal = `Выполнено повторений: ${macro.repeats}.`;
  if (goal) return finish(`${goal} ${detail}`, true);
  if (a.execution.breakEvery > 0 && state.cycles % a.execution.breakEvery === 0) extraPause += a.execution.breakSeconds;
  const variation = a.execution.intervalMode === 'variable' ? ((state.cycles % 5) - 2) / 2 * a.execution.variation / 100 : 0;
  const interval = Math.max(.1, macro.delay * (1 + variation));
  state.resumeAt = state.clock + interval + extraPause;
  state.nextAt = state.resumeAt + Math.min(cycleSeconds(macro, state.cursor, a), a.safety.cycleTimeout);
  state.phase = extraPause ? 'break' : 'waiting';
  let event: RuntimeEvent | undefined;
  if (extraPause && a.safety.logLevel !== 'errors') event = { title: `Перерыв: ${macro.name}`, detail: `${Math.round(extraPause)} сек. ${detail}`, type: 'info' };
  else if (a.safety.logLevel === 'verbose' || (a.safety.logLevel === 'normal' && state.cycles % 5 === 0)) event = { title: `Цикл выполнен: ${macro.name}`, detail, type: 'success' };
  return { runtime: state, completed: true, event };
}

export interface PreviewReport {
  steps: PlanStep[];
  events: { seconds: number; detail: string; warning: boolean }[];
  cycles: number;
  duration: number;
  metric: number;
  metricLabel: string;
  stopped: boolean;
  outcome: 'passed' | 'goal' | 'safety' | 'limit';
}

export function previewScenario(macro: Macro, scenario: PreviewScenario): PreviewReport {
  let runtime = createRuntime(macro);
  const report: PreviewReport = { steps: cyclePlan(macro), events: [], cycles: 0, duration: 0, metric: 0, metricLabel: MACRO_META[macro.kind].metric, stopped: false, outcome: 'passed' };
  if (scenario === 'hidden') {
    const result = advanceRuntime(macro, runtime, 1, true);
    report.events.push({ seconds: 0, detail: result.runtime.phase === 'paused' ? 'Фоновая вкладка: выполнение приостановлено. После возврата план продолжится.' : 'Фоновая вкладка: сценарий продолжает работу.', warning: false });
  }
  // The preview advances the same local scheduler without changing the workspace.
  for (let second = 0; second < 7200 && runtime.cycles < 3; second += 1) {
    const result = advanceRuntime(macro, runtime, 1, false, scenario === 'error' && runtime.attempts === 0);
    runtime = result.runtime;
    if (result.completed || result.event || result.stopReason) report.events.push({ seconds: Math.round(runtime.clock), detail: result.stopReason ?? result.event?.detail ?? runtime.lastDetail, warning: result.event?.type === 'warning' });
    if (result.stopReason) { report.stopped = true; report.outcome = result.event?.type === 'warning' ? 'safety' : 'goal'; break; }
  }
  report.cycles = runtime.cycles; report.duration = Math.round(runtime.clock); report.metric = runtime.metric;
  if (runtime.cycles < 3 && !report.stopped) {
    report.outcome = 'limit';
    report.events.push({ seconds: report.duration, detail: 'Достигнут предел проверки: 2 часа модельного времени. Увеличьте тайм-аут или измените условия.', warning: true });
  }
  report.events = report.events.slice(-8);
  return report;
}