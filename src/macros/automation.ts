import type { Macro, MacroKind } from '../data';

export type ParameterValue = string | number | boolean | string[];
export type MacroPreset = 'balanced' | 'careful' | 'fast';
export type EditorTab = 'parameters' | 'execution' | 'safety';
export interface MacroAutomation {
  version: 1;
  parameters: Record<string, ParameterValue>;
  execution: {
    startDelay: number;
    intervalMode: 'fixed' | 'variable';
    variation: number;
    breakEvery: number;
    breakSeconds: number;
    maxMinutes: number;
    notifications: 'silent' | 'finish' | 'all';
  };
  safety: {
    confidence: number;
    cycleTimeout: number;
    onError: 'retry' | 'skip' | 'stop';
    retryLimit: number;
    retryDelay: number;
    pauseWhenHidden: boolean;
    logLevel: 'errors' | 'normal' | 'verbose';
  };
}

export interface ParameterField {
  key: string;
  label: string;
  description: string;
  section: string;
  type: 'select' | 'segments' | 'toggle' | 'range' | 'number' | 'multi' | 'text';
  default: ParameterValue;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  requires?: { key: string; value: ParameterValue };
}

const options = (...items: [string, string][]) => items.map(([value, label]) => ({ value, label }));

export const MACRO_META: Record<MacroKind, { name: string; title: string; description: string; metric: string }> = {
  fishing: { name: 'Рыбалка', title: 'Всё для идеального улова', description: 'Снасти, подсечка и бережное обращение с уловом.', metric: 'рыб сохранено' },
  racing: { name: 'Гонки', title: 'Ваш идеальный маршрут', description: 'Стиль вождения, ускорение и контроль автомобиля.', metric: 'заездов в цели' },
  cafe: { name: 'Кафе', title: 'Каждый заказ под контролем', description: 'Очередь, меню и управление запасами.', metric: 'выручка' },
  quests: { name: 'Задания', title: 'Прогресс в вашем ритме', description: 'Приоритеты, взаимодействия и расход энергии.', metric: 'заданий выполнено' },
  artifacts: { name: 'Артефакты', title: 'Ничего ценного не потеряется', description: 'Маршрут поиска, фильтры и заполнение инвентаря.', metric: 'находок собрано' },
};

