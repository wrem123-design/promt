(function () {
  const STORAGE_KEY = "promptArchiveState.v2";
  const LEGACY_STORAGE_KEY = "promptArchiveState.v1";
  const SESSION_KEY = "promptArchiveAdminSession";
  const SERVER_STATE_ENDPOINT = "/api/state";
  let serverAvailable = false;
  let saveTimer = null;

  const defaultInstruction = `You are an expert prompt engineer for AI image generation.

Analyze the uploaded image and create a detailed prompt archive entry.

Return strict JSON only. Do not include Markdown or explanation outside JSON.

The JSON must use this shape:
{
  "promptSections": {
    "appearance": [{"id":"appearance-1","en":"...","ko":"..."}],
    "outfit": [{"id":"outfit-1","en":"...","ko":"..."}],
    "background": [{"id":"background-1","en":"...","ko":"..."}],
    "expression_pose": [{"id":"expression_pose-1","en":"...","ko":"..."}],
    "details": [{"id":"details-1","en":"...","ko":"..."}]
  },
  "outfitTags": ["교복", "캐주얼"],
  "backgroundTags": ["학교", "교실"],
  "generalTags": ["portrait", "soft light"],
  "detectedButExcludedElements": ["text", "logo"]
}

English prompt rules:
- Write natural, visual, image-generation-ready English.
- Keep each sentence short enough to copy independently.
- Focus on stable visible traits, mood, composition, lighting, materials, and style.
- Do not mention that you are analyzing an uploaded image.

Korean translation rules:
- Translate the English faithfully and naturally.
- Keep the sentence mapping one-to-one with the English sentence ids.

Classification rules:
- Assign outfitTags and backgroundTags only from the enabled tag list provided by the app.
- If nothing fits, use 기타.

Exclude rules:
- If the user provides elements to exclude, do not describe them in the final prompt even if visible.
- Put ignored visible elements in detectedButExcludedElements.`;

  const sectionMeta = [
    { key: "appearance", labelKo: "외모", labelEn: "Appearance", colorKey: "appearance" },
    { key: "outfit", labelKo: "복장", labelEn: "Outfit", colorKey: "outfit" },
    { key: "background", labelKo: "배경", labelEn: "Background", colorKey: "background" },
    { key: "expression_pose", labelKo: "표정/자세", labelEn: "Expression / Pose", colorKey: "expression_pose" },
    { key: "details", labelKo: "디테일", labelEn: "Details", colorKey: "details" },
  ];

  const themes = [
    ["default-light", "Default Light"],
    ["dark-studio", "Dark Studio"],
    ["mint-gallery", "Mint Gallery"],
    ["peach-cream", "Peach Cream"],
    ["cyber-violet", "Cyber Violet"],
  ];

  const providerNames = ["OpenAI", "xAI Grok", "Google Gemini", "Google Vertex AI", "Cerebras Cloud"];

  const defaultExcludeOptions = [
    { key: "text_logo", label: "텍스트 / 글자 / 로고", defaultChecked: true, enabled: true },
    { key: "glasses", label: "안경", defaultChecked: false, enabled: true },
    { key: "tattoo", label: "문신", defaultChecked: false, enabled: true },
    { key: "ui", label: "UI / 화면 인터페이스", defaultChecked: true, enabled: true },
    { key: "background_people", label: "배경 인물", defaultChecked: false, enabled: true },
    { key: "held_object", label: "손에 든 물건", defaultChecked: false, enabled: true },
    { key: "accessory", label: "악세서리", defaultChecked: false, enabled: true },
    { key: "brand_logo", label: "브랜드 / 상표", defaultChecked: true, enabled: true },
    { key: "poster_art", label: "배경의 그림 / 포스터", defaultChecked: false, enabled: true },
    { key: "distorted_hands", label: "왜곡된 손 / 손가락 디테일", defaultChecked: false, enabled: true },
  ];

  const defaultUploadSettings = {
    preserveOriginal: false,
    autoCompress: true,
    stripExif: true,
    convertToWebp: true,
    generateThumbnail: true,
    allowClipboardPaste: true,
    allowDragDrop: true,
    detectDuplicates: true,
    autoAnalyzeAfterUpload: true,
    displayMaxSize: 2048,
    analysisMaxSize: 1536,
    thumbnailSize: 400,
    imageQuality: 80,
    maxFileSizeMb: 100,
    concurrentUploadCount: 3,
    concurrentAnalysisCount: 2,
  };

  const defaultAlbumSettings = {
    columns: 5,
    rows: 5,
    paginationPosition: "bottom",
    cardAspectRatio: "square",
    showTitle: true,
    showTags: true,
    showStatus: true,
    showFavorite: true,
  };

  const defaultCopyDisplaySettings = {
    promptViewMode: "split",
    defaultCopyMode: "en",
    includeSectionTitles: false,
    lineBreakMode: "paragraph",
    linkedHighlight: true,
    hoverHighlight: true,
    clickHighlight: true,
  };

  const defaultPromptSettings = {
    englishRules: "Natural, descriptive English for AI image generation. No analysis commentary.",
    koreanRules: "영어 문장과 1:1로 대응되는 자연스러운 한국어 번역.",
    tagRules: "활성화된 복장/배경 태그 안에서만 분류하고, 없으면 기타를 사용.",
    excludeRules: "제외 요소는 보이더라도 최종 프롬프트에 묘사하지 않음.",
    outputJsonFormat: "strict-json",
    sections: sectionMeta.map((section, index) => ({ key: section.key, labelKo: section.labelKo, labelEn: section.labelEn, enabled: true, order: index + 1 })),
  };

  const defaultCategorySettings = {
    allowAiSuggestedTags: false,
  };

  const defaultThemeSettings = {
    followSystemDarkMode: false,
    useSectionBackgrounds: true,
    sectionColors: {
      appearance: "#e0f2fe",
      outfit: "#ecfccb",
      background: "#fef3c7",
      expression_pose: "#fce7f3",
      details: "#ede9fe",
    },
  };

  const defaultAdvancedSettings = {
    dailyMaxAnalyses: 100,
    monthlyMaxAnalyses: 2000,
    maxImagesPerBatch: 30,
    maxRegenerationsPerImage: 20,
    logs: [],
  };

  const defaultOutfitTags = [
    { key: "school_uniform", name: "교복", keywords: ["school uniform", "uniform", "sailor uniform", "blazer uniform"] },
    { key: "suit", name: "정장", keywords: ["suit", "formal wear", "business suit"] },
    { key: "dress", name: "드레스", keywords: ["dress", "gown", "evening dress"] },
    { key: "casual", name: "캐주얼", keywords: ["casual", "daily outfit", "streetwear"] },
    { key: "hoodie", name: "후드티", keywords: ["hoodie", "hooded sweatshirt"] },
    { key: "coat", name: "코트", keywords: ["coat", "overcoat", "trench coat"] },
    { key: "swimsuit", name: "수영복", keywords: ["swimsuit", "bikini", "one-piece swimsuit"] },
    { key: "hanbok", name: "한복", keywords: ["hanbok", "korean traditional dress"] },
    { key: "kimono", name: "기모노", keywords: ["kimono", "yukata"] },
    { key: "fantasy_outfit", name: "판타지 의상", keywords: ["fantasy outfit", "robe", "cloak"] },
    { key: "armor", name: "갑옷", keywords: ["armor", "armour", "battle armor"] },
    { key: "sportswear", name: "운동복", keywords: ["sportswear", "tracksuit", "gym clothes"] },
    { key: "other_outfit", name: "기타", keywords: ["other"] },
  ];

  const defaultBackgroundTags = [
    { key: "cafe", name: "카페", keywords: ["cafe", "coffee shop"] },
    { key: "school", name: "학교", keywords: ["school", "classroom", "campus"] },
    { key: "street", name: "거리", keywords: ["street", "sidewalk", "road"] },
    { key: "room", name: "방", keywords: ["room", "bedroom", "interior"] },
    { key: "office", name: "사무실", keywords: ["office", "workspace"] },
    { key: "beach", name: "해변", keywords: ["beach", "shore", "seaside"] },
    { key: "forest", name: "숲", keywords: ["forest", "woods"] },
    { key: "city", name: "도시", keywords: ["city", "urban"] },
    { key: "night_street", name: "밤거리", keywords: ["night street", "neon street"] },
    { key: "studio", name: "스튜디오", keywords: ["studio", "photo studio"] },
    { key: "fantasy_background", name: "판타지 배경", keywords: ["fantasy background", "castle", "magic"] },
    { key: "future_city", name: "미래도시", keywords: ["future city", "cyberpunk city"] },
    { key: "battlefield", name: "전장", keywords: ["battlefield", "war zone"] },
    { key: "other_background", name: "기타", keywords: ["other"] },
  ];

  const sampleImageOne = "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#c7d2fe"/><stop offset="0.52" stop-color="#bae6fd"/><stop offset="1" stop-color="#fde68a"/></linearGradient></defs><rect width="800" height="600" fill="url(#g)"/><circle cx="405" cy="250" r="116" fill="#111827" opacity=".9"/><path d="M245 520c38-105 103-158 195-158s158 53 196 158" fill="#475569"/><path d="M250 164c104-81 235-78 324 8 58 56 83 132 69 209-96-78-233-93-341-38-67-57-84-127-52-179z" fill="#0f172a" opacity=".75"/><circle cx="361" cy="245" r="10" fill="#f8fafc"/><circle cx="450" cy="245" r="10" fill="#f8fafc"/></svg>`);
  const sampleImageTwo = "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#fce7f3"/><stop offset=".48" stop-color="#fef3c7"/><stop offset="1" stop-color="#d9f99d"/></linearGradient></defs><rect width="800" height="600" fill="url(#g)"/><rect x="150" y="120" width="500" height="360" rx="28" fill="#ffffff" opacity=".64"/><rect x="210" y="185" width="260" height="40" rx="8" fill="#334155"/><rect x="210" y="250" width="380" height="24" rx="6" fill="#64748b"/><rect x="210" y="292" width="330" height="24" rx="6" fill="#94a3b8"/><rect x="210" y="352" width="180" height="54" rx="10" fill="#2563eb"/></svg>`);

  const state = loadState();
  const ui = {
    view: "gallery",
    selectedId: state.items[0]?.id || null,
    query: "",
    category: "all",
    status: "all",
    sort: "latest",
    selectedSentenceId: null,
    editMode: false,
    modal: null,
    settingsTab: "api",
    filterGroup: "all",
    selectedOutfitTags: [],
    selectedBackgroundTags: [],
    page: 1,
    uploadQueue: [],
  };

  document.documentElement.dataset.theme = state.theme;
  applyThemeOptions();
  bootServerState();

  function loadState() {
    const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    if (saved) {
      try {
        return normalizeState(JSON.parse(saved));
      } catch (error) {
        console.warn("State restore failed", error);
      }
    }
    const catPortrait = uid("cat");
    const catProduct = uid("cat");
    return normalizeState({
      theme: "default-light",
      categories: [
        { id: catPortrait, name: "인물", color: "blue" },
        { id: catProduct, name: "제품", color: "amber" },
      ],
      promptInstruction: defaultInstruction,
      promptSettings: defaultPromptSettings,
      excludeOptions: defaultExcludeOptions,
      uploadSettings: defaultUploadSettings,
      albumSettings: defaultAlbumSettings,
      copyDisplaySettings: defaultCopyDisplaySettings,
      categorySettings: defaultCategorySettings,
      themeSettings: defaultThemeSettings,
      advancedSettings: defaultAdvancedSettings,
      outfitTagOptions: defaultOutfitTags,
      backgroundTagOptions: defaultBackgroundTags,
      providers: providerNames.map((name, index) => defaultProvider(name, index)),
      items: seedItems(catPortrait, catProduct),
    });
  }

  function normalizeState(input) {
    return {
      theme: input.theme || "default-light",
      categories: Array.isArray(input.categories) ? input.categories : [],
      promptInstruction: input.promptInstruction || defaultInstruction,
      promptSettings: normalizePromptSettings(input.promptSettings),
      excludeOptions: normalizeExcludeOptions(input.excludeOptions),
      uploadSettings: normalizeUploadSettings(input.uploadSettings),
      albumSettings: normalizeAlbumSettings(input.albumSettings),
      copyDisplaySettings: normalizeCopyDisplaySettings(input.copyDisplaySettings || { defaultCopyMode: input.albumSettings?.defaultCopyMode }),
      categorySettings: { ...defaultCategorySettings, ...(input.categorySettings || {}) },
      themeSettings: { ...defaultThemeSettings, ...(input.themeSettings || {}), sectionColors: { ...defaultThemeSettings.sectionColors, ...(input.themeSettings?.sectionColors || {}) } },
      advancedSettings: normalizeAdvancedSettings(input.advancedSettings),
      outfitTagOptions: normalizeTagOptions(input.outfitTagOptions, defaultOutfitTags),
      backgroundTagOptions: normalizeTagOptions(input.backgroundTagOptions, defaultBackgroundTags),
      providers: normalizeProviders(input.providers),
      items: Array.isArray(input.items) ? input.items.map(normalizeItem) : [],
    };
  }

  function defaultProvider(name, index) {
    return {
      name,
      enabled: index === 0,
      model: index === 0 ? "gpt-4.1" : "",
      visionModel: index === 0 ? "gpt-4.1" : "",
      textModel: "",
      hasServerKey: false,
      priority: index + 1,
      fallbackEnabled: index > 0,
      timeoutSeconds: 60,
      maxRetries: 2,
      useForImageAnalysis: index === 0,
      useForTranslation: index === 0,
      useForPromptCleanup: index === 0,
      useForTagging: index === 0,
      lastTestStatus: "",
    };
  }

  function normalizeProviders(list) {
    const byName = new Map(Array.isArray(list) ? list.map((provider) => [provider.name, provider]) : []);
    return providerNames.map((name, index) => ({ ...defaultProvider(name, index), ...(byName.get(name) || {}) }));
  }

  function normalizeExcludeOptions(options) {
    const source = Array.isArray(options) && options.length ? options : defaultExcludeOptions;
    return source.map((option, index) => ({
      key: option.key || uid("exclude"),
      label: option.label || "새 제외 요소",
      defaultChecked: Boolean(option.defaultChecked),
      enabled: option.enabled !== false,
      order: Number.isFinite(Number(option.order)) ? Number(option.order) : index + 1,
    })).sort((a, b) => a.order - b.order);
  }

  function normalizeTagOptions(options, defaults) {
    const source = Array.isArray(options) && options.length ? options : defaults;
    return source.map((tag, index) => ({
      key: tag.key || uid("tag"),
      name: tag.name || "기타",
      keywords: Array.isArray(tag.keywords) ? tag.keywords : [],
      enabled: tag.enabled !== false,
      allowAiAssign: tag.allowAiAssign !== false,
      order: Number.isFinite(Number(tag.order)) ? Number(tag.order) : index + 1,
    })).sort((a, b) => a.order - b.order);
  }

  function normalizeUploadSettings(settings = {}) {
    return {
      ...defaultUploadSettings,
      ...settings,
      displayMaxSize: clampNumber(settings.displayMaxSize, 512, 4096, defaultUploadSettings.displayMaxSize),
      analysisMaxSize: clampNumber(settings.analysisMaxSize, 512, 4096, defaultUploadSettings.analysisMaxSize),
      thumbnailSize: clampNumber(settings.thumbnailSize, 120, 1024, defaultUploadSettings.thumbnailSize),
      imageQuality: clampNumber(settings.imageQuality, 40, 95, defaultUploadSettings.imageQuality),
      maxFileSizeMb: clampNumber(settings.maxFileSizeMb, 10, 250, defaultUploadSettings.maxFileSizeMb),
      concurrentUploadCount: clampNumber(settings.concurrentUploadCount, 1, 8, defaultUploadSettings.concurrentUploadCount),
      concurrentAnalysisCount: clampNumber(settings.concurrentAnalysisCount, 1, 8, defaultUploadSettings.concurrentAnalysisCount),
    };
  }

  function normalizeAlbumSettings(settings = {}) {
    return {
      ...defaultAlbumSettings,
      ...settings,
      columns: clampNumber(settings.columns, 2, 8, defaultAlbumSettings.columns),
      rows: clampNumber(settings.rows, 2, 8, defaultAlbumSettings.rows),
      paginationPosition: ["top", "bottom", "both"].includes(settings.paginationPosition) ? settings.paginationPosition : defaultAlbumSettings.paginationPosition,
      cardAspectRatio: ["square", "original", "3:4", "4:3", "16:9"].includes(settings.cardAspectRatio) ? settings.cardAspectRatio : defaultAlbumSettings.cardAspectRatio,
    };
  }

  function normalizeCopyDisplaySettings(settings = {}) {
    return {
      ...defaultCopyDisplaySettings,
      ...settings,
      promptViewMode: ["split", "en", "ko"].includes(settings.promptViewMode) ? settings.promptViewMode : defaultCopyDisplaySettings.promptViewMode,
      defaultCopyMode: ["en", "ko", "both", "final"].includes(settings.defaultCopyMode) ? settings.defaultCopyMode : defaultCopyDisplaySettings.defaultCopyMode,
      lineBreakMode: ["paragraph", "oneLine", "comma"].includes(settings.lineBreakMode) ? settings.lineBreakMode : defaultCopyDisplaySettings.lineBreakMode,
    };
  }

  function normalizePromptSettings(settings = {}) {
    return {
      ...defaultPromptSettings,
      ...settings,
      sections: Array.isArray(settings.sections) && settings.sections.length ? settings.sections.map((section, index) => ({
        key: section.key || sectionMeta[index]?.key || uid("section"),
        labelKo: section.labelKo || sectionMeta[index]?.labelKo || "섹션",
        labelEn: section.labelEn || sectionMeta[index]?.labelEn || "Section",
        enabled: section.enabled !== false,
        order: Number.isFinite(Number(section.order)) ? Number(section.order) : index + 1,
      })).sort((a, b) => a.order - b.order) : defaultPromptSettings.sections,
    };
  }

  function normalizeAdvancedSettings(settings = {}) {
    return {
      ...defaultAdvancedSettings,
      ...settings,
      dailyMaxAnalyses: clampNumber(settings.dailyMaxAnalyses, 1, 10000, defaultAdvancedSettings.dailyMaxAnalyses),
      monthlyMaxAnalyses: clampNumber(settings.monthlyMaxAnalyses, 1, 200000, defaultAdvancedSettings.monthlyMaxAnalyses),
      maxImagesPerBatch: clampNumber(settings.maxImagesPerBatch, 1, 200, defaultAdvancedSettings.maxImagesPerBatch),
      maxRegenerationsPerImage: clampNumber(settings.maxRegenerationsPerImage, 1, 200, defaultAdvancedSettings.maxRegenerationsPerImage),
      logs: Array.isArray(settings.logs) ? settings.logs : [],
    };
  }

  function clampNumber(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, Math.round(number)));
  }

  function normalizeItem(item) {
    return {
      ...item,
      customInstruction: item.customInstruction || "",
      excludeOptions: Array.isArray(item.excludeOptions) ? item.excludeOptions : defaultExcludedKeys(),
      includeOptions: Array.isArray(item.includeOptions) ? item.includeOptions : [],
      analysisRequest: item.analysisRequest || "",
      displayImage: item.displayImage || null,
      thumbnailImage: item.thumbnailImage || null,
      analysisImage: item.analysisImage || null,
      originalImage: item.originalImage || null,
      uploadMeta: item.uploadMeta || null,
      outfitTags: Array.isArray(item.outfitTags) ? item.outfitTags : [],
      backgroundTags: Array.isArray(item.backgroundTags) ? item.backgroundTags : [],
      tags: Array.isArray(item.tags) ? item.tags : [],
      createdAt: item.createdAt || Date.now(),
      updatedAt: item.updatedAt || Date.now(),
      versions: Array.isArray(item.versions) ? item.versions : [],
    };
  }

  function seedItems(catOne, catTwo) {
    return [
      {
        id: uid("img"),
        title: "소프트 라이트 인물 샘플",
        memo: "인물 이미지의 조명과 표정을 기록한 샘플",
        imageUrl: sampleImageOne,
        thumbnailUrl: sampleImageOne,
        categoryId: catOne,
        categoryNameFallback: "인물",
        tags: ["portrait", "soft-light", "studio"],
        status: "analyzed",
        isFavorite: true,
        promptJson: makePrompt("portrait"),
        outfitTags: ["casual"],
        backgroundTags: ["studio"],
        finalPrompt: "",
        errorMessage: "",
        customInstruction: "캐릭터 외모와 분위기 중심으로 분석",
        excludeOptions: ["text_logo", "brand_logo"],
        createdAt: Date.now() - 86400000,
        updatedAt: Date.now() - 3600000,
        versions: [],
      },
      {
        id: uid("img"),
        title: "제품 소개 보드",
        memo: "제품 카드형 구성 분석 대기 샘플",
        imageUrl: sampleImageTwo,
        thumbnailUrl: sampleImageTwo,
        categoryId: catTwo,
        categoryNameFallback: "제품",
        tags: ["product", "layout"],
        status: "uploaded",
        isFavorite: false,
        promptJson: null,
        outfitTags: ["casual"],
        backgroundTags: ["studio"],
        finalPrompt: "",
        errorMessage: "",
        customInstruction: "제품 카드 구조는 참고하되 UI 글자는 프롬프트에 넣지 않기",
        excludeOptions: ["text_logo", "ui", "brand_logo"],
        createdAt: Date.now() - 43200000,
        updatedAt: Date.now() - 43200000,
        versions: [],
      },
    ];
  }

  function saveState() {
    if (!serverAvailable) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return;
    }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(syncStateToServer, 180);
  }

  async function bootServerState() {
    try {
      const response = await fetch(SERVER_STATE_ENDPOINT, { cache: "no-store" });
      if (!response.ok) return;
      serverAvailable = true;
      const payload = await response.json();
      if (payload?.state) {
        Object.assign(state, normalizeState(payload.state));
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(LEGACY_STORAGE_KEY);
      } else {
        await syncStateToServer();
      }
      render();
    } catch (error) {
      serverAvailable = false;
    }
  }

  async function syncStateToServer() {
    try {
      const response = await fetch(SERVER_STATE_ENDPOINT, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state }),
      });
      if (!response.ok) throw new Error("Server state save failed");
      const payload = await response.json();
      if (payload?.state) Object.assign(state, normalizeState(payload.state));
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch (error) {
      serverAvailable = false;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  }

  function uid(prefix) {
    return `${prefix}-${Math.random().toString(36).slice(2, 9)}-${Date.now().toString(36)}`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function app() {
    return document.getElementById("app");
  }

  function isLoggedIn() {
    return sessionStorage.getItem(SESSION_KEY) === "true";
  }

  function render() {
    document.documentElement.dataset.theme = state.theme;
    applyThemeOptions();
    if (!isLoggedIn()) {
      renderLogin();
      return;
    }
    app().innerHTML = `
      <div class="workspace album-workspace">
        <main class="main">
          ${renderTopbar()}
          <section class="content">${renderView()}</section>
        </main>
        ${renderModal()}
      </div>
    `;
    bindCommonEvents();
    bindViewEvents();
  }

  function renderLogin() {
    app().innerHTML = `
      <main class="login-screen">
        <form class="panel login-card" id="loginForm">
          <div class="brand">
            <span class="brand-mark">PA</span>
            <div>
              <h1>프롬프트 아카이브</h1>
              <p>관리자 작업 화면으로 들어갑니다.</p>
            </div>
          </div>
          <div class="field">
            <label for="adminPassword">관리자 비밀번호</label>
            <input class="input" id="adminPassword" type="password" autocomplete="current-password" placeholder="archive-admin">
          </div>
          <p class="notice">로컬 MVP 비밀번호는 <strong>archive-admin</strong>입니다. 실제 배포에서는 서버 인증으로 교체해야 합니다.</p>
          <button class="primary-btn" type="submit">로그인</button>
        </form>
      </main>
    `;
    document.getElementById("loginForm").addEventListener("submit", (event) => {
      event.preventDefault();
      if (document.getElementById("adminPassword").value === "archive-admin") {
        sessionStorage.setItem(SESSION_KEY, "true");
        render();
      } else {
        alert("비밀번호가 맞지 않습니다.");
      }
    });
  }

  function renderTopbar() {
    return `
      <header class="topbar album-topbar">
        <button class="brand-inline" data-view="gallery" type="button" aria-label="갤러리로 이동">
          <span class="brand-mark">PA</span>
          <span>프롬프트 아카이브</span>
        </button>
        <div class="topbar-center">
          <div class="search-wrap compact-search">
            <label class="sr-only" for="globalSearch">검색</label>
            <input class="input" id="globalSearch" value="${escapeHtml(ui.query)}" placeholder="제목, 태그, 프롬프트 검색">
          </div>
          <select class="select compact-select" id="sortSelect">
            <option value="latest" ${ui.sort === "latest" ? "selected" : ""}>최신순</option>
            <option value="oldest" ${ui.sort === "oldest" ? "selected" : ""}>오래된순</option>
            <option value="favorite" ${ui.sort === "favorite" ? "selected" : ""}>즐겨찾기순</option>
            <option value="failed" ${ui.sort === "failed" ? "selected" : ""}>분석 실패순</option>
            <option value="modified" ${ui.sort === "modified" ? "selected" : ""}>수정일순</option>
          </select>
        </div>
        <div class="topbar-actions">
          ${iconButton("upload", "업로드", "+")}
          ${iconButton("searchFocus", "검색", "⌕")}
          ${iconButton("toggleFilterGroup", "필터", "⌘")}
          ${iconButton("cycleTheme", "테마", "◐")}
          ${iconButton("settings", "설정", "⚙")}
          ${iconButton("logout", "로그아웃", "↪")}
        </div>
      </header>
    `;
  }

  function iconButton(action, label, icon) {
    return `<button class="icon-btn" data-action="${action}" type="button" aria-label="${label}" data-tooltip="${label}">${icon}</button>`;
  }

  function renderView() {
    if (ui.view === "detail") return renderDetail();
    return renderGallery();
  }

  function renderModal() {
    if (!ui.modal) return "";
    const title = ui.modal === "upload" ? "업로드" : "설정";
    const body = ui.modal === "upload" ? renderUpload() : renderSettings();
    return `
      <div class="modal-backdrop" data-action="closeModal">
        <section class="modal-panel" role="dialog" aria-modal="true" aria-label="${title}" data-modal-panel>
          <div class="modal-head">
            <strong>${title}</strong>
            <button class="icon-btn" data-action="closeModal" type="button" aria-label="닫기" data-tooltip="닫기">×</button>
          </div>
          <div class="modal-body">${body}</div>
        </section>
      </div>
    `;
  }

  function getFilteredItems() {
    const query = ui.query.trim().toLowerCase();
    let items = [...state.items];
    if (ui.status !== "all") items = items.filter((item) => item.status === ui.status);
    if (ui.category !== "all") items = items.filter((item) => item.categoryId === ui.category);
    if (ui.selectedOutfitTags.length) items = items.filter((item) => ui.selectedOutfitTags.every((tag) => (item.outfitTags || []).includes(tag)));
    if (ui.selectedBackgroundTags.length) items = items.filter((item) => ui.selectedBackgroundTags.every((tag) => (item.backgroundTags || []).includes(tag)));
    if (query) {
      items = items.filter((item) => {
        const prompt = promptText(item, "both").toLowerCase();
        return [item.title, item.memo, item.customInstruction, item.tags.join(" "), tagNames(item.outfitTags, "outfit").join(" "), tagNames(item.backgroundTags, "background").join(" "), prompt].join(" ").toLowerCase().includes(query);
      });
    }
    const sorters = {
      latest: (a, b) => b.createdAt - a.createdAt,
      oldest: (a, b) => a.createdAt - b.createdAt,
      favorite: (a, b) => Number(b.isFavorite) - Number(a.isFavorite) || b.createdAt - a.createdAt,
      failed: (a, b) => Number(b.status === "analysis_failed") - Number(a.status === "analysis_failed") || b.createdAt - a.createdAt,
      modified: (a, b) => b.updatedAt - a.updatedAt,
    };
    return items.sort(sorters[ui.sort] || sorters.latest);
  }

  function renderGallery() {
    const items = getFilteredItems();
    const perPage = state.albumSettings.columns * state.albumSettings.rows;
    const pageCount = Math.max(1, Math.ceil(items.length / perPage));
    ui.page = Math.min(Math.max(1, ui.page), pageCount);
    const pageItems = items.slice((ui.page - 1) * perPage, ui.page * perPage);
    const pager = renderPagination(pageCount);
    const showTopPager = ["top", "both"].includes(state.albumSettings.paginationPosition);
    const showBottomPager = ["bottom", "both"].includes(state.albumSettings.paginationPosition);
    return `
      <div class="page-head album-head">
        <div>
          <h2 class="page-title">앨범</h2>
          <p class="page-copy">${state.albumSettings.columns} x ${state.albumSettings.rows}, 페이지당 ${perPage}개 표시</p>
        </div>
        <div class="toolbar">
          <button class="ghost-btn" data-action="bulkAnalyze" type="button">대기 항목 분석</button>
          <button class="ghost-btn" data-action="exportJson" type="button">JSON 내보내기</button>
        </div>
      </div>
      ${renderAlbumFilters()}
      ${showTopPager ? pager : ""}
      ${pageItems.length ? `<div class="gallery-grid album-grid" style="--album-columns: ${state.albumSettings.columns}; --album-ratio: ${cardRatioValue()};">${pageItems.map(renderImageCard).join("")}</div>` : renderEmptyGallery()}
      ${showBottomPager ? pager : ""}
    `;
  }

  function renderAlbumFilters() {
    return `
      <div class="album-filter-bar">
        <div class="category-tabs">
          ${filterGroupButton("all", "전체")}
          ${filterGroupButton("outfit", "복장")}
          ${filterGroupButton("background", "배경")}
        </div>
        ${ui.filterGroup === "outfit" ? renderTagFilter("outfit", state.outfitTagOptions, ui.selectedOutfitTags) : ""}
        ${ui.filterGroup === "background" ? renderTagFilter("background", state.backgroundTagOptions, ui.selectedBackgroundTags) : ""}
      </div>
    `;
  }

  function filterGroupButton(group, label) {
    return `<button class="chip-btn ${ui.filterGroup === group ? "active" : ""}" data-filter-group="${group}" type="button">${label}</button>`;
  }

  function renderTagFilter(type, options, selected) {
    return `
      <div class="tag-filter-row">
        ${options.filter((tag) => tag.enabled !== false).map((tag) => `<button class="chip-btn ${selected.includes(tag.key) ? "active" : ""}" data-tag-filter="${type}" data-key="${tag.key}" type="button">${escapeHtml(tag.name)}</button>`).join("")}
      </div>
    `;
  }

  function renderPagination(pageCount) {
    const pages = Array.from({ length: pageCount }, (_, index) => index + 1);
    return `
      <nav class="pagination" aria-label="페이지 이동">
        <button class="tiny-btn" data-page="first" type="button" ${ui.page === 1 ? "disabled" : ""}>처음</button>
        <button class="tiny-btn" data-page="prev" type="button" ${ui.page === 1 ? "disabled" : ""}>이전</button>
        ${pages.map((page) => `<button class="tiny-btn ${ui.page === page ? "active-page" : ""}" data-page="${page}" type="button">${page}</button>`).join("")}
        <button class="tiny-btn" data-page="next" type="button" ${ui.page === pageCount ? "disabled" : ""}>다음</button>
        <button class="tiny-btn" data-page="last" type="button" ${ui.page === pageCount ? "disabled" : ""}>마지막</button>
      </nav>
    `;
  }

  function renderImageCard(item) {
    return `
      <article class="panel image-card" data-open-item="${item.id}" tabindex="0">
        <div class="thumb">
          <img src="${item.thumbnailUrl || item.imageUrl}" alt="${escapeHtml(item.title)}">
          ${state.albumSettings.showStatus ? `<span class="status-pill">${statusLabel(item.status)}</span>` : ""}
        </div>
        <div class="card-body">
          ${state.albumSettings.showTitle ? `
            <div class="card-title-row">
              <h3 class="card-title">${escapeHtml(item.title || "제목 없음")}</h3>
              ${state.albumSettings.showFavorite ? `<button class="tiny-btn" data-action="favorite" data-id="${item.id}" type="button" aria-label="즐겨찾기">${item.isFavorite ? "★" : "☆"}</button>` : ""}
            </div>
          ` : ""}
          <div class="meta-line">
            <span>${escapeHtml(categoryName(item.categoryId, item.categoryNameFallback))}</span>
            <span>${new Date(item.updatedAt).toLocaleDateString("ko-KR")}</span>
          </div>
          ${state.albumSettings.showTags ? `
            <div class="meta-line">${item.tags.map((tag) => `<span class="tag">#${escapeHtml(tag)}</span>`).join("")}</div>
            <div class="meta-line">
              ${tagNames(item.outfitTags, "outfit").map((tag) => `<span class="tag">복장 ${escapeHtml(tag)}</span>`).join("")}
              ${tagNames(item.backgroundTags, "background").map((tag) => `<span class="tag">배경 ${escapeHtml(tag)}</span>`).join("")}
            </div>
          ` : ""}
        </div>
      </article>
    `;
  }

  function renderEmptyGallery() {
    return `
      <div class="panel empty-state">
        <div>
          <h2>조건에 맞는 이미지가 없습니다.</h2>
          <p>검색어나 필터를 바꾸거나 새 이미지를 업로드해보세요.</p>
          <button class="primary-btn" data-action="upload" type="button">업로드 열기</button>
        </div>
      </div>
    `;
  }

  function renderUpload() {
    return `
      <div class="page-head">
        <div>
          <h2 class="page-title">업로드</h2>
          <p class="page-copy">이미지는 브라우저에서 먼저 압축하고, 건별 추가 요청사항과 제외 요소를 함께 저장합니다.</p>
        </div>
      </div>
      <section class="panel" style="padding: var(--space-4);">
        <div class="optimization-summary">
          <strong>업로드 전 자동 최적화</strong>
          <span>${state.uploadSettings.autoCompress ? "켜짐" : "꺼짐"}</span>
          <span>표시 ${state.uploadSettings.displayMaxSize}px</span>
          <span>분석 ${state.uploadSettings.analysisMaxSize}px</span>
          <span>썸네일 ${state.uploadSettings.thumbnailSize}px</span>
          <span>${state.uploadSettings.convertToWebp ? "WebP 변환" : "원본 포맷 우선"}</span>
          <span>품질 ${state.uploadSettings.imageQuality}%</span>
        </div>
        <div class="upload-zone" id="dropZone">
          <div>
            <h2>이미지를 놓거나 선택하세요</h2>
            <p>jpg, jpeg, png, webp 파일을 지원합니다. ${state.uploadSettings.allowClipboardPaste ? "클립보드 붙여넣기도 가능합니다." : "클립보드 붙여넣기는 설정에서 꺼져 있습니다."}</p>
            <input class="sr-only" id="fileInput" type="file" accept="image/jpeg,image/png,image/webp" multiple>
            <button class="primary-btn" id="pickFiles" type="button">파일 선택</button>
          </div>
        </div>
        <div class="form-grid" style="margin-top: var(--space-4);">
          <div class="field">
            <label for="uploadTitle">공통 제목</label>
            <input class="input" id="uploadTitle" placeholder="예: 푸른 교복 캐릭터">
          </div>
          <div class="field">
            <label for="uploadCategory">카테고리</label>
            <select class="select" id="uploadCategory">${state.categories.map((cat) => `<option value="${cat.id}">${escapeHtml(cat.name)}</option>`).join("")}</select>
          </div>
          <div class="field">
            <label for="uploadTags">태그</label>
            <input class="input" id="uploadTags" placeholder="portrait, soft-light">
          </div>
          <label class="toggle" style="align-self: end;">
            <input id="autoAnalyze" type="checkbox" ${state.uploadSettings.autoAnalyzeAfterUpload ? "checked" : ""}>
            자동 프롬프트 생성
          </label>
        </div>
        <div class="analysis-options">
          <div class="field">
            <label for="uploadCustomInstruction">이 이미지에만 적용할 추가 요청사항</label>
            <textarea class="textarea" id="uploadCustomInstruction" placeholder="뒷 유리 그림은 프롬프트에 포함하지 말 것&#10;캐릭터 외모만 중심으로 분석할 것"></textarea>
          </div>
          <fieldset class="option-fieldset">
            <legend>프롬프트에서 제외할 요소</legend>
            <p>체크된 요소는 이미지에 보여도 최종 프롬프트에 넣지 않습니다.</p>
            <div class="option-grid">
              ${enabledExcludeOptions().map((option) => renderExcludeCheckbox(option, option.defaultChecked, "uploadExclude")).join("")}
            </div>
          </fieldset>
        </div>
        <div id="queueList" class="queue-list">${renderQueue()}</div>
      </section>
    `;
  }

  function renderExcludeCheckbox(option, checked, namePrefix) {
    return `
      <label class="option-item">
        <input type="checkbox" name="${namePrefix}" value="${escapeHtml(option.key)}" ${checked ? "checked" : ""}>
        <span>${escapeHtml(option.label)}</span>
      </label>
    `;
  }

  function renderQueue() {
    if (!ui.uploadQueue.length) return "";
    return ui.uploadQueue.map((entry) => `
      <article class="panel queue-item">
        ${entry.url ? `<img src="${entry.url}" alt="${escapeHtml(entry.name)}">` : `<div class="queue-fallback" aria-hidden="true">!</div>`}
        <div>
          <strong>${escapeHtml(entry.name)}</strong>
          <div class="meta-line">
            <span>${escapeHtml(entry.status)}</span>
            ${entry.originalSize ? `<span>원본 ${formatBytes(entry.originalSize)}</span>` : ""}
            ${entry.optimizedSize ? `<span>최적화 ${formatBytes(entry.optimizedSize)}</span>` : ""}
          </div>
          ${entry.error ? `<p class="queue-error">${escapeHtml(entry.error)}</p>` : ""}
        </div>
        ${entry.itemId ? `<button class="tiny-btn" data-action="openUploaded" data-id="${entry.itemId}" type="button">열기</button>` : ""}
      </article>
    `).join("");
  }

  function renderDetail() {
    const item = selectedItem();
    if (!item) {
      ui.view = "gallery";
      return renderGallery();
    }
    return `
      <div class="page-head">
        <div>
          <h2 class="page-title">${escapeHtml(item.title || "제목 없음")}</h2>
          <p class="page-copy">${escapeHtml(item.memo || "메모가 없습니다.")}</p>
        </div>
        <div class="toolbar">
          <button class="ghost-btn" data-view="gallery" type="button">갤러리</button>
          <button class="primary-btn" data-action="analyzeOne" data-id="${item.id}" type="button">${item.promptJson ? "재분석" : "수동 분석"}</button>
        </div>
      </div>
      <div class="detail-grid">
        <section class="panel detail-media">
          <img src="${item.imageUrl}" alt="${escapeHtml(item.title)}">
          <div class="detail-meta">
            <div class="form-grid">
              <div class="field">
                <label for="detailTitle">제목</label>
                <input class="input" id="detailTitle" value="${escapeHtml(item.title)}">
              </div>
              <div class="field">
                <label for="detailCategory">카테고리</label>
                <select class="select" id="detailCategory">
                  ${state.categories.map((cat) => `<option value="${cat.id}" ${item.categoryId === cat.id ? "selected" : ""}>${escapeHtml(cat.name)}</option>`).join("")}
                </select>
              </div>
            </div>
            <div class="field">
              <label for="detailTags">태그</label>
              <input class="input" id="detailTags" value="${escapeHtml(item.tags.join(", "))}">
            </div>
            <div class="form-grid">
              <div class="field">
                <label for="detailOutfitTags">복장 태그</label>
                <input class="input" id="detailOutfitTags" value="${escapeHtml(tagNames(item.outfitTags, "outfit").join(", "))}" placeholder="교복, 캐주얼">
              </div>
              <div class="field">
                <label for="detailBackgroundTags">배경 태그</label>
                <input class="input" id="detailBackgroundTags" value="${escapeHtml(tagNames(item.backgroundTags, "background").join(", "))}" placeholder="학교, 스튜디오">
              </div>
            </div>
            <div class="field">
              <label for="detailMemo">메모/글 내용</label>
              <textarea class="textarea" id="detailMemo">${escapeHtml(item.memo)}</textarea>
            </div>
            <div class="field">
              <label for="detailCustomInstruction">이 이미지 전용 추가 요청사항</label>
              <textarea class="textarea" id="detailCustomInstruction" placeholder="이 이미지 분석에만 적용할 요청을 적어주세요.">${escapeHtml(item.customInstruction || "")}</textarea>
            </div>
            <fieldset class="option-fieldset">
              <legend>프롬프트에서 제외할 요소</legend>
              <p>체크 후 저장하고 재분석하면 새 조건으로 프롬프트를 다시 만듭니다.</p>
              <div class="option-grid">
                ${enabledExcludeOptions().map((option) => renderExcludeCheckbox(option, item.excludeOptions?.includes(option.key), "detailExclude")).join("")}
              </div>
            </fieldset>
            ${item.analysisRequest ? `
              <details class="request-preview">
                <summary>최근 분석 요청 미리보기</summary>
                <pre>${escapeHtml(item.analysisRequest)}</pre>
              </details>
            ` : ""}
            <div class="toolbar">
              <span class="status-pill">${statusLabel(item.status)}</span>
              <button class="ghost-btn" data-action="saveMeta" data-id="${item.id}" type="button">메타 저장</button>
              <button class="danger-btn" data-action="deleteItem" data-id="${item.id}" type="button">삭제</button>
            </div>
            ${item.uploadMeta ? renderAssetSummary(item) : ""}
            ${item.errorMessage ? `<p class="notice">${escapeHtml(item.errorMessage)}</p>` : ""}
          </div>
        </section>
        <section class="panel prompt-panel">
          ${renderPromptTools(item)}
          ${item.promptJson ? renderPromptColumns(item) : renderNoPrompt(item)}
        </section>
      </div>
    `;
  }

  function renderAssetSummary(item) {
    return `
      <div class="asset-summary">
        <strong>이미지 최적화</strong>
        <span>원본 ${formatBytes(item.uploadMeta.originalSize)}</span>
        ${item.displayImage ? `<span>표시 ${item.displayImage.width}x${item.displayImage.height} ${formatBytes(item.displayImage.size)}</span>` : ""}
        ${item.analysisImage ? `<span>분석 ${item.analysisImage.width}x${item.analysisImage.height} ${formatBytes(item.analysisImage.size)}</span>` : ""}
        ${item.thumbnailImage ? `<span>썸네일 ${item.thumbnailImage.width}x${item.thumbnailImage.height} ${formatBytes(item.thumbnailImage.size)}</span>` : ""}
        <span>${item.originalImage ? "원본 보관" : "원본 미보관"}</span>
      </div>
    `;
  }

  function renderPromptTools(item) {
    return `
      <div class="prompt-actions">
        <div class="toolbar" style="margin: 0;">
          <button class="ghost-btn" data-action="copyPrompt" data-mode="en" data-id="${item.id}" type="button">영어 전체 복사</button>
          <button class="ghost-btn" data-action="copyPrompt" data-mode="ko" data-id="${item.id}" type="button">번역 전체 복사</button>
          <button class="ghost-btn" data-action="copyPrompt" data-mode="both" data-id="${item.id}" type="button">영어+번역 복사</button>
          <button class="primary-btn" data-action="copyPrompt" data-mode="final" data-id="${item.id}" type="button">최종 프롬프트 복사</button>
        </div>
        <button class="ghost-btn" data-action="toggleEdit" type="button">${ui.editMode ? "보기 모드" : "수정 모드"}</button>
      </div>
    `;
  }

  function renderNoPrompt(item) {
    return `
      <div class="empty-state">
        <div>
          <h2>아직 프롬프트가 없습니다.</h2>
          <p>분석을 실행하면 외모, 복장, 배경, 표정/자세, 디테일 5개 섹션으로 저장됩니다.</p>
          <button class="primary-btn" data-action="analyzeOne" data-id="${item.id}" type="button">수동 분석</button>
        </div>
      </div>
    `;
  }

  function enabledSections() {
    return state.promptSettings.sections.filter((section) => section.enabled !== false).sort((a, b) => a.order - b.order);
  }

  function renderPromptColumns(item) {
    const mode = state.copyDisplaySettings.promptViewMode;
    const enColumn = `
      <div class="prompt-column">
        <div class="prompt-column-head">English prompt</div>
        ${enabledSections().map((section) => renderPromptSection(item, section, "en")).join("")}
      </div>
    `;
    const koColumn = `
      <div class="prompt-column">
        <div class="prompt-column-head">한국어 번역</div>
        ${enabledSections().map((section) => renderPromptSection(item, section, "ko")).join("")}
      </div>
    `;
    return `<div class="prompt-columns ${mode !== "split" ? "single-column" : ""}" id="promptColumns">${mode === "ko" ? koColumn : mode === "en" ? enColumn : enColumn + koColumn}</div>`;
  }

  function renderPromptSection(item, sectionConfig, lang) {
    const section = item.promptJson[sectionConfig.key] || { sentences: [] };
    const label = lang === "ko" ? sectionConfig.labelKo : sectionConfig.labelEn;
    return `
      <section class="prompt-section" data-section="${sectionConfig.key}">
        <div class="section-label-row">
          <h3 class="section-label">${escapeHtml(label)}</h3>
          <button class="tiny-btn section-copy-btn" data-action="copySection" data-id="${item.id}" data-section="${sectionConfig.key}" data-lang="${lang}" type="button" aria-label="${escapeHtml(label)} 문단 복사" data-tooltip="문단 복사">⧉</button>
        </div>
        ${section.sentences.map((sentence) => `
          <p class="sentence ${ui.selectedSentenceId === sentence.id ? "active" : ""}"
             data-sentence-id="${sentence.id}"
             data-lang="${lang}"
             contenteditable="${ui.editMode ? "true" : "false"}"
             spellcheck="false">${escapeHtml(sentence[lang])}</p>
        `).join("")}
        <div class="toolbar" style="margin-top: var(--space-2); margin-bottom: 0;">
          <button class="tiny-btn" data-action="regenerateSection" data-section="${sectionConfig.key}" data-id="${item.id}" type="button">${escapeHtml(label)} 재생성</button>
        </div>
      </section>
    `;
  }

  function renderSettings() {
    const tabs = [
      ["api", "API 설정"],
      ["prompt", "AI 분석 지시문"],
      ["category", "분류/태그 설정"],
      ["upload", "업로드 설정"],
      ["gallery", "갤러리 설정"],
      ["copy", "복사/표시 설정"],
      ["theme", "테마 설정"],
      ["advanced", "고급 설정"],
    ];
    return `
      <div class="page-head">
        <div>
          <h2 class="page-title">설정</h2>
          <p class="page-copy">상단 아이콘형 앱을 유지하면서 API, 분석 지시문, 태그, 업로드, 갤러리, 복사 방식을 탭별로 관리합니다.</p>
        </div>
      </div>
      <div class="settings-shell">
        <nav class="settings-tabs" aria-label="설정 탭">
          ${tabs.map(([key, label]) => `<button class="settings-tab-btn ${ui.settingsTab === key ? "active" : ""}" data-settings-tab="${key}" type="button">${label}</button>`).join("")}
        </nav>
        <section class="settings-tab-panel">${renderSettingsTab()}</section>
      </div>
    `;
  }

  function renderSettingsTab() {
    if (ui.settingsTab === "api") return renderApiSettings();
    if (ui.settingsTab === "prompt") return renderPromptSettings();
    if (ui.settingsTab === "category") return renderCategorySettings();
    if (ui.settingsTab === "upload") return renderUploadSettings();
    if (ui.settingsTab === "gallery") return renderGallerySettings();
    if (ui.settingsTab === "copy") return renderCopySettings();
    if (ui.settingsTab === "theme") return renderThemeSettings();
    return renderAdvancedSettings();
  }

  function renderApiSettings() {
    return `
      <div class="settings-section">
        <h3 class="card-title">AI 공급자</h3>
        <p class="notice">정적 MVP에서는 API Key 값을 브라우저에 저장하지 않고, 입력 시 서버 보관 표시만 남깁니다. 실제 연결은 서버 API에서 처리해야 안전합니다.</p>
        <div class="provider-list">${state.providers.map(renderProvider).join("")}</div>
      </div>
    `;
  }

  function renderProvider(provider, index) {
    return `
      <article class="panel provider-card">
        <div class="provider-head">
          <strong>${escapeHtml(provider.name)}</strong>
          <label class="toggle"><input data-provider-enabled="${index}" type="checkbox" ${provider.enabled ? "checked" : ""}> 사용</label>
        </div>
        <div class="form-grid">
          <div class="field">
            <label>기본 모델</label>
            <input class="input" data-provider-model="${index}" value="${escapeHtml(provider.model || "")}" placeholder="model-name">
          </div>
          <div class="field">
            <label>비전 모델</label>
            <input class="input" data-provider-vision-model="${index}" value="${escapeHtml(provider.visionModel || "")}" placeholder="vision model">
          </div>
          <div class="field">
            <label>텍스트 모델</label>
            <input class="input" data-provider-text-model="${index}" value="${escapeHtml(provider.textModel || "")}" placeholder="text model">
          </div>
          <div class="field">
            <label>API Key</label>
            <input class="input" data-provider-key="${index}" type="password" placeholder="${provider.hasServerKey ? "서버 저장됨" : "입력 시 서버 저장 표시"}">
          </div>
          <div class="field">
            <label>우선순위</label>
            <input class="input" data-provider-priority="${index}" type="number" min="1" max="20" value="${provider.priority}">
          </div>
          <div class="field">
            <label>타임아웃(초)</label>
            <input class="input" data-provider-timeout="${index}" type="number" min="5" max="300" value="${provider.timeoutSeconds}">
          </div>
          <div class="field">
            <label>최대 재시도</label>
            <input class="input" data-provider-retries="${index}" type="number" min="0" max="10" value="${provider.maxRetries}">
          </div>
        </div>
        <div class="option-grid">
          <label class="option-item"><input data-provider-use-image="${index}" type="checkbox" ${provider.useForImageAnalysis ? "checked" : ""}><span>이미지 분석</span></label>
          <label class="option-item"><input data-provider-use-translation="${index}" type="checkbox" ${provider.useForTranslation ? "checked" : ""}><span>번역</span></label>
          <label class="option-item"><input data-provider-use-cleanup="${index}" type="checkbox" ${provider.useForPromptCleanup ? "checked" : ""}><span>프롬프트 정리</span></label>
          <label class="option-item"><input data-provider-use-tagging="${index}" type="checkbox" ${provider.useForTagging ? "checked" : ""}><span>태그 분류</span></label>
          <label class="option-item"><input data-provider-fallback="${index}" type="checkbox" ${provider.fallbackEnabled ? "checked" : ""}><span>실패 시 폴백</span></label>
        </div>
        <div class="toolbar" style="margin: 0;">
          <button class="ghost-btn" data-action="saveProvider" data-index="${index}" type="button">설정 저장</button>
          <button class="ghost-btn" data-action="testProvider" data-index="${index}" type="button">연결 테스트</button>
          ${provider.lastTestStatus ? `<span class="status-pill">${escapeHtml(provider.lastTestStatus)}</span>` : ""}
        </div>
      </article>
    `;
  }

  function renderPromptSettings() {
    return `
      <div class="settings-section">
        <h3 class="card-title">기본 이미지 분석 지시문</h3>
        <textarea class="textarea" id="promptInstruction" style="min-height: 300px;">${escapeHtml(state.promptInstruction)}</textarea>
        <div class="form-grid">
          <div class="field"><label for="englishRules">영어 프롬프트 규칙</label><textarea class="textarea" id="englishRules">${escapeHtml(state.promptSettings.englishRules)}</textarea></div>
          <div class="field"><label for="koreanRules">한국어 번역 규칙</label><textarea class="textarea" id="koreanRules">${escapeHtml(state.promptSettings.koreanRules)}</textarea></div>
          <div class="field"><label for="tagRules">AI 분류 기준</label><textarea class="textarea" id="tagRules">${escapeHtml(state.promptSettings.tagRules)}</textarea></div>
          <div class="field"><label for="excludeRules">제외 요소 반영 규칙</label><textarea class="textarea" id="excludeRules">${escapeHtml(state.promptSettings.excludeRules)}</textarea></div>
          <div class="field"><label for="outputJsonFormat">출력 JSON 형식</label><input class="input" id="outputJsonFormat" value="${escapeHtml(state.promptSettings.outputJsonFormat)}"></div>
        </div>
        <h3 class="card-title">프롬프트 섹션</h3>
        <div class="settings-stack">
          ${state.promptSettings.sections.map((section, index) => `
            <div class="section-admin-row">
              <input class="input" data-section-ko="${section.key}" value="${escapeHtml(section.labelKo)}">
              <input class="input" data-section-en="${section.key}" value="${escapeHtml(section.labelEn)}">
              <label class="toggle"><input data-section-enabled="${section.key}" type="checkbox" ${section.enabled ? "checked" : ""}> 사용</label>
              <span class="status-pill">순서 ${index + 1}</span>
            </div>
          `).join("")}
        </div>
        <div class="toolbar">
          <button class="primary-btn" data-action="savePromptSettings" type="button">지시문 저장</button>
          <button class="ghost-btn" data-action="resetInstruction" type="button">기본값 복원</button>
        </div>
      </div>
    `;
  }

  function renderCategorySettings() {
    return `
      <div class="settings-section">
        <h3 class="card-title">복장 태그</h3>
        ${renderManagedTagSettings("outfit", state.outfitTagOptions)}
        <h3 class="card-title">배경 태그</h3>
        ${renderManagedTagSettings("background", state.backgroundTagOptions)}
        <div class="option-grid">
          <label class="option-item"><input id="allowAiSuggestedTags" type="checkbox" ${state.categorySettings.allowAiSuggestedTags ? "checked" : ""}><span>AI 추천 태그 자동 추가 허용</span></label>
        </div>
        <div class="toolbar">
          <button class="primary-btn" data-action="saveCategorySettings" type="button">분류 설정 저장</button>
          <button class="ghost-btn" data-action="resetDefaultTags" type="button">기본 태그 복원</button>
        </div>
        <h3 class="card-title">제외 요소 체크박스 항목</h3>
        <div class="toolbar">
          <input class="input" id="newExcludeOption" placeholder="새 제외 요소">
          <button class="primary-btn" data-action="addExcludeOption" type="button">추가</button>
        </div>
        <div class="settings-stack">
          ${state.excludeOptions.map((option, index) => `
            <div class="option-admin-row">
              <input class="input" data-exclude-label="${option.key}" value="${escapeHtml(option.label)}">
              <label class="toggle"><input data-exclude-enabled="${option.key}" type="checkbox" ${option.enabled ? "checked" : ""}> 표시</label>
              <label class="toggle"><input data-exclude-default="${option.key}" type="checkbox" ${option.defaultChecked ? "checked" : ""}> 기본 체크</label>
              <button class="tiny-btn" data-action="moveExcludeOption" data-key="${option.key}" data-direction="-1" type="button" ${index === 0 ? "disabled" : ""}>위</button>
              <button class="tiny-btn" data-action="moveExcludeOption" data-key="${option.key}" data-direction="1" type="button" ${index === state.excludeOptions.length - 1 ? "disabled" : ""}>아래</button>
              <button class="ghost-btn" data-action="saveExcludeOption" data-key="${option.key}" type="button">저장</button>
              <button class="danger-btn" data-action="deleteExcludeOption" data-key="${option.key}" type="button">삭제</button>
            </div>
          `).join("")}
        </div>
      </div>
    `;
  }

  function renderManagedTagSettings(type, options) {
    return `
      <div class="toolbar">
        <input class="input" id="new-${type}-tag" placeholder="새 태그 이름">
        <input class="input" id="new-${type}-keywords" placeholder="AI 키워드, 쉼표로 구분">
        <button class="primary-btn" data-action="addManagedTag" data-type="${type}" type="button">추가</button>
      </div>
      <div class="settings-stack">
        ${options.map((tag, index) => `
          <div class="managed-tag-row">
            <input class="input" data-managed-tag-name="${type}-${tag.key}" value="${escapeHtml(tag.name)}">
            <input class="input" data-managed-tag-keywords="${type}-${tag.key}" value="${escapeHtml((tag.keywords || []).join(", "))}">
            <label class="toggle"><input data-managed-tag-enabled="${type}-${tag.key}" type="checkbox" ${tag.enabled ? "checked" : ""}> 표시</label>
            <label class="toggle"><input data-managed-tag-ai="${type}-${tag.key}" type="checkbox" ${tag.allowAiAssign ? "checked" : ""}> AI 분류</label>
            <button class="tiny-btn" data-action="moveManagedTag" data-type="${type}" data-key="${tag.key}" data-direction="-1" type="button" ${index === 0 ? "disabled" : ""}>위</button>
            <button class="tiny-btn" data-action="moveManagedTag" data-type="${type}" data-key="${tag.key}" data-direction="1" type="button" ${index === options.length - 1 ? "disabled" : ""}>아래</button>
            <button class="ghost-btn" data-action="saveManagedTag" data-type="${type}" data-key="${tag.key}" type="button">저장</button>
            <button class="danger-btn" data-action="deleteManagedTag" data-type="${type}" data-key="${tag.key}" type="button">삭제</button>
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderUploadSettings() {
    return `
      <div class="settings-section">
        <h3 class="card-title">업로드 최적화</h3>
        <div class="option-grid">
          ${checkboxOption("preserveOriginal", state.uploadSettings.preserveOriginal, "원본 이미지 보관")}
          ${checkboxOption("autoCompress", state.uploadSettings.autoCompress, "업로드 전 이미지 자동 압축")}
          ${checkboxOption("stripExif", state.uploadSettings.stripExif, "EXIF 메타데이터 제거")}
          ${checkboxOption("convertToWebp", state.uploadSettings.convertToWebp, "WebP로 자동 변환")}
          ${checkboxOption("generateThumbnail", state.uploadSettings.generateThumbnail, "썸네일 자동 생성")}
          ${checkboxOption("allowClipboardPaste", state.uploadSettings.allowClipboardPaste, "클립보드 붙여넣기 허용")}
          ${checkboxOption("allowDragDrop", state.uploadSettings.allowDragDrop, "드래그 앤 드롭 허용")}
          ${checkboxOption("detectDuplicates", state.uploadSettings.detectDuplicates, "중복 업로드 감지")}
          ${checkboxOption("autoAnalyzeAfterUpload", state.uploadSettings.autoAnalyzeAfterUpload, "업로드 후 자동 분석")}
        </div>
        <div class="form-grid">
          ${numberField("displayMaxSize", "최대 표시 이미지 크기", state.uploadSettings.displayMaxSize, 512, 4096)}
          ${numberField("analysisMaxSize", "AI 분석용 이미지 크기", state.uploadSettings.analysisMaxSize, 512, 4096)}
          ${numberField("thumbnailSize", "썸네일 크기", state.uploadSettings.thumbnailSize, 120, 1024)}
          ${numberField("imageQuality", "이미지 품질(%)", state.uploadSettings.imageQuality, 40, 95)}
          ${numberField("maxFileSizeMb", "업로드 차단 용량(MB)", state.uploadSettings.maxFileSizeMb, 10, 250)}
          ${numberField("concurrentUploadCount", "동시 업로드 수", state.uploadSettings.concurrentUploadCount, 1, 8)}
          ${numberField("concurrentAnalysisCount", "동시 분석 수", state.uploadSettings.concurrentAnalysisCount, 1, 8)}
        </div>
        <div class="toolbar"><button class="primary-btn" data-action="saveUploadSettings" type="button">업로드 설정 저장</button></div>
        <p class="notice">브라우저 캔버스로 리사이즈와 포맷 변환을 수행해 서버 트래픽과 저장 용량을 줄입니다. GIF는 기본 차단합니다.</p>
      </div>
    `;
  }

  function renderGallerySettings() {
    return `
      <div class="settings-section">
        <h3 class="card-title">갤러리 표시 설정</h3>
        <div class="form-grid">
          ${numberField("albumColumns", "열 개수", state.albumSettings.columns, 2, 8)}
          ${numberField("albumRows", "행 개수", state.albumSettings.rows, 2, 8)}
          <div class="field"><label>페이지당 이미지</label><input class="input" value="${state.albumSettings.columns * state.albumSettings.rows}" disabled></div>
          <div class="field">
            <label for="paginationPosition">페이지 이동 위치</label>
            <select class="select" id="paginationPosition">
              ${option("bottom", "하단", state.albumSettings.paginationPosition)}
              ${option("top", "상단", state.albumSettings.paginationPosition)}
              ${option("both", "상단+하단", state.albumSettings.paginationPosition)}
            </select>
          </div>
          <div class="field">
            <label for="cardAspectRatio">카드 비율</label>
            <select class="select" id="cardAspectRatio">
              ${option("square", "1:1", state.albumSettings.cardAspectRatio)}
              ${option("3:4", "3:4", state.albumSettings.cardAspectRatio)}
              ${option("4:3", "4:3", state.albumSettings.cardAspectRatio)}
              ${option("16:9", "16:9", state.albumSettings.cardAspectRatio)}
              ${option("original", "원본형", state.albumSettings.cardAspectRatio)}
            </select>
          </div>
        </div>
        <div class="option-grid">
          ${checkboxOption("showTitle", state.albumSettings.showTitle, "카드 제목 표시")}
          ${checkboxOption("showTags", state.albumSettings.showTags, "카드 태그 표시")}
          ${checkboxOption("showStatus", state.albumSettings.showStatus, "상태 표시")}
          ${checkboxOption("showFavorite", state.albumSettings.showFavorite, "즐겨찾기 표시")}
        </div>
        <div class="toolbar"><button class="primary-btn" data-action="saveAlbumSettings" type="button">갤러리 설정 저장</button></div>
      </div>
    `;
  }

  function renderCopySettings() {
    return `
      <div class="settings-section">
        <h3 class="card-title">프롬프트 복사/표시</h3>
        <div class="form-grid">
          <div class="field">
            <label for="promptViewMode">상세 보기 모드</label>
            <select class="select" id="promptViewMode">
              ${option("split", "좌우 분할", state.copyDisplaySettings.promptViewMode)}
              ${option("en", "영어만", state.copyDisplaySettings.promptViewMode)}
              ${option("ko", "한국어만", state.copyDisplaySettings.promptViewMode)}
            </select>
          </div>
          <div class="field">
            <label for="defaultCopyMode">문단 복사 기본값</label>
            <select class="select" id="defaultCopyMode">
              ${option("en", "영어 문단", state.copyDisplaySettings.defaultCopyMode)}
              ${option("ko", "한국어 문단", state.copyDisplaySettings.defaultCopyMode)}
              ${option("both", "영어 + 한국어", state.copyDisplaySettings.defaultCopyMode)}
              ${option("final", "최종 프롬프트", state.copyDisplaySettings.defaultCopyMode)}
            </select>
          </div>
          <div class="field">
            <label for="lineBreakMode">복사 줄바꿈</label>
            <select class="select" id="lineBreakMode">
              ${option("paragraph", "문단형", state.copyDisplaySettings.lineBreakMode)}
              ${option("oneLine", "한 줄", state.copyDisplaySettings.lineBreakMode)}
              ${option("comma", "쉼표 연결", state.copyDisplaySettings.lineBreakMode)}
            </select>
          </div>
        </div>
        <div class="option-grid">
          ${checkboxOption("includeSectionTitles", state.copyDisplaySettings.includeSectionTitles, "섹션 제목 포함")}
          ${checkboxOption("linkedHighlight", state.copyDisplaySettings.linkedHighlight, "문장 연동 하이라이트")}
          ${checkboxOption("hoverHighlight", state.copyDisplaySettings.hoverHighlight, "마우스오버 하이라이트")}
          ${checkboxOption("clickHighlight", state.copyDisplaySettings.clickHighlight, "클릭 하이라이트")}
        </div>
        <div class="toolbar"><button class="primary-btn" data-action="saveCopyDisplaySettings" type="button">복사/표시 설정 저장</button></div>
      </div>
    `;
  }

  function renderThemeSettings() {
    return `
      <div class="settings-section">
        <h3 class="card-title">테마</h3>
        <div class="settings-stack theme-button-grid">
          ${themes.map(([id, label]) => `<button class="chip-btn ${state.theme === id ? "active" : ""}" data-theme="${id}" type="button">${label}</button>`).join("")}
        </div>
        <div class="option-grid">
          ${checkboxOption("followSystemDarkMode", state.themeSettings.followSystemDarkMode, "시스템 다크 모드 따르기")}
          ${checkboxOption("useSectionBackgrounds", state.themeSettings.useSectionBackgrounds, "문단별 배경색 사용")}
        </div>
        <h3 class="card-title">문단 색상</h3>
        <div class="form-grid">
          ${sectionMeta.map((section) => `
            <div class="field">
              <label for="sectionColor-${section.key}">${section.labelKo}</label>
              <input class="input" id="sectionColor-${section.key}" type="color" value="${escapeHtml(state.themeSettings.sectionColors[section.key] || defaultThemeSettings.sectionColors[section.key])}">
            </div>
          `).join("")}
        </div>
        <div class="toolbar"><button class="primary-btn" data-action="saveThemeSettings" type="button">테마 설정 저장</button></div>
      </div>
    `;
  }

  function renderAdvancedSettings() {
    const stats = usageStats();
    return `
      <div class="settings-section">
        <h3 class="card-title">사용량 / 비용 관리</h3>
        <div class="mini-stat-grid">
          <div class="panel mini-stat"><strong>${stats.total}</strong><span>총 이미지</span></div>
          <div class="panel mini-stat"><strong>${stats.analyzed}</strong><span>분석 완료</span></div>
          <div class="panel mini-stat"><strong>${stats.failed}</strong><span>실패</span></div>
          <div class="panel mini-stat"><strong>${stats.storedMb}MB</strong><span>예상 저장량</span></div>
        </div>
        <div class="form-grid">
          ${numberField("dailyMaxAnalyses", "일일 최대 분석 수", state.advancedSettings.dailyMaxAnalyses, 1, 10000)}
          ${numberField("monthlyMaxAnalyses", "월간 최대 분석 수", state.advancedSettings.monthlyMaxAnalyses, 1, 200000)}
          ${numberField("maxImagesPerBatch", "배치당 최대 이미지", state.advancedSettings.maxImagesPerBatch, 1, 200)}
          ${numberField("maxRegenerationsPerImage", "이미지당 최대 재생성", state.advancedSettings.maxRegenerationsPerImage, 1, 200)}
        </div>
        <div class="toolbar">
          <button class="primary-btn" data-action="saveAdvancedSettings" type="button">고급 설정 저장</button>
          <button class="ghost-btn" data-action="retryFailed" type="button">실패 항목 재시도</button>
          <button class="ghost-btn" data-action="exportJson" type="button">JSON 백업</button>
          <button class="ghost-btn" data-action="exportCsv" type="button">CSV 내보내기</button>
          <button class="danger-btn" data-action="resetSettingsOnly" type="button">설정 기본값 복원</button>
        </div>
      </div>
    `;
  }

  function checkboxOption(id, checked, label) {
    return `<label class="option-item"><input id="${id}" type="checkbox" ${checked ? "checked" : ""}><span>${label}</span></label>`;
  }

  function numberField(id, label, value, min, max) {
    return `<div class="field"><label for="${id}">${label}</label><input class="input" id="${id}" type="number" min="${min}" max="${max}" value="${value}"></div>`;
  }

  function option(value, label, current) {
    return `<option value="${value}" ${current === value ? "selected" : ""}>${label}</option>`;
  }

  function bindCommonEvents() {
    document.querySelectorAll("[data-view]").forEach((node) => {
      node.addEventListener("click", () => {
        if (node.dataset.view === "upload" || node.dataset.view === "settings") {
          ui.modal = node.dataset.view;
          if (node.dataset.view === "settings") ui.settingsTab = "api";
        } else {
          ui.view = node.dataset.view;
          ui.modal = null;
        }
        render();
      });
    });
    document.querySelectorAll("[data-settings-tab]").forEach((node) => {
      node.addEventListener("click", () => {
        ui.settingsTab = node.dataset.settingsTab;
        render();
      });
    });
    document.querySelectorAll("[data-filter-group]").forEach((node) => {
      node.addEventListener("click", () => {
        ui.filterGroup = node.dataset.filterGroup;
        ui.page = 1;
        render();
      });
    });
    document.querySelectorAll("[data-tag-filter]").forEach((node) => {
      node.addEventListener("click", () => {
        const target = node.dataset.tagFilter === "outfit" ? ui.selectedOutfitTags : ui.selectedBackgroundTags;
        const key = node.dataset.key;
        const index = target.indexOf(key);
        if (index >= 0) target.splice(index, 1);
        else target.push(key);
        ui.page = 1;
        render();
      });
    });
    document.querySelectorAll("[data-page]").forEach((node) => {
      node.addEventListener("click", () => {
        const pageCount = Math.max(1, Math.ceil(getFilteredItems().length / (state.albumSettings.columns * state.albumSettings.rows)));
        const command = node.dataset.page;
        if (command === "first") ui.page = 1;
        else if (command === "prev") ui.page = Math.max(1, ui.page - 1);
        else if (command === "next") ui.page = Math.min(pageCount, ui.page + 1);
        else if (command === "last") ui.page = pageCount;
        else ui.page = Number(command);
        render();
      });
    });
    const search = document.getElementById("globalSearch");
    if (search) {
      search.addEventListener("input", (event) => {
        ui.query = event.target.value;
        if (ui.view !== "gallery") ui.view = "gallery";
        ui.page = 1;
        render();
      });
    }
    const sort = document.getElementById("sortSelect");
    if (sort) {
      sort.addEventListener("change", (event) => {
        ui.sort = event.target.value;
        render();
      });
    }
    document.querySelector('[data-action="logout"]')?.addEventListener("click", () => {
      sessionStorage.removeItem(SESSION_KEY);
      render();
    });
  }

  function bindViewEvents() {
    document.querySelectorAll("[data-open-item]").forEach((node) => {
      node.addEventListener("click", (event) => {
        if (event.target.closest("button")) return;
        openItem(node.dataset.openItem);
      });
      node.addEventListener("keydown", (event) => {
        if (event.key === "Enter") openItem(node.dataset.openItem);
      });
    });
    document.querySelectorAll("[data-action]").forEach((node) => {
      node.addEventListener("click", (event) => handleAction(event, node));
    });
    bindUploadEvents();
    bindPromptEvents();
    bindSettingsEvents();
  }

  function handleAction(event, node) {
    const action = node.dataset.action;
    if (action === "upload" || action === "settings") {
      ui.modal = action;
      if (action === "settings") ui.settingsTab = "api";
      render();
      return;
    }
    if (action === "closeModal") {
      if (node.classList.contains("modal-backdrop") && event.target !== node) return;
      ui.modal = null;
      render();
      return;
    }
    if (action === "searchFocus") document.getElementById("globalSearch")?.focus();
    if (action === "toggleFilterGroup") {
      ui.filterGroup = ui.filterGroup === "all" ? "outfit" : ui.filterGroup === "outfit" ? "background" : "all";
      render();
    }
    if (action === "cycleTheme") cycleTheme();
    if (action === "favorite") {
      event.stopPropagation();
      const item = findItem(node.dataset.id);
      item.isFavorite = !item.isFavorite;
      item.updatedAt = Date.now();
      saveState();
      render();
    }
    if (action === "openUploaded") openItem(node.dataset.id);
    if (action === "analyzeOne") analyzeItem(node.dataset.id);
    if (action === "bulkAnalyze") {
      state.items.filter((item) => item.status === "uploaded" || item.status === "analysis_failed").forEach((item) => analyzeItem(item.id, false));
      saveState();
      render();
    }
    if (action === "exportJson") exportJson();
    if (action === "exportCsv") exportCsv();
    if (action === "copyPrompt") copyPrompt(node.dataset.id, node.dataset.mode);
    if (action === "copySection") copySection(node.dataset.id, node.dataset.section, node.dataset.lang);
    if (action === "toggleEdit") {
      ui.editMode = !ui.editMode;
      render();
    }
    if (action === "regenerateSection") regenerateSection(node.dataset.id, node.dataset.section);
    if (action === "saveMeta") saveMeta(node.dataset.id);
    if (action === "deleteItem") deleteItem(node.dataset.id);
    if (action === "addExcludeOption") addExcludeOption();
    if (action === "saveExcludeOption") saveExcludeOption(node.dataset.key);
    if (action === "deleteExcludeOption") deleteExcludeOption(node.dataset.key);
    if (action === "moveExcludeOption") moveExcludeOption(node.dataset.key, Number(node.dataset.direction));
    if (action === "savePromptSettings") savePromptSettings();
    if (action === "saveUploadSettings") saveUploadSettings();
    if (action === "saveAlbumSettings") saveAlbumSettings();
    if (action === "saveCopyDisplaySettings") saveCopyDisplaySettings();
    if (action === "saveThemeSettings") saveThemeSettings();
    if (action === "saveAdvancedSettings") saveAdvancedSettings();
    if (action === "saveCategorySettings") saveCategorySettings();
    if (action === "addManagedTag") addManagedTag(node.dataset.type);
    if (action === "saveManagedTag") saveManagedTag(node.dataset.type, node.dataset.key);
    if (action === "deleteManagedTag") deleteManagedTag(node.dataset.type, node.dataset.key);
    if (action === "moveManagedTag") moveManagedTag(node.dataset.type, node.dataset.key, Number(node.dataset.direction));
    if (action === "resetInstruction") {
      state.promptInstruction = defaultInstruction;
      state.promptSettings = normalizePromptSettings(defaultPromptSettings);
      saveState();
      render();
    }
    if (action === "resetDefaultTags") resetDefaultTags();
    if (action === "resetSettingsOnly") resetSettingsOnly();
    if (action === "retryFailed") retryFailed();
    if (action === "saveProvider") saveProvider(Number(node.dataset.index));
    if (action === "testProvider") testProvider(Number(node.dataset.index));
  }

  function bindUploadEvents() {
    const dropZone = document.getElementById("dropZone");
    const input = document.getElementById("fileInput");
    const pick = document.getElementById("pickFiles");
    if (!dropZone || !input || !pick) return;
    pick.addEventListener("click", () => input.click());
    input.addEventListener("change", () => processFiles(input.files));
    if (state.uploadSettings.allowDragDrop) {
      ["dragenter", "dragover"].forEach((name) => {
        dropZone.addEventListener(name, (event) => {
          event.preventDefault();
          dropZone.classList.add("dragging");
        });
      });
      ["dragleave", "drop"].forEach((name) => {
        dropZone.addEventListener(name, (event) => {
          event.preventDefault();
          dropZone.classList.remove("dragging");
        });
      });
      dropZone.addEventListener("drop", (event) => processFiles(event.dataTransfer.files));
    }
  }

  window.addEventListener("paste", (event) => {
    if (ui.modal !== "upload" || !state.uploadSettings.allowClipboardPaste) return;
    const files = [...(event.clipboardData?.items || [])]
      .filter((item) => item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter(Boolean);
    if (files.length) processFiles(files);
  });

  function bindPromptEvents() {
    document.querySelectorAll(".sentence").forEach((node) => {
      node.addEventListener("mouseenter", () => {
        if (!state.copyDisplaySettings.hoverHighlight || !state.copyDisplaySettings.linkedHighlight) return;
        ui.selectedSentenceId = node.dataset.sentenceId;
        highlightSentence(ui.selectedSentenceId);
      });
      node.addEventListener("click", () => {
        if (!state.copyDisplaySettings.clickHighlight || !state.copyDisplaySettings.linkedHighlight) return;
        ui.selectedSentenceId = node.dataset.sentenceId;
        highlightSentence(ui.selectedSentenceId);
      });
      node.addEventListener("input", () => updateSentence(node));
      node.addEventListener("blur", () => saveState());
    });
  }

  function bindSettingsEvents() {
    document.querySelectorAll("[data-theme]").forEach((node) => {
      node.addEventListener("click", () => {
        state.theme = node.dataset.theme;
        saveState();
        render();
      });
    });
  }

  function highlightSentence(id) {
    document.querySelectorAll(".sentence").forEach((node) => {
      node.classList.toggle("active", node.dataset.sentenceId === id);
    });
  }

  function updateSentence(node) {
    const item = selectedItem();
    if (!item?.promptJson) return;
    const sentenceId = node.dataset.sentenceId;
    const lang = node.dataset.lang;
    Object.values(item.promptJson).forEach((section) => {
      section.sentences.forEach((sentence) => {
        if (sentence.id === sentenceId) sentence[lang] = node.textContent.trim();
      });
    });
    item.status = "modified";
    item.updatedAt = Date.now();
    item.finalPrompt = promptText(item, "final");
  }

  async function processFiles(fileList) {
    const files = [...fileList].slice(0, state.advancedSettings.maxImagesPerBatch);
    const title = document.getElementById("uploadTitle")?.value.trim() || "";
    const categoryId = document.getElementById("uploadCategory")?.value || state.categories[0]?.id || "";
    const tags = parseTags(document.getElementById("uploadTags")?.value || "");
    const customInstruction = document.getElementById("uploadCustomInstruction")?.value.trim() || "";
    const excludeOptions = selectedCheckboxValues("uploadExclude");
    const autoAnalyze = document.getElementById("autoAnalyze")?.checked !== false;
    for (const file of files) {
      try {
        validateUploadFile(file);
        if (state.uploadSettings.detectDuplicates && isDuplicateFile(file)) {
          throw new Error("같은 이름과 용량의 이미지가 이미 업로드되어 있습니다.");
        }
        const optimized = await optimizeImageFile(file, state.uploadSettings);
        const item = {
          id: uid("img"),
          title: title || file.name.replace(/\.[^.]+$/, ""),
          memo: "",
          imageUrl: optimized.displayImage.dataUrl,
          thumbnailUrl: optimized.thumbnailImage.dataUrl,
          displayImage: optimized.displayImage,
          thumbnailImage: optimized.thumbnailImage,
          analysisImage: optimized.analysisImage,
          originalImage: optimized.originalImage,
          uploadMeta: optimized.meta,
          categoryId,
          tags,
          outfitTags: inferTags(file.name, "outfit"),
          backgroundTags: inferTags(file.name, "background"),
          status: autoAnalyze ? "analyzing" : "uploaded",
          isFavorite: false,
          promptJson: null,
          finalPrompt: "",
          errorMessage: "",
          customInstruction,
          excludeOptions,
          includeOptions: [],
          analysisRequest: "",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          versions: [],
        };
        state.items.unshift(item);
        ui.uploadQueue.unshift({
          name: file.name,
          originalSize: file.size,
          optimizedSize: optimized.displayImage.size,
          url: optimized.thumbnailImage.dataUrl,
          status: autoAnalyze ? "최적화 및 분석 완료" : "최적화 저장 완료",
          itemId: item.id,
        });
        if (autoAnalyze) {
          item.analysisRequest = buildAnalysisRequest(item);
          applyPrompt(item, makePrompt("upload"));
        }
        saveState();
        render();
      } catch (error) {
        ui.uploadQueue.unshift({
          name: file.name,
          originalSize: file.size,
          optimizedSize: 0,
          url: "",
          status: "업로드 오류",
          error: error.message || "이미지 변환에 실패했습니다.",
        });
        render();
      }
    }
  }

  function analyzeItem(id, shouldRender = true) {
    const item = findItem(id);
    if (!item) return;
    item.status = "analyzing";
    item.updatedAt = Date.now();
    item.analysisRequest = buildAnalysisRequest(item);
    item.outfitTags = item.outfitTags?.length ? item.outfitTags : inferTags(item.title + " " + item.tags.join(" "), "outfit");
    item.backgroundTags = item.backgroundTags?.length ? item.backgroundTags : inferTags(item.title + " " + item.tags.join(" "), "background");
    applyPrompt(item, makePrompt(item.tags.includes("product") ? "product" : "upload"));
    if (shouldRender) {
      saveState();
      render();
    }
  }

  function applyPrompt(item, promptJson) {
    if (item.promptJson) {
      item.versions.unshift({ id: uid("ver"), promptJson: structuredClone(item.promptJson), finalPrompt: item.finalPrompt, createdAt: Date.now() });
    }
    item.promptJson = promptJson;
    item.finalPrompt = promptText(item, "final");
    item.status = "analyzed";
    item.errorMessage = "";
    item.updatedAt = Date.now();
  }

  function regenerateSection(id, key) {
    const item = findItem(id);
    if (!item?.promptJson) return;
    item.versions.unshift({ id: uid("ver"), promptJson: structuredClone(item.promptJson), finalPrompt: item.finalPrompt, createdAt: Date.now() });
    const fresh = makePrompt("upload")[key];
    item.promptJson[key] = fresh;
    item.finalPrompt = promptText(item, "final");
    item.status = "modified";
    item.updatedAt = Date.now();
    saveState();
    render();
  }

  function makePrompt(kind) {
    const product = kind === "product";
    const data = {
      appearance: [
        [product ? "A clean product display is framed with balanced visual weight." : "A young person with soft facial features is shown in gentle studio lighting.", product ? "균형 잡힌 시각적 무게로 깔끔한 제품 디스플레이가 구성되어 있다." : "부드러운 얼굴 특징을 가진 젊은 인물이 은은한 스튜디오 조명 속에 보인다."],
        [product ? "The subject has crisp edges, simple proportions, and a polished catalog look." : "The hair silhouette is neat, with natural volume and refined edges.", product ? "대상은 또렷한 가장자리, 단순한 비례, 정돈된 카탈로그 느낌을 가진다." : "머리 실루엣은 자연스러운 볼륨과 정돈된 가장자리로 깔끔하다."],
      ],
      outfit: [
        [product ? "Use minimal styling so the product shape remains the main focus." : "The outfit is casual and clean, with simple layered fabric and soft contrast.", product ? "제품 형태가 주된 초점이 되도록 스타일링은 최소화한다." : "복장은 캐주얼하고 깔끔하며, 단순한 레이어와 부드러운 대비를 가진다."],
        [product ? "Avoid unnecessary logos or readable text in the final generation prompt." : "Fabric details should look natural, with gentle folds and realistic texture.", product ? "최종 이미지 생성 프롬프트에는 불필요한 로고나 읽을 수 있는 글자를 피한다." : "원단 디테일은 자연스럽고, 부드러운 주름과 사실적인 질감을 가진다."],
      ],
      background: [
        [product ? "The background is a calm studio layout with clean negative space." : "The background feels like a quiet studio with soft color separation.", product ? "배경은 깨끗한 여백을 가진 차분한 스튜디오 레이아웃이다." : "배경은 부드러운 색 분리가 있는 조용한 스튜디오처럼 느껴진다."],
        ["Ambient light separates the subject from the surrounding space without harsh glare.", "주변광은 강한 번짐 없이 피사체를 공간에서 분리한다."],
      ],
      expression_pose: [
        [product ? "The composition faces forward with a stable editorial product angle." : "The pose feels calm, attentive, and suitable for a portrait generation prompt.", product ? "구도는 안정적인 에디토리얼 제품 각도로 정면성을 가진다." : "자세는 차분하고 집중되어 있으며 인물 생성 프롬프트에 적합하다."],
        ["The visual rhythm is steady, with no exaggerated motion or crowded gestures.", "시각적 리듬은 안정적이며 과장된 움직임이나 복잡한 제스처가 없다."],
      ],
      details: [
        ["Use high detail, natural light behavior, refined edges, and coherent color grading.", "높은 디테일, 자연스러운 빛의 흐름, 정돈된 가장자리, 일관된 색 보정을 사용한다."],
        ["The final image should feel polished, reusable, and suitable for prompt archiving.", "최종 이미지는 완성도 있고 재사용 가능하며 프롬프트 아카이브에 적합해야 한다."],
      ],
    };
    const prompt = {};
    sectionMeta.forEach((section) => {
      prompt[section.key] = {
        title_ko: section.labelKo,
        sentences: data[section.key].map(([en, ko], index) => ({ id: `${section.key}-${index + 1}`, en, ko })),
      };
    });
    return prompt;
  }

  function saveMeta(id) {
    const item = findItem(id);
    if (!item) return;
    item.title = document.getElementById("detailTitle").value.trim();
    item.categoryId = document.getElementById("detailCategory").value;
    item.tags = parseTags(document.getElementById("detailTags").value);
    item.outfitTags = namesToTagKeys(document.getElementById("detailOutfitTags")?.value || "", "outfit");
    item.backgroundTags = namesToTagKeys(document.getElementById("detailBackgroundTags")?.value || "", "background");
    item.memo = document.getElementById("detailMemo").value.trim();
    item.customInstruction = document.getElementById("detailCustomInstruction")?.value.trim() || "";
    item.excludeOptions = selectedCheckboxValues("detailExclude");
    item.updatedAt = Date.now();
    saveState();
    render();
  }

  function deleteItem(id) {
    if (!confirm("이 이미지를 삭제할까요?")) return;
    const index = state.items.findIndex((item) => item.id === id);
    if (index >= 0) state.items.splice(index, 1);
    ui.selectedId = state.items[0]?.id || null;
    ui.view = "gallery";
    saveState();
    render();
  }

  function addExcludeOption() {
    const input = document.getElementById("newExcludeOption");
    const label = input?.value.trim();
    if (!label) return;
    state.excludeOptions.push({ key: uid("exclude"), label, defaultChecked: false, enabled: true, order: state.excludeOptions.length + 1 });
    saveState();
    render();
  }

  function saveExcludeOption(key) {
    const optionItem = state.excludeOptions.find((entry) => entry.key === key);
    const labelInput = document.querySelector(`[data-exclude-label="${key}"]`);
    if (!optionItem || !labelInput) return;
    optionItem.label = labelInput.value.trim() || optionItem.label;
    optionItem.defaultChecked = Boolean(document.querySelector(`[data-exclude-default="${key}"]`)?.checked);
    optionItem.enabled = document.querySelector(`[data-exclude-enabled="${key}"]`)?.checked !== false;
    saveState();
    render();
  }

  function deleteExcludeOption(key) {
    if (!confirm("이 제외 요소 항목을 삭제할까요? 기존 이미지의 선택값에서도 제거됩니다.")) return;
    state.excludeOptions = state.excludeOptions.filter((optionItem) => optionItem.key !== key);
    state.items.forEach((item) => {
      item.excludeOptions = (item.excludeOptions || []).filter((optionKey) => optionKey !== key);
    });
    saveState();
    render();
  }

  function moveExcludeOption(key, direction) {
    moveInArray(state.excludeOptions, key, direction);
    state.excludeOptions.forEach((optionItem, index) => optionItem.order = index + 1);
    saveState();
    render();
  }

  function savePromptSettings() {
    state.promptInstruction = document.getElementById("promptInstruction").value;
    state.promptSettings = normalizePromptSettings({
      ...state.promptSettings,
      englishRules: document.getElementById("englishRules")?.value || "",
      koreanRules: document.getElementById("koreanRules")?.value || "",
      tagRules: document.getElementById("tagRules")?.value || "",
      excludeRules: document.getElementById("excludeRules")?.value || "",
      outputJsonFormat: document.getElementById("outputJsonFormat")?.value || "strict-json",
      sections: state.promptSettings.sections.map((section) => ({
        ...section,
        labelKo: document.querySelector(`[data-section-ko="${section.key}"]`)?.value.trim() || section.labelKo,
        labelEn: document.querySelector(`[data-section-en="${section.key}"]`)?.value.trim() || section.labelEn,
        enabled: document.querySelector(`[data-section-enabled="${section.key}"]`)?.checked !== false,
      })),
    });
    saveState();
    render();
  }

  function saveUploadSettings() {
    state.uploadSettings = normalizeUploadSettings({
      preserveOriginal: document.getElementById("preserveOriginal")?.checked,
      autoCompress: document.getElementById("autoCompress")?.checked,
      stripExif: document.getElementById("stripExif")?.checked,
      convertToWebp: document.getElementById("convertToWebp")?.checked,
      generateThumbnail: document.getElementById("generateThumbnail")?.checked,
      allowClipboardPaste: document.getElementById("allowClipboardPaste")?.checked,
      allowDragDrop: document.getElementById("allowDragDrop")?.checked,
      detectDuplicates: document.getElementById("detectDuplicates")?.checked,
      autoAnalyzeAfterUpload: document.getElementById("autoAnalyzeAfterUpload")?.checked,
      displayMaxSize: document.getElementById("displayMaxSize")?.value,
      analysisMaxSize: document.getElementById("analysisMaxSize")?.value,
      thumbnailSize: document.getElementById("thumbnailSize")?.value,
      imageQuality: document.getElementById("imageQuality")?.value,
      maxFileSizeMb: document.getElementById("maxFileSizeMb")?.value,
      concurrentUploadCount: document.getElementById("concurrentUploadCount")?.value,
      concurrentAnalysisCount: document.getElementById("concurrentAnalysisCount")?.value,
    });
    saveState();
    render();
  }

  function saveAlbumSettings() {
    state.albumSettings = normalizeAlbumSettings({
      columns: document.getElementById("albumColumns")?.value,
      rows: document.getElementById("albumRows")?.value,
      paginationPosition: document.getElementById("paginationPosition")?.value,
      cardAspectRatio: document.getElementById("cardAspectRatio")?.value,
      showTitle: document.getElementById("showTitle")?.checked,
      showTags: document.getElementById("showTags")?.checked,
      showStatus: document.getElementById("showStatus")?.checked,
      showFavorite: document.getElementById("showFavorite")?.checked,
    });
    ui.page = 1;
    saveState();
    render();
  }

  function saveCopyDisplaySettings() {
    state.copyDisplaySettings = normalizeCopyDisplaySettings({
      promptViewMode: document.getElementById("promptViewMode")?.value,
      defaultCopyMode: document.getElementById("defaultCopyMode")?.value,
      includeSectionTitles: document.getElementById("includeSectionTitles")?.checked,
      lineBreakMode: document.getElementById("lineBreakMode")?.value,
      linkedHighlight: document.getElementById("linkedHighlight")?.checked,
      hoverHighlight: document.getElementById("hoverHighlight")?.checked,
      clickHighlight: document.getElementById("clickHighlight")?.checked,
    });
    saveState();
    render();
  }

  function saveThemeSettings() {
    state.themeSettings = {
      ...state.themeSettings,
      followSystemDarkMode: document.getElementById("followSystemDarkMode")?.checked,
      useSectionBackgrounds: document.getElementById("useSectionBackgrounds")?.checked,
      sectionColors: Object.fromEntries(sectionMeta.map((section) => [section.key, document.getElementById(`sectionColor-${section.key}`)?.value || defaultThemeSettings.sectionColors[section.key]])),
    };
    saveState();
    render();
  }

  function saveAdvancedSettings() {
    state.advancedSettings = normalizeAdvancedSettings({
      ...state.advancedSettings,
      dailyMaxAnalyses: document.getElementById("dailyMaxAnalyses")?.value,
      monthlyMaxAnalyses: document.getElementById("monthlyMaxAnalyses")?.value,
      maxImagesPerBatch: document.getElementById("maxImagesPerBatch")?.value,
      maxRegenerationsPerImage: document.getElementById("maxRegenerationsPerImage")?.value,
    });
    saveState();
    render();
  }

  function saveCategorySettings() {
    state.categorySettings.allowAiSuggestedTags = Boolean(document.getElementById("allowAiSuggestedTags")?.checked);
    saveState();
    render();
  }

  function addManagedTag(type) {
    const nameInput = document.getElementById(`new-${type}-tag`);
    const keywordInput = document.getElementById(`new-${type}-keywords`);
    const name = nameInput?.value.trim();
    if (!name) return;
    tagOptions(type).push({ key: uid(`${type}-tag`), name, keywords: parseTags(keywordInput?.value || ""), enabled: true, allowAiAssign: true, order: tagOptions(type).length + 1 });
    saveState();
    render();
  }

  function saveManagedTag(type, key) {
    const tag = tagOptions(type).find((entry) => entry.key === key);
    const nameInput = document.querySelector(`[data-managed-tag-name="${type}-${key}"]`);
    const keywordInput = document.querySelector(`[data-managed-tag-keywords="${type}-${key}"]`);
    if (!tag || !nameInput) return;
    tag.name = nameInput.value.trim() || tag.name;
    tag.keywords = parseTags(keywordInput?.value || "");
    tag.enabled = document.querySelector(`[data-managed-tag-enabled="${type}-${key}"]`)?.checked !== false;
    tag.allowAiAssign = document.querySelector(`[data-managed-tag-ai="${type}-${key}"]`)?.checked !== false;
    saveState();
    render();
  }

  function deleteManagedTag(type, key) {
    if (!confirm("이 태그를 삭제할까요? 기존 이미지의 선택값에서도 제거됩니다.")) return;
    const options = tagOptions(type);
    const index = options.findIndex((tag) => tag.key === key);
    if (index >= 0) options.splice(index, 1);
    state.items.forEach((item) => {
      const field = type === "outfit" ? "outfitTags" : "backgroundTags";
      item[field] = (item[field] || []).filter((tagKey) => tagKey !== key);
    });
    saveState();
    render();
  }

  function moveManagedTag(type, key, direction) {
    const options = tagOptions(type);
    moveInArray(options, key, direction);
    options.forEach((tag, index) => tag.order = index + 1);
    saveState();
    render();
  }

  function resetDefaultTags() {
    if (!confirm("복장/배경 태그를 기본값으로 되돌릴까요?")) return;
    state.outfitTagOptions = normalizeTagOptions(defaultOutfitTags, defaultOutfitTags);
    state.backgroundTagOptions = normalizeTagOptions(defaultBackgroundTags, defaultBackgroundTags);
    saveState();
    render();
  }

  function resetSettingsOnly() {
    if (!confirm("이미지는 유지하고 설정만 기본값으로 되돌릴까요?")) return;
    state.promptInstruction = defaultInstruction;
    state.promptSettings = normalizePromptSettings(defaultPromptSettings);
    state.excludeOptions = normalizeExcludeOptions(defaultExcludeOptions);
    state.uploadSettings = normalizeUploadSettings(defaultUploadSettings);
    state.albumSettings = normalizeAlbumSettings(defaultAlbumSettings);
    state.copyDisplaySettings = normalizeCopyDisplaySettings(defaultCopyDisplaySettings);
    state.categorySettings = { ...defaultCategorySettings };
    state.themeSettings = { ...defaultThemeSettings, sectionColors: { ...defaultThemeSettings.sectionColors } };
    state.advancedSettings = normalizeAdvancedSettings(defaultAdvancedSettings);
    saveState();
    render();
  }

  function retryFailed() {
    state.items.filter((item) => item.status === "analysis_failed").forEach((item) => analyzeItem(item.id, false));
    saveState();
    render();
  }

  function cycleTheme() {
    const index = themes.findIndex(([id]) => id === state.theme);
    state.theme = themes[(index + 1) % themes.length][0];
    saveState();
    render();
  }

  function saveProvider(index) {
    const provider = state.providers[index];
    if (!provider) return;
    provider.enabled = document.querySelector(`[data-provider-enabled="${index}"]`).checked;
    provider.model = document.querySelector(`[data-provider-model="${index}"]`).value.trim();
    provider.visionModel = document.querySelector(`[data-provider-vision-model="${index}"]`).value.trim();
    provider.textModel = document.querySelector(`[data-provider-text-model="${index}"]`).value.trim();
    provider.hasServerKey = Boolean(document.querySelector(`[data-provider-key="${index}"]`).value.trim()) || provider.hasServerKey;
    provider.priority = clampNumber(document.querySelector(`[data-provider-priority="${index}"]`).value, 1, 20, provider.priority);
    provider.timeoutSeconds = clampNumber(document.querySelector(`[data-provider-timeout="${index}"]`).value, 5, 300, provider.timeoutSeconds);
    provider.maxRetries = clampNumber(document.querySelector(`[data-provider-retries="${index}"]`).value, 0, 10, provider.maxRetries);
    provider.useForImageAnalysis = document.querySelector(`[data-provider-use-image="${index}"]`).checked;
    provider.useForTranslation = document.querySelector(`[data-provider-use-translation="${index}"]`).checked;
    provider.useForPromptCleanup = document.querySelector(`[data-provider-use-cleanup="${index}"]`).checked;
    provider.useForTagging = document.querySelector(`[data-provider-use-tagging="${index}"]`).checked;
    provider.fallbackEnabled = document.querySelector(`[data-provider-fallback="${index}"]`).checked;
    saveState();
    render();
  }

  function testProvider(index) {
    const provider = state.providers[index];
    if (!provider) return;
    provider.lastTestStatus = provider.enabled && (provider.hasServerKey || document.querySelector(`[data-provider-key="${index}"]`)?.value.trim())
      ? "성공: 서버 키 표시 확인"
      : "실패: API Key 또는 사용 설정 필요";
    if (document.querySelector(`[data-provider-key="${index}"]`)?.value.trim()) provider.hasServerKey = true;
    saveState();
    render();
  }

  function exportJson() {
    const payload = JSON.stringify(state, null, 2);
    navigator.clipboard.writeText(payload).then(() => alert("전체 백업 JSON을 클립보드에 복사했습니다."));
  }

  function exportCsv() {
    const rows = [["id", "title", "status", "tags", "outfitTags", "backgroundTags", "createdAt"]];
    state.items.forEach((item) => rows.push([
      item.id,
      item.title || "",
      item.status || "",
      item.tags.join("|"),
      tagNames(item.outfitTags, "outfit").join("|"),
      tagNames(item.backgroundTags, "background").join("|"),
      new Date(item.createdAt).toISOString(),
    ]));
    navigator.clipboard.writeText(rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n")).then(() => alert("CSV를 클립보드에 복사했습니다."));
  }

  function copyPrompt(id, mode) {
    const item = findItem(id);
    if (!item?.promptJson) return;
    navigator.clipboard.writeText(promptText(item, mode)).then(() => alert("복사했습니다."));
  }

  function copySection(id, sectionKey, lang) {
    const item = findItem(id);
    const sectionConfig = state.promptSettings.sections.find((section) => section.key === sectionKey);
    const sentences = item?.promptJson?.[sectionKey]?.sentences || [];
    const mode = state.copyDisplaySettings.defaultCopyMode || lang || "en";
    const parts = [];
    if (state.copyDisplaySettings.includeSectionTitles && sectionConfig) parts.push(mode === "ko" ? sectionConfig.labelKo : sectionConfig.labelEn);
    if (mode === "both") parts.push(...sentences.map((sentence) => `${sentence.en}\n${sentence.ko}`));
    else if (mode === "ko") parts.push(...sentences.map((sentence) => sentence.ko));
    else parts.push(...sentences.map((sentence) => sentence.en));
    navigator.clipboard.writeText(joinCopiedLines(parts, mode === "final")).then(() => alert("문단을 복사했습니다."));
  }

  function promptText(item, mode) {
    if (!item?.promptJson) return "";
    const lines = [];
    enabledSections().forEach((section) => {
      const sentences = item.promptJson[section.key]?.sentences || [];
      const includeTitle = mode !== "final" && state.copyDisplaySettings.includeSectionTitles;
      if (mode === "final") {
        lines.push(...sentences.map((sentence) => sentence.en));
      } else if (mode === "en") {
        if (includeTitle) lines.push(`[${section.labelEn}]`);
        lines.push(...sentences.map((sentence) => sentence.en));
      } else if (mode === "ko") {
        if (includeTitle) lines.push(`[${section.labelKo}]`);
        lines.push(...sentences.map((sentence) => sentence.ko));
      } else {
        if (includeTitle) lines.push(`[${section.labelEn} / ${section.labelKo}]`);
        lines.push(...sentences.map((sentence) => `${sentence.en}\n${sentence.ko}`));
      }
    });
    return joinCopiedLines(lines, mode === "final");
  }

  function joinCopiedLines(lines, forceOneLine = false) {
    if (forceOneLine || state.copyDisplaySettings.lineBreakMode === "oneLine") return lines.join(" ");
    if (state.copyDisplaySettings.lineBreakMode === "comma") return lines.join(", ");
    return lines.join("\n");
  }

  function parseTags(value) {
    return String(value || "").split(",").map((tag) => tag.trim().replace(/^#/, "")).filter(Boolean);
  }

  function tagOptions(type) {
    return type === "outfit" ? state.outfitTagOptions : state.backgroundTagOptions;
  }

  function tagNames(keys = [], type) {
    return keys.map((key) => tagOptions(type).find((tag) => tag.key === key)?.name || key).filter(Boolean);
  }

  function namesToTagKeys(value, type) {
    return parseTags(value).map((name) => {
      const existing = tagOptions(type).find((tag) => tag.name === name || tag.key === name);
      if (existing) return existing.key;
      if (!state.categorySettings.allowAiSuggestedTags) return fallbackTag(type);
      const created = { key: uid(`${type}-tag`), name, keywords: [], enabled: true, allowAiAssign: false, order: tagOptions(type).length + 1 };
      tagOptions(type).push(created);
      return created.key;
    });
  }

  function inferTags(source, type) {
    const text = String(source || "").toLowerCase();
    const matched = tagOptions(type)
      .filter((tag) => tag.enabled !== false && tag.allowAiAssign !== false)
      .filter((tag) => tag.name.toLowerCase().split(/\s+/).some((part) => text.includes(part)) || (tag.keywords || []).some((keyword) => text.includes(keyword.toLowerCase())))
      .map((tag) => tag.key);
    if (matched.length) return matched.slice(0, 3);
    return [fallbackTag(type)];
  }

  function fallbackTag(type) {
    return tagOptions(type).find((tag) => tag.name === "기타")?.key || tagOptions(type)[0]?.key || "";
  }

  function validateUploadFile(file) {
    const maxBytes = state.uploadSettings.maxFileSizeMb * 1024 * 1024;
    if (file.size > maxBytes) throw new Error(`${state.uploadSettings.maxFileSizeMb}MB 이상 파일은 업로드 전에 차단합니다.`);
    if (file.type === "image/gif") throw new Error("GIF는 현재 차단합니다. 첫 프레임만 사용하려면 정적 이미지로 변환해주세요.");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("jpg, jpeg, png, webp 파일만 업로드할 수 있습니다.");
  }

  function isDuplicateFile(file) {
    return state.items.some((item) => item.uploadMeta?.originalName === file.name && item.uploadMeta?.originalSize === file.size);
  }

  async function optimizeImageFile(file, settings) {
    const sourceDataUrl = await fileToDataUrl(file);
    if (!settings.autoCompress) {
      return {
        displayImage: makeImageAsset(sourceDataUrl, file.type, file.size, 0, 0, "original"),
        thumbnailImage: makeImageAsset(sourceDataUrl, file.type, file.size, 0, 0, "original-thumbnail"),
        analysisImage: makeImageAsset(sourceDataUrl, file.type, file.size, 0, 0, "original-analysis"),
        originalImage: settings.preserveOriginal ? makeImageAsset(sourceDataUrl, file.type, file.size, 0, 0, "original") : null,
        meta: { originalName: file.name, originalSize: file.size, optimized: false, stripExif: false },
      };
    }
    const image = await loadImage(sourceDataUrl);
    const webpSupported = settings.convertToWebp && supportsWebP();
    const mimeType = webpSupported ? "image/webp" : "image/jpeg";
    const quality = settings.imageQuality / 100;
    const displayImage = await renderImageAsset(image, settings.displayMaxSize, mimeType, quality, "displayImage");
    const thumbnailImage = settings.generateThumbnail ? await renderImageAsset(image, settings.thumbnailSize, mimeType, quality, "thumbnailImage") : displayImage;
    const analysisImage = await renderImageAsset(image, settings.analysisMaxSize, mimeType, quality, "analysisImage");
    return {
      displayImage,
      thumbnailImage,
      analysisImage,
      originalImage: settings.preserveOriginal ? makeImageAsset(sourceDataUrl, file.type, file.size, image.naturalWidth, image.naturalHeight, "originalImage") : null,
      meta: {
        originalName: file.name,
        originalType: file.type,
        originalSize: file.size,
        originalWidth: image.naturalWidth,
        originalHeight: image.naturalHeight,
        optimized: true,
        format: mimeType,
        quality: settings.imageQuality,
        stripExif: settings.stripExif,
        webpFallback: settings.convertToWebp && !webpSupported,
      },
    };
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("파일을 읽을 수 없습니다."));
      reader.readAsDataURL(file);
    });
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("브라우저에서 이미지를 해석하지 못했습니다."));
      image.src = src;
    });
  }

  async function renderImageAsset(image, maxSize, mimeType, quality, role) {
    const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: mimeType !== "image/jpeg" });
    if (!context) throw new Error("브라우저 캔버스를 사용할 수 없습니다.");
    if (mimeType === "image/jpeg") {
      context.fillStyle = "white";
      context.fillRect(0, 0, width, height);
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, width, height);
    const blob = await compressCanvas(canvas, mimeType, quality);
    const dataUrl = await blobToDataUrl(blob);
    return makeImageAsset(dataUrl, blob.type || mimeType, blob.size, width, height, role);
  }

  async function compressCanvas(canvas, mimeType, quality) {
    let currentQuality = quality;
    let blob = await canvasToBlob(canvas, mimeType, currentQuality);
    const targetBytes = 2 * 1024 * 1024;
    while (blob.size > targetBytes && currentQuality > 0.55) {
      currentQuality = Math.max(0.55, currentQuality - 0.1);
      blob = await canvasToBlob(canvas, mimeType, currentQuality);
    }
    return blob;
  }

  function canvasToBlob(canvas, mimeType, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) reject(new Error("이미지 변환에 실패했습니다."));
        else resolve(blob);
      }, mimeType, quality);
    });
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("변환된 이미지를 읽을 수 없습니다."));
      reader.readAsDataURL(blob);
    });
  }

  function makeImageAsset(dataUrl, type, size, width, height, role) {
    return { dataUrl, type, size, width, height, role };
  }

  function supportsWebP() {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL("image/webp").startsWith("data:image/webp");
  }

  function formatBytes(bytes) {
    if (!bytes) return "0 KB";
    const units = ["B", "KB", "MB"];
    let value = bytes;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }
    return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
  }

  function selectedCheckboxValues(name) {
    return [...document.querySelectorAll(`input[name="${name}"]:checked`)].map((input) => input.value);
  }

  function enabledExcludeOptions() {
    return state.excludeOptions.filter((optionItem) => optionItem.enabled !== false);
  }

  function defaultExcludedKeys() {
    return enabledExcludeOptions().filter((optionItem) => optionItem.defaultChecked).map((optionItem) => optionItem.key);
  }

  function excludeLabels(keys) {
    return (keys || []).map((key) => state.excludeOptions.find((optionItem) => optionItem.key === key)?.label).filter(Boolean);
  }

  function buildAnalysisRequest(item) {
    const excluded = excludeLabels(item.excludeOptions);
    const enabledOutfits = state.outfitTagOptions.filter((tag) => tag.enabled !== false && tag.allowAiAssign !== false).map((tag) => tag.name);
    const enabledBackgrounds = state.backgroundTagOptions.filter((tag) => tag.enabled !== false && tag.allowAiAssign !== false).map((tag) => tag.name);
    return [
      state.promptInstruction,
      "",
      "Additional user instruction for this image:",
      item.customInstruction || "(none)",
      "",
      "Elements to exclude from the generated prompt:",
      excluded.length ? excluded.map((label) => `- ${label}`).join("\n") : "(none)",
      "",
      "Enabled outfit tags:",
      enabledOutfits.map((label) => `- ${label}`).join("\n"),
      "",
      "Enabled background tags:",
      enabledBackgrounds.map((label) => `- ${label}`).join("\n"),
      "",
      "Even if excluded elements appear in the image, do not describe them in the final prompt unless the user specifically asks to include them.",
    ].join("\n");
  }

  function openItem(id) {
    ui.selectedId = id;
    ui.view = "detail";
    ui.editMode = false;
    render();
  }

  function selectedItem() {
    return findItem(ui.selectedId);
  }

  function findItem(id) {
    return state.items.find((item) => item.id === id);
  }

  function categoryName(id, fallback = "미분류") {
    return state.categories.find((category) => category.id === id)?.name || fallback || "미분류";
  }

  function statusLabel(status) {
    const labels = {
      analyzed: "분석 완료",
      analyzing: "분석 중",
      analysis_failed: "분석 실패",
      uploaded: "수동 대기",
      modified: "수정됨",
    };
    return labels[status] || status;
  }

  function cardRatioValue() {
    const map = { square: "1 / 1", "3:4": "3 / 4", "4:3": "4 / 3", "16:9": "16 / 9", original: "4 / 3" };
    return map[state.albumSettings.cardAspectRatio] || "1 / 1";
  }

  function moveInArray(options, key, direction) {
    const index = options.findIndex((entry) => entry.key === key);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= options.length) return;
    const [entry] = options.splice(index, 1);
    options.splice(nextIndex, 0, entry);
  }

  function applyThemeOptions() {
    const root = document.documentElement;
    if (!state.themeSettings.useSectionBackgrounds) {
      sectionMeta.forEach((section) => root.style.setProperty(`--section-${section.colorKey.replace("_pose", "")}`, "var(--panel)"));
      return;
    }
    const colors = state.themeSettings.sectionColors || {};
    root.style.setProperty("--section-appearance", colors.appearance || defaultThemeSettings.sectionColors.appearance);
    root.style.setProperty("--section-outfit", colors.outfit || defaultThemeSettings.sectionColors.outfit);
    root.style.setProperty("--section-background", colors.background || defaultThemeSettings.sectionColors.background);
    root.style.setProperty("--section-expression", colors.expression_pose || defaultThemeSettings.sectionColors.expression_pose);
    root.style.setProperty("--section-details", colors.details || defaultThemeSettings.sectionColors.details);
  }

  function usageStats() {
    const totalBytes = state.items.reduce((sum, item) => sum + (item.displayImage?.size || item.uploadMeta?.originalSize || 0), 0);
    return {
      total: state.items.length,
      analyzed: state.items.filter((item) => item.status === "analyzed" || item.status === "modified").length,
      failed: state.items.filter((item) => item.status === "analysis_failed").length,
      storedMb: (totalBytes / 1024 / 1024).toFixed(1),
    };
  }

  render();
})();
