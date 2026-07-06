# 프롬프트 아카이브 디자인 시스템

## 1. Atmosphere / Signature

프롬프트 아카이브는 이미지를 넓게 보고, 생성용 프롬프트를 빠르게 정리하고 복사하는 앨범형 작업 도구다. 첫 화면은 갤러리를 중심으로 구성하고, 상세 화면은 이미지와 영어/한국어 프롬프트를 나란히 비교할 수 있어야 한다. 장식보다 정보 밀도와 반복 작업의 속도를 우선한다.

Design Read:
- Page kind: gallery-first web app
- Audience: AI image creators and prompt asset managers
- Vibe: quiet studio console
- Direction: archive console
- DESIGN_VARIANCE: 5
- MOTION_INTENSITY: 3
- VISUAL_DENSITY: 7

## 2. Color

All colors are exposed as CSS variables. Theme values may change, but semantic roles stay stable.

Core roles:
- `#f8fafc`, `--bg`, app background
- `#ffffff`, `--panel`, primary panels and cards
- `#0f172a`, `--text`, main foreground
- `#64748b`, `--muted`, secondary text
- `#e2e8f0`, `--border`, borders and dividers
- `#2563eb`, `--primary`, main action
- `#ffffff`, `--on-primary`, text on primary
- `#38bdf8`, `--accent`, focused metadata and highlights
- `#ef4444`, `--danger`, destructive action
- `#f59e0b`, `--warning`, queued and retry states
- `#16a34a`, `--success`, complete states
- `#e0f2fe`, `--section-appearance`, appearance section
- `#ecfccb`, `--section-outfit`, outfit section
- `#fef3c7`, `--section-background`, background section
- `#fce7f3`, `--section-expression`, expression and pose section
- `#ede9fe`, `--section-details`, details section

Themes:
- `default-light`: crisp gallery light
- `dark-studio`: dark studio console
- `mint-gallery`: cool catalog
- `peach-cream`: warm review desk
- `cyber-violet`: violet is allowed here because it is one explicit user-requested theme, not the default

Contrast notes:
- Text on `--bg` and `--panel` must meet 4.5:1.
- Section colors are background tints only. Body text remains `--text`.

## 3. Typography

Font stack:
- `--font-sans`: "Pretendard", "Noto Sans KR", "Apple SD Gothic Neo", "Segoe UI", sans-serif
- `--font-mono`: "SFMono-Regular", Consolas, "Liberation Mono", monospace

Type ramp:
- `--type-display`: 2rem, weight 760, line-height 1.08, letter-spacing 0
- `--type-title`: 1.25rem, weight 740, line-height 1.2, letter-spacing 0
- `--type-section`: 1rem, weight 720, line-height 1.3, letter-spacing 0
- `--type-body`: 0.9375rem, weight 430, line-height 1.58, letter-spacing 0
- `--type-small`: 0.8125rem, weight 520, line-height 1.42, letter-spacing 0
- `--type-micro`: 0.75rem, weight 650, line-height 1.3

## 4. Spacing

Base unit is 4px. CSS variables are the only spacing scale used.

- `--space-1`: 4px
- `--space-2`: 8px
- `--space-3`: 12px
- `--space-4`: 16px
- `--space-5`: 20px
- `--space-6`: 24px
- `--space-8`: 32px
- `--space-10`: 40px
- `--space-12`: 48px
- `--space-16`: 64px

## 5. Components

App shell:
- Default layout is sidebar-free.
- Primary actions live in the top-right icon cluster.
- Upload and settings appear in modal layers, not permanent side navigation.

Album gallery:
- Main page uses a paged album grid with configurable `columns x rows`.
- Category tabs sit above the album: 전체, 복장, 배경.
- Outfit and background tag chips use the standard `chip-btn` recipe.
- Pagination uses compact button tokens and a primary current-page state.

Prompt detail:
- Detail view keeps prompt columns side by side on wide screens and collapses on mobile.
- English and Korean sentences use matching `data-sentence-id` values.
- Section backgrounds use the five `--section-*` variables.
- Copy controls are per-section and whole-prompt.

Upload optimization:
- Upload view includes per-image custom instructions and exclude-element checkboxes.
- Summary strips use `--panel`, `--bg`, `--border`, `--radius-sm`, and `--type-small`.
- Queue errors use `--danger` and preserve the same queue grid dimensions.

Settings modal:
- Settings stay in a centered modal launched from the top-right icon.
- The modal uses compact top tabs for API 설정, AI 분석 지시문, 분류/태그 설정, 업로드 설정, 갤러리 설정, 복사/표시 설정, 테마 설정, 고급 설정.
- Tabs must wrap instead of causing horizontal scroll.
- Each tab is one dense settings surface with form grids, option grids, and short status chips.
- API keys are represented as server-key status only in the static MVP; raw key values are not persisted in localStorage.
- Tag and exclude management rows remain dense on desktop and collapse to single-column on mobile.

Buttons:
- Radius: `--radius-sm`
- Padding: `--space-2` `--space-3`
- Border: `--border`
- Primary button uses `--primary` and `--on-primary`
- Hover uses `--hover`
- Focus uses `--ring`

## 6. Motion

- `--motion-fast`: 140ms ease-out
- `--motion-base`: 210ms ease-out
- Use transform, opacity, and filter only.
- Reduced motion disables transforms and keeps opacity transitions short.

## 7. Depth

Depth strategy is border-first with two soft shadows.

- `--shadow-sm`: 0 1px 2px rgba(15, 23, 42, 0.06), 0 8px 20px rgba(15, 23, 42, 0.05)
- `--shadow-md`: 0 8px 24px rgba(15, 23, 42, 0.08), 0 18px 42px rgba(15, 23, 42, 0.08)
- `--radius-xs`: 6px
- `--radius-sm`: 8px
- `--radius-md`: 10px
- `--radius-lg`: 14px
- `--topbar-height`: 68px