export const PARAMETER_FIELDS: Record<MacroKind, ParameterField[]> = {
  fishing: [
    { key: 'location', label: 'Место ловли', description: 'Точка, из которой начинается сценарий', section: 'Место и снасти', type: 'select', default: 'current', options: options(['current', 'Текущая точка'], ['shore', 'Берег'], ['pier', 'Причал']) },
    { key: 'bait', label: 'Тип наживки', description: 'Влияет на модель поклёвки и размер улова', section: 'Место и снасти', type: 'select', default: 'universal', options: options(['universal', 'Универсальная'], ['insects', 'Насекомые'], ['lure', 'Блесна']) },
    { key: 'castPower', label: 'Сила заброса', description: 'Длительность удержания при забросе', section: 'Место и снасти', type: 'range', default: 70, min: 20, max: 100, step: 5, unit: '%' },
    { key: 'reactionMs', label: 'Задержка подсечки', description: 'Пауза после обнаружения поклёвки', section: 'Подсечка', type: 'range', default: 350, min: 100, max: 1500, step: 50, unit: 'мс' },
    { key: 'hookWindowMs', label: 'Окно подсечки', description: 'Должно быть больше задержки подсечки', section: 'Подсечка', type: 'number', default: 1200, min: 200, max: 3000, step: 50, unit: 'мс' },
    { key: 'autoRecast', label: 'Повторный заброс', description: 'Продолжать ловлю после завершения цикла', section: 'Подсечка', type: 'toggle', default: true },
    { key: 'catchMode', label: 'Приоритет улова', description: 'Какую рыбу оставлять в инвентаре', section: 'Улов и ограничения', type: 'segments', default: 'all', options: options(['all', 'Любой'], ['rare', 'Редкий'], ['trophy', 'Трофей']) },
    { key: 'releaseSmall', label: 'Отпускать мелкую рыбу', description: 'Улов ниже минимального веса не сохраняется', section: 'Улов и ограничения', type: 'toggle', default: true },
    { key: 'minWeight', label: 'Минимальный вес', description: 'Порог для сохранения пойманной рыбы', section: 'Улов и ограничения', type: 'range', default: 2, min: 0, max: 20, step: .5, unit: 'кг', requires: { key: 'releaseSmall', value: true } },
    { key: 'catchTarget', label: 'Целевой улов', description: 'Остановиться после нужного количества. 0 = без лимита', section: 'Улов и ограничения', type: 'number', default: 0, min: 0, max: 999, step: 1, unit: 'рыб' },
    { key: 'stopOnFull', label: 'Остановка при заполнении', description: 'Не продолжать с заполненным инвентарём', section: 'Улов и ограничения', type: 'toggle', default: true },
    { key: 'capacity', label: 'Свободные ячейки', description: 'Количество мест для улова на старте', section: 'Улов и ограничения', type: 'number', default: 60, min: 1, max: 500, step: 1, unit: 'мест', requires: { key: 'stopOnFull', value: true } },
  ],
  racing: [
    { key: 'route', label: 'Маршрут', description: 'Схема прохождения демонстрационного заезда', section: 'Маршрут и автомобиль', type: 'select', default: 'city', options: options(['city', 'Городское кольцо'], ['coast', 'Прибрежный маршрут'], ['custom', 'Свой маршрут']) },
    { key: 'routeName', label: 'Название маршрута', description: 'Метка пользовательского маршрута в журнале', section: 'Маршрут и автомобиль', type: 'text', default: 'Мой маршрут', max: 60, requires: { key: 'route', value: 'custom' } },
    { key: 'laps', label: 'Кругов в заезде', description: 'Количество кругов до финиша', section: 'Маршрут и автомобиль', type: 'number', default: 2, min: 1, max: 10, step: 1, unit: 'круга' },
    { key: 'driving', label: 'Стиль вождения', description: 'Баланс между временем и стабильностью', section: 'Вождение', type: 'segments', default: 'balanced', options: options(['careful', 'Плавно'], ['balanced', 'Баланс'], ['fast', 'Быстро']) },
    { key: 'speedLimit', label: 'Ограничение скорости', description: 'Целевая скорость в модели маршрута', section: 'Вождение', type: 'range', default: 140, min: 60, max: 240, step: 10, unit: 'км/ч' },
    { key: 'boost', label: 'Использовать ускорение', description: 'Сокращать время прохождения прямых участков', section: 'Вождение', type: 'toggle', default: true },
    { key: 'boostMode', label: 'Момент ускорения', description: 'Выбор подходящего участка маршрута', section: 'Вождение', type: 'segments', default: 'straight', options: options(['straight', 'На прямой'], ['exit', 'После поворота']), requires: { key: 'boost', value: true } },
    { key: 'brakeAssist', label: 'Помощь при торможении', description: 'Повышает стабильность на сложных поворотах', section: 'Вождение', type: 'toggle', default: true },
    { key: 'goal', label: 'Цель заезда', description: 'Какие результаты засчитывать в прогресс', section: 'Результат и обслуживание', type: 'segments', default: 'finish', options: options(['finish', 'Финиш'], ['podium', 'Топ-3'], ['win', 'Победа']) },
    { key: 'targetWins', label: 'Успешных заездов', description: 'Остановиться после достижения цели. 0 = без лимита', section: 'Результат и обслуживание', type: 'number', default: 0, min: 0, max: 1000, step: 1, unit: 'заездов' },
    { key: 'autoRepair', label: 'Обслуживание автомобиля', description: 'Восстанавливать прочность между заездами', section: 'Результат и обслуживание', type: 'toggle', default: true },
    { key: 'repairAt', label: 'Порог обслуживания', description: 'Начать обслуживание при низкой прочности', section: 'Результат и обслуживание', type: 'range', default: 30, min: 10, max: 70, step: 5, unit: '%', requires: { key: 'autoRepair', value: true } },
  ],
  cafe: [
    { key: 'station', label: 'Рабочая зона', description: 'Место обслуживания для этого сценария', section: 'Меню и очередь', type: 'select', default: 'counter', options: options(['counter', 'Основная стойка'], ['window', 'Заказы у окна'], ['terrace', 'Терраса']) },
    { key: 'menu', label: 'Позиции меню', description: 'Хотя бы одна позиция должна быть включена', section: 'Меню и очередь', type: 'multi', default: ['coffee', 'tea', 'dessert'], options: options(['coffee', 'Кофе'], ['tea', 'Чай'], ['dessert', 'Десерты'], ['meal', 'Блюда']) },
    { key: 'orderPolicy', label: 'Приоритет заказов', description: 'Порядок обработки поступивших заказов', section: 'Меню и очередь', type: 'segments', default: 'queue', options: options(['queue', 'По очереди'], ['quick', 'Быстрые'], ['profit', 'Доходные']) },
    { key: 'parallelOrders', label: 'Заказов за цикл', description: 'Сколько заказов готовить за один подход', section: 'Обслуживание', type: 'number', default: 2, min: 1, max: 4, step: 1, unit: 'заказа' },
    { key: 'quality', label: 'Качество подачи', description: 'Более тщательная подача требует больше времени', section: 'Обслуживание', type: 'segments', default: 'standard', options: options(['standard', 'Стандарт'], ['premium', 'Премиум']) },
    { key: 'serveDelayMs', label: 'Пауза перед подачей', description: 'Задержка между приготовлением и выдачей', section: 'Обслуживание', type: 'range', default: 800, min: 200, max: 3000, step: 100, unit: 'мс' },
    { key: 'collectTips', label: 'Собирать чаевые', description: 'Включать чаевые в итоговую выручку', section: 'Обслуживание', type: 'toggle', default: true },
    { key: 'autoRestock', label: 'Пополнять запасы', description: 'Заказывать ингредиенты, когда они заканчиваются', section: 'Запасы и цели', type: 'toggle', default: true },
    { key: 'restockAt', label: 'Порог пополнения', description: 'Остаток ингредиентов перед новым заказом', section: 'Запасы и цели', type: 'range', default: 20, min: 10, max: 50, step: 5, unit: '%', requires: { key: 'autoRestock', value: true } },
    { key: 'restockBudget', label: 'Бюджет закупок', description: 'Максимум расходов на ингредиенты за сессию', section: 'Запасы и цели', type: 'number', default: 2000, min: 0, max: 100000, step: 100, unit: 'монет', requires: { key: 'autoRestock', value: true } },
    { key: 'revenueTarget', label: 'Целевая выручка', description: 'Завершить работу при достижении суммы. 0 = без лимита', section: 'Запасы и цели', type: 'number', default: 0, min: 0, max: 1000000, step: 100, unit: 'монет' },
    { key: 'ordersTarget', label: 'Лимит заказов', description: 'Количество обслуженных заказов. 0 = без лимита', section: 'Запасы и цели', type: 'number', default: 0, min: 0, max: 9999, step: 1, unit: 'заказов' },
  ],
  quests: [
    { key: 'types', label: 'Типы заданий', description: 'Категории для списка выполнения', section: 'Выбор заданий', type: 'multi', default: ['daily'], options: options(['daily', 'Ежедневные'], ['weekly', 'Недельные'], ['side', 'Побочные']) },
    { key: 'priority', label: 'Приоритет выполнения', description: 'Как упорядочивать выбранные задания', section: 'Выбор заданий', type: 'segments', default: 'nearest', options: options(['nearest', 'Ближайшие'], ['quick', 'Быстрые'], ['reward', 'Награда']) },
    { key: 'difficulty', label: 'Сложность', description: 'Какие задания включать в план', section: 'Выбор заданий', type: 'segments', default: 'normal', options: options(['easy', 'Лёгкие'], ['normal', 'Обычные'], ['any', 'Любые']) },
    { key: 'route', label: 'Построение пути', description: 'Выбор маршрута между целями', section: 'Взаимодействие', type: 'segments', default: 'safe', options: options(['safe', 'Безопасный'], ['short', 'Короткий']) },
    { key: 'skipDialog', label: 'Пропускать диалоги', description: 'Не задерживаться на повторяющихся репликах', section: 'Взаимодействие', type: 'toggle', default: true },
    { key: 'interactionMs', label: 'Задержка взаимодействия', description: 'Пауза перед подтверждением действия', section: 'Взаимодействие', type: 'range', default: 500, min: 200, max: 2000, step: 100, unit: 'мс' },
    { key: 'autoCollect', label: 'Забирать награды', description: 'Подтверждать получение после выполнения', section: 'Взаимодействие', type: 'toggle', default: true },
    { key: 'skipCombat', label: 'Пропускать боевые задания', description: 'Оставлять в очереди только мирные действия', section: 'Ресурсы и завершение', type: 'toggle', default: false },
    { key: 'energyReserve', label: 'Резерв энергии', description: 'Минимум энергии, который должен остаться', section: 'Ресурсы и завершение', type: 'range', default: 20, min: 0, max: 80, step: 5, unit: '%' },
    { key: 'useConsumables', label: 'Восстанавливать энергию', description: 'Разрешить одно восстановление за запуск', section: 'Ресурсы и завершение', type: 'toggle', default: false },
    { key: 'target', label: 'Цель по заданиям', description: 'Остановиться после выполнения цели. 0 = без лимита', section: 'Ресурсы и завершение', type: 'number', default: 0, min: 0, max: 999, step: 1, unit: 'заданий' },
    { key: 'stopWhenComplete', label: 'Завершить после списка', description: 'Не повторять список после полного обхода', section: 'Ресурсы и завершение', type: 'toggle', default: true },
  ],
  artifacts: [
    { key: 'zone', label: 'Зона поиска', description: 'Область для обхода точек сбора', section: 'Маршрут поиска', type: 'select', default: 'current', options: options(['current', 'Текущая область'], ['urban', 'Городские кварталы'], ['outskirts', 'Окраины'], ['underground', 'Подземные зоны']) },
    { key: 'route', label: 'Порядок обхода', description: 'Переход между точками маршрута', section: 'Маршрут поиска', type: 'segments', default: 'loop', options: options(['loop', 'По кругу'], ['nearest', 'Ближайшие']) },
    { key: 'scanRadius', label: 'Радиус сканирования', description: 'Дистанция поиска в демонстрационной модели', section: 'Маршрут поиска', type: 'range', default: 40, min: 10, max: 100, step: 5, unit: 'м' },
    { key: 'rarity', label: 'Минимальная редкость', description: 'Фильтр предметов для сбора', section: 'Фильтры и сбор', type: 'segments', default: 'all', options: options(['all', 'Любая'], ['rare', 'Редкая'], ['epic', 'Эпическая']) },
    { key: 'types', label: 'Типы находок', description: 'Какие предметы включать в сбор', section: 'Фильтры и сбор', type: 'multi', default: ['relics', 'fragments'], options: options(['relics', 'Реликвии'], ['fragments', 'Фрагменты'], ['materials', 'Материалы']) },
    { key: 'autoPickup', label: 'Автоматический сбор', description: 'Выключите для режима разведки без сбора', section: 'Фильтры и сбор', type: 'toggle', default: true },
    { key: 'pickupDelayMs', label: 'Задержка подбора', description: 'Пауза после обнаружения предмета', section: 'Фильтры и сбор', type: 'range', default: 400, min: 100, max: 2000, step: 50, unit: 'мс', requires: { key: 'autoPickup', value: true } },
    { key: 'ignoreOwned', label: 'Пропускать дубликаты', description: 'Не подбирать уже найденные предметы', section: 'Фильтры и сбор', type: 'toggle', default: true },
    { key: 'inventoryLimit', label: 'Заполнение инвентаря', description: 'Остановить сбор при достижении порога', section: 'Лимиты и повторный обход', type: 'range', default: 90, min: 10, max: 100, step: 5, unit: '%' },
    { key: 'target', label: 'Цель по находкам', description: 'Сколько предметов собрать. 0 = без лимита', section: 'Лимиты и повторный обход', type: 'number', default: 0, min: 0, max: 9999, step: 1, unit: 'предметов' },
    { key: 'trackRespawn', label: 'Повторять маршрут', description: 'Дождаться восстановления точек после обхода', section: 'Лимиты и повторный обход', type: 'toggle', default: true },
    { key: 'respawnWait', label: 'Ожидание восстановления', description: 'Пауза после обхода шести точек', section: 'Лимиты и повторный обход', type: 'number', default: 60, min: 10, max: 900, step: 10, unit: 'сек.', requires: { key: 'trackRespawn', value: true } },
  ],
};

