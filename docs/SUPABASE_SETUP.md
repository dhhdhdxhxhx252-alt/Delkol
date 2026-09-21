# Delkol — детальная настройка базы Supabase

Проект уже подключён к вашему Supabase-проекту (`https://mrofddfrnalntypcbqad.supabase.co`,
publishable-ключ зашит в приложение). Ниже — всё, что нужно сделать на стороне
Supabase, чтобы база данных существовала и всё работало.

> **ОБНОВЛЕНО (соц-слой «Топ конфиги» + «Магазин рамок»):** кроме `workspaces`
> теперь нужны таблицы `frames`, `social_profiles`, `shared_configs`,
> `config_reactions` и функции `react_to_config`, `record_config_download`,
> `record_profile_view`, `purchase_frame`. Всё уже внутри `supabase/schema.sql` —
> просто запустите его целиком (повторный запуск безопасен).
> **После SQL** наполните базу демо-контентом:
> ```
> node scripts/seed-community.mjs
> ```
> Создаст 1200 аккаунтов с аватарками/рамками/подписчиками и ~140 конфигов
> с лайками, дизлайками, загрузками и просмотрами.

---

## Шаг 1. Создать таблицу `workspaces`

1. Откройте https://supabase.com/dashboard и войдите в аккаунт.
2. Выберите проект **mrofddfrnalntypcbqad**.
3. В левом меню: **SQL Editor** → кнопка **New query**.
4. Вставьте весь скрипт ниже и нажмите **Run** (Ctrl+Enter).

```sql
-- 1) Таблица рабочих пространств: один ряд на пользователя.
create table if not exists public.workspaces (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 2) Автообновление updated_at (без расширений, обычный триггер).
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists workspaces_touch_updated_at on public.workspaces;
create trigger workspaces_touch_updated_at
  before update on public.workspaces
  for each row execute function public.touch_updated_at();

-- 3) Row Level Security: пользователь видит и меняет только своё пространство.
alter table public.workspaces enable row level security;

drop policy if exists "workspace_select_own" on public.workspaces;
create policy "workspace_select_own"
  on public.workspaces for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "workspace_insert_own" on public.workspaces;
create policy "workspace_insert_own"
  on public.workspaces for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "workspace_update_own" on public.workspaces;
create policy "workspace_update_own"
  on public.workspaces for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "workspace_delete_own" on public.workspaces;
create policy "workspace_delete_own"
  on public.workspaces for delete
  to authenticated
  using (auth.uid() = user_id);

-- 4) Индекс для сортировки по времени обновления.
create index if not exists workspaces_updated_at_idx
  on public.workspaces (updated_at desc);
```

5. Внизу редактора должно появиться **Success. No rows returned** — это нормально,
   скрипт создаёт структуру, а не данные.

Тот же скрипт лежит в проекте: `D:\gii\supabase\schema.sql`.

## Шаг 2. Проверить, что таблица создалась

1. Левое меню → **Table Editor** → в списке таблиц должна появиться **workspaces**
   (колонки: `user_id`, `data`, `updated_at`). Пока она пустая — это нормально.
2. Левое меню → **Authentication → Policies** (или Database → Policies) → у таблицы
   `workspaces` должно быть 4 политики: select / insert / update / delete с
   `auth.uid() = user_id`.

## Шаг 3. Настроить вход по e-mail

1. Левое меню → **Authentication → Sign In / Providers** (или Providers).
2. Провайдер **Email** должен быть **Enabled** (обычно включён по умолчанию).
3. Рекомендация для десктоп-приложения: выключите **Confirm email**
   (переключатель «Confirm email» в настройках провайдера Email).
   Тогда регистрация сразу логинит пользователя без письма-подтверждения.
   Если оставить включённым — приложение покажет «подтвердите e-mail», и вход
   сработает только после перехода по ссылке из письма.

## Шаг 4 (только если Confirm email оставили включённым)

**Authentication → URL Configuration**: проверьте **Site URL**. Для настольного
приложения ссылка подтверждения откроется в системном браузере — это нормально.
Можно оставить значения по умолчанию.

## Шаг 5. Проверка из приложения

1. Запустите приложение (`npm run dev:full` из `D:\gii`, или собранный exe).
2. Окно Loading (1 минута) → окно Login → **«Нет аккаунта? Создать»** →
   введите e-mail и пароль (от 6 символов) → **Зарегистрироваться**.
3. Откроется главное приложение.
4. В Supabase: **Table Editor → workspaces** — должна появиться строка с вашим
   `user_id`, а в колонке `data` — JSON с макросами, группами, настройками и профилем.
5. Включите/выключите любой макрос в приложении → через ~1–2 секунды updated_at
   в строке обновится (автосохранение работает).
6. Выйдите из аккаунта (Профиль → «Выйти из аккаунта») → войдите снова →
   данные подтянулись из облака. Всё работает.

## Как приложение хранит данные

Один ряд на пользователя в `workspaces`. Колонка `data` — готовый снимок:

```json
{
  "macros":   [ { "id": "fishing", "name": "Рыбалка", "enabled": true, "cycles": 128, ... } ],
  "groups":   [ { "id": "daily", "name": "Ежедневные", "macroIds": ["fishing"], ... } ],
  "settings": { "name": "hijiko", "notifications": true, "shortcut": "F8", ... },
  "profile":  { "displayName": "Hijiko", "bio": "...", "avatar": "data:image/...", ... }
}
```

Логика: вход → **pull** снимка; пустое облако (первый вход) → **заливка** локальных
данных; любое изменение → **push** через ~1.2 с (debounce). Локально данные
дублируются в localStorage, так что без интернета приложение продолжает работать.

## Частые ошибки и что делать

| Ошибка в приложении | Причина | Решение |
| --- | --- | --- |
| `relation "public.workspaces" does not exist` | Не выполнен скрипт из Шага 1 | Выполните SQL из Шага 1 |
| `new row violates row-level security policy` | Пользователь не вошёл или политики не создались | Проверьте Шаг 1 (пolicies) и что вход выполнен |
| «Подтвердите e-mail по ссылке из письма» | Включён Confirm email | Подтвердите почту или выключите Confirm email (Шаг 3) |
| «Нет соединения с сервером» | Нет интернета / проект на паузе | Проверьте интернет; в дашборде проект должен быть **Active** (бесплатные проекты засыпают — разбудите любым запросом через дашборд) |
| «Слишком много попыток» | Rate limit Supabase на auth | Подождите ~60 секунд |

## Что НЕ нужно делать

- **Secret key (`sb_secret_…`) никуда не вставлять.** Он серверный; в клиенте
  должен остаться только publishable-ключ (уже зашит).
- Не отключайте RLS у `workspaces` — иначе любой сможет читать чужие данные.
- Не переименовывайте таблицу/колонки: приложение обращается к
  `workspaces.user_id / data / updated_at`.

## Опционально, на будущее

- **Storage** (аватары/обложки в облаке): сейчас аватар хранится внутри `data`
  как data-URL. Если профили станут большими — создайте bucket `avatars` и
  перейдём на файлы.
- **Резервные копии**: Data → Backups в дашборде (на Pro-плане), либо периодический
  экспорт CSV из Table Editor.
