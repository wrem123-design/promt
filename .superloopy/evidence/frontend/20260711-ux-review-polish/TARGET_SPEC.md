# TARGET_SPEC

## Visual target

The target is an authored layout specification derived from the current Prompt Archive UI and its 128-item working dataset. The design keeps the image-led archive identity while removing top-bar congestion and making filtering, persistence, and navigation explicit.

## 1280px

- Sticky top bar: brand at left, flexible 360-560px search in the center, upload/bulk/theme/settings actions at right.
- Search is the only collection control in the header.
- Gallery begins with a compact control surface: result count and persistence status, sort/status controls, favorite/duplicate toggles, then view/category/tag filters.
- Eight configured columns remain possible, with 24px page gutters and 16px card gaps.
- Cards use image-first composition, two-line titles, optional compact metadata, clear focus outline, and no decorative overlays beyond real item state.

## 768px

- Top bar becomes two rows: brand/actions, then full-width search.
- Gallery controls wrap into two columns and never require horizontal scrolling.
- Grid is capped at three columns.
- Settings modal uses most of the viewport while retaining a visible title and close action.

## 390px

- Brand text shortens, action buttons remain at least 44px, search occupies a dedicated row.
- Gallery controls form a single column; secondary filters collapse cleanly.
- Grid uses two columns with 12px page gutters and 12px gaps.
- Modals become edge-to-edge sheets with safe-area padding.
- Prompt columns stack English then Korean; all actions wrap without clipping.

## Interaction target

- Enter and Space open an image card.
- Filter and favorite buttons expose `aria-pressed`.
- A reset action clears all collection filters and search.
- Empty library and zero-result states provide different guidance.
- Modal Esc closes, Tab stays inside, and focus returns to the trigger.
- Save state is visible. A failed server write switches to browser fallback with an actionable retry control.
- Gallery supports both infinite loading and explicit pagination, matching its settings.
