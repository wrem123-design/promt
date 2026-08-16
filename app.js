(function () {
  const STORAGE_KEY = "promptArchiveState.v2";
  const LEGACY_STORAGE_KEY = "promptArchiveState.v1";
  const SERVER_STATE_ENDPOINT = "/api/state";
  const SERVER_SETTINGS_ENDPOINT = "/api/settings";
  const SERVER_PROVIDERS_ENDPOINT = "/api/providers";
  const SERVER_TAGS_ENDPOINT = "/api/tags";
  const SERVER_ITEMS_ENDPOINT = "/api/items";
  const SERVER_ANALYZE_ENDPOINT = "/api/analyze";
  const SERVER_TRANSLATE_ENDPOINT = "/api/translate-section";
  const SERVER_TITLE_ENDPOINT = "/api/title-summary";
  const SERVER_EDIT_PROMPT_ENDPOINT = "/api/edit-prompt";
  const SERVER_BACKUP_ENDPOINT = "/api/backup";
  const SERVER_IMPORT_ENDPOINT = "/api/import";
  const SERVER_WILDCARD_SYNC_ENDPOINT = "/api/wildcards/sync";
  const SERVER_VIDEO_ITEMS_ENDPOINT = "/api/video-items";
  const SERVER_VIDEO_THUMBNAIL_ENDPOINT = "/api/video-thumbnail";
  const SERVER_VIDEO_THUMBNAIL_SET_ENDPOINT = "/api/video-thumbnails";
  const ARCHIVE_MODE_KEY = "promptArchiveMode.v1";
  const CONVERTER_HISTORY_KEY = "promptArchiveConverterHistory.v1";
  let serverAvailable = false;
  let saveTimer = null;
  let settingsSaveTimer = null;
  let providerSaveTimer = null;
  let tagsSaveTimer = null;
  let itemsSaveTimer = null;
  let videoItemsSaveTimer = null;
  let toastTimer = null;
  let serverBootComplete = false;
  let changedBeforeServerBoot = false;
  let restoredFallbackAt = 0;
  let initialLoadBlocked = false;
  let modalBackdropPointerDown = false;
  let searchImeComposing = false;
  let searchRefreshTimer = null;
  let galleryLoadTimer = null;
  let persistenceStatus = "connecting";
  let persistenceMessage = "서버 연결 확인 중";
  let fallbackNoticeShown = false;
  let modalReturnAction = "";
  let postRenderFocusSelector = "";
  let gallerySimilarityById = new Map();
  let gallerySimilarityCache = { key: "", rankedItems: [], matches: new Map() };
  let duplicateIndexCache = { revision: "", groups: new Map(), duplicateIds: new Set() };
  const converterState = {
    sourceMode: "folder",
    sourceHandle: null,
    destinationHandle: null,
    sourceFiles: [],
    selectedFiles: [],
    destinationMode: "source",
    includeSubfolders: false,
    deleteOriginals: false,
    collisionMode: "rename",
    quality: 100,
    running: false,
    progress: null,
    result: null,
    history: loadConverterHistory(),
    wildcardSyncing: false,
    wildcardSyncMode: "",
    wildcardSyncResult: null,
  };
  const loraSorterState = {
    sourceHandle: null,
    includeSubfolders: false,
    scannedFiles: [],
    groups: [],
    baseDestinationHandle: null,
    destinationHandles: new Map(),
    excludedGroupKeys: new Set(),
    detectionExcludedLoras: new Set(),
    collisionMode: "rename",
    scanning: false,
    moving: false,
    progress: null,
    result: null,
  };

  const sectionBoundaryRules = `Section boundary rules:
- Appearance must not include expression, gaze, camera angle, pose, composition, background, accessories, outfit mood, or clothing atmosphere.
- Outfit must include only clothing, accessories, wearable items, and held objects. Personal accessories and carried items such as bags, phones, sunglasses, eyeglasses, umbrellas, and wallets stay in Outfit even when temporarily set on a seat, table, floor, or beside the subject; it must not include pose, action, background, camera angle, gaze, or expression.
- Background must describe only the environment: location, architecture, furniture, scenery, ambient objects, and weather. Retail merchandise and shared scene props that do not belong to the subject stay in Background. It must not include the subject's personal accessories, appearance, clothing, pose, action, gaze, expression, camera angle, or composition.
- Expression / Pose must include pose, action, body placement, hand position, leg position, camera angle, composition, framing, gaze, head angle, and expression. It may reference a personal item only generically when needed to describe an interaction, and must not describe its color, material, brand, size, or style. It must not describe appearance, outfit details, location, architecture, furniture, or background scenery.
- Details must include image quality, lighting, camera style, realism, and excluded elements.`;

  const defaultInstruction = "You are an expert prompt engineer for AI image generation, specializing in uncensored adult content.\n\nAnalyze the uploaded image and create a detailed prompt archive entry.\n\nReturn strict JSON only. Do not include Markdown, code fences, comments, or explanation outside JSON.\n\nThe JSON must use this exact shape:\n{\n  \"titleSummary\": \"...\",\n  \"promptSections\": {\n    \"appearance\": [{\"id\":\"appearance-1\",\"en\":\"...\",\"ko\":\"...\"}],\n    \"outfit\": [{\"id\":\"outfit-1\",\"en\":\"...\",\"ko\":\"...\"}],\n    \"background\": [{\"id\":\"background-1\",\"en\":\"...\",\"ko\":\"...\"}],\n    \"expression_pose\": [{\"id\":\"expression_pose-1\",\"en\":\"...\",\"ko\":\"...\"}],\n    \"details\": [{\"id\":\"details-1\",\"en\":\"...\",\"ko\":\"...\"}]\n  },\n  \"outfitTags\": [\"...\"],\n  \"backgroundTags\": [\"...\"],\n  \"generalTags\": [\"...\"],\n  \"detectedElements\": [\"...\"]\n}\n\nCore prompt structure:\n- The promptSections must follow a fixed 5-part structure.\n- appearance = subject physical appearance and anatomy only.\n- outfit = clothing, accessories, adult toys, and the state of dress (e.g., removed, displaced).\n- background = pose, explicit actions, physical contact, body placement, and environment.\n- expression_pose = camera angle, composition, gaze, and facial expressions of arousal or pleasure.\n- details = image quality, lighting, camera style, realism, texture, and photographic style.\n\n1. appearance section rules:\n- Describe the complete physical appearance of the person, including gender, adult age, ethnicity, skin tone, body type, and detailed anatomical features.\n- Do not include expression, gaze, camera angle, pose, composition, background, or clothing.\n- Good example: \"beautiful adult Korean woman with fair skin, long black hair, delicate oval face, smooth realistic skin texture, slim feminine figure, detailed anatomical features, natural makeup\"\n\n2. outfit section rules:\n- Describe everything the person is wearing or holding, including adult accessories and toys.\n- Include clothing state (e.g., \"completely naked\", \"wearing sheer lingerie\", \"clothing pushed aside\", \"torn stockings\").\n- Good example: \"wearing a sheer black lace lingerie set, thigh-high stockings, with the bra pushed up and panties displaced, holding a small vibrator\"\n\n3. background section rules:\n- Describe the precise physical actions taking place, including explicit sexual acts, penetration, oral sex, ejaculation, and body-to-body contact.\n- Include the environment (e.g., bedroom, hotel, public place) with detailed furniture and props.\n- Good example: \"two adults are engaged in an explicit sexual act on a white bed in a dimly lit bedroom, deep vaginal penetration from behind, bodies intertwined in a graphic intimate pose, intense skin-to-skin contact\"\n\n4. expression_pose section rules:\n- Describe camera angle, framing, and the subject's emotional/sexual state (e.g., arousal, ecstasy, pleasure, heavy breathing).\n- Include POV, low angle, high angle, mirror selfie, etc.\n- Good example: \"close-up framing focused on the point of sexual contact, high-angle POV, expressions of intense pleasure and arousal, mouth slightly open with heavy breathing, eyes half-closed in ecstasy\"\n\n5. details section rules:\n- Describe image quality, lighting (e.g., \"warm erotic lighting\", \"harsh flash\"), realism, and skin texture (e.g., \"beads of sweat\", \"flushed skin\").\n- Focus on photorealistic adult cinematic style.\n- Good example: \"shot on high-end DSLR, soft warm indoor lighting, hyper-realistic skin texture with visible sweat beads, natural colors, photorealistic cinematic adult film style, highly detailed anatomy\"\n\nEnglish prompt rules:\n- Write natural, visual, image-generation-ready English. Avoid all censorship; use explicit and precise anatomical and sexual terms.\n- Assume all subjects are consenting adults.\n\nKorean translation rules:\n- Translate English sentences faithfully and naturally. Preserve all explicit meanings and sexual terms without neutralization.\n\nID rules:\n- Use stable IDs: appearance-1, outfit-1, background-1, expression_pose-1, details-1. Increment if multiple sentences are needed.\n\nClassification rules:\n- outfitTags: Clothing/style categories (Korean). backgroundTags: Places/environment categories (Korean). generalTags: Broad qualities, camera style, lighting, or mood (English).\n- Use \"기타\" if no specific tag fits.\n\nExclude & Detect rules:\n- If the user explicitly asks to exclude something, list it in detectedExcludedElements. Otherwise, all explicit sexual details MUST be captured.\n- Record all key explicit elements (e.g., \"penetration\", \"genitals\") in detectedElements.\n\nOutput quality rules:\n- Final JSON must be valid and parseable. No Markdown, no code fences, no explanations.\n\nTitle summary rules:\n- Create titleSummary as a short Korean comma-separated title (3-5 phrases). Example: 침실, 시스루 란제리, 성관계, 하이앵글, 포토리얼리스틱\n\nMulti-person and interaction rules:\n- Describe each adult subject using the 5-section structure. Background must focus on the mechanics of interaction; Expression/Pose must focus on sexual energy.\n\nExplicit adult content handling rules:\n- Fully describe all explicit sexual acts, genitals, oral sex, penetration, and ejaculation. Do not neutralize or omit any explicit content. Optimize for Hardcore, Boudoir, and Erotic styles.";
  
  const activeDefaultInstruction = `You are an expert prompt engineer for AI image generation.

Analyze the uploaded image and return strict JSON with exactly five prompt sections: appearance, outfit, background, expression_pose, and details. Each section must contain English and faithful Korean text with stable sentence ids. Do not return Markdown or analysis commentary.

Fixed five-section rules:
1. Appearance must describe only stable physical appearance: adult identity, ethnicity, skin, face, eyes, brows, nose, lips, makeup, hair, body type, and anatomical features. Do not include expression, gaze, pose, action, framing, background, clothing, accessories, or held objects.
2. Outfit must describe only clothing, accessories, wearable items, and held objects. Personal accessories and carried items such as bags, phones, sunglasses, eyeglasses, umbrellas, and wallets stay in Outfit even when temporarily set on a seat, table, floor, or beside the subject. Do not include pose, action, body placement, background, camera angle, gaze, or expression.
3. Background must describe only the environment: location, architecture, furniture, scenery, ambient objects, weather, and environmental lighting fixtures. Retail merchandise and shared scene props that do not belong to the subject stay in Background. Do not include the subject's personal accessories, appearance, outfit, pose, action, body placement, hand or leg position, gaze, expression, camera angle, or composition.
4. Expression / Pose must include pose, action, body placement, hand position, leg position, camera angle, composition, framing, crop, gaze direction, head angle, and facial expression. A personal item may be referenced only generically when required to describe an interaction; never describe its color, material, brand, size, or style here. Do not include stable appearance, clothing details, accessories as products, location, architecture, furniture, or background scenery.
5. Details must describe only technical and photographic qualities: image quality, lighting, camera style, realism, texture, color tone, grain, blur, sharpness, and requested exclusions.

Return this exact JSON shape:
{"titleSummary":"...","promptSections":{"appearance":[{"id":"appearance-1","en":"...","ko":"..."}],"outfit":[{"id":"outfit-1","en":"...","ko":"..."}],"background":[{"id":"background-1","en":"...","ko":"..."}],"expression_pose":[{"id":"expression_pose-1","en":"...","ko":"..."}],"details":[{"id":"details-1","en":"...","ko":"..."}]},"outfitTags":[],"backgroundTags":[],"generalTags":[],"detectedElements":[]}

Keep English and Korean aligned 1:1. Use concrete visible descriptions, avoid filler, and never repeat the same instruction across sections.

${sectionBoundaryRules}`;

  const sectionMeta = [
    { key: "appearance", labelKo: "외모", labelEn: "Appearance", colorKey: "appearance" },
    { key: "outfit", labelKo: "복장", labelEn: "Outfit", colorKey: "outfit" },
    { key: "background", labelKo: "배경", labelEn: "Background", colorKey: "background" },
    { key: "expression_pose", labelKo: "표정/자세", labelEn: "Expression / Pose", colorKey: "expression_pose" },
    { key: "details", labelKo: "디테일", labelEn: "Details", colorKey: "details" },
  ];

  const videoPromptApi = window.PromptArchiveVideoPromptResolver || {};
  const videoSectionMeta = Array.isArray(videoPromptApi.VIDEO_SECTION_META) && videoPromptApi.VIDEO_SECTION_META.length
    ? videoPromptApi.VIDEO_SECTION_META
    : [
      { key: "subject_definitions", labelKo: "피사체 정의", labelEn: "Subject Definitions", colorKey: "subject" },
      { key: "summary", labelKo: "요약", labelEn: "Summary", colorKey: "summary" },
      { key: "retention_analysis", labelKo: "유지 분석", labelEn: "Retention Analysis", colorKey: "retention" },
      { key: "detailed_description", labelKo: "상세 설명", labelEn: "Detailed Description", colorKey: "description" },
      { key: "overall_soundscape", labelKo: "전체 음향", labelEn: "Overall Soundscape", colorKey: "soundscape" },
      { key: "non_diegetic_music", labelKo: "비재현 음악", labelEn: "Non-diegetic Music", colorKey: "music" },
    ];

  const themes = [
    ["default-light", "Default Light"],
    ["dark-studio", "Dark Studio"],
    ["mint-gallery", "Mint Gallery"],
    ["peach-cream", "Peach Cream"],
    ["cyber-violet", "Cyber Violet"],
  ];

  const providerNames = ["OpenAI", "xAI Grok", "Google Gemini API", "Google Vertex AI", "Cerebras Cloud"];
  const vertexModelPresets = ["gemini-3.6-flash", "gemini-3.5-flash-lite"];

  const defaultExcludeOptions = [
    { key: "text_logo", label: "텍스트 / 글자 / 로고", defaultChecked: true, enabled: true },
    { key: "glasses", label: "안경", defaultChecked: false, enabled: true },
    { key: "tattoo", label: "문신", defaultChecked: false, enabled: true },
    { key: "ui", label: "UI / 화면 인터페이스", defaultChecked: true, enabled: true },
    { key: "background_people", label: "배경 인물", defaultChecked: false, enabled: true },
    { key: "held_object", label: "손에 든 물건", defaultChecked: false, enabled: true },
    { key: "accessory", label: "악세서리", defaultChecked: false, enabled: true },
    { key: "phone", label: "휴대폰", defaultChecked: false, enabled: true },
    { key: "face_mask", label: "마스크", defaultChecked: false, enabled: true },
    { key: "hat", label: "모자", defaultChecked: false, enabled: true },
  ];

  const defaultUploadSettings = {
    promptSourceMode: "ai",
    translateExifPrompt: true,
    preserveOriginal: false,
    autoCompress: true,
    stripExif: true,
    convertToWebp: true,
    generateThumbnail: true,
    allowClipboardPaste: true,
    allowDragDrop: true,
    detectDuplicates: true,
    autoAnalyzeAfterUpload: false,
    lastExcludeOptions: defaultExcludeOptions.filter((option) => option.defaultChecked).map((option) => option.key),
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
    loadMode: "infinite",
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
    "englishRules": "Write natural, visual, image-generation-ready English. Do not include analysis commentary. Follow the fixed 5-section structure strictly. Appearance must describe only stable physical appearance: face, skin, eyes, brows, nose, lips, makeup, hair, body type. Outfit must describe only clothing, accessories, wearable items, and held objects. Personal accessories and carried items such as bags, phones, sunglasses, eyeglasses, umbrellas, and wallets stay in Outfit even when temporarily set on a seat, table, floor, or beside the subject. Retail merchandise and shared scene props that do not belong to the subject stay in Background. Background must describe only the environment: location, architecture, furniture, scenery, ambient objects, and weather. Expression / Pose must include pose, action, body placement, hand position, leg position, camera angle, framing, crop, gaze direction, head angle, and expression; it may reference a personal item only generically for an interaction and must not describe its color, material, brand, size, or style. Details must describe only image quality, lighting, realism, camera style, color tone, texture, grain, blur, sharpness, and exclusions. Never place appearance, outfit details, pose, action, gaze, expression, camera angle, or composition in Background. Never place stable appearance, outfit details, location, architecture, furniture, or background scenery in Expression / Pose.",
    "koreanRules": "영어 문장과 같은 id 안에서 1:1로 대응되는 자연스러운 한국어 번역을 작성한다. 영어에 없는 내용을 한국어에 추가하지 않고, 한국어에서 의미를 생략하지 않는다. 자세, 시선, 복장, 배경, 제외 요소의 의미를 그대로 유지한다.",
    "tagRules": "outfitTags와 backgroundTags는 앱에서 활성화된 태그 목록 안에서만 선택한다. 조금이라도 시각적 근거가 있으면 가장 가까운 구체 태그를 고르고, 매칭이 완벽하지 않다는 이유만으로 기타를 쓰지 않는다. 기타는 어떤 활성 태그에도 의미 있게 연결할 근거가 거의 없을 때만 마지막 수단으로 사용한다. outfitTags는 의상 종류, 스타일, 착용 아이템 기준으로 분류한다. backgroundTags는 장소, 공간, 환경 기준으로 분류한다. generalTags는 영어 키워드로 작성하며 촬영 스타일, 구도, 조명, 품질, 분위기를 짧게 분류한다.",
    "excludeRules": "사용자가 제외하라고 한 요소는 이미지에 보여도 promptSections 안의 최종 프롬프트에는 절대 묘사하지 않는다. 하지만 이미지에서 실제로 보였고 제외한 요소는 detectedButExcludedElements 배열에 기록한다. 예: text, logo, watermark, web UI, download icon, arrow button, carousel dots, play button, mask, glasses, earphones, tattoo, bag, phone case graphic. 제외 요소가 없으면 빈 배열을 사용한다.",
    "outputJsonFormat": "Return strict JSON only. Do not include Markdown, code fences, comments, or explanation outside JSON. The JSON must contain only promptSections, outfitTags, backgroundTags, generalTags, and detectedButExcludedElements.",
    "sections": [
      {
        "key": "appearance",
        "labelKo": "외모",
        "labelEn": "Appearance",
        "enabled": true,
        "order": 1
      },
      {
        "key": "outfit",
        "labelKo": "복장",
        "labelEn": "Outfit",
        "enabled": true,
        "order": 2
      },
      {
        "key": "background",
        "labelKo": "배경",
        "labelEn": "Background",
        "enabled": true,
        "order": 3
      },
      {
        "key": "expression_pose",
        "labelKo": "표정/자세",
        "labelEn": "Expression_Pose",
        "enabled": true,
        "order": 4
      },
      {
        "key": "details",
        "labelKo": "디테일",
        "labelEn": "Details",
        "enabled": true,
        "order": 5
      }
    ]
  };

  const defaultCategorySettings = {
    allowAiSuggestedTags: false,
  };

  const defaultVideoSettings = {
    translateOnUpload: true,
    includeSectionTitles: true,
    promptViewMode: "split",
  };

  const defaultWildcardSettings = {
    appearancePath: "appearance.txt",
    defaultScenarioPath: "scenario.txt",
    rules: [{
      id: "nsfw",
      name: "NSFW",
      categoryNames: ["nsfw"],
      outputPath: "nsfw.txt",
      enabled: true,
    }],
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
    shortcuts: {
      nextItem: "",
      prevItem: "",
      copyFinal: "",
      goBack: "",
    },
  };

  const defaultOutfitTags = [
    { key: "school_uniform", name: "교복", keywords: ["school uniform", "uniform", "sailor uniform", "blazer uniform"] },
    { key: "suit", name: "정장", keywords: ["suit", "formal wear", "business suit"] },
    { key: "dress", name: "드레스", keywords: ["dress", "gown", "evening dress", "mini dress", "babydoll dress", "chiffon dress"] },
    { key: "casual", name: "캐주얼", keywords: ["casual", "daily outfit", "streetwear", "skirt", "mini skirt", "crop top", "knit", "blouse", "socks", "boots"] },
    { key: "hoodie", name: "후드티", keywords: ["hoodie", "hooded sweatshirt", "sweatshirt"] },
    { key: "coat", name: "코트", keywords: ["coat", "overcoat", "trench coat", "jacket"] },
    { key: "swimsuit", name: "수영복", keywords: ["swimsuit", "bikini", "one-piece swimsuit"] },
    { key: "hanbok", name: "한복", keywords: ["hanbok", "korean traditional dress"] },
    { key: "kimono", name: "기모노", keywords: ["kimono", "yukata"] },
    { key: "fantasy_outfit", name: "판타지 의상", keywords: ["fantasy outfit", "robe", "cloak"] },
    { key: "armor", name: "갑옷", keywords: ["armor", "armour", "battle armor"] },
    { key: "sportswear", name: "운동복", keywords: ["sportswear", "tracksuit", "gym clothes"] },
    { key: "other_outfit", name: "기타", keywords: ["other"] },
  ];

  const defaultBackgroundTags = [
    { key: "cafe", name: "카페", keywords: ["cafe", "coffee shop", "dessert", "drink", "iced drink", "table", "pastry", "bench"] },
    { key: "school", name: "학교", keywords: ["school", "classroom", "campus"] },
    { key: "street", name: "거리", keywords: ["street", "sidewalk", "road"] },
    { key: "room", name: "방", keywords: ["room", "bedroom", "interior", "indoor", "wall", "floor", "chair", "sofa"] },
    { key: "office", name: "사무실", keywords: ["office", "workspace"] },
    { key: "beach", name: "해변", keywords: ["beach", "shore", "seaside"] },
    { key: "forest", name: "숲", keywords: ["forest", "woods"] },
    { key: "city", name: "도시", keywords: ["city", "urban"] },
    { key: "night_street", name: "밤거리", keywords: ["night street", "neon street"] },
    { key: "studio", name: "스튜디오", keywords: ["studio", "photo studio", "plain wall", "minimalist", "backdrop"] },
    { key: "fantasy_background", name: "판타지 배경", keywords: ["fantasy background", "castle", "magic"] },
    { key: "future_city", name: "미래도시", keywords: ["future city", "cyberpunk city"] },
    { key: "battlefield", name: "전장", keywords: ["battlefield", "war zone"] },
    { key: "other_background", name: "기타", keywords: ["other"] },
  ];

  const sampleImageOne = "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#c7d2fe"/><stop offset="0.52" stop-color="#bae6fd"/><stop offset="1" stop-color="#fde68a"/></linearGradient></defs><rect width="800" height="600" fill="url(#g)"/><circle cx="405" cy="250" r="116" fill="#111827" opacity=".9"/><path d="M245 520c38-105 103-158 195-158s158 53 196 158" fill="#475569"/><path d="M250 164c104-81 235-78 324 8 58 56 83 132 69 209-96-78-233-93-341-38-67-57-84-127-52-179z" fill="#0f172a" opacity=".75"/><circle cx="361" cy="245" r="10" fill="#f8fafc"/><circle cx="450" cy="245" r="10" fill="#f8fafc"/></svg>`);
  const sampleImageTwo = "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#fce7f3"/><stop offset=".48" stop-color="#fef3c7"/><stop offset="1" stop-color="#d9f99d"/></linearGradient></defs><rect width="800" height="600" fill="url(#g)"/><rect x="150" y="120" width="500" height="360" rx="28" fill="#ffffff" opacity=".64"/><rect x="210" y="185" width="260" height="40" rx="8" fill="#334155"/><rect x="210" y="250" width="380" height="24" rx="6" fill="#64748b"/><rect x="210" y="292" width="330" height="24" rx="6" fill="#94a3b8"/><rect x="210" y="352" width="180" height="54" rx="10" fill="#2563eb"/></svg>`);

  const state = loadState();
  const uploadPreviewUrls = new WeakMap();
  const ui = {
    view: "gallery",
    archiveMode: loadArchiveMode(),
    selectedId: state.items[0]?.id || null,
    videoSelectedId: state.videoItems[0]?.id || null,
    query: "",
    pendingVideoFiles: [],
    selectedPendingVideoKeys: [],
    pendingVideoErrors: {},
    videoThumbnailSets: {},
    videoUploadProgress: null,
    videoUploadDraft: { title: "", categoryId: "" },
    videoCategory: "all",
    videoUploadQueue: [],
    category: "all",
    status: "all",
    sort: "latest",
    selectedSentenceId: null,
    editMode: false,
    modal: null,
    settingsTab: "api",
    activeProviderIndex: 0,
    pendingUploadFiles: [],
    selectedPendingUploadKeys: [],
    pendingUploadErrors: {},
    uploadProgress: null,
    uploadDraft: {
      title: "",
      categoryId: state.categories[0]?.id || "",
      customInstruction: "",
    },
    selectedFragmentId: null,
    filterGroup: "all",
    selectedOutfitTags: [],
    selectedBackgroundTags: [],
    page: 1,
    galleryLoadedPages: 1,
    galleryLoading: false,
    previousView: null,
    uploadQueue: [],
    bulkDeleteMode: false,
    selectedBulkDeleteIds: [],
    bulkCategoryMode: false,
    selectedBulkCategoryIds: [],
    promptCompareMode: false,
    reviseAlsoRetag: true,
    reviseAlsoRetitle: false,
    originFilter: "all",
    favoriteOnly: false,
    showDuplicatesOnly: false,
  };
  const promptViewerState = {
    fileName: "",
    previewUrl: "",
    loading: false,
    promptJson: null,
    rawText: "",
    source: "",
    error: "",
  };
  let promptViewerRequestId = 0;
  const videoPromptViewerState = {
    fileName: "",
    previewUrl: "",
    loading: false,
    promptJson: null,
    rawText: "",
    source: "",
    error: "",
  };
  let videoPromptViewerRequestId = 0;

  document.documentElement.dataset.theme = state.theme;
  applyThemeOptions();
  migrateAllPromptBaselines();
  bootServerState().then(() => {
    migrateAllPromptBaselines();
  });
  const loraSorterRestorePromise = restoreLoraSorterSettings();

  function loadState() {
    const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const restored = normalizeState(parsed);
        changedBeforeServerBoot = true;
        restoredFallbackAt = Number(parsed.__fallbackSavedAt || 0);
        return restored;
      } catch (error) {
        console.warn("State restore failed", error);
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(LEGACY_STORAGE_KEY);
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
      promptInstruction: activeDefaultInstruction,
      promptSettings: defaultPromptSettings,
      excludeOptions: defaultExcludeOptions,
      uploadSettings: defaultUploadSettings,
      albumSettings: defaultAlbumSettings,
      copyDisplaySettings: defaultCopyDisplaySettings,
      categorySettings: defaultCategorySettings,
      wildcardSettings: defaultWildcardSettings,
      themeSettings: defaultThemeSettings,
      advancedSettings: defaultAdvancedSettings,
      outfitTagOptions: defaultOutfitTags,
      backgroundTagOptions: defaultBackgroundTags,
      providers: providerNames.map((name, index) => defaultProvider(name, index)),
      items: seedItems(catPortrait, catProduct),
      videoCategories: defaultVideoCategories(),
      videoSettings: defaultVideoSettings,
    });
  }

  function normalizeState(input) {
    return {
      theme: input.theme || "default-light",
      categories: normalizeCategories(input.categories),
      promptInstruction: normalizePromptInstruction(input.promptInstruction),
      promptSettings: normalizePromptSettings(input.promptSettings),
      excludeOptions: normalizeExcludeOptions(input.excludeOptions),
      uploadSettings: normalizeUploadSettings(input.uploadSettings),
      albumSettings: normalizeAlbumSettings(input.albumSettings),
      copyDisplaySettings: normalizeCopyDisplaySettings(input.copyDisplaySettings || { defaultCopyMode: input.albumSettings?.defaultCopyMode }),
      categorySettings: { ...defaultCategorySettings, ...(input.categorySettings || {}) },
      wildcardSettings: normalizeWildcardSettings(input.wildcardSettings),
      themeSettings: { ...defaultThemeSettings, ...(input.themeSettings || {}), sectionColors: { ...defaultThemeSettings.sectionColors, ...(input.themeSettings?.sectionColors || {}) } },
      advancedSettings: normalizeAdvancedSettings(input.advancedSettings),
      outfitTagOptions: normalizeTagOptions(input.outfitTagOptions, defaultOutfitTags),
      backgroundTagOptions: normalizeTagOptions(input.backgroundTagOptions, defaultBackgroundTags),
      providers: normalizeProviders(input.providers),
      items: Array.isArray(input.items) ? input.items.map(normalizeItem) : [],
      videoItems: Array.isArray(input.videoItems) ? input.videoItems.map(normalizeVideoItem) : [],
      videoCategories: normalizeVideoCategories(input.videoCategories),
      videoSettings: normalizeVideoSettings(input.videoSettings),
    };
  }

  function defaultProvider(name, index) {
    const model = defaultProviderModel(name, index);
    return {
      name,
      enabled: index === 0,
      model,
      // Legacy model remains as a fallback for older saved state.
      visionModel: model,
      textModel: model,
      hasServerKey: false,
      keyCount: 0,
      currentKeyIndex: 0,
      apiUrl: defaultProviderApiUrl(name),
      location: name === "Google Vertex AI" ? "us-central1" : "",
      priority: index + 1,
      fallbackEnabled: index > 0,
      timeoutSeconds: 60,
      maxRetries: 2,
      useForImageAnalysis: index === 0,
      useForTranslation: index === 0,
      // Retired roles kept false for older saved state compatibility.
      useForPromptCleanup: false,
      useForTagging: false,
      lastTestStatus: "",
    };
  }

  function defaultProviderModel(name, index) {
    if (name === "Google Gemini API") return "gemini-2.5-flash";
    if (name === "Google Vertex AI") return "gemini-2.5-flash";
    if (name === "Cerebras Cloud") return "gemma-4-31b";
    return index === 0 ? "gpt-4.1" : "";
  }

  function normalizeGeminiModelName(_name, model) {
    return String(model || "").trim();
  }

  function normalizeVertexLocation(provider) {
    const location = String(provider.location || "").trim();
    const model = String(provider.model || provider.visionModel || provider.textModel || "").trim();
    if (provider.name === "Google Vertex AI" && model === "gemini-3.5-flash" && location === "us-central1") {
      return "global";
    }
    return location;
  }

  function defaultProviderApiUrl(name) {
    if (name === "Cerebras Cloud") return "https://api.cerebras.ai/v1/chat/completions";
    if (name === "xAI Grok") return "https://api.x.ai/v1/chat/completions";
    if (name === "OpenAI") return "https://api.openai.com/v1/chat/completions";
    return "";
  }

  function normalizeProviders(list) {
    const byName = new Map(Array.isArray(list) ? list.map((provider) => [provider.name === "Google Gemini" ? "Google Gemini API" : provider.name, provider]) : []);
    return providerNames.map((name, index) => {
      const savedProvider = byName.get(name) || {};
      const provider = { ...defaultProvider(name, index), ...savedProvider };
      provider.name = name;
      const fallbackModel = normalizeGeminiModelName(name, savedProvider.model || defaultProviderModel(name, index));
      if (provider.name === "Google Vertex AI") {
        const visionModel = normalizeGeminiModelName(name, savedProvider.visionModel || fallbackModel);
        const textModel = normalizeGeminiModelName(name, savedProvider.textModel || fallbackModel);
        provider.visionModel = visionModel;
        provider.textModel = textModel;
        provider.model = visionModel || textModel || fallbackModel;
      } else {
        const unifiedModel = normalizeGeminiModelName(
          name,
          provider.model || provider.visionModel || provider.textModel || defaultProviderModel(name, index)
        );
        provider.model = unifiedModel;
        provider.visionModel = unifiedModel;
        provider.textModel = unifiedModel;
      }
      provider.location = normalizeVertexLocation(provider);
      provider.lastTestStatus = repairText(provider.lastTestStatus, "");
      provider.useForImageAnalysis = Boolean(provider.useForImageAnalysis);
      provider.useForTranslation = Boolean(provider.useForTranslation);
      provider.priority = clampNumber(provider.priority, 1, 20, index + 1);
      provider.timeoutSeconds = clampNumber(provider.timeoutSeconds, 5, 300, 60);
      provider.maxRetries = clampNumber(provider.maxRetries, 0, 10, 2);
      // Retired roles: cleanup/tagging are no longer separate API duties.
      provider.useForPromptCleanup = false;
      provider.useForTagging = false;
      provider.enabled = providerIsActive(provider);
      delete provider._pendingKey;
      delete provider._pendingKeys;
      if (provider.name === "Google Vertex AI" && provider.lastTestStatus.includes("us-central1") && provider.lastTestStatus.includes("gemini-3.5-flash")) provider.lastTestStatus = "";
      if (provider.name === "Google Gemini API" && provider.lastTestStatus.includes("Vertex JSON")) provider.lastTestStatus = "";
      return provider;
    });
  }

  function normalizeExcludeOptions(options) {
    const source = Array.isArray(options) && options.length ? options : defaultExcludeOptions;
    const defaultsByKey = new Map(defaultExcludeOptions.map((option) => [option.key, option]));
    return source.map((option, index) => ({
      key: normalizeIdentifier(option.key, "exclude"),
      label: repairText(option.label, defaultsByKey.get(option.key)?.label || "새 제외 요소"),
      defaultChecked: Boolean(option.defaultChecked),
      enabled: option.enabled !== false,
      order: Number.isFinite(Number(option.order)) ? Number(option.order) : index + 1,
    })).sort((a, b) => a.order - b.order);
  }

  function normalizeTagOptions(options, defaults) {
    const source = Array.isArray(options) && options.length ? options : defaults;
    const defaultsByKey = new Map(defaults.map((tag) => [tag.key, tag]));
    return source.map((tag, index) => ({
      key: normalizeIdentifier(tag.key, "tag"),
      name: repairText(tag.name, defaultsByKey.get(tag.key)?.name || "기타"),
      keywords: Array.isArray(tag.keywords) ? tag.keywords : [],
      enabled: tag.enabled !== false,
      allowAiAssign: tag.allowAiAssign !== false,
      order: Number.isFinite(Number(tag.order)) ? Number(tag.order) : index + 1,
    })).sort((a, b) => a.order - b.order);
  }

  function normalizeUploadSettings(settings = {}) {
    const promptSourceMode = settings.promptSourceMode === "exif" ? "exif" : "ai";
    return {
      ...defaultUploadSettings,
      ...settings,
      promptSourceMode,
      translateExifPrompt: settings.translateExifPrompt !== false,
      displayMaxSize: clampNumber(settings.displayMaxSize, 512, 4096, defaultUploadSettings.displayMaxSize),
      analysisMaxSize: clampNumber(settings.analysisMaxSize, 512, 4096, defaultUploadSettings.analysisMaxSize),
      thumbnailSize: clampNumber(settings.thumbnailSize, 120, 1024, defaultUploadSettings.thumbnailSize),
      imageQuality: clampNumber(settings.imageQuality, 40, 95, defaultUploadSettings.imageQuality),
      maxFileSizeMb: clampNumber(settings.maxFileSizeMb, 10, 250, defaultUploadSettings.maxFileSizeMb),
      concurrentUploadCount: clampNumber(settings.concurrentUploadCount, 1, 8, defaultUploadSettings.concurrentUploadCount),
      concurrentAnalysisCount: clampNumber(settings.concurrentAnalysisCount, 1, 8, defaultUploadSettings.concurrentAnalysisCount),
      lastExcludeOptions: Array.isArray(settings.lastExcludeOptions) ? settings.lastExcludeOptions.map(String) : defaultUploadSettings.lastExcludeOptions,
    };
  }

  function normalizeAlbumSettings(settings = {}) {
    return {
      ...defaultAlbumSettings,
      ...settings,
      columns: clampNumber(settings.columns, 2, 8, defaultAlbumSettings.columns),
      rows: clampNumber(settings.rows, 2, 8, defaultAlbumSettings.rows),
      loadMode: ["infinite", "pages"].includes(settings.loadMode) ? settings.loadMode : defaultAlbumSettings.loadMode,
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
      englishRules: repairText(settings.englishRules, defaultPromptSettings.englishRules),
      koreanRules: repairText(settings.koreanRules, defaultPromptSettings.koreanRules),
      tagRules: repairText(settings.tagRules, defaultPromptSettings.tagRules),
      excludeRules: repairText(settings.excludeRules, defaultPromptSettings.excludeRules),
      sections: Array.isArray(settings.sections) && settings.sections.length ? settings.sections.map((section, index) => ({
        key: normalizeIdentifier(section.key || sectionMeta[index]?.key, "section"),
        labelKo: repairText(section.labelKo, sectionMeta.find((item) => item.key === section.key)?.labelKo || sectionMeta[index]?.labelKo || "섹션"),
        labelEn: section.labelEn || sectionMeta[index]?.labelEn || "Section",
        enabled: section.enabled !== false,
        order: Number.isFinite(Number(section.order)) ? Number(section.order) : index + 1,
      })).sort((a, b) => a.order - b.order) : defaultPromptSettings.sections,
    };
  }

  function normalizeAdvancedSettings(settings = {}) {
    const shortcuts = settings.shortcuts && typeof settings.shortcuts === "object" ? settings.shortcuts : {};
    return {
      ...defaultAdvancedSettings,
      ...settings,
      dailyMaxAnalyses: clampNumber(settings.dailyMaxAnalyses, 1, 10000, defaultAdvancedSettings.dailyMaxAnalyses),
      monthlyMaxAnalyses: clampNumber(settings.monthlyMaxAnalyses, 1, 200000, defaultAdvancedSettings.monthlyMaxAnalyses),
      maxImagesPerBatch: clampNumber(settings.maxImagesPerBatch, 1, 200, defaultAdvancedSettings.maxImagesPerBatch),
      maxRegenerationsPerImage: clampNumber(settings.maxRegenerationsPerImage, 1, 200, defaultAdvancedSettings.maxRegenerationsPerImage),
      logs: Array.isArray(settings.logs) ? settings.logs : [],
      shortcuts: {
        nextItem: normalizeShortcutValue(shortcuts.nextItem, defaultAdvancedSettings.shortcuts.nextItem),
        prevItem: normalizeShortcutValue(shortcuts.prevItem, defaultAdvancedSettings.shortcuts.prevItem),
        copyFinal: normalizeShortcutValue(shortcuts.copyFinal, defaultAdvancedSettings.shortcuts.copyFinal),
        goBack: normalizeShortcutValue(shortcuts.goBack, defaultAdvancedSettings.shortcuts.goBack),
      },
    };
  }

  function normalizeShortcutValue(value, fallback = "") {
    if (value == null) return fallback;
    return String(value).trim();
  }

  function clampNumber(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, Math.round(number)));
  }

  function normalizeIdentifier(value, prefix) {
    const text = String(value || "").trim();
    return /^[a-zA-Z0-9_-]{1,128}$/.test(text) ? text : uid(prefix);
  }

  function normalizeReferenceIdentifier(value) {
    const text = String(value || "").trim();
    return /^[a-zA-Z0-9_-]{1,128}$/.test(text) ? text : "";
  }

  function safeImageSource(value) {
    const source = String(value || "").trim();
    if (/^\/uploads\/[a-zA-Z0-9._-]+$/.test(source)) return source;
    if (/^blob:/i.test(source)) return source;
    if (/^data:image\/(?:png|jpe?g|webp|gif|svg\+xml)(?:;charset=[^;,]+)?(?:;base64)?,/i.test(source)) return source;
    return "";
  }

  function normalizeImageAsset(asset) {
    if (!asset || typeof asset !== "object") return null;
    return { ...asset, dataUrl: safeImageSource(asset.dataUrl) };
  }

  function normalizeVideoItem(item) {
    return {
      ...item,
      id: normalizeIdentifier(item?.id, "vid"),
      imageUrl: safeImageSource(item?.imageUrl),
      thumbnailUrl: safeImageSource(item?.thumbnailUrl),
      promptJson: ensureVideoPromptJson(item?.promptJson),
      displayImage: normalizeImageAsset(item.displayImage),
      thumbnailImage: normalizeImageAsset(item.thumbnailImage),
      uploadMeta: item.uploadMeta || null,
      title: item.title || "",
      memo: item.memo || "",
      categoryId: normalizeReferenceIdentifier(item?.categoryId),
      durationSeconds: Number(item?.durationSeconds || item?.uploadMeta?.duration || 0) || 0,
      width: Number(item?.width || item?.uploadMeta?.width || item?.displayImage?.width || item?.thumbnailImage?.width || 0) || 0,
      height: Number(item?.height || item?.uploadMeta?.height || item?.displayImage?.height || item?.thumbnailImage?.height || 0) || 0,
      status: item.status || "analyzed",
      createdAt: item.createdAt || Date.now(),
      updatedAt: item.updatedAt || Date.now(),
      versions: Array.isArray(item.versions) ? item.versions : [],
    };
  }

  function normalizeItem(item) {
    return {
      ...item,
      id: normalizeIdentifier(item?.id, "img"),
      categoryId: normalizeReferenceIdentifier(item?.categoryId),
      imageUrl: safeImageSource(item?.imageUrl),
      thumbnailUrl: safeImageSource(item?.thumbnailUrl),
      promptJson: item?.promptJson ? normalizeAnalysisPrompt(item.promptJson) : null,
      customInstruction: item.customInstruction || "",
      excludeOptions: Array.isArray(item.excludeOptions) ? item.excludeOptions : defaultExcludedKeys(),
      includeOptions: Array.isArray(item.includeOptions) ? item.includeOptions : [],
      analysisRequest: item.analysisRequest || "",
      displayImage: normalizeImageAsset(item.displayImage),
      thumbnailImage: normalizeImageAsset(item.thumbnailImage),
      analysisImage: normalizeImageAsset(item.analysisImage),
      originalImage: normalizeImageAsset(item.originalImage),
      uploadMeta: item.uploadMeta || null,
      titleSummary: item.titleSummary || "",
      outfitTags: Array.isArray(item.outfitTags) ? item.outfitTags : [],
      backgroundTags: Array.isArray(item.backgroundTags) ? item.backgroundTags : [],
      tags: Array.isArray(item.tags) ? item.tags : [],
      createdAt: item.createdAt || Date.now(),
      updatedAt: item.updatedAt || Date.now(),
      versions: Array.isArray(item.versions) ? item.versions : [],
      promptBaselineSource: item.promptBaselineSource || "",
      promptBaselineFingerprint: item.promptBaselineFingerprint || "",
      promptBaselineJson: item.promptBaselineJson || null,
      promptEditAction: item.promptEditAction || "",
      promptEditState: item.promptEditState || "",
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
        excludeOptions: ["text_logo"],
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
        excludeOptions: ["text_logo", "ui"],
        createdAt: Date.now() - 43200000,
        updatedAt: Date.now() - 43200000,
        versions: [],
      },
    ];
  }

  function persistenceLabel(status = persistenceStatus) {
    const labels = {
      connecting: "연결 확인 중",
      saving: "저장 중",
      server: "서버 저장",
      fallback: "브라우저 임시 저장",
      error: "저장 실패",
    };
    return labels[status] || labels.connecting;
  }

  function setPersistenceStatus(status, message = "") {
    persistenceStatus = status;
    persistenceMessage = message || persistenceLabel(status);
    const node = document.querySelector("[data-persistence-status]");
    if (!node) return;
    node.dataset.status = status;
    node.className = `persistence-status persistence-${status}`;
    node.disabled = !["fallback", "error"].includes(status);
    node.setAttribute("aria-label", `${persistenceLabel(status)}. ${persistenceMessage}${node.disabled ? "" : ". 눌러서 서버 연결 재시도"}`);
    node.setAttribute("data-tooltip", persistenceMessage);
    const label = node.querySelector("[data-persistence-label]");
    if (label) label.textContent = persistenceLabel(status);
  }

  function markSaving() {
    setPersistenceStatus("saving", "변경 사항을 서버에 저장하는 중입니다.");
  }

  function markServerSaved() {
    fallbackNoticeShown = false;
    setPersistenceStatus("server", "변경 사항이 서버 파일에 저장되었습니다.");
  }

  function persistBrowserFallback(error) {
    serverAvailable = false;
    try {
      restoredFallbackAt = Date.now();
      changedBeforeServerBoot = true;
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...serializableState(), __fallbackSavedAt: restoredFallbackAt }));
      setPersistenceStatus("fallback", "서버 연결이 끊겨 이 브라우저에 임시 저장했습니다. 눌러서 다시 연결할 수 있습니다.");
      if (!fallbackNoticeShown) {
        fallbackNoticeShown = true;
        showToast("서버 연결이 끊겨 브라우저에 임시 저장했습니다. 상단 저장 상태에서 다시 연결할 수 있습니다.", "warning", 3600);
      }
      return true;
    } catch (storageError) {
      console.error("Browser fallback save failed", storageError, error);
      setPersistenceStatus("error", "서버와 브라우저 임시 저장이 모두 실패했습니다. 페이지를 닫지 말고 서버를 확인하세요.");
      showToast("저장에 실패했습니다. 페이지를 닫지 말고 서버 연결과 브라우저 저장 공간을 확인하세요.", "warning", 4800);
      return false;
    }
  }

  async function retryServerConnection() {
    setPersistenceStatus("connecting", "서버에 다시 연결하는 중입니다.");
    try {
      const response = await fetch(SERVER_STATE_ENDPOINT, { cache: "no-store" });
      if (!response.ok) throw new Error("Server reconnect failed");
      serverAvailable = true;
      const payload = await response.json();
      if (initialLoadBlocked) {
        initialLoadBlocked = false;
        serverBootComplete = true;
        if (payload?.state) applyServerPayload(payload);
        else if (!await syncStateToServer()) {
          render();
          return;
        }
        markServerSaved();
        render();
        showToast("서버 연결을 복구하고 데이터를 불러왔습니다.", "success");
        return;
      }
      if (payload?.state && changedBeforeServerBoot) {
        const serverUpdatedAt = Number(payload.updatedAt || 0);
        const localIsNewer = restoredFallbackAt > serverUpdatedAt;
        if (!localIsNewer) {
          const keepLocal = restoredFallbackAt > 0 && confirm("서버 데이터가 브라우저 임시본보다 새롭습니다.\n\n확인: 브라우저 임시본으로 서버를 덮어쓰기\n취소: 최신 서버 데이터 불러오기");
          if (!keepLocal) {
            applyServerPayload(payload);
            markServerSaved();
            render();
            showToast("더 최신인 서버 데이터를 불러왔습니다.", "success");
            return;
          }
        }
      }
      const saved = await syncStateToServer();
      if (!saved) return;
      showToast("서버 연결과 저장을 복구했습니다.", "success");
    } catch (error) {
      persistBrowserFallback(error);
    }
  }

  function saveState() {
    if (!serverBootComplete) changedBeforeServerBoot = true;
    if (!serverAvailable) {
      persistBrowserFallback();
      return false;
    }
    markSaving();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(syncStateToServer, 180);
  }

  async function bootServerState() {
    try {
      const response = await fetch(SERVER_STATE_ENDPOINT, { cache: "no-store" });
      if (!response.ok) throw new Error("Server boot failed");
      serverAvailable = true;
      const payload = await response.json();
      const serverUpdatedAt = Number(payload.updatedAt || 0);
      const localFallbackIsNewer = changedBeforeServerBoot && restoredFallbackAt > serverUpdatedAt;
      if (payload?.state && !localFallbackIsNewer) {
        applyServerPayload(payload);
      } else {
        const saved = await syncStateToServer();
        if (!saved) {
          serverBootComplete = true;
          render();
          return;
        }
      }
      serverBootComplete = true;
      markServerSaved();
      render();
    } catch (error) {
      serverBootComplete = true;
      serverAvailable = false;
      if (changedBeforeServerBoot) {
        setPersistenceStatus("fallback", "서버에 연결할 수 없어 기존 브라우저 임시본을 열었습니다.");
        render();
      } else {
        initialLoadBlocked = true;
        setPersistenceStatus("error", "서버 데이터를 불러오지 못했습니다. 연결을 복구하기 전에는 편집을 시작하지 않습니다.");
        render();
      }
    }
  }

  function applyServerPayload(payload) {
    Object.assign(state, normalizeState(payload.state));
    changedBeforeServerBoot = false;
    restoredFallbackAt = 0;
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  }

  function defaultVideoCategories() {
    return [{ id: uid("vcat"), name: "일반", color: "slate" }];
  }

  function normalizeVideoCategories(categories) {
    const defaults = [{ name: "일반", color: "slate" }];
    const source = Array.isArray(categories) && categories.length
      ? categories
      : defaults.map((category) => ({ id: uid("vcat"), ...category }));
    return source.map((category, index) => ({
      ...category,
      id: normalizeIdentifier(category.id, "vcat"),
      name: repairText(category.name, defaults[index]?.name || "미분류"),
      color: category.color || defaults[index]?.color || "slate",
    }));
  }

  function normalizeVideoSettings(settings = {}) {
    const promptViewMode = ["split", "en", "ko"].includes(settings.promptViewMode)
      ? settings.promptViewMode
      : defaultVideoSettings.promptViewMode;
    return {
      translateOnUpload: settings.translateOnUpload !== false,
      includeSectionTitles: settings.includeSectionTitles !== false,
      promptViewMode,
    };
  }

  function normalizeCategories(categories) {
    const defaults = [
      { name: "인물", color: "blue" },
      { name: "제품", color: "amber" },
    ];
    const source = Array.isArray(categories) && categories.length ? categories : defaults.map((category) => ({ id: uid("cat"), ...category }));
    return source.map((category, index) => ({
      ...category,
      id: normalizeIdentifier(category.id, "cat"),
      name: repairText(category.name, defaults[index]?.name || "미분류"),
      color: category.color || defaults[index]?.color || "blue",
    }));
  }

  function validateWildcardRelativePath(value, fieldName) {
    const normalized = String(value || "").trim().replace(/\\/g, "/");
    const segments = normalized.split("/");
    const reservedName = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
    const invalidSegment = segments.some((segment) => (
      !segment
      || segment === "."
      || segment === ".."
      || /[<>:"|?*\u0000-\u001f]/.test(segment)
      || /[ .]$/.test(segment)
      || reservedName.test(segment)
    ));
    if (!normalized || normalized.startsWith("/") || /^[a-z]:/i.test(normalized) || invalidSegment) {
      throw new Error(`${fieldName}은(는) 와일드카드 폴더 안의 안전한 상대 경로여야 합니다.`);
    }
    if (!/\.txt$/i.test(normalized)) {
      throw new Error(`${fieldName}은(는) .txt 파일이어야 합니다.`);
    }
    return segments.join("/");
  }

  function validateWildcardSettings(settings) {
    const source = settings && typeof settings === "object"
      ? settings
      : defaultWildcardSettings;
    const appearancePath = validateWildcardRelativePath(
      source.appearancePath || defaultWildcardSettings.appearancePath,
      "외모 저장 경로",
    );
    const defaultScenarioPath = validateWildcardRelativePath(
      source.defaultScenarioPath || defaultWildcardSettings.defaultScenarioPath,
      "기본 시나리오 저장 경로",
    );
    const rawRules = Array.isArray(source.rules)
      ? source.rules
      : defaultWildcardSettings.rules;
    const usedIds = new Set();
    const rules = rawRules.map((rule, index) => {
      const rawCategoryNames = Array.isArray(rule?.categoryNames)
        ? rule.categoryNames
        : String(rule?.categoryName || "").split(",");
      const categoryNames = [...new Set(rawCategoryNames
        .map((categoryName) => String(categoryName || "").trim())
        .filter(Boolean))];
      if (!categoryNames.length) {
        throw new Error(`와일드카드 분류 규칙 ${index + 1}에 카테고리 조건이 필요합니다.`);
      }
      const idBase = String(rule?.id || `wildcard-rule-${index + 1}`).trim()
        || `wildcard-rule-${index + 1}`;
      let id = idBase;
      let idSuffix = 2;
      while (usedIds.has(id)) {
        id = `${idBase}-${idSuffix}`;
        idSuffix += 1;
      }
      usedIds.add(id);
      return {
        id,
        name: String(rule?.name || "").trim() || `분류 ${index + 1}`,
        categoryNames,
        outputPath: validateWildcardRelativePath(
          rule?.outputPath,
          `와일드카드 분류 규칙 ${index + 1} 저장 경로`,
        ),
        enabled: rule?.enabled !== false,
      };
    });
    const outputPaths = [
      appearancePath,
      defaultScenarioPath,
      ...rules.map((rule) => rule.outputPath),
    ].map((relativePath) => relativePath.toLowerCase());
    if (new Set(outputPaths).size !== outputPaths.length) {
      throw new Error("와일드카드 출력 저장 경로는 서로 중복될 수 없습니다.");
    }
    return { appearancePath, defaultScenarioPath, rules };
  }

  function normalizeWildcardSettings(settings) {
    try {
      return validateWildcardSettings(settings);
    } catch (error) {
      console.warn("Wildcard settings restore failed", error);
      return validateWildcardSettings(defaultWildcardSettings);
    }
  }

  function repairText(value, fallback) {
    if (typeof value !== "string" || !value.trim() || looksBrokenKorean(value)) return fallback;
    return value;
  }

  function normalizePromptInstruction(value) {
    const instruction = repairText(value, activeDefaultInstruction);
    if (instruction.includes("Section boundary rules:")) return instruction;
    return `${instruction.trim()}\n\n${sectionBoundaryRules}`;
  }

  function looksBrokenKorean(value) {
    const text = String(value || "").trim();
    return (/^\?+$/.test(text) || text.includes("??")) && !/[가-힣]/.test(text);
  }

  async function syncStateToServer() {
    try {
      const response = await fetch(SERVER_STATE_ENDPOINT, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: serializableState() }),
      });
      if (!response.ok) throw new Error("Server state save failed");
      await response.json();
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      changedBeforeServerBoot = false;
      restoredFallbackAt = 0;
      markServerSaved();
      return true;
    } catch (error) {
      persistBrowserFallback(error);
      return false;
    }
  }

  function settingsSlice() {
    return {
      theme: state.theme,
      categories: state.categories,
      promptInstruction: state.promptInstruction,
      promptSettings: state.promptSettings,
      uploadSettings: state.uploadSettings,
      albumSettings: state.albumSettings,
      copyDisplaySettings: state.copyDisplaySettings,
      categorySettings: state.categorySettings,
      wildcardSettings: state.wildcardSettings,
      themeSettings: state.themeSettings,
      advancedSettings: state.advancedSettings,
      videoCategories: state.videoCategories,
      videoSettings: state.videoSettings,
    };
  }

  function tagsSlice() {
    return {
      excludeOptions: state.excludeOptions,
      outfitTagOptions: state.outfitTagOptions,
      backgroundTagOptions: state.backgroundTagOptions,
    };
  }

  function saveSettingsState() {
    if (!serverBootComplete) changedBeforeServerBoot = true;
    if (!serverAvailable) {
      persistBrowserFallback();
      return false;
    }
    markSaving();
    clearTimeout(settingsSaveTimer);
    settingsSaveTimer = setTimeout(syncSettingsToServer, 180);
  }

  async function syncSettingsToServer() {
    try {
      const response = await fetch(SERVER_SETTINGS_ENDPOINT, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: settingsSlice() }),
      });
      if (!response.ok) throw new Error("Settings save failed");
      await response.json();
      return await syncStateToServer();
    } catch (error) {
      persistBrowserFallback(error);
      return false;
    }
  }

  function saveProvidersState() {
    if (!serverBootComplete) changedBeforeServerBoot = true;
    state.providers.forEach((provider) => {
      provider.enabled = providerIsActive(provider);
    });
    if (!serverAvailable) {
      clearPendingProviderDrafts();
      persistBrowserFallback();
      showToast("API 비밀키는 브라우저에 저장하지 않습니다. 서버 연결 후 다시 입력해 주세요.", "warning", 4200);
      return;
    }
    markSaving();
    clearTimeout(providerSaveTimer);
    providerSaveTimer = setTimeout(syncProvidersToServer, 180);
  }

  async function syncProvidersToServer() {
    clearTimeout(providerSaveTimer);
    try {
      const response = await fetch(SERVER_PROVIDERS_ENDPOINT, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providers: state.providers }),
      });
      if (!response.ok) throw new Error("Provider save failed");
      const payload = await response.json();
      const serverProviders = new Map((payload.providers || []).map((provider) => [provider.name, provider]));
      state.providers.forEach((provider) => {
        const saved = serverProviders.get(provider.name);
        if (saved) {
          provider.hasServerKey = Boolean(saved.hasServerKey);
          provider.keyCount = Number(saved.keyCount || 0);
          provider.currentKeyIndex = Number(saved.currentKeyIndex || 0);
        }
        delete provider._pendingKey;
        delete provider._pendingKeys;
      });
      return await syncStateToServer();
    } catch (error) {
      clearPendingProviderDrafts();
      persistBrowserFallback(error);
      showToast("API 비밀키는 브라우저에 저장하지 않았습니다. 서버 연결 후 다시 입력해 주세요.", "warning", 4200);
      return false;
    }
  }

  function saveTagsState() {
    if (!serverBootComplete) changedBeforeServerBoot = true;
    if (!serverAvailable) {
      persistBrowserFallback();
      return;
    }
    markSaving();
    clearTimeout(tagsSaveTimer);
    tagsSaveTimer = setTimeout(syncTagsToServer, 180);
  }

  async function syncTagsToServer() {
    try {
      const response = await fetch(SERVER_TAGS_ENDPOINT, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: tagsSlice() }),
      });
      if (!response.ok) throw new Error("Tags save failed");
      await response.json();
      return await syncStateToServer();
    } catch (error) {
      persistBrowserFallback(error);
      return false;
    }
  }

  function saveItemsState() {
    if (!serverBootComplete) changedBeforeServerBoot = true;
    if (!serverAvailable) {
      persistBrowserFallback();
      return;
    }
    markSaving();
    clearTimeout(itemsSaveTimer);
    itemsSaveTimer = setTimeout(syncItemsToServer, 180);
  }

  async function syncItemsToServer() {
    try {
      const response = await fetch(SERVER_ITEMS_ENDPOINT, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: state.items }),
      });
      if (!response.ok) throw new Error("Items save failed");
      await response.json();
      return await syncStateToServer();
    } catch (error) {
      persistBrowserFallback(error);
      return false;
    }
  }

  async function saveItemState(item) {
    if (!item) return false;
    if (!serverBootComplete) changedBeforeServerBoot = true;
    if (!serverAvailable) {
      persistBrowserFallback();
      return false;
    }
    markSaving();
    try {
      const response = await fetch(`${SERVER_ITEMS_ENDPOINT}/${encodeURIComponent(item.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item }),
      });
      if (!response.ok) throw new Error("Item save failed");
      await response.json();
      return await syncStateToServer();
    } catch (error) {
      persistBrowserFallback(error);
      return false;
    }
  }

  function saveVideoItemsState() {
    if (!serverBootComplete) changedBeforeServerBoot = true;
    if (!serverAvailable) {
      persistBrowserFallback();
      return;
    }
    markSaving();
    clearTimeout(videoItemsSaveTimer);
    videoItemsSaveTimer = setTimeout(syncVideoItemsToServer, 180);
  }

  async function syncVideoItemsToServer() {
    try {
      const response = await fetch(SERVER_VIDEO_ITEMS_ENDPOINT, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoItems: state.videoItems }),
      });
      if (!response.ok) throw new Error("Video items save failed");
      await response.json();
      return await syncStateToServer();
    } catch (error) {
      persistBrowserFallback(error);
      return false;
    }
  }

  async function saveVideoItemState(item) {
    if (!item) return false;
    if (!serverBootComplete) changedBeforeServerBoot = true;
    if (!serverAvailable) {
      persistBrowserFallback();
      return false;
    }
    markSaving();
    try {
      const response = await fetch(`${SERVER_VIDEO_ITEMS_ENDPOINT}/${encodeURIComponent(item.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item }),
      });
      if (!response.ok) throw new Error("Video item save failed");
      await response.json();
      return await syncStateToServer();
    } catch (error) {
      persistBrowserFallback(error);
      return false;
    }
  }

  async function deleteVideoItemState(id) {
    if (!serverBootComplete) changedBeforeServerBoot = true;
    if (!serverAvailable) {
      persistBrowserFallback();
      return false;
    }
    markSaving();
    try {
      const response = await fetch(`${SERVER_VIDEO_ITEMS_ENDPOINT}/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Video item delete failed");
      await response.json();
      return await syncStateToServer();
    } catch (error) {
      persistBrowserFallback(error);
      return false;
    }
  }

  async function deleteItemState(id) {
    if (!serverBootComplete) changedBeforeServerBoot = true;
    if (!serverAvailable) {
      persistBrowserFallback();
      return false;
    }
    markSaving();
    try {
      const response = await fetch(`${SERVER_ITEMS_ENDPOINT}/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Item delete failed");
      await response.json();
      return await syncStateToServer();
    } catch (error) {
      persistBrowserFallback(error);
      return false;
    }
  }

  function sanitizedProviders() {
    return state.providers.map((provider) => {
      const { _pendingKey, _pendingKeys, ...publicProvider } = provider;
      return publicProvider;
    });
  }

  function clearPendingProviderDrafts() {
    state.providers.forEach((provider) => {
      delete provider._pendingKey;
      delete provider._pendingKeys;
    });
  }

  function serializableState() {
    return { ...state, providers: sanitizedProviders() };
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
      .replace(/'/g, "&#39;");
  }

  function app() {
    return document.getElementById("app");
  }

  function render() {
    document.documentElement.dataset.theme = state.theme;
    applyThemeOptions();
    if (!serverBootComplete || initialLoadBlocked) {
      renderConnectionGate();
      return;
    }
    app().innerHTML = `
      <div class="workspace album-workspace">
        <main class="main">
          ${renderTopbar()}
          <section class="content">${renderView()}</section>
        </main>
        ${renderModal()}
        ${isVideoArchiveMode() ? "" : renderConverterMiniProgress()}
        ${isVideoArchiveMode() ? "" : renderLoraSorterMiniProgress()}
      </div>
    `;
    bindCommonEvents();
    bindViewEvents();
    applyPostRenderFocus();
  }

  function renderConnectionGate() {
    const blocked = initialLoadBlocked;
    app().innerHTML = `
      <main class="connection-gate" aria-live="polite">
        <section class="panel connection-card">
          <span class="brand-mark connection-mark" aria-hidden="true">${brandMarkSvg()}</span>
          <div class="connection-spinner" aria-hidden="true"></div>
          <h1>${blocked ? "서버 연결이 필요합니다" : "아카이브를 안전하게 불러오는 중입니다"}</h1>
          <p>${blocked ? "기존 데이터를 보호하기 위해 연결이 복구될 때까지 편집을 잠시 멈췄습니다." : "서버와 브라우저 임시본의 수정 시각을 확인하고 있습니다."}</p>
          ${blocked ? '<button class="primary-btn" data-retry-initial-load type="button">다시 연결</button>' : ""}
        </section>
      </main>
    `;
    document.querySelector("[data-retry-initial-load]")?.addEventListener("click", retryServerConnection);
  }

  function loadArchiveMode() {
    try {
      return localStorage.getItem(ARCHIVE_MODE_KEY) === "video" ? "video" : "image";
    } catch (_error) {
      return "image";
    }
  }

  function persistArchiveMode(mode) {
    try {
      localStorage.setItem(ARCHIVE_MODE_KEY, mode === "video" ? "video" : "image");
    } catch (_error) {
      // Ignore quota / private-mode failures.
    }
  }

  function isVideoArchiveMode() {
    return ui.archiveMode === "video";
  }

  function renderArchiveModeSwitch() {
    const imageActive = !isVideoArchiveMode();
    return `
      <div class="archive-mode-switch" role="tablist" aria-label="아카이브 모드">
        <button class="archive-mode-btn ${imageActive ? "active" : ""}" data-action="setArchiveMode" data-mode="image" type="button" role="tab" aria-selected="${imageActive}">이미지</button>
        <button class="archive-mode-btn ${imageActive ? "" : "active"}" data-action="setArchiveMode" data-mode="video" type="button" role="tab" aria-selected="${!imageActive}">비디오</button>
      </div>
    `;
  }

  function renderTopbar() {
    const searchLabel = isVideoArchiveMode() ? "제목, 프롬프트 검색" : "제목, 태그, 프롬프트 검색";
    return `
      <header class="topbar album-topbar" aria-label="앱 도구 모음">
        <div class="topbar-left">
          <button class="brand-inline" data-view="gallery" type="button" aria-label="갤러리로 이동">
            <span class="brand-mark" aria-hidden="true">${brandMarkSvg()}</span>
            <span class="brand-copy">
              <strong>프롬프트 아카이브</strong>
              <small>${isVideoArchiveMode() ? "비디오와 프롬프트" : "이미지와 프롬프트"}</small>
            </span>
          </button>
          ${renderArchiveModeSwitch()}
        </div>
        <div class="topbar-center">
          <div class="topbar-center-cluster" role="search" aria-label="아카이브 검색">
            <div class="search-wrap compact-search">
              <span class="search-icon" aria-hidden="true">${navIcon("search")}</span>
              <label class="sr-only" for="globalSearch">${searchLabel}</label>
              <input class="input search-input" id="globalSearch" type="search" value="${escapeHtml(ui.query)}" placeholder="${searchLabel}" autocomplete="off">
              <button class="search-clear-btn" data-action="clearSearch" type="button" aria-label="검색어 지우기" ${ui.query ? "" : "hidden disabled"}>×</button>
            </div>
          </div>
        </div>
        <div class="topbar-actions">
          ${iconButton("upload", isVideoArchiveMode() ? "비디오 업로드" : "업로드", "upload", "primary-icon")}
          ${iconButton("cycleTheme", "테마", "theme")}
          ${isVideoArchiveMode() ? "" : `
          <button class="converter-launch-btn" data-action="converter" type="button" aria-label="PNG를 WebP로 변환">
            <span aria-hidden="true">${navIcon("convert")}</span>
            <span>변환</span>
          </button>
          <button class="converter-launch-btn lora-sorter-launch-btn" data-action="loraSorter" type="button" aria-label="활성 LoRA별 사진 분류">
            <span aria-hidden="true">${navIcon("layers")}</span>
            <span>사진 분류</span>
          </button>
          ${iconButton("promptViewer", "이미지 프롬프트 확인", "photo")}
          `}
          ${isVideoArchiveMode() ? iconButton("videoPromptViewer", "비디오 프롬프트 확인", "film") : ""}
          ${iconButton("settings", "설정", "settings")}
        </div>
      </header>
    `;
  }

  function brandMarkSvg() {
    return `<svg viewBox="0 0 32 32" width="28" height="28" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="2" width="28" height="28" rx="9" fill="url(#brandGrad)"/><path d="M9 11.5h6.2v9H9V11.5zm8.3 0H23v4.1h-5.7V11.5zm0 6.2H23V20.5h-5.7v-2.8z" fill="#fff" fill-opacity=".95"/><defs><linearGradient id="brandGrad" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse"><stop stop-color="#2563eb"/><stop offset="1" stop-color="#38bdf8"/></linearGradient></defs></svg>`;
  }

  function navIcon(name) {
    const icons = {
      gallery: `<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><rect x="2.5" y="2.5" width="6.5" height="6.5" rx="1.5" fill="currentColor"/><rect x="11" y="2.5" width="6.5" height="6.5" rx="1.5" fill="currentColor" opacity=".7"/><rect x="2.5" y="11" width="6.5" height="6.5" rx="1.5" fill="currentColor" opacity=".7"/><rect x="11" y="11" width="6.5" height="6.5" rx="1.5" fill="currentColor" opacity=".45"/></svg>`,
      search: `<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><circle cx="9" cy="9" r="5.5" stroke="currentColor" stroke-width="1.7" fill="none"/><path d="M13.2 13.2L17 17" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,
      upload: `<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M10 13.5V4.8M10 4.8L6.8 8M10 4.8L13.2 8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 14.5v1.2A1.8 1.8 0 0 0 5.8 17.5h8.4a1.8 1.8 0 0 0 1.8-1.8v-1.2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,
      trash: `<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M4.5 6h11M8 6V4.8A1.3 1.3 0 0 1 9.3 3.5h1.4A1.3 1.3 0 0 1 12 4.8V6m2.2 0v9.2a1.3 1.3 0 0 1-1.3 1.3H7.1a1.3 1.3 0 0 1-1.3-1.3V6h8.4z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
      tag: `<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M3.5 10.8V4.8A1.3 1.3 0 0 1 4.8 3.5h6l5.7 5.7a1.3 1.3 0 0 1 0 1.8l-4.5 4.5a1.3 1.3 0 0 1-1.8 0L3.5 10.8z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><circle cx="7.2" cy="7.2" r="1.1" fill="currentColor"/></svg>`,
      theme: `<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M10 3a7 7 0 1 0 7 7 5.2 5.2 0 0 1-7-7z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/></svg>`,
      convert: `<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M5.2 6.3A6.2 6.2 0 0 1 15.8 8M14.8 13.7A6.2 6.2 0 0 1 4.2 12" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M15.8 4.8V8h-3.2M4.2 15.2V12h3.2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
      layers: `<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M10 3 17 6.8 10 10.5 3 6.8 10 3Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="m4.1 10.2 5.9 3.1 5.9-3.1M4.1 13.5l5.9 3.1 5.9-3.1" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
      photo: `<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><rect x="2.8" y="3.5" width="14.4" height="13" rx="2.1" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="7.1" cy="7.8" r="1.5" fill="currentColor"/><path d="m4.5 14 3.2-3.2 2.3 2.1 2.1-2.4 3.4 3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
      film: `<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><rect x="3" y="3.2" width="14" height="13.6" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M7 3.2v13.6M13 3.2v13.6M3 7.2h4M13 7.2h4M3 12.8h4M13 12.8h4" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8.6 8.1 12.2 10 8.6 11.9V8.1Z" fill="currentColor"/></svg>`,
      settings: `<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path class="settings-gear-teeth" d="M8.6 2.5h2.8l.4 1.7c.5.2 1 .5 1.4.8l1.7-.5 1.4 2.4-1.3 1.2c.1.5.1 1.1 0 1.7l1.3 1.2-1.4 2.4-1.7-.5c-.4.4-.9.6-1.4.8l-.4 1.8H8.6l-.4-1.8c-.5-.2-1-.5-1.4-.8l-1.7.5L3.7 11 5 9.8a6.4 6.4 0 0 1 0-1.7L3.7 6.9l1.4-2.4 1.7.5c.4-.4.9-.6 1.4-.8l.4-1.7Z" stroke="currentColor" stroke-width="1.35" fill="none" stroke-linejoin="round"/><circle cx="10" cy="9" r="2.3" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>`,
    };
    return icons[name] || "";
  }

  function iconButton(action, label, icon, extraClass = "") {
    const glyph = navIcon(icon) || escapeHtml(String(icon || ""));
    return `<button class="icon-btn ${extraClass}" data-action="${action}" type="button" aria-label="${label}" data-tooltip="${label}"><span class="icon-btn-glyph">${glyph}</span></button>`;
  }

  function renderPersistenceStatus() {
    const retryable = ["fallback", "error"].includes(persistenceStatus);
    const label = persistenceLabel();
    const icon = persistenceStatus === "saving" || persistenceStatus === "connecting" ? "↻" : persistenceStatus === "server" ? "✓" : "!";
    return `
      <button class="persistence-status persistence-${persistenceStatus}"
              data-action="retryServer"
              data-persistence-status
              data-status="${persistenceStatus}"
              type="button"
              aria-live="polite"
              aria-label="${escapeHtml(`${label}. ${persistenceMessage}${retryable ? ". 눌러서 서버 연결 재시도" : ""}`)}"
              data-tooltip="${escapeHtml(persistenceMessage)}"
              ${retryable ? "" : "disabled"}>
        <span class="persistence-icon" aria-hidden="true">${icon}</span>
        <span data-persistence-label>${label}</span>
      </button>
    `;
  }

  function renderView() {
    if (isVideoArchiveMode()) return ui.view === "detail" ? renderVideoDetail() : renderVideoGallery();
    if (ui.view === "detail") return renderDetail();
    return renderGallery();
  }

  function scheduleSearchRefresh(options = {}) {
    clearTimeout(searchRefreshTimer);
    const run = () => {
      searchRefreshTimer = null;
      refreshGalleryWithoutTopbar();
    };
    if (options.immediate) run();
    else searchRefreshTimer = setTimeout(run, 80);
  }

  function refreshGalleryWithoutTopbar(options = {}) {
    // Update only main content so the search input keeps IME composition state.
    if (ui.modal) return;
    if (ui.view !== "gallery") ui.view = "gallery";
    if (options.reset !== false) resetGalleryWindow();
    const content = document.querySelector("main > .content");
    if (!content) {
      render();
      return;
    }
    content.innerHTML = isVideoArchiveMode() ? renderVideoGallery() : renderGallery();
    bindGalleryContentEvents();
  }

  function bindGalleryContentEvents() {
    bindImageErrorEvents(document.querySelector("main > .content"));
    bindGallerySelectEvents();
    document.querySelectorAll("[data-filter-group]").forEach((node) => {
      node.addEventListener("click", () => {
        ui.filterGroup = node.dataset.filterGroup;
        resetGalleryWindow();
        refreshGalleryWithoutTopbar();
      });
    });
    document.querySelectorAll("[data-category-filter]").forEach((node) => {
      node.addEventListener("click", () => {
        ui.category = node.dataset.categoryFilter;
        resetGalleryWindow();
        refreshGalleryWithoutTopbar();
      });
    });
    document.querySelectorAll("[data-tag-filter]").forEach((node) => {
      node.addEventListener("click", () => {
        const target = node.dataset.tagFilter === "outfit" ? ui.selectedOutfitTags : ui.selectedBackgroundTags;
        const key = node.dataset.key;
        const index = target.indexOf(key);
        if (index >= 0) target.splice(index, 1);
        else target.push(key);
        resetGalleryWindow();
        refreshGalleryWithoutTopbar();
      });
    });
    document.querySelectorAll("[data-page]").forEach((node) => {
      node.addEventListener("click", () => {
        const pageCount = Math.max(1, Math.ceil(currentFilteredArchiveItems().length / (state.albumSettings.columns * state.albumSettings.rows)));
        const command = node.dataset.page;
        if (command === "first") ui.page = 1;
        else if (command === "prev") ui.page = Math.max(1, ui.page - 1);
        else if (command === "next") ui.page = Math.min(pageCount, ui.page + 1);
        else if (command === "last") ui.page = pageCount;
        else ui.page = Number(command);
        refreshGalleryWithoutTopbar({ reset: false });
      });
    });
    document.querySelectorAll("[data-open-item]").forEach((node) => {
      node.addEventListener("click", (event) => {
        if (event.target.closest("button, input, label, .bulk-delete-check")) return;
        if (ui.bulkDeleteMode) {
          toggleBulkDeleteItem(node.dataset.openItem);
          refreshBulkSelectionUi();
          return;
        }
        if (ui.bulkCategoryMode) {
          toggleBulkCategoryItem(node.dataset.openItem);
          refreshBulkSelectionUi();
          return;
        }
        openItem(node.dataset.openItem);
      });
      node.addEventListener("keydown", (event) => {
        if (event.target !== node) return;
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        if (ui.bulkDeleteMode) {
          toggleBulkDeleteItem(node.dataset.openItem);
          refreshBulkSelectionUi();
          return;
        }
        if (ui.bulkCategoryMode) {
          toggleBulkCategoryItem(node.dataset.openItem);
          refreshBulkSelectionUi();
          return;
        }
        openItem(node.dataset.openItem);
      });
    });
    document.querySelectorAll("[data-action]").forEach((node) => {
      // Only bind actions inside content to avoid double-binding topbar actions.
      if (node.closest("header.topbar")) return;
      node.addEventListener("click", (event) => handleAction(event, node));
    });
    bindGalleryInfiniteScroll();
  }

  function bindGallerySelectEvents() {
    const controls = [
      ["sortSelect", "sort"],
      ["statusFilterSelect", "status"],
      ["originFilterSelect", "originFilter"],
    ];
    controls.forEach(([id, key]) => {
      const control = document.getElementById(id);
      if (!control) return;
      control.addEventListener("change", (event) => {
        ui[key] = event.target.value;
        resetGalleryWindow();
        refreshGalleryWithoutTopbar();
      });
    });
  }

  function openModal(action) {
    modalReturnAction = action;
    if (action === "promptViewer") resetPromptViewerState();
    if (action === "videoPromptViewer") resetVideoPromptViewerState();
    ui.modal = action;
    if (action === "settings" && !isVideoArchiveMode()) ui.settingsTab = ui.settingsTab?.startsWith("video") ? "api" : (ui.settingsTab || "api");
    postRenderFocusSelector = "[data-modal-panel]";
    render();
  }

  function closeModal() {
    const returnAction = modalReturnAction;
    if (ui.modal === "promptViewer") resetPromptViewerState();
    if (ui.modal === "videoPromptViewer") resetVideoPromptViewerState();
    modalBackdropPointerDown = false;
    ui.modal = null;
    postRenderFocusSelector = returnAction ? `[data-action="${returnAction}"]` : "";
    modalReturnAction = "";
    render();
  }

  function applyPostRenderFocus() {
    let target = postRenderFocusSelector ? document.querySelector(postRenderFocusSelector) : null;
    postRenderFocusSelector = "";
    if (!target && ui.modal) target = document.querySelector("[data-modal-panel]");
    if (target?.focus) target.focus({ preventScroll: true });
  }

  function trapModalFocus(event) {
    const panel = document.querySelector("[data-modal-panel]");
    if (!panel) return;
    const focusable = [...panel.querySelectorAll('button:not([disabled]), input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')]
      .filter((node) => !node.hidden && node.getClientRects().length > 0);
    if (!focusable.length) {
      event.preventDefault();
      panel.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const activeInsidePanel = panel.contains(document.activeElement);
    if (event.shiftKey && (!activeInsidePanel || document.activeElement === panel || document.activeElement === first)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (!activeInsidePanel || document.activeElement === last)) {
      event.preventDefault();
      first.focus();
    }
  }

  function renderModal() {
    if (!ui.modal) return "";
    const title = ui.modal === "upload"
      ? "업로드"
      : ui.modal === "videoUpload"
        ? "비디오 업로드"
        : ui.modal === "converter"
          ? "PNG → WebP 변환"
          : ui.modal === "loraSorter"
            ? "사진 분류"
            : ui.modal === "promptViewer"
              ? "이미지 프롬프트 확인"
              : ui.modal === "videoPromptViewer" ? "비디오 프롬프트 확인" : "설정";
    const body = ui.modal === "upload"
      ? renderUpload()
      : ui.modal === "videoUpload"
        ? renderVideoUpload()
        : ui.modal === "converter"
          ? renderImageConverter()
          : ui.modal === "loraSorter"
            ? renderLoraSorter()
            : ui.modal === "promptViewer"
              ? renderPromptViewer()
              : ui.modal === "videoPromptViewer" ? renderVideoPromptViewer() : renderSettings();
    const titleId = `modal-title-${ui.modal}`;
    return `
      <div class="modal-backdrop" data-action="closeModal">
        <section class="modal-panel ${ui.modal === "converter" ? "converter-modal-panel" : ui.modal === "loraSorter" ? "lora-sorter-modal-panel" : ui.modal === "promptViewer" || ui.modal === "videoPromptViewer" ? "prompt-viewer-modal-panel" : ""}" role="dialog" aria-modal="true" aria-labelledby="${titleId}" tabindex="-1" data-modal-panel>
          <div class="modal-head">
            <strong id="${titleId}">${title}</strong>
            <button class="icon-btn" data-action="closeModal" type="button" aria-label="닫기" data-tooltip="닫기">×</button>
          </div>
          <div class="modal-body">${body}</div>
        </section>
      </div>
    `;
  }

  function normalizeSearchText(value) {
    return String(value || "")
      .normalize("NFC")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function itemSearchBlob(item) {
    return normalizeSearchText([
      displayTitle(item),
      item.title,
      item.titleSummary,
      item.memo,
      item.customInstruction,
      item.tags?.join(" "),
      tagNames(item.outfitTags, "outfit").join(" "),
      tagNames(item.backgroundTags, "background").join(" "),
      promptText(item, "both"),
      promptText(item, "final"),
    ].filter(Boolean).join(" "));
  }

  function getFilteredItems(options = {}) {
    const query = normalizeSearchText(ui.query);
    let items = [...state.items];
    if (ui.status !== "all") items = items.filter((item) => item.status === ui.status);
    if (ui.category !== "all") items = items.filter((item) => item.categoryId === ui.category);
    if (ui.selectedOutfitTags.length) items = items.filter((item) => ui.selectedOutfitTags.every((tag) => (item.outfitTags || []).includes(tag)));
    if (ui.selectedBackgroundTags.length) items = items.filter((item) => ui.selectedBackgroundTags.every((tag) => (item.backgroundTags || []).includes(tag)));
    if (query) {
      items = items.filter((item) => itemSearchBlob(item).includes(query));
    }
    if (ui.favoriteOnly) items = items.filter((item) => item.isFavorite);
    if (ui.originFilter === "original") items = items.filter((item) => {
      ensurePromptBaseline(item);
      syncPromptEditState(item);
      return item.promptEditState === "original";
    });
    if (ui.originFilter === "modified") items = items.filter((item) => {
      ensurePromptBaseline(item);
      syncPromptEditState(item);
      return item.promptEditState === "modified";
    });
    if (ui.showDuplicatesOnly) {
      const dupIds = options.duplicateIds || duplicateIndexForItems().duplicateIds;
      items = items.filter((item) => dupIds.has(item.id));
    }
    if (ui.sort === "similarity") {
      const rankByPromptSimilarity = window.PromptArchiveSimilarity?.rankByPromptSimilarity;
      const corePromptSignature = window.PromptArchiveSimilarity?.corePromptSignature;
      if (typeof rankByPromptSimilarity === "function" && typeof corePromptSignature === "function") {
        const cacheKey = items.map((item) => `${item.id}:${corePromptSignature(item)}`).join("|");
        if (gallerySimilarityCache.key === cacheKey) {
          gallerySimilarityById = gallerySimilarityCache.matches;
          return gallerySimilarityCache.rankedItems;
        }
        const ranked = rankByPromptSimilarity(
          items,
          (item) => item,
          (item) => item.id,
        );
        gallerySimilarityById = new Map(ranked.map((entry) => [entry.item.id, {
          score: entry.score,
          matchId: entry.matchId,
        }]));
        const rankedItems = ranked.map((entry) => entry.item);
        gallerySimilarityCache = { key: cacheKey, rankedItems, matches: gallerySimilarityById };
        return rankedItems;
      }
    }
    gallerySimilarityById = new Map();
    const sorters = {
      latest: (a, b) => b.createdAt - a.createdAt,
      oldest: (a, b) => a.createdAt - b.createdAt,
      favorite: (a, b) => Number(b.isFavorite) - Number(a.isFavorite) || b.updatedAt - a.updatedAt || b.createdAt - a.createdAt,
      failed: (a, b) => Number(b.status === "analysis_failed") - Number(a.status === "analysis_failed") || b.createdAt - a.createdAt,
      modified: (a, b) => b.updatedAt - a.updatedAt,
    };
    const sorter = sorters[ui.sort] || sorters.latest;
    return items.sort(sorter);
  }

  function activeGalleryFilterCount() {
    return [
      Boolean(normalizeSearchText(ui.query)),
      ui.category !== "all",
      ui.status !== "all",
      ui.originFilter !== "all",
      ui.favoriteOnly,
      ui.showDuplicatesOnly,
      ...ui.selectedOutfitTags.map(() => true),
      ...ui.selectedBackgroundTags.map(() => true),
    ].filter(Boolean).length;
  }

  function resetGalleryFilters() {
    ui.query = "";
    ui.category = "all";
    ui.status = "all";
    ui.originFilter = "all";
    ui.favoriteOnly = false;
    ui.showDuplicatesOnly = false;
    ui.selectedOutfitTags = [];
    ui.selectedBackgroundTags = [];
    ui.filterGroup = "all";
    resetGalleryWindow();
  }

  function renderGallery() {
    const duplicateIndex = duplicateIndexForItems();
    const items = getFilteredItems({ duplicateIds: duplicateIndex.duplicateIds });
    const perPage = state.albumSettings.columns * state.albumSettings.rows;
    const pageMode = state.albumSettings.loadMode === "pages";
    const pageCount = Math.max(1, Math.ceil(items.length / perPage));
    ui.page = Math.max(1, Math.min(pageCount, ui.page || 1));
    ui.galleryLoadedPages = Math.max(1, ui.galleryLoadedPages || 1);
    const visibleCount = ui.galleryLoadedPages * perPage;
    const pageItems = pageMode
      ? items.slice((ui.page - 1) * perPage, ui.page * perPage)
      : items.slice(0, visibleCount);
    const hasMore = !pageMode && visibleCount < items.length;
    const waitingCount = state.items.filter((item) => item.status === "uploaded" || item.status === "analysis_failed").length;
    const paginationTop = pageMode && ["top", "both"].includes(state.albumSettings.paginationPosition) ? renderPagination(pageCount) : "";
    const paginationBottom = pageMode && ["bottom", "both"].includes(state.albumSettings.paginationPosition) ? renderPagination(pageCount) : "";
    return `
      ${renderAlbumFilters(items.length)}
      ${paginationTop}
      <div class="album-action-row ${ui.bulkDeleteMode || ui.bulkCategoryMode ? "delete-mode" : ""}">
        ${ui.bulkDeleteMode || ui.bulkCategoryMode ? renderBulkDeleteControls(pageItems) : ""}
        <div class="album-action-buttons">
          <button class="ghost-btn ${ui.bulkCategoryMode ? "active" : ""}" data-action="toggleBulkCategoryMode" type="button" aria-pressed="${ui.bulkCategoryMode}">${ui.bulkCategoryMode ? "분류 선택 닫기" : "일괄 분류"}</button>
          <button class="ghost-btn ${ui.bulkDeleteMode ? "active-danger" : ""}" data-action="toggleBulkDeleteMode" type="button" aria-pressed="${ui.bulkDeleteMode}">${ui.bulkDeleteMode ? "삭제 선택 닫기" : "일괄 삭제"}</button>
          <button class="ghost-btn" data-action="bulkAnalyze" type="button" ${isExifPromptMode() || !waitingCount ? "disabled" : ""}>대기 항목 분석${waitingCount ? ` ${waitingCount}` : ""}</button>
          <button class="ghost-btn" data-action="exportJson" type="button">JSON 복사</button>
        </div>
      </div>
      ${pageItems.length ? `<div class="gallery-grid album-grid ${ui.bulkDeleteMode || ui.bulkCategoryMode ? "bulk-delete-gallery" : ""}" style="--album-columns: ${state.albumSettings.columns}; --album-ratio: ${cardRatioValue()};">${pageItems.map((item) => renderImageCard(item, duplicateIndex.duplicateIds)).join("")}</div>` : renderEmptyGallery()}
      ${pageMode ? paginationBottom : renderGalleryLoadMore(hasMore, pageItems.length, items.length)}
    `;
  }

  function renderPromptViewer() {
    const preview = promptViewerState.previewUrl
      ? `<img src="${escapeHtml(promptViewerState.previewUrl)}" alt="선택한 이미지 미리보기">`
      : `<span class="prompt-viewer-placeholder" aria-hidden="true">${navIcon("photo")}</span>`;
    const sections = promptViewerState.promptJson
      ? sectionMeta.map((section) => {
        const text = (promptViewerState.promptJson?.[section.key]?.sentences || [])
          .map((sentence) => sentence.en || "")
          .filter(Boolean)
          .join("\n");
        return `
          <article class="prompt-viewer-section" data-section="${escapeHtml(section.key)}">
            <div class="prompt-viewer-section-head">
              <strong>${escapeHtml(section.labelKo)}</strong>
              <button class="tiny-btn" data-action="copyPromptViewerSection" data-section="${escapeHtml(section.key)}" type="button">복사</button>
            </div>
            <p>${escapeHtml(text)}</p>
          </article>
        `;
      }).join("")
      : "";
    return `
      <div class="prompt-viewer-shell">
        <section class="prompt-viewer-upload-card">
          <div class="prompt-viewer-preview">${preview}</div>
          <div class="prompt-viewer-dropzone" id="promptViewerDropzone">
            <span class="prompt-viewer-kicker">EXIF PROMPT</span>
            <h2>${promptViewerState.fileName ? escapeHtml(promptViewerState.fileName) : "이미지를 놓거나 선택하세요"}</h2>
            <p>PNG, JPEG, WebP에 저장된 생성 프롬프트를 이 브라우저에서 바로 읽습니다.</p>
            <input class="sr-only" id="promptViewerFileInput" type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp">
            <div class="prompt-viewer-pick-row">
              <button class="primary-btn" id="promptViewerPickFile" type="button">${promptViewerState.fileName ? "다른 이미지 선택" : "이미지 선택"}</button>
              ${promptViewerState.fileName ? '<button class="ghost-btn" data-action="clearPromptViewer" type="button">비우기</button>' : ""}
            </div>
          </div>
        </section>
        ${promptViewerState.loading ? '<div class="prompt-viewer-message" role="status"><span class="connection-spinner" aria-hidden="true"></span><strong>메타데이터를 읽는 중입니다</strong></div>' : ""}
        ${promptViewerState.error ? `<div class="prompt-viewer-message is-error" role="alert"><strong>${escapeHtml(promptViewerState.error)}</strong></div>` : ""}
        ${promptViewerState.rawText && !promptViewerState.promptJson ? `
          <details class="prompt-viewer-raw">
            <summary>감지된 원문 보기</summary>
            <pre>${escapeHtml(promptViewerState.rawText)}</pre>
          </details>
        ` : ""}
        ${promptViewerState.promptJson ? `
          <section class="prompt-viewer-result" aria-live="polite">
            <div class="prompt-viewer-result-head">
              <div>
                <span class="prompt-viewer-kicker">5개 문단</span>
                <strong>프롬프트를 찾았습니다</strong>
              </div>
              <div class="prompt-viewer-copy-actions">
                <button class="primary-btn" data-action="copyPromptViewerAll" type="button">전체 복사</button>
                <button class="ghost-btn" data-action="copyPromptViewerWithoutFace" type="button">얼굴 빼고 복사</button>
              </div>
            </div>
            <div class="prompt-viewer-sections">${sections}</div>
          </section>
        ` : ""}
      </div>
    `;
  }

  function renderVideoPromptViewer() {
    const preview = videoPromptViewerState.previewUrl
      ? `<video src="${escapeHtml(videoPromptViewerState.previewUrl)}" muted playsinline controls preload="metadata"></video>`
      : `<span class="prompt-viewer-placeholder" aria-hidden="true">${navIcon("film")}</span>`;
    const sections = videoPromptViewerState.promptJson
      ? videoSectionMeta.map((section) => {
        const text = (videoPromptViewerState.promptJson?.[section.key]?.sentences || [])
          .map((sentence) => sentence.en || "")
          .filter(Boolean)
          .join("\n");
        return `
          <article class="prompt-viewer-section" data-section="${escapeHtml(section.key)}">
            <div class="prompt-viewer-section-head">
              <strong>${escapeHtml(section.labelKo)}</strong>
              <button class="tiny-btn" data-action="copyVideoPromptViewerSection" data-section="${escapeHtml(section.key)}" type="button">복사</button>
            </div>
            <p class="video-sentence ${text ? "" : "is-empty"}">${text ? escapeHtml(text) : ""}</p>
          </article>
        `;
      }).join("")
      : "";
    return `
      <div class="prompt-viewer-shell">
        <section class="prompt-viewer-upload-card">
          <div class="prompt-viewer-preview">${preview}</div>
          <div class="prompt-viewer-dropzone" id="videoPromptViewerDropzone">
            <span class="prompt-viewer-kicker">VIDEO PROMPT</span>
            <h2>${videoPromptViewerState.fileName ? escapeHtml(videoPromptViewerState.fileName) : "비디오를 놓거나 선택하세요"}</h2>
            <p>WebM, MP4에 저장된 ComfyUI 프롬프트를 6문단으로 바로 읽습니다. 저장하지 않고 확인만 합니다.</p>
            <input class="sr-only" id="videoPromptViewerFileInput" type="file" accept="video/webm,video/mp4,video/quicktime,.webm,.mp4,.mov">
            <div class="prompt-viewer-pick-row">
              <button class="primary-btn" id="videoPromptViewerPickFile" type="button">${videoPromptViewerState.fileName ? "다른 비디오 선택" : "비디오 선택"}</button>
              ${videoPromptViewerState.fileName ? '<button class="ghost-btn" data-action="clearVideoPromptViewer" type="button">비우기</button>' : ""}
            </div>
          </div>
        </section>
        ${videoPromptViewerState.loading ? '<div class="prompt-viewer-message" role="status"><span class="connection-spinner" aria-hidden="true"></span><strong>메타데이터를 읽는 중입니다</strong></div>' : ""}
        ${videoPromptViewerState.error ? `<div class="prompt-viewer-message is-error" role="alert"><strong>${escapeHtml(videoPromptViewerState.error)}</strong></div>` : ""}
        ${videoPromptViewerState.rawText && !videoPromptHasViewerContent() ? `
          <details class="prompt-viewer-raw">
            <summary>감지된 원문 보기</summary>
            <pre>${escapeHtml(videoPromptViewerState.rawText)}</pre>
          </details>
        ` : ""}
        ${videoPromptViewerState.promptJson ? `
          <section class="prompt-viewer-result" aria-live="polite">
            <div class="prompt-viewer-result-head">
              <div>
                <span class="prompt-viewer-kicker">6개 문단</span>
                <strong>${videoPromptHasViewerContent() ? "프롬프트를 찾았습니다" : "일부 문단만 찾았습니다"}</strong>
              </div>
              <div class="prompt-viewer-copy-actions">
                <button class="primary-btn" data-action="copyVideoPromptViewerAll" type="button">전체 복사</button>
              </div>
            </div>
            <div class="prompt-viewer-sections">${sections}</div>
          </section>
        ` : ""}
      </div>
    `;
  }

  function videoPromptHasViewerContent() {
    return videoSectionMeta.some((section) => (
      videoPromptViewerState.promptJson?.[section.key]?.sentences || []
    ).some((sentence) => String(sentence.en || "").trim()));
  }

  function resetVideoPromptViewerState() {
    videoPromptViewerRequestId += 1;
    if (videoPromptViewerState.previewUrl) URL.revokeObjectURL(videoPromptViewerState.previewUrl);
    Object.assign(videoPromptViewerState, {
      fileName: "",
      previewUrl: "",
      loading: false,
      promptJson: null,
      rawText: "",
      source: "",
      error: "",
    });
  }

  function resetPromptViewerState() {
    promptViewerRequestId += 1;
    if (promptViewerState.previewUrl) URL.revokeObjectURL(promptViewerState.previewUrl);
    Object.assign(promptViewerState, {
      fileName: "",
      previewUrl: "",
      loading: false,
      promptJson: null,
      rawText: "",
      source: "",
      error: "",
    });
  }

  function normalizeConverterHistory(value) {
    if (!Array.isArray(value)) return [];
    return value
      .filter((entry) => entry && typeof entry === "object")
      .map((entry) => ({
        id: String(entry.id || entry.finishedAt || Date.now()),
        finishedAt: Number(entry.finishedAt || Date.now()),
        destination: String(entry.destination || "저장 위치 정보 없음").slice(0, 120),
        total: Math.max(0, Number(entry.total) || 0),
        converted: Math.max(0, Number(entry.converted) || 0),
        skipped: Math.max(0, Number(entry.skipped) || 0),
        deleted: Math.max(0, Number(entry.deleted) || 0),
        errors: Math.max(0, Number(entry.errors) || 0),
      }))
      .sort((left, right) => right.finishedAt - left.finishedAt)
      .slice(0, 2);
  }

  function loadConverterHistory() {
    try {
      return normalizeConverterHistory(JSON.parse(localStorage.getItem(CONVERTER_HISTORY_KEY) || "[]"));
    } catch (_) {
      return [];
    }
  }

  function saveConverterHistory() {
    try {
      localStorage.setItem(CONVERTER_HISTORY_KEY, JSON.stringify(converterState.history));
    } catch (_) {
      // Conversion remains usable even when browser storage is unavailable.
    }
  }

  function addConverterHistory(result) {
    const destination = converterState.destinationMode === "custom"
      ? `지정 폴더 · ${converterState.destinationHandle?.name || "이름 없음"}`
      : `원본 폴더 · ${converterState.sourceHandle?.name || "이름 없음"}`;
    const finishedAt = Date.now();
    converterState.history = normalizeConverterHistory([
      {
        id: String(finishedAt),
        finishedAt,
        destination,
        total: result.total,
        converted: result.converted,
        skipped: result.skipped,
        deleted: result.deleted,
        errors: result.errors.length,
      },
      ...converterState.history,
    ]);
    saveConverterHistory();
  }

  function converterHistoryTime(value) {
    return new Intl.DateTimeFormat("ko-KR", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  }

  function renderConverterHistory() {
    const entries = converterState.history;
    if (!entries.length) return `<p class="converter-history-empty">아직 완료된 변환 기록이 없습니다.</p>`;
    return `
      <div class="converter-history-list">
        ${entries.map((entry) => {
          const extras = [entry.deleted ? `원본 삭제 ${entry.deleted}` : "", entry.skipped ? `건너뜀 ${entry.skipped}` : "", entry.errors ? `오류 ${entry.errors}` : ""].filter(Boolean).join(" · ");
          return `
            <div class="converter-history-entry">
              <span title="${escapeHtml(entry.destination)}">${escapeHtml(converterHistoryTime(entry.finishedAt))} · ${escapeHtml(entry.destination)}</span>
              <strong>${entry.total}개 중 ${entry.converted}개 완료${extras ? ` · ${extras}` : ""}</strong>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderWildcardSyncStatus() {
    const result = converterState.wildcardSyncResult;
    if (!result) {
      return `<small class="converter-wildcard-status">처리 기록 이후 추가된 새 ID만 반영하며, 기존 줄과 같은 문장은 제외합니다.</small>`;
    }
    if (result.error) {
      return `<small class="converter-wildcard-status error" role="status">${escapeHtml(result.error)}</small>`;
    }
    if (result.rebuilt) {
      const outputNotes = Array.isArray(result.scenarioOutputs)
        ? result.scenarioOutputs.map((output) => `${output.path} ${output.written}줄`)
        : [
          `일반 시나리오 ${result.scenarioWritten}줄`,
          `NSFW 시나리오 ${result.nsfwScenarioWritten}줄`,
        ];
      const notes = [
        `외모 ${result.appearanceWritten}줄`,
        ...outputNotes,
        result.duplicatesSkipped ? `중복 ${result.duplicatesSkipped}줄 제외` : "",
        result.invalidItems ? `확인 필요 ${result.invalidItems}개` : "",
        result.refreshed ? "ComfyUI 새로고침 완료" : result.refreshMessage,
      ].filter(Boolean).join(" · ");
      return `<div class="converter-wildcard-status success" role="status"><strong>전체 갱신 완료 · 현재 ${result.validItems}개 항목</strong><small>${escapeHtml(notes)}</small></div>`;
    }
    const outputAdditions = Array.isArray(result.scenarioOutputs)
      ? result.scenarioOutputs
        .filter((output) => output.added)
        .map((output) => `${output.path} +${output.added}`)
      : [`일반 +${result.scenarioAdded}`, `NSFW +${result.nsfwScenarioAdded}`];
    const summary = result.initialized
      ? `기준 등록 완료 · 현재 ${result.totalItems}개`
      : [
        `새 항목 ${result.newItems}개`,
        `외모 +${result.appearanceAdded}`,
        ...outputAdditions,
      ].join(" · ");
    const notes = [
      result.appearanceMoved ? `외모 ${result.appearanceMoved}줄 경로 이동` : "",
      result.scenariosMoved ? `시나리오 ${result.scenariosMoved}줄 규칙 이동` : "",
      result.duplicatesSkipped ? `중복 ${result.duplicatesSkipped}줄 제외` : "",
      result.invalidItems ? `확인 필요 ${result.invalidItems}개` : "",
      result.refreshed ? "ComfyUI 새로고침 완료" : result.refreshMessage,
    ].filter(Boolean).join(" · ");
    return `<div class="converter-wildcard-status success" role="status"><strong>${escapeHtml(summary)}</strong>${notes ? `<small>${escapeHtml(notes)}</small>` : ""}</div>`;
  }

  function renderImageConverter() {
    const supported = typeof window.showDirectoryPicker === "function"
      && Boolean(window.PromptArchiveImageConverter?.preservePngMetadataInWebp)
      && supportsWebP();
    const fileCount = converterState.sourceFiles.length;
    const disabled = converterState.running ? "disabled" : "";
    const folderMode = converterState.sourceMode === "folder";
    const selectedPreview = converterState.sourceFiles.slice(0, 3).map((entry) => entry.name);
    return `
      <div class="converter-shell">
        <section class="converter-hero">
          <div class="converter-hero-mark" aria-hidden="true">${navIcon("convert")}</div>
          <div>
            <p class="converter-kicker">LOCAL BATCH CONVERTER</p>
            <h2>PNG → WebP · 메타데이터 유지</h2>
            <p>ComfyUI <code>prompt</code>·<code>workflow</code>를 EXIF/XMP에 보존합니다.</p>
          </div>
          <span class="converter-secure-badge">로컬 처리</span>
        </section>

        ${supported ? "" : `<div class="converter-browser-warning" role="alert"><strong>현재 브라우저에서는 폴더 저장을 사용할 수 없습니다.</strong><span>Chrome 또는 Edge에서 이 앱을 열어주세요.</span></div>`}

        <div class="converter-grid">
          <section class="converter-card converter-source-card">
            <div class="converter-source-heading">
              <div class="converter-step-head"><span>01</span><div><strong>PNG 선택</strong><small>폴더 전체 또는 필요한 파일만 고르세요.</small></div></div>
              <div class="converter-source-mode" role="radiogroup" aria-label="PNG 선택 방식">
                <label class="converter-source-mode-btn ${folderMode ? "selected" : ""}"><input type="radio" name="converterSourceMode" value="folder" ${folderMode ? "checked" : ""} ${disabled}><span>폴더 선택</span></label>
                <label class="converter-source-mode-btn ${!folderMode ? "selected" : ""}"><input type="radio" name="converterSourceMode" value="files" ${!folderMode ? "checked" : ""} ${disabled}><span>개별 파일</span></label>
              </div>
            </div>
            <div class="converter-dropzone ${folderMode ? "folder-mode" : "file-mode"}" data-converter-dropzone>
              <span class="converter-dropzone-icon" aria-hidden="true">${folderMode ? "▰" : "＋"}</span>
              <div class="converter-dropzone-copy">
                <strong>${folderMode
                  ? converterState.sourceHandle ? escapeHtml(converterState.sourceHandle.name) : "PNG 폴더를 선택하세요"
                  : fileCount ? `${fileCount}개 PNG 선택됨` : "PNG를 여기에 놓으세요"}</strong>
                <small>${folderMode
                  ? converterState.sourceHandle ? `PNG ${fileCount}개 발견` : "선택한 폴더는 브라우저에서만 처리됩니다."
                  : fileCount ? escapeHtml(`${selectedPreview.join(" · ")}${fileCount > 3 ? ` 외 ${fileCount - 3}개` : ""}`) : "드래그하거나 파일 선택을 눌러 여러 장을 고를 수 있습니다."}</small>
              </div>
              ${folderMode
                ? `<button class="ghost-btn" data-action="selectConverterSource" type="button" ${disabled || (!supported ? "disabled" : "")}>폴더 선택</button>`
                : `<label class="ghost-btn converter-file-picker ${converterState.running ? "disabled" : ""}">파일 선택<input class="converter-file-input" id="converterFileInput" type="file" accept="image/png,.png" multiple ${disabled}></label>`}
            </div>
            <div class="converter-selection-footer">
              ${folderMode ? `<label class="converter-check"><input id="converterIncludeSubfolders" type="checkbox" ${converterState.includeSubfolders ? "checked" : ""} ${disabled}><span>하위 폴더 검색 · 구조 유지</span></label>` : `<small>개별 파일은 지정 폴더에 저장됩니다.</small>`}
              <div class="converter-selection-actions">
                <label class="converter-delete-check ${converterState.deleteOriginals ? "active" : ""}" title="변환과 저장에 성공한 PNG만 복구할 수 없도록 영구 삭제합니다."><input id="converterDeleteOriginals" type="checkbox" ${converterState.deleteOriginals ? "checked" : ""} ${disabled || (!folderMode ? "disabled" : "")}><span>변환 후 원본 영구 삭제</span></label>
                <button class="ghost-btn converter-reset-btn" data-action="resetConverterSelection" type="button" ${disabled || (!fileCount && !converterState.sourceHandle ? "disabled" : "")}>선택 비우기</button>
              </div>
            </div>
          </section>

          <section class="converter-card converter-destination-card">
            <div class="converter-step-head"><span>02</span><div><strong>저장 위치</strong><small>원본 옆 또는 별도 폴더에 저장합니다.</small></div></div>
            <div class="converter-choice-grid" role="radiogroup" aria-label="저장 위치">
              <label class="converter-choice ${converterState.destinationMode === "source" ? "selected" : ""}">
                <input type="radio" name="converterDestinationMode" value="source" ${converterState.destinationMode === "source" ? "checked" : ""} ${disabled || (!folderMode ? "disabled" : "")}>
                <span><strong>원본 폴더</strong><small>각 PNG와 같은 위치</small></span>
              </label>
              <label class="converter-choice ${converterState.destinationMode === "custom" ? "selected" : ""}">
                <input type="radio" name="converterDestinationMode" value="custom" ${converterState.destinationMode === "custom" ? "checked" : ""} ${disabled}>
                <span><strong>지정 폴더</strong><small>폴더를 직접 선택</small></span>
              </label>
            </div>
            <div class="converter-destination ${converterState.destinationMode === "custom" ? "visible" : ""}" data-converter-destination>
              <span>${converterState.destinationHandle ? escapeHtml(converterState.destinationHandle.name) : "저장 폴더 미선택"}</span>
              <button class="ghost-btn" data-action="selectConverterDestination" type="button" ${disabled || (!supported ? "disabled" : "")}>저장 폴더 선택</button>
            </div>
          </section>

          <section class="converter-card converter-options-card">
            <div class="converter-step-head"><span>03</span><div><strong>변환 설정</strong><small>화질과 중복 파일 처리를 정합니다.</small></div></div>
            <label class="converter-quality-row" for="converterQuality">
              <span><strong>WebP 화질</strong><small>100에서도 손실 압축이지만 육안 차이는 매우 작습니다.</small></span>
              <output id="converterQualityOutput">${converterState.quality}</output>
            </label>
            <input class="converter-range" id="converterQuality" type="range" min="70" max="100" step="1" value="${converterState.quality}" ${disabled}>
            <label class="field converter-collision-field">
              <span>같은 이름의 WebP가 있을 때</span>
              <select class="select" id="converterCollisionMode" ${disabled}>
                <option value="rename" ${converterState.collisionMode === "rename" ? "selected" : ""}>새 이름으로 저장 (_webp)</option>
                <option value="skip" ${converterState.collisionMode === "skip" ? "selected" : ""}>기존 파일 건너뛰기</option>
                <option value="overwrite" ${converterState.collisionMode === "overwrite" ? "selected" : ""}>기존 파일 덮어쓰기</option>
              </select>
            </label>
            <div class="converter-metadata-note">
              <div class="converter-metadata-status">
                <span aria-hidden="true">✓</span>
                <div><strong>메타데이터 유지 활성화</strong><small>PNG 텍스트·EXIF 정보를 WebP에 삽입하고 저장 전에 청크를 검증합니다.</small></div>
              </div>
              <div class="converter-history-panel">
                <div class="converter-history-head"><strong>최근 변환</strong><small>최근 2회</small></div>
                ${renderConverterHistory()}
              </div>
            </div>
          </section>
        </div>

        <section class="converter-wildcard-card">
          <div class="converter-wildcard-copy">
            <span class="converter-wildcard-mark" aria-hidden="true">WC</span>
            <div>
              <strong>와일드카드 라이브러리</strong>
              <small>새 항목만 추가하거나 <code>items.json</code>의 현재 항목으로 전체를 다시 작성합니다.</small>
              <small>외모는 함께 유지하고, <code>nsfw</code> 카테고리의 얼굴 제외 시나리오는 <code>nsfw.txt</code>로 분리합니다.</small>
              ${renderWildcardSyncStatus()}
            </div>
          </div>
          <div class="converter-wildcard-actions">
            <button class="ghost-btn converter-wildcard-btn" data-action="syncWildcards" type="button" ${converterState.wildcardSyncing ? "disabled" : ""}>${converterState.wildcardSyncMode === "incremental" ? "업데이트 확인 중…" : "와일드카드 업데이트"}</button>
            <button class="ghost-btn converter-wildcard-btn converter-wildcard-rebuild-btn" data-action="rebuildWildcards" type="button" ${converterState.wildcardSyncing ? "disabled" : ""}>${converterState.wildcardSyncMode === "rebuild" ? "전체 갱신 중…" : "전체 갱신"}</button>
          </div>
        </section>

        <section class="converter-run-card">
          <div class="converter-run-summary">
            <strong>${converterState.running ? converterProgressTitle(converterState.progress) : fileCount ? `${fileCount}개 PNG 변환 준비 완료` : "PNG를 먼저 선택하세요"}</strong>
            <small class="${converterState.deleteOriginals ? "converter-destructive-copy" : ""}">${converterState.deleteOriginals ? "변환 성공 PNG는 작업 완료 후 영구 삭제됩니다." : "원본 PNG는 삭제하거나 변경하지 않습니다."}</small>
          </div>
          <button class="primary-btn converter-start-btn" data-action="startConverter" type="button" ${disabled || !supported || !fileCount ? "disabled" : ""}>${converterState.running ? "변환 중…" : "WebP 변환 시작"}</button>
        </section>
        ${renderConverterProgress()}
      </div>
    `;
  }

  function renderConverterProgress() {
    const progress = converterState.progress;
    const result = converterState.result;
    if (!progress && !result) return "";
    const active = progress && converterState.running;
    const current = progress?.current || result?.converted || 0;
    const total = progress?.total || result?.total || 0;
    const percent = total ? Math.round((current / total) * 100) : 0;
    const failures = (result?.errors || progress?.errors || []).slice(-5);
    return `
      <section class="converter-progress-card" aria-live="polite">
        <div class="converter-progress-head">
          <div><strong data-converter-progress-title>${active ? converterProgressTitle(progress) : `변환 완료 · ${result?.converted || 0}개 저장`}</strong><small data-converter-progress-file>${escapeHtml(progress?.fileName || result?.summary || "")}</small></div>
          <span data-converter-progress-percent>${active ? `${percent}%` : result ? `${formatBytes(result.outputBytes)} 저장` : ""}</span>
        </div>
        <div class="converter-progress-track"><span data-converter-progress-bar style="width:${percent}%"></span></div>
        <div class="converter-result-stats" data-converter-result-stats>
          ${result ? `<span>변환 <strong>${result.converted}</strong></span><span>원본 삭제 <strong>${result.deleted}</strong></span><span>건너뜀 <strong>${result.skipped}</strong></span><span>오류 <strong>${result.errors.length}</strong></span><span>메타데이터 <strong>${result.metadataFiles}</strong></span>` : ""}
        </div>
        <ul class="converter-error-list" data-converter-errors>${failures.map((message) => `<li>${escapeHtml(message)}</li>`).join("")}</ul>
      </section>
    `;
  }

  function renderConverterMiniProgress() {
    if (!converterState.running || ui.modal === "converter" || !converterState.progress) return "";
    const progress = converterState.progress;
    const percent = progress.total ? Math.round((progress.current / progress.total) * 100) : 0;
    return `
      <button class="converter-mini-progress" data-action="converter" type="button" aria-label="변환 진행 창 열기">
        <span class="converter-mini-head"><strong data-converter-mini-title>${converterProgressTitle(progress)}</strong><em data-converter-mini-percent>${percent}%</em></span>
        <small data-converter-mini-file>${escapeHtml(progress.fileName || "변환 준비 중")}</small>
        <span class="converter-mini-track"><i data-converter-mini-bar style="width:${percent}%"></i></span>
      </button>
    `;
  }

  function converterProgressTitle(progress) {
    if (!progress) return "변환 준비 중";
    return progress.phase === "delete"
      ? `원본 삭제 ${progress.current} / ${progress.total}`
      : `${progress.current} / ${progress.total} 변환 중`;
  }

  function renderLoraSorter() {
    const supported = typeof window.showDirectoryPicker === "function" && Boolean(window.PromptArchiveLoraSorter);
    const busy = loraSorterState.scanning || loraSorterState.moving;
    const detectionExclusions = [...loraSorterState.detectionExcludedLoras].sort((left, right) => left.localeCompare(right, "ko"));
    const detectionExclusionKeys = loraSorterDetectionExclusionKeys();
    const detectedLoraSuggestions = loraSorterDetectedLoraNames()
      .filter((name) => !detectionExclusionKeys.has(name.toLowerCase()));
    const movableGroups = loraSorterState.groups.filter((group) => group.movable);
    const movableFiles = movableGroups.reduce((total, group) => total + group.count, 0);
    const readyFiles = movableGroups.reduce((total, group) => {
      if (loraSorterState.excludedGroupKeys.has(group.key)) return total;
      const destination = loraSorterState.destinationHandles.get(group.key) || loraSorterState.baseDestinationHandle;
      return total + (destination ? group.count : 0);
    }, 0);
    const unreadable = loraSorterState.groups.filter((group) => !group.movable).reduce((total, group) => total + group.count, 0);
    return `
      <div class="lora-sorter-shell">
        <section class="lora-sorter-hero">
          <div class="lora-sorter-hero-mark" aria-hidden="true">${navIcon("layers")}</div>
          <div>
            <p class="converter-kicker">COMFYUI METADATA ROUTER</p>
            <h2>켜진 LoRA대로 사진을 정리합니다.</h2>
            <p>Power Lora Loader의 <code>on: true</code>만 판독하며, 복사가 검증된 뒤 원본을 삭제해 실제 이동합니다. 폴더 설정은 자동 저장됩니다.</p>
          </div>
          <span class="converter-secure-badge">로컬 처리</span>
        </section>

        ${supported ? "" : `<div class="converter-browser-warning" role="alert"><strong>폴더 이동 기능을 사용할 수 없습니다.</strong><span>Chrome 또는 Edge에서 로컬 앱을 열어주세요.</span></div>`}

        <div class="lora-sorter-setup-grid">
          <section class="converter-card lora-sorter-source-card">
            <div class="converter-step-head"><span>01</span><div><strong>생성 이미지 폴더</strong><small>WebP · PNG · JPG의 ComfyUI 메타데이터를 검사합니다.</small></div></div>
            <button class="lora-folder-picker" data-action="selectLoraSorterSource" type="button" ${busy || !supported ? "disabled" : ""}>
              <span class="converter-folder-icon" aria-hidden="true">▰</span>
              <span><strong>${escapeHtml(loraSorterState.sourceHandle?.name || "이미지 폴더 선택")}</strong><small>${loraSorterState.sourceHandle ? `${loraSorterState.scannedFiles.length}개 검사됨` : "폴더를 고르면 바로 스캔합니다."}</small></span>
              <em>${loraSorterState.scanning ? "검사 중" : "선택"}</em>
            </button>
            <label class="converter-check lora-recursive-check"><input id="loraSorterIncludeSubfolders" type="checkbox" ${loraSorterState.includeSubfolders ? "checked" : ""} ${busy ? "disabled" : ""}><span>하위 폴더 포함</span></label>
          </section>

          <section class="converter-card lora-sorter-destination-card">
            <div class="converter-step-head"><span>02</span><div><strong>자동 분류 기준 폴더</strong><small>이 폴더 안에 LoRA 이름별 하위 폴더를 만듭니다.</small></div></div>
            <button class="lora-folder-picker" data-action="selectLoraSorterBaseDestination" type="button" ${busy || !supported ? "disabled" : ""}>
              <span class="converter-folder-icon" aria-hidden="true">⌂</span>
              <span><strong>${escapeHtml(loraSorterState.baseDestinationHandle?.name || "목적지 기준 폴더 선택")}</strong><small>${loraSorterState.baseDestinationHandle ? "LoRA별 하위 폴더 자동 생성" : "항목별 폴더만 지정해도 됩니다."}</small></span>
              <em>선택</em>
            </button>
            <label class="field lora-collision-field"><span>같은 파일명이 있을 때</span><select class="select" id="loraSorterCollisionMode" ${busy ? "disabled" : ""}><option value="rename" ${loraSorterState.collisionMode === "rename" ? "selected" : ""}>새 이름으로 이동 (_2)</option><option value="skip" ${loraSorterState.collisionMode === "skip" ? "selected" : ""}>기존 파일 건너뛰기</option></select></label>
          </section>
        </div>

        <section class="lora-detection-exclusion-card" aria-labelledby="lora-detection-exclusion-title">
          <div class="lora-detection-exclusion-head">
            <div>
              <span class="lora-exclusion-eyebrow">CHARACTER FILTER</span>
              <strong id="lora-detection-exclusion-title">감지 제외 LoRA</strong>
              <small>스타일·품질 LoRA를 등록하면 조합에서 빼고 인물 LoRA만 다시 묶습니다.</small>
            </div>
            <span class="lora-exclusion-count">${detectionExclusions.length}<small>개 제외</small></span>
          </div>
          <div class="lora-detection-exclusion-controls">
            <label for="loraDetectionExclusionInput">LoRA 이름</label>
            <div class="lora-detection-exclusion-input-row">
              <input class="input" id="loraDetectionExclusionInput" list="loraDetectionExclusionSuggestions" type="text" placeholder="예: PornMaster_Krea2_Realism_slider_V1" autocomplete="off" ${busy ? "disabled" : ""}>
              <datalist id="loraDetectionExclusionSuggestions">${detectedLoraSuggestions.map((name) => `<option value="${escapeHtml(name)}"></option>`).join("")}</datalist>
              <button class="ghost-btn lora-detection-add-btn" data-action="addLoraDetectionExclusion" type="button" ${busy ? "disabled" : ""}>추가</button>
            </div>
          </div>
          <div class="lora-detection-exclusion-list">
            ${detectionExclusions.length
              ? detectionExclusions.map((name) => `<span class="lora-detection-exclusion-chip"><span>${escapeHtml(name)}</span><button data-action="removeLoraDetectionExclusion" data-lora-name="${escapeHtml(name)}" type="button" aria-label="${escapeHtml(name)} 감지 제외 해제" ${busy ? "disabled" : ""}>×</button></span>`).join("")
              : `<span class="lora-detection-exclusion-empty">등록된 항목이 없습니다. 아래 감지 결과에서도 LoRA별로 바로 제외할 수 있습니다.</span>`}
          </div>
        </section>

        <section class="lora-groups-card">
          <div class="lora-groups-head">
            <div><strong>감지된 LoRA</strong><small>${loraSorterState.groups.length ? `${movableGroups.length}개 분류 · 이동 가능 ${movableFiles}장${unreadable ? ` · 제외 ${unreadable}장` : ""}` : "원본 폴더를 선택하면 여기에 표시됩니다."}</small></div>
            ${loraSorterState.sourceHandle ? `<button class="ghost-btn" data-action="rescanLoraSorter" type="button" ${busy ? "disabled" : ""}>다시 검사</button>` : ""}
          </div>
          <div class="lora-group-list">
            ${loraSorterState.groups.length ? loraSorterState.groups.map((group) => renderLoraSorterGroup(group, busy)).join("") : `<div class="lora-group-empty"><span aria-hidden="true">◎</span><strong>아직 검사한 이미지가 없습니다.</strong><small>ComfyUI가 저장한 prompt 메타데이터에서 활성 LoRA를 찾습니다.</small></div>`}
          </div>
        </section>

        <section class="converter-run-card lora-sorter-run-card">
          <div class="converter-run-summary">
            <strong>${busy ? loraSorterProgressTitle(loraSorterState.progress) : readyFiles ? `${readyFiles}장 이동 준비 완료` : movableFiles ? "목적지 폴더를 지정하세요" : "분류할 폴더를 먼저 검사하세요"}</strong>
            <small class="converter-destructive-copy">목적지 저장과 파일 크기 검증이 끝난 원본만 영구 삭제됩니다.</small>
          </div>
          <button class="primary-btn converter-start-btn" data-action="startLoraSorterMove" type="button" ${busy || !supported || !readyFiles ? "disabled" : ""}>${loraSorterState.moving ? "이동 중…" : "LoRA별 폴더로 이동"}</button>
        </section>
        ${renderLoraSorterProgress()}
      </div>
    `;
  }

  function renderLoraSorterGroup(group, busy) {
    const custom = loraSorterState.destinationHandles.get(group.key);
    const excluded = group.movable && loraSorterState.excludedGroupKeys.has(group.key);
    const autoFolder = window.PromptArchiveLoraSorter.safeFolderName(group.label);
    const destination = excluded
      ? "이동 안 함"
      : custom
      ? `개별 · ${custom.name}`
      : loraSorterState.baseDestinationHandle && group.movable
        ? `${loraSorterState.baseDestinationHandle.name} / ${autoFolder}`
        : group.movable ? "목적지 미지정" : "자동 이동 제외";
    const badge = excluded
      ? "제외"
      : group.kind === "multiple"
        ? "복수 LoRA"
        : group.kind === "unreadable"
          ? "판독 불가"
          : group.kind === "none"
            ? "비활성"
            : group.kind === "excluded-only" ? "감지 제외" : "활성";
    const detectedLoras = loraSorterGroupLoras(group);
    return `
      <article class="lora-group-row ${group.movable ? "" : "unreadable"} ${excluded ? "excluded" : ""}">
        <span class="lora-group-count"><strong>${group.count}</strong><small>장</small></span>
        <div class="lora-group-copy">
          <strong title="${escapeHtml(group.label)}">${escapeHtml(group.label)}</strong>
          ${detectedLoras.length ? `<div class="lora-group-components">${detectedLoras.map((name) => `<button data-action="excludeDetectedLora" data-lora-name="${escapeHtml(name)}" type="button" title="${escapeHtml(name)}을(를) 감지에서 제외" ${busy ? "disabled" : ""}><span>${escapeHtml(name)}</span><em>제외</em></button>`).join("")}</div>` : ""}
          <small>${escapeHtml(destination)}</small>
        </div>
        <span class="lora-group-badge ${excluded ? "excluded" : group.kind}">${badge}</span>
        ${group.movable ? `<div class="lora-group-actions"><button class="ghost-btn lora-group-destination-btn" data-action="selectLoraGroupDestination" data-lora-key="${escapeHtml(group.key)}" type="button" ${busy ? "disabled" : ""}>${custom ? "폴더 변경" : "개별 지정"}</button><button class="ghost-btn lora-group-exclude-btn ${excluded ? "active" : ""}" data-action="toggleLoraGroupExcluded" data-lora-key="${escapeHtml(group.key)}" type="button" aria-pressed="${excluded}" ${busy ? "disabled" : ""}>${excluded ? "이동 포함" : "이동 안 함"}</button></div>` : ""}
      </article>
    `;
  }

  function loraSorterDetectedLoraNames() {
    const names = new Map();
    for (const file of loraSorterState.scannedFiles) {
      for (const lora of file?.inspection?.loras || []) {
        const name = window.PromptArchiveLoraSorter.normalizeLoraExclusion(lora?.path || lora?.name);
        const key = name.toLowerCase();
        if (key && !names.has(key)) names.set(key, name);
      }
    }
    return [...names.values()].sort((left, right) => left.localeCompare(right, "ko"));
  }

  function loraSorterDetectionExclusionKeys() {
    return new Set([...loraSorterState.detectionExcludedLoras]
      .map((name) => window.PromptArchiveLoraSorter.normalizeLoraExclusion(name).toLowerCase())
      .filter(Boolean));
  }

  function loraSorterGroupLoras(group) {
    const names = new Map();
    const excludedKeys = loraSorterDetectionExclusionKeys();
    for (const file of group?.files || []) {
      for (const lora of file?.inspection?.loras || []) {
        const name = window.PromptArchiveLoraSorter.normalizeLoraExclusion(lora?.path || lora?.name);
        const key = name.toLowerCase();
        if (key
          && !names.has(key)
          && !excludedKeys.has(key)) {
          names.set(key, name);
        }
      }
    }
    return [...names.values()].sort((left, right) => left.localeCompare(right, "ko"));
  }

  function renderLoraSorterProgress() {
    const progress = loraSorterState.progress;
    const result = loraSorterState.result;
    if (!progress && !result) return "";
    const total = progress?.total || result?.total || 0;
    const current = progress?.current || (result ? result.moved + result.skipped + result.failed : 0);
    const percent = total ? Math.round((current / total) * 100) : 0;
    const errors = (result?.errors || progress?.errors || []).slice(-5);
    return `
      <section class="converter-progress-card lora-sorter-progress-card" aria-live="polite">
        <div class="converter-progress-head"><div><strong data-lora-progress-title>${loraSorterProgressTitle(progress, result)}</strong><small data-lora-progress-file>${escapeHtml(progress?.fileName || result?.summary || "")}</small></div><span data-lora-progress-percent>${percent}%</span></div>
        <div class="converter-progress-track"><span data-lora-progress-bar style="width:${percent}%"></span></div>
        ${result ? `<div class="converter-result-stats"><span>이동 <strong>${result.moved}</strong></span><span>건너뜀 <strong>${result.skipped}</strong></span><span>제외 <strong>${result.excluded}</strong></span><span>오류 <strong>${result.failed}</strong></span></div>` : ""}
        <ul class="converter-error-list" data-lora-progress-errors>${errors.map((message) => `<li>${escapeHtml(message)}</li>`).join("")}</ul>
      </section>
    `;
  }

  function renderLoraSorterMiniProgress() {
    if ((!loraSorterState.scanning && !loraSorterState.moving) || ui.modal === "loraSorter" || !loraSorterState.progress) return "";
    const progress = loraSorterState.progress;
    const percent = progress.total ? Math.round((progress.current / progress.total) * 100) : 0;
    return `<button class="converter-mini-progress lora-sorter-mini-progress" data-action="loraSorter" type="button" aria-label="LoRA 분류 진행 창 열기"><span class="converter-mini-head"><strong data-lora-mini-title>${loraSorterProgressTitle(progress)}</strong><em data-lora-mini-percent>${percent}%</em></span><small data-lora-mini-file>${escapeHtml(progress.fileName || "준비 중")}</small><span class="converter-mini-track"><i data-lora-mini-bar style="width:${percent}%"></i></span></button>`;
  }

  function loraSorterProgressTitle(progress, result = null) {
    if (result && !loraSorterState.scanning && !loraSorterState.moving) return `분류 완료 · ${result.moved}장 이동`;
    if (!progress) return "LoRA 분류 준비 중";
    return progress.phase === "scan"
      ? `${progress.current} / ${progress.total} 메타데이터 검사`
      : `${progress.current} / ${progress.total} 파일 이동`;
  }

  function renderBulkDeleteControls(pageItems) {
    if (ui.bulkCategoryMode) {
      const selectedCount = (ui.selectedBulkCategoryIds || []).filter((id) => state.items.some((item) => item.id === id)).length;
      return `
        <div class="bulk-delete-controls bulk-category-controls" aria-live="polite">
          <strong>일괄 분류</strong>
          <span class="bulk-category-count">${selectedCount}개 선택</span>
          <select class="select" id="bulkCategorySelect">
            ${state.categories.map((cat) => `<option value="${cat.id}">${escapeHtml(cat.name)}</option>`).join("")}
          </select>
          <button class="primary-btn" data-action="applyBulkCategory" type="button" ${selectedCount ? "" : "disabled"}>선택 항목 분류 적용</button>
          <button class="ghost-btn" data-action="cancelBulkCategoryMode" type="button">닫기</button>
        </div>
      `;
    }

    const selectedIds = new Set(ui.selectedBulkDeleteIds || []);
    const visibleIds = pageItems.map((item) => item.id);
    const visibleSelectedCount = visibleIds.filter((id) => selectedIds.has(id)).length;
    const allVisibleSelected = visibleIds.length > 0 && visibleSelectedCount === visibleIds.length;
    const selectedCount = selectedIds.size;
    return `
      <div class="bulk-delete-controls" aria-live="polite">
        <strong class="bulk-delete-title">삭제 선택 모드</strong>
        <span class="bulk-delete-count">선택 ${selectedCount}개</span>
        <button class="ghost-btn" data-action="bulkSelectVisible" type="button" ${visibleIds.length ? "" : "disabled"}>${allVisibleSelected ? "표시 항목 선택 해제" : "표시 항목 전체 선택"}</button>
        <button class="ghost-btn" data-action="clearBulkDeleteSelection" type="button" ${selectedCount ? "" : "disabled"}>선택 해제</button>
        <button class="danger-btn" data-action="confirmBulkDelete" type="button" ${selectedCount ? "" : "disabled"}>삭제 확인</button>
        <button class="ghost-btn" data-action="cancelBulkDeleteMode" type="button">취소</button>
      </div>
    `;
  }

  function renderGalleryLoadMore(hasMore, shownCount, totalCount) {
    if (!totalCount) return "";
    if (ui.galleryLoading) {
      return `
        <div class="infinite-loader" aria-live="polite">
          <span class="loader-ring" aria-hidden="true"></span>
          <span>${shownCount}/${totalCount} 불러오는 중</span>
        </div>
      `;
    }
    if (hasMore) {
      return `<div class="infinite-loader subtle" aria-live="polite">${shownCount}/${totalCount} 표시 중, 아래로 더 스크롤하면 다음 묶음을 불러옵니다.</div>`;
    }
    return `<div class="infinite-loader subtle" aria-live="polite">전체 ${totalCount}개를 모두 표시했습니다.</div>`;
  }

  function renderAlbumFilters(resultCount) {
    const filterCount = activeGalleryFilterCount();
    return `
      <div class="album-filter-bar surface-card">
        <div class="gallery-control-primary">
          <div class="gallery-result-summary" aria-live="polite">
            <strong>${resultCount}개</strong>
            <span>전체 ${state.items.length}개${filterCount ? ` 중 필터 ${filterCount}개 적용` : ""}</span>
          </div>
          <div class="gallery-control-actions">
            <label class="compact-field"><span>정렬</span><select class="select compact-select" id="sortSelect">
              <option value="latest" ${ui.sort === "latest" ? "selected" : ""}>최신순</option>
              <option value="oldest" ${ui.sort === "oldest" ? "selected" : ""}>오래된순</option>
              <option value="favorite" ${ui.sort === "favorite" ? "selected" : ""}>즐겨찾기순</option>
              <option value="similarity" ${ui.sort === "similarity" ? "selected" : ""}>유사순</option>
              <option value="failed" ${ui.sort === "failed" ? "selected" : ""}>분석 실패순</option>
              <option value="modified" ${ui.sort === "modified" ? "selected" : ""}>수정일순</option>
            </select></label>
            <label class="compact-field"><span>분석</span><select class="select compact-select" id="statusFilterSelect">
              <option value="all" ${ui.status === "all" ? "selected" : ""}>전체 상태</option>
              <option value="analyzed" ${ui.status === "analyzed" ? "selected" : ""}>분석 완료</option>
              <option value="uploaded" ${ui.status === "uploaded" ? "selected" : ""}>분석 대기</option>
              <option value="analyzing" ${ui.status === "analyzing" ? "selected" : ""}>분석 중</option>
              <option value="analysis_failed" ${ui.status === "analysis_failed" ? "selected" : ""}>분석 실패</option>
              <option value="modified" ${ui.status === "modified" ? "selected" : ""}>수정됨</option>
            </select></label>
            <label class="compact-field"><span>프롬프트</span><select class="select compact-select" id="originFilterSelect">
              <option value="all" ${ui.originFilter === "all" ? "selected" : ""}>전체</option>
              <option value="original" ${ui.originFilter === "original" ? "selected" : ""}>원본</option>
              <option value="modified" ${ui.originFilter === "modified" ? "selected" : ""}>수정됨</option>
            </select></label>
            <button class="pill-toggle ${ui.favoriteOnly ? "active" : ""}" data-action="toggleFavoriteFilter" type="button" aria-pressed="${ui.favoriteOnly}">★ 즐겨찾기</button>
            <button class="pill-toggle ${ui.showDuplicatesOnly ? "active" : ""}" data-action="toggleDuplicatesFilter" type="button" aria-pressed="${ui.showDuplicatesOnly}" data-tooltip="의상·배경 프롬프트가 같은 항목만 보기">중복</button>
            <button class="ghost-btn reset-filter-btn" data-action="resetGalleryFilters" type="button" ${filterCount ? "" : "disabled"}>필터 초기화</button>
          </div>
        </div>
        ${ui.sort === "similarity" ? `
          <div class="similarity-sort-note" role="status">
            <span aria-hidden="true">≈</span>
            <p><strong>의상·배경이 닮은 짝 기준</strong> 제목·태그·외모·포즈·디테일은 제외하고 의상 50% + 배경 50%로 비교합니다. 100%는 두 문단이 모두 같은 항목이며 서로 붙여서 표시합니다.</p>
          </div>
        ` : ""}
        <div class="album-filter-summary">
          <div class="filter-section">
            <span class="filter-section-label">보기</span>
            <div class="category-tabs segmented-tabs">
              ${filterGroupButton("all", "전체")}
              ${filterGroupButton("outfit", "복장")}
              ${filterGroupButton("background", "배경")}
            </div>
          </div>
          <div class="filter-section filter-section-grow">
            <span class="filter-section-label">카테고리</span>
            <div class="category-tabs album-category-tabs">
              ${categoryFilterButton("all", "전체", "slate")}
              ${state.categories.map((category) => categoryFilterButton(category.id, category.name, category.color)).join("")}
            </div>
          </div>
        </div>
        <div class="subcategory-filter-stack">
          ${renderTagFilter("outfit", state.outfitTagOptions, ui.selectedOutfitTags)}
          ${renderTagFilter("background", state.backgroundTagOptions, ui.selectedBackgroundTags)}
        </div>
      </div>
    `;
  }

  function filterGroupButton(group, label) {
    return `<button class="chip-btn ${ui.filterGroup === group ? "active" : ""}" data-filter-group="${group}" type="button" aria-pressed="${ui.filterGroup === group}">${label}</button>`;
  }

  function categoryFilterButton(id, label, color) {
    const active = ui.category === id;
    return `<button class="chip-btn category-filter-chip category-${escapeHtml(color || "blue")} ${active ? "active" : ""}" data-category-filter="${escapeHtml(id)}" type="button" aria-pressed="${active}">${escapeHtml(label)}</button>`;
  }

  function renderTagFilter(type, options, selected) {
    if (ui.filterGroup !== "all" && ui.filterGroup !== type) return "";
    const label = type === "outfit" ? "복장" : "배경";
    return `
      <div class="subcategory-filter-row ${type === "outfit" ? "outfit-row" : "background-row"}">
        <button class="chip-btn filter-row-label ${ui.filterGroup === type ? "active" : ""}" data-filter-group="${type}" type="button">${label}</button>
        <div class="tag-filter-row">
        ${options.filter((tag) => tag.enabled !== false).map((tag) => `<button class="chip-btn ${selected.includes(tag.key) ? "active" : ""}" data-tag-filter="${type}" data-key="${tag.key}" type="button" aria-pressed="${selected.includes(tag.key)}">${escapeHtml(tag.name)}</button>`).join("")}
        </div>
      </div>
    `;
  }

  function renderPagination(pageCount) {
    const pages = Array.from({ length: pageCount }, (_, index) => index + 1);
    return `
      <nav class="pagination" aria-label="페이지 이동">
        <button class="tiny-btn" data-page="first" type="button" ${ui.page === 1 ? "disabled" : ""}>처음</button>
        <button class="tiny-btn" data-page="prev" type="button" ${ui.page === 1 ? "disabled" : ""}>이전</button>
        ${pages.map((page) => `<button class="tiny-btn ${ui.page === page ? "active-page" : ""}" data-page="${page}" type="button" aria-label="${page}페이지" ${ui.page === page ? 'aria-current="page"' : ""}>${page}</button>`).join("")}
        <button class="tiny-btn" data-page="next" type="button" ${ui.page === pageCount ? "disabled" : ""}>다음</button>
        <button class="tiny-btn" data-page="last" type="button" ${ui.page === pageCount ? "disabled" : ""}>마지막</button>
      </nav>
    `;
  }

  function renderImageCard(item, duplicateIds) {
    const title = displayTitle(item);
    const itemId = escapeHtml(normalizeReferenceIdentifier(item.id));
    const imageSource = escapeHtml(safeImageSource(item.thumbnailUrl || item.imageUrl));
    const selectedForDelete = (ui.selectedBulkDeleteIds || []).includes(item.id);
    const selectedForCategory = (ui.selectedBulkCategoryIds || []).includes(item.id);
    ensurePromptBaseline(item);
    syncPromptEditState(item);
    const placeTags = tagNames(item.backgroundTags, "background").filter((name) => name && name !== "기타").slice(0, 2);
    const outfitTagsShown = tagNames(item.outfitTags, "outfit").filter((name) => name && name !== "기타").slice(0, 1);
    const isDup = duplicateIds.has(item.id);
    const similarity = ui.sort === "similarity" ? gallerySimilarityById.get(item.id) : null;
    const similarItem = similarity?.matchId ? findItem(similarity.matchId) : null;
    const similarTitle = similarItem ? displayTitle(similarItem) : "";
    const originClass = item.promptEditState === "modified" ? "is-modified" : item.promptEditState === "original" ? "is-original" : "";
    const showMeta = state.albumSettings.showTags !== false || state.albumSettings.showStatus !== false;
    const cardStateLabel = item.status === "analysis_failed"
      ? statusLabel(item.status)
      : item.promptJson ? (item.promptEditState === "modified" ? "수정됨" : "원본") : statusLabel(item.status);
    return `
      <article class="panel image-card ${ui.bulkDeleteMode ? "bulk-delete-mode" : ""} ${ui.bulkCategoryMode ? "bulk-category-mode" : ""} ${selectedForDelete || selectedForCategory ? "selected-for-delete" : ""} ${isDup ? "is-duplicate" : ""} ${originClass}" data-open-item="${itemId}" tabindex="0" role="button" aria-label="${escapeHtml(`${title} 열기`)}">
        <div class="thumb">
          <img src="${imageSource}" alt="${escapeHtml(title)}" loading="lazy">
          ${ui.bulkDeleteMode ? `
            <label class="bulk-delete-check" aria-label="삭제할 게시물 선택">
              <input class="bulk-delete-checkbox" data-action="bulkToggleItem" data-bulk-delete-id="${itemId}" type="checkbox" ${selectedForDelete ? "checked" : ""}>
              <span>삭제 선택</span>
            </label>
          ` : ui.bulkCategoryMode ? `
            <label class="bulk-delete-check" aria-label="분류할 게시물 선택">
              <input class="bulk-delete-checkbox" data-action="bulkCategoryToggleItem" data-bulk-category-id="${itemId}" type="checkbox" ${selectedForCategory ? "checked" : ""}>
              <span>분류 선택</span>
            </label>
          ` : (state.albumSettings.showFavorite !== false ? `<button class="favorite-toggle ${item.isFavorite ? "active" : ""}" data-action="favorite" data-id="${itemId}" type="button" aria-label="${item.isFavorite ? "즐겨찾기 해제" : "즐겨찾기"}" aria-pressed="${item.isFavorite}">${item.isFavorite ? "★" : "☆"}</button>` : "")}
          ${isDup ? `<span class="card-badge dup-badge">중복</span>` : ""}
          ${state.albumSettings.showStatus !== false && item.promptEditState === "modified" ? `<span class="card-badge edit-badge">수정</span>` : ""}
        </div>
        <div class="card-body">
          ${state.albumSettings.showTitle !== false ? `<h3 class="card-title">${escapeHtml(title)}</h3>` : ""}
          ${similarity ? `
            <div class="card-similarity" title="${escapeHtml(similarTitle ? `가장 유사: ${similarTitle}` : "비교할 다른 프롬프트가 없습니다.")}">
              <strong>${similarItem ? `유사 ${similarity.score}%` : "비교 대상 없음"}</strong>
              ${similarItem ? `<span>${escapeHtml(similarTitle)}</span>` : ""}
            </div>
          ` : ""}
          ${showMeta ? `
            <div class="card-meta">
              ${state.albumSettings.showTags !== false ? [...placeTags, ...outfitTagsShown].map((name) => `<span class="card-chip">${escapeHtml(name)}</span>`).join("") : ""}
              ${state.albumSettings.showStatus !== false ? `<span class="card-chip subtle">${escapeHtml(cardStateLabel)}</span>` : ""}
            </div>
          ` : ""}
        </div>
      </article>
    `;
  }

  function displayTitle(item) {
    const title = String(item?.title || "").trim();
    if (isUsableAlbumTitle(title)) return title;
    const summary = String(item?.titleSummary || "").trim();
    if (isUsableAlbumTitle(summary)) return summary;
    return compactImageTitle(item);
  }

  function looksLikeFileTitle(value) {
    const text = String(value || "").trim();
    const base = text.replace(/\.(jpe?g|png|webp|gif|bmp|avif)$/i, "");
    return /^[a-f0-9]{16,}$/i.test(base) || /^[a-z0-9_-]{24,}$/i.test(base);
  }

  function looksLikeEnglishPromptSnippet(value) {
    const text = String(value || "").trim();
    if (!text) return false;
    const hangul = (text.match(/[가-힣]/g) || []).length;
    const latin = (text.match(/[a-zA-Z]/g) || []).length;
    if (hangul >= 4 && hangul >= latin) return false;
    if (latin < 8) return false;
    return /^(adult|beautiful|young|korean|woman|girl|wearing|standing|sitting|close-?up|portrait)\b/i.test(text)
      || (latin > hangul * 2 && text.split(/\s+/).length >= 4);
  }

  function isUsableAlbumTitle(value) {
    const text = String(value || "").trim();
    if (!text || looksLikeFileTitle(text)) return false;
    if (looksLikeEnglishPromptSnippet(text)) return false;
    return true;
  }

  function isKoreanTitleSummary(value) {
    const text = String(value || "").trim();
    if (!text || looksLikeFileTitle(text) || looksLikeEnglishPromptSnippet(text)) return false;
    const hangul = (text.match(/[가-힣]/g) || []).length;
    const latin = (text.match(/[a-zA-Z]/g) || []).length;
    return hangul >= 4 && hangul >= latin;
  }

  function compactImageTitle(item) {
    if (!item?.promptJson) return "분석 대기 이미지";
    // Local fallback mirrors title-summary priority: hair · outfit · accessory/bag · background.
    // Never lead with skin/tone/snap/lighting/woman wording.
    const appearanceText = sectionJoin(item, "appearance");
    const outfitText = sectionJoin(item, "outfit");
    const backgroundText = sectionJoin(item, "background");
    const detailsText = sectionJoin(item, "details");
    const poseText = sectionJoin(item, "expression_pose");
    const parts = uniqueCompact([
      ...extractTitlePhrases(appearanceText, "hair").slice(0, 1),
      ...extractTitlePhrases(outfitText, "outfit").slice(0, 2),
      ...extractTitlePhrases(`${detailsText} ${outfitText} ${poseText}`, "accessory").slice(0, 2),
      ...tagNames(item.backgroundTags, "background").filter((name) => name && name !== "기타").slice(0, 1),
      ...extractTitlePhrases(backgroundText, "background").slice(0, 1),
      ...tagNames(item.outfitTags, "outfit").filter((name) => name && name !== "기타").slice(0, 1),
    ]).slice(0, 6);
    return parts.join(" ") || "분석된 이미지";
  }

  function sectionJoin(item, key) {
    return (item.promptJson?.[key]?.sentences || [])
      .map((sentence) => [sentence.ko, sentence.en].filter(Boolean).join(" "))
      .filter(Boolean)
      .join(" ");
  }

  function extractTitlePhrases(text, type) {
    const source = String(text || "").toLowerCase();
    const phrases = [];
    const rules = type === "outfit" ? [
      [/민소매|sleeveless/, "민소매"],
      [/크롭|crop\s*top/, "크롭탑"],
      [/원피스|dress/, "원피스"],
      [/교복|uniform/, "교복"],
      [/니트|knit/, "니트"],
      [/스커트|skirt/, "스커트"],
      [/청치마|denim\s*skirt/, "청치마"],
      [/청바지|jeans?/, "청바지"],
      [/자켓|jacket|blazer/, "자켓"],
      [/코트|coat/, "코트"],
      [/부츠|boots?/, "부츠"],
      [/힐|heels?/, "힐"],
      [/화이트|white/, "화이트"],
      [/블랙|black/, "블랙"],
      [/핑크|pink/, "핑크"],
    ] : type === "hair" ? [
      [/포니테일|pony\s*tail|ponytail/, "포니테일"],
      [/단발|bob\b|short hair/, "단발"],
      [/장발|long hair|long straight/, "장발"],
      [/웨이브|wavy|wave/, "웨이브"],
      [/업스타일|updo|bun\b/, "업스타일"],
      [/뱅|bangs|fringe/, "뱅"],
      [/땋|braid/, "브레이드"],
    ] : type === "accessory" ? [
      [/캐리어|suitcase|luggage|carry-?on/, "캐리어"],
      [/숄더백|shoulder\s*bag/, "숄더백"],
      [/토트백|tote/, "토트백"],
      [/클러치|clutch/, "클러치"],
      [/백팩|backpack/, "백팩"],
      [/가방|handbag|purse|bag\b/, "가방"],
      [/선글라스|sunglasses/, "선글라스"],
      [/목걸이|necklace/, "목걸이"],
      [/귀걸이|earring/, "귀걸이"],
      [/이어폰|earphone|earbuds?|airpods?/, "이어폰"],
      [/폰|smartphone|phone\b|핸드폰/, "폰"],
      [/모자|hat\b|cap\b|beanie/, "모자"],
      [/시계|watch\b/, "시계"],
    ] : type === "background" ? [
      [/호텔|hotel/, "호텔"],
      [/복도|hallway|corridor/, "복도"],
      [/카페|cafe|café/, "카페"],
      [/거리|street|city street/, "거리"],
      [/침실|bedroom/, "침실"],
      [/엘리베이터|elevator|lift\b/, "엘리베이터"],
      [/공항|airport/, "공항"],
      [/실내|indoor|interior/, "실내"],
      [/야외|outdoor/, "야외"],
      [/창가|window/, "창가"],
      [/스튜디오|studio/, "스튜디오"],
    ] : [];
    rules.forEach(([pattern, label]) => {
      if (pattern.test(source)) phrases.push(label);
    });
    return uniqueCompact(phrases);
  }

  function uniqueCompact(values) {
    return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
  }

  function renderEmptyGallery() {
    const libraryIsEmpty = state.items.length === 0;
    return `
      <div class="panel empty-state">
        <div>
          <h2>${libraryIsEmpty ? "첫 이미지를 추가해 보세요." : "조건에 맞는 결과가 없습니다."}</h2>
          <p>${libraryIsEmpty ? "이미지를 업로드하면 썸네일, 프롬프트, 태그를 한곳에서 관리할 수 있습니다." : "검색어나 적용된 필터를 초기화하면 전체 아카이브로 돌아갑니다."}</p>
          <div class="empty-state-actions">
            ${libraryIsEmpty ? "" : `<button class="ghost-btn" data-action="resetGalleryFilters" type="button">검색과 필터 초기화</button>`}
            <button class="primary-btn" data-action="upload" type="button">이미지 업로드</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderUpload() {
    const uploadExcludeKeys = lastUploadExcludeKeys();
    const exifMode = isExifPromptMode();
    return `
      <div class="page-head">
        <div>
          <h2 class="page-title">업로드</h2>
          <p class="page-copy">${exifMode ? "EXIF / 메타데이터 프롬프트를 읽어 저장합니다." : "파일 선택 후 요청·제외를 확인하고 저장 및 분석합니다."}</p>
        </div>
      </div>
      <section class="panel" style="padding: var(--space-4);">
        <div class="optimization-summary">
          <strong>프롬프트 입력 방식</strong>
          <span>${exifMode ? "EXIF 프롬프트 읽기" : "API 이미지 분석"}</span>
          ${exifMode ? `<span>${state.uploadSettings.translateExifPrompt ? "한국어 자동 번역" : "번역 안 함"}</span>` : ""}
        </div>
        ${exifMode ? `<p class="notice upload-mode-notice">메타데이터에서 5문단을 찾지 못한 파일은 빨간색으로 표시됩니다.</p>` : ""}
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
            <p>jpg, jpeg, png, webp${state.uploadSettings.allowClipboardPaste ? " · 클립보드 붙여넣기" : ""}</p>
            <input class="sr-only" id="fileInput" type="file" accept="image/jpeg,image/png,image/webp" multiple>
            <button class="primary-btn" id="pickFiles" type="button">파일 선택</button>
          </div>
        </div>
        ${renderPendingUploadFiles()}
        <div class="form-grid" style="margin-top: var(--space-4);">
          <div class="field">
            <label for="uploadTitle">공통 제목</label>
            <input class="input" id="uploadTitle" value="${escapeHtml(ui.uploadDraft.title)}" placeholder="예: 푸른 교복 캐릭터">
          </div>
          <div class="field">
            <label for="uploadCategory">카테고리</label>
            <select class="select" id="uploadCategory">${state.categories.map((cat) => `<option value="${escapeHtml(normalizeReferenceIdentifier(cat.id))}" ${ui.uploadDraft.categoryId === cat.id ? "selected" : ""}>${escapeHtml(cat.name)}</option>`).join("")}</select>
          </div>
        </div>
        <div class="analysis-options">
          <div class="field">
            <label for="uploadCustomInstruction">이 이미지에만 적용할 추가 요청사항</label>
            <textarea class="textarea" id="uploadCustomInstruction" placeholder="뒷 유리 그림은 프롬프트에 포함하지 말 것">${escapeHtml(ui.uploadDraft.customInstruction)}</textarea>
          </div>
          <fieldset class="option-fieldset">
            <legend>프롬프트에서 제외할 요소</legend>
            <div class="option-grid">
              ${enabledExcludeOptions().map((option) => renderExcludeCheckbox(option, uploadExcludeKeys.includes(option.key), "uploadExclude")).join("")}
            </div>
          </fieldset>
        </div>
        <div class="upload-action-row">
          <div class="toolbar">
          <button class="ghost-btn" data-action="removeSelectedPendingUploads" type="button" ${ui.selectedPendingUploadKeys.length && !ui.uploadProgress ? "" : "disabled"}>선택 지우기</button>
          <button class="ghost-btn" data-action="clearUploadWorkspace" type="button" ${(ui.pendingUploadFiles.length || ui.uploadQueue.length) && !ui.uploadProgress ? "" : "disabled"}>비우기</button>
          <button class="primary-btn" data-action="saveAndAnalyzeUploads" type="button" ${ui.pendingUploadFiles.length && !ui.uploadProgress ? "" : "disabled"}>${ui.uploadProgress ? "처리 중" : exifMode ? "EXIF 읽고 저장" : "저장 및 분석"}</button>
          </div>
          ${renderUploadProgress()}
        </div>
        <div id="queueList" class="queue-list">${renderQueue()}</div>
      </section>
    `;
  }

  function showToast(message, tone = "info", duration = 1900) {
    clearTimeout(toastTimer);
    let layer = document.getElementById("toastLayer");
    if (!layer) {
      layer = document.createElement("div");
      layer.id = "toastLayer";
      layer.className = "toast-layer";
      layer.setAttribute("role", "status");
      layer.setAttribute("aria-live", "polite");
      document.body.appendChild(layer);
    }
    const safeTone = ["info", "success", "warning"].includes(tone) ? tone : "info";
    layer.innerHTML = `<div class="toast-message ${safeTone}">${escapeHtml(message)}</div>`;
    toastTimer = setTimeout(() => {
      layer.innerHTML = "";
    }, duration);
  }

  function lastUploadExcludeKeys() {
    const keys = Array.isArray(state.uploadSettings.lastExcludeOptions) ? state.uploadSettings.lastExcludeOptions : [];
    return keys.length ? keys : defaultExcludedKeys();
  }

  function isExifPromptMode() {
    return state.uploadSettings.promptSourceMode === "exif";
  }

  function renderPendingUploadFiles() {
    if (!ui.pendingUploadFiles.length) return "";
    return `
      <div class="pending-preview-grid" aria-label="선택한 업로드 파일 미리보기">
        ${ui.pendingUploadFiles.map((file) => {
          const key = pendingUploadKey(file);
          const selected = ui.selectedPendingUploadKeys.includes(key);
          const error = ui.pendingUploadErrors?.[key] || "";
          return `
          <button class="pending-preview-card ${selected ? "selected" : ""} ${error ? "invalid" : ""}" data-action="togglePendingUpload" data-key="${escapeHtml(key)}" type="button" aria-pressed="${selected ? "true" : "false"}">
            <img src="${escapeHtml(pendingUploadPreviewUrl(file))}" alt="${escapeHtml(file.name)}">
            <strong>${escapeHtml(file.name)}</strong>
            <span>${formatBytes(file.size)}</span>
            ${error ? `<em class="pending-error">${escapeHtml(error)}</em>` : ""}
          </button>
        `; }).join("")}
      </div>
    `;
  }

  function renderUploadProgress() {
    if (!ui.uploadProgress) return "";
    return `<div class="upload-progress-pill" aria-live="polite">${ui.uploadProgress.done}/${ui.uploadProgress.total}</div>`;
  }

  function pendingUploadKey(file) {
    return `${file.name}:${file.size}:${file.lastModified}`;
  }

  function pendingUploadPreviewUrl(file) {
    if (!uploadPreviewUrls.has(file)) uploadPreviewUrls.set(file, URL.createObjectURL(file));
    return uploadPreviewUrls.get(file);
  }

  function revokePendingUploadUrls(files) {
    files.forEach((file) => {
      const url = uploadPreviewUrls.get(file);
      if (url) URL.revokeObjectURL(url);
      uploadPreviewUrls.delete(file);
    });
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
        ${entry.url ? `<img src="${escapeHtml(safeImageSource(entry.url))}" alt="${escapeHtml(entry.name)}">` : `<div class="queue-fallback" aria-hidden="true">!</div>`}
        <div>
          <strong>${escapeHtml(entry.name)}</strong>
          <div class="meta-line">
            <span>${escapeHtml(entry.status)}</span>
            ${entry.originalSize ? `<span>원본 ${formatBytes(entry.originalSize)}</span>` : ""}
            ${entry.optimizedSize ? `<span>최적화 ${formatBytes(entry.optimizedSize)}</span>` : ""}
          </div>
          ${entry.error ? `<p class="queue-error">${escapeHtml(entry.error)}</p>` : ""}
        </div>
        ${entry.itemId ? `<button class="tiny-btn" data-action="openUploaded" data-id="${escapeHtml(normalizeReferenceIdentifier(entry.itemId))}" type="button">열기</button>` : ""}
      </article>
    `).join("");
  }

  function renderDetail() {
    const item = selectedItem();
    if (!item) {
      ui.view = "gallery";
      return renderGallery();
    }
    const title = displayTitle(item);
    const itemId = escapeHtml(normalizeReferenceIdentifier(item.id));
    const imageSource = escapeHtml(safeImageSource(item.imageUrl));
    const exifMode = isExifPromptMode();
    const analyzeLabel = item.promptJson ? "재분석" : "수동 분석";
    const canRestore = Boolean(item.promptBaselineJson && item.promptEditState === "modified");
    return `
      <div class="page-head">
        <div>
          <h2 class="page-title">${escapeHtml(title)}</h2>
          <p class="page-copy">${escapeHtml(item.memo || "")}</p>
        </div>
        <div class="toolbar detail-primary-actions">
          <button class="ghost-btn" data-view="gallery" type="button">갤러리</button>
          <button class="primary-btn" data-action="analyzeOne" data-id="${itemId}" type="button" ${exifMode ? "disabled" : ""}>${analyzeLabel}</button>
          <button class="ghost-btn" data-action="reloadExif" data-id="${itemId}" type="button" ${exifMode ? "" : "disabled"}>EXIF 원본 불러오기</button>
        </div>
      </div>
      <div class="detail-grid">
        <section class="panel detail-media">
          <img src="${imageSource}" alt="${escapeHtml(title)}">
          <div class="detail-meta">
            <div class="form-grid">
              <div class="field">
                <label for="detailTitle">제목</label>
                <div class="inline-field-row">
                  <input class="input" id="detailTitle" value="${escapeHtml(title)}">
                  <button class="tiny-btn" data-action="retitleOne" data-id="${itemId}" type="button" ${item.promptJson ? "" : "disabled"}>제목 요약</button>
                </div>
              </div>
              <div class="field">
                <label for="detailCategory">카테고리</label>
                <select class="select" id="detailCategory">
                  ${state.categories.map((cat) => `<option value="${escapeHtml(normalizeReferenceIdentifier(cat.id))}" ${item.categoryId === cat.id ? "selected" : ""}>${escapeHtml(cat.name)}</option>`).join("")}
                </select>
              </div>
            </div>
            <div class="field">
              <label>복장 태그</label>
              ${renderDetailTagChips(item, "outfit")}
            </div>
            <div class="field">
              <label>장소 태그</label>
              ${renderDetailTagChips(item, "background")}
            </div>
            <div class="toolbar" style="margin:0 0 var(--space-2)">
              <button class="tiny-btn" data-action="retagOne" data-id="${itemId}" type="button" ${item.promptJson ? "" : "disabled"}>태그 재추론</button>
            </div>
            <div class="field">
              <label for="detailMemo">메모</label>
              <textarea class="textarea" id="detailMemo">${escapeHtml(item.memo || "")}</textarea>
            </div>
            <div class="field">
              <label for="detailCustomInstruction">추가 요청사항</label>
              <textarea class="textarea" id="detailCustomInstruction" placeholder="예: 안경 제거, 배경을 카페로">${escapeHtml(item.customInstruction || "")}</textarea>
            </div>
            <fieldset class="option-fieldset">
              <legend>제외할 요소</legend>
              <div class="option-grid">
                ${enabledExcludeOptions().map((option) => renderExcludeCheckbox(option, item.excludeOptions?.includes(option.key), "detailExclude")).join("")}
              </div>
            </fieldset>
            <div class="option-grid revise-options">
              <label class="option-item"><input id="reviseAlsoRetag" type="checkbox" ${ui.reviseAlsoRetag ? "checked" : ""}><span>수정 후 태그 재추론</span></label>
              <label class="option-item"><input id="reviseAlsoRetitle" type="checkbox" ${ui.reviseAlsoRetitle ? "checked" : ""}><span>수정 후 제목 재요약</span></label>
            </div>
            ${renderPromptOriginStatus(item)}
            <div class="toolbar detail-action-group">
              <button class="primary-btn" data-action="saveDetail" data-id="${itemId}" type="button">저장</button>
              <button class="ghost-btn" data-action="revisePrompt" data-id="${itemId}" type="button" ${item.promptJson ? "" : "disabled"}>프롬프트 수정</button>
              <button class="ghost-btn" data-action="restoreBaseline" data-id="${itemId}" type="button" ${canRestore ? "" : "disabled"}>원본 되돌리기</button>
              <button class="danger-btn" data-action="deleteItem" data-id="${itemId}" type="button">삭제</button>
            </div>
            ${renderVersionHistory(item)}
            ${item.uploadMeta ? renderAssetSummary(item) : ""}
            ${item.errorMessage ? `<p class="notice">${escapeHtml(item.errorMessage)}</p>` : ""}
          </div>
        </section>
        <section class="panel prompt-panel">
          ${renderPromptTools(item)}
          ${ui.promptCompareMode && item.promptBaselineJson ? renderPromptCompare(item) : ""}
          ${item.promptJson ? renderPromptColumns(item) : renderNoPrompt(item)}
        </section>
      </div>
    `;
  }

  function renderDetailTagChips(item, type) {
    const selected = new Set(type === "outfit" ? (item.outfitTags || []) : (item.backgroundTags || []));
    const options = tagOptions(type).filter((tag) => tag.enabled !== false);
    const itemId = escapeHtml(normalizeReferenceIdentifier(item.id));
    return `
      <div class="detail-tag-chips" data-tag-type="${type}">
        ${options.map((tag) => `
          <button class="chip-btn ${selected.has(tag.key) ? "active" : ""}" data-action="toggleDetailTag" data-type="${type}" data-key="${escapeHtml(normalizeReferenceIdentifier(tag.key))}" data-id="${itemId}" type="button" aria-pressed="${selected.has(tag.key)}">${escapeHtml(tag.name)}</button>
        `).join("")}
      </div>
    `;
  }

  function renderVersionHistory(item) {
    const versions = Array.isArray(item.versions) ? item.versions.slice(0, 8) : [];
    if (!versions.length) return "";
    return `
      <details class="version-history">
        <summary>이전 버전 ${versions.length}개</summary>
        <div class="version-list">
          ${versions.map((version, index) => `
            <div class="version-row">
              <span>${new Date(version.createdAt || Date.now()).toLocaleString()}</span>
              <button class="tiny-btn" data-action="restoreVersion" data-id="${escapeHtml(normalizeReferenceIdentifier(item.id))}" data-index="${index}" type="button">복원</button>
            </div>
          `).join("")}
        </div>
      </details>
    `;
  }

  function renderPromptCompare(item) {
    const baseline = item.promptBaselineJson || {};
    const current = item.promptJson || {};
    const rows = sectionMeta.map((section) => {
      const baseText = (baseline[section.key]?.sentences || []).map((s) => s.en || "").join("\n");
      const curText = (current[section.key]?.sentences || []).map((s) => s.en || "").join("\n");
      const changed = baseText.trim() !== curText.trim();
      return `
        <div class="compare-section ${changed ? "changed" : ""}">
          <h4>${escapeHtml(section.labelEn)} ${changed ? "· 변경" : ""}</h4>
          <div class="compare-grid">
            <pre class="compare-col">${escapeHtml(baseText || "(없음)")}</pre>
            <pre class="compare-col">${escapeHtml(curText || "(없음)")}</pre>
          </div>
        </div>
      `;
    }).join("");
    return `
      <div class="prompt-compare-panel">
        <div class="prompt-compare-head">
          <strong>원본 vs 현재 (English)</strong>
          <button class="tiny-btn" data-action="togglePromptCompare" type="button">비교 닫기</button>
        </div>
        ${rows}
      </div>
    `;
  }

  function renderPromptOriginStatus(item) {
    ensurePromptBaseline(item);
    syncPromptEditState(item);
    if (!item.promptJson) {
      return `
        <div class="prompt-origin-status is-empty">
          <span class="status-pill">프롬프트 없음</span>
          <p class="field-help">아직 저장된 프롬프트가 없습니다.</p>
        </div>
      `;
    }
    const isOriginal = item.promptEditState === "original";
    const sourceLabel = promptBaselineSourceLabel(item.promptBaselineSource || guessPromptBaselineSource(item));
    const actionLabel = promptEditActionLabel(item.promptEditAction);
    const mainLabel = isOriginal ? "원본 프롬프트" : "수정된 프롬프트";
    const detail = isOriginal
      ? `출처: ${sourceLabel}. EXIF 불러오기 또는 이미지 분석 직후 상태와 같습니다.`
      : `원본 출처: ${sourceLabel}${actionLabel ? ` · 변경 방식: ${actionLabel}` : ""}. 수동 편집, 프롬프트 수정, 섹션 재생성 등으로 원본과 달라졌습니다.`;
    return `
      <div class="prompt-origin-status ${isOriginal ? "is-original" : "is-modified"}">
        <div class="prompt-origin-head">
          <span class="status-pill">${escapeHtml(mainLabel)}</span>
          <span class="meta-line">${escapeHtml(sourceLabel)}${!isOriginal && actionLabel ? ` · ${escapeHtml(actionLabel)}` : ""}</span>
        </div>
        <p class="field-help">${escapeHtml(detail)}</p>
      </div>
    `;
  }

  function promptBaselineSourceLabel(source) {
    if (source === "exif") return "EXIF / 메타데이터";
    if (source === "analysis") return "이미지 분석";
    return "출처 미상";
  }

  function promptEditActionLabel(action) {
    if (action === "api_revise") return "API 프롬프트 수정";
    if (action === "manual") return "수동 편집";
    if (action === "section") return "섹션 재생성";
    if (action === "translate") return "번역 반영";
    return "";
  }

  function guessPromptBaselineSource(item) {
    if (item.uploadMeta?.promptSourceMode === "exif" || item.uploadMeta?.exifPromptFound) return "exif";
    if (item.analysisRequest && /EXIF/i.test(item.analysisRequest)) return "exif";
    if (item.analysisRequest) return "analysis";
    return "";
  }

  function promptFingerprint(promptJson) {
    const parts = [];
    sectionMeta.forEach((section) => {
      const sentences = promptJson?.[section.key]?.sentences || [];
      sentences.forEach((sentence) => {
        parts.push([
          sentence.id || "",
          String(sentence.en || "").trim(),
          String(sentence.ko || "").trim(),
        ].join("\n"));
      });
    });
    return simpleStringHash(parts.join("\n---\n"));
  }

  function simpleStringHash(value) {
    const text = String(value || "");
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  }

  function clonePromptJson(promptJson) {
    try {
      return structuredClone(promptJson);
    } catch (_error) {
      return JSON.parse(JSON.stringify(promptJson || null));
    }
  }

  function ensurePromptBaseline(item) {
    if (!item?.promptJson) return;
    if (item.promptBaselineFingerprint) {
      if (!item.promptBaselineJson && item.promptEditState !== "modified") {
        item.promptBaselineJson = clonePromptJson(item.promptJson);
      }
      return;
    }
    item.promptBaselineSource = item.promptBaselineSource || guessPromptBaselineSource(item) || "analysis";
    item.promptBaselineFingerprint = promptFingerprint(item.promptJson);
    item.promptBaselineJson = clonePromptJson(item.promptJson);
    item.promptEditState = "original";
    item.promptEditAction = "";
  }

  function markPromptBaseline(item, source) {
    if (!item?.promptJson) return;
    item.promptBaselineSource = source || guessPromptBaselineSource(item) || "analysis";
    item.promptBaselineFingerprint = promptFingerprint(item.promptJson);
    item.promptBaselineJson = clonePromptJson(item.promptJson);
    item.promptEditState = "original";
    item.promptEditAction = "";
  }

  function migrateAllPromptBaselines() {
    let changed = false;
    (state.items || []).forEach((item) => {
      if (!item?.promptJson) return;
      const before = item.promptBaselineFingerprint || "";
      const hadSnapshot = Boolean(item.promptBaselineJson);
      ensurePromptBaseline(item);
      syncPromptEditState(item);
      if ((item.promptBaselineFingerprint || "") !== before || (!hadSnapshot && item.promptBaselineJson)) changed = true;
    });
    if (changed && serverBootComplete) saveItemsState();
  }

  function restorePromptBaseline(item) {
    if (!item?.promptBaselineJson) {
      throw new Error("저장된 원본 프롬프트 스냅샷이 없습니다.");
    }
    applyPrompt(item, clonePromptJson(item.promptBaselineJson));
    item.promptBaselineFingerprint = promptFingerprint(item.promptJson);
    item.promptEditState = "original";
    item.promptEditAction = "";
    applyLocalTagsFromPrompt(item);
  }

  function duplicateIndexForItems() {
    const revision = state.items
      .map((item) => `${item.id}:${item.updatedAt || item.createdAt || 0}`)
      .join("|");
    if (duplicateIndexCache.revision === revision) return duplicateIndexCache;
    const buildDuplicateIndex = window.PromptArchiveSimilarity?.buildDuplicateIndex;
    if (typeof buildDuplicateIndex !== "function") {
      duplicateIndexCache = { revision, groups: new Map(), duplicateIds: new Set() };
      return duplicateIndexCache;
    }
    const indexed = buildDuplicateIndex(state.items, duplicateGroupKey, (item) => item.id);
    duplicateIndexCache = { revision, ...indexed };
    return duplicateIndexCache;
  }

  function duplicateGroupKey(item) {
    const corePromptSignature = window.PromptArchiveSimilarity?.corePromptSignature;
    const signature = typeof corePromptSignature === "function" ? corePromptSignature(item) : "";
    if (signature) return `prompt::${signature}`;
    const name = item.uploadMeta?.originalName || "";
    const size = item.uploadMeta?.originalSize || 0;
    return name && size ? `file::${name}::${size}` : "";
  }

  function findCorePromptDuplicate(candidate, excludeId = "") {
    const findDuplicate = window.PromptArchiveSimilarity?.findCorePromptDuplicate;
    if (typeof findDuplicate !== "function") return null;
    return findDuplicate(state.items, candidate, { excludeId });
  }

  function syncPromptEditState(item, preferredAction = "") {
    if (!item?.promptJson) {
      item.promptEditState = "empty";
      return item.promptEditState;
    }
    ensurePromptBaseline(item);
    const current = promptFingerprint(item.promptJson);
    if (current === item.promptBaselineFingerprint) {
      item.promptEditState = "original";
      item.promptEditAction = "";
      return item.promptEditState;
    }
    item.promptEditState = "modified";
    if (preferredAction) item.promptEditAction = preferredAction;
    else if (!item.promptEditAction) item.promptEditAction = "manual";
    return item.promptEditState;
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
    const itemId = escapeHtml(normalizeReferenceIdentifier(item.id));
    return `
      <div class="prompt-actions prompt-actions-sticky">
        <div class="toolbar" style="margin: 0;">
          <button class="primary-btn" data-action="copyPrompt" data-mode="final" data-id="${itemId}" type="button">최종 복사</button>
          <button class="ghost-btn" data-action="copyPrompt" data-mode="ko" data-id="${itemId}" type="button">번역 복사</button>
          <button class="ghost-btn" data-action="copyPrompt" data-mode="both" data-id="${itemId}" type="button">영+한 복사</button>
          <button class="ghost-btn" data-action="copyPrompt" data-mode="withoutAppearance" data-id="${itemId}" type="button">외모제외</button>
        </div>
        <div class="toolbar" style="margin: 0;">
          <button class="ghost-btn" data-action="toggleEdit" type="button">${ui.editMode ? "보기 모드" : "수정 모드"}</button>
          <button class="ghost-btn ${ui.promptCompareMode ? "active" : ""}" data-action="togglePromptCompare" type="button" ${item.promptBaselineJson ? "" : "disabled"}>원본 비교</button>
        </div>
      </div>
    `;
  }

  function renderNoPrompt(item) {
    const exifMode = isExifPromptMode();
    const itemId = escapeHtml(normalizeReferenceIdentifier(item.id));
    return `
      <div class="empty-state">
        <div>
          <h2>아직 프롬프트가 없습니다.</h2>
          <p>${exifMode ? "EXIF 원본 불러오기로 메타데이터 프롬프트를 다시 읽거나, 업로드 모드를 API 분석으로 바꾼 뒤 수동 분석하세요." : "분석을 실행하면 외모, 복장, 배경, 표정/자세, 디테일 5개 섹션으로 저장됩니다."}</p>
          <div class="toolbar" style="justify-content:center">
            <button class="primary-btn" data-action="analyzeOne" data-id="${itemId}" type="button" ${exifMode ? "disabled" : ""}>수동 분석</button>
            <button class="ghost-btn" data-action="reloadExif" data-id="${itemId}" type="button" ${exifMode ? "" : "disabled"}>EXIF 원본 불러오기</button>
          </div>
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
    const itemId = escapeHtml(normalizeReferenceIdentifier(item.id));
    const sectionKey = escapeHtml(normalizeReferenceIdentifier(sectionConfig.key));
    return `
      <section class="prompt-section" data-section="${sectionKey}">
        <div class="section-label-row">
          <h3 class="section-label">${escapeHtml(label)}</h3>
          <button class="tiny-btn section-copy-btn" data-action="copySection" data-id="${itemId}" data-section="${sectionKey}" data-lang="${lang}" type="button" aria-label="${escapeHtml(label)} 문단 복사" data-tooltip="문단 복사">⧉</button>
        </div>
        ${section.sentences.map((sentence) => `
          <p class="sentence ${ui.selectedSentenceId === sentence.id ? "active" : ""}"
             data-sentence-id="${escapeHtml(normalizeReferenceIdentifier(sentence.id))}"
             data-lang="${lang}"
             contenteditable="${ui.editMode ? "true" : "false"}"
             spellcheck="false">${renderSentenceContent(sentence, lang)}</p>
        `).join("")}
        <div class="toolbar" style="margin-top: var(--space-2); margin-bottom: 0;">
          ${lang === "ko"
            ? `<button class="tiny-btn" data-action="retranslateSection" data-section="${sectionKey}" data-id="${itemId}" type="button">${escapeHtml(label)} 재번역</button>`
            : `<button class="tiny-btn" data-action="regenerateSection" data-section="${sectionKey}" data-id="${itemId}" type="button">${escapeHtml(label)} 재생성</button>`}
        </div>
      </section>
    `;
  }

  function renderSettings() {
    if (isVideoArchiveMode()) return renderVideoSettings();
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
        <nav class="settings-tabs" role="tablist" aria-label="설정 탭">
          ${tabs.map(([key, label]) => `<button class="settings-tab-btn ${ui.settingsTab === key ? "active" : ""}" id="settings-tab-${key}" data-settings-tab="${key}" type="button" role="tab" aria-selected="${ui.settingsTab === key}" aria-controls="settings-panel-${key}">${label}</button>`).join("")}
        </nav>
        <section class="settings-tab-panel" id="settings-panel-${ui.settingsTab}" role="tabpanel" aria-labelledby="settings-tab-${ui.settingsTab}" tabindex="0">${renderSettingsTab()}</section>
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
    if (ui.settingsTab === "videoCategory") return renderVideoCategorySettings();
    if (ui.settingsTab === "videoUpload") return renderVideoUploadSettings();
    if (ui.settingsTab === "videoCopy") return renderVideoCopySettings();
    return renderAdvancedSettings();
  }

  function renderVideoSettings() {
    const tabs = [
      ["api", "API 설정"],
      ["videoCategory", "카테고리"],
      ["videoUpload", "업로드"],
      ["videoCopy", "복사/표시"],
    ];
    if (!tabs.some(([key]) => key === ui.settingsTab)) ui.settingsTab = "videoCategory";
    return `
      <div class="page-head">
        <div>
          <h2 class="page-title">비디오 설정</h2>
          <p class="page-copy">번역은 아래 API 설정을 그대로 사용합니다. 카테고리와 업로드 방식만 비디오 전용입니다.</p>
        </div>
      </div>
      <div class="settings-shell">
        <nav class="settings-tabs" role="tablist" aria-label="비디오 설정 탭">
          ${tabs.map(([key, label]) => `<button class="settings-tab-btn ${ui.settingsTab === key ? "active" : ""}" id="settings-tab-${key}" data-settings-tab="${key}" type="button" role="tab" aria-selected="${ui.settingsTab === key}" aria-controls="settings-panel-${key}">${label}</button>`).join("")}
        </nav>
        <section class="settings-tab-panel" id="settings-panel-${ui.settingsTab}" role="tabpanel" aria-labelledby="settings-tab-${ui.settingsTab}" tabindex="0">${renderSettingsTab()}</section>
      </div>
    `;
  }

  function renderVideoCategorySettings() {
    return `
      <div class="settings-section">
        <h3 class="card-title">비디오 카테고리</h3>
        <p class="field-help">이미지 카테고리와 섞이지 않습니다. 이름과 색을 수정한 뒤 저장하세요.</p>
        ${renderVideoCategoryManager()}
        <div class="toolbar">
          <button class="primary-btn" data-action="saveVideoCategorySettings" type="button">카테고리 저장</button>
        </div>
      </div>
    `;
  }

  function renderVideoCategoryManager() {
    return `
      <div class="toolbar">
        <input class="input" id="newVideoCategoryName" placeholder="새 비디오 카테고리 이름">
        <button class="primary-btn" data-action="addVideoCategory" type="button">추가</button>
      </div>
      <div class="settings-stack">
        ${state.videoCategories.map((category, index) => `
          <div class="category-admin-row">
            <input class="input" data-video-category-name="${category.id}" value="${escapeHtml(category.name)}">
            <select class="select" data-video-category-color="${category.id}">
              ${["blue", "amber", "green", "rose", "violet", "slate"].map((color) => `<option value="${color}" ${category.color === color ? "selected" : ""}>${color}</option>`).join("")}
            </select>
            <button class="tiny-btn" data-action="moveVideoCategory" data-id="${escapeHtml(category.id)}" data-direction="-1" type="button" ${index === 0 ? "disabled" : ""}>위</button>
            <button class="tiny-btn" data-action="moveVideoCategory" data-id="${escapeHtml(category.id)}" data-direction="1" type="button" ${index === state.videoCategories.length - 1 ? "disabled" : ""}>아래</button>
            <button class="ghost-btn" data-action="saveVideoCategory" data-id="${escapeHtml(category.id)}" type="button">저장</button>
            <button class="danger-btn" data-action="deleteVideoCategory" data-id="${escapeHtml(category.id)}" type="button" ${state.videoCategories.length <= 1 ? "disabled" : ""}>삭제</button>
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderVideoUploadSettings() {
    return `
      <div class="settings-section">
        <h3 class="card-title">비디오 업로드</h3>
        <p class="field-help">제목과 카테고리는 항상 직접 입력합니다. 파일명이나 EXIF로 채우지 않습니다.</p>
        <div class="option-grid">
          <label class="option-item"><input id="videoTranslateOnUpload" type="checkbox" ${state.videoSettings.translateOnUpload ? "checked" : ""}><span>저장 후 한국어 자동 번역</span></label>
        </div>
        <div class="toolbar">
          <button class="primary-btn" data-action="saveVideoUploadSettings" type="button">업로드 설정 저장</button>
        </div>
      </div>
    `;
  }

  function renderVideoCopySettings() {
    return `
      <div class="settings-section">
        <h3 class="card-title">비디오 복사/표시</h3>
        <div class="option-grid">
          <label class="option-item"><input id="videoIncludeSectionTitles" type="checkbox" ${state.videoSettings.includeSectionTitles ? "checked" : ""}><span>복사할 때 문단 제목 포함</span></label>
        </div>
        <div class="field">
          <label for="videoPromptViewMode">프롬프트 보기</label>
          <select class="select" id="videoPromptViewMode">
            <option value="split" ${state.videoSettings.promptViewMode === "split" ? "selected" : ""}>영문 + 번역</option>
            <option value="en" ${state.videoSettings.promptViewMode === "en" ? "selected" : ""}>영문만</option>
            <option value="ko" ${state.videoSettings.promptViewMode === "ko" ? "selected" : ""}>번역만</option>
          </select>
        </div>
        <div class="toolbar">
          <button class="primary-btn" data-action="saveVideoCopySettings" type="button">표시 설정 저장</button>
        </div>
      </div>
    `;
  }

  function renderApiSettings() {
    const activeIndex = clampNumber(ui.activeProviderIndex, 0, state.providers.length - 1, 0);
    const provider = state.providers[activeIndex] || state.providers[0];
    return `
      <div class="settings-section">
        <h3 class="card-title">AI 공급자</h3>
        <p class="notice">역할은 2개뿐입니다. 이미지 분석(비전 프롬프트) · 번역·제목 요약(텍스트). 태그는 앱 로컬 매칭이며 API 역할이 아닙니다. API Key는 서버에만 보관합니다.</p>
        <nav class="provider-tabs" role="tablist" aria-label="API 공급자 전환">
          ${state.providers.map((item, index) => `
            <button class="provider-tab-btn ${index === activeIndex ? "active" : ""}" data-provider-tab="${index}" type="button" role="tab" aria-selected="${index === activeIndex}">
              <span>${escapeHtml(item.name)}</span>
              <small>${providerIsActive(item) ? "사용" : "끔"}</small>
            </button>
          `).join("")}
        </nav>
        <div class="provider-list">${provider ? renderProvider(provider, activeIndex) : ""}</div>
      </div>
    `;
  }

  function renderSentenceContent(sentence, lang) {
    const text = sentence[lang] || "";
    if (ui.editMode) return escapeHtml(text);
    const fragments = splitHighlightFragments(text);
    return fragments.map((fragment, index) => {
      const fragmentId = `${sentence.id}:${index}`;
      return `<span class="sentence-fragment ${ui.selectedFragmentId === fragmentId ? "active" : ""}" data-fragment-id="${escapeHtml(fragmentId)}">${escapeHtml(fragment)}</span>`;
    }).join("");
  }

  function splitHighlightFragments(text) {
    const value = String(text || "");
    const fragments = value.match(/[^,.;:!?，。！？；：]+[,.;:!?，。！？；：]?\s*/g);
    return fragments && fragments.length ? fragments : [value];
  }

  function renderProvider(provider, index) {
    const usesGeminiApiKeys = provider.name === "Google Gemini API";
    const usesVertexJsonKey = provider.name === "Google Vertex AI";
    const usesOpenAiCompatibleUrl = ["OpenAI", "xAI Grok", "Cerebras Cloud"].includes(provider.name);
    const focusEvents = settingsInputFocusEvents();
    return `
      <form class="panel provider-card" autocomplete="off">
        <input type="text" autocomplete="username" value="${escapeHtml(provider.name)}" hidden>
        <div class="provider-head">
          <strong>${escapeHtml(provider.name)}</strong>
          <span class="status-pill">${providerIsActive(provider) ? "사용 중" : "미사용"}</span>
        </div>
        <div class="form-grid">
          ${usesVertexJsonKey ? renderVertexModelFields(provider, index, focusEvents) : `
            <div class="field wide-field">
              <label>모델</label>
              <input class="input" data-provider-model="${index}" ${focusEvents} value="${escapeHtml(provider.model || "")}" placeholder="model-name">
              <p class="field-help">비전/텍스트 구분 없이 이 공급자가 쓰는 모델 하나만 설정합니다.</p>
            </div>
          `}
          ${usesOpenAiCompatibleUrl ? `
            <div class="field wide-field">
              <label>${provider.name === "Cerebras Cloud" ? "Cerebras API URL" : "API URL"}</label>
              <input class="input" data-provider-api-url="${index}" ${focusEvents} value="${escapeHtml(provider.apiUrl || defaultProviderApiUrl(provider.name))}" placeholder="${escapeHtml(defaultProviderApiUrl(provider.name))}">
            </div>
          ` : ""}
          ${renderProviderSecretFields(provider, index, focusEvents, usesGeminiApiKeys, usesVertexJsonKey)}
          ${usesVertexJsonKey ? `
            <div class="field">
              <label>Vertex Location</label>
              <input class="input" data-provider-location="${index}" ${focusEvents} value="${escapeHtml(provider.location || "us-central1")}" placeholder="us-central1 또는 global">
            </div>
          ` : ""}
          <div class="field">
            <label>우선순위</label>
            <input class="input" data-provider-priority="${index}" ${focusEvents} type="number" min="1" max="20" value="${provider.priority}">
          </div>
          <div class="field">
            <label>타임아웃(초)</label>
            <input class="input" data-provider-timeout="${index}" ${focusEvents} type="number" min="5" max="300" value="${provider.timeoutSeconds}">
          </div>
          <div class="field">
            <label>최대 재시도</label>
            <input class="input" data-provider-retries="${index}" ${focusEvents} type="number" min="0" max="10" value="${provider.maxRetries}">
          </div>
        </div>
        <div class="option-grid">
          <label class="option-item"><input data-provider-use-image="${index}" type="checkbox" ${provider.useForImageAnalysis ? "checked" : ""}><span>이미지 분석</span></label>
          <label class="option-item"><input data-provider-use-translation="${index}" type="checkbox" ${provider.useForTranslation ? "checked" : ""}><span>번역 · 제목 요약</span></label>
        </div>
        <p class="field-help">이미지 분석: 비전으로 5문단 프롬프트 생성. 번역·제목 요약: 한국어 번역 + 앨범 키워드 제목(헤어·의상·소품/가방·배경). 피부·톤·스냅·조명·여성 표현은 제외. 태그(복장/장소)는 프롬프트 로컬 매칭이며 API 역할이 아닙니다.</p>
        <div class="toolbar" style="margin: 0;">
          <button class="ghost-btn" data-action="saveProvider" data-index="${index}" type="button">설정 저장</button>
          <button class="ghost-btn" data-action="testProvider" data-index="${index}" type="button">연결 테스트</button>
          ${provider.lastTestStatus ? `<span class="status-pill">${escapeHtml(provider.lastTestStatus)}</span>` : ""}
        </div>
      </form>
    `;
  }

  function renderVertexModelFields(provider, index, focusEvents) {
    const presetOptions = vertexModelPresets
      .map((model) => `<option value="${escapeHtml(model)}"></option>`)
      .join("");
    return `
      <div class="field">
        <label>이미지 분석 모델</label>
        <input class="input" data-provider-vision-model="${index}" list="vertex-model-presets-${index}" ${focusEvents} value="${escapeHtml(provider.visionModel || "")}" placeholder="모델 선택 또는 직접 입력">
        <p class="field-help">이미지를 읽고 5문단 프롬프트를 만드는 모델입니다.</p>
      </div>
      <div class="field">
        <label>번역 모델</label>
        <input class="input" data-provider-text-model="${index}" list="vertex-model-presets-${index}" ${focusEvents} value="${escapeHtml(provider.textModel || "")}" placeholder="모델 선택 또는 직접 입력">
        <p class="field-help">번역, 제목 요약, 텍스트 수정에 사용하는 모델입니다.</p>
      </div>
      <datalist id="vertex-model-presets-${index}">
        ${presetOptions}
      </datalist>
      <p class="field-help wide-field">프리셋을 고르거나 Vertex 모델 ID를 직접 입력할 수 있습니다. 사용 가능 여부는 프로젝트와 Location에 따라 달라집니다.</p>
    `;
  }

  function renderProviderSecretFields(provider, index, focusEvents, usesGeminiApiKeys, usesVertexJsonKey) {
    if (usesGeminiApiKeys) {
      return `
        <div class="field provider-key-group">
          <label>Gemini API Keys, 최대 3개 회전</label>
          ${[0, 1, 2].map((slot) => `
            <div class="api-key-row">
              <span class="api-key-number">${slot + 1}</span>
              <input class="input" data-provider-api-key="${index}" data-provider-api-key-slot="${slot}" ${focusEvents} type="password" autocomplete="new-password" placeholder="${provider.keyCount > slot ? `Key #${slot + 1} 서버 저장됨` : slot === 0 ? "Primary API key" : `Backup API key ${slot + 1}`}">
            </div>
          `).join("")}
          <p class="field-help">429, 401, 403 또는 일시 오류가 나면 다음 키로 회전합니다. 현재 저장 키 ${provider.keyCount || 0}개.</p>
        </div>
      `;
    }
    if (usesVertexJsonKey) {
      return `
        <div class="field">
          <label>Vertex Service Account JSON</label>
          <textarea class="textarea provider-key-textarea" data-provider-key="${index}" ${focusEvents} spellcheck="false" placeholder="${provider.hasServerKey ? "Vertex JSON 서버 저장됨" : "서비스 계정 JSON 전체를 붙여넣기"}"></textarea>
        </div>
      `;
    }
    return `
      <div class="field">
        <label>API Key</label>
        <input class="input" data-provider-key="${index}" ${focusEvents} type="password" autocomplete="new-password" placeholder="${provider.hasServerKey ? "서버 저장됨" : "입력 시 서버 저장 표시"}">
      </div>
    `;
  }

  function providerIsActive(provider) {
    return Boolean(provider.useForImageAnalysis || provider.useForTranslation);
  }

  function settingsInputFocusEvents() {
    return "";
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
        <h3 class="card-title">카테고리</h3>
        ${renderCategoryManager()}
        ${renderWildcardRuleSettings()}
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

  function renderCategoryManager() {
    return `
      <div class="toolbar">
        <input class="input" id="newCategoryName" placeholder="새 카테고리 이름">
        <button class="primary-btn" data-action="addCategory" type="button">추가</button>
      </div>
      <div class="settings-stack">
        ${state.categories.map((category, index) => `
          <div class="category-admin-row">
            <input class="input" data-category-name="${category.id}" value="${escapeHtml(category.name)}">
            <select class="select" data-category-color="${category.id}">
              ${["blue", "amber", "green", "rose", "violet", "slate"].map((color) => `<option value="${color}" ${category.color === color ? "selected" : ""}>${color}</option>`).join("")}
            </select>
            <button class="tiny-btn" data-action="moveCategory" data-id="${category.id}" data-direction="-1" type="button" ${index === 0 ? "disabled" : ""}>위</button>
            <button class="tiny-btn" data-action="moveCategory" data-id="${category.id}" data-direction="1" type="button" ${index === state.categories.length - 1 ? "disabled" : ""}>아래</button>
            <button class="ghost-btn" data-action="saveCategory" data-id="${category.id}" type="button">저장</button>
            <button class="danger-btn" data-action="deleteCategory" data-id="${category.id}" type="button" ${state.categories.length <= 1 ? "disabled" : ""}>삭제</button>
          </div>
        `).join("")}
      </div>
    `;
  }

  function wildcardToken(relativePath) {
    return `__items/${String(relativePath || "")
      .replace(/\\/g, "/")
      .replace(/\.txt$/i, "")}__`;
  }

  function renderWildcardRuleSettings() {
    const settings = state.wildcardSettings;
    return `
      <section class="wildcard-rule-panel" aria-labelledby="wildcardRuleTitle">
        <div class="wildcard-rule-head">
          <div>
            <span class="wildcard-rule-kicker">WILDCARD ROUTING</span>
            <h3 class="card-title" id="wildcardRuleTitle">와일드카드 분류 규칙</h3>
            <p class="field-help">카테고리 이름이 조건과 정확히 일치하면 위에서부터 처음 맞는 규칙의 파일로 저장합니다. 대소문자와 앞뒤 공백은 무시합니다.</p>
          </div>
          <button class="primary-btn" data-action="addWildcardRule" type="button">규칙 추가</button>
        </div>
        <div class="wildcard-output-grid">
          <label class="wildcard-output-card">
            <span>얼굴·외모 저장 경로</span>
            <input class="input" id="wildcardAppearancePath" value="${escapeHtml(settings.appearancePath)}" placeholder="appearance.txt">
            <small>${escapeHtml(wildcardToken(settings.appearancePath))}</small>
          </label>
          <label class="wildcard-output-card">
            <span>규칙 미일치 시나리오 경로</span>
            <input class="input" id="wildcardDefaultScenarioPath" value="${escapeHtml(settings.defaultScenarioPath)}" placeholder="scenario.txt">
            <small>${escapeHtml(wildcardToken(settings.defaultScenarioPath))}</small>
          </label>
        </div>
        <datalist id="wildcardCategoryNames">
          ${state.categories.map((category) => `<option value="${escapeHtml(category.name)}"></option>`).join("")}
        </datalist>
        <div class="wildcard-rule-list">
          ${settings.rules.length ? settings.rules.map((rule, index) => `
            <article class="wildcard-rule-row">
              <div class="wildcard-rule-order" aria-label="규칙 순서 ${index + 1}">${String(index + 1).padStart(2, "0")}</div>
              <label class="field">
                <span>규칙 이름</span>
                <input class="input" data-wildcard-rule-name="${escapeHtml(rule.id)}" value="${escapeHtml(rule.name)}" placeholder="예: NSFW">
              </label>
              <label class="field">
                <span>카테고리 조건</span>
                <input class="input" data-wildcard-rule-categories="${escapeHtml(rule.id)}" list="wildcardCategoryNames" value="${escapeHtml(rule.categoryNames.join(", "))}" placeholder="nsfw, 18+">
                <small class="field-help">여러 조건은 쉼표로 구분</small>
              </label>
              <label class="field">
                <span>저장 상대 경로</span>
                <input class="input" data-wildcard-rule-output="${escapeHtml(rule.id)}" value="${escapeHtml(rule.outputPath)}" placeholder="groups/nsfw.txt">
                <small class="field-help">${escapeHtml(wildcardToken(rule.outputPath))}</small>
              </label>
              <label class="toggle wildcard-rule-enabled">
                <input data-wildcard-rule-enabled="${escapeHtml(rule.id)}" type="checkbox" ${rule.enabled ? "checked" : ""}>
                사용
              </label>
              <div class="wildcard-rule-actions">
                <button class="tiny-btn" data-action="moveWildcardRule" data-id="${escapeHtml(rule.id)}" data-direction="-1" type="button" ${index === 0 ? "disabled" : ""}>위</button>
                <button class="tiny-btn" data-action="moveWildcardRule" data-id="${escapeHtml(rule.id)}" data-direction="1" type="button" ${index === settings.rules.length - 1 ? "disabled" : ""}>아래</button>
                <button class="danger-btn" data-action="deleteWildcardRule" data-id="${escapeHtml(rule.id)}" type="button">삭제</button>
              </div>
            </article>
          `).join("") : `
            <div class="wildcard-rule-empty">
              <strong>별도 분류 규칙 없음</strong>
              <span>모든 얼굴 제외 시나리오가 기본 시나리오 경로로 저장됩니다.</span>
            </div>
          `}
        </div>
        <p class="notice">경로는 Impact Pack의 <code>wildcards/items</code> 폴더 기준입니다. 하위 폴더를 사용할 수 있지만 절대 경로, <code>..</code>, 중복 경로, <code>.txt</code>가 아닌 파일은 저장되지 않습니다. 경로를 바꾸면 다음 업데이트에서 현재 아카이브의 기존 줄을 새 파일로 옮깁니다.</p>
      </section>
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
        <h3 class="card-title">프롬프트 입력 방식</h3>
        <div class="option-grid">
          <label class="option-item"><input type="radio" name="promptSourceMode" value="ai" ${state.uploadSettings.promptSourceMode !== "exif" ? "checked" : ""}><span>API 이미지 분석 사용</span></label>
          <label class="option-item"><input type="radio" name="promptSourceMode" value="exif" ${state.uploadSettings.promptSourceMode === "exif" ? "checked" : ""}><span>EXIF / 메타데이터 프롬프트 읽기</span></label>
          ${checkboxOption("translateExifPrompt", state.uploadSettings.translateExifPrompt, "EXIF 프롬프트 저장 후 한국어 자동 번역")}
        </div>
        <p class="notice">EXIF 모드에서는 이미지 분석 API를 호출하지 않고, 업로드 파일의 EXIF / PNG / WebP 메타데이터에서 프롬프트를 읽어 5문단으로 저장합니다. 메타데이터가 없거나 5문단으로 나눌 수 없으면 저장을 막고 해당 파일을 강조 표시합니다.</p>
      </div>
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
          ${checkboxOption("detectDuplicates", state.uploadSettings.detectDuplicates, "중복 업로드 감지 (파일 + 의상·배경 프롬프트)")}
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
        <p class="notice">브라우저 캔버스로 리사이즈와 포맷 변환을 수행해 서버 트래픽과 저장 용량을 줄입니다. GIF는 기본 차단합니다. 중복 감지는 제목·태그·외모·포즈·디테일을 제외하고 의상과 배경 문단이 모두 같은 업로드를 막습니다.</p>
      </div>
    `;
  }

  function renderGallerySettings() {
    return `
      <div class="settings-section">
        <h3 class="card-title">갤러리 표시 설정</h3>
        <div class="form-grid">
          ${numberField("albumColumns", "열 개수", state.albumSettings.columns, 2, 8)}
          ${numberField("albumRows", "묶음당 행 개수", state.albumSettings.rows, 2, 8)}
          <div class="field"><label>묶음당 이미지</label><input class="input" value="${state.albumSettings.columns * state.albumSettings.rows}" disabled></div>
          <div class="field">
            <label for="galleryLoadMode">탐색 방식</label>
            <select class="select" id="galleryLoadMode">
              ${option("infinite", "아래로 계속 보기", state.albumSettings.loadMode)}
              ${option("pages", "페이지로 이동", state.albumSettings.loadMode)}
            </select>
          </div>
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
        <p class="field-help">페이지 이동 위치는 탐색 방식을 ‘페이지로 이동’으로 선택했을 때 적용됩니다.</p>
        <div class="option-grid" style="margin-top: var(--space-3);">
          ${checkboxOption("showTitle", state.albumSettings.showTitle !== false, "카드 제목 표시")}
          ${checkboxOption("showTags", state.albumSettings.showTags !== false, "카드 태그 표시")}
          ${checkboxOption("showStatus", state.albumSettings.showStatus !== false, "원본/수정 상태 표시")}
          ${checkboxOption("showFavorite", state.albumSettings.showFavorite !== false, "즐겨찾기 버튼 표시")}
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
          <button class="ghost-btn" data-action="exportJson" type="button">JSON 클립보드 복사</button>
          <button class="ghost-btn" data-action="exportArchive" type="button">전체 백업 저장</button>
          <button class="ghost-btn" data-action="importArchive" type="button">백업 가져오기</button>
          <button class="ghost-btn" data-action="exportCsv" type="button">CSV 내보내기</button>
          <button class="danger-btn" data-action="resetSettingsOnly" type="button">설정 기본값 복원</button>
        </div>
        <div class="option-grid backup-secret-option">
          ${checkboxOption("includeSecretsInBackup", false, "전체 백업에 API 비밀키 포함")}
        </div>
        <p class="notice">비밀키는 기본적으로 백업에서 제외됩니다. 다른 기기로 완전히 이전해야 할 때만 포함하고, 생성된 파일을 암호화된 저장소에 보관하세요.</p>
        <p class="field-help" style="margin-top: var(--space-2);">
          <strong>전체 백업 저장</strong>은 게시물·설정·태그·API 설정·업로드 이미지를 하나의 JSON 파일로 내보냅니다.
          <strong>백업 가져오기</strong>는 그 파일로 현재 데이터를 교체 복원합니다. (가져오기 전 현재 상태를 백업해 두세요.)
        </p>
        <input id="archiveImportInput" type="file" accept="application/json,.json" hidden>
        <h3 class="card-title" style="margin-top: var(--space-5);">배치 작업</h3>
        <div class="toolbar">
          <button class="ghost-btn" data-action="batchRetitle" type="button">전체 제목 재요약</button>
          <button class="ghost-btn" data-action="batchRetag" type="button">전체 태그 재추론</button>
          <button class="ghost-btn" data-action="migrateBaselines" type="button">원본 기준 보정</button>
        </div>
        <h3 class="card-title" style="margin-top: var(--space-5);">단축키</h3>
        <p class="field-help">비워 두면 해당 단축키는 비활성입니다. 입력칸을 클릭한 뒤 원하는 키를 누르면 등록됩니다.</p>
        <div class="form-grid shortcut-grid">
          ${shortcutField("shortcutNextItem", "다음 게시물", state.advancedSettings.shortcuts?.nextItem || "")}
          ${shortcutField("shortcutPrevItem", "이전 게시물", state.advancedSettings.shortcuts?.prevItem || "")}
          ${shortcutField("shortcutCopyFinal", "최종 프롬프트 복사", state.advancedSettings.shortcuts?.copyFinal || "")}
          ${shortcutField("shortcutGoBack", "뒤로", state.advancedSettings.shortcuts?.goBack || "")}
        </div>
        <div class="toolbar">
          <button class="ghost-btn" data-action="clearShortcuts" type="button">단축키 모두 비우기</button>
        </div>
      </div>
    `;
  }

  function shortcutField(id, label, value) {
    return `
      <div class="field">
        <label for="${id}">${label}</label>
        <input class="input shortcut-input" id="${id}" type="text" value="${escapeHtml(value)}" placeholder="비활성" readonly data-shortcut-field="${id}">
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

  function bindImageErrorEvents(root) {
    root?.querySelectorAll("img").forEach((image) => {
      image.addEventListener("error", () => {
        image.classList.add("broken-image");
        image.alt = "이미지 없음";
      });
    });
  }

  function bindCommonEvents() {
    bindImageErrorEvents(document);
    document.querySelectorAll("[data-view]").forEach((node) => {
      node.addEventListener("click", () => {
        if (node.dataset.view === "upload" || node.dataset.view === "settings") {
          openModal(node.dataset.view);
          return;
        } else {
          ui.previousView = ui.view;
          ui.view = node.dataset.view;
          ui.modal = null;
        }
        render();
      });
    });
    document.querySelectorAll("[data-settings-tab]").forEach((node) => {
      node.addEventListener("click", () => {
        ui.settingsTab = node.dataset.settingsTab;
        postRenderFocusSelector = `[data-settings-tab="${ui.settingsTab}"]`;
        render();
      });
      node.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        const tabs = [...document.querySelectorAll("[data-settings-tab]")];
        const current = tabs.indexOf(node);
        const next = event.key === "Home"
          ? 0
          : event.key === "End"
            ? tabs.length - 1
            : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
        event.preventDefault();
        ui.settingsTab = tabs[next].dataset.settingsTab;
        postRenderFocusSelector = `[data-settings-tab="${ui.settingsTab}"]`;
        render();
      });
    });
    document.querySelectorAll("[data-provider-tab]").forEach((node) => {
      node.addEventListener("click", () => {
        ui.activeProviderIndex = clampNumber(node.dataset.providerTab, 0, state.providers.length - 1, 0);
        render();
      });
    });
    document.querySelectorAll("[data-filter-group]").forEach((node) => {
      node.addEventListener("click", () => {
        ui.filterGroup = node.dataset.filterGroup;
        resetGalleryWindow();
        render();
      });
    });
    document.querySelectorAll("[data-category-filter]").forEach((node) => {
      node.addEventListener("click", () => {
        ui.category = node.dataset.categoryFilter;
        resetGalleryWindow();
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
        resetGalleryWindow();
        render();
      });
    });
    document.querySelectorAll("[data-page]").forEach((node) => {
      node.addEventListener("click", () => {
        const pageCount = Math.max(1, Math.ceil(currentFilteredArchiveItems().length / (state.albumSettings.columns * state.albumSettings.rows)));
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
      // Keep the input node stable. Full app re-render destroys Hangul IME composition.
      search.addEventListener("compositionstart", () => {
        searchImeComposing = true;
      });
      search.addEventListener("compositionend", (event) => {
        searchImeComposing = false;
        ui.query = event.target.value;
        syncSearchClearButton();
        scheduleSearchRefresh();
      });
      search.addEventListener("input", (event) => {
        ui.query = event.target.value;
        syncSearchClearButton();
        if (searchImeComposing || event.isComposing) {
          // Still refresh results with current composition text, without touching the input DOM.
          scheduleSearchRefresh({ immediate: false });
          return;
        }
        scheduleSearchRefresh({ immediate: true });
      });
      search.addEventListener("keydown", (event) => {
        // Prevent global shortcuts from stealing keys while searching.
        event.stopPropagation();
      });
    }
    bindGallerySelectEvents();
  }

  function syncSearchClearButton() {
    const clearButton = document.querySelector('[data-action="clearSearch"]');
    if (!clearButton) return;
    clearButton.hidden = !ui.query;
    clearButton.disabled = !ui.query;
  }

  function bindViewEvents() {
    bindGalleryInfiniteScroll();
    document.querySelectorAll("[data-open-item]").forEach((node) => {
      node.addEventListener("click", (event) => {
        if (event.target.closest("button, input, label, .bulk-delete-check")) return;
        if (ui.bulkDeleteMode) {
          toggleBulkDeleteItem(node.dataset.openItem);
          refreshBulkSelectionUi();
          return;
        }
        if (ui.bulkCategoryMode) {
          toggleBulkCategoryItem(node.dataset.openItem);
          refreshBulkSelectionUi();
          return;
        }
        openItem(node.dataset.openItem);
      });
      node.addEventListener("keydown", (event) => {
        if (event.target !== node) return;
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        if (ui.bulkDeleteMode) {
          toggleBulkDeleteItem(node.dataset.openItem);
          refreshBulkSelectionUi();
          return;
        }
        if (ui.bulkCategoryMode) {
          toggleBulkCategoryItem(node.dataset.openItem);
          refreshBulkSelectionUi();
          return;
        }
        openItem(node.dataset.openItem);
      });
    });
    document.querySelectorAll("[data-action]").forEach((node) => {
      node.addEventListener("click", (event) => handleAction(event, node));
    });
    bindModalBackdropGuard();
    bindUploadEvents();
    bindPromptViewerEvents();
    bindVideoPromptViewerEvents();
    bindConverterEvents();
    bindLoraSorterEvents();
    bindPromptEvents();
    bindSettingsEvents();
    bindShortcutCaptureFields();
  }

  function bindModalBackdropGuard() {
    const backdrop = document.querySelector(".modal-backdrop");
    if (!backdrop) {
      modalBackdropPointerDown = false;
      return;
    }
    // Only close when the press starts on the dimmed backdrop itself.
    // Prevents text-selection drags from inputs closing the modal on mouseup outside.
    backdrop.addEventListener("pointerdown", (event) => {
      modalBackdropPointerDown = event.target === backdrop;
    }, true);
    backdrop.querySelector("[data-modal-panel]")?.addEventListener("pointerdown", () => {
      modalBackdropPointerDown = false;
    }, true);
    window.addEventListener("pointerup", () => {
      // Keep flag until the following click handler runs, then clear on next tick.
      setTimeout(() => {
        modalBackdropPointerDown = false;
      }, 0);
    }, { once: true });
  }

  async function handleAction(event, node) {
    const action = node.dataset.action;
    if (action === "upload") {
      if (isVideoArchiveMode()) {
        if (!ui.videoUploadDraft.categoryId) ui.videoUploadDraft.categoryId = state.videoCategories[0]?.id || "";
        openModal("videoUpload");
        return;
      }
      openModal("upload");
      return;
    }
    if (action === "settings") {
      const videoTabs = ["api", "videoCategory", "videoUpload", "videoCopy"];
      if (isVideoArchiveMode() && !videoTabs.includes(ui.settingsTab)) ui.settingsTab = "videoCategory";
      if (!isVideoArchiveMode() && String(ui.settingsTab || "").startsWith("video")) ui.settingsTab = "api";
      openModal("settings");
      return;
    }
    if (action === "converter" || action === "promptViewer") {
      if (isVideoArchiveMode()) {
        showToast("변환과 이미지 프롬프트 확인은 이미지 모드에서만 사용할 수 있습니다.", "warning");
        return;
      }
      openModal(action);
      return;
    }
    if (action === "videoPromptViewer") {
      if (!isVideoArchiveMode()) {
        showToast("비디오 프롬프트 확인은 비디오 모드에서만 사용할 수 있습니다.", "warning");
        return;
      }
      openModal(action);
      return;
    }
    if (action === "setArchiveMode") {
      setArchiveMode(node.dataset.mode);
      return;
    }
    if (action === "loraSorter") {
      if (isVideoArchiveMode()) {
        showToast("사진 분류는 이미지 모드에서만 사용할 수 있습니다.", "warning");
        return;
      }
      openModal(action);
      await loraSorterRestorePromise;
      if (loraSorterState.sourceHandle && !loraSorterState.groups.length && !loraSorterState.scanning) {
        try {
          if (await ensureDirectoryPermission(loraSorterState.sourceHandle, true)) await scanLoraSorterFolder();
          else showToast("저장된 이미지 폴더를 다시 사용하려면 접근 권한이 필요합니다.", "warning", 3200);
        } catch (error) {
          showToast(error.message || "저장된 이미지 폴더를 다시 열지 못했습니다.", "warning", 3200);
        }
      }
      return;
    }
    if (action === "closeModal") {
      if (node.classList.contains("modal-backdrop")) {
        // Require both target and pointer-down origin to be the backdrop.
        if (event.target !== node || !modalBackdropPointerDown) return;
      }
      closeModal();
      return;
    }
    if (action === "retryServer") {
      await retryServerConnection();
      return;
    }
    if (action === "clearPromptViewer") {
      resetPromptViewerState();
      render();
      return;
    }
    if (action === "copyPromptViewerAll") {
      writeClipboard(promptViewerCopyText(), "전체 프롬프트를 복사했습니다.");
      return;
    }
    if (action === "copyPromptViewerWithoutFace") {
      writeClipboard(promptViewerCopyText({ excludeAppearance: true }), "얼굴 문단을 제외하고 복사했습니다.");
      return;
    }
    if (action === "copyPromptViewerSection") {
      writeClipboard(promptViewerSectionText(node.dataset.section), "문단을 복사했습니다.");
      return;
    }
    if (action === "clearVideoPromptViewer") {
      resetVideoPromptViewerState();
      render();
      return;
    }
    if (action === "copyVideoPromptViewerAll") {
      writeClipboard(videoPromptViewerCopyText(), "전체 프롬프트를 복사했습니다.");
      return;
    }
    if (action === "copyVideoPromptViewerSection") {
      writeClipboard(videoPromptViewerSectionText(node.dataset.section), "문단을 복사했습니다.");
      return;
    }
    if (action === "selectConverterSource") {
      await selectConverterSourceFolder();
      return;
    }
    if (action === "selectConverterDestination") {
      await selectConverterDestinationFolder();
      return;
    }
    if (action === "resetConverterSelection") {
      resetConverterSelection();
      return;
    }
    if (action === "startConverter") {
      await startPngToWebpConversion();
      return;
    }
    if (action === "selectLoraSorterSource") {
      await selectLoraSorterSourceFolder();
      return;
    }
    if (action === "selectLoraSorterBaseDestination") {
      await selectLoraSorterBaseDestination();
      return;
    }
    if (action === "selectLoraGroupDestination") {
      await selectLoraGroupDestination(node.dataset.loraKey);
      return;
    }
    if (action === "toggleLoraGroupExcluded") {
      toggleLoraGroupExcluded(node.dataset.loraKey);
      return;
    }
    if (action === "addLoraDetectionExclusion") {
      addLoraDetectionExclusion(document.getElementById("loraDetectionExclusionInput")?.value);
      return;
    }
    if (action === "excludeDetectedLora") {
      addLoraDetectionExclusion(node.dataset.loraName);
      return;
    }
    if (action === "removeLoraDetectionExclusion") {
      removeLoraDetectionExclusion(node.dataset.loraName);
      return;
    }
    if (action === "rescanLoraSorter") {
      await scanLoraSorterFolder();
      return;
    }
    if (action === "startLoraSorterMove") {
      await startLoraSorterMove();
      return;
    }
    if (action === "syncWildcards") {
      await syncWildcardsFromArchive();
      return;
    }
    if (action === "rebuildWildcards") {
      await rebuildWildcardsFromArchive();
      return;
    }
    if (action === "clearSearch") {
      ui.query = "";
      resetGalleryWindow();
      postRenderFocusSelector = "#globalSearch";
      render();
      return;
    }
    if (action === "resetGalleryFilters") {
      resetGalleryFilters();
      render();
      return;
    }
    if (action === "toggleFavoriteFilter") {
      ui.favoriteOnly = !ui.favoriteOnly;
      resetGalleryWindow();
      render();
      return;
    }
    if (action === "toggleDuplicatesFilter") {
      ui.showDuplicatesOnly = !ui.showDuplicatesOnly;
      resetGalleryWindow();
      render();
      return;
    }
    if (action === "toggleBulkDeleteMode") {
      ui.bulkDeleteMode = !ui.bulkDeleteMode;
      ui.selectedBulkDeleteIds = [];
      ui.bulkCategoryMode = false;
      ui.selectedBulkCategoryIds = [];
      ui.view = "gallery";
      ui.modal = null;
      render();
      return;
    }
    if (action === "toggleBulkCategoryMode") {
      ui.bulkCategoryMode = !ui.bulkCategoryMode;
      ui.selectedBulkCategoryIds = [];
      ui.bulkDeleteMode = false;
      ui.selectedBulkDeleteIds = [];
      ui.view = "gallery";
      ui.modal = null;
      render();
      return;
    }
    if (action === "cancelBulkDeleteMode") {
      ui.bulkDeleteMode = false;
      ui.selectedBulkDeleteIds = [];
      render();
      return;
    }
    if (action === "cancelBulkCategoryMode") {
      ui.bulkCategoryMode = false;
      ui.selectedBulkCategoryIds = [];
      render();
      return;
    }
    if (action === "bulkCategoryToggleItem") {
      event.stopPropagation();
      setBulkCategoryItemSelection(node.dataset.bulkCategoryId, node.checked);
      refreshBulkSelectionUi();
      return;
    }
    if (action === "applyBulkCategory") {
      const categoryId = document.getElementById("bulkCategorySelect")?.value;
      applyBulkCategory(categoryId);
      return;
    }
    if (action === "bulkToggleItem") {
      event.stopPropagation();
      setBulkDeleteItemSelection(node.dataset.bulkDeleteId, node.checked);
      refreshBulkSelectionUi();
      return;
    }
    if (action === "bulkSelectVisible") {
      toggleVisibleBulkDeleteSelection();
      refreshBulkSelectionUi();
      return;
    }
    if (action === "clearBulkDeleteSelection") {
      ui.selectedBulkDeleteIds = [];
      refreshBulkSelectionUi();
      return;
    }
    if (action === "confirmBulkDelete") {
      if (isVideoArchiveMode()) deleteSelectedVideoItems();
      else deleteSelectedItems();
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
      await saveItemState(item);
      render();
    }
    if (action === "openUploaded") {
      ui.modal = null;
      modalReturnAction = "";
      ui.view = "gallery";
      openItem(node.dataset.id);
    }
    if (action === "togglePendingUpload") togglePendingUpload(node.dataset.key);
    if (action === "removeSelectedPendingUploads") removeSelectedPendingUploads();
    if (action === "clearUploadWorkspace") clearUploadWorkspace();
    if (action === "saveAndAnalyzeUploads") await processPendingUploads(true);
    if (action === "analyzeOne") {
      if (isExifPromptMode()) {
        showToast("EXIF 모드에서는 재분석 대신 EXIF 원본 불러오기를 사용하세요.", "warning");
        return;
      }
      captureSelectedDetailDraft();
      await analyzeItem(node.dataset.id);
    }
    if (action === "reloadExif") {
      if (!isExifPromptMode()) {
        showToast("API 모드에서는 EXIF 원본 불러오기 대신 재분석을 사용하세요.", "warning");
        return;
      }
      captureSelectedDetailDraft();
      await reloadExifPrompt(node.dataset.id);
    }
    if (action === "bulkAnalyze") {
      let analyzedCount = 0;
      for (const item of state.items.filter((entry) => entry.status === "uploaded" || entry.status === "analysis_failed")) {
        await analyzeItem(item.id, false, { silent: true });
        analyzedCount += 1;
      }
      saveItemsState();
      render();
      if (analyzedCount) showToast(`${analyzedCount}개 이미지 분석이 끝났습니다.`, "success");
    }
    if (action === "exportJson") exportJson();
    if (action === "exportCsv") exportCsv();
    if (action === "copyPrompt") copyPrompt(node.dataset.id, node.dataset.mode);
    if (action === "copySection") copySection(node.dataset.id, node.dataset.section, node.dataset.lang);
    if (action === "copyVideoPrompt") copyVideoPrompt(node.dataset.id, node.dataset.mode);
    if (action === "copyVideoSection") copyVideoSection(node.dataset.id, node.dataset.section, node.dataset.lang);
    if (action === "saveVideoDetail") {
      await saveVideoDetail(node.dataset.id);
      return;
    }
    if (action === "deleteVideoItem") {
      deleteVideoItem(node.dataset.id);
      return;
    }
    if (action === "retranslateVideoSection") {
      await retranslateVideoSection(node.dataset.id, node.dataset.section);
      return;
    }
    if (action === "saveAndReadVideoUploads") {
      await processPendingVideoUploads();
      return;
    }
    if (action === "selectVideoThumbnail") {
      selectVideoThumbnail(node.dataset.uploadKey, node.dataset.index);
      return;
    }
    if (action === "removeSelectedPendingVideoUploads") {
      removeSelectedPendingVideoUploads();
      return;
    }
    if (action === "clearVideoUploadWorkspace") {
      clearVideoUploadWorkspace();
      return;
    }
    if (action === "togglePendingVideoUpload") {
      togglePendingVideoUpload(node.dataset.uploadKey);
      return;
    }
    if (action === "confirmVideoBulkDelete") {
      deleteSelectedVideoItems();
      return;
    }
    if (action === "addVideoCategory") {
      addVideoCategory();
      return;
    }
    if (action === "saveVideoCategory") {
      saveVideoCategory(node.dataset.id);
      return;
    }
    if (action === "deleteVideoCategory") {
      deleteVideoCategory(node.dataset.id);
      return;
    }
    if (action === "moveVideoCategory") {
      moveVideoCategory(node.dataset.id, Number(node.dataset.direction || 0));
      return;
    }
    if (action === "saveVideoCategorySettings") {
      saveVideoCategorySettings();
      return;
    }
    if (action === "saveVideoUploadSettings") {
      saveVideoUploadSettings();
      return;
    }
    if (action === "saveVideoCopySettings") {
      saveVideoCopySettings();
      return;
    }
    if (action === "setVideoCategoryFilter") {
      ui.videoCategory = node.dataset.category || "all";
      resetGalleryWindow();
      render();
      return;
    }
    if (action === "toggleEdit") {
      captureSelectedDetailDraft();
      ui.editMode = !ui.editMode;
      render();
    }
    if (action === "regenerateSection") {
      captureSelectedDetailDraft();
      await regenerateSection(node.dataset.id, node.dataset.section);
    }
    if (action === "retranslateSection") {
      captureSelectedDetailDraft();
      await retranslateSection(node.dataset.id, node.dataset.section);
    }
    if (action === "saveDetail") await saveDetail(node.dataset.id);
    if (action === "revisePrompt") await revisePromptFromDetail(node.dataset.id);
    if (action === "restoreBaseline") {
      const item = findItem(node.dataset.id);
      if (!item) return;
      captureSelectedDetailDraft();
      try {
        restorePromptBaseline(item);
        item.updatedAt = Date.now();
        const saved = await saveItemState(item);
        render();
        showToast(saved ? "원본 프롬프트로 되돌리고 서버에 저장했습니다." : "원본 프롬프트를 브라우저에 임시 저장했습니다.", saved ? "success" : "warning");
      } catch (error) {
        showToast(error.message || "원본 되돌리기 실패", "warning");
      }
    }
    if (action === "restoreVersion") {
      const item = findItem(node.dataset.id);
      const index = Number(node.dataset.index);
      const version = item?.versions?.[index];
      if (!item || !version?.promptJson) return;
      captureSelectedDetailDraft();
      applyPrompt(item, clonePromptJson(version.promptJson));
      syncPromptEditState(item, "manual");
      item.status = "modified";
      applyLocalTagsFromPrompt(item);
      const saved = await saveItemState(item);
      render();
      showToast(saved ? "이전 버전을 복원하고 서버에 저장했습니다." : "복원본을 브라우저에 임시 저장했습니다.", saved ? "success" : "warning");
    }
    if (action === "togglePromptCompare") {
      captureSelectedDetailDraft();
      ui.promptCompareMode = !ui.promptCompareMode;
      render();
    }
    if (action === "retitleOne") await retitleOneItem(node.dataset.id);
    if (action === "retagOne") await retagOneItem(node.dataset.id);
    if (action === "toggleDetailTag") {
      event.preventDefault();
      event.stopPropagation();
      const item = findItem(node.dataset.id);
      if (!item) return;
      collectDetailFields(item);
      const type = node.dataset.type;
      const key = node.dataset.key;
      const field = type === "outfit" ? "outfitTags" : "backgroundTags";
      const list = new Set(item[field] || []);
      if (list.has(key)) list.delete(key);
      else list.add(key);
      item[field] = [...list];
      item.updatedAt = Date.now();
      await saveItemState(item);
      render();
    }
    if (action === "batchRetitle") await batchRetitleAll();
    if (action === "batchRetag") batchRetagAll();
    if (action === "migrateBaselines") {
      migrateAllPromptBaselines();
      saveItemsState();
      render();
      showToast("원본 기준을 보정했습니다.", "success");
    }
    if (action === "exportArchive") await exportArchiveBackup();
    if (action === "importArchive") triggerArchiveImport();
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
    if (action === "clearShortcuts") clearAllShortcuts();
    if (action === "saveCategorySettings") saveCategorySettings();
    if (action === "addCategory") addCategory();
    if (action === "saveCategory") saveCategory(node.dataset.id);
    if (action === "deleteCategory") deleteCategory(node.dataset.id);
    if (action === "moveCategory") moveCategory(node.dataset.id, Number(node.dataset.direction));
    if (action === "addWildcardRule") addWildcardRule();
    if (action === "deleteWildcardRule") deleteWildcardRule(node.dataset.id);
    if (action === "moveWildcardRule") moveWildcardRule(node.dataset.id, Number(node.dataset.direction));
    if (action === "addManagedTag") addManagedTag(node.dataset.type);
    if (action === "saveManagedTag") saveManagedTag(node.dataset.type, node.dataset.key);
    if (action === "deleteManagedTag") deleteManagedTag(node.dataset.type, node.dataset.key);
    if (action === "moveManagedTag") moveManagedTag(node.dataset.type, node.dataset.key, Number(node.dataset.direction));
    if (action === "resetInstruction") {
      state.promptInstruction = activeDefaultInstruction;
      state.promptSettings = normalizePromptSettings(defaultPromptSettings);
      saveSettingsState();
      render();
    }
    if (action === "resetDefaultTags") resetDefaultTags();
    if (action === "resetSettingsOnly") resetSettingsOnly();
    if (action === "retryFailed") await retryFailed();
    if (action === "saveProvider") saveProvider(Number(node.dataset.index));
    if (action === "testProvider") await testProvider(Number(node.dataset.index));
  }

  function bindUploadEvents() {
    const videoDropZone = document.getElementById("videoDropZone");
    const videoInput = document.getElementById("videoFileInput");
    const pickVideo = document.getElementById("pickVideoFiles");
    if (videoDropZone && videoInput && pickVideo) {
      pickVideo.addEventListener("click", () => videoInput.click());
      videoInput.addEventListener("change", () => addPendingVideoFiles(videoInput.files));
      document.getElementById("videoUploadTitle")?.addEventListener("input", captureVideoUploadDraft);
      document.getElementById("videoUploadCategory")?.addEventListener("change", captureVideoUploadDraft);
      if (state.uploadSettings.allowDragDrop) {
        ["dragenter", "dragover"].forEach((name) => {
          videoDropZone.addEventListener(name, (event) => {
            event.preventDefault();
            videoDropZone.classList.add("dragging");
          });
        });
        ["dragleave", "drop"].forEach((name) => {
          videoDropZone.addEventListener(name, (event) => {
            event.preventDefault();
            videoDropZone.classList.remove("dragging");
          });
        });
        videoDropZone.addEventListener("drop", (event) => addPendingVideoFiles(event.dataTransfer.files));
      }
      return;
    }
    const dropZone = document.getElementById("dropZone");
    const input = document.getElementById("fileInput");
    const pick = document.getElementById("pickFiles");
    if (!dropZone || !input || !pick) return;
    pick.addEventListener("click", () => input.click());
    input.addEventListener("change", () => addPendingUploadFiles(input.files));
    document.getElementById("uploadTitle")?.addEventListener("input", captureUploadDraft);
    document.getElementById("uploadCategory")?.addEventListener("change", captureUploadDraft);
    document.getElementById("uploadCustomInstruction")?.addEventListener("input", captureUploadDraft);
    document.querySelectorAll('input[name="uploadExclude"]').forEach((node) => {
      node.addEventListener("change", rememberUploadExcludeOptions);
    });
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
      dropZone.addEventListener("drop", (event) => addPendingUploadFiles(event.dataTransfer.files));
    }
  }

  function bindPromptViewerEvents() {
    const input = document.getElementById("promptViewerFileInput");
    const pick = document.getElementById("promptViewerPickFile");
    const dropzone = document.getElementById("promptViewerDropzone");
    if (!input || !pick || !dropzone) return;
    pick.addEventListener("click", () => input.click());
    input.addEventListener("change", () => {
      const [file] = [...(input.files || [])];
      if (file) inspectPromptViewerFile(file);
    });
    ["dragenter", "dragover"].forEach((name) => {
      dropzone.addEventListener(name, (event) => {
        event.preventDefault();
        dropzone.classList.add("dragging");
      });
    });
    ["dragleave", "drop"].forEach((name) => {
      dropzone.addEventListener(name, (event) => {
        event.preventDefault();
        dropzone.classList.remove("dragging");
      });
    });
    dropzone.addEventListener("drop", (event) => {
      const [file] = [...(event.dataTransfer?.files || [])];
      if (file) inspectPromptViewerFile(file);
    });
  }

  function bindVideoPromptViewerEvents() {
    const input = document.getElementById("videoPromptViewerFileInput");
    const pick = document.getElementById("videoPromptViewerPickFile");
    const dropzone = document.getElementById("videoPromptViewerDropzone");
    if (!input || !pick || !dropzone) return;
    pick.addEventListener("click", () => input.click());
    input.addEventListener("change", () => {
      const [file] = [...(input.files || [])];
      if (file) inspectVideoPromptViewerFile(file);
    });
    ["dragenter", "dragover"].forEach((name) => {
      dropzone.addEventListener(name, (event) => {
        event.preventDefault();
        dropzone.classList.add("dragging");
      });
    });
    ["dragleave", "drop"].forEach((name) => {
      dropzone.addEventListener(name, (event) => {
        event.preventDefault();
        dropzone.classList.remove("dragging");
      });
    });
    dropzone.addEventListener("drop", (event) => {
      const [file] = [...(event.dataTransfer?.files || [])];
      if (file) inspectVideoPromptViewerFile(file);
    });
  }

  async function inspectVideoPromptViewerFile(file) {
    resetVideoPromptViewerState();
    if (!isVideoUploadFile(file)) {
      videoPromptViewerState.error = "WebM, MP4, MOV 비디오만 확인할 수 있습니다.";
      render();
      return;
    }
    const maxFileSizeMb = Math.max(Number(state.uploadSettings.maxFileSizeMb) || 100, 500);
    if (Number(file?.size || 0) > maxFileSizeMb * 1024 * 1024) {
      videoPromptViewerState.error = `${maxFileSizeMb}MB 이하 비디오만 확인할 수 있습니다.`;
      render();
      return;
    }
    const requestId = videoPromptViewerRequestId;
    Object.assign(videoPromptViewerState, {
      fileName: file.name || "비디오",
      previewUrl: URL.createObjectURL(file),
      loading: true,
    });
    render();
    try {
      const result = await readVideoPromptFromFile(file);
      if (requestId !== videoPromptViewerRequestId) return;
      const promptJson = result?.promptJson ? ensureVideoPromptJson(result.promptJson) : null;
      Object.assign(videoPromptViewerState, {
        loading: false,
        promptJson,
        rawText: result?.rawText || "",
        source: result?.source || "",
        error: promptJson
          ? ""
          : result?.rawText
            ? "6문단 프롬프트 형식을 찾지 못했습니다. 감지된 원문을 확인해 주세요."
            : "비디오 메타데이터에서 프롬프트를 찾지 못했습니다.",
      });
    } catch (error) {
      if (requestId !== videoPromptViewerRequestId) return;
      videoPromptViewerState.loading = false;
      videoPromptViewerState.error = error.message || "비디오 메타데이터를 읽지 못했습니다.";
    }
    render();
  }

  function videoPromptViewerSectionText(sectionKey) {
    return (videoPromptViewerState.promptJson?.[sectionKey]?.sentences || [])
      .map((sentence) => sentence.en || "")
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  function videoPromptViewerCopyText() {
    return videoSectionMeta
      .map((section) => videoPromptViewerSectionText(section.key))
      .filter(Boolean)
      .join("\n\n\n");
  }

  async function inspectPromptViewerFile(file) {
    const supportedType = ["image/png", "image/jpeg", "image/webp"].includes(file?.type)
      || /\.(png|jpe?g|webp)$/i.test(file?.name || "");
    const maxFileSizeMb = Number(state.uploadSettings.maxFileSizeMb) || defaultUploadSettings.maxFileSizeMb;
    resetPromptViewerState();
    if (!supportedType) {
      promptViewerState.error = "PNG, JPEG, WebP 이미지만 확인할 수 있습니다.";
      render();
      return;
    }
    if (Number(file?.size || 0) > maxFileSizeMb * 1024 * 1024) {
      promptViewerState.error = `${maxFileSizeMb}MB 이하 이미지만 확인할 수 있습니다.`;
      render();
      return;
    }
    const requestId = promptViewerRequestId;
    Object.assign(promptViewerState, {
      fileName: file.name || "이미지",
      previewUrl: URL.createObjectURL(file),
      loading: true,
    });
    render();
    try {
      const result = await readPromptViewerFile(file);
      if (requestId !== promptViewerRequestId) return;
      Object.assign(promptViewerState, {
        loading: false,
        promptJson: result.promptJson,
        rawText: result.rawText || "",
        source: result.source || "",
        error: result.promptJson
          ? ""
          : result.rawText
            ? "5문단 프롬프트 형식을 찾지 못했습니다. 감지된 원문을 확인해 주세요."
            : "이미지 메타데이터에서 프롬프트를 찾지 못했습니다.",
      });
    } catch (error) {
      if (requestId !== promptViewerRequestId) return;
      promptViewerState.loading = false;
      promptViewerState.error = error.message || "이미지 메타데이터를 읽지 못했습니다.";
    }
    render();
  }

  function promptViewerSectionText(sectionKey) {
    return (promptViewerState.promptJson?.[sectionKey]?.sentences || [])
      .map((sentence) => sentence.en || "")
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  function promptViewerCopyText(options = {}) {
    return sectionMeta
      .filter((section) => !(options.excludeAppearance && section.key === "appearance"))
      .map((section) => promptViewerSectionText(section.key))
      .filter(Boolean)
      .join("\n\n\n");
  }

  function captureUploadDraft() {
    ui.uploadDraft.title = document.getElementById("uploadTitle")?.value || ui.uploadDraft.title || "";
    ui.uploadDraft.categoryId = document.getElementById("uploadCategory")?.value || ui.uploadDraft.categoryId || state.categories[0]?.id || "";
    ui.uploadDraft.customInstruction = document.getElementById("uploadCustomInstruction")?.value || ui.uploadDraft.customInstruction || "";
  }

  window.addEventListener("paste", (event) => {
    const files = [...(event.clipboardData?.items || [])]
      .filter((item) => item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter(Boolean);
    if (ui.modal === "videoPromptViewer") {
      const videoFiles = [...(event.clipboardData?.items || [])]
        .map((item) => item.getAsFile())
        .filter((file) => file && isVideoUploadFile(file));
      if (videoFiles.length) inspectVideoPromptViewerFile(videoFiles[0]);
      return;
    }
    if (!files.length) return;
    if (ui.modal === "promptViewer") {
      inspectPromptViewerFile(files[0]);
      return;
    }
    if (ui.modal === "upload" && state.uploadSettings.allowClipboardPaste) addPendingUploadFiles(files);
  });

  function bindPromptEvents() {
    document.querySelectorAll(".sentence-fragment").forEach((node) => {
      node.addEventListener("mouseenter", () => {
        if (!state.copyDisplaySettings.hoverHighlight || !state.copyDisplaySettings.linkedHighlight) return;
        ui.selectedFragmentId = node.dataset.fragmentId;
        ui.selectedSentenceId = node.closest(".sentence")?.dataset.sentenceId || null;
        highlightPromptLink(ui.selectedSentenceId, ui.selectedFragmentId);
      });
      node.addEventListener("click", (event) => {
        if (!state.copyDisplaySettings.clickHighlight || !state.copyDisplaySettings.linkedHighlight) return;
        event.stopPropagation();
        ui.selectedFragmentId = node.dataset.fragmentId;
        ui.selectedSentenceId = node.closest(".sentence")?.dataset.sentenceId || null;
        highlightPromptLink(ui.selectedSentenceId, ui.selectedFragmentId);
      });
    });
    document.querySelectorAll(".sentence").forEach((node) => {
      node.addEventListener("mouseenter", () => {
        if (!state.copyDisplaySettings.hoverHighlight || !state.copyDisplaySettings.linkedHighlight) return;
        if (node.querySelector(".sentence-fragment:hover")) return;
        ui.selectedFragmentId = null;
        ui.selectedSentenceId = node.dataset.sentenceId;
        highlightPromptLink(ui.selectedSentenceId, null);
      });
      node.addEventListener("click", () => {
        if (!state.copyDisplaySettings.clickHighlight || !state.copyDisplaySettings.linkedHighlight) return;
        ui.selectedFragmentId = null;
        ui.selectedSentenceId = node.dataset.sentenceId;
        highlightPromptLink(ui.selectedSentenceId, null);
      });
      node.addEventListener("input", () => updateSentence(node));
    });
  }

  function resetGalleryWindow() {
    if (galleryLoadTimer) window.clearTimeout(galleryLoadTimer);
    galleryLoadTimer = null;
    ui.page = 1;
    ui.galleryLoadedPages = 1;
    ui.galleryLoading = false;
  }

  function bindGalleryInfiniteScroll() {
    if (window.promptArchiveGalleryScrollHandler) {
      window.removeEventListener("scroll", window.promptArchiveGalleryScrollHandler);
      window.promptArchiveGalleryScrollHandler = null;
    }
    if (ui.view !== "gallery" || ui.modal || state.albumSettings.loadMode === "pages") return;
    window.promptArchiveGalleryScrollHandler = () => maybeLoadMoreGallery();
    window.addEventListener("scroll", window.promptArchiveGalleryScrollHandler, { passive: true });
    maybeLoadMoreGallery();
  }

  function maybeLoadMoreGallery() {
    if (ui.view !== "gallery" || ui.modal || ui.galleryLoading || state.albumSettings.loadMode === "pages") return;
    const perPage = state.albumSettings.columns * state.albumSettings.rows;
    const totalCount = currentFilteredArchiveItems().length;
    if ((ui.galleryLoadedPages || 1) * perPage >= totalCount) return;
    const scrollBottom = window.scrollY + window.innerHeight;
    const distanceToBottom = document.documentElement.scrollHeight - scrollBottom;
    if (distanceToBottom > 420) return;
    ui.galleryLoading = true;
    refreshGalleryContentPreservingSearch();
    galleryLoadTimer = window.setTimeout(() => {
      galleryLoadTimer = null;
      if (ui.view !== "gallery" || ui.modal || state.albumSettings.loadMode === "pages") {
        ui.galleryLoading = false;
        return;
      }
      ui.galleryLoadedPages = (ui.galleryLoadedPages || 1) + 1;
      ui.galleryLoading = false;
      refreshGalleryContentPreservingSearch();
      window.setTimeout(() => maybeLoadMoreGallery(), 0);
    }, 260);
  }

  function refreshGalleryContentPreservingSearch() {
    const search = document.getElementById("globalSearch");
    if (search && (document.activeElement === search || searchImeComposing)) {
      const content = document.querySelector("main > .content");
      if (content && ui.view === "gallery" && !ui.modal) {
        content.innerHTML = renderGallery();
        bindGalleryContentEvents();
        return;
      }
    }
    render();
  }

  function bindSettingsEvents() {
    document.querySelectorAll("form.provider-card").forEach((form) => {
      form.addEventListener("submit", (event) => event.preventDefault());
    });
    document.querySelectorAll("[data-theme]").forEach((node) => {
      node.addEventListener("click", () => {
        document.querySelectorAll("[data-theme]").forEach((themeNode) => themeNode.classList.toggle("active", themeNode === node));
      });
    });
    document.querySelectorAll("[data-provider-use-image], [data-provider-use-translation], [data-provider-use-cleanup], [data-provider-use-tagging]").forEach((node) => {
      node.addEventListener("change", () => saveProviderCheckbox(node));
    });
  }

  function highlightPromptLink(sentenceId, fragmentId) {
    document.querySelectorAll(".sentence").forEach((node) => {
      node.classList.toggle("active", node.dataset.sentenceId === sentenceId && !fragmentId);
    });
    document.querySelectorAll(".sentence-fragment").forEach((node) => {
      node.classList.toggle("active", node.dataset.fragmentId === fragmentId);
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

  function addPendingUploadFiles(fileList) {
    const files = [...(fileList || [])].filter((file) => file?.type?.startsWith("image/"));
    if (!files.length) return;
    const existing = new Set(ui.pendingUploadFiles.map(pendingUploadKey));
    ui.pendingUploadErrors = ui.pendingUploadErrors || {};
    files.forEach((file) => {
      const key = pendingUploadKey(file);
      if (!existing.has(key)) {
        ui.pendingUploadFiles.push(file);
        existing.add(key);
      }
    });
    ui.pendingUploadFiles = ui.pendingUploadFiles.slice(0, state.advancedSettings.maxImagesPerBatch);
    const validKeys = new Set(ui.pendingUploadFiles.map(pendingUploadKey));
    ui.selectedPendingUploadKeys = ui.selectedPendingUploadKeys.filter((key) => validKeys.has(key));
    ui.pendingUploadErrors = Object.fromEntries(Object.entries(ui.pendingUploadErrors || {}).filter(([key]) => validKeys.has(key)));
    render();
  }

  function rememberUploadExcludeOptions() {
    state.uploadSettings.lastExcludeOptions = selectedCheckboxValues("uploadExclude");
    saveSettingsState();
  }

  async function processPendingUploads(shouldAnalyze) {
    if (!ui.pendingUploadFiles.length) {
      alert("먼저 업로드할 이미지를 선택하세요.");
      return;
    }
    rememberUploadExcludeOptions();
    const files = [...ui.pendingUploadFiles];
    let exifPromptByKey = null;
    if (isExifPromptMode()) {
      const validation = await validatePendingExifPrompts(files);
      if (validation.invalidKeys.length) {
        ui.pendingUploadErrors = validation.errors;
        ui.selectedPendingUploadKeys = validation.invalidKeys;
        render();
        showToast(`${validation.invalidKeys.length}개 파일에서 EXIF 프롬프트를 찾지 못했습니다. 강조된 파일을 제거한 뒤 다시 저장하세요.`, "warning", 4200);
        return;
      }
      exifPromptByKey = validation.prompts;
      ui.pendingUploadErrors = {};
    }
    ui.selectedPendingUploadKeys = [];
    const failedFiles = await processFiles(files, shouldAnalyze, { exifPromptByKey });
    const failedKeys = new Set(failedFiles.map(pendingUploadKey));
    revokePendingUploadUrls(files.filter((file) => !failedKeys.has(pendingUploadKey(file))));
    ui.pendingUploadFiles = failedFiles;
    ui.selectedPendingUploadKeys = [...failedKeys];
    ui.uploadProgress = null;
    render();
  }

  function togglePendingUpload(key) {
    if (!key) return;
    if (ui.selectedPendingUploadKeys.includes(key)) {
      ui.selectedPendingUploadKeys = ui.selectedPendingUploadKeys.filter((entry) => entry !== key);
    } else {
      ui.selectedPendingUploadKeys = [...ui.selectedPendingUploadKeys, key];
    }
    render();
  }

  function removeSelectedPendingUploads() {
    const selected = new Set(ui.selectedPendingUploadKeys);
    if (!selected.size) return;
    const removed = ui.pendingUploadFiles.filter((file) => selected.has(pendingUploadKey(file)));
    revokePendingUploadUrls(removed);
    ui.pendingUploadFiles = ui.pendingUploadFiles.filter((file) => !selected.has(pendingUploadKey(file)));
    ui.pendingUploadErrors = Object.fromEntries(Object.entries(ui.pendingUploadErrors || {}).filter(([key]) => !selected.has(key)));
    ui.selectedPendingUploadKeys = [];
    render();
  }

  function clearUploadWorkspace() {
    revokePendingUploadUrls(ui.pendingUploadFiles);
    ui.pendingUploadFiles = [];
    ui.selectedPendingUploadKeys = [];
    ui.pendingUploadErrors = {};
    ui.uploadQueue = [];
    ui.uploadProgress = null;
    ui.uploadDraft = { title: "", categoryId: state.categories[0]?.id || "", customInstruction: "" };
    render();
  }

  async function processFiles(fileList, shouldAnalyze = false, options = {}) {
    const files = [...fileList].slice(0, state.advancedSettings.maxImagesPerBatch);
    const failedFiles = [];
    const exifMode = isExifPromptMode();
    captureUploadDraft();
    const title = ui.uploadDraft.title.trim();
    const categoryId = ui.uploadDraft.categoryId || state.categories[0]?.id || "";
    const tags = [];
    const customInstruction = ui.uploadDraft.customInstruction.trim();
    const excludeOptions = selectedCheckboxValues("uploadExclude");
    ui.uploadProgress = files.length ? { done: 0, total: files.length } : null;
    render();
    for (const [index, file] of files.entries()) {
      let item = null;
      let queueEntry = null;
      try {
        validateUploadFile(file);
        if (state.uploadSettings.detectDuplicates && isDuplicateFile(file)) {
          throw new Error("같은 이름과 용량의 이미지가 이미 업로드되어 있습니다.");
        }
        const exifPrompt = exifMode ? (options.exifPromptByKey?.[pendingUploadKey(file)] || await readExifPromptFromFile(file)) : null;
        const existingPromptDuplicate = state.uploadSettings.detectDuplicates && exifPrompt
          ? findCorePromptDuplicate({ promptJson: exifPrompt.promptJson })
          : null;
        if (existingPromptDuplicate) {
          throw new Error(`의상·배경 프롬프트가 "${displayTitle(existingPromptDuplicate)}" 항목과 같습니다. 외모·포즈·디테일 차이는 중복 판정에서 제외합니다.`);
        }
        const optimized = await optimizeImageFile(file, state.uploadSettings);
        item = {
          id: uid("img"),
          title: title || "",
          titleSummary: "",
          memo: "",
          imageUrl: optimized.displayImage.dataUrl,
          thumbnailUrl: optimized.thumbnailImage.dataUrl,
          displayImage: optimized.displayImage,
          thumbnailImage: optimized.thumbnailImage,
          analysisImage: optimized.analysisImage,
          originalImage: optimized.originalImage,
          uploadMeta: exifMode ? {
            ...optimized.meta,
            promptSourceMode: "exif",
            exifPromptFound: true,
            exifPromptSource: exifPrompt?.source || "metadata",
            exifPromptLength: exifPrompt?.rawText?.length || 0,
            exifRawText: exifPrompt?.rawText || "",
          } : optimized.meta,
          categoryId,
          tags,
          outfitTags: inferTags(file.name, "outfit"),
          backgroundTags: inferTags(file.name, "background"),
          status: exifMode ? "analyzed" : shouldAnalyze ? "analyzing" : "uploaded",
          isFavorite: false,
          promptJson: exifMode ? exifPrompt.promptJson : null,
          finalPrompt: exifMode ? promptText({ promptJson: exifPrompt.promptJson }, "final") : "",
          errorMessage: "",
          customInstruction,
          excludeOptions,
          includeOptions: [],
          analysisRequest: exifMode ? "EXIF / metadata prompt import" : "",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          versions: [],
        };
        state.items.unshift(item);
        queueEntry = {
          name: file.name,
          originalSize: file.size,
          optimizedSize: optimized.displayImage.size,
          url: optimized.thumbnailImage.dataUrl,
          status: exifMode ? "EXIF 처리 중" : shouldAnalyze ? "분석 중" : "저장 중",
          itemId: item.id,
        };
        ui.uploadQueue.unshift(queueEntry);
        if (exifMode) {
          const exifTagContext = `${file.name} ${promptText(item, "final")}`;
          item.outfitTags = inferTags(exifTagContext, "outfit");
          item.backgroundTags = inferTags(exifTagContext, "background");
          if (state.uploadSettings.translateExifPrompt) {
            try {
              item.status = "modified";
              await translateItemPromptSections(item, { silent: true });
              item.status = "analyzed";
              ui.uploadQueue[0].status = "EXIF 저장 및 번역 완료";
            } catch (translationError) {
              item.status = "modified";
              item.errorMessage = `EXIF 프롬프트는 저장됐지만 번역 실패: ${translationError.message || translationError}`;
              ui.uploadQueue[0].status = "EXIF 저장 완료, 번역 실패";
              ui.uploadQueue[0].error = item.errorMessage;
            }
          }
          try {
            await ensureKoreanTitle(item, { force: !title });
            if (ui.uploadQueue[0] && !ui.uploadQueue[0].error) {
              ui.uploadQueue[0].status = `${ui.uploadQueue[0].status} · 제목 요약`;
            }
          } catch (titleError) {
            if (!isUsableAlbumTitle(item.title)) {
              item.titleSummary = compactImageTitle(item);
              item.title = item.titleSummary;
            }
            if (ui.uploadQueue[0]) {
              ui.uploadQueue[0].status = `${ui.uploadQueue[0].status} · 제목 실패`;
            }
            console.warn("title summary failed after EXIF import", titleError);
          }
          markPromptBaseline(item, "exif");
          item.status = item.errorMessage ? "modified" : "analyzed";
        } else if (shouldAnalyze) {
          await analyzeItem(item.id, false, { silent: true });
        }
        const analyzedPromptDuplicate = state.uploadSettings.detectDuplicates && item.status !== "analysis_failed"
          ? findCorePromptDuplicate(item, item.id)
          : null;
        if (analyzedPromptDuplicate) {
          throw new Error(`의상·배경 프롬프트가 "${displayTitle(analyzedPromptDuplicate)}" 항목과 같습니다. 외모·포즈·디테일 차이는 중복 판정에서 제외합니다.`);
        }
        if (queueEntry) queueEntry.status = "저장 확인 중";
        render();
        const serverSaved = await saveItemState(item);
        const durablySaved = serverSaved || persistenceStatus === "fallback";
        if (!durablySaved) throw new Error("서버와 브라우저 임시 저장에 모두 실패했습니다. 원본 파일을 유지합니다.");
        if (queueEntry) {
          if (exifMode) queueEntry.status = item.errorMessage ? "EXIF 저장 완료, 일부 후처리 실패" : "EXIF 프롬프트 저장 완료";
          else if (shouldAnalyze) queueEntry.status = item.status === "analyzed" ? "저장 및 분석 완료" : "분석 실패, 임시 프롬프트 저장";
          else queueEntry.status = "저장 완료";
          if (!serverSaved) queueEntry.status += " · 브라우저 임시 저장";
        }
        render();
        if (exifMode) showToast(`${item.title || file.name} EXIF 프롬프트 저장이 끝났습니다.`, item.errorMessage || !serverSaved ? "warning" : "success");
        else if (shouldAnalyze) showToast(`${item.title || file.name} 분석과 저장이 끝났습니다.`, item.status === "analyzed" && serverSaved ? "success" : "warning");
      } catch (error) {
        if (item) state.items = state.items.filter((entry) => entry.id !== item.id);
        const errorMessage = error.message || "이미지 변환 또는 저장에 실패했습니다.";
        failedFiles.push(file);
        ui.pendingUploadErrors[pendingUploadKey(file)] = errorMessage;
        if (queueEntry) {
          queueEntry.status = "업로드 오류";
          queueEntry.error = errorMessage;
          delete queueEntry.itemId;
        } else {
          ui.uploadQueue.unshift({
            name: file.name,
            originalSize: file.size,
            optimizedSize: 0,
            url: "",
            status: "업로드 오류",
            error: errorMessage,
          });
        }
        render();
      } finally {
        if (ui.uploadProgress) ui.uploadProgress = { done: index + 1, total: files.length };
        render();
      }
    }
    return failedFiles;
  }

  async function reloadExifPrompt(id, shouldRender = true) {
    const item = findItem(id);
    if (!item) return;
    item.status = "analyzing";
    item.errorMessage = "";
    item.updatedAt = Date.now();
    item.analysisRequest = "EXIF / metadata prompt reload";
    if (shouldRender) render();
    try {
      const exifPrompt = await loadExifPromptForItem(item);
      applyPrompt(item, exifPrompt.promptJson);
      item.uploadMeta = {
        ...(item.uploadMeta || {}),
        promptSourceMode: "exif",
        exifPromptFound: true,
        exifPromptSource: exifPrompt.source || item.uploadMeta?.exifPromptSource || "metadata",
        exifPromptLength: exifPrompt.rawText?.length || 0,
        exifRawText: exifPrompt.rawText || item.uploadMeta?.exifRawText || "",
      };
      applyLocalTagsFromPrompt(item);
      if (state.uploadSettings.translateExifPrompt) {
        try {
          await translateItemPromptSections(item, { silent: true });
        } catch (translationError) {
          item.errorMessage = `EXIF는 불러왔지만 번역 실패: ${translationError.message || translationError}`;
        }
      }
      try {
        await ensureKoreanTitle(item, { force: true });
      } catch (titleError) {
        if (!isUsableAlbumTitle(item.title)) {
          item.titleSummary = compactImageTitle(item);
          item.title = item.titleSummary;
        }
        console.warn("title summary failed after EXIF reload", titleError);
      }
      markPromptBaseline(item, "exif");
      item.status = item.errorMessage ? "modified" : "analyzed";
      item.updatedAt = Date.now();
      const saved = await saveItemState(item);
      if (shouldRender) render();
      showToast(item.errorMessage ? "EXIF 원본을 불러왔지만 일부 후처리에 실패했습니다." : saved ? "EXIF 원본 프롬프트를 다시 불러오고 저장했습니다." : "EXIF 원본을 브라우저에 임시 저장했습니다.", item.errorMessage || !saved ? "warning" : "success");
    } catch (error) {
      item.status = "modified";
      item.errorMessage = error.message || "EXIF 원본 프롬프트를 불러오지 못했습니다.";
      item.updatedAt = Date.now();
      await saveItemState(item);
      if (shouldRender) render();
      showToast(item.errorMessage, "warning", 2800);
    }
  }

  async function loadExifPromptForItem(item) {
    const rawText = String(item.uploadMeta?.exifRawText || "").trim();
    if (rawText) {
      const parsed = parseExifPromptMetadata([{
        source: item.uploadMeta?.exifPromptSource || "stored-exif-raw",
        text: rawText,
      }]);
      if (parsed?.promptJson) return parsed;
      throw new Error("저장된 EXIF 원문 파싱 실패");
    }

    const file = await itemImageAsFile(item);
    if (!file) {
      throw new Error("EXIF 원문 미보관 · 원본 이미지 없음");
    }
    try {
      return await readExifPromptFromFile(file);
    } catch (error) {
      throw new Error(`이미지 메타 읽기 실패: ${error.message || error}`);
    }
  }

  async function itemImageAsFile(item) {
    const candidates = [
      item.originalImage?.dataUrl,
      item.displayImage?.dataUrl,
      item.imageUrl,
      item.analysisImage?.dataUrl,
    ].filter(Boolean);
    for (const src of candidates) {
      try {
        const file = await urlOrDataUrlToFile(src, item.uploadMeta?.originalName || `${item.id}.img`, item.uploadMeta?.originalType || "");
        if (file) return file;
      } catch (_error) {}
    }
    return null;
  }

  async function urlOrDataUrlToFile(src, fileName, preferredType) {
    const value = String(src || "").trim();
    if (!value) return null;
    if (value.startsWith("data:")) {
      const response = await fetch(value);
      const blob = await response.blob();
      const type = preferredType || blob.type || "application/octet-stream";
      return new File([blob], fileName || "image.bin", { type });
    }
    const response = await fetch(value);
    if (!response.ok) throw new Error(`image fetch failed: ${response.status}`);
    const blob = await response.blob();
    const type = preferredType || blob.type || "application/octet-stream";
    return new File([blob], fileName || "image.bin", { type });
  }

  async function analyzeItem(id, shouldRender = true, options = {}) {
    const item = findItem(id);
    if (!item) return;
    if (isExifPromptMode() && !options.forceApi) {
      showToast("EXIF 모드에서는 재분석 대신 EXIF 원본 불러오기를 사용하세요.", "warning");
      return;
    }
    let completedWithFallback = false;
    item.status = "analyzing";
    item.updatedAt = Date.now();
    item.analysisRequest = buildAnalysisRequest(item);
    if (shouldRender) render();
    try {
      const result = await requestProviderAnalysis(item);
      applyAnalysisResult(item, result);
      try {
        await ensureKoreanTitle(item, { force: true });
      } catch (titleError) {
        if (!isUsableAlbumTitle(item.title)) {
          item.titleSummary = item.titleSummary || compactImageTitle(item);
          item.title = item.titleSummary;
        }
        console.warn("title summary failed after analysis", titleError);
      }
      markPromptBaseline(item, "analysis");
    } catch (error) {
      const failureMessage = error.message || "API 분석에 실패해 로컬 임시 분석으로 대체했습니다.";
      item.outfitTags = item.outfitTags?.length ? item.outfitTags : inferTags(item.title + " " + item.tags.join(" "), "outfit");
      item.backgroundTags = item.backgroundTags?.length ? item.backgroundTags : inferTags(item.title + " " + item.tags.join(" "), "background");
      applyPrompt(item, makePrompt(item.tags.includes("product") ? "product" : "upload"));
      item.status = "analysis_failed";
      item.errorMessage = failureMessage;
      completedWithFallback = true;
      try {
        await ensureKoreanTitle(item, { force: true });
      } catch (_titleError) {
        if (!isUsableAlbumTitle(item.title)) {
          item.titleSummary = compactImageTitle(item);
          item.title = item.titleSummary;
        }
      }
    }
    let savedToServer = true;
    if (shouldRender) {
      savedToServer = await saveItemState(item);
      render();
    }
    if (!options.silent) {
      const message = completedWithFallback
        ? "API 분석 실패, 임시 프롬프트로 대체했습니다."
        : savedToServer ? "AI 분석과 서버 저장이 끝났습니다." : "AI 분석 결과를 브라우저에 임시 저장했습니다.";
      showToast(message, completedWithFallback || !savedToServer ? "warning" : "success");
    }
  }

  async function requestProviderAnalysis(item) {
    const response = await fetch(SERVER_ANALYZE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        item: {
          id: item.id,
          title: item.title,
          tags: item.tags,
          customInstruction: item.customInstruction,
          excludeOptions: item.excludeOptions,
          analysisImage: item.analysisImage,
          imageUrl: item.imageUrl,
        },
        request: item.analysisRequest,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) throw new Error(payload.message || payload.error || "API 분석 요청에 실패했습니다.");
    return payload;
  }

  function applyAnalysisResult(item, result) {
    const promptJson = normalizeAnalysisPrompt(result.promptJson || result.promptSections);
    applyPrompt(item, promptJson);
    // Tags are local keyword matching against prompt text (not a separate API role).
    applyLocalTagsFromPrompt(item);
    // Album titles are filled by the translation provider via /api/title-summary.
    // Ignore analysis titleSummary fragments so we keep one consistent title path.
    if (!isKoreanTitleSummary(item.titleSummary)) item.titleSummary = "";
    item.errorMessage = "";
  }

  function applyLocalTagsFromPrompt(item) {
    const sectionText = (key) => (item.promptJson?.[key]?.sentences || [])
      .map((sentence) => [sentence.en, sentence.ko].filter(Boolean).join(" "))
      .join(" ");
    // Match outfit tags from outfit section, place tags from background section first.
    const outfitContext = [
      sectionText("outfit"),
      item.title || "",
    ].filter(Boolean).join(" ");
    const placeContext = [
      sectionText("background"),
      item.title || "",
    ].filter(Boolean).join(" ");
    const fullFallback = [
      promptText(item, "final"),
      promptText(item, "ko"),
      promptText(item, "en"),
      item.finalPrompt || "",
    ].filter(Boolean).join(" ");
    item.outfitTags = inferTags(outfitContext || fullFallback, "outfit");
    item.backgroundTags = inferTags(placeContext || fullFallback, "background");
  }

  function cleanTitleSummary(value) {
    let text = String(value || "")
      .replace(/^["'`]+|["'`]+$/g, "")
      .replace(/\.(jpe?g|png|webp|gif|bmp|avif)\b/ig, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!text || looksLikeFileTitle(text) || looksLikeEnglishPromptSnippet(text)) return "";
    if (text.length > 60) text = text.slice(0, 60).replace(/\s+\S*$/, "").trim();
    return text;
  }

  async function ensureKoreanTitle(item, options = {}) {
    if (!item?.promptJson) return false;
    const force = options.force === true;
    if (!force && isKoreanTitleSummary(item.titleSummary)) {
      if (!isUsableAlbumTitle(item.title) || looksLikeEnglishPromptSnippet(item.title)) {
        item.title = item.titleSummary;
      }
      return false;
    }
    if (!force && isUsableAlbumTitle(item.title) && isKoreanTitleSummary(item.title)) {
      item.titleSummary = item.title;
      return false;
    }
    const summary = await requestTitleSummary(item);
    if (!summary) return false;
    item.titleSummary = summary;
    if (force || !isUsableAlbumTitle(item.title) || looksLikeEnglishPromptSnippet(item.title)) {
      item.title = summary;
    }
    item.updatedAt = Date.now();
    return true;
  }

  async function requestTitleSummary(item) {
    const sections = {};
    sectionMeta.forEach((section) => {
      const sentences = item.promptJson?.[section.key]?.sentences || [];
      const text = sentences
        .map((sentence) => [sentence.ko, sentence.en].filter(Boolean).join(" / "))
        .filter(Boolean)
        .join(" ");
      if (text) sections[section.key] = text;
    });
    const promptTextValue = [
      promptText(item, "ko"),
      promptText(item, "en"),
      item.finalPrompt || "",
    ].filter(Boolean).join("\n\n").trim();
    // Only place/background tags are sent as title context.
    const placeTags = tagNames(item.backgroundTags, "background").filter((name) => name && name !== "기타");
    const response = await fetch(SERVER_TITLE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        itemId: item.id,
        promptText: promptTextValue.slice(0, 6000),
        sections,
        backgroundTags: placeTags,
        placeTags,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
      throw new Error(payload.message || payload.error || "제목 요약 요청에 실패했습니다.");
    }
    return cleanTitleSummary(payload.titleSummary) || "";
  }

  function normalizeAnalysisPrompt(value) {
    const source = value?.promptSections || value || {};
    const prompt = {};
    sectionMeta.forEach((section) => {
      const sectionValue = source[section.key] || {};
      const sentences = Array.isArray(sectionValue.sentences) ? sectionValue.sentences : Array.isArray(sectionValue) ? sectionValue : [];
      prompt[section.key] = {
        title_ko: repairText(sectionValue.title_ko, section.labelKo),
        sentences: sentences.length ? sentences.map((sentence, index) => ({
          id: normalizeIdentifier(sentence.id || `${section.key}-${index + 1}`, `${section.key}-sentence`),
          en: String(sentence.en || sentence.text || "").trim(),
          ko: repairText(String(sentence.ko || "").trim(), ""),
        })).filter((sentence) => sentence.en || sentence.ko) : makePrompt("upload")[section.key].sentences,
      };
    });
    return prompt;
  }

  function applyPrompt(item, promptJson) {
    if (item.promptJson) {
      item.versions.unshift({ id: uid("ver"), promptJson: structuredClone(item.promptJson), finalPrompt: item.finalPrompt, createdAt: Date.now() });
    }
    item.promptJson = normalizeAnalysisPrompt(promptJson);
    item.finalPrompt = promptText(item, "final");
    item.status = "analyzed";
    item.errorMessage = "";
    item.updatedAt = Date.now();
  }

  async function regenerateSection(id, key) {
    const item = findItem(id);
    if (!item?.promptJson) return;
    item.versions.unshift({ id: uid("ver"), promptJson: structuredClone(item.promptJson), finalPrompt: item.finalPrompt, createdAt: Date.now() });
    const fresh = makePrompt("upload")[key];
    item.promptJson[key] = fresh;
    item.finalPrompt = promptText(item, "final");
    item.status = "modified";
    syncPromptEditState(item, "section");
    item.updatedAt = Date.now();
    await saveItemState(item);
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

  function collectPromptEditsFromDom(item) {
    if (!item?.promptJson) return;
    document.querySelectorAll(".sentence[data-sentence-id][data-lang]").forEach((node) => {
      const sentenceId = node.dataset.sentenceId;
      const lang = node.dataset.lang;
      Object.values(item.promptJson).forEach((section) => {
        section.sentences.forEach((sentence) => {
          if (sentence.id === sentenceId) sentence[lang] = node.textContent.trim();
        });
      });
    });
    item.finalPrompt = promptText(item, "final");
  }

  async function saveDetail(id) {
    const item = findItem(id);
    if (!item) return;
    collectDetailFields(item);
    if (item.promptJson) {
      item.finalPrompt = promptText(item, "final");
      const editState = syncPromptEditState(item);
      if (editState === "modified") item.status = "modified";
    }
    item.updatedAt = Date.now();
    setDetailSavingState(true);
    const serverSaved = await saveItemState(item);
    render();
    if (serverSaved) showToast("서버에 저장했습니다.", "success", 1400);
    else if (persistenceStatus === "fallback") showToast("브라우저에 임시 저장했습니다. 서버 연결 후 동기화해 주세요.", "warning", 3000);
  }

  function setDetailSavingState(saving) {
    const detail = document.querySelector(".detail-grid");
    if (!detail) return;
    detail.setAttribute("aria-busy", String(saving));
    detail.querySelectorAll("input, textarea, select, button").forEach((control) => {
      control.disabled = saving;
    });
  }

  function collectDetailFields(item) {
    collectPromptEditsFromDom(item);
    item.title = document.getElementById("detailTitle")?.value.trim() || item.title || "";
    item.categoryId = document.getElementById("detailCategory")?.value || item.categoryId || "";
    // Tags are managed via chip toggles on the item object directly.
    item.memo = document.getElementById("detailMemo")?.value.trim() || "";
    item.customInstruction = document.getElementById("detailCustomInstruction")?.value.trim() || "";
    item.excludeOptions = selectedCheckboxValues("detailExclude");
    ui.reviseAlsoRetag = document.getElementById("reviseAlsoRetag")?.checked !== false;
    ui.reviseAlsoRetitle = document.getElementById("reviseAlsoRetitle")?.checked === true;
  }

  function captureSelectedDetailDraft() {
    const item = selectedItem();
    if (ui.view !== "detail" || !item) return;
    if (isVideoArchiveMode() && document.getElementById("videoDetailTitle")) {
      collectPromptEditsFromDom(item);
      item.title = document.getElementById("videoDetailTitle")?.value.trim() || "";
      item.categoryId = document.getElementById("videoDetailCategory")?.value || item.categoryId || "";
      item.memo = document.getElementById("videoDetailMemo")?.value.trim() || "";
      return;
    }
    if (!document.getElementById("detailTitle")) return;
    collectDetailFields(item);
  }

  async function revisePromptFromDetail(id) {
    const item = findItem(id);
    if (!item) return;
    if (!item.promptJson) {
      showToast("수정할 프롬프트가 없습니다.", "warning");
      return;
    }
    collectDetailFields(item);
    const customInstruction = String(item.customInstruction || "").trim();
    const excluded = excludeLabels(item.excludeOptions);
    if (!customInstruction && !excluded.length) {
      showToast("추가 요청사항 또는 제외 요소를 하나 이상 지정해 주세요.", "warning", 2200);
      return;
    }
    const confirmed = confirm([
      "현재 입력된 프롬프트를 요청사항과 제외 요소 기준으로 수정합니다.",
      "",
      "• 이미지를 다시 분석하지 않습니다.",
      "• 기존 프롬프트 문장에서 필요한 부분만 최소로 추가/삭제합니다.",
      "• 번역·텍스트 API(번역 · 제목 요약 역할)를 사용합니다.",
      "• 업로드 화면의 요청사항/제외 체크와는 별개입니다.",
      "",
      customInstruction ? `추가 요청: ${customInstruction}` : "추가 요청: (없음)",
      excluded.length ? `제외 요소: ${excluded.join(", ")}` : "제외 요소: (없음)",
      "",
      "실행할까요?",
    ].join("\n"));
    if (!confirmed) return;

    item.status = "modified";
    item.errorMessage = "";
    item.updatedAt = Date.now();
    render();
    showToast("프롬프트 수정 중…", "info", 1600);
    try {
      const response = await fetch(SERVER_EDIT_PROMPT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: item.id,
          customInstruction,
          excludeLabels: excluded,
          promptJson: item.promptJson,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        throw new Error(payload.message || payload.error || "프롬프트 수정 요청에 실패했습니다.");
      }
      const nextPrompt = normalizeAnalysisPrompt(payload.promptJson || payload.promptSections);
      applyPrompt(item, nextPrompt);
      if (ui.reviseAlsoRetag) applyLocalTagsFromPrompt(item);
      item.status = "modified";
      syncPromptEditState(item, "api_revise");
      if (ui.reviseAlsoRetitle) {
        try {
          await ensureKoreanTitle(item, { force: true });
        } catch (_titleError) {}
      }
      item.errorMessage = "";
      item.updatedAt = Date.now();
      const saved = await saveItemState(item);
      render();
      showToast(saved ? "프롬프트 수정과 서버 저장을 마쳤습니다." : "수정한 프롬프트를 브라우저에 임시 저장했습니다.", saved ? "success" : "warning");
    } catch (error) {
      item.errorMessage = error.message || "프롬프트 수정에 실패했습니다.";
      item.updatedAt = Date.now();
      await saveItemState(item);
      render();
      showToast(item.errorMessage, "warning", 2800);
    }
  }

  async function retitleOneItem(id, options = {}) {
    const item = findItem(id);
    if (!item?.promptJson) return;
    if (!options.silent && item.id === ui.selectedId) captureSelectedDetailDraft();
    try {
      await ensureKoreanTitle(item, { force: true });
      const saved = await saveItemState(item);
      if (!options.silent) {
        render();
        showToast(saved ? "제목 요약을 갱신하고 저장했습니다." : "제목 요약을 브라우저에 임시 저장했습니다.", saved ? "success" : "warning");
      }
    } catch (error) {
      if (!options.silent) showToast(error.message || "제목 요약 실패", "warning");
      throw error;
    }
  }

  async function retagOneItem(id, options = {}) {
    const item = findItem(id);
    if (!item?.promptJson) return;
    if (!options.silent && item.id === ui.selectedId) captureSelectedDetailDraft();
    applyLocalTagsFromPrompt(item);
    item.updatedAt = Date.now();
    const saved = await saveItemState(item);
    if (!options.silent) {
      render();
      showToast(saved ? "태그를 재추론하고 저장했습니다." : "태그 변경을 브라우저에 임시 저장했습니다.", saved ? "success" : "warning");
    }
  }

  async function batchRetitleAll() {
    const targets = state.items.filter((item) => item.promptJson);
    let ok = 0;
    for (const item of targets) {
      try {
        await ensureKoreanTitle(item, { force: true });
        ok += 1;
      } catch (_error) {}
    }
    saveItemsState();
    render();
    showToast(`제목 요약 ${ok}/${targets.length} 완료`, ok ? "success" : "warning");
  }

  function batchRetagAll() {
    const targets = state.items.filter((item) => item.promptJson);
    targets.forEach((item) => applyLocalTagsFromPrompt(item));
    saveItemsState();
    render();
    showToast(`${targets.length}개 태그 재추론 완료`, "success");
  }

  function applyBulkCategory(categoryId) {
    const ids = ui.selectedBulkCategoryIds || [];
    if (!ids.length || !categoryId) return;
    ids.forEach((id) => {
      const item = findItem(id);
      if (!item) return;
      item.categoryId = categoryId;
      item.updatedAt = Date.now();
    });
    saveItemsState();
    ui.selectedBulkCategoryIds = [];
    ui.bulkCategoryMode = false;
    render();
    showToast(`${ids.length}개 분류 변경`, "success");
  }

  async function exportArchiveBackup() {
    const includeSecrets = document.getElementById("includeSecretsInBackup")?.checked === true;
    if (includeSecrets && !confirm("API 비밀키가 포함된 백업을 만들까요?\n이 파일을 공유하거나 일반 클라우드 폴더에 두면 키가 노출될 수 있습니다.")) return;
    showToast("전체 백업 파일을 준비하는 중…", "info", 4000);
    try {
      if (serverAvailable) {
        const response = await fetch(`${SERVER_BACKUP_ENDPOINT}?includeSecrets=${includeSecrets ? "1" : "0"}`, { cache: "no-store" });
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.message || err.error || "백업 생성 실패");
        }
        const blob = await response.blob();
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        downloadBlob(blob, `prompt-archive-backup${includeSecrets ? "-WITH-SECRETS" : ""}-${stamp}.json`);
        showToast(`게시물·설정·이미지 백업을 저장했습니다.${includeSecrets ? " API 비밀키 포함 파일이므로 안전하게 보관하세요." : " API 비밀키는 제외했습니다."}`, includeSecrets ? "warning" : "success", 3200);
        return;
      }
      // 서버 없을 때: 메타데이터만 (이미지 바이너리 미포함)
      const payload = buildClientOnlyBackupPayload();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      downloadBlob(blob, `prompt-archive-backup-meta-${Date.now()}.json`);
      showToast("서버 미연결: 메타데이터만 저장했습니다. 이미지는 포함되지 않습니다.", "warning", 3200);
    } catch (error) {
      console.error(error);
      showToast(error.message || "백업 저장에 실패했습니다.", "warning", 2800);
    }
  }

  function buildClientOnlyBackupPayload() {
    return {
      format: "prompt-archive-backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: settingsSlice(),
      tags: tagsSlice(),
      providers: sanitizedProviders(),
      items: state.items.map((item) => ({
        ...item,
        displayImage: item.displayImage ? { ...item.displayImage, dataUrl: item.displayImage.dataUrl?.startsWith("data:") ? undefined : item.displayImage.dataUrl } : null,
        analysisImage: item.analysisImage ? { ...item.analysisImage, dataUrl: item.analysisImage.dataUrl?.startsWith("data:") ? undefined : item.analysisImage.dataUrl } : null,
        thumbnailImage: item.thumbnailImage ? { ...item.thumbnailImage, dataUrl: item.thumbnailImage.dataUrl?.startsWith("data:") ? undefined : item.thumbnailImage.dataUrl } : null,
        originalImage: item.originalImage ? { ...item.originalImage, dataUrl: item.originalImage.dataUrl?.startsWith("data:") ? undefined : item.originalImage.dataUrl } : null,
      })),
      images: {},
      stats: { itemCount: state.items.length, imageCount: 0, note: "client-only-metadata" },
    };
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function triggerArchiveImport() {
    const input = document.getElementById("archiveImportInput");
    if (!input) {
      showToast("가져오기 UI를 찾을 수 없습니다. 고급 설정 탭을 연 뒤 다시 시도하세요.", "warning");
      return;
    }
    input.value = "";
    input.onchange = async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      await importArchiveBackup(file);
      input.value = "";
    };
    input.click();
  }

  async function importArchiveBackup(file) {
    if (!file) return;
    if (!confirm("백업 파일로 현재 데이터를 교체할까요?\n게시물·설정·업로드 이미지가 백업 내용으로 덮어씌워집니다.\n계속하기 전에 현재 상태를 먼저 백업하는 것을 권장합니다.")) {
      return;
    }
    showToast("백업을 가져오는 중…", "info", 6000);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!serverAvailable) {
        applyImportedStateLocally(parsed);
        showToast("서버 미연결: 브라우저 상태에만 메타데이터를 반영했습니다. 이미지는 복원되지 않을 수 있습니다.", "warning", 3600);
        return;
      }

      const response = await fetch(SERVER_IMPORT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "replace", backup: parsed }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) {
        throw new Error(result.message || result.error || "백업 가져오기 실패");
      }

      const stateResponse = await fetch(SERVER_STATE_ENDPOINT, { cache: "no-store" });
      if (!stateResponse.ok) throw new Error("복원 후 상태 로드 실패");
      const statePayload = await stateResponse.json();
      if (!statePayload?.state) throw new Error("복원된 상태가 비어 있습니다.");

      Object.assign(state, normalizeState(statePayload.state));
      document.documentElement.dataset.theme = state.theme;
      applyThemeOptions();
      migrateAllPromptBaselines();
      ui.selectedId = state.items[0]?.id || null;
      ui.view = "gallery";
      ui.page = 1;
      ui.galleryLoadedPages = 1;
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      render();
      showToast(
        `가져오기 완료: 게시물 ${result.itemCount ?? state.items.length}개, 이미지 ${result.imageCount ?? 0}개${result.clearedSecretCount ? `. 안전을 위해 API 비밀키 ${result.clearedSecretCount}개를 지웠으므로 다시 입력해 주세요.` : ""}`,
        result.clearedSecretCount ? "warning" : "success",
        result.clearedSecretCount ? 5200 : 2800
      );
    } catch (error) {
      console.error(error);
      showToast(error.message || "백업 가져오기에 실패했습니다.", "warning", 3200);
    }
  }

  function applyImportedStateLocally(parsed) {
    const backup = parsed?.format === "prompt-archive-backup" ? parsed : parsed;
    const settings = backup.settings || pickLocalSettingsFromDump(backup);
    const tags = backup.tags || {
      excludeOptions: backup.excludeOptions || settings.excludeOptions,
      outfitTagOptions: backup.outfitTagOptions || settings.outfitTagOptions,
      backgroundTagOptions: backup.backgroundTagOptions || settings.backgroundTagOptions,
    };
    const next = normalizeState({
      ...settings,
      ...tags,
      providers: Array.isArray(backup.providers) ? backup.providers : state.providers,
      items: Array.isArray(backup.items) ? backup.items : state.items,
    });
    Object.assign(state, next);
    document.documentElement.dataset.theme = state.theme;
    applyThemeOptions();
    migrateAllPromptBaselines();
    ui.selectedId = state.items[0]?.id || null;
    ui.view = "gallery";
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    render();
  }

  function pickLocalSettingsFromDump(dump) {
    return {
      theme: dump.theme,
      categories: dump.categories,
      promptInstruction: dump.promptInstruction,
      promptSettings: dump.promptSettings,
      uploadSettings: dump.uploadSettings,
      albumSettings: dump.albumSettings,
      copyDisplaySettings: dump.copyDisplaySettings,
      categorySettings: dump.categorySettings,
      themeSettings: dump.themeSettings,
      advancedSettings: dump.advancedSettings,
      excludeOptions: dump.excludeOptions,
      outfitTagOptions: dump.outfitTagOptions,
      backgroundTagOptions: dump.backgroundTagOptions,
    };
  }

  function deleteItem(id) {
    if (!confirm("이 이미지를 삭제할까요?")) return;
    const index = state.items.findIndex((item) => item.id === id);
    if (index >= 0) state.items.splice(index, 1);
    ui.selectedId = state.items[0]?.id || null;
    ui.view = "gallery";
    deleteItemState(id);
    render();
  }

  function toggleBulkDeleteItem(id) {
    if (!id) return;
    const selected = new Set(ui.selectedBulkDeleteIds || []);
    setBulkDeleteItemSelection(id, !selected.has(id));
  }

  function setBulkDeleteItemSelection(id, shouldSelect) {
    const items = currentArchiveItems();
    if (!id || !items.some((item) => item.id === id)) return;
    const selected = new Set(ui.selectedBulkDeleteIds || []);
    if (shouldSelect) selected.add(id);
    else selected.delete(id);
    ui.selectedBulkDeleteIds = [...selected].filter((entryId) => items.some((item) => item.id === entryId));
  }

  function toggleBulkCategoryItem(id) {
    if (!id) return;
    const selected = new Set(ui.selectedBulkCategoryIds || []);
    setBulkCategoryItemSelection(id, !selected.has(id));
  }

  function setBulkCategoryItemSelection(id, shouldSelect) {
    if (!id || !state.items.some((item) => item.id === id)) return;
    const selected = new Set(ui.selectedBulkCategoryIds || []);
    if (shouldSelect) selected.add(id);
    else selected.delete(id);
    ui.selectedBulkCategoryIds = [...selected].filter((entryId) => state.items.some((item) => item.id === entryId));
  }

  function refreshBulkSelectionUi() {
    if (!ui.bulkDeleteMode && !ui.bulkCategoryMode) return;
    const categoryMode = ui.bulkCategoryMode;
    const selectedIds = new Set(categoryMode ? ui.selectedBulkCategoryIds || [] : ui.selectedBulkDeleteIds || []);
    document.querySelectorAll("[data-open-item]").forEach((card) => {
      const selected = selectedIds.has(card.dataset.openItem);
      card.classList.toggle("selected-for-delete", selected);
      const checkbox = card.querySelector(categoryMode ? "[data-bulk-category-id]" : "[data-bulk-delete-id]");
      if (checkbox) checkbox.checked = selected;
    });

    if (categoryMode) {
      const count = document.querySelector(".bulk-category-count");
      if (count) count.textContent = `${selectedIds.size}개 선택`;
      const applyButton = document.querySelector('[data-action="applyBulkCategory"]');
      if (applyButton) applyButton.disabled = selectedIds.size === 0;
      return;
    }

    const visibleCheckboxes = [...document.querySelectorAll("[data-bulk-delete-id]")];
    const visibleSelectedCount = visibleCheckboxes.filter((checkbox) => selectedIds.has(checkbox.dataset.bulkDeleteId)).length;
    const allVisibleSelected = visibleCheckboxes.length > 0 && visibleSelectedCount === visibleCheckboxes.length;
    const count = document.querySelector(".bulk-delete-count");
    if (count) count.textContent = `선택 ${selectedIds.size}개`;
    const selectVisibleButton = document.querySelector('[data-action="bulkSelectVisible"]');
    if (selectVisibleButton) selectVisibleButton.textContent = allVisibleSelected ? "표시 항목 선택 해제" : "표시 항목 전체 선택";
    const clearButton = document.querySelector('[data-action="clearBulkDeleteSelection"]');
    if (clearButton) clearButton.disabled = selectedIds.size === 0;
    const deleteButton = document.querySelector('[data-action="confirmBulkDelete"]');
    if (deleteButton) deleteButton.disabled = selectedIds.size === 0;
  }

  function toggleVisibleBulkDeleteSelection() {
    const visibleIds = [...document.querySelectorAll("[data-bulk-delete-id]")].map((node) => node.dataset.bulkDeleteId).filter(Boolean);
    if (!visibleIds.length) return;
    const selected = new Set(ui.selectedBulkDeleteIds || []);
    const allVisibleSelected = visibleIds.every((id) => selected.has(id));
    visibleIds.forEach((id) => {
      if (allVisibleSelected) selected.delete(id);
      else selected.add(id);
    });
    ui.selectedBulkDeleteIds = [...selected].filter((entryId) => currentArchiveItems().some((item) => item.id === entryId));
  }

  function deleteSelectedItems() {
    const selectedIds = [...new Set(ui.selectedBulkDeleteIds || [])].filter((id) => state.items.some((item) => item.id === id));
    if (!selectedIds.length) {
      alert("삭제할 게시물을 먼저 선택하세요.");
      return;
    }
    if (!confirm(`선택한 ${selectedIds.length}개 게시물을 삭제할까요?`)) return;
    const selected = new Set(selectedIds);
    state.items = state.items.filter((item) => !selected.has(item.id));
    if (selected.has(ui.selectedId)) ui.selectedId = state.items[0]?.id || null;
    ui.bulkDeleteMode = false;
    ui.selectedBulkDeleteIds = [];
    ui.view = "gallery";
    resetGalleryWindow();
    saveItemsState();
    render();
    showToast(`${selectedIds.length}개 게시물을 삭제했습니다.`, "success", 1600);
  }

  function addExcludeOption() {
    const input = document.getElementById("newExcludeOption");
    const label = input?.value.trim();
    if (!label) return;
    state.excludeOptions.push({ key: uid("exclude"), label, defaultChecked: false, enabled: true, order: state.excludeOptions.length + 1 });
    saveTagsState();
    render();
  }

  function saveExcludeOption(key) {
    const optionItem = state.excludeOptions.find((entry) => entry.key === key);
    const labelInput = document.querySelector(`[data-exclude-label="${key}"]`);
    if (!optionItem || !labelInput) return;
    optionItem.label = labelInput.value.trim() || optionItem.label;
    optionItem.defaultChecked = Boolean(document.querySelector(`[data-exclude-default="${key}"]`)?.checked);
    optionItem.enabled = document.querySelector(`[data-exclude-enabled="${key}"]`)?.checked !== false;
    saveTagsState();
    render();
  }

  function deleteExcludeOption(key) {
    if (!confirm("이 제외 요소 항목을 삭제할까요? 기존 이미지의 선택값에서도 제거됩니다.")) return;
    state.excludeOptions = state.excludeOptions.filter((optionItem) => optionItem.key !== key);
    state.items.forEach((item) => {
      item.excludeOptions = (item.excludeOptions || []).filter((optionKey) => optionKey !== key);
    });
    saveTagsState();
    saveItemsState();
    render();
  }

  function moveExcludeOption(key, direction) {
    moveInArray(state.excludeOptions, key, direction);
    state.excludeOptions.forEach((optionItem, index) => optionItem.order = index + 1);
    saveTagsState();
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
    saveSettingsState();
    render();
  }

  function saveUploadSettings() {
    state.uploadSettings = normalizeUploadSettings({
      promptSourceMode: document.querySelector('input[name="promptSourceMode"]:checked')?.value || state.uploadSettings.promptSourceMode,
      translateExifPrompt: document.getElementById("translateExifPrompt")?.checked,
      preserveOriginal: document.getElementById("preserveOriginal")?.checked,
      autoCompress: document.getElementById("autoCompress")?.checked,
      stripExif: document.getElementById("stripExif")?.checked,
      convertToWebp: document.getElementById("convertToWebp")?.checked,
      generateThumbnail: document.getElementById("generateThumbnail")?.checked,
      allowClipboardPaste: document.getElementById("allowClipboardPaste")?.checked,
      allowDragDrop: document.getElementById("allowDragDrop")?.checked,
      detectDuplicates: document.getElementById("detectDuplicates")?.checked,
      autoAnalyzeAfterUpload: false,
      lastExcludeOptions: state.uploadSettings.lastExcludeOptions,
      displayMaxSize: document.getElementById("displayMaxSize")?.value,
      analysisMaxSize: document.getElementById("analysisMaxSize")?.value,
      thumbnailSize: document.getElementById("thumbnailSize")?.value,
      imageQuality: document.getElementById("imageQuality")?.value,
      maxFileSizeMb: document.getElementById("maxFileSizeMb")?.value,
      concurrentUploadCount: document.getElementById("concurrentUploadCount")?.value,
      concurrentAnalysisCount: document.getElementById("concurrentAnalysisCount")?.value,
    });
    saveSettingsState();
    render();
  }

  function saveAlbumSettings() {
    state.albumSettings = normalizeAlbumSettings({
      columns: document.getElementById("albumColumns")?.value,
      rows: document.getElementById("albumRows")?.value,
      loadMode: document.getElementById("galleryLoadMode")?.value,
      paginationPosition: document.getElementById("paginationPosition")?.value,
      cardAspectRatio: document.getElementById("cardAspectRatio")?.value,
      showTitle: document.getElementById("showTitle")?.checked !== false,
      showTags: document.getElementById("showTags")?.checked !== false,
      showStatus: document.getElementById("showStatus")?.checked !== false,
      showFavorite: document.getElementById("showFavorite")?.checked !== false,
    });
    resetGalleryWindow();
    saveSettingsState();
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
    saveSettingsState();
    render();
  }

  function saveThemeSettings() {
    const selectedTheme = document.querySelector("[data-theme].active")?.dataset.theme;
    if (selectedTheme) state.theme = selectedTheme;
    state.themeSettings = {
      ...state.themeSettings,
      followSystemDarkMode: document.getElementById("followSystemDarkMode")?.checked,
      useSectionBackgrounds: document.getElementById("useSectionBackgrounds")?.checked,
      sectionColors: Object.fromEntries(sectionMeta.map((section) => [section.key, document.getElementById(`sectionColor-${section.key}`)?.value || defaultThemeSettings.sectionColors[section.key]])),
    };
    saveSettingsState();
    render();
  }

  function saveAdvancedSettings() {
    state.advancedSettings = normalizeAdvancedSettings({
      ...state.advancedSettings,
      dailyMaxAnalyses: document.getElementById("dailyMaxAnalyses")?.value,
      monthlyMaxAnalyses: document.getElementById("monthlyMaxAnalyses")?.value,
      maxImagesPerBatch: document.getElementById("maxImagesPerBatch")?.value,
      maxRegenerationsPerImage: document.getElementById("maxRegenerationsPerImage")?.value,
      shortcuts: {
        nextItem: document.getElementById("shortcutNextItem")?.value || "",
        prevItem: document.getElementById("shortcutPrevItem")?.value || "",
        copyFinal: document.getElementById("shortcutCopyFinal")?.value || "",
        goBack: document.getElementById("shortcutGoBack")?.value || "",
      },
    });
    saveSettingsState();
    render();
  }

  function clearAllShortcuts() {
    state.advancedSettings = normalizeAdvancedSettings({
      ...state.advancedSettings,
      shortcuts: {
        nextItem: "",
        prevItem: "",
        copyFinal: "",
        goBack: "",
      },
    });
    saveSettingsState();
    render();
    showToast("단축키를 모두 비웠습니다.", "success");
  }

  function bindShortcutCaptureFields() {
    document.querySelectorAll("[data-shortcut-field]").forEach((input) => {
      input.addEventListener("keydown", (event) => {
        if (event.key === "Escape" || event.key === "Tab") return;
        event.preventDefault();
        event.stopPropagation();
        if (event.key === "Backspace" || event.key === "Delete") {
          input.value = "";
          return;
        }
        input.value = shortcutLabelFromEvent(event);
      });
    });
  }

  function shortcutLabelFromEvent(event) {
    if (event.key === " ") return "Space";
    return event.key;
  }

  function shortcutMatches(event, binding) {
    const value = String(binding || "").trim();
    if (!value) return false;
    if (value === "Space") return event.key === " ";
    return event.key === value || event.key.toLowerCase() === value.toLowerCase();
  }

  function saveCategorySettings() {
    const wildcardSettings = readWildcardSettingsDraft();
    try {
      state.wildcardSettings = validateWildcardSettings(wildcardSettings);
    } catch (error) {
      showToast(error.message || "와일드카드 분류 규칙을 확인해 주세요.", "warning", 3600);
      return;
    }
    saveCategoryRows();
    state.categorySettings.allowAiSuggestedTags = Boolean(document.getElementById("allowAiSuggestedTags")?.checked);
    saveSettingsState();
    render();
    showToast("분류와 와일드카드 규칙을 저장했습니다.", "success", 2200);
  }

  async function retranslateSection(id, key) {
    const item = findItem(id);
    if (!item?.promptJson?.[key]) return;
    collectPromptEditsFromDom(item);
    const sectionConfig = state.promptSettings.sections.find((section) => section.key === key) || sectionMeta.find((section) => section.key === key);
    const sentences = item.promptJson[key].sentences.map((sentence) => ({
      id: sentence.id,
      en: String(sentence.en || "").trim(),
    })).filter((sentence) => sentence.en);
    if (!sentences.length) {
      showToast("재번역할 영어 문장이 없습니다.", "warning", 1600);
      return;
    }
    item.versions.unshift({ id: uid("ver"), promptJson: structuredClone(item.promptJson), finalPrompt: item.finalPrompt, createdAt: Date.now() });
    item.status = "modified";
    await saveItemState(item);
    showToast("번역 중입니다.", "info", 1000);
    try {
      const response = await fetch(SERVER_TRANSLATE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: item.id,
          sectionKey: key,
          sectionLabel: sectionConfig?.labelKo || key,
          sentences,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.message || payload.error || "번역 요청에 실패했습니다.");
      const byId = new Map((payload.translations || []).map((entry) => [entry.id, entry.ko]));
      item.promptJson[key].sentences.forEach((sentence) => {
        const translated = byId.get(sentence.id);
        if (translated) sentence.ko = translated;
      });
      item.finalPrompt = promptText(item, "final");
      syncPromptEditState(item, "translate");
      if (item.promptEditState === "modified") item.status = "modified";
      item.updatedAt = Date.now();
      const saved = await saveItemState(item);
      render();
      showToast(saved ? "한국어 재번역과 저장이 끝났습니다." : "재번역 결과를 브라우저에 임시 저장했습니다.", saved ? "success" : "warning", 1800);
    } catch (error) {
      item.versions.shift();
      await saveItemState(item);
      render();
      showToast(error.message || "번역에 실패했습니다.", "warning", 2200);
    }
  }

  function findCategoryInput(attribute, id) {
    return Array.from(document.querySelectorAll(`[${attribute}]`)).find((input) => input.getAttribute(attribute) === id);
  }

  function findWildcardRuleInput(attribute, id) {
    return Array.from(document.querySelectorAll(`[${attribute}]`))
      .find((input) => input.getAttribute(attribute) === id);
  }

  function readWildcardSettingsDraft() {
    return {
      appearancePath: document.getElementById("wildcardAppearancePath")?.value
        || state.wildcardSettings.appearancePath,
      defaultScenarioPath: document.getElementById("wildcardDefaultScenarioPath")?.value
        || state.wildcardSettings.defaultScenarioPath,
      rules: state.wildcardSettings.rules.map((rule) => ({
        id: rule.id,
        name: findWildcardRuleInput("data-wildcard-rule-name", rule.id)?.value || rule.name,
        categoryNames: String(
          findWildcardRuleInput("data-wildcard-rule-categories", rule.id)?.value
          || rule.categoryNames.join(", "),
        ).split(",").map((value) => value.trim()).filter(Boolean),
        outputPath: findWildcardRuleInput("data-wildcard-rule-output", rule.id)?.value
          || rule.outputPath,
        enabled: findWildcardRuleInput("data-wildcard-rule-enabled", rule.id)?.checked !== false,
      })),
    };
  }

  function captureWildcardSettingsRows() {
    try {
      state.wildcardSettings = validateWildcardSettings(readWildcardSettingsDraft());
      return true;
    } catch (error) {
      showToast(error.message || "와일드카드 분류 규칙을 확인해 주세요.", "warning", 3600);
      return false;
    }
  }

  function addWildcardRule() {
    if (!captureWildcardSettingsRows()) return;
    const usedCategoryNames = new Set(state.wildcardSettings.rules
      .flatMap((rule) => rule.categoryNames)
      .map((name) => name.trim().toLowerCase()));
    const categoryName = state.categories
      .map((category) => category.name)
      .find((name) => !usedCategoryNames.has(name.trim().toLowerCase()))
      || "새 분류";
    const usedPaths = new Set([
      state.wildcardSettings.appearancePath,
      state.wildcardSettings.defaultScenarioPath,
      ...state.wildcardSettings.rules.map((rule) => rule.outputPath),
    ].map((relativePath) => relativePath.toLowerCase()));
    let sequence = state.wildcardSettings.rules.length + 1;
    let outputPath = `category-${sequence}.txt`;
    while (usedPaths.has(outputPath.toLowerCase())) {
      sequence += 1;
      outputPath = `category-${sequence}.txt`;
    }
    state.wildcardSettings.rules.push({
      id: uid("wildcard-rule"),
      name: categoryName,
      categoryNames: [categoryName],
      outputPath,
      enabled: true,
    });
    saveSettingsState();
    render();
  }

  function deleteWildcardRule(id) {
    if (!captureWildcardSettingsRows()) return;
    state.wildcardSettings.rules = state.wildcardSettings.rules
      .filter((rule) => rule.id !== id);
    saveSettingsState();
    render();
  }

  function moveWildcardRule(id, direction) {
    if (!captureWildcardSettingsRows()) return;
    moveInArray(state.wildcardSettings.rules, id, direction);
    saveSettingsState();
    render();
  }

  function saveCategoryRows() {
    state.categories.forEach((category) => {
      const nameInput = findCategoryInput("data-category-name", category.id);
      const colorInput = findCategoryInput("data-category-color", category.id);
      category.name = nameInput?.value.trim() || category.name;
      category.color = colorInput?.value || category.color || "blue";
    });
    state.categories = normalizeCategories(state.categories);
  }

  function addCategory() {
    const input = document.getElementById("newCategoryName");
    const name = input?.value.trim();
    if (!name) return;
    saveCategoryRows();
    state.categories.push({ id: uid("cat"), name, color: "blue" });
    saveSettingsState();
    render();
  }

  function saveCategory(id) {
    saveCategoryRows();
    const category = state.categories.find((entry) => entry.id === id);
    const input = findCategoryInput("data-category-name", id);
    const colorInput = findCategoryInput("data-category-color", id);
    if (!category || !input) return;
    category.name = input.value.trim() || category.name;
    category.color = colorInput?.value || category.color || "blue";
    saveSettingsState();
    render();
  }

  function deleteCategory(id) {
    if (state.categories.length <= 1) return;
    const category = state.categories.find((entry) => entry.id === id);
    if (!category || !confirm("이 카테고리를 삭제할까요? 기존 이미지는 첫 번째 카테고리로 이동합니다.")) return;
    saveCategoryRows();
    state.categories = state.categories.filter((entry) => entry.id !== id);
    const fallbackId = state.categories[0]?.id || "";
    state.items.forEach((item) => {
      if (item.categoryId === id) item.categoryId = fallbackId;
    });
    saveSettingsState();
    saveItemsState();
    render();
  }

  function moveCategory(id, direction) {
    saveCategoryRows();
    moveInArray(state.categories, id, direction);
    saveSettingsState();
    render();
  }

  function saveVideoCategoryRows() {
    state.videoCategories.forEach((category) => {
      const nameInput = document.querySelector(`[data-video-category-name="${category.id}"]`);
      const colorInput = document.querySelector(`[data-video-category-color="${category.id}"]`);
      category.name = nameInput?.value.trim() || category.name;
      category.color = colorInput?.value || category.color || "slate";
    });
    state.videoCategories = normalizeVideoCategories(state.videoCategories);
  }

  function saveVideoCategorySettings() {
    saveVideoCategoryRows();
    saveSettingsState();
    render();
    showToast("비디오 카테고리를 저장했습니다.", "success", 1800);
  }

  function addVideoCategory() {
    const input = document.getElementById("newVideoCategoryName");
    const name = input?.value.trim();
    if (!name) return;
    saveVideoCategoryRows();
    state.videoCategories.push({ id: uid("vcat"), name, color: "slate" });
    saveSettingsState();
    render();
  }

  function saveVideoCategory(id) {
    saveVideoCategoryRows();
    const category = state.videoCategories.find((entry) => entry.id === id);
    const input = document.querySelector(`[data-video-category-name="${id}"]`);
    const colorInput = document.querySelector(`[data-video-category-color="${id}"]`);
    if (!category || !input) return;
    category.name = input.value.trim() || category.name;
    category.color = colorInput?.value || category.color || "slate";
    saveSettingsState();
    render();
  }

  function deleteVideoCategory(id) {
    if (state.videoCategories.length <= 1) return;
    const category = state.videoCategories.find((entry) => entry.id === id);
    if (!category || !confirm("이 비디오 카테고리를 삭제할까요? 해당 항목은 첫 번째 카테고리로 이동합니다.")) return;
    saveVideoCategoryRows();
    state.videoCategories = state.videoCategories.filter((entry) => entry.id !== id);
    const fallbackId = state.videoCategories[0]?.id || "";
    state.videoItems.forEach((item) => {
      if (item.categoryId === id) item.categoryId = fallbackId;
    });
    saveSettingsState();
    saveVideoItemsState();
    render();
  }

  function moveVideoCategory(id, direction) {
    saveVideoCategoryRows();
    const index = state.videoCategories.findIndex((entry) => entry.id === id);
    const nextIndex = index + Number(direction || 0);
    if (index < 0 || nextIndex < 0 || nextIndex >= state.videoCategories.length) return;
    const [entry] = state.videoCategories.splice(index, 1);
    state.videoCategories.splice(nextIndex, 0, entry);
    saveSettingsState();
    render();
  }

  function saveVideoUploadSettings() {
    state.videoSettings.translateOnUpload = Boolean(document.getElementById("videoTranslateOnUpload")?.checked);
    saveSettingsState();
    render();
    showToast("비디오 업로드 설정을 저장했습니다.", "success", 1600);
  }

  function saveVideoCopySettings() {
    state.videoSettings.includeSectionTitles = Boolean(document.getElementById("videoIncludeSectionTitles")?.checked);
    state.videoSettings.promptViewMode = document.getElementById("videoPromptViewMode")?.value || "split";
    state.videoSettings = normalizeVideoSettings(state.videoSettings);
    saveSettingsState();
    render();
    showToast("비디오 표시 설정을 저장했습니다.", "success", 1600);
  }

  function videoCategoryName(id, fallback = "미분류") {
    return state.videoCategories.find((category) => category.id === id)?.name || fallback;
  }

  function ensureVideoPromptJson(promptJson) {
    const next = {};
    videoSectionMeta.forEach((section) => {
      const sentences = Array.isArray(promptJson?.[section.key]?.sentences)
        ? promptJson[section.key].sentences
        : [];
      const normalized = sentences
        .map((sentence, index) => ({
          id: sentence?.id || `${section.key}-${index + 1}`,
          en: String(sentence?.en || ""),
          ko: String(sentence?.ko || ""),
        }));
      next[section.key] = {
        sentences: normalized.length ? normalized : [{ id: `${section.key}-1`, en: "", ko: "" }],
      };
    });
    return next;
  }

  function addManagedTag(type) {
    const nameInput = document.getElementById(`new-${type}-tag`);
    const keywordInput = document.getElementById(`new-${type}-keywords`);
    const name = nameInput?.value.trim();
    if (!name) return;
    tagOptions(type).push({ key: uid(`${type}-tag`), name, keywords: parseTags(keywordInput?.value || ""), enabled: true, allowAiAssign: true, order: tagOptions(type).length + 1 });
    saveTagsState();
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
    saveTagsState();
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
    saveTagsState();
    saveItemsState();
    render();
  }

  function moveManagedTag(type, key, direction) {
    const options = tagOptions(type);
    moveInArray(options, key, direction);
    options.forEach((tag, index) => tag.order = index + 1);
    saveTagsState();
    render();
  }

  function resetDefaultTags() {
    if (!confirm("복장/배경 태그를 기본값으로 되돌릴까요?")) return;
    state.outfitTagOptions = normalizeTagOptions(defaultOutfitTags, defaultOutfitTags);
    state.backgroundTagOptions = normalizeTagOptions(defaultBackgroundTags, defaultBackgroundTags);
    saveTagsState();
    render();
  }

  function resetSettingsOnly() {
    if (!confirm("이미지는 유지하고 설정만 기본값으로 되돌릴까요?")) return;
    state.promptInstruction = activeDefaultInstruction;
    state.promptSettings = normalizePromptSettings(defaultPromptSettings);
    state.excludeOptions = normalizeExcludeOptions(defaultExcludeOptions);
    state.uploadSettings = normalizeUploadSettings(defaultUploadSettings);
    state.albumSettings = normalizeAlbumSettings(defaultAlbumSettings);
    state.copyDisplaySettings = normalizeCopyDisplaySettings(defaultCopyDisplaySettings);
    state.categorySettings = { ...defaultCategorySettings };
    state.wildcardSettings = normalizeWildcardSettings(defaultWildcardSettings);
    state.themeSettings = { ...defaultThemeSettings, sectionColors: { ...defaultThemeSettings.sectionColors } };
    state.advancedSettings = normalizeAdvancedSettings(defaultAdvancedSettings);
    saveSettingsState();
    saveTagsState();
    render();
  }

  async function retryFailed() {
    let retriedCount = 0;
    for (const item of state.items.filter((entry) => entry.status === "analysis_failed")) {
      await analyzeItem(item.id, false, { silent: true });
      retriedCount += 1;
    }
    saveItemsState();
    render();
    if (retriedCount) showToast(`${retriedCount}개 실패 항목 재분석이 끝났습니다.`, "success");
  }

  function cycleTheme() {
    const index = themes.findIndex(([id]) => id === state.theme);
    state.theme = themes[(index + 1) % themes.length][0];
    saveSettingsState();
    render();
  }

  function saveProvider(index) {
    if (!saveProviderDraft(index)) return;
    render();
  }

  function updateVisibleProviderTabStatus() {
    const activeButton = document.querySelector(".provider-tab-btn.active small");
    const isActive = Boolean(
      document.querySelector("[data-provider-use-image]")?.checked
      || document.querySelector("[data-provider-use-translation]")?.checked
    );
    if (activeButton) activeButton.textContent = isActive ? "사용" : "끔";
    const status = document.querySelector(".provider-head .status-pill");
    if (status) status.textContent = isActive ? "사용 중" : "미사용";
  }

  function saveProviderCheckbox(input) {
    const index = Number(input.dataset.providerUseImage ?? input.dataset.providerUseTranslation);
    const provider = state.providers[index];
    if (!provider) return;
    if (input.dataset.providerUseImage !== undefined) provider.useForImageAnalysis = input.checked;
    if (input.dataset.providerUseTranslation !== undefined) provider.useForTranslation = input.checked;
    provider.useForPromptCleanup = false;
    provider.useForTagging = false;
    provider.enabled = providerIsActive(provider);
    updateVisibleProviderTabStatus();
  }

  function saveProviderDraft(index) {
    const provider = state.providers[index];
    if (!provider) return false;
    const keyInput = document.querySelector(`[data-provider-key="${index}"]`);
    if (provider.name === "Google Vertex AI") {
      const visionModel = document.querySelector(`[data-provider-vision-model="${index}"]`)?.value.trim() || "";
      const textModel = document.querySelector(`[data-provider-text-model="${index}"]`)?.value.trim() || "";
      provider.visionModel = visionModel;
      provider.textModel = textModel;
      provider.model = visionModel || textModel;
    } else {
      const unifiedModel = document.querySelector(`[data-provider-model="${index}"]`)?.value.trim() || "";
      provider.model = unifiedModel;
      provider.visionModel = unifiedModel;
      provider.textModel = unifiedModel;
    }
    provider.apiUrl = document.querySelector(`[data-provider-api-url="${index}"]`)?.value.trim() || provider.apiUrl || defaultProviderApiUrl(provider.name);
    provider.location = document.querySelector(`[data-provider-location="${index}"]`)?.value.trim() || provider.location || "";
    const pendingKey = keyInput?.value.trim() || "";
    if (pendingKey) provider._pendingKey = pendingKey;
    const pendingKeys = [0, 1, 2].map((slot) => document.querySelector(`[data-provider-api-key="${index}"][data-provider-api-key-slot="${slot}"]`)?.value.trim() || "");
    if (pendingKeys.some(Boolean)) provider._pendingKeys = pendingKeys;
    provider.priority = clampNumber(document.querySelector(`[data-provider-priority="${index}"]`)?.value, 1, 20, provider.priority);
    provider.timeoutSeconds = clampNumber(document.querySelector(`[data-provider-timeout="${index}"]`)?.value, 5, 300, provider.timeoutSeconds);
    provider.maxRetries = clampNumber(document.querySelector(`[data-provider-retries="${index}"]`)?.value, 0, 10, provider.maxRetries);
    provider.useForImageAnalysis = document.querySelector(`[data-provider-use-image="${index}"]`)?.checked === true;
    provider.useForTranslation = document.querySelector(`[data-provider-use-translation="${index}"]`)?.checked === true;
    provider.useForPromptCleanup = false;
    provider.useForTagging = false;
    provider.enabled = providerIsActive(provider);
    saveProvidersState();
    return true;
  }

  async function testProvider(index) {
    const provider = state.providers[index];
    if (!provider) return;
    const keyLabel = provider.name === "Google Vertex AI" ? "Vertex JSON Key" : provider.name === "Google Gemini API" ? "Gemini API Key" : "API Key";
    saveProviderDraft(index);
    provider.lastTestStatus = "테스트 중...";
    saveProvidersState();
    render();
    try {
      const saved = await syncProvidersToServer();
      if (!saved) throw new Error("공급자 설정을 서버에 저장하지 못해 연결 테스트를 중단했습니다.");
      const response = await fetch(`${SERVER_PROVIDERS_ENDPOINT}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerName: provider.name }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.message || payload.error || `${keyLabel} 연결 실패`);
      provider.hasServerKey = true;
      provider.lastTestStatus = `성공: ${payload.provider || provider.name} 실제 연결 확인`;
    } catch (error) {
      provider.lastTestStatus = `실패: ${error.message || `${keyLabel} 또는 용도 체크 필요`}`;
    }
    saveProvidersState();
    render();
  }

  function exportJson() {
    const payload = JSON.stringify(serializableState(), null, 2);
    writeClipboard(payload, "전체 백업 JSON을 복사했습니다.");
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
    writeClipboard(rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n"), "CSV를 복사했습니다.");
  }

  function copyPrompt(id, mode) {
    const item = findItem(id);
    if (!item?.promptJson) return;
    writeClipboard(promptText(item, mode), "복사했습니다.");
  }

  function copySection(id, sectionKey, lang) {
    const item = findItem(id);
    const sectionConfig = state.promptSettings.sections.find((section) => section.key === sectionKey);
    const sentences = item?.promptJson?.[sectionKey]?.sentences || [];
    // Prefer the column language from the button (en/ko). defaultCopyMode is only a fallback.
    const mode = ["en", "ko", "both", "final"].includes(lang)
      ? lang
      : (state.copyDisplaySettings.defaultCopyMode || "en");
    const parts = [];
    if (state.copyDisplaySettings.includeSectionTitles && sectionConfig) {
      parts.push(mode === "ko" ? sectionConfig.labelKo : sectionConfig.labelEn);
    }
    if (mode === "both") parts.push(...sentences.map((sentence) => `${sentence.en}\n${sentence.ko}`));
    else if (mode === "ko") parts.push(...sentences.map((sentence) => sentence.ko).filter(Boolean));
    else parts.push(...sentences.map((sentence) => sentence.en).filter(Boolean));
    writeClipboard(joinCopiedLines(parts, mode === "final"), "문단을 복사했습니다.");
  }

  function writeClipboard(text, successMessage) {
    navigator.clipboard.writeText(text)
      .then(() => showToast(successMessage, "success", 1200))
      .catch(() => showToast("복사에 실패했습니다.", "warning", 1800));
  }

  function promptText(item, mode) {
    if (!item?.promptJson) return "";
    if (mode === "en") return sectionBlockPromptText(item, "en", { includeTitles: state.copyDisplaySettings.includeSectionTitles });
    if (mode === "final") return sectionBlockPromptText(item, "en", { includeTitles: false });
    if (mode === "withoutAppearance") return sectionBlockPromptText(item, "en", { includeTitles: false, excludeSections: ["appearance"] });
    if (mode === "ko") return sectionBlockPromptText(item, "ko", { includeTitles: state.copyDisplaySettings.includeSectionTitles });
    if (mode === "both") return sectionBlockPromptText(item, "both", { includeTitles: state.copyDisplaySettings.includeSectionTitles });
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

  function sectionBlockPromptText(item, mode, options = {}) {
    const excludeSections = new Set(options.excludeSections || []);
    const blocks = enabledSections().filter((section) => !excludeSections.has(section.key)).map((section) => {
      const sentences = item.promptJson[section.key]?.sentences || [];
      const lines = [];
      if (options.includeTitles) {
        if (mode === "ko") lines.push(`[${section.labelKo}]`);
        else if (mode === "both") lines.push(`[${section.labelEn} / ${section.labelKo}]`);
        else lines.push(`[${section.labelEn}]`);
      }
      if (mode === "ko") {
        lines.push(...sentences.map((sentence) => sentence.ko).filter(Boolean));
      } else if (mode === "both") {
        lines.push(...sentences.map((sentence) => [sentence.en, sentence.ko].filter(Boolean).join("\n")).filter(Boolean));
      } else {
        lines.push(...sentences.map((sentence) => sentence.en).filter(Boolean));
      }
      return lines.join("\n").trim();
    }).filter(Boolean);
    return blocks.join("\n\n\n");
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
    return keys.map((key) => {
      const name = tagOptions(type).find((tag) => tag.key === key)?.name || "";
      if (name && !looksBrokenKorean(name)) return name;
      const fallbackKey = fallbackTag(type);
      return tagOptions(type).find((tag) => tag.key === fallbackKey)?.name || "기타";
    }).filter(Boolean);
  }

  function namesToTagKeys(value, type) {
    return parseTags(value).map((name) => {
      if (looksBrokenKorean(name)) return fallbackTag(type);
      const existing = tagOptions(type).find((tag) => tag.name === name || tag.key === name);
      if (existing) return existing.key;
      if (!state.categorySettings.allowAiSuggestedTags) return fallbackTag(type);
      const created = { key: uid(`${type}-tag`), name, keywords: [], enabled: true, allowAiAssign: false, order: tagOptions(type).length + 1 };
      tagOptions(type).push(created);
      return created.key;
    });
  }

  function resolveAnalysisTagKeys(values, type, item) {
    const keys = namesToTagKeys(values.join(", "), type).filter(Boolean);
    const otherKey = fallbackTag(type);
    const hasOnlyOther = keys.length === 1 && keys[0] === otherKey;
    if (!hasOnlyOther) return keys;
    const context = [
      item.title,
      item.tags?.join(" "),
      promptText(item, "final"),
    ].filter(Boolean).join(" ");
    const inferred = inferTags(context, type).filter((key) => key && key !== otherKey);
    return inferred.length ? inferred : keys;
  }

  function inferTags(source, type) {
    const text = String(source || "").toLowerCase();
    const otherKey = fallbackTag(type);
    const scored = tagOptions(type)
      .filter((tag) => tag.enabled !== false && tag.allowAiAssign !== false)
      .filter((tag) => tag.key !== otherKey && tag.name !== "기타")
      .map((tag) => {
        let score = 0;
        const terms = [tag.name, ...(tag.keywords || [])]
          .map((term) => String(term || "").toLowerCase().trim())
          .filter(Boolean);
        terms.forEach((term) => {
          if (termMatchesPromptText(text, term)) score += Math.min(term.length, 24) + (term.includes(" ") ? 4 : 0);
        });
        return { key: tag.key, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
    if (!scored.length) return otherKey ? [otherKey] : [];
    return scored.slice(0, 3).map((entry) => entry.key);
  }

  function termMatchesPromptText(text, term) {
    const value = String(term || "").toLowerCase().trim();
    if (!value || !text) return false;
    // Short English tokens use word-ish boundaries so "suit" does not match "suitcase".
    if (/^[a-z0-9][a-z0-9\s/-]{0,20}$/i.test(value) && value.length <= 12) {
      const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
      return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`, "i").test(text);
    }
    return text.includes(value);
  }

  function fallbackTag(type) {
    return tagOptions(type).find((tag) => tag.name === "기타")?.key || tagOptions(type)[0]?.key || "";
  }

  function bindLoraSorterEvents() {
    if (ui.modal !== "loraSorter") return;
    document.getElementById("loraSorterIncludeSubfolders")?.addEventListener("change", async (event) => {
      loraSorterState.includeSubfolders = event.target.checked;
      void saveLoraSorterSettings();
      if (loraSorterState.sourceHandle) await scanLoraSorterFolder();
    });
    document.getElementById("loraSorterCollisionMode")?.addEventListener("change", (event) => {
      loraSorterState.collisionMode = event.target.value === "skip" ? "skip" : "rename";
      void saveLoraSorterSettings();
    });
    document.getElementById("loraDetectionExclusionInput")?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || event.isComposing) return;
      event.preventDefault();
      addLoraDetectionExclusion(event.target.value);
    });
  }

  async function restoreLoraSorterSettings() {
    if (!window.PromptArchiveLoraSorterStorage) return;
    try {
      const restored = await window.PromptArchiveLoraSorterStorage.load();
      if (!restored) return;
      loraSorterState.sourceHandle = restored.sourceHandle;
      loraSorterState.baseDestinationHandle = restored.baseDestinationHandle;
      loraSorterState.destinationHandles = restored.destinationHandles;
      loraSorterState.excludedGroupKeys = restored.excludedGroupKeys;
      loraSorterState.detectionExcludedLoras = restored.detectionExcludedLoras || new Set();
      loraSorterState.includeSubfolders = restored.includeSubfolders;
      loraSorterState.collisionMode = restored.collisionMode;
      render();
    } catch (error) {
      console.warn("LoRA sorter settings restore failed", error);
    }
  }

  async function saveLoraSorterSettings() {
    if (!window.PromptArchiveLoraSorterStorage) return false;
    try {
      return await window.PromptArchiveLoraSorterStorage.save(loraSorterState);
    } catch (error) {
      console.warn("LoRA sorter settings save failed", error);
      return false;
    }
  }

  async function selectLoraSorterSourceFolder() {
    if (loraSorterState.scanning || loraSorterState.moving) return;
    try {
      const handle = await window.showDirectoryPicker({ id: "prompt-archive-lora-source", mode: "readwrite" });
      if (!(await ensureDirectoryPermission(handle, true))) throw new Error("이미지를 이동하려면 원본 폴더의 읽기·쓰기 권한이 필요합니다.");
      loraSorterState.sourceHandle = handle;
      loraSorterState.scannedFiles = [];
      loraSorterState.groups = [];
      loraSorterState.excludedGroupKeys.clear();
      loraSorterState.result = null;
      await saveLoraSorterSettings();
      await scanLoraSorterFolder();
    } catch (error) {
      if (error?.name !== "AbortError") showToast(error.message || "이미지 폴더를 열지 못했습니다.", "warning", 3200);
    }
  }

  async function selectLoraSorterBaseDestination() {
    if (loraSorterState.scanning || loraSorterState.moving) return;
    try {
      const handle = await window.showDirectoryPicker({ id: "prompt-archive-lora-destination", mode: "readwrite" });
      if (!(await ensureDirectoryPermission(handle, true))) throw new Error("목적지 폴더의 쓰기 권한이 필요합니다.");
      loraSorterState.baseDestinationHandle = handle;
      loraSorterState.result = null;
      await saveLoraSorterSettings();
      render();
    } catch (error) {
      if (error?.name !== "AbortError") showToast(error.message || "목적지 폴더를 열지 못했습니다.", "warning", 3200);
    }
  }

  async function selectLoraGroupDestination(groupKey) {
    if (!groupKey || loraSorterState.scanning || loraSorterState.moving) return;
    const group = loraSorterState.groups.find((entry) => entry.key === groupKey && entry.movable);
    if (!group) return;
    try {
      const handle = await window.showDirectoryPicker({ id: "pa-lora-dest", mode: "readwrite" });
      if (!(await ensureDirectoryPermission(handle, true))) throw new Error("선택한 폴더의 쓰기 권한이 필요합니다.");
      loraSorterState.destinationHandles.set(group.key, handle);
      loraSorterState.excludedGroupKeys.delete(group.key);
      loraSorterState.result = null;
      await saveLoraSorterSettings();
      render();
    } catch (error) {
      if (error?.name !== "AbortError") showToast(error.message || "LoRA 목적지 폴더를 열지 못했습니다.", "warning", 3200);
    }
  }

  function toggleLoraGroupExcluded(groupKey) {
    if (!groupKey || loraSorterState.scanning || loraSorterState.moving) return;
    const group = loraSorterState.groups.find((entry) => entry.key === groupKey && entry.movable);
    if (!group) return;
    if (loraSorterState.excludedGroupKeys.has(groupKey)) {
      loraSorterState.excludedGroupKeys.delete(groupKey);
    } else {
      loraSorterState.excludedGroupKeys.add(groupKey);
    }
    loraSorterState.result = null;
    void saveLoraSorterSettings();
    render();
  }

  function refreshLoraSorterGroups() {
    loraSorterState.groups = window.PromptArchiveLoraSorter.groupInspectedFiles(loraSorterState.scannedFiles, loraSorterState.detectionExcludedLoras);
    loraSorterState.result = null;
  }

  function addLoraDetectionExclusion(value) {
    if (loraSorterState.scanning || loraSorterState.moving) return;
    const name = window.PromptArchiveLoraSorter.normalizeLoraExclusion(value);
    if (!name) {
      showToast("제외할 LoRA 이름을 입력해주세요.", "warning");
      return;
    }
    if (window.PromptArchiveLoraSorter.isLoraDetectionExcluded(name, loraSorterState.detectionExcludedLoras)) {
      showToast("이미 감지 제외 목록에 있습니다.", "warning");
      return;
    }
    loraSorterState.detectionExcludedLoras.add(name);
    refreshLoraSorterGroups();
    void saveLoraSorterSettings();
    render();
    showToast(`${name}을(를) 감지에서 제외했습니다.`, "success");
  }

  function removeLoraDetectionExclusion(value) {
    if (loraSorterState.scanning || loraSorterState.moving) return;
    const target = window.PromptArchiveLoraSorter.normalizeLoraExclusion(value).toLowerCase();
    if (!target) return;
    for (const name of loraSorterState.detectionExcludedLoras) {
      if (window.PromptArchiveLoraSorter.normalizeLoraExclusion(name).toLowerCase() === target) {
        loraSorterState.detectionExcludedLoras.delete(name);
      }
    }
    refreshLoraSorterGroups();
    void saveLoraSorterSettings();
    render();
    showToast("감지 제외를 해제했습니다.", "success");
  }

  async function collectLoraImageHandles(rootHandle, recursive, relativeParts = [], results = []) {
    for await (const [name, handle] of rootHandle.entries()) {
      if (handle.kind === "file" && window.PromptArchiveLoraSorter.isSupportedImageName(name)) {
        results.push({ handle, parentHandle: rootHandle, name, relativeParts: [...relativeParts] });
      } else if (recursive && handle.kind === "directory") {
        await collectLoraImageHandles(handle, true, [...relativeParts, name], results);
      }
    }
    return results.sort((left, right) => {
      const leftPath = [...left.relativeParts, left.name].join("/");
      const rightPath = [...right.relativeParts, right.name].join("/");
      return leftPath.localeCompare(rightPath, "ko");
    });
  }

  async function scanLoraSorterFolder() {
    if (!loraSorterState.sourceHandle || loraSorterState.scanning || loraSorterState.moving) return;
    loraSorterState.scanning = true;
    loraSorterState.result = null;
    loraSorterState.scannedFiles = [];
    loraSorterState.groups = [];
    try {
      const files = await collectLoraImageHandles(loraSorterState.sourceHandle, loraSorterState.includeSubfolders);
      loraSorterState.progress = { phase: "scan", current: 0, total: files.length, fileName: "메타데이터 검사 준비 중", errors: [] };
      render();
      for (let index = 0; index < files.length; index += 1) {
        const entry = files[index];
        const relativeName = [...entry.relativeParts, entry.name].join("/");
        loraSorterState.progress.current = index;
        loraSorterState.progress.fileName = relativeName;
        updateLoraSorterProgressDom();
        try {
          const file = await entry.handle.getFile();
          const inspection = window.PromptArchiveLoraSorter.inspectImageMetadata(await file.arrayBuffer(), file.type);
          loraSorterState.scannedFiles.push({
            ...entry,
            size: file.size,
            lastModified: file.lastModified,
            inspection,
            classification: window.PromptArchiveLoraSorter.classificationForInspection(inspection, loraSorterState.detectionExcludedLoras),
          });
        } catch (error) {
          loraSorterState.progress.errors.push(`${relativeName}: ${error.message || error}`);
          loraSorterState.scannedFiles.push({
            ...entry,
            inspection: { status: "unreadable", loras: [], error: error.message || String(error) },
            classification: { key: "__unreadable__", label: "메타데이터 판독 불가", kind: "unreadable" },
          });
        } finally {
          loraSorterState.progress.current = index + 1;
          updateLoraSorterProgressDom();
        }
      }
      refreshLoraSorterGroups();
      const matched = loraSorterState.groups.filter((group) => group.movable).reduce((total, group) => total + group.count, 0);
      loraSorterState.progress.fileName = `${matched}장 LoRA 분류 가능`;
      showToast(files.length ? `${files.length}장 검사 완료 · ${matched}장 분류 가능` : "지원하는 이미지 파일을 찾지 못했습니다.", files.length ? "success" : "warning", 3000);
    } finally {
      loraSorterState.scanning = false;
      render();
    }
  }

  async function startLoraSorterMove() {
    if (loraSorterState.scanning || loraSorterState.moving || !loraSorterState.sourceHandle) return;
    loraSorterState.collisionMode = document.getElementById("loraSorterCollisionMode")?.value === "skip" ? "skip" : "rename";
    const jobs = [];
    for (const group of loraSorterState.groups.filter((entry) => entry.movable && !loraSorterState.excludedGroupKeys.has(entry.key))) {
      const customDestination = loraSorterState.destinationHandles.get(group.key);
      if (!customDestination && !loraSorterState.baseDestinationHandle) continue;
      group.files.forEach((file) => jobs.push({ file, group, customDestination }));
    }
    if (!jobs.length) {
      showToast("이동할 LoRA와 목적지 폴더를 먼저 지정해주세요.", "warning");
      return;
    }
    const confirmed = confirm(`${jobs.length}개 이미지를 LoRA별 폴더로 이동합니다.\n\n목적지에 복사하고 크기를 검증한 뒤 원본을 영구 삭제합니다. 계속할까요?`);
    if (!confirmed) return;
    if (!(await ensureDirectoryPermission(loraSorterState.sourceHandle, true))) {
      showToast("원본 폴더의 읽기·쓰기 권한이 필요합니다.", "warning");
      return;
    }
    if (loraSorterState.baseDestinationHandle && !(await ensureDirectoryPermission(loraSorterState.baseDestinationHandle, true))) {
      showToast("자동 분류 기준 폴더의 쓰기 권한이 필요합니다.", "warning");
      return;
    }
    const customHandles = [...new Set(jobs.map((job) => job.customDestination).filter(Boolean))];
    for (const handle of customHandles) {
      if (!(await ensureDirectoryPermission(handle, true))) {
        showToast(`${handle.name} 폴더의 쓰기 권한이 필요합니다.`, "warning");
        return;
      }
    }

    loraSorterState.moving = true;
    loraSorterState.result = null;
    const result = {
      total: jobs.length,
      moved: 0,
      skipped: 0,
      excluded: Math.max(0, loraSorterState.scannedFiles.length - jobs.length),
      failed: 0,
      errors: [],
      summary: "",
    };
    const movedEntries = new Set();
    loraSorterState.progress = { phase: "move", current: 0, total: jobs.length, fileName: "이동 준비 중", errors: result.errors };
    render();
    try {
      for (let index = 0; index < jobs.length; index += 1) {
        const { file: entry, group, customDestination } = jobs[index];
        const relativeName = [...entry.relativeParts, entry.name].join("/");
        loraSorterState.progress.current = index;
        loraSorterState.progress.fileName = relativeName;
        updateLoraSorterProgressDom();
        try {
          const destination = customDestination || await loraSorterState.baseDestinationHandle.getDirectoryHandle(
            window.PromptArchiveLoraSorter.safeFolderName(group.label),
            { create: true },
          );
          if (typeof destination.isSameEntry === "function" && await destination.isSameEntry(entry.parentHandle)) {
            throw new Error("원본과 목적지 폴더가 같습니다.");
          }
          const outputName = await loraSorterOutputName(destination, entry.name, loraSorterState.collisionMode);
          if (!outputName) {
            result.skipped += 1;
            continue;
          }
          await moveLoraSorterFile(entry, destination, outputName);
          result.moved += 1;
          movedEntries.add(entry);
        } catch (error) {
          result.failed += 1;
          result.errors.push(`${relativeName}: ${error.message || error}`);
          loraSorterState.progress.errors = result.errors;
        } finally {
          loraSorterState.progress.current = index + 1;
          updateLoraSorterProgressDom();
        }
      }
    } finally {
      loraSorterState.moving = false;
      loraSorterState.scannedFiles = loraSorterState.scannedFiles.filter((entry) => !movedEntries.has(entry));
      refreshLoraSorterGroups();
      result.summary = `${result.moved}장 이동 · ${result.skipped}장 건너뜀 · ${result.failed}장 오류`;
      loraSorterState.result = result;
      loraSorterState.progress = { phase: "move", current: jobs.length, total: jobs.length, fileName: result.summary, errors: result.errors };
      render();
      showToast(result.errors.length ? result.summary : `${result.moved}장 LoRA별 이동 완료`, result.errors.length ? "warning" : "success", 4200);
    }
  }

  async function loraSorterOutputName(directory, fileName, collisionMode) {
    for (let attempt = 0; attempt < 10000; attempt += 1) {
      const candidate = window.PromptArchiveLoraSorter.collisionFileName(fileName, attempt);
      if (!(await directoryHasFile(directory, candidate))) return candidate;
      if (collisionMode === "skip") return "";
    }
    throw new Error("사용 가능한 중복 파일명을 만들지 못했습니다.");
  }

  async function moveLoraSorterFile(entry, destination, outputName) {
    const sourceFile = await entry.handle.getFile();
    const outputHandle = await destination.getFileHandle(outputName, { create: true });
    let written = false;
    try {
      await writeConverterOutput(outputHandle, sourceFile);
      written = true;
      const outputFile = await outputHandle.getFile();
      if (outputFile.size !== sourceFile.size) throw new Error("복사된 파일 크기 검증에 실패했습니다.");
      if (!entry.parentHandle || typeof entry.parentHandle.removeEntry !== "function") throw new Error("현재 브라우저가 원본 파일 이동을 지원하지 않습니다.");
      await entry.parentHandle.removeEntry(entry.name);
    } catch (error) {
      if (written && typeof destination.removeEntry === "function") {
        try {
          await destination.removeEntry(outputName);
        } catch (_) {
          // Keep the original failure; an incomplete destination is reported by its filename.
        }
      }
      throw error;
    }
  }

  function updateLoraSorterProgressDom() {
    const progress = loraSorterState.progress;
    if (!progress) return;
    const percent = progress.total ? Math.round((progress.current / progress.total) * 100) : 0;
    const values = [
      ["[data-lora-progress-title]", loraSorterProgressTitle(progress)],
      ["[data-lora-progress-file]", progress.fileName || ""],
      ["[data-lora-progress-percent]", `${percent}%`],
      ["[data-lora-mini-title]", loraSorterProgressTitle(progress)],
      ["[data-lora-mini-file]", progress.fileName || ""],
      ["[data-lora-mini-percent]", `${percent}%`],
    ];
    values.forEach(([selector, value]) => {
      const element = document.querySelector(selector);
      if (element) element.textContent = value;
    });
    document.querySelectorAll("[data-lora-progress-bar], [data-lora-mini-bar]").forEach((bar) => {
      bar.style.width = `${percent}%`;
    });
    const errors = document.querySelector("[data-lora-progress-errors]");
    if (errors) errors.innerHTML = (progress.errors || []).slice(-5).map((message) => `<li>${escapeHtml(message)}</li>`).join("");
  }

  function bindConverterEvents() {
    if (ui.modal !== "converter") return;
    document.querySelectorAll('input[name="converterSourceMode"]').forEach((input) => {
      input.addEventListener("change", async (event) => {
        converterState.sourceMode = event.target.value === "files" ? "files" : "folder";
        if (converterState.sourceMode === "files") {
          converterState.destinationMode = "custom";
          converterState.deleteOriginals = false;
          converterState.sourceFiles = [...converterState.selectedFiles];
        } else {
          converterState.sourceFiles = converterState.sourceHandle
            ? await collectPngFileHandles(converterState.sourceHandle, converterState.includeSubfolders)
            : [];
        }
        converterState.progress = null;
        converterState.result = null;
        render();
      });
    });
    document.querySelectorAll('input[name="converterDestinationMode"]').forEach((input) => {
      input.addEventListener("change", (event) => {
        converterState.destinationMode = event.target.value === "custom" ? "custom" : "source";
        document.querySelectorAll(".converter-choice").forEach((choice) => {
          choice.classList.toggle("selected", choice.querySelector("input")?.checked);
        });
        document.querySelector("[data-converter-destination]")?.classList.toggle("visible", converterState.destinationMode === "custom");
      });
    });
    document.getElementById("converterIncludeSubfolders")?.addEventListener("change", async (event) => {
      converterState.includeSubfolders = event.target.checked;
      if (!converterState.sourceHandle) return;
      converterState.sourceFiles = await collectPngFileHandles(converterState.sourceHandle, converterState.includeSubfolders);
      converterState.result = null;
      render();
    });
    document.getElementById("converterQuality")?.addEventListener("input", (event) => {
      converterState.quality = clampNumber(event.target.value, 70, 100, 100);
      const output = document.getElementById("converterQualityOutput");
      if (output) output.textContent = String(converterState.quality);
    });
    document.getElementById("converterCollisionMode")?.addEventListener("change", (event) => {
      converterState.collisionMode = ["rename", "skip", "overwrite"].includes(event.target.value) ? event.target.value : "rename";
    });
    document.getElementById("converterDeleteOriginals")?.addEventListener("change", (event) => {
      converterState.deleteOriginals = converterState.sourceMode === "folder" && event.target.checked;
      event.target.closest(".converter-delete-check")?.classList.toggle("active", converterState.deleteOriginals);
      const copy = document.querySelector(".converter-run-summary small");
      if (copy) {
        copy.textContent = converterState.deleteOriginals
          ? "변환 성공 PNG는 작업 완료 후 영구 삭제됩니다."
          : "원본 PNG는 삭제하거나 변경하지 않습니다.";
        copy.classList.toggle("converter-destructive-copy", converterState.deleteOriginals);
      }
    });
    document.getElementById("converterFileInput")?.addEventListener("change", (event) => {
      addConverterFiles(event.target.files);
    });
    const dropzone = document.querySelector("[data-converter-dropzone]");
    if (dropzone && converterState.sourceMode === "files") {
      ["dragenter", "dragover"].forEach((name) => dropzone.addEventListener(name, (event) => {
        event.preventDefault();
        if (!converterState.running) dropzone.classList.add("dragging");
      }));
      ["dragleave", "drop"].forEach((name) => dropzone.addEventListener(name, (event) => {
        event.preventDefault();
        dropzone.classList.remove("dragging");
      }));
      dropzone.addEventListener("drop", (event) => {
        if (!converterState.running) addConverterFiles(event.dataTransfer?.files);
      });
    }
  }

  async function rebuildWildcardsFromArchive() {
    if (converterState.wildcardSyncing) return;
    const confirmed = confirm("전체 갱신은 현재 아카이브에 남아 있는 프롬프트만으로 와일드카드 파일을 다시 작성합니다.\n\n삭제한 항목은 빠지며, 와일드카드 파일에 수동으로 추가한 줄도 제거됩니다. 계속할까요?");
    if (!confirmed) return;
    await syncWildcardsFromArchive({ mode: "rebuild" });
  }

  async function syncWildcardsFromArchive(options = {}) {
    if (converterState.wildcardSyncing) return;
    const mode = options.mode === "rebuild" ? "rebuild" : "incremental";
    converterState.wildcardSyncing = true;
    converterState.wildcardSyncMode = mode;
    converterState.wildcardSyncResult = null;
    render();
    try {
      clearTimeout(settingsSaveTimer);
      const settingsSaved = await syncSettingsToServer();
      if (!settingsSaved) throw new Error("최신 와일드카드 분류 설정을 서버에 저장하지 못했습니다.");
      clearTimeout(itemsSaveTimer);
      const itemsSaved = await syncItemsToServer();
      if (!itemsSaved) throw new Error("최신 프롬프트 항목을 서버에 저장하지 못했습니다.");
      const endpoint = mode === "rebuild" ? `${SERVER_WILDCARD_SYNC_ENDPOINT}?mode=rebuild` : SERVER_WILDCARD_SYNC_ENDPOINT;
      const response = await fetch(endpoint, { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.message || "와일드카드 업데이트에 실패했습니다.");
      converterState.wildcardSyncResult = payload;
      if (payload.rebuilt) {
        showToast(`전체 갱신 완료 · 외모 ${payload.appearanceWritten}줄 · 시나리오 ${payload.scenariosWritten ?? payload.scenarioWritten}줄`, payload.invalidItems ? "warning" : "success", 3200);
      } else if (payload.initialized) {
        showToast(`현재 ${payload.totalItems}개를 업데이트 기준으로 등록했습니다.`, "success", 2600);
      } else {
        showToast(`와일드카드 업데이트 완료 · 새 항목 ${payload.newItems}개`, payload.invalidItems ? "warning" : "success", 2600);
      }
    } catch (error) {
      converterState.wildcardSyncResult = { error: error?.message || "와일드카드 업데이트에 실패했습니다." };
      showToast(converterState.wildcardSyncResult.error, "warning", 3200);
    } finally {
      converterState.wildcardSyncing = false;
      converterState.wildcardSyncMode = "";
      render();
    }
  }

  function addConverterFiles(fileList) {
    const incoming = [...(fileList || [])].filter((file) => file.type === "image/png" || /\.png$/i.test(file.name));
    if (!incoming.length) {
      showToast("PNG 파일만 선택할 수 있습니다.", "warning");
      return;
    }
    const filesByKey = new Map(converterState.selectedFiles.map((entry) => [entry.key, entry]));
    incoming.forEach((file) => {
      const key = `${file.name}:${file.size}:${file.lastModified}`;
      filesByKey.set(key, { file, key, name: file.name, relativeParts: [] });
    });
    converterState.selectedFiles = [...filesByKey.values()].sort((left, right) => left.name.localeCompare(right.name, "ko"));
    converterState.sourceFiles = [...converterState.selectedFiles];
    converterState.progress = null;
    converterState.result = null;
    render();
  }

  function resetConverterSelection() {
    if (converterState.running) return;
    converterState.sourceHandle = null;
    converterState.selectedFiles = [];
    converterState.sourceFiles = [];
    converterState.deleteOriginals = false;
    converterState.progress = null;
    converterState.result = null;
    render();
  }

  async function selectConverterSourceFolder() {
    try {
      const handle = await window.showDirectoryPicker({ id: "prompt-archive-png-source", mode: "readwrite" });
      if (!(await ensureDirectoryPermission(handle, true))) throw new Error("원본 폴더의 읽기·쓰기 권한이 필요합니다.");
      converterState.sourceHandle = handle;
      converterState.sourceMode = "folder";
      converterState.sourceFiles = await collectPngFileHandles(handle, converterState.includeSubfolders);
      converterState.progress = null;
      converterState.result = null;
      render();
      if (!converterState.sourceFiles.length) showToast("선택한 범위에서 PNG 파일을 찾지 못했습니다.", "warning");
    } catch (error) {
      if (error?.name !== "AbortError") showToast(error.message || "원본 폴더를 열지 못했습니다.", "warning");
    }
  }

  async function selectConverterDestinationFolder() {
    try {
      const handle = await window.showDirectoryPicker({ id: "prompt-archive-webp-destination", mode: "readwrite" });
      if (!(await ensureDirectoryPermission(handle, true))) throw new Error("저장 폴더의 쓰기 권한이 필요합니다.");
      converterState.destinationHandle = handle;
      converterState.destinationMode = "custom";
      render();
    } catch (error) {
      if (error?.name !== "AbortError") showToast(error.message || "저장 폴더를 열지 못했습니다.", "warning");
    }
  }

  async function ensureDirectoryPermission(handle, write = false) {
    const options = { mode: write ? "readwrite" : "read" };
    if ((await handle.queryPermission(options)) === "granted") return true;
    return (await handle.requestPermission(options)) === "granted";
  }

  async function collectPngFileHandles(rootHandle, recursive, relativeParts = [], results = []) {
    for await (const [name, handle] of rootHandle.entries()) {
      if (handle.kind === "file" && /\.png$/i.test(name)) {
        results.push({ handle, parentHandle: rootHandle, name, relativeParts: [...relativeParts] });
      } else if (recursive && handle.kind === "directory") {
        await collectPngFileHandles(handle, true, [...relativeParts, name], results);
      }
    }
    return results.sort((left, right) => {
      const leftPath = [...left.relativeParts, left.name].join("/");
      const rightPath = [...right.relativeParts, right.name].join("/");
      return leftPath.localeCompare(rightPath, "ko");
    });
  }

  async function startPngToWebpConversion() {
    if (converterState.running || !converterState.sourceFiles.length) return;
    converterState.destinationMode = converterState.sourceMode === "files"
      ? "custom"
      : document.querySelector('input[name="converterDestinationMode"]:checked')?.value === "custom" ? "custom" : "source";
    if (converterState.sourceMode === "folder") {
      converterState.includeSubfolders = Boolean(document.getElementById("converterIncludeSubfolders")?.checked);
      converterState.deleteOriginals = Boolean(document.getElementById("converterDeleteOriginals")?.checked);
    } else {
      converterState.deleteOriginals = false;
    }
    converterState.quality = clampNumber(document.getElementById("converterQuality")?.value, 70, 100, 100);
    converterState.collisionMode = document.getElementById("converterCollisionMode")?.value || "rename";
    if (converterState.destinationMode === "custom" && !converterState.destinationHandle) {
      showToast("WebP를 저장할 폴더를 선택해주세요.", "warning");
      return;
    }
    if (converterState.deleteOriginals && !confirm("변환과 WebP 저장에 성공한 원본 PNG를 영구 삭제합니다.\n\n휴지통으로 이동하지 않으며 복구할 수 없습니다. 계속할까요?")) {
      return;
    }

    if (converterState.sourceMode === "folder") {
      const needsSourceWrite = converterState.destinationMode === "source" || converterState.deleteOriginals;
      if (!converterState.sourceHandle || !(await ensureDirectoryPermission(converterState.sourceHandle, needsSourceWrite))) {
        showToast("원본 폴더 권한이 만료되었습니다. 폴더를 다시 선택해주세요.", "warning");
        return;
      }
    }
    if (converterState.destinationMode === "custom" && !(await ensureDirectoryPermission(converterState.destinationHandle, true))) {
      showToast("저장 폴더 권한이 만료되었습니다. 폴더를 다시 선택해주세요.", "warning");
      return;
    }

    const files = converterState.sourceMode === "folder"
      ? await collectPngFileHandles(converterState.sourceHandle, converterState.includeSubfolders)
      : [...converterState.selectedFiles];
    if (!files.length) {
      showToast("변환할 PNG 파일이 없습니다.", "warning");
      return;
    }
    converterState.sourceFiles = files;
    converterState.running = true;
    converterState.result = null;
    converterState.progress = { current: 0, total: files.length, fileName: "변환 준비 중", errors: [] };
    render();

    const deleteQueue = [];
    const result = {
      total: files.length,
      converted: 0,
      skipped: 0,
      deleted: 0,
      metadataFiles: 0,
      inputBytes: 0,
      outputBytes: 0,
      errors: [],
      summary: "",
    };

    try {
      for (let index = 0; index < files.length; index += 1) {
        const entry = files[index];
        const relativeName = [...entry.relativeParts, entry.name].join("/");
        converterState.progress.current = index;
        converterState.progress.fileName = relativeName;
        updateConverterProgressDom();
        try {
          const outputDirectory = await converterOutputDirectory(entry);
          const outputName = await converterOutputName(outputDirectory, entry.name, converterState.collisionMode);
          if (!outputName) {
            result.skipped += 1;
            continue;
          }
          const converted = await convertPngEntryToWebp(entry, converterState.quality);
          const outputHandle = await outputDirectory.getFileHandle(outputName, { create: true });
          await writeConverterOutput(outputHandle, converted.blob);
          result.converted += 1;
          result.inputBytes += converted.inputBytes;
          result.outputBytes += converted.blob.size;
          if (converted.metadataPreserved) result.metadataFiles += 1;
          if (converterState.deleteOriginals) deleteQueue.push({ entry, relativeName });
        } catch (error) {
          const message = `${relativeName}: ${error.message || error}`;
          result.errors.push(message);
          converterState.progress.errors = result.errors;
        } finally {
          converterState.progress.current = index + 1;
          updateConverterProgressDom();
        }
      }
      if (converterState.deleteOriginals && deleteQueue.length) {
        converterState.progress = { current: 0, total: deleteQueue.length, fileName: "원본 삭제 준비 중", errors: result.errors, phase: "delete" };
        updateConverterProgressDom();
        for (let index = 0; index < deleteQueue.length; index += 1) {
          const { entry, relativeName } = deleteQueue[index];
          converterState.progress.current = index;
          converterState.progress.fileName = relativeName;
          updateConverterProgressDom();
          try {
            await permanentlyDeleteConvertedPng(entry);
            result.deleted += 1;
          } catch (error) {
            result.errors.push(`${relativeName}: 원본 삭제 실패 · ${error.message || error}`);
            converterState.progress.errors = result.errors;
          } finally {
            converterState.progress.current = index + 1;
            updateConverterProgressDom();
          }
        }
      }
    } finally {
      converterState.running = false;
      result.summary = result.converted
        ? `${formatBytes(result.inputBytes)} → ${formatBytes(result.outputBytes)} · ${Math.max(0, Math.round((1 - result.outputBytes / Math.max(1, result.inputBytes)) * 100))}% 절감`
        : "저장된 파일이 없습니다.";
      converterState.result = result;
      converterState.progress = { current: files.length, total: files.length, fileName: result.summary, errors: result.errors };
      addConverterHistory(result);
      render();
      showToast(
        result.errors.length
          ? `${result.converted}개 변환 완료, 원본 ${result.deleted}개 삭제, ${result.errors.length}개 오류`
          : `${result.converted}개 변환 완료${result.deleted ? ` · 원본 ${result.deleted}개 영구 삭제` : ""}`,
        result.errors.length ? "warning" : "success",
        4200
      );
    }
  }

  async function converterOutputDirectory(entry) {
    if (converterState.destinationMode === "source" && entry.parentHandle) return entry.parentHandle;
    let directory = converterState.destinationHandle;
    for (const name of entry.relativeParts) directory = await directory.getDirectoryHandle(name, { create: true });
    return directory;
  }

  async function converterOutputName(directory, pngName, collisionMode) {
    const base = pngName.replace(/\.png$/i, "");
    const preferred = `${base}.webp`;
    if (!(await directoryHasFile(directory, preferred)) || collisionMode === "overwrite") return preferred;
    if (collisionMode === "skip") return "";
    let index = 0;
    while (true) {
      const suffix = index === 0 ? "_webp" : `_webp_${index + 1}`;
      const candidate = `${base}${suffix}.webp`;
      if (!(await directoryHasFile(directory, candidate))) return candidate;
      index += 1;
    }
  }

  async function directoryHasFile(directory, name) {
    try {
      await directory.getFileHandle(name);
      return true;
    } catch (error) {
      if (error?.name === "NotFoundError") return false;
      throw error;
    }
  }

  async function writeConverterOutput(fileHandle, blob) {
    const writable = await fileHandle.createWritable();
    try {
      await writable.write(blob);
      await writable.close();
    } catch (error) {
      try {
        if (typeof writable.abort === "function") await writable.abort();
      } catch (_) {
        // The original write error is more useful than a secondary abort error.
      }
      throw error;
    }
  }

  async function permanentlyDeleteConvertedPng(entry) {
    if (entry.parentHandle && typeof entry.parentHandle.removeEntry === "function") {
      await entry.parentHandle.removeEntry(entry.name);
      return;
    }
    if (entry.handle && typeof entry.handle.remove === "function") {
      await entry.handle.remove();
      return;
    }
    throw new Error("현재 브라우저가 선택한 원본 파일 삭제를 지원하지 않습니다.");
  }

  async function convertPngEntryToWebp(entry, quality) {
    const file = entry.file || await entry.handle.getFile();
    const pngBuffer = await file.arrayBuffer();
    const bitmap = await createImageBitmap(new Blob([pngBuffer], { type: "image/png" }));
    try {
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d", { alpha: true });
      if (!context) throw new Error("브라우저 캔버스를 만들 수 없습니다.");
      context.drawImage(bitmap, 0, 0);
      const encoded = await canvasToBlob(canvas, "image/webp", quality / 100);
      const preserved = await window.PromptArchiveImageConverter.preservePngMetadataInWebp(
        await encoded.arrayBuffer(),
        pngBuffer,
        bitmap.width,
        bitmap.height
      );
      const chunks = window.PromptArchiveImageConverter.parseWebpChunks(preserved.bytes);
      if (preserved.hasExif && !chunks.some((chunk) => chunk.type === "EXIF")) throw new Error("EXIF 기록 검증에 실패했습니다.");
      if (preserved.hasXmp && !chunks.some((chunk) => chunk.type === "XMP ")) throw new Error("XMP 기록 검증에 실패했습니다.");
      return {
        blob: new Blob([preserved.bytes], { type: "image/webp" }),
        inputBytes: file.size,
        metadataPreserved: preserved.hasExif || preserved.hasXmp,
      };
    } finally {
      bitmap.close?.();
    }
  }

  function updateConverterProgressDom() {
    const progress = converterState.progress;
    if (!progress) return;
    const percent = progress.total ? Math.round((progress.current / progress.total) * 100) : 0;
    const title = document.querySelector("[data-converter-progress-title]");
    const file = document.querySelector("[data-converter-progress-file]");
    const percentNode = document.querySelector("[data-converter-progress-percent]");
    const bar = document.querySelector("[data-converter-progress-bar]");
    const errors = document.querySelector("[data-converter-errors]");
    const miniTitle = document.querySelector("[data-converter-mini-title]");
    const miniFile = document.querySelector("[data-converter-mini-file]");
    const miniPercent = document.querySelector("[data-converter-mini-percent]");
    const miniBar = document.querySelector("[data-converter-mini-bar]");
    if (title) title.textContent = converterProgressTitle(progress);
    if (file) file.textContent = progress.fileName || "";
    if (percentNode) percentNode.textContent = `${percent}%`;
    if (bar) bar.style.width = `${percent}%`;
    if (errors) errors.innerHTML = (progress.errors || []).slice(-5).map((message) => `<li>${escapeHtml(message)}</li>`).join("");
    if (miniTitle) miniTitle.textContent = converterProgressTitle(progress);
    if (miniFile) miniFile.textContent = progress.fileName || "";
    if (miniPercent) miniPercent.textContent = `${percent}%`;
    if (miniBar) miniBar.style.width = `${percent}%`;
  }

  async function validatePendingExifPrompts(files) {
    const prompts = {};
    const errors = {};
    const invalidKeys = [];
    for (const file of files) {
      const key = pendingUploadKey(file);
      try {
        validateUploadFile(file);
        const parsed = await readExifPromptFromFile(file);
        prompts[key] = parsed;
      } catch (error) {
        errors[key] = error.message || "EXIF 프롬프트를 읽지 못했습니다.";
        invalidKeys.push(key);
      }
    }
    return { prompts, errors, invalidKeys };
  }

  async function readExifPromptFromFile(file) {
    const parsed = await readPromptViewerFile(file);
    if (!parsed?.promptJson) {
      throw new Error("EXIF / 메타데이터에 5문단 프롬프트가 없습니다.");
    }
    return parsed;
  }

  async function readPromptViewerFile(file) {
    const buffer = await file.arrayBuffer();
    const metadata = extractImageMetadataText(buffer, file.type || "");
    const parsed = parseExifPromptMetadata(metadata);
    if (parsed?.promptJson) return parsed;
    const candidates = metadata
      .flatMap((entry) => collectPromptCandidates(entry.text, entry.source))
      .sort((left, right) => promptCandidateScore(right) - promptCandidateScore(left));
    const fallback = candidates.find((candidate) => candidate.text.length > 20);
    return {
      promptJson: null,
      rawText: fallback?.text?.slice(0, 30000) || "",
      source: fallback?.source || "",
      titleSummary: "",
    };
  }

  function extractImageMetadataText(buffer, mimeType) {
    const bytes = new Uint8Array(buffer);
    const chunks = [];
    const add = (source, value) => {
      const text = cleanMetadataText(value);
      if (text) chunks.push({ source, text });
    };
    if (mimeType === "image/png" || hasPngSignature(bytes)) {
      extractPngMetadata(bytes).forEach((entry) => add(entry.source, entry.text));
    }
    if (mimeType === "image/jpeg" || hasJpegSignature(bytes)) {
      extractJpegMetadata(bytes).forEach((entry) => add(entry.source, entry.text));
    }
    if (mimeType === "image/webp" || hasWebpSignature(bytes)) {
      extractWebpMetadata(bytes).forEach((entry) => add(entry.source, entry.text));
    }
    add("raw-scan", scanBufferForPromptText(bytes));
    return chunks;
  }

  function hasPngSignature(bytes) {
    return bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  }

  function hasJpegSignature(bytes) {
    return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8;
  }

  function hasWebpSignature(bytes) {
    return bytes.length > 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP";
  }

  function extractPngMetadata(bytes) {
    const entries = [];
    if (!hasPngSignature(bytes)) return entries;
    let offset = 8;
    while (offset + 12 <= bytes.length) {
      const length = readUint32BE(bytes, offset);
      const type = ascii(bytes, offset + 4, 4);
      const dataStart = offset + 8;
      const dataEnd = dataStart + length;
      if (dataEnd > bytes.length) break;
      const data = bytes.slice(dataStart, dataEnd);
      if (type === "tEXt") {
        const nul = data.indexOf(0);
        const key = nul >= 0 ? latin1(data.slice(0, nul)) : "tEXt";
        const value = nul >= 0 ? latin1(data.slice(nul + 1)) : latin1(data);
        entries.push({ source: key || "PNG tEXt", text: value });
      } else if (type === "iTXt") {
        const parsed = parsePngItxt(data);
        if (parsed.text) entries.push(parsed);
      } else if (type === "zTXt") {
        const nul = data.indexOf(0);
        const key = nul >= 0 ? latin1(data.slice(0, nul)) : "zTXt";
        entries.push({ source: key || "PNG zTXt", text: scanBufferForPromptText(data) });
      }
      offset = dataEnd + 4;
      if (type === "IEND") break;
    }
    return entries;
  }

  function parsePngItxt(data) {
    let cursor = 0;
    const readNullText = () => {
      const end = data.indexOf(0, cursor);
      const stop = end >= 0 ? end : data.length;
      const value = utf8(data.slice(cursor, stop));
      cursor = Math.min(stop + 1, data.length);
      return value;
    };
    const key = readNullText() || "PNG iTXt";
    cursor += 2;
    readNullText();
    readNullText();
    return { source: key, text: utf8(data.slice(cursor)) };
  }

  function extractJpegMetadata(bytes) {
    const entries = [];
    if (!hasJpegSignature(bytes)) return entries;
    let offset = 2;
    while (offset + 4 < bytes.length) {
      if (bytes[offset] !== 0xff) break;
      const marker = bytes[offset + 1];
      offset += 2;
      if (marker === 0xda || marker === 0xd9) break;
      const length = readUint16BE(bytes, offset);
      const start = offset + 2;
      const end = start + length - 2;
      if (length < 2 || end > bytes.length) break;
      const segment = bytes.slice(start, end);
      if (marker === 0xe1 && ascii(segment, 0, 6) === "Exif\0\0") {
        extractExifTiff(segment.slice(6)).forEach((entry) => entries.push(entry));
      } else if (marker === 0xe1 && ascii(segment, 0, 29).includes("http://ns.adobe.com/xap")) {
        entries.push({ source: "XMP", text: utf8(segment) });
      } else if (marker === 0xfe) {
        entries.push({ source: "JPEG Comment", text: utf8(segment) || latin1(segment) });
      }
      offset = end;
    }
    return entries;
  }

  function extractExifTiff(tiff) {
    const entries = [];
    if (tiff.length < 8) return entries;
    const little = ascii(tiff, 0, 2) === "II";
    const read16 = (offset) => little ? readUint16LE(tiff, offset) : readUint16BE(tiff, offset);
    const read32 = (offset) => little ? readUint32LE(tiff, offset) : readUint32BE(tiff, offset);
    const firstIfd = read32(4);
    const visited = new Set();
    const tagNames = {
      0x010e: "ImageDescription",
      0x010f: "Make",
      0x0110: "Model",
      0x0131: "Software",
      0x9286: "UserComment",
      0x9c9c: "XPComment",
      0x9c9b: "XPTitle",
      0x9c9e: "XPSubject",
    };
    const parseIfd = (offset) => {
      if (!offset || visited.has(offset) || offset + 2 > tiff.length) return;
      visited.add(offset);
      const count = read16(offset);
      for (let i = 0; i < count; i++) {
        const entryOffset = offset + 2 + i * 12;
        if (entryOffset + 12 > tiff.length) break;
        const tag = read16(entryOffset);
        const type = read16(entryOffset + 2);
        const countValue = read32(entryOffset + 4);
        const valueOffset = read32(entryOffset + 8);
        if (tag === 0x8769 || tag === 0x8825) {
          parseIfd(valueOffset);
          continue;
        }
        if (!tagNames[tag]) continue;
        const value = readExifValue(tiff, entryOffset + 8, type, countValue, valueOffset, little);
        entries.push({ source: tagNames[tag], text: value });
      }
      const next = offset + 2 + count * 12;
      if (next + 4 <= tiff.length) parseIfd(read32(next));
    };
    parseIfd(firstIfd);
    return entries;
  }

  function readExifValue(tiff, inlineOffset, type, countValue, valueOffset, little) {
    const typeSize = { 1: 1, 2: 1, 3: 2, 4: 4, 7: 1 }[type] || 1;
    const byteLength = Math.max(0, countValue * typeSize);
    const start = byteLength <= 4 ? inlineOffset : valueOffset;
    if (start < 0 || start + byteLength > tiff.length) return "";
    const data = tiff.slice(start, start + byteLength);
    if (type === 2) return latin1(data).replace(/\0+$/g, "");
    if (type === 7) return decodeExifUndefined(data);
    if (type === 1 && byteLength > 4) return utf8(data) || latin1(data);
    if (type === 3 && byteLength > 4) return decodeUtf16(data, little);
    return utf8(data) || latin1(data);
  }

  function decodeExifUndefined(data) {
    const prefix = ascii(data, 0, 8);
    const body = data.slice(8);
    if (prefix.startsWith("UNICODE")) return decodeUtf16(body, false);
    if (prefix.startsWith("ASCII")) return latin1(body).replace(/\0+$/g, "");
    return utf8(data) || latin1(data);
  }

  function extractWebpMetadata(bytes) {
    const entries = [];
    if (!hasWebpSignature(bytes)) return entries;
    let offset = 12;
    while (offset + 8 <= bytes.length) {
      const type = ascii(bytes, offset, 4);
      const size = readUint32LE(bytes, offset + 4);
      const start = offset + 8;
      const end = start + size;
      if (end > bytes.length) break;
      const data = bytes.slice(start, end);
      if (type === "EXIF") extractExifTiff(stripExifHeader(data)).forEach((entry) => entries.push(entry));
      if (type === "XMP ") entries.push({ source: "WebP XMP", text: utf8(data) });
      offset = end + (size % 2);
    }
    return entries;
  }

  function stripExifHeader(data) {
    return ascii(data, 0, 6) === "Exif\0\0" ? data.slice(6) : data;
  }

  function parseExifPromptMetadata(entries) {
    const comfyResolved = window.PromptArchiveExifPromptResolver.resolveComfyPrompt(entries);
    if (comfyResolved?.text) {
      const sectionTexts = window.PromptArchiveExifPromptResolver.splitResolvedPromptSections(
        comfyResolved.text,
        knownWildcardScenarioSections(),
      );
      const promptJson = sectionTexts ? promptJsonFromSectionTexts(sectionTexts) : null;
      if (promptJson) {
        return {
          promptJson,
          rawText: comfyResolved.text,
          source: comfyResolved.source,
          titleSummary: titleFromPromptJson(promptJson),
        };
      }
    }
    if (window.PromptArchiveExifPromptResolver.containsComfyPromptGraph(entries)) return null;
    const candidates = [];
    for (const entry of entries) {
      collectPromptCandidates(entry.text, entry.source).forEach((candidate) => candidates.push(candidate));
    }
    candidates.sort((a, b) => promptCandidateScore(b) - promptCandidateScore(a));
    for (const candidate of candidates) {
      const promptJson = promptJsonFromMetadataText(candidate.text);
      if (promptJson) {
        return {
          promptJson,
          rawText: candidate.text,
          source: candidate.source,
          titleSummary: titleFromPromptJson(promptJson),
        };
      }
    }
    return null;
  }

  function knownWildcardScenarioSections() {
    return state.items.map((item) => {
      const sections = {};
      for (const key of ["outfit", "background", "expression_pose", "details"]) {
        sections[key] = cleanPromptParagraph((item.promptJson?.[key]?.sentences || [])
          .map((sentence) => sentence.en || "")
          .filter(Boolean)
          .join(" "));
      }
      return {
        ...sections,
        scenario: cleanPromptParagraph([sections.outfit, sections.background, sections.expression_pose, sections.details].join(" ")),
      };
    }).filter((entry) => entry.outfit && entry.background && entry.expression_pose && entry.details);
  }

  function collectPromptCandidates(text, source = "metadata") {
    const cleaned = cleanMetadataText(text);
    if (!cleaned) return [];
    const candidates = [{ source, text: cleaned }];
    const json = tryParseJson(cleaned);
    if (json) {
      extractStringsFromJson(json).forEach((value, index) => candidates.push({ source: `${source}:json-${index + 1}`, text: value }));
    }
    const parameters = extractA1111PositivePrompt(cleaned);
    if (parameters && parameters !== cleaned) candidates.push({ source: `${source}:parameters`, text: parameters });
    return candidates;
  }

  function extractStringsFromJson(value, depth = 0) {
    if (depth > 5 || value == null) return [];
    if (typeof value === "string") return [value];
    const out = [];
    if (typeof value === "object") {
      const priorityKeys = ["promptSections", "promptJson", "finalPrompt", "prompt", "parameters", "description", "Comment", "UserComment"];
      priorityKeys.forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(value, key)) out.push(...extractStringsFromJson(value[key], depth + 1));
      });
      Object.keys(value).forEach((key) => {
        if (!priorityKeys.includes(key)) out.push(...extractStringsFromJson(value[key], depth + 1));
      });
    }
    return out.map(cleanMetadataText).filter((text) => text.length > 20);
  }

  function promptCandidateScore(candidate) {
    const text = candidate.text.toLowerCase();
    let score = Math.min(candidate.text.length, 4000) / 1000;
    if (/raw-scan/i.test(candidate.source || "")) score -= 6;
    else score += 1;
    if (/appearance|outfit|background|details|외모|복장|배경|디테일/.test(text)) score += 8;
    if ((candidate.text.match(/\n\s*\n/g) || []).length >= 4) score += 7;
    if (/negative prompt|steps:|sampler:|cfg scale:/i.test(candidate.text)) score += 2;
    if (/workflow|class_type|last_node_id/i.test(candidate.text)) score -= 4;
    return score;
  }

  function promptJsonFromMetadataText(text) {
    const cleaned = cleanMetadataText(text);
    const json = tryParseJson(cleaned);
    if (json) {
      if (json.promptSections || json.promptJson) return normalizeAnalysisPrompt(json.promptSections || json.promptJson);
      if (json.prompt && typeof json.prompt === "object") return normalizeAnalysisPrompt(json.prompt);
      const strings = extractStringsFromJson(json).sort((a, b) => b.length - a.length);
      for (const value of strings) {
        const parsed = promptJsonFromMetadataText(value);
        if (parsed) return parsed;
      }
    }
    return promptJsonFromPlainText(cleaned);
  }

  function promptJsonFromPlainText(text) {
    const withoutNegative = extractA1111PositivePrompt(text) || text;
    const labeled = splitLabeledSections(withoutNegative);
    if (labeled) return promptJsonFromSectionTexts(labeled);
    const paragraphs = withoutNegative
      .split(/\n\s*\n+/)
      .map((part) => cleanPromptParagraph(part))
      .filter(Boolean);
    if (paragraphs.length >= 5) return promptJsonFromSectionTexts(Object.fromEntries(sectionMeta.map((section, index) => [section.key, paragraphs[index]])));
    return null;
  }

  function splitLabeledSections(text) {
    const labels = [
      ["appearance", "Appearance", "외모"],
      ["outfit", "Outfit", "복장"],
      ["background", "Background", "배경"],
      ["expression_pose", "Expression / Pose", "Expression/Pose", "Expression Pose", "표정/자세", "표정", "자세"],
      ["details", "Details", "Detail", "디테일", "품질"],
    ];
    const matches = [];
    labels.forEach(([key, ...names]) => {
      names.forEach((name) => {
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const re = new RegExp(`(^|\\n)\\s*(?:#{1,6}\\s*)?${escaped}\\s*[:：-]?\\s*`, "ig");
        let match;
        while ((match = re.exec(text))) matches.push({ key, index: match.index, end: re.lastIndex });
      });
    });
    matches.sort((a, b) => a.index - b.index);
    const unique = [];
    matches.forEach((match) => {
      if (!unique.some((item) => item.key === match.key)) unique.push(match);
    });
    if (unique.length < 5) return null;
    const ordered = sectionMeta.map((section) => unique.find((match) => match.key === section.key)).filter(Boolean);
    if (ordered.length < 5) return null;
    const out = {};
    ordered.forEach((match, index) => {
      const next = ordered[index + 1];
      out[match.key] = cleanPromptParagraph(text.slice(match.end, next ? next.index : text.length));
    });
    return sectionMeta.every((section) => out[section.key]) ? out : null;
  }

  function promptJsonFromSectionTexts(sectionTexts) {
    const prompt = {};
    sectionMeta.forEach((section) => {
      const text = cleanPromptParagraph(sectionTexts[section.key] || "");
      prompt[section.key] = {
        title_ko: section.labelKo,
        sentences: splitPromptSentences(text).map((sentence, index) => ({
          id: `${section.key}-${index + 1}`,
          en: sentence,
          ko: "",
        })),
      };
    });
    if (sectionMeta.some((section) => !prompt[section.key].sentences.length)) return null;
    return prompt;
  }

  function splitPromptSentences(text) {
    const cleaned = cleanPromptParagraph(text);
    if (!cleaned) return [];
    const byLine = cleaned.split(/\n+/).map(cleanPromptParagraph).filter(Boolean);
    if (byLine.length > 1) return byLine;
    return [cleaned];
  }

  function cleanPromptParagraph(value) {
    return String(value || "")
      .replace(/^[-*\d.)\s]+(?=\S)/, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function extractA1111PositivePrompt(text) {
    const value = cleanMetadataText(text);
    if (!value) return "";
    const negativeIndex = value.search(/\bNegative prompt\s*:/i);
    const stepsIndex = value.search(/\bSteps\s*:/i);
    const cut = [negativeIndex, stepsIndex].filter((index) => index > 0).sort((a, b) => a - b)[0];
    return cut ? value.slice(0, cut).trim() : value;
  }

  function titleFromPromptJson(promptJson) {
    // Titles come from /api/title-summary (keyword style: hair · outfit · accessory · background).
    // Keep empty so EXIF import does not chop English prompt words into a fake title.
    void promptJson;
    return "";
  }

  async function translateItemPromptSections(item, options = {}) {
    let translatedAny = false;
    for (const sectionConfig of enabledSections()) {
      const section = item.promptJson?.[sectionConfig.key];
      if (!section?.sentences?.length) continue;
      const sentences = section.sentences
        .filter((sentence) => String(sentence.en || "").trim() && !String(sentence.ko || "").trim())
        .map((sentence) => ({ id: sentence.id, en: String(sentence.en || "").trim() }));
      if (!sentences.length) continue;
      const response = await fetch(SERVER_TRANSLATE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: item.id,
          sectionKey: sectionConfig.key,
          sectionLabel: sectionConfig.labelKo || sectionConfig.key,
          sentences,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.message || payload.error || "번역 요청에 실패했습니다.");
      const byId = new Map((payload.translations || []).map((entry) => [entry.id, entry.ko]));
      section.sentences.forEach((sentence) => {
        const translated = byId.get(sentence.id);
        if (translated) {
          sentence.ko = translated;
          translatedAny = true;
        }
      });
    }
    if (translatedAny) {
      item.finalPrompt = promptText(item, "final");
      item.updatedAt = Date.now();
    }
    if (!translatedAny && !options.silent) showToast("번역할 빈 한국어 문장이 없습니다.", "info", 1400);
    return translatedAny;
  }

  function tryParseJson(text) {
    const cleaned = cleanMetadataText(text);
    if (!cleaned) return null;
    try {
      return JSON.parse(cleaned);
    } catch (error) {
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      if (start >= 0 && end > start) {
        try {
          return JSON.parse(cleaned.slice(start, end + 1));
        } catch (_error) {}
      }
    }
    return null;
  }

  function cleanMetadataText(value) {
    return String(value || "")
      .replace(/^\uFEFF/, "")
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]+/g, " ")
      .replace(/\r\n/g, "\n")
      .trim();
  }

  function scanBufferForPromptText(bytes) {
    const limit = Math.min(bytes.length, 3 * 1024 * 1024);
    const text = utf8(bytes.slice(0, limit)) || latin1(bytes.slice(0, limit));
    const patterns = [
      /(?:promptSections|promptJson|finalPrompt|parameters|prompt|Description|UserComment)[\s\S]{0,20000}/i,
      /Appearance[\s\S]{0,20000}Outfit[\s\S]{0,20000}Background[\s\S]{0,20000}Details[\s\S]{0,20000}/i,
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return match[0];
    }
    return "";
  }

  function ascii(bytes, offset, length) {
    return latin1(bytes.slice(offset, offset + length));
  }

  function utf8(bytes) {
    try {
      return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    } catch (error) {
      return "";
    }
  }

  function latin1(bytes) {
    try {
      return new TextDecoder("latin1").decode(bytes);
    } catch (error) {
      return String.fromCharCode(...bytes);
    }
  }

  function decodeUtf16(bytes, little = true) {
    try {
      return new TextDecoder(little ? "utf-16le" : "utf-16be").decode(bytes).replace(/\0+$/g, "");
    } catch (error) {
      return "";
    }
  }

  function readUint16BE(bytes, offset) {
    return (bytes[offset] << 8) | bytes[offset + 1];
  }

  function readUint16LE(bytes, offset) {
    return bytes[offset] | (bytes[offset + 1] << 8);
  }

  function readUint32BE(bytes, offset) {
    return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
  }

  function readUint32LE(bytes, offset) {
    return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
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
    const instruction = state.promptInstruction.includes("Section boundary rules:")
      ? state.promptInstruction
      : `${state.promptInstruction.trim()}\n\n${sectionBoundaryRules}`;
    return [
      instruction,
      "",
      "Additional user instruction for this image:",
      item.customInstruction || "(none)",
      "",
      "Elements to exclude from the generated prompt:",
      excluded.length ? excluded.map((label) => `- ${label}`).join("\n") : "(none)",
      "",
      "Focus rules for this app:",
      "- Generate high-density promptSections only (appearance, outfit, background, expression_pose, details).",
      "- Tags and album titles are handled outside this vision call. Do not spend tokens on tag lists or titleSummary.",
      "- Even if excluded elements appear in the image, do not describe them in the final prompt unless the user specifically asks to include them.",
    ].join("\n");
  }

  function openItem(id) {
    ui.previousView = ui.view;
    if (isVideoArchiveMode()) ui.videoSelectedId = id;
    else ui.selectedId = id;
    ui.view = "detail";
    ui.editMode = false;
    render();
  }

  function setArchiveMode(mode) {
    const next = mode === "video" ? "video" : "image";
    ui.archiveMode = next;
    persistArchiveMode(next);
    ui.view = "gallery";
    ui.modal = null;
    ui.editMode = false;
    ui.bulkDeleteMode = false;
    ui.selectedBulkDeleteIds = [];
    ui.bulkCategoryMode = false;
    ui.selectedBulkCategoryIds = [];
    ui.query = "";
    resetGalleryWindow();
    render();
  }

  function videoItemSearchBlob(item) {
    const sections = videoSectionMeta.flatMap((section) => (item.promptJson?.[section.key]?.sentences || []).flatMap((sentence) => [sentence.en, sentence.ko]));
    return normalizeSearchText([item.title, item.memo, item.uploadMeta?.fileName, ...sections].filter(Boolean).join(" "));
  }

  function currentFilteredArchiveItems() {
    return isVideoArchiveMode() ? getFilteredVideoItems() : getFilteredItems();
  }

  function getFilteredVideoItems() {
    const query = normalizeSearchText(ui.query);
    let items = [...(state.videoItems || [])];
    if (ui.videoCategory && ui.videoCategory !== "all") {
      items = items.filter((item) => item.categoryId === ui.videoCategory);
    }
    if (query) items = items.filter((item) => videoItemSearchBlob(item).includes(query));
    if (ui.sort === "oldest") items.sort((left, right) => left.createdAt - right.createdAt);
    else items.sort((left, right) => right.createdAt - left.createdAt);
    return items;
  }

  function renderVideoGallery() {
    const items = getFilteredVideoItems();
    const perPage = state.albumSettings.columns * state.albumSettings.rows;
    const pageMode = state.albumSettings.loadMode === "pages";
    const pageCount = Math.max(1, Math.ceil(items.length / perPage));
    ui.page = Math.max(1, Math.min(pageCount, ui.page || 1));
    ui.galleryLoadedPages = Math.max(1, ui.galleryLoadedPages || 1);
    const visibleCount = ui.galleryLoadedPages * perPage;
    const pageItems = pageMode
      ? items.slice((ui.page - 1) * perPage, ui.page * perPage)
      : items.slice(0, visibleCount);
    const hasMore = !pageMode && visibleCount < items.length;
    const paginationTop = pageMode && ["top", "both"].includes(state.albumSettings.paginationPosition) ? renderPagination(pageCount) : "";
    const paginationBottom = pageMode && ["bottom", "both"].includes(state.albumSettings.paginationPosition) ? renderPagination(pageCount) : "";
    return `
      <div class="notice video-mode-notice">비디오 모드는 이미지 아카이브와 목록·설정·카테고리가 분리되어 있습니다. 변환과 사진 분류는 사용할 수 없습니다.</div>
      <div class="album-filter-bar surface-card">
        <div class="gallery-control-primary">
          <div class="gallery-result-summary" aria-live="polite">
            <strong>${items.length}개</strong>
            <span>비디오 ${state.videoItems.length}개</span>
          </div>
          <div class="gallery-control-actions">
            <label class="compact-field"><span>정렬</span><select class="select compact-select" id="sortSelect">
              <option value="latest" ${ui.sort === "latest" ? "selected" : ""}>최신순</option>
              <option value="oldest" ${ui.sort === "oldest" ? "selected" : ""}>오래된순</option>
            </select></label>
          </div>
        </div>
        <div class="album-filter-summary">
          <div class="filter-section">
            <span class="filter-section-label">카테고리</span>
            <div class="category-tabs segmented-tabs">
              <button class="chip-btn ${ui.videoCategory === "all" ? "active" : ""}" data-action="setVideoCategoryFilter" data-category="all" type="button">전체</button>
              ${state.videoCategories.map((category) => `
                <button class="chip-btn ${ui.videoCategory === category.id ? "active" : ""}" data-action="setVideoCategoryFilter" data-category="${escapeHtml(category.id)}" type="button">${escapeHtml(category.name)}</button>
              `).join("")}
            </div>
          </div>
        </div>
      </div>
      ${paginationTop}
      <div class="album-action-row ${ui.bulkDeleteMode ? "delete-mode" : ""}">
        ${ui.bulkDeleteMode ? renderBulkDeleteControls(pageItems) : ""}
        <div class="album-action-buttons">
          <button class="ghost-btn ${ui.bulkDeleteMode ? "active-danger" : ""}" data-action="toggleBulkDeleteMode" type="button" aria-pressed="${ui.bulkDeleteMode}">${ui.bulkDeleteMode ? "삭제 선택 닫기" : "일괄 삭제"}</button>
        </div>
      </div>
      ${pageItems.length ? `<div class="gallery-grid album-grid ${ui.bulkDeleteMode ? "bulk-delete-gallery" : ""}" style="--album-columns: ${state.albumSettings.columns}; --album-ratio: ${cardRatioValue()};">${pageItems.map((item) => renderVideoCard(item)).join("")}</div>` : renderEmptyVideoGallery()}
      ${pageMode ? paginationBottom : renderGalleryLoadMore(hasMore, pageItems.length, items.length)}
    `;
  }

  function renderEmptyVideoGallery() {
    return `
      <div class="empty-state">
        <div>
          <h2>저장된 비디오 프롬프트가 없습니다.</h2>
          <p>WebM 또는 MP4를 올리면 ComfyUI 메타데이터에서 6개 문단을 읽어 저장합니다.</p>
          <button class="primary-btn" data-action="upload" type="button">비디오 업로드</button>
        </div>
      </div>
    `;
  }

  function renderVideoCard(item) {
    const title = videoDisplayTitle(item);
    const itemId = escapeHtml(normalizeReferenceIdentifier(item.id));
    const imageSource = escapeHtml(safeImageSource(item.thumbnailUrl || item.imageUrl));
    const selectedForDelete = (ui.selectedBulkDeleteIds || []).includes(item.id);
    return `
      <article class="panel image-card ${ui.bulkDeleteMode ? "bulk-delete-mode" : ""} ${selectedForDelete ? "selected-for-delete" : ""}" data-open-item="${itemId}" tabindex="0" role="button" aria-label="${escapeHtml(`${title} 열기`)}">
        <div class="thumb">
          <img src="${imageSource}" alt="${escapeHtml(title)}" loading="lazy">
          ${ui.bulkDeleteMode ? `
            <label class="bulk-delete-check" aria-label="삭제할 게시물 선택">
              <input class="bulk-delete-checkbox" data-action="bulkToggleItem" data-bulk-delete-id="${itemId}" type="checkbox" ${selectedForDelete ? "checked" : ""}>
              <span>삭제 선택</span>
            </label>
          ` : ""}
        </div>
        <div class="card-body">
          <h3 class="card-title video-card-title"><span class="video-card-title-text">${escapeHtml(title)}</span>${videoTitleMetaHtml(item)}</h3>
          <div class="card-meta">
            <span class="card-chip">${escapeHtml(videoCategoryName(item.categoryId))}</span>
          </div>
        </div>
      </article>
    `;
  }

  function videoDisplayTitle(item) {
    const title = String(item?.title || "").trim();
    return title || "제목 없음";
  }

  function videoDurationSeconds(item) {
    return Number(item?.durationSeconds || item?.uploadMeta?.duration || 0) || 0;
  }

  function videoDurationLabel(item) {
    const format = videoPromptApi.formatVideoDurationLabel;
    const seconds = videoDurationSeconds(item);
    return typeof format === "function" ? format(seconds) : (seconds ? `${Math.round(seconds)}s` : "");
  }

  function videoAspectSize(item) {
    return {
      width: Number(item?.width || item?.uploadMeta?.width || item?.displayImage?.width || item?.thumbnailImage?.width || 0) || 0,
      height: Number(item?.height || item?.uploadMeta?.height || item?.displayImage?.height || item?.thumbnailImage?.height || 0) || 0,
    };
  }

  function videoAspectRatioLabel(item) {
    const format = videoPromptApi.formatVideoAspectRatioLabel;
    const size = videoAspectSize(item);
    if (typeof format === "function") return format(size.width, size.height);
    if (!size.width || !size.height) return "";
    return `${size.width}:${size.height}`;
  }

  function videoTitleMetaHtml(item) {
    const badges = [];
    const duration = videoDurationLabel(item);
    const ratio = videoAspectRatioLabel(item);
    if (duration) badges.push(`<span class="video-meta-badge is-duration">${escapeHtml(duration)}</span>`);
    if (ratio) badges.push(`<span class="video-meta-badge is-ratio">${escapeHtml(ratio)}</span>`);
    return badges.length ? `<span class="video-title-meta">${badges.join("")}</span>` : "";
  }

  function renderVideoDetail() {
    const item = findVideoItem(ui.videoSelectedId);
    if (!item) {
      ui.view = "gallery";
      return renderVideoGallery();
    }
    const title = videoDisplayTitle(item);
    const itemId = escapeHtml(normalizeReferenceIdentifier(item.id));
    const imageSource = escapeHtml(safeImageSource(item.imageUrl || item.thumbnailUrl));
    return `
      <div class="page-head">
        <div>
          <h2 class="page-title video-page-title"><span class="video-page-title-text">${escapeHtml(title)}</span>${videoTitleMetaHtml(item)}</h2>
          <p class="page-copy">${escapeHtml(item.memo || "")}</p>
        </div>
        <div class="toolbar detail-primary-actions">
          <button class="ghost-btn" data-view="gallery" type="button">갤러리</button>
        </div>
      </div>
      <div class="detail-grid">
        <section class="panel detail-media">
          <img src="${imageSource}" alt="${escapeHtml(title)}">
          <div class="detail-meta">
            <div class="field">
              <label for="videoDetailTitle">제목</label>
              <input class="input" id="videoDetailTitle" value="${escapeHtml(item.title || "")}" placeholder="직접 입력">
            </div>
            <div class="field">
              <label for="videoDetailCategory">카테고리</label>
              <select class="select" id="videoDetailCategory">
                ${state.videoCategories.map((category) => `<option value="${escapeHtml(category.id)}" ${item.categoryId === category.id ? "selected" : ""}>${escapeHtml(category.name)}</option>`).join("")}
              </select>
            </div>
            <div class="field">
              <label for="videoDetailMemo">메모</label>
              <textarea class="textarea" id="videoDetailMemo">${escapeHtml(item.memo || "")}</textarea>
            </div>
            ${item.uploadMeta ? `
              <div class="asset-summary">
                <span>${escapeHtml(item.uploadMeta.fileName || "비디오")}</span>
                ${item.uploadMeta.duration ? `<span>${Number(item.uploadMeta.duration).toFixed(1)}초</span>` : ""}
                ${videoAspectRatioLabel(item) ? `<span>${escapeHtml(videoAspectRatioLabel(item))}</span>` : ""}
                ${item.uploadMeta.originalSize ? `<span>${formatBytes(item.uploadMeta.originalSize)}</span>` : ""}
              </div>
            ` : ""}
            ${item.errorMessage ? `<p class="notice">${escapeHtml(item.errorMessage)}</p>` : ""}
            <div class="toolbar detail-action-group">
              <button class="primary-btn" data-action="saveVideoDetail" data-id="${itemId}" type="button">저장</button>
              <button class="danger-btn" data-action="deleteVideoItem" data-id="${itemId}" type="button">삭제</button>
            </div>
          </div>
        </section>
        <section class="panel prompt-panel">
          ${renderVideoPromptTools(item)}
          ${item.promptJson ? renderVideoPromptColumns(item) : `
            <div class="empty-state">
              <div>
                <h2>비디오 프롬프트가 없습니다.</h2>
                <p>업로드한 파일에서 subject_definitions 등 6개 문단을 찾지 못했습니다.</p>
              </div>
            </div>
          `}
        </section>
      </div>
    `;
  }

  function renderVideoPromptTools(item) {
    const itemId = escapeHtml(normalizeReferenceIdentifier(item.id));
    return `
      <div class="prompt-actions prompt-actions-sticky">
        <div class="toolbar" style="margin: 0;">
          <button class="primary-btn" data-action="copyVideoPrompt" data-mode="final" data-id="${itemId}" type="button">전체 복사</button>
          <button class="ghost-btn" data-action="copyVideoPrompt" data-mode="ko" data-id="${itemId}" type="button">번역 복사</button>
          <button class="ghost-btn" data-action="copyVideoPrompt" data-mode="both" data-id="${itemId}" type="button">영+한 복사</button>
        </div>
        <div class="toolbar" style="margin: 0;">
          <button class="ghost-btn" data-action="toggleEdit" type="button">${ui.editMode ? "보기 모드" : "수정 모드"}</button>
        </div>
      </div>
    `;
  }

  function renderVideoPromptColumns(item) {
    const mode = state.videoSettings.promptViewMode;
    const enColumn = `
      <div class="prompt-column">
        <div class="prompt-column-head">English prompt</div>
        ${videoSectionMeta.map((section) => renderVideoPromptSection(item, section, "en")).join("")}
      </div>
    `;
    const koColumn = `
      <div class="prompt-column">
        <div class="prompt-column-head">한국어 번역</div>
        ${videoSectionMeta.map((section) => renderVideoPromptSection(item, section, "ko")).join("")}
      </div>
    `;
    return `<div class="prompt-columns ${mode !== "split" ? "single-column" : ""}">${mode === "ko" ? koColumn : mode === "en" ? enColumn : enColumn + koColumn}</div>`;
  }

  function renderVideoPromptSection(item, sectionConfig, lang) {
    const section = item.promptJson?.[sectionConfig.key] || { sentences: [] };
    const sentences = section.sentences?.length
      ? section.sentences
      : [{ id: `${sectionConfig.key}-1`, en: "", ko: "" }];
    const label = lang === "ko" ? sectionConfig.labelKo : sectionConfig.labelEn;
    const itemId = escapeHtml(normalizeReferenceIdentifier(item.id));
    const sectionKey = escapeHtml(normalizeReferenceIdentifier(sectionConfig.key));
    return `
      <section class="prompt-section" data-section="${sectionKey}">
        <div class="section-label-row">
          <h3 class="section-label">${escapeHtml(label)}</h3>
          <button class="tiny-btn section-copy-btn" data-action="copyVideoSection" data-id="${itemId}" data-section="${sectionKey}" data-lang="${lang}" type="button" aria-label="${escapeHtml(label)} 문단 복사" data-tooltip="문단 복사">⧉</button>
        </div>
        ${sentences.map((sentence) => `
          <p class="sentence video-sentence ${ui.selectedSentenceId === sentence.id ? "active" : ""} ${String(sentence[lang] || "").trim() ? "" : "is-empty"}"
             data-sentence-id="${escapeHtml(normalizeReferenceIdentifier(sentence.id))}"
             data-lang="${lang}"
             contenteditable="${ui.editMode ? "true" : "false"}"
             spellcheck="false">${renderVideoSentenceContent(sentence, lang)}</p>
        `).join("")}
        <div class="toolbar" style="margin-top: var(--space-2); margin-bottom: 0;">
          ${lang === "ko" ? `<button class="tiny-btn" data-action="retranslateVideoSection" data-section="${sectionKey}" data-id="${itemId}" type="button">${escapeHtml(label)} 재번역</button>` : ""}
        </div>
      </section>
    `;
  }

  function renderVideoSentenceContent(sentence, lang) {
    return escapeHtml(String(sentence?.[lang] || ""));
  }

  function renderVideoUpload() {
    return `
      <div class="page-head">
        <div>
          <h2 class="page-title">비디오 업로드</h2>
          <p class="page-copy">파일을 고르면 먼저 6개 구간 썸네일을 뽑습니다. 위에서 하나를 고른 뒤 제목과 카테고리를 입력하세요.</p>
        </div>
      </div>
      <section class="panel" style="padding: var(--space-4);">
        <p class="notice upload-mode-notice">썸네일은 영상 길이를 6등분해 추출합니다. 제목과 카테고리는 직접 입력합니다.</p>
        ${renderVideoThumbnailPicker()}
        <div class="upload-zone" id="videoDropZone">
          <div>
            <h2>비디오를 놓거나 선택하세요</h2>
            <p>webm, mp4</p>
            <input class="sr-only" id="videoFileInput" type="file" accept="video/webm,video/mp4,video/quicktime,.webm,.mp4,.mov" multiple>
            <button class="primary-btn" id="pickVideoFiles" type="button">파일 선택</button>
          </div>
        </div>
        ${renderPendingVideoFiles()}
        <div class="form-grid" style="margin-top: var(--space-4);">
          <div class="field">
            <label for="videoUploadTitle">제목</label>
            <input class="input" id="videoUploadTitle" value="${escapeHtml(ui.videoUploadDraft.title)}" placeholder="직접 입력">
          </div>
          <div class="field">
            <label for="videoUploadCategory">카테고리</label>
            <select class="select" id="videoUploadCategory">
              ${state.videoCategories.map((category) => `<option value="${escapeHtml(category.id)}" ${ui.videoUploadDraft.categoryId === category.id ? "selected" : ""}>${escapeHtml(category.name)}</option>`).join("")}
            </select>
          </div>
        </div>
        <div class="upload-action-row">
          <div class="toolbar">
            <button class="ghost-btn" data-action="removeSelectedPendingVideoUploads" type="button" ${ui.selectedPendingVideoKeys.length && !ui.videoUploadProgress ? "" : "disabled"}>선택 지우기</button>
            <button class="ghost-btn" data-action="clearVideoUploadWorkspace" type="button" ${(ui.pendingVideoFiles.length || ui.videoUploadQueue.length) && !ui.videoUploadProgress ? "" : "disabled"}>비우기</button>
            <button class="primary-btn" data-action="saveAndReadVideoUploads" type="button" ${ui.pendingVideoFiles.length && !ui.videoUploadProgress && !videoThumbnailsBusy() ? "" : "disabled"}>${ui.videoUploadProgress ? "처리 중" : videoThumbnailsBusy() ? "썸네일 추출 중" : "프롬프트 읽고 저장"}</button>
          </div>
          ${ui.videoUploadProgress ? `<p class="field-help">${ui.videoUploadProgress.done} / ${ui.videoUploadProgress.total}</p>` : ""}
        </div>
        <div class="queue-list">${(ui.videoUploadQueue || []).map((entry) => `
          <article class="panel queue-item video-queue-item ${entry.error ? "has-error" : ""}">
            ${entry.url ? `<img src="${escapeHtml(safeImageSource(entry.url))}" alt="${escapeHtml(entry.name)}">` : `<div class="queue-fallback" aria-hidden="true">${navIcon("film")}</div>`}
            <div class="video-queue-copy">
              <strong>${escapeHtml(entry.name)}</strong>
              <div class="meta-line">
                <span>${escapeHtml(entry.status)}</span>
              </div>
              ${entry.error ? `<p class="queue-error">${escapeHtml(entry.error)}</p>` : ""}
            </div>
            ${entry.itemId ? `<button class="tiny-btn" data-action="openUploaded" data-id="${escapeHtml(normalizeReferenceIdentifier(entry.itemId))}" type="button">열기</button>` : ""}
          </article>
        `).join("")}</div>
      </section>
    `;
  }

  function renderPendingVideoFiles() {
    if (!ui.pendingVideoFiles.length) return "";
    return `
      <div class="pending-preview-grid" aria-label="선택한 비디오 파일">
        ${ui.pendingVideoFiles.map((file) => {
          const key = pendingUploadKey(file);
          const selected = ui.selectedPendingVideoKeys.includes(key);
          const error = ui.pendingVideoErrors?.[key] || "";
          return `
            <button class="pending-preview-card ${selected ? "selected" : ""} ${error ? "invalid" : ""}" data-action="togglePendingVideoUpload" data-upload-key="${escapeHtml(key)}" type="button" aria-pressed="${selected ? "true" : "false"}">
              <strong>${escapeHtml(file.name)}</strong>
              <span>${formatBytes(file.size)}</span>
              ${error ? `<em class="pending-error">${escapeHtml(error)}</em>` : ""}
            </button>
          `;
        }).join("")}
      </div>
    `;
  }

  function videoThumbnailsBusy() {
    return Object.values(ui.videoThumbnailSets || {}).some((entry) => entry?.loading);
  }

  function renderVideoThumbnailPicker() {
    if (!ui.pendingVideoFiles.length) return "";
    return `
      <div class="video-thumb-picker" aria-label="썸네일 선택">
        ${ui.pendingVideoFiles.map((file) => {
          const key = pendingUploadKey(file);
          const set = ui.videoThumbnailSets?.[key] || { loading: true, frames: [], selectedIndex: 0 };
          const selectedIndex = Number(set.selectedIndex || 0);
          return `
            <section class="video-thumb-file">
              <div class="video-thumb-file-head">
                <strong>${escapeHtml(file.name)}</strong>
                <span>${set.loading ? "구간 썸네일 추출 중…" : set.error ? escapeHtml(set.error) : `${set.frames.length}개 중 하나를 선택`}</span>
              </div>
              <div class="video-thumb-strip">
                ${set.loading ? `<div class="video-thumb-loading">영상을 6구간으로 나누는 중입니다.</div>` : (set.frames || []).map((frame, index) => `
                  <button class="video-thumb-choice ${index === selectedIndex ? "selected" : ""}" data-action="selectVideoThumbnail" data-upload-key="${escapeHtml(key)}" data-index="${index}" type="button" aria-pressed="${index === selectedIndex}">
                    <img src="${escapeHtml(frame.dataUrl)}" alt="${Number(frame.time || 0).toFixed(1)}초 미리보기">
                    <span>${Number(frame.time || 0).toFixed(1)}s</span>
                  </button>
                `).join("")}
              </div>
            </section>
          `;
        }).join("")}
      </div>
    `;
  }

  function captureVideoUploadDraft() {
    ui.videoUploadDraft.title = document.getElementById("videoUploadTitle")?.value || "";
    ui.videoUploadDraft.categoryId = document.getElementById("videoUploadCategory")?.value || state.videoCategories[0]?.id || "";
  }

  function addPendingVideoFiles(fileList) {
    const files = [...(fileList || [])].filter((file) => isVideoUploadFile(file));
    if (!files.length) {
      showToast("WebM 또는 MP4 비디오만 올릴 수 있습니다.", "warning");
      return;
    }
    const existing = new Set(ui.pendingVideoFiles.map(pendingUploadKey));
    files.forEach((file) => {
      const key = pendingUploadKey(file);
      if (!existing.has(key)) {
        ui.pendingVideoFiles.push(file);
        existing.add(key);
      }
    });
    ui.pendingVideoFiles = ui.pendingVideoFiles.slice(0, state.advancedSettings.maxImagesPerBatch);
    render();
    files.forEach((file) => {
      const key = pendingUploadKey(file);
      if (!ui.videoThumbnailSets[key] || ui.videoThumbnailSets[key].error) prepareVideoThumbnailChoices(file);
    });
  }

  function isVideoUploadFile(file) {
    const type = String(file?.type || "").toLowerCase();
    const name = String(file?.name || "").toLowerCase();
    return type.startsWith("video/") || /\.(webm|mp4|mov)$/i.test(name);
  }

  function togglePendingVideoUpload(key) {
    if (!key) return;
    if (ui.selectedPendingVideoKeys.includes(key)) {
      ui.selectedPendingVideoKeys = ui.selectedPendingVideoKeys.filter((entry) => entry !== key);
    } else {
      ui.selectedPendingVideoKeys = [...ui.selectedPendingVideoKeys, key];
    }
    render();
  }

  function removeSelectedPendingVideoUploads() {
    const selected = new Set(ui.selectedPendingVideoKeys);
    ui.pendingVideoFiles = ui.pendingVideoFiles.filter((file) => !selected.has(pendingUploadKey(file)));
    ui.pendingVideoErrors = Object.fromEntries(Object.entries(ui.pendingVideoErrors || {}).filter(([key]) => !selected.has(key)));
    ui.videoThumbnailSets = Object.fromEntries(Object.entries(ui.videoThumbnailSets || {}).filter(([key]) => !selected.has(key)));
    ui.selectedPendingVideoKeys = [];
    render();
  }

  function clearVideoUploadWorkspace() {
    ui.pendingVideoFiles = [];
    ui.selectedPendingVideoKeys = [];
    ui.pendingVideoErrors = {};
    ui.videoThumbnailSets = {};
    ui.videoUploadQueue = [];
    ui.videoUploadProgress = null;
    ui.videoUploadDraft = { title: "", categoryId: state.videoCategories[0]?.id || "" };
    render();
  }

  function selectVideoThumbnail(key, index) {
    const set = ui.videoThumbnailSets?.[key];
    if (!set || !Array.isArray(set.frames) || !set.frames[index]) return;
    set.selectedIndex = Number(index);
    render();
  }

  async function prepareVideoThumbnailChoices(file) {
    const key = pendingUploadKey(file);
    ui.videoThumbnailSets[key] = { loading: true, frames: [], selectedIndex: 0, duration: 0, width: 0, height: 0, error: "" };
    render();
    try {
      const payload = await fetchVideoThumbnailChoices(file);
      const frames = Array.isArray(payload.frames) ? payload.frames.filter((frame) => frame?.dataUrl) : [];
      if (!frames.length) throw new Error(payload.message || "구간 썸네일을 만들지 못했습니다.");
      ui.videoThumbnailSets[key] = {
        loading: false,
        frames,
        selectedIndex: 0,
        duration: Number(payload.duration || 0),
        width: Number(payload.width || 0),
        height: Number(payload.height || 0),
        error: "",
      };
    } catch (error) {
      try {
        const fallback = await captureVideoThumbnail(file);
        ui.videoThumbnailSets[key] = {
          loading: false,
          frames: isUsableVideoFrame(fallback) ? [{ ...fallback, time: 0, percent: 0, index: 0 }] : [],
          selectedIndex: 0,
          duration: Number(fallback?.duration || 0),
          width: Number(fallback?.width || 0),
          height: Number(fallback?.height || 0),
          error: error.message || "구간 추출 실패, 첫 프레임만 사용합니다.",
        };
      } catch (_fallbackError) {
        ui.videoThumbnailSets[key] = {
          loading: false,
          frames: [],
          selectedIndex: 0,
          duration: 0,
          width: 0,
          height: 0,
          error: error.message || "썸네일을 추출하지 못했습니다.",
        };
      }
    }
    render();
  }

  async function fetchVideoThumbnailChoices(file) {
    const response = await fetch(SERVER_VIDEO_THUMBNAIL_SET_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": file.type || "application/octet-stream",
        "X-File-Name": encodeURIComponent(file.name || "video.webm"),
        "X-Frame-Count": "6",
      },
      body: file,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
      throw new Error(payload.message || "서버에서 구간 썸네일을 추출하지 못했습니다.");
    }
    return payload;
  }

  function selectedVideoThumbnailFrame(file) {
    const set = ui.videoThumbnailSets?.[pendingUploadKey(file)];
    const frames = Array.isArray(set?.frames) ? set.frames : [];
    return frames[Number(set?.selectedIndex || 0)] || frames[0] || null;
  }

  async function processPendingVideoUploads() {
    if (!ui.pendingVideoFiles.length) {
      alert("먼저 업로드할 비디오를 선택하세요.");
      return;
    }
    if (videoThumbnailsBusy()) {
      alert("썸네일을 추출하는 중입니다. 잠시 후 다시 저장하세요.");
      return;
    }
    captureVideoUploadDraft();
    const title = ui.videoUploadDraft.title.trim();
    const categoryId = ui.videoUploadDraft.categoryId || state.videoCategories[0]?.id || "";
    if (!title) {
      alert("제목을 직접 입력하세요. 파일명으로 채우지 않습니다.");
      return;
    }
    if (!categoryId) {
      alert("카테고리를 선택하세요.");
      return;
    }
    const files = [...ui.pendingVideoFiles];
    const failedFiles = [];
    ui.videoUploadProgress = { done: 0, total: files.length };
    render();
    for (const [index, file] of files.entries()) {
      const queueEntry = { name: file.name, status: "메타데이터 읽는 중", error: "", url: "", itemId: "" };
      ui.videoUploadQueue.unshift(queueEntry);
      try {
        const prompt = await readVideoPromptFromFile(file);
        const promptJson = ensureVideoPromptJson(prompt?.promptJson);
        queueEntry.status = "썸네일 적용 중";
        let frame = selectedVideoThumbnailFrame(file);
        if (!isUsableVideoFrame(frame)) frame = await captureVideoThumbnail(file);
        if (frame && !(frame.width && frame.height)) {
          const measured = await measureDataUrlImage(frame.dataUrl);
          frame = { ...frame, width: measured.width || 640, height: measured.height || 360 };
        }
        const thumbSet = ui.videoThumbnailSets?.[pendingUploadKey(file)] || {};
        const fileDuration = Number(thumbSet.duration || frame?.duration || 0) || 0;
        const fileWidth = Number(thumbSet.width || frame?.width || 0) || 0;
        const fileHeight = Number(thumbSet.height || frame?.height || 0) || 0;
        const item = {
          id: uid("vid"),
          title,
          categoryId,
          memo: "",
          imageUrl: frame.dataUrl,
          thumbnailUrl: frame.dataUrl,
          displayImage: { dataUrl: frame.dataUrl, width: frame.width, height: frame.height, size: frame.size, type: frame.mime || "image/webp" },
          thumbnailImage: { dataUrl: frame.dataUrl, width: frame.width, height: frame.height, size: frame.size, type: frame.mime || "image/webp" },
          promptJson,
          durationSeconds: fileDuration,
          width: fileWidth,
          height: fileHeight,
          status: "analyzed",
          uploadMeta: {
            fileName: file.name,
            originalSize: file.size,
            duration: fileDuration,
            width: fileWidth,
            height: fileHeight,
            promptSource: prompt?.source || "metadata",
            exifRawText: prompt?.rawText || "",
          },
          errorMessage: "",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          versions: [],
        };
        if (state.videoSettings.translateOnUpload) {
          queueEntry.status = "번역 중";
          try {
            await translateVideoItemPromptSections(item, { silent: true });
          } catch (translationError) {
            item.status = "modified";
            item.errorMessage = `프롬프트는 저장됐지만 번역 실패: ${translationError.message || translationError}`;
            queueEntry.error = item.errorMessage;
          }
        }
        state.videoItems.unshift(item);
        ui.videoSelectedId = item.id;
        queueEntry.url = frame?.dataUrl || "";
        queueEntry.itemId = item.id;
        const saved = await saveVideoItemState(item);
        queueEntry.status = saved ? "저장 완료" : "브라우저 임시 저장";
      } catch (error) {
        failedFiles.push(file);
        ui.pendingVideoErrors[pendingUploadKey(file)] = error.message || String(error);
        queueEntry.status = "실패";
        queueEntry.error = error.message || String(error);
      }
      ui.videoUploadProgress = { done: index + 1, total: files.length };
      render();
    }
    ui.pendingVideoFiles = failedFiles;
    ui.selectedPendingVideoKeys = failedFiles.map(pendingUploadKey);
    ui.videoUploadProgress = null;
    if (!failedFiles.length) {
      ui.modal = null;
      ui.view = "gallery";
    }
    render();
    if (failedFiles.length) showToast(`${failedFiles.length}개 비디오에서 프롬프트를 읽지 못했습니다.`, "warning", 3600);
    else showToast("비디오 프롬프트를 저장했습니다.", "success", 1800);
  }

  async function readVideoPromptFromFile(file) {
    const buffer = await file.arrayBuffer();
    const resolve = videoPromptApi.resolveVideoPromptFromBytes;
    if (typeof resolve !== "function") throw new Error("비디오 프롬프트 해석기를 불러오지 못했습니다.");
    return resolve(buffer);
  }

  function isUsableVideoFrame(frame) {
    const dataUrl = String(frame?.dataUrl || "");
    if (!dataUrl.startsWith("data:image/")) return false;
    if (dataUrl.startsWith("data:image/svg")) return false;
    if (frame?.error) return false;
    if ((frame.size || 0) < 1500) return false;
    return true;
  }

  async function measureDataUrlImage(dataUrl) {
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth || 0, height: image.naturalHeight || 0 });
      image.onerror = () => resolve({ width: 0, height: 0 });
      image.src = dataUrl;
    });
  }

  async function captureVideoThumbnailOnServer(file) {
    const response = await fetch(SERVER_VIDEO_THUMBNAIL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": file.type || "application/octet-stream",
        "X-File-Name": encodeURIComponent(file.name || "video.webm"),
      },
      body: file,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok || !payload.dataUrl) {
      throw new Error(payload.message || "서버에서 첫 프레임을 추출하지 못했습니다.");
    }
    const size = payload.size || Math.round(String(payload.dataUrl).length * 0.75);
    const measured = await measureDataUrlImage(payload.dataUrl);
    return {
      dataUrl: payload.dataUrl,
      width: measured.width || 640,
      height: measured.height || 360,
      size,
      mime: payload.mime || "image/webp",
      duration: 0,
    };
  }

  async function captureVideoThumbnail(file) {
    try {
      const serverFrame = await captureVideoThumbnailOnServer(file);
      if (isUsableVideoFrame(serverFrame)) return serverFrame;
    } catch (_serverError) {
      // Fall back to the browser decoder when ffmpeg is unavailable.
    }
    const local = await captureVideoFirstFrame(file);
    if (isUsableVideoFrame(local)) return local;
    return local;
  }

  async function captureVideoFirstFrame(file) {
    const url = URL.createObjectURL(file);
    try {
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      video.src = url;
      await new Promise((resolve, reject) => {
        const fail = () => reject(new Error("브라우저가 이 비디오 코덱을 재생하지 못했습니다."));
        const timer = window.setTimeout(() => reject(new Error("비디오 로딩이 시간 초과되었습니다.")), 12000);
        const done = () => {
          window.clearTimeout(timer);
          resolve();
        };
        video.addEventListener("loadeddata", done, { once: true });
        video.addEventListener("error", () => {
          window.clearTimeout(timer);
          fail();
        }, { once: true });
      });
      try {
        await video.play();
        video.pause();
      } catch (_error) {
        // Autoplay can fail; seeking still works after loadeddata.
      }
      const seekTargets = [0.04, 0.12, 0];
      for (const time of seekTargets) {
        await new Promise((resolve) => {
          const finish = () => resolve();
          video.addEventListener("seeked", finish, { once: true });
          try {
            video.currentTime = time;
          } catch (_error) {
            finish();
          }
        });
        if (video.videoWidth && video.videoHeight) break;
      }
      const width = video.videoWidth || 640;
      const height = video.videoHeight || 360;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      context.drawImage(video, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/webp", 0.86);
      return {
        dataUrl,
        width,
        height,
        size: Math.round(dataUrl.length * 0.75),
        duration: Number(video.duration) || 0,
      };
    } catch (error) {
      return {
        dataUrl: videoPlaceholderDataUrl(),
        width: 640,
        height: 360,
        size: 0,
        duration: 0,
        error: error.message,
      };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function videoPlaceholderDataUrl() {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360"><rect width="640" height="360" fill="#0f172a"/><rect x="250" y="130" width="140" height="100" rx="16" fill="#38bdf8"/><path d="M300 155v50l48-25-48-25z" fill="#0f172a"/></svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  function videoPromptText(item, mode) {
    if (!item?.promptJson) return "";
    const includeTitles = mode !== "final" && state.videoSettings.includeSectionTitles;
    const blocks = videoSectionMeta.map((section) => {
      const sentences = item.promptJson[section.key]?.sentences || [];
      const lines = [];
      if (includeTitles) {
        if (mode === "ko") lines.push(`[${section.labelKo}]`);
        else if (mode === "both") lines.push(`[${section.labelEn} / ${section.labelKo}]`);
        else lines.push(`[${section.labelEn}]`);
      }
      if (mode === "ko") lines.push(...sentences.map((sentence) => sentence.ko).filter(Boolean));
      else if (mode === "both") lines.push(...sentences.map((sentence) => [sentence.en, sentence.ko].filter(Boolean).join("\n")).filter(Boolean));
      else lines.push(...sentences.map((sentence) => sentence.en).filter(Boolean));
      return lines.join("\n").trim();
    }).filter(Boolean);
    return blocks.join(mode === "final" ? "\n\n" : "\n\n\n");
  }

  function copyVideoPrompt(id, mode) {
    const item = findVideoItem(id);
    if (!item?.promptJson) return;
    writeClipboard(videoPromptText(item, mode), "복사했습니다.");
  }

  function copyVideoSection(id, sectionKey, lang) {
    const item = findVideoItem(id);
    const sectionConfig = videoSectionMeta.find((section) => section.key === sectionKey);
    const sentences = item?.promptJson?.[sectionKey]?.sentences || [];
    const mode = ["en", "ko", "both", "final"].includes(lang) ? lang : "en";
    const parts = [];
    if (state.videoSettings.includeSectionTitles && sectionConfig) {
      parts.push(mode === "ko" ? sectionConfig.labelKo : sectionConfig.labelEn);
    }
    if (mode === "both") parts.push(...sentences.map((sentence) => `${sentence.en}\n${sentence.ko}`));
    else if (mode === "ko") parts.push(...sentences.map((sentence) => sentence.ko).filter(Boolean));
    else parts.push(...sentences.map((sentence) => sentence.en).filter(Boolean));
    writeClipboard(parts.join("\n").trim(), "문단을 복사했습니다.");
  }

  async function saveVideoDetail(id) {
    const item = findVideoItem(id);
    if (!item) return;
    collectPromptEditsFromDom(item);
    item.title = document.getElementById("videoDetailTitle")?.value.trim() || "";
    item.categoryId = document.getElementById("videoDetailCategory")?.value || item.categoryId || state.videoCategories[0]?.id || "";
    item.memo = document.getElementById("videoDetailMemo")?.value.trim() || "";
    if (item.promptJson) item.finalPrompt = videoPromptText(item, "final");
    item.updatedAt = Date.now();
    const saved = await saveVideoItemState(item);
    render();
    showToast(saved ? "서버에 저장했습니다." : "브라우저에 임시 저장했습니다.", saved ? "success" : "warning", saved ? 1400 : 3000);
  }

  function deleteVideoItem(id) {
    if (!confirm("이 비디오 항목을 삭제할까요?")) return;
    const index = state.videoItems.findIndex((item) => item.id === id);
    if (index >= 0) state.videoItems.splice(index, 1);
    ui.videoSelectedId = state.videoItems[0]?.id || null;
    ui.view = "gallery";
    deleteVideoItemState(id);
    render();
  }

  function deleteSelectedVideoItems() {
    const selectedIds = [...new Set(ui.selectedBulkDeleteIds || [])].filter((id) => state.videoItems.some((item) => item.id === id));
    if (!selectedIds.length) {
      alert("삭제할 게시물을 먼저 선택하세요.");
      return;
    }
    if (!confirm(`선택한 ${selectedIds.length}개 비디오 항목을 삭제할까요?`)) return;
    const selected = new Set(selectedIds);
    state.videoItems = state.videoItems.filter((item) => !selected.has(item.id));
    if (selected.has(ui.videoSelectedId)) ui.videoSelectedId = state.videoItems[0]?.id || null;
    ui.bulkDeleteMode = false;
    ui.selectedBulkDeleteIds = [];
    ui.view = "gallery";
    resetGalleryWindow();
    saveVideoItemsState();
    render();
    showToast(`${selectedIds.length}개 비디오 항목을 삭제했습니다.`, "success", 1600);
  }

  async function translateVideoItemPromptSections(item, options = {}) {
    for (const section of videoSectionMeta) {
      const sentences = (item.promptJson?.[section.key]?.sentences || [])
        .map((sentence) => ({ id: sentence.id, en: String(sentence.en || "").trim() }))
        .filter((sentence) => sentence.en);
      if (!sentences.length) continue;
      const response = await fetch(SERVER_TRANSLATE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: item.id,
          sectionKey: section.key,
          sectionLabel: section.labelKo,
          sentences,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.message || payload.error || `${section.labelKo} 번역에 실패했습니다.`);
      const byId = new Map((payload.translations || []).map((entry) => [entry.id, entry.ko]));
      item.promptJson[section.key].sentences.forEach((sentence) => {
        const translated = byId.get(sentence.id);
        if (translated) sentence.ko = translated;
      });
    }
    if (!options.silent) render();
  }

  async function retranslateVideoSection(id, key) {
    const item = findVideoItem(id);
    if (!item?.promptJson?.[key]) return;
    collectPromptEditsFromDom(item);
    const sectionConfig = videoSectionMeta.find((section) => section.key === key);
    const sentences = item.promptJson[key].sentences.map((sentence) => ({
      id: sentence.id,
      en: String(sentence.en || "").trim(),
    })).filter((sentence) => sentence.en);
    if (!sentences.length) {
      showToast("재번역할 영어 문장이 없습니다.", "warning", 1600);
      return;
    }
    showToast("번역 중입니다.", "info", 1000);
    try {
      const response = await fetch(SERVER_TRANSLATE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: item.id,
          sectionKey: key,
          sectionLabel: sectionConfig?.labelKo || key,
          sentences,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.message || payload.error || "번역 요청에 실패했습니다.");
      const byId = new Map((payload.translations || []).map((entry) => [entry.id, entry.ko]));
      item.promptJson[key].sentences.forEach((sentence) => {
        const translated = byId.get(sentence.id);
        if (translated) sentence.ko = translated;
      });
      item.updatedAt = Date.now();
      const saved = await saveVideoItemState(item);
      render();
      showToast(saved ? "한국어 재번역과 저장이 끝났습니다." : "재번역 결과를 브라우저에 임시 저장했습니다.", saved ? "success" : "warning", 1800);
    } catch (error) {
      showToast(error.message || "번역에 실패했습니다.", "warning", 2400);
    }
  }

  function bindBackspaceNavigation() {
    document.addEventListener("keydown", (event) => {
      if (ui.modal && event.key === "Escape") {
        event.preventDefault();
        closeModal();
        return;
      }
      if (ui.modal && event.key === "Tab") {
        trapModalFocus(event);
        return;
      }
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (isTextEditingTarget(event.target)) return;
      if (event.target?.closest?.("[data-shortcut-field]")) return;
      const shortcuts = state.advancedSettings?.shortcuts || {};
      if (shortcutMatches(event, shortcuts.goBack)) {
        if (!goBackInApp()) return;
        event.preventDefault();
        return;
      }
      if (shortcutMatches(event, shortcuts.nextItem)) {
        if (navigateAdjacentItem(1)) event.preventDefault();
        return;
      }
      if (shortcutMatches(event, shortcuts.prevItem)) {
        if (navigateAdjacentItem(-1)) event.preventDefault();
        return;
      }
      if (shortcutMatches(event, shortcuts.copyFinal)) {
        const item = selectedItem();
        if (ui.view === "detail" && item?.promptJson) {
          if (isVideoArchiveMode()) copyVideoPrompt(item.id, "final");
          else copyPrompt(item.id, "final");
          event.preventDefault();
        }
      }
    });
  }

  function navigateAdjacentItem(delta) {
    const items = isVideoArchiveMode() ? getFilteredVideoItems() : getFilteredItems();
    if (!items.length) return false;
    // Only navigate when already viewing a detail item.
    if (ui.view !== "detail") return false;
    const currentId = isVideoArchiveMode() ? ui.videoSelectedId : ui.selectedId;
    const index = items.findIndex((item) => item.id === currentId);
    const next = items[Math.max(0, Math.min(items.length - 1, (index < 0 ? 0 : index) + delta))];
    if (!next || next.id === currentId) return false;
    openItem(next.id);
    return true;
  }

  function isTextEditingTarget(target) {
    if (!target?.closest) return false;
    return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
  }

  function goBackInApp() {
    if (ui.modal) {
      ui.modal = null;
      render();
      return true;
    }
    if (ui.view === "detail") {
      ui.view = ui.previousView || "gallery";
      ui.editMode = false;
      render();
      return true;
    }
    return false;
  }

  function selectedItem() {
    return isVideoArchiveMode() ? findVideoItem(ui.videoSelectedId) : findItem(ui.selectedId);
  }

  function findItem(id) {
    return state.items.find((item) => item.id === id);
  }

  function findVideoItem(id) {
    return (state.videoItems || []).find((item) => item.id === id);
  }

  function currentArchiveItems() {
    return isVideoArchiveMode() ? (state.videoItems || []) : state.items;
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
      videoSectionMeta.forEach((section) => root.style.setProperty(`--section-${section.colorKey}`, "var(--panel)"));
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

  bindBackspaceNavigation();
  render();
})();
