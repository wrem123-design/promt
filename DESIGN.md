# 프롬프트 아카이브 디자인 시스템

## 1. Atmosphere / Signature

프롬프트 아카이브는 많은 이미지를 빠르게 훑고, 필요한 프롬프트를 정확히 찾아 편집·복사하는 로컬 작업 도구다. 장식보다 탐색 속도와 상태의 명료함을 우선하며, 화면은 종이 인덱스와 사진 작업대 사이의 차분한 스튜디오 감각을 유지한다. 상단에는 검색과 핵심 작업만 남기고, 정렬·필터·대량 작업은 갤러리 문맥 안에서 제공한다.

Design Read:
- Page kind: gallery-first local archive
- Audience: AI image creators and prompt asset managers
- Vibe: calm studio index
- Direction: Korean archival workspace
- DESIGN_VARIANCE: 5
- MOTION_INTENSITY: 3
- VISUAL_DENSITY: 7

Do:
- 이미지가 첫 번째 정보가 되게 한다.
- 검색, 필터, 저장 상태를 한눈에 이해할 수 있게 한다.
- 데스크톱의 정보 밀도를 유지하되 작은 화면에서는 순서를 재배치한다.

Do not:
- 보라색 글로우, 장식용 상태 점, 과도한 알약형 요소를 기본 표현으로 쓰지 않는다.
- 서로 다른 그림자·라운드·아이콘 체계를 섞지 않는다.
- 저장 실패나 오프라인 전환을 조용히 숨기지 않는다.

## 2. Color

모든 색은 CSS 변수의 의미 역할을 통해 사용한다. 테마가 바뀌어도 역할 이름은 고정한다.

Core semantic roles:
- `#f8fafc`, `--bg`, 기본 앱 배경
- `#ffffff`, `--panel`, 카드·패널
- `#0f172a`, `--text`, 기본 전경
- `#64748b`, `--muted`, 보조 전경
- `#e2e8f0`, `--border`, 구분선
- `#2563eb`, `--primary`, 기본 행동
- `#38bdf8`, `--accent`, 제한적 강조
- `#b91c1c`, `--danger`, 삭제·오류
- `#f59e0b`, `--warning`, 주의·대기
- `#16a34a`, `--success`, 저장·완료
- `#ffffff`, `--on-primary`, 강조색 위 전경
- `#ffffff`, `--on-danger`, 위험색 위 전경
- `#92400e`, `--warning-text`, 밝은 배경 위 주의 전경
- `#111827`, `--image-ink`, 이미지 대체 그래픽 전경
- `#334155`, `--image-slate-700`, 이미지 대체 그래픽
- `#475569`, `--image-slate-600`, 이미지 대체 그래픽
- `#94a3b8`, `--image-slate-400`, 이미지 대체 그래픽
- `#c7d2fe`, `--image-indigo-soft`, 샘플 이미지
- `#bae6fd`, `--image-sky-soft`, 샘플 이미지
- `#fde68a`, `--image-amber-soft`, 샘플 이미지
- `#d9f99d`, `--image-lime-soft`, 샘플 이미지

Prompt section tints:
- `#e0f2fe`, `--section-appearance`
- `#ecfccb`, `--section-outfit`
- `#fef3c7`, `--section-background`
- `#fce7f3`, `--section-expression`
- `#ede9fe`, `--section-details`

Theme palettes:
- Default Light: `#f8fafc`, `#ffffff`, `#0f172a`, `#64748b`, `#e2e8f0`, `#2563eb`, `#38bdf8`
- Dark Studio: `#0f1117`, `#181b23`, `#f8fafc`, `#94a3b8`, `#2d3340`, `#60a5fa`, `#a78bfa`, `#1e3a5f`, `#29411f`, `#4a3617`, `#4a1f35`, `#31275f`
- Mint Gallery: `#f0fdfa`, `#ffffff`, `#134e4a`, `#2f746e`, `#ccfbf1`, `#0f766e`, `#14b8a6`, `#dcfce7`, `#fef9c3`
- Peach Cream: `#fff7ed`, `#ffffff`, `#431407`, `#9a3412`, `#fed7aa`, `#ea580c`, `#fb923c`, `#ffedd5`, `#fee2e2`, `#fae8ff`
- Cyber Violet: `#111026`, `#1c1938`, `#f5f3ff`, `#c4b5fd`, `#3b2f66`, `#8b5cf6`, `#22d3ee`, `#2e236c`, `#164e63`, `#3b0764`, `#701a75`, `#312e81`

