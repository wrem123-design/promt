# VISUAL_QA

Project: 프롬프트 아카이브

Local target: `http://127.0.0.1:5174` during the Node server test, `http://127.0.0.1:5173` for the default run script.

## Browser Checks

Ran with Microsoft Edge through Playwright using the bundled Node runtime. The app was served through `server.js` during the final pass so `/api/health`, `/api/state`, file-backed state, and `/uploads` serving were exercised.

Screenshots:
- `qa-390-gallery.png`
- `qa-768-gallery.png`
- `qa-1280-gallery.png`
- `qa-1280-upload-options.png`
- `qa-1280-upload-queue.png`
- `qa-1280-detail-edit.png`
- `qa-1280-settings-dark.png`

Viewport results:
- 390px gallery: pass, no horizontal scroll
- 768px gallery: pass, no horizontal scroll
- 1280px gallery: pass, no horizontal scroll
- 1280px upload options: pass, no horizontal scroll
- 1280px upload queue after image optimization: pass, no horizontal scroll
- 1280px detail edit: pass, no horizontal scroll
- 1280px settings dark theme: pass, no horizontal scroll

## Interaction Checks

- Admin login accepted the local MVP password.
- Gallery rendered seeded image cards.
- Gallery rendered without left or right sidebars, using a top icon menu and album grid.
- Category tabs rendered at the top with 전체 / 복장 / 배경 modes.
- Album pagination rendered with first, previous, page number, next, and last controls.
- Detail view opened from an image card.
- Detail prompt sections rendered copy controls per section.
- Upload view rendered the per-image custom instruction textarea and exclude-element checkboxes.
- Upload and settings views opened as modal layers from the top icon menu.
- Upload view rendered optimization settings summary, generated display/thumbnail/analysis assets, and showed original versus optimized size in the queue.
- Server mode persisted state through `/api/state` and converted data URL image assets into files under `/uploads`.
- Manual analysis generated the five prompt sections when an item had no prompt.
- Detail view rendered per-image custom instruction and exclude-element editing controls.
- Detail view rendered image optimization metadata when available.
- Edit mode enabled sentence-level content editing.
- Sentence hover applied matching `data-sentence-id` highlight.
- Settings modal rendered top tabs: API 설정, AI 분석 지시문, 분류/태그 설정, 업로드 설정, 갤러리 설정, 복사/표시 설정, 테마 설정, 고급 설정.
- API settings rendered provider enablement, server-key marker, model fields, priority, fallback, timeout, retry, per-task usage, and mock connection test status.
- AI analysis prompt settings rendered the default instruction, English/Korean rules, tag rules, exclude rules, output JSON format, and section settings.
- Classification settings rendered outfit/background tag management plus exclude-element management with enabled/default/order controls.
- Upload settings rendered compression, EXIF, WebP, thumbnail, paste/drop, duplicate detection, auto-analysis, size, quality, and concurrency controls.
- Gallery settings rendered rows/columns, pagination position, card info visibility, and card aspect ratio controls.
- Copy/display settings rendered split/en-only/ko-only view mode, copy mode, section-title inclusion, line-break mode, and sentence-highlight toggles.
- Theme settings switched to the Dark Studio theme and rendered section color controls.
- Advanced settings rendered usage summary, cost limits, retry failed, JSON backup, CSV export, and settings reset controls.

## Anti-Slop Pre-Flight

- [x] Zero visible em-dashes found in `index.html`, `styles.css`, `app.js`, and `DESIGN.md`.
- [x] Eyebrow count is within limit because this app uses functional labels rather than decorative tracked labels.
- [x] No default purple glow is used in the default theme. The violet palette exists only as the requested `cyber-violet` theme.
- [x] Font stack is deliberate for Korean admin UI: Pretendard / Noto Sans KR / Apple SD Gothic Neo / Segoe UI.
- [x] No premium beige and brass default palette.
- [x] Color, shape, and theme locks hold through CSS variables.
- [x] Layout families include top icon navigation, album grid, category tabs, pagination, upload queue, detail split view, prompt columns, and settings forms.
- [x] Updated layout uses a sidebar-free album surface, top icon menu, modal settings/upload layers, paged gallery controls, and wrapped settings tabs.
- [x] Imagery appears as image elements. Seed assets are labeled sample records and real uploads replace them in normal use.
- [x] Copy avoids banned English cliches and fake-perfect stats.
- [x] Motion is limited to transform, opacity, background, border, and filter transitions with reduced-motion handling.
- [x] Tokens are defined in `DESIGN.md` and implemented through CSS variables.
- [x] Hover, active, focus, disabled, empty, upload queue, analysis waiting, and edit states are handled.
- [x] No horizontal scroll at 390 / 768 / 1280 px.

## Residual Risk

This is a local static MVP. Real AI calls, encrypted API key storage, database persistence, and server-side upload validation still require the planned backend.
