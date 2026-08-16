const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('Vertex settings expose independent editable model inputs with requested presets', () => {
  const appSource = read('app.js');

  assert.match(appSource, /const vertexModelPresets\s*=\s*\[[\s\S]*"gemini-3\.6-flash"[\s\S]*"gemini-3\.5-flash-lite"[\s\S]*\]/);
  assert.match(appSource, /data-provider-vision-model="\$\{index\}"/);
  assert.match(appSource, /data-provider-text-model="\$\{index\}"/);
  assert.match(appSource, /<datalist id="vertex-model-presets-\$\{index\}">/);
  assert.match(appSource, /list="vertex-model-presets-\$\{index\}"/);
});

test('Vertex model normalization and save keep vision and text values separate', () => {
  const appSource = read('app.js');

  assert.match(appSource, /provider\.name === "Google Vertex AI"[\s\S]*provider\.visionModel\s*=\s*visionModel[\s\S]*provider\.textModel\s*=\s*textModel/);
  assert.match(appSource, /const visionModel = document\.querySelector\(`\[data-provider-vision-model="\$\{index\}"\]`\)/);
  assert.match(appSource, /const textModel = document\.querySelector\(`\[data-provider-text-model="\$\{index\}"\]`\)/);
});

test('provider requests resolve the model from request purpose', () => {
  const serverSource = read('server.js');

  assert.match(serverSource, /function resolveProviderModel\(provider, request\s*=\s*\{\}\)/);
  assert.match(serverSource, /request\.image\s*\?\s*provider\.visionModel\s*:\s*provider\.textModel/);
  assert.match(serverSource, /resolveProviderModel\(provider, request\)/);

  const sourceMatch = serverSource.match(/function resolveProviderModel\(provider, request = \{\}\) \{[\s\S]*?\n\}/);
  assert.ok(sourceMatch, 'resolveProviderModel source should be extractable');
  const resolveProviderModel = Function(`"use strict"; return (${sourceMatch[0]});`)();
  const provider = {
    model: 'legacy-model',
    visionModel: 'vision-model',
    textModel: 'translation-model',
  };

  assert.equal(resolveProviderModel(provider, { image: { data: 'base64' } }), 'vision-model');
  assert.equal(resolveProviderModel(provider, { image: null }), 'translation-model');
  assert.equal(resolveProviderModel({ model: 'legacy-model' }, { image: null }), 'legacy-model');
});
