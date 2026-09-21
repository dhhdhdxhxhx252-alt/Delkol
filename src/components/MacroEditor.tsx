import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Check, ChevronDown, CircleCheck, Clock3, FlaskConical, Info, LoaderCircle, Play, RotateCcw, Save, Search, ShieldCheck, SlidersHorizontal, Trash2, TriangleAlert, X } from 'lucide-react';
import { uid, type Macro, type MacroGroup, type MacroKind } from '../data';
import { defaultAutomation, getAutomation, MACRO_META, normalizeAutomation, PARAMETER_FIELDS, presetAutomation, type EditorTab, type MacroAutomation, type MacroPreset, type ParameterField, type ParameterValue } from '../macros/automation';
import { cycleSeconds, previewScenario, type PreviewReport, type PreviewScenario } from '../macros/runtime';
import { EmptyState, IconButton, MacroIcon, Modal, Toggle } from './UI';

type Scope = 'base' | 'parameters' | 'execution' | 'safety';
type EditorField = ParameterField & { scope: Scope; tab: EditorTab };
type DraftMacro = Macro & { automation: MacroAutomation };
type Confirmation = 'discard' | 'reset' | 'delete' | null;
const options = (...items: [string, string][]) => items.map(([value, label]) => ({ value, label }));

const COMMON_FIELDS: EditorField[] = [
  { scope: 'base', tab: 'execution', section: 'Основная информация', key: 'name', label: 'Название макроса', description: 'Как сценарий отображается в вашем пространстве', type: 'text', default: '', max: 40 },
  { scope: 'base', tab: 'execution', section: 'Основная информация', key: 'description', label: 'Короткое описание', description: 'Необязательная заметка о назначении сценария', type: 'text', default: '', max: 90 },
  { scope: 'execution', tab: 'execution', section: 'Запуск и интервалы', key: 'startDelay', label: 'Задержка перед стартом', description: 'Время на подготовку после запуска сессии', type: 'number', default: 2, min: 0, max: 300, step: 1, unit: 'сек.' },
  { scope: 'base', tab: 'execution', section: 'Запуск и интервалы', key: 'delay', label: 'Пауза между циклами', description: 'Интервал после завершения всех действий', type: 'number', default: 4, min: 1, max: 60, step: 1, unit: 'сек.' },
  { scope: 'execution', tab: 'execution', section: 'Запуск и интервалы', key: 'intervalMode', label: 'Тип интервала', description: 'Постоянная или плавно меняющаяся длительность', type: 'segments', default: 'fixed', options: options(['fixed', 'Фиксированный'], ['variable', 'С разбросом']) },
  { scope: 'execution', tab: 'execution', section: 'Запуск и интервалы', key: 'variation', label: 'Разброс интервала', description: 'Допустимое изменение паузы в обе стороны', type: 'range', default: 15, min: 0, max: 50, step: 5, unit: '%', requires: { key: 'intervalMode', value: 'variable' } },
  { scope: 'base', tab: 'execution', section: 'Повторения и перерывы', key: 'repeats', label: 'Количество повторений', description: '0 = повторять, пока не сработает условие остановки', type: 'number', default: 0, min: 0, max: 9999, step: 1, unit: 'циклов' },
  { scope: 'execution', tab: 'execution', section: 'Повторения и перерывы', key: 'maxMinutes', label: 'Лимит времени', description: 'Максимум активного времени. 0 = без ограничения', type: 'number', default: 0, min: 0, max: 480, step: 1, unit: 'мин.' },
  { scope: 'execution', tab: 'execution', section: 'Повторения и перерывы', key: 'breakEvery', label: 'Перерыв каждые', description: 'Количество успешных циклов. 0 = без перерывов', type: 'number', default: 0, min: 0, max: 1000, step: 1, unit: 'циклов' },
  { scope: 'execution', tab: 'execution', section: 'Повторения и перерывы', key: 'breakSeconds', label: 'Длительность перерыва', description: 'Дополнительный отдых между сериями циклов', type: 'number', default: 15, min: 5, max: 600, step: 5, unit: 'сек.' },
  { scope: 'safety', tab: 'safety', section: 'Распознавание и ошибки', key: 'confidence', label: 'Порог распознавания', description: 'Минимальная уверенность в демонстрационной модели', type: 'range', default: 80, min: 50, max: 99, step: 1, unit: '%' },
  { scope: 'safety', tab: 'safety', section: 'Распознавание и ошибки', key: 'cycleTimeout', label: 'Тайм-аут одного цикла', description: 'Не ждать ответа дольше заданного времени', type: 'number', default: 120, min: 10, max: 600, step: 5, unit: 'сек.' },
  { scope: 'safety', tab: 'safety', section: 'Распознавание и ошибки', key: 'onError', label: 'При ошибке', description: 'Действие при тайм-ауте или низкой уверенности', type: 'segments', default: 'retry', options: options(['retry', 'Повторить'], ['skip', 'Пропустить'], ['stop', 'Остановить']) },
  { scope: 'safety', tab: 'safety', section: 'Распознавание и ошибки', key: 'retryLimit', label: 'Повторных попыток', description: 'После исчерпания попыток макрос остановится', type: 'number', default: 2, min: 0, max: 5, step: 1, unit: 'раз', requires: { key: 'onError', value: 'retry' } },
  { scope: 'safety', tab: 'safety', section: 'Распознавание и ошибки', key: 'retryDelay', label: 'Пауза перед повтором', description: 'Подождать перед повторной попыткой', type: 'number', default: 3, min: 1, max: 60, step: 1, unit: 'сек.', requires: { key: 'onError', value: 'retry' } },
  { scope: 'safety', tab: 'safety', section: 'Фон и уведомления', key: 'pauseWhenHidden', label: 'Пауза в фоновой вкладке', description: 'Продолжить с той же точки после возвращения', type: 'toggle', default: true },
  { scope: 'safety', tab: 'safety', section: 'Фон и уведомления', key: 'logLevel', label: 'Подробность журнала', description: 'Сколько событий записывать во время работы', type: 'segments', default: 'normal', options: options(['errors', 'Ошибки'], ['normal', 'Обычно'], ['verbose', 'Подробно']) },
  { scope: 'execution', tab: 'safety', section: 'Фон и уведомления', key: 'notifications', label: 'Уведомления макроса', description: 'Учитывают общий переключатель уведомлений', type: 'segments', default: 'finish', options: options(['silent', 'Нет'], ['finish', 'В конце'], ['all', 'Все события']) },
];