export function defaultAutomation(kind: MacroKind): MacroAutomation {
  return {
    version: 1,
    parameters: Object.fromEntries(PARAMETER_FIELDS[kind].map((field) => [field.key, Array.isArray(field.default) ? [...field.default] : field.default])),
    execution: { startDelay: 2, intervalMode: 'fixed', variation: 15, breakEvery: 0, breakSeconds: 15, maxMinutes: 0, notifications: 'finish' },
    safety: { confidence: 80, cycleTimeout: 120, onError: 'retry', retryLimit: 2, retryDelay: 3, pauseWhenHidden: true, logLevel: 'normal' },
  };
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}: неверный формат параметров.`);
  return value as Record<string, unknown>;
}

function num(value: unknown, label: string, min: number, max: number, step = 1): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || Math.abs((value - min) / step - Math.round((value - min) / step)) > .00001) throw new Error(`${label}: допустимо от ${min} до ${max}, шаг ${step}.`);
  return value;
}

function choice<T extends string>(value: unknown, label: string, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) throw new Error(`${label}: неизвестное значение.`);
  return value as T;
}

function bool(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label}: ожидался переключатель true / false.`);
  return value;
}

export function normalizeAutomation(kind: MacroKind, value: unknown): MacroAutomation {
  const defaults = defaultAutomation(kind);
  if (value === undefined) return defaults;
  const root = object(value, 'Настройки макроса');
  if (root.version !== 1) throw new Error('Неизвестная версия расширенных настроек макроса.');
  const parameters = root.parameters === undefined ? {} : object(root.parameters, 'Параметры категории');
  for (const field of PARAMETER_FIELDS[kind]) {
    const entry = parameters[field.key] === undefined ? defaults.parameters[field.key] : parameters[field.key];
    if (field.type === 'toggle') defaults.parameters[field.key] = bool(entry, field.label);
    else if (field.type === 'number' || field.type === 'range') defaults.parameters[field.key] = num(entry, field.label, field.min ?? 0, field.max ?? 9999, field.step);
    else if (field.type === 'text') {
      if (typeof entry !== 'string' || entry.length > (field.max ?? 60)) throw new Error(`${field.label}: слишком длинный или некорректный текст.`);
      defaults.parameters[field.key] = entry.trim();
    } else if (field.type === 'multi') {
      if (!Array.isArray(entry) || !entry.length || entry.length > (field.options?.length ?? 0)) throw new Error(`${field.label}: выберите хотя бы один вариант.`);
      defaults.parameters[field.key] = [...new Set(entry.map((item) => choice(item, field.label, field.options!.map((option) => option.value))))];
    } else defaults.parameters[field.key] = choice(entry, field.label, field.options!.map((option) => option.value));
  }
  const rawExecution = root.execution === undefined ? {} : object(root.execution, 'Выполнение');
  const e = { ...defaults.execution, ...rawExecution };
  defaults.execution = {
    startDelay: num(e.startDelay, 'Задержка старта', 0, 300), intervalMode: choice(e.intervalMode, 'Тип интервала', ['fixed', 'variable']),
    variation: num(e.variation, 'Разброс интервала', 0, 50, 5), breakEvery: num(e.breakEvery, 'Частота перерыва', 0, 1000),
    breakSeconds: num(e.breakSeconds, 'Длительность перерыва', 5, 600, 5), maxMinutes: num(e.maxMinutes, 'Лимит времени', 0, 480),
    notifications: choice(e.notifications, 'Уведомления', ['silent', 'finish', 'all']),
  };
  const rawSafety = root.safety === undefined ? {} : object(root.safety, 'Защита');
  const s = { ...defaults.safety, ...rawSafety };
  defaults.safety = {
    confidence: num(s.confidence, 'Порог распознавания', 50, 99), cycleTimeout: num(s.cycleTimeout, 'Тайм-аут цикла', 10, 600, 5),
    onError: choice(s.onError, 'При ошибке', ['retry', 'skip', 'stop']), retryLimit: num(s.retryLimit, 'Число повторных попыток', 0, 5),
    retryDelay: num(s.retryDelay, 'Пауза перед повтором', 1, 60), pauseWhenHidden: bool(s.pauseWhenHidden, 'Пауза в фоновой вкладке'),
    logLevel: choice(s.logLevel, 'Подробность журнала', ['errors', 'normal', 'verbose']),
  };
  if (kind === 'fishing' && Number(defaults.parameters.reactionMs) >= Number(defaults.parameters.hookWindowMs)) throw new Error('Окно подсечки должно быть больше задержки подсечки.');
  if (kind === 'racing' && defaults.parameters.route === 'custom' && !String(defaults.parameters.routeName).trim()) throw new Error('Укажите название пользовательского маршрута.');
  if (kind === 'artifacts' && !defaults.parameters.autoPickup && Number(defaults.parameters.target) > 0) throw new Error('Для цели по находкам включите автоматический сбор или установите цель 0.');
  return defaults;
}