Contrast rules:
- 본문과 배경은 WCAG AA 4.5:1 이상을 유지한다.
- 상태색은 색만으로 전달하지 않고 텍스트를 함께 쓴다.
- 섹션 색상은 배경 틴트로만 쓰고 본문 전경은 `--text`를 유지한다.

## 3. Typography

Font stacks:
- `--font-sans`: `Pretendard`, `Noto Sans KR`, `Apple SD Gothic Neo`, `Segoe UI`, sans-serif
- `--font-mono`: `SFMono-Regular`, Consolas, `Liberation Mono`, monospace

Type ramp:
- `--type-display-size`: 2rem · 760 · 1.08 · -0.02em
- `--type-title-size`: 1.25rem · 740 · 1.2 · -0.015em
- `--type-section-size`: 1rem · 720 · 1.3 · -0.01em
- `--type-body-size`: 0.9375rem · 430 · 1.58 · 0
- `--type-small-size`: 0.8125rem · 520 · 1.42 · 0
- `--type-micro-size`: 0.75rem · 650 · 1.3 · 0.01em

## 4. Spacing

Base unit: 4px. 레이아웃 여백은 아래 토큰만 사용한다. 2px·6px·10px은 테두리·아이콘·광학 보정용 토큰이며 임의 숫자로 반복하지 않는다.

- `--space-hair`: 2px
- `--space-1`: 4px
- `--space-tight`: 6px
- `--space-2`: 8px
- `--space-control`: 10px
- `--space-3`: 12px
- `--space-4`: 16px
- `--space-5`: 20px
- `--space-6`: 24px
- `--space-8`: 32px
- `--space-10`: 40px
- `--space-12`: 48px
- `--space-16`: 64px

## 5. Components

Top bar:
- Desktop: 브랜드, 유연한 검색, 핵심 아이콘 행동의 3영역.
- 768px 이하: 브랜드·행동 행 아래 검색을 전체 너비로 배치한다.
- 정렬·상태·즐겨찾기·중복 필터는 갤러리 도구 영역에 둔다.
- 저장 상태는 `서버 저장`, `저장 중`, `브라우저 임시 저장` 텍스트로 표시한다.

Gallery controls:
- 첫 행은 결과 수, 정렬, 상태, 빠른 필터, 필터 초기화로 구성한다.
- 두 번째 영역은 보기 종류·카테고리·태그이며, 선택된 필터 수를 항상 보여 준다.
- 태그 필터는 전체·복장·배경 선택에 맞춰 필요한 행만 표시한다.
- 무한 스크롤과 페이지 이동을 설정에서 선택할 수 있고 해당 설정이 실제 동작과 일치해야 한다.

Image cards:
- 이미지가 카드 면적의 대부분을 차지한다.
- 제목은 최대 2줄, 메타는 필요한 경우에만 표시한다.
- 카드 전체는 Enter와 Space로 열 수 있고 즐겨찾기는 독립된 `aria-pressed` 버튼이다.
- hover는 2px 이내의 이동과 한 단계 높은 테두리·그림자만 사용한다.

Modal and settings:
- 모달은 `aria-labelledby`, Esc 닫기, 포커스 고정, 닫은 뒤 원래 행동으로 복귀를 제공한다.
- 설정 탭은 `tablist` / `tab` / `tabpanel` 의미를 갖는다.
- 640px 이하에서는 화면 가장자리에 붙는 시트형 레이아웃으로 전환한다.

Buttons:
- 기본·보조·위험 행동의 위계를 유지한다.
- 모든 버튼에 hover, active, focus-visible, disabled 상태가 있다.
- 아이콘 버튼의 최소 터치 영역은 40px, 모바일에서는 44px이다.

## 6. Motion

- `--motion-fast`: 140ms ease-out
- `--motion-base`: 210ms ease-out
- 이동은 transform, opacity, filter만 사용한다.
- 모달은 opacity와 작은 translateY로 진입한다.
- `prefers-reduced-motion: reduce`에서는 이동을 제거하고 1ms 전환만 남긴다.

## 7. Depth

기본 전략은 border-first다. 그림자는 떠 있는 요소와 hover에만 쓴다.

- `--shadow-sm`: 0 1px 2px rgba(15, 23, 42, 0.06), 0 8px 20px rgba(15, 23, 42, 0.05)
- `--shadow-md`: 0 8px 24px rgba(15, 23, 42, 0.08), 0 18px 42px rgba(15, 23, 42, 0.08)
- `--radius-xs`: 6px
- `--radius-sm`: 8px
- `--radius-md`: 12px
- `--radius-lg`: 16px
- `--radius-round`: 999px
- `--topbar-height`: 72px
