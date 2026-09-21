import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, ArrowUpRight, BarChart3, Check, ChevronDown, ChevronRight, Copy, Download, FolderOpen, House, ScrollText, Search, Settings2, Shapes, ShieldCheck, UserRound } from 'lucide-react';
import { GROUP_COLORS, PAGE_LABELS, macroWord, uid, type Macro, type MacroGroup, type Page } from '../data';
import { BrandMark, EmptyState, MacroIcon } from './UI';
import { DepthIcon } from './DepthIcon';
import type { SavedConfig } from '../utils/config';
import { BRAND_NAME } from '../brand';

export function GroupEditor({ group, macros, onSave, onCancel }: { group?: MacroGroup; macros: Macro[]; onSave: (group: MacroGroup) => void; onCancel: () => void }) {
  const [name, setName] = useState(group?.name ?? '');
  const [description, setDescription] = useState(group?.description ?? '');
  const [color, setColor] = useState(group?.color ?? GROUP_COLORS[0]);
  const [selected, setSelected] = useState(group?.macroIds ?? []);
  const [error, setError] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) { setError('Придумайте название для группы.'); return; }
    onSave({ id: group?.id ?? uid(), name: name.trim(), description: description.trim(), color, macroIds: selected.filter((id) => macros.some((macro) => macro.id === id)) });
  };
  return <form onSubmit={submit} className="editor-form">
    <div className="form-field"><label htmlFor="group-name">Название группы</label><input id="group-name" placeholder="Например, спокойный вечер" maxLength={40} value={name} onChange={(event) => { setName(event.target.value); setError(''); }} required />{error && <small className="form-error">{error}</small>}</div>
    <div className="form-field"><label htmlFor="group-description">Описание<span>необязательно</span></label><input id="group-description" placeholder="Для чего эта группа?" maxLength={90} value={description} onChange={(event) => setDescription(event.target.value)} /></div>
    <div className="form-field"><label>Цвет группы</label><div className="color-picker" role="radiogroup" aria-label="Цвет группы">{GROUP_COLORS.map((item, index) => <button type="button" role="radio" aria-checked={color === item} aria-label={['Лавандовый', 'Шалфейный', 'Песочный', 'Голубой', 'Розовый', 'Серый'][index]} key={item} style={{ '--swatch': item } as CSSProperties} className={`color-swatch ${color === item ? 'selected' : ''}`} onClick={() => setColor(item)}>{color === item && <Check size={15} />}</button>)}</div></div>
    <div className="form-field"><label>Макросы в группе<span>{selected.length} выбрано</span></label><div className="macro-checklist">{macros.length ? macros.map((macro) => <label className="macro-check-option" key={macro.id}><MacroIcon kind={macro.kind} /><span>{macro.name}</span><input type="checkbox" checked={selected.includes(macro.id)} onChange={() => setSelected((previous) => previous.includes(macro.id) ? previous.filter((id) => id !== macro.id) : [...previous, macro.id])} /></label>) : <p className="muted checklist-empty">Сначала создайте макрос в разделе «Мои макросы».</p>}</div></div>
    <div className="modal-actions"><button type="button" className="button button-secondary" onClick={onCancel}>Отмена</button><button className="button button-primary" type="submit"><Check size={15} />{group ? 'Сохранить изменения' : 'Создать группу'}</button></div>
  </form>;
}

