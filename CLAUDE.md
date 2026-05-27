# Orbit — 3D Planet Social Graph

Next.js 15 + Three.js приложение: социальный граф, где пользователи — планеты, вращающиеся вокруг центральной звезды (сервиса).

## Стек

- **Next.js 15** (app router), React 19, TypeScript
- **Three.js 0.170** — 3D рендер
- **react-force-graph-3d** (через `next/dynamic`, SSR off) — force-directed layout
- **d3-force-3d** — кастомные силы (radial, forceY для эклиптики, collide)
- **qrcode** — генерация QR при клике на солнце

Запуск: `npm install && npm run dev` → http://localhost:3000

## Архитектура

### `app/page.tsx` — главный компонент
- `ForceGraph3D` рендерит граф; нода `star` (id=`star`, pinned `fx=fy=fz=0`) + `me` + 40 fake-юзеров из `/api/users`
- Стартовые позиции планет — детерминированные на эклиптике (y≈0) через `sphericalSeed(seed)`, чтобы они не появлялись внутри солнца
- Custom forces: `forceRadial(380, 0,0,0)` strength 0.45, `forceY(0)` strength 0.2 (плоская система), `forceCollide` (star=70, me=16, остальные=12)
- `linkPositionUpdate` обрезает рёбра до границы планет (offset 9-12 / 52 для звезды). Поддерживает и `Line` (когда width=0) и `Mesh` (цилиндр, когда width>0)
- Рёбра скрыты по умолчанию (color alpha=0, width=0). При выборе планеты — линии её связей становятся видимыми
- Клик на планету → зум камерой на 120 единиц от планеты + side-panel с био и Following/Followers
- Клик на звезду → QR-оверлей со ссылкой на `window.location.href`
- Свет: `PointLight(0xffe7b0, 4.5)` в центре + лёгкий AmbientLight; tone mapping ACES; `UnrealBloomPass` (strength 0.45, threshold 0.55) — только солнце реально светится
- RAF-цикл крутит каждый mesh по `__spinSpeed` (для планет и солнца)

### `lib/planet3d.ts` — 3D-меши
- `createPlanetMesh(p, {radius, isMe})` — `THREE.Group` с SphereGeometry + MeshStandardMaterial + текстурой из `p.textureUrl`. Кольца у некоторых планет (RingGeometry с радиальной развёрткой UV)
- `createSunMesh(radius)` — SphereGeometry с реальной NASA-текстурой (multiplied (2.0, 1.6, 1.0) > 1 чтобы bloom подхватил) + Lensflare (lensflare0 при radius*3.5 + 3 маленьких lensflare3)
- Текстуры кэшируются через `loadTextureCached(url)`
- Атмосфера/halo вокруг планет НЕ рисуется (по требованию — "текстуры должны быть чистыми")

### `lib/fakedata.ts` — генератор пользователей
- 6 архетипов планет: gasWarm (Jupiter), gasCold (Saturn), ice (Uranus/Neptune), rocky (Mercury/Mars/Moon), lava (Venus), ocean (Earth)
- Каждому архетипу присвоен `textureUrl` из `/textures/<planet>.jpg`
- 40 юзеров, у каждого 1-2 случайных подписки (`followingIds`)

### `lib/planetSprite.ts` — legacy
Старый canvas-based рендерер. Сейчас неиспользуется в графе, но может быть полезен — не удалять без проверки.

### `public/textures/` — ассеты
- Все JPG планет от solarsystemscope (CC0)
- `sun.jpg` (2K), `lensflare0.png`, `lensflare3.png` (из three.js examples)

## Что сделано в последних коммитах

1. `Replace Express demo with Next.js 3D planet social graph` — первоначальный перенос Next.js проекта
2. `Remove Follow button, show QR overlay on sun click` — QR при клике на солнце, кнопка Follow удалена

## Известные особенности

- `following` state и `toggleFollow` остались в коде, но UI больше не позволяет добавлять подписки (только pre-seeded follows из fakedata)
- Камера: начальная позиция `z=520`, deselect возвращает туда же. Зум на планету через `cameraPosition({pos along ray}, lookAt, 900ms)`
- При смене `users` (изменение графа) `linkPositionUpdate` сам пересчитает offsetted edges на каждом тике симуляции
- Auto-zoom библиотеки 3d-force-graph (cbrt(nodeCount)*170) обходится через `setTimeout(50ms)` после маунта

## Команды

- `npm run dev` — dev-сервер
- `npm run build` — production build
- `npx tsc --noEmit` — type check
