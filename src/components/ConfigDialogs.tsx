import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Check, HardDrive, Info, LoaderCircle, Save, ShieldCheck, Upload, X } from 'lucide-react';
import { macroWord } from '../data';
import { MAX_CONFIG_BYTES, parseConfig, uniqueConfigName, type SavedConfig, type WorkspaceConfig } from '../utils/config';
import { IconButton, Toggle } from './UI';
import { DepthIcon } from './DepthIcon';
import { BRAND_NAME } from '../brand';

export function SaveConfigDialog({ configs, macroCount, groupCount, onSave, onCancel, editing }: {
  configs: SavedConfig[]; macroCount: number; groupCount: number;
  onSave: (name: string, description: string, download: boolean) => void;
  onCancel: () => void; editing?: SavedConfig;
}) {
  const [name, setName] = useState(editing?.config.name ?? uniqueConfigName('Мой конфиг', configs));
  const [description, setDescription] = useState(editing?.config.description ?? '');
  const [download, setDownload] = useState(!editing);
  const [error, setError] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) { setError('Укажите название конфига.'); return; }
    if (configs.some((item) => item.id !== editing?.id && item.config.name.toLowerCase() === name.trim().toLowerCase())) {
      setError('Такое название уже есть. Выберите другое или обновите существующий конфиг.'); return;
    }
    onSave(name.trim(), description.trim(), download);
  };

  return <form className="editor-form config-editor" onSubmit={submit}>
    <div className="config-dialog-summary"><span className="config-file-symbol"><DepthIcon kind="config" size={30} /></span><div><strong>{editing ? 'Сохранённая конфигурация' : 'Снимок вашего пространства'}</strong><span>{macroCount} {macroWord(macroCount)}<i />Групп: {groupCount}<i />Настройки интерфейса</span></div></div>
    <div className="form-field"><label htmlFor="config-name">Название конфига</label><input id="config-name" value={name} maxLength={60} required placeholder="Например, вечерний фарм" onChange={(event) => { setName(event.target.value); setError(''); }} /></div>
    <div className="form-field"><label htmlFor="config-description">Описание<span>необязательно</span></label><input id="config-description" value={description} maxLength={160} placeholder="Что особенного в этом сценарии?" onChange={(event) => setDescription(event.target.value)} /></div>
    {!editing && <div className="form-switch-row"><div><strong>Также скачать JSON-файл</strong><span>Для резервной копии или другого устройства</span></div><Toggle label="Скачать файл после сохранения" checked={download} onChange={() => setDownload(!download)} /></div>}
    {error && <p className="form-error config-form-error" role="alert">{error}</p>}
    <p className="form-demo-note"><ShieldCheck size={14} />Личный профиль и аватар не включаются в конфиг.</p>
    <div className="modal-actions"><button type="button" className="button button-secondary" onClick={onCancel}>Отмена</button><button type="submit" className="button button-primary"><Save size={14} />{editing ? 'Сохранить изменения' : 'Сохранить конфиг'}</button></div>
  </form>;
}