export function getAutomation(macro: Macro): MacroAutomation {
  try { return normalizeAutomation(macro.kind, macro.automation); }
  catch { return defaultAutomation(macro.kind); }
}

export function presetAutomation(kind: MacroKind, preset: MacroPreset): { automation: MacroAutomation; delay: number; repeats: number } {
  const automation = defaultAutomation(kind);
  const delay = { fishing: 4, racing: 6, cafe: 5, quests: 8, artifacts: 7 }[kind];
  if (preset === 'careful') {
    automation.execution = { ...automation.execution, startDelay: 5, breakEvery: 10, breakSeconds: 30, intervalMode: 'variable', maxMinutes: 60 };
    automation.safety = { ...automation.safety, confidence: 90, retryLimit: 3, retryDelay: 5 };
    if (kind === 'fishing') { automation.parameters.castPower = 60; automation.parameters.minWeight = 3; }
    if (kind === 'racing') { automation.parameters.driving = 'careful'; automation.parameters.speedLimit = 100; automation.parameters.boost = false; automation.parameters.repairAt = 50; }
    if (kind === 'cafe') { automation.parameters.parallelOrders = 1; automation.parameters.quality = 'premium'; automation.parameters.serveDelayMs = 1200; }
    if (kind === 'quests') { automation.parameters.skipCombat = true; automation.parameters.energyReserve = 40; }
    if (kind === 'artifacts') { automation.parameters.scanRadius = 60; automation.parameters.inventoryLimit = 75; automation.parameters.pickupDelayMs = 700; }
  } else if (preset === 'fast') {
    automation.execution.startDelay = 0;
    automation.safety.confidence = 75;
    if (kind === 'fishing') { automation.parameters.reactionMs = 200; automation.parameters.releaseSmall = false; }
    if (kind === 'racing') { automation.parameters.driving = 'fast'; automation.parameters.speedLimit = 200; }
    if (kind === 'cafe') { automation.parameters.parallelOrders = 3; automation.parameters.orderPolicy = 'quick'; automation.parameters.serveDelayMs = 300; }
    if (kind === 'quests') { automation.parameters.priority = 'quick'; automation.parameters.route = 'short'; automation.parameters.interactionMs = 200; }
    if (kind === 'artifacts') { automation.parameters.route = 'nearest'; automation.parameters.pickupDelayMs = 200; automation.parameters.ignoreOwned = false; }
  }
  return { automation, delay: preset === 'careful' ? delay + 3 : preset === 'fast' ? Math.max(1, delay - 2) : delay, repeats: 0 };
}

export function parameterLabel(kind: MacroKind, key: string, value: ParameterValue): string {
  const field = PARAMETER_FIELDS[kind].find((item) => item.key === key);
  if (Array.isArray(value)) return value.map((item) => field?.options?.find((option) => option.value === item)?.label ?? item).join(', ');
  return field?.options?.find((option) => option.value === value)?.label ?? String(value);
}