export function SearchDialog({ macros, groups, configs, onNavigate, onMacro, onConfig }: { macros: Macro[]; groups: MacroGroup[]; configs: SavedConfig[]; onNavigate: (page: Page, groupId?: string) => void; onMacro: (macro: Macro) => void; onConfig: (config: SavedConfig) => void }) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const resultsRef = useRef<HTMLDivElement>(null);
  const term = query.toLowerCase().trim();
  const pages = [{ page: 'overview' as Page, icon: House }, { page: 'macros' as Page, icon: Shapes }, { page: 'groups' as Page, icon: FolderOpen }, { page: 'stats' as Page, icon: BarChart3 }, { page: 'logs' as Page, icon: ScrollText }, { page: 'settings' as Page, icon: Settings2 }, { page: 'profile' as Page, icon: UserRound }];
  const matchingPages = pages.filter((item) => PAGE_LABELS[item.page].toLowerCase().includes(term));
  const matchingMacros = macros.filter((macro) => `${macro.name} ${macro.description}`.toLowerCase().includes(term));
  const matchingGroups = groups.filter((group) => group.name.toLowerCase().includes(term));
  const matchingConfigs = configs.filter((item) => `${item.config.name} ${item.config.description}`.toLowerCase().includes(term));
  const results = [
    ...matchingPages.map(({ page }) => ({ id: `search-page-${page}`, action: () => onNavigate(page) })),
    ...matchingMacros.map((macro) => ({ id: `search-macro-${macro.id}`, action: () => onMacro(macro) })),
    ...matchingGroups.map((group) => ({ id: `search-group-${group.id}`, action: () => onNavigate('groups', group.id) })),
    ...matchingConfigs.map((config) => ({ id: `search-config-${config.id}`, action: () => onConfig(config) })),
  ];

  useEffect(() => { resultsRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' }); }, [activeIndex, query]);
  const optionProps = (index: number) => ({
    id: results[index].id,
    role: 'option' as const,
    tabIndex: -1,
    className: `search-result ${activeIndex === index ? 'selected' : ''}`,
    'aria-selected': activeIndex === index,
    'data-active': activeIndex === index,
    onMouseEnter: () => setActiveIndex(index),
    onClick: results[index].action,
  });

  return <div className="search-dialog">
    <div className="command-search"><Search size={20} /><input role="combobox" aria-label="Поиск по пространству" aria-controls="command-results" aria-expanded="true" aria-autocomplete="list" aria-activedescendant={results[activeIndex]?.id} autoComplete="off" placeholder="Макросы, группы, разделы..." value={query} onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }} onKeyDown={(event) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        setActiveIndex((previous) => results.length ? (previous + direction + results.length) % results.length : 0);
      }
      if (event.key === 'Enter') { event.preventDefault(); results[activeIndex]?.action(); }
    }} /><kbd>Esc</kbd></div>
    <div className="search-results" id="command-results" role="listbox" aria-label="Результаты поиска" ref={resultsRef}>
      {matchingPages.length > 0 && <div className="search-result-section" role="group" aria-label="Разделы"><h3>Разделы</h3>{matchingPages.map(({ page, icon: Icon }, index) => <button key={page} {...optionProps(index)}><Icon size={17} /><span>{PAGE_LABELS[page]}</span><ArrowUpRight size={14} /></button>)}</div>}
      {matchingMacros.length > 0 && <div className="search-result-section" role="group" aria-label="Макросы"><h3>Макросы</h3>{matchingMacros.map((macro, index) => <button key={macro.id} {...optionProps(matchingPages.length + index)}><MacroIcon kind={macro.kind} size={20} /><span>{macro.name}<small>{macro.description}</small></span><ChevronRight size={14} /></button>)}</div>}
      {matchingGroups.length > 0 && <div className="search-result-section" role="group" aria-label="Группы"><h3>Группы</h3>{matchingGroups.map((group, index) => <button key={group.id} {...optionProps(matchingPages.length + matchingMacros.length + index)}><DepthIcon kind="folder" size={23} style={{ color: group.color }} /><span>{group.name}<small>{group.macroIds.length} {macroWord(group.macroIds.length)}</small></span><ChevronRight size={14} /></button>)}</div>}
      {matchingConfigs.length > 0 && <div className="search-result-section" role="group" aria-label="Конфигурации"><h3>Конфигурации</h3>{matchingConfigs.map((config, index) => <button key={config.id} {...optionProps(matchingPages.length + matchingMacros.length + matchingGroups.length + index)}><DepthIcon kind="config" size={24} /><span>{config.config.name}<small>{config.config.macros.length} {macroWord(config.config.macros.length)} / сохранённый конфиг</small></span><ChevronRight size={14} /></button>)}</div>}
      {!results.length && <EmptyState icon={Search} title="Ничего не нашлось" description="Попробуйте более короткий или другой запрос." />}
    </div>
    <div className="command-footer"><span>Стрелки: выбрать</span><span><kbd>Enter</kbd> открыть</span><span><kbd>Esc</kbd> закрыть</span></div>
  </div>;
}