export function ImportConfigDialog({ configs, onImport, onCancel }: { configs: SavedConfig[]; onImport: (config: WorkspaceConfig, apply: boolean) => void; onCancel: () => void }) {
  const [config, setConfig] = useState<WorkspaceConfig | null>(null);
  const [filename, setFilename] = useState('');
  const [fileSize, setFileSize] = useState(0);
  const [name, setName] = useState('');
  const [applyNow, setApplyNow] = useState(false);
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const readIdRef = useRef(0);

  useEffect(() => () => { readIdRef.current += 1; }, []);
  useEffect(() => { if (config) document.getElementById('import-config-name')?.focus(); }, [config]);

  const readFile = async (file?: File) => {
    if (!file) return;
    const readId = ++readIdRef.current;
    setError(''); setConfig(null); setReading(true);
    try {
      if (!/\.json$/i.test(file.name)) throw new Error('Выберите файл с расширением .json.');
      if (file.size > MAX_CONFIG_BYTES) throw new Error('Файл слишком большой. Максимальный размер: 1 МБ.');
      if (!file.size) throw new Error('Файл пуст. Выберите другую конфигурацию.');
      const result = parseConfig(await file.text(), file.name);
      if (readId !== readIdRef.current) return;
      setConfig(result); setFilename(file.name); setFileSize(file.size);
      setName(uniqueConfigName(result.name, configs));
    } catch (cause) {
      if (readId === readIdRef.current) setError(cause instanceof Error ? cause.message : 'Не удалось прочитать файл. Попробуйте ещё раз.');
    } finally { if (readId === readIdRef.current) setReading(false); }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!config || reading) return;
    if (!name.trim()) { setError('Укажите название конфига.'); return; }
    if (configs.some((item) => item.config.name.toLowerCase() === name.trim().toLowerCase())) { setError('Конфиг с таким названием уже есть. Выберите другое название.'); return; }
    onImport({ ...config, name: name.trim() }, applyNow);
  };

  return <form className="config-import-form" onSubmit={submit}>
    <input className="visually-hidden" ref={inputRef} type="file" accept=".json,application/json" aria-label="Файл конфигурации" tabIndex={-1} onChange={(event) => { void readFile(event.target.files?.[0]); event.target.value = ''; }} />
    {!config && <button type="button" className={`config-dropzone ${dragging ? 'dragging' : ''} ${reading ? 'is-reading' : ''}`} onClick={() => inputRef.current?.click()} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => {
      event.preventDefault(); setDragging(false);
      if (event.dataTransfer.files.length !== 1) { setError('Добавляйте по одному конфигу за раз.'); return; }
      void readFile(event.dataTransfer.files[0]);
    }} disabled={reading}>
      <span className="upload-symbol">{reading ? <LoaderCircle size={23} className="spin-icon" /> : <Upload size={23} strokeWidth={1.5} />}</span>
      <strong>{reading ? 'Проверяем конфигурацию...' : 'Перетащите конфиг сюда'}</strong>
      <span>{reading ? 'Проверка структуры и настроек' : <>или <em>выберите файл</em> на устройстве</>}</span>
      <small>JSON {BRAND_NAME} / до 1 МБ</small>
    </button>}
    {config && <>
      <div className="import-file-preview"><span className="config-file-symbol is-valid"><DepthIcon kind="config" size={30} style={{ color: '#A8CFB6' }} /></span><div><strong>{filename}</strong><span>{(fileSize / 1024).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} КБ<Check size={12} />Файл проверен</span></div><IconButton icon={X} label="Выбрать другой файл" onClick={() => { setConfig(null); setError(''); }} /></div>
      <div className="form-field"><label htmlFor="import-config-name">Название в библиотеке</label><input id="import-config-name" value={name} required maxLength={60} onChange={(event) => { setName(event.target.value); setError(''); }} /></div>
      <div className="import-config-contents"><div><span>Макросы</span><strong>{config.macros.length}</strong></div><div><span>Группы</span><strong>{config.groups.length}</strong></div><div><span>Горячая клавиша</span><kbd>{config.settings.shortcut}</kbd></div></div>
      <div className="form-switch-row"><div><strong>Применить после добавления</strong><span>Заменить текущие макросы и настройки</span></div><Toggle label="Применить конфиг после импорта" checked={applyNow} onChange={() => setApplyNow(!applyNow)} /></div>
      {applyNow && <p className="config-import-warning"><Info size={14} /><span>Сессия остановится. Перед заменой автоматически сохраним резервную копию текущего пространства.</span></p>}
    </>}
    {error && <p className="form-error config-form-error" role="alert">{error}</p>}
    <p className="form-demo-note"><HardDrive size={14} />Файл обрабатывается на устройстве, без отправки на сервер.</p>
    <div className="modal-actions"><button type="button" className="button button-secondary" onClick={onCancel}>Отмена</button><button type="submit" className="button button-primary" disabled={!config || reading}><Upload size={14} />{applyNow ? 'Добавить и применить' : 'Добавить конфиг'}</button></div>
  </form>;
}