const TABS: { id: EditorTab; label: string; icon: typeof SlidersHorizontal }[] = [{ id: 'parameters', label: 'Сценарий', icon: SlidersHorizontal }, { id: 'execution', label: 'Выполнение', icon: Clock3 }, { id: 'safety', label: 'Защита', icon: ShieldCheck }];

function initialDraft(macro?: Macro): DraftMacro {
  return macro ? { ...macro, automation: getAutomation(macro) } : { id: uid(), name: MACRO_META.fishing.name, description: '', kind: 'fishing', enabled: true, cycles: 0, delay: 4, repeats: 0, automation: defaultAutomation('fishing') };
}

export function MacroEditor({ macro, groups, initialGroupId, onSave, onCancel, onDelete }: { macro?: Macro; groups: MacroGroup[]; initialGroupId?: string; onSave: (macro: Macro, groupId?: string) => void; onCancel: () => void; onDelete: (macro: Macro) => void }) {
  const [initial] = useState(() => initialDraft(macro));
  const [draft, setDraft] = useState<DraftMacro>(initial);
  const [tab, setTab] = useState<EditorTab>('parameters');
  const [query, setQuery] = useState('');
  const [groupId, setGroupId] = useState(initialGroupId ?? '');
  const [preset, setPreset] = useState('custom');
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [testOpen, setTestOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const [report, setReport] = useState<PreviewReport | null>(null);
  const [scenario, setScenario] = useState<PreviewScenario>('normal');
  const scrollRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial) || groupId !== (initialGroupId ?? '');

  useEffect(() => () => window.clearTimeout(timerRef.current), []);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); if (!confirmation && !testing) formRef.current?.requestSubmit(); }
      if ((event.ctrlKey || event.metaKey) && ['f', 'k'].includes(event.key.toLowerCase())) { event.preventDefault(); if (!confirmation) { setTestOpen(false); searchRef.current?.focus(); } }
    };
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  }, [confirmation, testing]);
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: 0 }); }, [tab, testOpen, query]);

  const requestClose = () => {
    if (confirmation) { setConfirmation(null); return; }
    if (dirty) { setConfirmation('discard'); return; }
    onCancel();
  };

  const markChanged = () => { setPreset('custom'); setReport(null); setError(''); setNotice(''); };
  const changeKind = (kind: MacroKind) => {
    const next = presetAutomation(kind, 'balanced');
    setDraft((previous) => ({ ...previous, kind, name: previous.name === MACRO_META[previous.kind].name ? MACRO_META[kind].name : previous.name, ...next }));
    markChanged();
  };
  const updateField = (field: EditorField, value: ParameterValue) => {
    markChanged();
    setDraft((previous) => field.scope === 'base' ? { ...previous, [field.key]: value } : { ...previous, automation: { ...previous.automation, [field.scope]: { ...previous.automation[field.scope], [field.key]: value } } });
  };
  const fieldValue = (field: EditorField): ParameterValue => field.scope === 'base' ? draft[field.key as 'name' | 'description' | 'delay' | 'repeats'] : (draft.automation[field.scope] as Record<string, ParameterValue>)[field.key];
  const fieldDisabled = (field: EditorField) => {
    if (field.scope === 'execution' && field.key === 'breakSeconds') return draft.automation.execution.breakEvery === 0;
    return !!field.requires && (draft.automation[field.scope === 'base' ? 'parameters' : field.scope] as Record<string, ParameterValue>)[field.requires.key] !== field.requires.value;
  };
  const applyPreset = (value: MacroPreset) => {
    setDraft((previous) => ({ ...previous, ...presetAutomation(previous.kind, value) }));
    setPreset(value); setError(''); setReport(null); setConfirmation(null); setTestOpen(false);
    setNotice('Пресет применён к черновику. Сохраните, чтобы использовать его.');
  };

  const validatedDraft = (): DraftMacro | null => {
    if (!draft.name.trim()) { setError('Укажите название макроса во вкладке «Выполнение».'); setTab('execution'); setQuery(''); setTestOpen(false); return null; }
    if (!Number.isInteger(draft.delay) || draft.delay < 1 || draft.delay > 60 || !Number.isInteger(draft.repeats) || draft.repeats < 0 || draft.repeats > 9999) { setError('Проверьте паузу между циклами и количество повторений.'); setTab('execution'); setQuery(''); setTestOpen(false); return null; }
    try { return { ...draft, name: draft.name.trim(), description: draft.description.trim(), automation: normalizeAutomation(draft.kind, draft.automation) }; }
    catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Проверьте параметры макроса.';
      setError(message); setQuery(''); setTestOpen(false);
      const field = fields.find((entry) => message.toLocaleLowerCase('ru').includes(entry.label.toLocaleLowerCase('ru')));
      if (field) {
        setTab(field.tab);
        requestAnimationFrame(() => {
          const row = document.getElementById(`row-${field.scope}-${field.key}`);
          row?.scrollIntoView({ block: 'center' });
          row?.querySelector<HTMLElement>('input:not([disabled]), select:not([disabled]), button:not([disabled])')?.focus({ preventScroll: true });
        });
      }
      return null;
    }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (confirmation || testing) return;
    const valid = validatedDraft();
    if (valid) onSave(valid, groupId || undefined);
  };
  const runTest = (nextScenario = scenario) => {
    const valid = validatedDraft();
    if (!valid) return;
    window.clearTimeout(timerRef.current);
    setScenario(nextScenario); setTestOpen(true); setTesting(true); setReport(null); setError(''); setNotice('');
    timerRef.current = window.setTimeout(() => {
      try { setReport(previewScenario(valid, nextScenario)); }
      catch { setError('Не удалось построить модель. Проверьте параметры сценария.'); }
      setTesting(false);
    }, 450);
  };

  const fields: EditorField[] = [...PARAMETER_FIELDS[draft.kind].map((field) => ({ ...field, scope: 'parameters' as const, tab: 'parameters' as const })), ...COMMON_FIELDS];
  const term = query.trim().toLocaleLowerCase('ru');
  const matching = fields.filter((field) => term ? `${field.label} ${field.description} ${field.section} ${field.options?.map((option) => option.label).join(' ') ?? ''}`.toLocaleLowerCase('ru').includes(term) : field.tab === tab);
  const sections = [...new Set(matching.map((field) => `${field.tab}/${field.section}`))];
  const modelSeconds = cycleSeconds(draft);

  return <Modal title={macro ? macro.name : 'Новый макрос'} section="Макросы" hideHeading className="macro-settings-dialog" onClose={requestClose}>
    <form className="advanced-macro-editor" onSubmit={submit} ref={formRef} noValidate>
      <div className="macro-editor-identity" inert={!!confirmation}><MacroIcon kind={draft.kind} size={28} /><div><h2>{MACRO_META[draft.kind].title}</h2><p>{MACRO_META[draft.kind].description}</p></div><div className="macro-enabled-control"><span>{draft.enabled ? 'Включён' : 'Выключен'}</span><Toggle checked={draft.enabled} onChange={() => { setDraft({ ...draft, enabled: !draft.enabled }); setError(''); }} label="Включить макрос" /></div></div>
      <div className="macro-editor-toolbar" inert={!!confirmation}><div className="macro-parameter-search"><Search size={15} /><input ref={searchRef} data-autofocus aria-label="Поиск параметров макроса" placeholder="Найти параметр..." value={query} onChange={(event) => { setQuery(event.target.value); setTestOpen(false); }} /><kbd>Ctrl F</kbd>{query && <button type="button" aria-label="Очистить поиск" onClick={() => setQuery('')}><X size={13} /></button>}</div><div className="macro-preset-select"><SlidersHorizontal size={13} /><select aria-label="Пресет макроса" value={preset} onChange={(event) => applyPreset(event.target.value as MacroPreset)} disabled={testing}><option value="custom" disabled>Свой профиль</option><option value="balanced">Сбалансированный</option><option value="careful">Бережный</option><option value="fast">Быстрый</option></select><ChevronDown size={11} /></div></div>
      <div className="macro-tabs-row" inert={!!confirmation}><div className="macro-editor-tabs" role="tablist" aria-label="Разделы настройки макроса">{TABS.map(({ id, label, icon: Icon }, index) => <button type="button" role="tab" id={`macro-tab-${id}`} aria-selected={!testOpen && !term && tab === id} aria-controls="macro-editor-panel" tabIndex={tab === id ? 0 : -1} key={id} className={!testOpen && !term && tab === id ? 'active' : ''} onClick={() => { setTab(id); setQuery(''); setTestOpen(false); }} onKeyDown={(event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length;
        setTab(TABS[next].id); setQuery(''); setTestOpen(false); document.getElementById(`macro-tab-${TABS[next].id}`)?.focus();
      }}><Icon size={13} />{label}</button>)}</div><span className="macro-model-timing"><Clock3 size={11} />Модель цикла: {modelSeconds.toLocaleString('ru-RU')} с</span></div>
      <div className="macro-editor-scroll" id="macro-editor-panel" inert={!!confirmation} role={testOpen || term ? undefined : 'tabpanel'} aria-labelledby={testOpen || term ? undefined : `macro-tab-${tab}`} ref={scrollRef}>
        {testOpen ? <div className="macro-test-view"><div className="macro-test-heading"><button type="button" onClick={() => setTestOpen(false)}><ArrowLeft size={13} />К параметрам</button><span><FlaskConical size={13} />Проверка без запуска игры</span></div><h3>Проверим ваш сценарий</h3><p>Три цикла в ускоренной локальной модели. Настройки и счётчики пространства не меняются.</p><Segmented label="Сценарий проверки" value={scenario} choices={options(['normal', 'Обычный'], ['error', 'Ошибка'], ['hidden', 'Фоновая вкладка'])} disabled={testing} onChange={(value) => runTest(value as PreviewScenario)} />
          {testing && <div className="macro-test-loading" role="status"><LoaderCircle size={21} />Проверяем условия и строим последовательность...</div>}
          {report && <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .2 }}><div className={`macro-test-result ${['safety', 'limit'].includes(report.outcome) ? 'needs-attention' : ''}`}>{['safety', 'limit'].includes(report.outcome) ? <TriangleAlert size={17} /> : <CircleCheck size={17} />}<div><strong>{{ passed: 'Модель сценария выполнена', goal: 'Сработало условие завершения', safety: 'Сработала защитная остановка', limit: 'Проверка требует внимания' }[report.outcome]}</strong><span>Циклов: {report.cycles} / {report.duration} сек. модельного времени / {report.metric} {report.metricLabel}</span></div></div><div className="macro-test-steps"><h4>Последовательность действий</h4>{report.steps.map((step, index) => <div key={index}><span>{String(index + 1).padStart(2, '0')}</span><p>{step.title}</p><time>{step.seconds.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} с</time></div>)}</div><div className="macro-test-events"><h4>Результаты проверки</h4>{report.events.map((event, index) => <div key={index} className={event.warning ? 'warning' : ''}><time>{event.seconds} с</time><span>{event.warning ? <TriangleAlert size={12} /> : <Check size={12} />}</span><p>{event.detail}</p></div>)}</div><p className="macro-test-disclaimer">Распознавание, маршрут, улов и награды здесь моделируются. Подключения к игре нет.</p></motion.div>}
        </div> : <>
          {!macro && !term && tab === 'parameters' && <div className="macro-creation-fields"><div><label htmlFor="new-macro-kind">Категория сценария</label><select id="new-macro-kind" value={draft.kind} onChange={(event) => changeKind(event.target.value as MacroKind)}>{Object.entries(MACRO_META).map(([kind, meta]) => <option key={kind} value={kind}>{meta.name}</option>)}</select></div><div><label htmlFor="new-macro-group">Добавить в группу</label><select id="new-macro-group" value={groupId} onChange={(event) => setGroupId(event.target.value)}><option value="">Без группы</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></div></div>}
          {term && <div className="macro-search-count">Найдено параметров: {matching.length}<button type="button" onClick={() => setQuery('')}>Сбросить поиск</button></div>}
          {sections.map((section) => <section className="macro-parameter-section" key={section}><h3>{section.split('/')[1]}{term && <span>{TABS.find((item) => item.id === section.split('/')[0])?.label}</span>}</h3>{matching.filter((field) => `${field.tab}/${field.section}` === section).map((field) => <ParameterRow key={`${field.scope}-${field.key}`} field={field} value={fieldValue(field)} disabled={fieldDisabled(field)} onChange={(value) => updateField(field, value)} />)}</section>)}
          {!matching.length && <EmptyState icon={Search} title="Параметр не найден" description="Попробуйте «интервал», «цель» или «ошибка»." />}
        </>}
      </div>
      <AnimatePresence>{(error || notice) && <motion.div className={`macro-editor-message ${error ? 'is-error' : ''}`} role={error ? 'alert' : 'status'} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}><span>{error ? <TriangleAlert size={14} /> : <Info size={14} />}</span><p>{error || notice}</p><button type="button" aria-label="Скрыть сообщение" onClick={() => { setError(''); setNotice(''); }}><X size={12} /></button></motion.div>}</AnimatePresence>
      <div className="macro-editor-demo"><ShieldCheck size={12} /><span>Параметры сохраняются в конфиг и работают в локальной модели.</span></div>
      <div className="macro-editor-footer">
        {confirmation ? <div className="macro-inline-confirm" role="alert"><span>{confirmation === 'discard' ? 'Закрыть без сохранения?' : confirmation === 'reset' ? 'Вернуть базовые параметры?' : 'Удалить этот макрос?'}</span><button type="button" autoFocus className="button button-secondary" onClick={() => setConfirmation(null)}>Отмена</button><button type="button" className={`button ${confirmation === 'reset' ? 'button-primary' : 'button-danger'}`} onClick={() => {
          if (confirmation === 'discard') onCancel();
          if (confirmation === 'reset') applyPreset('balanced');
          if (confirmation === 'delete' && macro) onDelete(macro);
        }}>{confirmation === 'discard' ? 'Закрыть' : confirmation === 'reset' ? 'Сбросить' : 'Удалить'}</button></div> : <><div className="macro-footer-tools">{macro && <IconButton icon={Trash2} label="Удалить макрос" onClick={() => setConfirmation('delete')} />}<button type="button" className="macro-reset-button" onClick={() => setConfirmation('reset')} disabled={testing}><RotateCcw size={13} />Сбросить</button></div><button type="button" className="button button-secondary macro-test-button" onClick={() => runTest()} disabled={testing}>{testing ? <LoaderCircle size={13} className="spin-icon" /> : <Play size={12} />}Проверить</button><button type="submit" className="button button-primary" disabled={testing}><Save size={13} />{macro ? 'Сохранить' : 'Создать макрос'}</button></>}
      </div>
      <div className="macro-editor-keybar"><span><kbd>Tab</kbd>Навигация<kbd>Esc</kbd>Закрыть</span><span>{dirty && <i title="Есть несохранённые изменения" />}<kbd>Ctrl</kbd><kbd>Enter</kbd>Сохранить</span></div>
    </form>
  </Modal>;
}