export function ShareDialog({ macros, groups, name, onExport, onNotify }: { macros: Macro[]; groups: MacroGroup[]; name: string; onExport: () => void; onNotify: (message: string, type?: 'success' | 'info' | 'warning') => void }) {
  const [copied, setCopied] = useState(false);
  const summary = `${BRAND_NAME} / @${name}\n${macros.length} ${macroWord(macros.length)}\nГруппы: ${groups.map((group) => group.name).join(', ') || 'пока нет'}\nМакросы: ${macros.map((macro) => macro.name).join(', ') || 'пока нет'}\nЛокальное демонстрационное пространство`;
  const copy = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(summary);
      else {
        const textarea = document.createElement('textarea');
        textarea.value = summary; textarea.style.position = 'fixed'; textarea.style.opacity = '0';
        document.body.appendChild(textarea); textarea.select();
        const success = document.execCommand('copy'); textarea.remove();
        if (!success) throw new Error('Clipboard unavailable');
      }
      setCopied(true); onNotify('Сводка скопирована. Теперь её можно отправить.');
    } catch { onNotify('Буфер обмена недоступен. Скачайте конфигурацию.', 'warning'); }
  };
  return <div className="share-content">
    <div className="share-preview">
      <div><BrandMark small /><strong>{BRAND_NAME}</strong><span>@{name}</span></div>
      <p>{macros.length} {macroWord(macros.length)}<span className="inline-dot" />Группы: {groups.length}</p>
      <span>{groups.map((group) => group.name).join(' / ') || 'Ваше личное пространство'}</span>
    </div>
    <button className="share-option" onClick={copy}><span className="share-option-icon">{copied ? <Check size={19} /> : <Copy size={19} />}</span><span><strong>{copied ? 'Скопировано' : 'Скопировать сводку'}</strong><small>Короткий обзор для сообщения другу</small></span><ArrowUpRight size={16} /></button>
    <button className="share-option" onClick={onExport}><span className="share-option-icon"><DepthIcon kind="config" size={24} /></span><span><strong>Экспорт конфигурации</strong><small>Группы, макросы и настройки в JSON</small></span><Download size={16} /></button>
    <p className="form-demo-note"><ShieldCheck size={14} />Данные не отправляются на сторонние серверы.</p>
  </div>;
}

export function HelpContent({ shortcut, onGoSettings }: { shortcut: string; onGoSettings: () => void }) {
  const [open, setOpen] = useState(0);
  const questions = [
    { title: 'Как начать сессию?', answer: `Включите нужные макросы переключателями в разделе «Мои макросы». Нажмите «Начать сессию» на главной или клавишу ${shortcut}. Нажмите ещё раз, чтобы приостановить.` },
    { title: 'Как настроить отдельный макрос?', answer: 'Нажмите на название макроса. Во вкладке «Сценарий» находятся параметры его категории, во вкладке «Выполнение» интервалы и лимиты, в «Защите» обработка ошибок и уведомления. Можно выбрать пресет и проверить три модельных цикла кнопкой «Проверить». Изменения применятся только после сохранения и войдут в экспортированный конфиг.' },
    { title: 'Как работают группы?', answer: 'Создайте группу, выберите для неё цвет и добавьте макросы. При запуске включатся только макросы этой группы. Один макрос может входить в несколько групп.' },
    { title: 'Как сохранить или загрузить конфиг?', answer: 'Откройте «Настройки» и вкладку «Конфигурации». «Сохранить конфиг» добавит текущие макросы и настройки в библиотеку и предложит скачать JSON. «Добавить конфиг» проверит загруженный файл. Применение другого конфига остановит сессию и сохранит резервную копию текущих настроек.' },
    { title: 'Где сохраняются мои данные?', answer: 'Макросы, группы и конфиги сохраняются в браузере на этом устройстве. В отдельном разделе «Мой профиль» можно поменять имя, аватар и обложку. Личный профиль не включается в экспорт конфигураций и не изменяется при их применении.' },
    { title: 'Это подключено к игре?', answer: `Нет. Это интерактивная демонстрация ${BRAND_NAME}. Локальная модель учитывает параметры каждой категории, интервалы, цели, перерывы и обработку ошибок. Распознавание, улов, заезды, заказы и награды моделируются, а не считываются из игры. Для реальной автоматизации нужна отдельная интеграция.` },
  ];
  return <div className="help-content"><div className="help-shortcuts"><span><kbd>Ctrl K</kbd>Быстрый поиск</span><span><kbd>{shortcut}</kbd>Запуск / пауза</span></div><div className="faq-list">{questions.map((question, index) => <div className={`faq-item ${open === index ? 'open' : ''}`} key={question.title}><button aria-expanded={open === index} onClick={() => setOpen(open === index ? -1 : index)}>{question.title}<ChevronDown size={16} /></button><AnimatePresence>{open === index && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}><p>{question.answer}</p></motion.div>}</AnimatePresence></div>)}</div><button className="help-settings-link" onClick={onGoSettings}><Settings2 size={16} />Открыть настройки<ArrowUpRight size={15} /></button></div>;
}

