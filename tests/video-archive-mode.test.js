const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
const indexSource = fs.readFileSync(path.join(root, "index.html"), "utf8");
const serverSource = fs.readFileSync(path.join(root, "server.js"), "utf8");
const stylesSource = fs.readFileSync(path.join(root, "styles.css"), "utf8");

function functionSource(name) {
  const start = appSource.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const bodyStart = appSource.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < appSource.length; index += 1) {
    if (appSource[index] === "{") depth += 1;
    if (appSource[index] === "}") depth -= 1;
    if (depth === 0) return appSource.slice(start, index + 1);
  }
  throw new Error(`${name} has an unterminated body`);
}

test("topbar switches between image and video archive modes", () => {
  const topbar = functionSource("renderTopbar");
  const modeSwitch = functionSource("renderArchiveModeSwitch");

  assert.doesNotMatch(topbar, /EXIF 모드|API 분석 모드|mode-chip/);
  assert.match(topbar, /renderArchiveModeSwitch/);
  assert.match(modeSwitch, />이미지</);
  assert.match(modeSwitch, />비디오</);
  assert.match(modeSwitch, /data-action="setArchiveMode"/);
  assert.match(modeSwitch, /data-mode="image"/);
  assert.match(modeSwitch, /data-mode="video"/);
});

test("video mode keeps a separate gallery, upload, and six-section prompt view", () => {
  const renderView = functionSource("renderView");
  const detail = functionSource("renderVideoDetail");
  const tools = functionSource("renderVideoPromptTools");
  const upload = functionSource("renderVideoUpload");
  const topbar = functionSource("renderTopbar");

  assert.match(renderView, /isVideoArchiveMode/);
  assert.match(renderView, /renderVideoGallery/);
  assert.match(renderView, /renderVideoDetail/);
  assert.match(detail, /videoDetailTitle/);
  assert.match(detail, /videoDetailCategory/);
  assert.match(detail, /videoTitleMetaHtml/);
  assert.match(appSource, /video-meta-badge is-duration/);
  assert.match(appSource, /video-meta-badge is-ratio/);
  assert.match(stylesSource, /\.video-meta-badge\.is-duration/);
  assert.match(stylesSource, /\.video-meta-badge\.is-ratio/);
  assert.match(detail, /renderVideoPromptColumns/);
  assert.match(appSource, /formatVideoAspectRatioLabel/);
  assert.match(appSource, /videoAspectRatioLabel/);
  assert.doesNotMatch(detail, /<video/);
  assert.match(tools, /copyVideoPrompt/);
  assert.match(tools, /전체 복사/);
  assert.doesNotMatch(tools, /외모제외|얼굴/);
  assert.match(upload, /video\/webm/);
  assert.match(upload, /직접 입력/);
  assert.match(upload, /videoUploadCategory/);
  assert.match(upload, /video-queue-copy/);
  assert.doesNotMatch(upload, /<strong>\$\{escapeHtml\(entry\.name\)\}<\/strong>\s*<span>\$\{escapeHtml\(entry\.status\)\}<\/span>/);
  assert.doesNotMatch(upload, /비워 두면 파일명/);
  assert.match(appSource, /subject_definitions/);
  assert.match(appSource, /non_diegetic_music/);
  assert.match(topbar, /isVideoArchiveMode\(\) \? "" :/);
});

test("video settings and categories stay separate from image settings", () => {
  const settings = functionSource("renderSettings");
  const videoSettings = functionSource("renderVideoSettings");
  const uploadProcess = functionSource("processPendingVideoUploads");

  assert.match(settings, /renderVideoSettings/);
  assert.match(videoSettings, /비디오 설정/);
  assert.match(videoSettings, /API 설정/);
  assert.match(videoSettings, /videoCategory/);
  assert.match(appSource, /videoCategories/);
  assert.match(appSource, /addVideoCategory/);
  assert.match(uploadProcess, /제목을 직접 입력하세요/);
  assert.doesNotMatch(uploadProcess, /file\.name\.replace/);
  assert.match(stylesSource, /video-sentence/);
  assert.match(stylesSource, /빈칸/);
});

test("video items persist separately from image items", () => {
  assert.match(indexSource, /video-prompt-resolver\.js/);
  assert.match(serverSource, /video-items\.json/);
  assert.match(serverSource, /\/api\/video-items/);
  assert.match(serverSource, /probeVideoSize/);
  assert.match(serverSource, /width: info\.width/);
  assert.match(appSource, /SERVER_VIDEO_ITEMS_ENDPOINT/);
  assert.match(appSource, /videoItems/);
  assert.match(stylesSource, /archive-mode-switch/);
  assert.match(stylesSource, /data-section="subject_definitions"/);
});

test("video mode topbar shows the video prompt viewer instead of image tools", () => {
  const topbar = functionSource("renderTopbar");
  const iconSource = functionSource("navIcon");

  assert.match(topbar, /iconButton\("videoPromptViewer"/);
  assert.match(topbar, /비디오 프롬프트 확인/);
  assert.match(iconSource, /film:/);
  assert.match(topbar, /isVideoArchiveMode\(\) \? iconButton\("videoPromptViewer"/);
});

test("video prompt modal is limited to upload, six prompt sections, and copy controls", () => {
  const modal = functionSource("renderModal");
  const viewer = functionSource("renderVideoPromptViewer");

  assert.match(modal, /비디오 프롬프트 확인/);
  assert.match(modal, /renderVideoPromptViewer\(\)/);
  assert.match(viewer, /videoPromptViewerFileInput/);
  assert.match(viewer, /videoSectionMeta\.map/);
  assert.match(viewer, /copyVideoPromptViewerSection/);
  assert.match(viewer, /copyVideoPromptViewerAll/);
  assert.doesNotMatch(viewer, /얼굴 빼고|copyVideoPromptViewerWithoutFace|제목|카테고리|번역/);
});

test("video prompt viewer binds immediate file inspection and has section styles", () => {
  const bindEvents = functionSource("bindVideoPromptViewerEvents");
  const inspectFile = functionSource("inspectVideoPromptViewerFile");

  assert.match(bindEvents, /change/);
  assert.match(bindEvents, /drop/);
  assert.match(inspectFile, /readVideoPromptFromFile/);
  assert.match(inspectFile, /isVideoUploadFile/);
  assert.match(stylesSource, /\.prompt-viewer-preview video/);
  assert.match(stylesSource, /data-section="subject_definitions"/);
  assert.match(stylesSource, /data-section="non_diegetic_music"/);
});