function ParameterRow({ field, value, disabled, onChange }: { field: EditorField; value: ParameterValue; disabled: boolean; onChange: (value: ParameterValue) => void }) {
  const id = `macro-field-${field.scope}-${field.key}`;
  let control: ReactNode;
  if (field.type === 'toggle') control = <Toggle checked={Boolean(value)} label={field.label} disabled={disabled} onChange={() => onChange(!value)} />;
  else if (field.type === 'segments') control = <Segmented label={field.label} value={String(value)} choices={field.options!} disabled={disabled} onChange={onChange} />;
  else if (field.type === 'select') control = <div className="macro-select-control"><select id={id} aria-label={field.label} value={String(value)} disabled={disabled} onChange={(event) => onChange(event.target.value)}>{field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><ChevronDown size={11} /></div>;
  else if (field.type === 'multi') control = <div className="macro-multi-control" role="group" aria-label={field.label}>{field.options?.map((option) => <label key={option.value} className={(value as string[]).includes(option.value) ? 'selected' : ''}><input type="checkbox" checked={(value as string[]).includes(option.value)} disabled={disabled} onChange={() => onChange((value as string[]).includes(option.value) ? (value as string[]).filter((item) => item !== option.value) : [...value as string[], option.value])} /><span>{option.label}</span></label>)}</div>;
  else if (field.type === 'text') control = <input id={id} className="macro-text-input" aria-label={field.label} maxLength={field.max} disabled={disabled} value={String(value)} placeholder={field.key === 'description' ? 'Необязательно' : field.label} onChange={(event) => onChange(event.target.value)} />;
  else control = <div className={`macro-numeric-control ${field.type === 'range' ? 'with-range' : ''}`}>{field.type === 'range' && <input type="range" aria-label={`${field.label}: ползунок`} min={field.min} max={field.max} step={field.step} value={Number.isFinite(Number(value)) ? Number(value) : field.min} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} />}<label className="macro-number-input"><input id={id} aria-label={field.label} type="number" min={field.min} max={field.max} step={field.step} value={Number.isFinite(Number(value)) ? Number(value) : ''} disabled={disabled} onChange={(event) => onChange(event.target.value === '' ? Number.NaN : Number(event.target.value))} /><span>{field.unit}</span></label></div>;
  return <div id={`row-${field.scope}-${field.key}`} className={`macro-parameter-row ${disabled ? 'is-disabled' : ''} ${field.type === 'multi' ? 'has-multi' : ''}`}><div className="macro-parameter-copy"><label htmlFor={['text', 'number', 'range', 'select'].includes(field.type) ? id : undefined}>{field.label}</label><p>{field.description}</p></div><div className={`macro-parameter-control control-${field.type}`}>{control}</div></div>;
}

function Segmented({ label, value, choices, onChange, disabled = false }: { label: string; value: string; choices: { value: string; label: string }[]; onChange: (value: string) => void; disabled?: boolean }) {
  return <div className="macro-segmented" role="radiogroup" aria-label={label}>{choices.map((option, index) => <button type="button" role="radio" aria-checked={value === option.value} tabIndex={value === option.value ? 0 : -1} disabled={disabled} key={option.value} className={value === option.value ? 'selected' : ''} onClick={() => onChange(option.value)} onKeyDown={(event) => {
    if (!['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const next = (index + (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1) + choices.length) % choices.length;
    onChange(choices[next].value); event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus();
  }}>{option.label}</button>)}</div>;
}