export function ActivityChart({ range, cycles }: { range: string; cycles: number }) {
  const values = range === '1' ? [5, 8, 6, 13, 12, 18, 12, 17, 23, 19, 25, 28] : range === '30' ? [9, 15, 11, 20, 17, 25, 20, 29, 25, 35, 32, 42] : [8, 12, 10, 20, 16, 27, 23, 33, 27, 37, 34, 44];
  const points = values.map((value, index) => `${45 + index * 65},${200 - value * 3.3 - (index === values.length - 1 ? Math.min(cycles, 12) : 0)}`).join(' ');
  const labels = range === '1' ? ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00'] : range === '30' ? ['1 июн', '6 июн', '12 июн', '18 июн', '24 июн', '30 июн'] : ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  return <div className="activity-chart"><svg viewBox="0 0 800 242" role="img" aria-label={`Демонстрационный график активности за ${range === '1' ? 'день' : range === '7' ? '7 дней' : '30 дней'}`}><defs><linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#9FB3DE" stopOpacity=".2" /><stop offset="100%" stopColor="#9FB3DE" stopOpacity="0" /></linearGradient></defs>{[45, 95, 145, 200].map((y, index) => <g key={y}><line x1="44" y1={y} x2="764" y2={y} stroke="#30303A" strokeDasharray="3 5" strokeWidth=".75" /><text x="10" y={y + 4} fill="#77778C" fontSize="10">{[50, 35, 20, 0][index]}</text></g>)}<motion.polygon key={`fill-${range}`} points={`45,200 ${points} 760,200`} fill="url(#chart-fill)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }} /><motion.polyline key={range} points={points} fill="none" stroke="#9FB3DE" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9 }} />{labels.map((label, index) => <text key={label} x={45 + index * 142} y="233" fill="#8D8D9F" fontSize="10" textAnchor="middle">{label}</text>)}</svg></div>;
}

export function UpdatesContent({ onClose }: { onClose: () => void }) {
  return <><div className="update-art"><BrandMark /><span>{BRAND_NAME}.<br />Ваш новый игровой ритм.</span></div><div className="update-list"><div><DepthIcon kind="workspace" size={24} /><div><h3>Новое имя. Тот же комфорт.</h3><p>Знакомое пространство с новым знаком и характером.</p></div></div><div><DepthIcon kind="artifacts" size={24} /><div><h3>Маленькие игровые артефакты</h3><p>Объёмные иконки с кристаллами, золотыми деталями и мягким светом.</p></div></div><div><DepthIcon kind="config" size={24} /><div><h3>Всё важное осталось с вами</h3><p>Макросы, конфиги и профиль перенесены без сброса настроек.</p></div></div></div><div className="modal-actions"><button className="button button-primary" onClick={onClose}>Продолжить<ArrowRight size={15} /></button></div></>;
}