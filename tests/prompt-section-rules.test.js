const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('analysis and saved settings keep environment separate from pose and action', () => {
  const appSource = read('app.js');
  const settings = JSON.parse(read('data/settings.json'));
  const configuredText = `${settings.promptInstruction}\n${settings.promptSettings.englishRules}`;

  for (const text of [appSource, configuredText]) {
    assert.match(text, /Background must describe only the environment/i);
    assert.match(text, /Expression \/ Pose must include pose, action, body placement, hand position, leg position/i);
  }
  assert.match(appSource, /promptInstruction: activeDefaultInstruction/);
  assert.doesNotMatch(configuredText, /Background must include (?:the subject.s )?(?:physical action|pose, action|body placement)/i);
  assert.doesNotMatch(configuredText, /Put pose, action[^.]* in Background/i);
});

test('additional-request prompt enforces the same five-section boundaries', () => {
  const serverSource = read('server.js');

  assert.match(serverSource, /Background: environment, location, furniture, architecture, and ambient scene elements only/i);
  assert.match(serverSource, /Expression \/ Pose: pose, action, body placement, hand position, leg position/i);
});

test('personal carried items remain outfit items even when temporarily set down', () => {
  const appSource = read('app.js');
  const serverSource = read('server.js');
  const settings = JSON.parse(read('data/settings.json'));
  const configuredText = `${settings.promptInstruction}\n${settings.promptSettings.englishRules}`;

  for (const text of [appSource, serverSource, configuredText]) {
    assert.match(text, /Personal accessories and carried items/i);
    assert.match(text, /even when temporarily (?:set|placed)/i);
    assert.match(text, /retail merchandise/i);
  }

  const {
    genericizePersonalItemsInPose,
    isPersonalPropBackgroundViolation,
  } = require('../scripts/refine-personal-props');
  assert.equal(
    genericizePersonalItemsInPose('One hand holds the strap of the large black leather shoulder bag.'),
    'One hand holds the bag strap.',
  );
  assert.equal(
    isPersonalPropBackgroundViolation('The handbag rests on the seat directly beside her hip.'),
    true,
  );
  assert.equal(
    isPersonalPropBackgroundViolation('Display rails hold black, taupe, and cream shoulder bags with price tags inside the boutique.'),
    false,
  );
});

test('misclassified content is moved to its proper section instead of discarded', () => {
  const {
    classifyEnglishSentence,
    cleanPoseEnglish,
    restoreItems,
  } = require('../scripts/restore-misclassified-content');

  const action = 'She pauses at the curb with one hand holding the bag close to the thigh and the other adjusting sunglasses, placing most of her weight on the back leg.';
  assert.equal(classifyEnglishSentence(action, 'background'), 'expression_pose');
  assert.equal(
    cleanPoseEnglish(action),
    'She pauses with one hand holding the bag close to the thigh and the other adjusting sunglasses, placing most of her weight on the back leg.',
  );

  const mixedLocation = 'Standing in a crowded urban nightlife street with her torso facing forward, her weight supported on one leg.';
  assert.equal(classifyEnglishSentence(mixedLocation, 'background'), 'expression_pose');
  assert.equal(
    cleanPoseEnglish(mixedLocation),
    'She stands with her torso facing forward, her weight supported on one leg.',
  );

  assert.equal(
    classifyEnglishSentence('The background contains broad gray stone paving, geometric granite seating, dense shrubs, and tall leafy trees.', 'background'),
    'background',
  );

  const section = (key, en, ko) => ({
    title_ko: key,
    sentences: [{ id: `${key}-1`, en, ko }],
  });
  const currentPrompt = {
    appearance: section('appearance', 'An adult woman with long black hair.', '긴 검은 머리의 성인 여성입니다.'),
    outfit: section('outfit', 'Wearing a black dress and sunglasses.', '검은 드레스와 선글라스를 착용합니다.'),
    background: section('background', 'The setting is in a shopping district.', '배경은 쇼핑 구역입니다.'),
    expression_pose: section('expression_pose', 'She looks curious.', '궁금한 표정을 짓습니다.'),
    details: section('details', 'Photorealistic high-resolution detail.', '사실적인 고해상도 디테일입니다.'),
  };
  const sourcePrompt = structuredClone(currentPrompt);
  sourcePrompt.background.sentences[0].en += ` ${action}`;
  sourcePrompt.background.sentences[0].ko += ' 그녀는 한 손으로 가방을 잡고 다른 손으로 선글라스를 고쳐 쓰며 뒷다리에 체중을 싣고 있습니다.';
  const currentItems = [{ id: 'sample', promptJson: currentPrompt, versions: [] }];
  const sourceItems = [{ id: 'sample', promptJson: sourcePrompt, versions: [] }];

  restoreItems(currentItems, sourceItems);
  const restored = currentItems[0].promptJson;
  assert.doesNotMatch(restored.background.sentences.map((sentence) => sentence.en).join(' '), /pauses|sunglasses/i);
  assert.match(restored.expression_pose.sentences.map((sentence) => sentence.en).join(' '), /holding the bag.*adjusting sunglasses/i);
});
