const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const ITEMS_PATH = path.join(ROOT, 'data', 'items.json');
const SOURCE_BACKUP_PATH = path.join(
  ROOT,
  'backup',
  'items-before-five-section-cleanup-2026-07-19T02-02-37-046Z.json',
);
const SECTION_KEYS = ['appearance', 'outfit', 'background', 'expression_pose', 'details'];

const TECHNICAL_PATTERN = /^(?:photorealistic|high[- ]resolution|realistic|cinematic|professional|natural lighting|soft lighting|dramatic lighting|preserve|ensure|emphasize|render|use |avoid |no |without )|\b(?:color grading|depth of field|bokeh|image quality|dynamic range|white balance|interface elements?)\b/i;
const POSE_PATTERN = /^(?:standing|sitting|reclining|lying|kneeling|crouching|walking|posing|leaning|holding)\b|\b(?:she|the woman|the man|the subject)\s+(?:is\s+)?(?:standing|sitting|reclining|lying|kneeling|crouching|walking|posing|leaning|stands?|sits?|reclines?|lies?|kneels?|crouches?|walks?|poses?|holds?|raises?|rests?|leans?|turns?|twists?|bends?|crosses?|extends?|reaches?|lifts?|touches?|adjusts?|places?|keeps?|faces?|looks?|gazes?|smiles?|tilts?|angles?|supports?|presses?|dangles?|pauses?|steps?|balances?)\b|\bshe has (?:one|both|her|the)\s+(?:arm|hand|leg|foot|knee|elbow|shoulder)s?\b[^.!?]*\b(?:raised|lifted|bent|crossed|extended|resting|pressed)\b|\bher\s+(?:(?:opposite|other|left|right|upper|lower)\s+)?(?:arm|hand|leg|foot|knee|elbow|shoulder|head|torso|body|back|waist|hip|thigh|forearm|face|eyes?|gaze|lips?)s?\b[^.!?]*\b(?:(?:is|are)\s+)?(?:hanging|held|holding|resting|rested|bent|crossed|curved|extended|extending|lifted|raised|turned|angled|supported|pressed|pushed|arched|positioned|pointing|parted|closed|lowered|facing|leaning|inclines?|tilted|rotates?|occupies|appears?|recedes?|hangs?|holds?|rests?|bends?|curves?|crosses?|extends?|reaches?|lifts?|raises?|turns?|angles?|supports?|presses?|points?|remains?|faces?|leans?|tilts?|looks?|gazes?)\b|\b(?:one|both|the)\s+(?:arm|hand|leg|foot|knee|elbow|shoulder|forearm)s?\b[^.!?]*\b(?:(?:is|are)\s+)?(?:hanging|held|holding|resting|rested|bent|crossed|extended|extending|lifted|raised|turned|angled|supported|pressed|pushed|positioned|pointing|hangs?|holds?|rests?|bends?|crosses?|extends?|reaches?|lifts?|raises?|turns?|angles?|supports?|presses?|points?|remains?)\b|\b(?:body placement|hand position|leg position|body weight|weight (?:rests|supported|placed)|pose|posture|camera angle|composition|(?:camera|portrait) framing|closest to the camera|portion of the image|diagonal line|recede toward|head (?:tilted|angled|turned)|torso (?:faces|facing|turned|leaning)|shoulders? (?:relaxed|lifted|angled))\b/i;
const BACKGROUND_PATTERN = /^(?:the |a |an )?(?:setting|background|backdrop|environment|surroundings?|interior|exterior|room|street|road|sidewalk|building|facade|wall|floor|window|door|table|bench|sofa|bedroom|cafe|restaurant|store|boutique|station|park|garden|sky|weather|corridor|cityscape|landscape|scenery)|^(?:behind|around|surrounding|nighttime|daytime|indoor|outdoor|indoors|outdoors|on the table|in the background)\b|\b(?:setting contains|background contains|room contains|environment contains|scene includes)\b/i;
const OUTFIT_PATTERN = /^(?:wearing|dressed|the outfit|the lower outfit|the upper outfit|the clothing|the garment|the lifted garment|the open robe|the dress|the skirt|the coat|the jacket|the blouse|the shirt|the top|the pants|the trousers|the jeans|the shoes|the boots|the bag|a structured .*?(?:bag|handbag)|accessorized)|\b(?:outfit consists|clothing consists|garment features)\b/i;
const APPEARANCE_PATTERN = /^(?:photorealistic\s+[^.!?]{0,80}?portrait of\s+)?(?:beautiful |attractive |young |adult |a |an )*(?:korean |asian )?(?:woman|man|girl|boy)\b|^her\s+(?:skin|complexion|figure|physique|face|facial features|jawline|cheekbones?|eyes?|eyebrows?|brows?|nose|lips?|mouth|hair|hairstyle|bangs|ponytail|bun|makeup|bust|waist|hips?|body shape)\b/i;

function splitSentences(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return [];
  return (text.match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g) || [text])
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenCoverage(candidate, existing) {
  const candidateTokens = [...new Set(normalize(candidate).split(' ').filter((token) => token.length > 2))];
  if (!candidateTokens.length) return 0;
  const existingTokens = new Set(normalize(existing).split(' '));
  const matched = candidateTokens.filter((token) => existingTokens.has(token)).length;
  return matched / candidateTokens.length;
}

function sentenceCase(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  const capitalized = text[0].toUpperCase() + text.slice(1);
  return /[.!?]$/.test(capitalized) ? capitalized : capitalized + '.';
}

function classifyEnglishSentence(sentence, sourceSection) {
  const text = String(sentence || '').trim();
  if (!text) return sourceSection;

  if (sourceSection === 'appearance' && APPEARANCE_PATTERN.test(text)) return 'appearance';
  if (sourceSection === 'outfit' && OUTFIT_PATTERN.test(text)) return 'outfit';
  if (sourceSection === 'details' && TECHNICAL_PATTERN.test(text)) return 'details';
  if (sourceSection === 'background' && OUTFIT_PATTERN.test(text)) return 'outfit';
  if (sourceSection === 'background' && BACKGROUND_PATTERN.test(text)) return 'background';
  if (POSE_PATTERN.test(text)) return 'expression_pose';
  if (BACKGROUND_PATTERN.test(text)) return 'background';
  if (OUTFIT_PATTERN.test(text)) return 'outfit';
  if (APPEARANCE_PATTERN.test(text)) return 'appearance';
  if (TECHNICAL_PATTERN.test(text)) return 'details';
  return sourceSection;
}

function cleanPoseEnglish(sentence) {
  let text = String(sentence || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';

  const subjectGerundMatch = text.match(
    /^(she|he|the woman|the man|the subject)\s+is\s+(standing|sitting|reclining|lying|kneeling|crouching|walking|posing|leaning)\b([\s\S]*)$/i,
  );
  if (subjectGerundMatch) {
    const verbs = {
      standing: 'stands',
      sitting: 'sits',
      reclining: 'reclines',
      lying: 'lies',
      kneeling: 'kneels',
      crouching: 'crouches',
      walking: 'walks',
      posing: 'poses',
      leaning: 'leans',
    };
    const remainder = subjectGerundMatch[3];
    const bodyRemainder = remainder.match(/(?:,\s*|\bwith\s+)(her|his|one|both|the)\s+([\s\S]+)$/i);
    const subject = subjectGerundMatch[1].toLowerCase() === 'he' ? 'He' : 'She';
    if (bodyRemainder && /\b(?:arm|hand|leg|foot|knee|shoulder|head|torso|body|weight|gaze|eyes?)s?\b/i.test(bodyRemainder[2])) {
      return sentenceCase(subject + ' ' + verbs[subjectGerundMatch[2].toLowerCase()] + ' with ' + bodyRemainder[1] + ' ' + bodyRemainder[2]);
    }
    return subject + ' ' + verbs[subjectGerundMatch[2].toLowerCase()] + '.';
  }

  const gerundMatch = text.match(
    /^(standing|sitting|reclining|lying|kneeling|crouching|walking|posing|leaning)(?:\s+(upright|backward|forward|casually|comfortably))?\b[\s\S]*?\bwith\s+([\s\S]+)$/i,
  );
  if (gerundMatch) {
    const verbs = {
      standing: 'stands',
      sitting: 'sits',
      reclining: 'reclines',
      lying: 'lies',
      kneeling: 'kneels',
      crouching: 'crouches',
      walking: 'walks',
      posing: 'poses',
      leaning: 'leans',
    };
    const adverb = gerundMatch[2] ? ' ' + gerundMatch[2].toLowerCase() : '';
    return sentenceCase('She ' + verbs[gerundMatch[1].toLowerCase()] + adverb + ' with ' + gerundMatch[3]);
  }

  const subjectLocationMatch = text.match(
    /^(she|he|the woman|the man|the subject)\s+([a-z]+(?:es|s)?)\s+(?:at|in|on|inside|outside|beside|near|before|behind|by|against)\b[\s\S]*?\b(with|while)\s+([\s\S]+)$/i,
  );
  if (subjectLocationMatch) {
    return sentenceCase(
      subjectLocationMatch[1] + ' ' + subjectLocationMatch[2] + ' ' + subjectLocationMatch[3] + ' ' + subjectLocationMatch[4],
    );
  }

  const gerundOnlyMatch = text.match(
    /^(standing|sitting|reclining|lying|kneeling|crouching|walking|posing|leaning)\b/i,
  );
  if (gerundOnlyMatch) {
    const verbs = {
      standing: 'stands',
      sitting: 'sits',
      reclining: 'reclines',
      lying: 'lies',
      kneeling: 'kneels',
      crouching: 'crouches',
      walking: 'walks',
      posing: 'poses',
      leaning: 'leans',
    };
    return 'She ' + verbs[gerundOnlyMatch[1].toLowerCase()] + '.';
  }

  return sentenceCase(text);
}

function cleanPoseKorean(sentence, englishSentence) {
  let text = String(sentence || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';

  const englishStartsWithLocationPose = /^(?:standing|sitting|reclining|lying|kneeling|crouching|walking|posing|leaning)\b/i.test(englishSentence);
  const cannedPose = /^(?:standing)/i.test(englishSentence)
    ? '그녀는 서 있습니다.'
    : /^(?:sitting)/i.test(englishSentence)
      ? '그녀는 앉아 있습니다.'
      : /^(?:reclining|lying)/i.test(englishSentence)
        ? '그녀는 기대어 누워 있습니다.'
        : /^(?:kneeling)/i.test(englishSentence)
          ? '그녀는 무릎을 꿇고 있습니다.'
          : /^(?:crouching)/i.test(englishSentence)
            ? '그녀는 쪼그려 앉아 있습니다.'
            : /^(?:walking)/i.test(englishSentence)
              ? '그녀는 걷고 있습니다.'
              : /^(?:leaning)/i.test(englishSentence)
                ? '그녀는 몸을 기대고 있습니다.'
                : '그녀는 포즈를 취하고 있습니다.';
  const koreanPoseSignal = /(?:그녀|여성|피사체|상체|몸|어깨|한쪽|양쪽|두\s|한\s|팔|손|다리|무릎|발|고개|머리|시선|표정|허리|엉덩이|허벅지)[^.!?。]*(?:서 있|앉|누워|걷|손|팔|다리|무릎|기대|들|올리|내리|굽히|뻗|바라|표정|포즈)/;
  if (englishStartsWithLocationPose && !koreanPoseSignal.test(text)) return cannedPose;
  if (englishStartsWithLocationPose && !/^(?:그녀|여성|남성|피사체)/.test(text)) {
    const marker = text.search(/(?:상체|몸|어깨|한쪽|양쪽|두\s|두 |한\s|한 |팔|손|다리|무릎|발|고개|머리|시선|표정|허리|엉덩이|허벅지)/);
    if (marker > 0) {
      const verb = /^(?:standing)/i.test(englishSentence)
        ? '서서 '
        : /^(?:sitting)/i.test(englishSentence)
          ? '앉아 '
          : /^(?:reclining|lying)/i.test(englishSentence)
            ? '누운 채 '
            : /^(?:kneeling)/i.test(englishSentence)
              ? '무릎을 꿇고 '
              : /^(?:crouching)/i.test(englishSentence)
                ? '쪼그려 앉아 '
                : /^(?:walking)/i.test(englishSentence)
                  ? '걸으며 '
                  : '';
      text = '그녀는 ' + verb + text.slice(marker).replace(/^[,，\s]+/, '');
    }
  }

  text = text.replace(
    /\s+(?:도로\s*경계석|거리|침대|벤치|의자|소파|바닥|테이블|카페|매장|공원|방|문|창문|계단|플랫폼|해변|수영장|주방|욕실|복도|건물|벽|난간|스툴|좌석)(?:\s*[가-힣A-Za-z0-9·-]{0,12})?(?:에서|위에서|앞에서|옆에서|가까이에서)\s+/g,
    ' ',
  );
  return text;
}

function fallbackPoseKorean(englishSentence) {
  const text = String(englishSentence || '');
  if (/both legs?/i.test(text)) return '그녀는 두 다리를 들어 올리거나 굽혀 자세를 취하고 있습니다.';
  if (/one leg/i.test(text)) return '그녀는 한쪽 다리를 뻗고 다른 쪽 다리로 균형을 잡아 비대칭 자세를 취하고 있습니다.';
  if (/both (?:arms?|hands?)/i.test(text)) return '그녀는 양팔과 두 손을 사용해 자세를 취하고 있습니다.';
  if (/one (?:arm|hand)/i.test(text)) return '그녀는 한쪽 팔과 손을 움직여 자세를 취하고 있습니다.';
  if (/reclining|lying/i.test(text)) return '그녀는 몸을 뒤로 기대어 누운 자세를 취하고 있습니다.';
  if (/sitting/i.test(text)) return '그녀는 앉은 자세를 취하고 있습니다.';
  if (/standing/i.test(text)) return '그녀는 서 있는 자세를 취하고 있습니다.';
  return '그녀는 자연스러운 자세와 동작을 취하고 있습니다.';
}

function existingText(promptJson, sectionKey) {
  return (promptJson?.[sectionKey]?.sentences || [])
    .map((sentence) => sentence.en || '')
    .join(' ');
}

function isAlreadyPresent(promptJson, sectionKey, candidate) {
  const haystack = normalize(existingText(promptJson, sectionKey));
  const needle = normalize(candidate);
  return Boolean(needle && (
    haystack.includes(needle)
    || needle.includes(haystack) && haystack.length >= 80
    || tokenCoverage(candidate, haystack) >= 0.82
  ));
}

function uniqueSentenceId(promptJson, preferred) {
  const ids = new Set(
    SECTION_KEYS.flatMap((key) => (promptJson?.[key]?.sentences || []).map((sentence) => sentence.id)),
  );
  let candidate = preferred;
  let suffix = 2;
  while (ids.has(candidate)) {
    candidate = preferred + '-' + suffix;
    suffix += 1;
  }
  return candidate;
}

function restorePrompt(currentPrompt, sourcePrompt, stats) {
  if (!currentPrompt || !sourcePrompt) return;

  for (const sourceSection of SECTION_KEYS) {
    const sourceSentences = sourcePrompt?.[sourceSection]?.sentences || [];
    sourceSentences.forEach((sourceSentence, sourceIndex) => {
      const englishParts = splitSentences(sourceSentence.en);
      const koreanParts = splitSentences(sourceSentence.ko);
      const grouped = new Map();
      if (englishParts.length !== koreanParts.length) {
        stats.skippedMismatchedTranslation += englishParts.length;
        return;
      }

      englishParts.forEach((englishPart, partIndex) => {
        const currentSourceText = normalize(existingText(currentPrompt, sourceSection));
        const originalPart = normalize(englishPart);
        if (originalPart && currentSourceText.includes(originalPart)) return;

        const targetSection = classifyEnglishSentence(englishPart, sourceSection);
        if (targetSection === sourceSection && tokenCoverage(englishPart, currentSourceText) >= 0.35) return;

        const pairedKorean = koreanParts[partIndex] || '';
        const restoredEnglish = targetSection === 'expression_pose'
          ? cleanPoseEnglish(englishPart)
          : sentenceCase(englishPart);
        const restoredKorean = targetSection === 'expression_pose'
          ? cleanPoseKorean(pairedKorean, englishPart)
          : pairedKorean;
        if (!restoredEnglish || !restoredKorean) {
          stats.skippedMissingTranslation += 1;
          return;
        }

        if (!grouped.has(targetSection)) grouped.set(targetSection, { en: [], ko: [] });
        grouped.get(targetSection).en.push(restoredEnglish);
        grouped.get(targetSection).ko.push(restoredKorean);
      });

      for (const [targetSection, recovered] of grouped.entries()) {
        const en = recovered.en.join(' ').trim();
        const ko = recovered.ko.join(' ').trim();
        if (!en || !ko || isAlreadyPresent(currentPrompt, targetSection, en)) {
          stats.duplicatesSkipped += 1;
          continue;
        }
        const preferredId = targetSection + '-restored-' + sourceSection + '-' + (sourceIndex + 1);
        currentPrompt[targetSection].sentences.push({
          id: uniqueSentenceId(currentPrompt, preferredId),
          en,
          ko,
        });
        stats.movedRecords += 1;
        stats.movedEnglishCharacters += en.length;
        const moveKey = sourceSection + '->' + targetSection;
        stats.moves[moveKey] = (stats.moves[moveKey] || 0) + 1;
        if (!stats.samples[moveKey]) stats.samples[moveKey] = [];
        if (stats.samples[moveKey].length < 3) stats.samples[moveKey].push(en);
      }
    });
  }
}

function relocateBackgroundContamination(promptJson, stats) {
  if (!promptJson?.background?.sentences) return;
  const retained = [];
  const additions = [];

  promptJson.background.sentences.forEach((sentence, sentenceIndex) => {
    const englishParts = splitSentences(sentence.en);
    const koreanParts = splitSentences(sentence.ko);
    if (englishParts.length !== koreanParts.length) {
      const koreanPoseParts = koreanParts.filter((part) => /^(?:그녀|여성|피사체)(?:는|은|가)?[^.!?。]*(?:서 있|앉|누워|걷|달리|손을|팔을|다리를|무릎을|고개를|시선을|바라|미소|표정)/.test(part));
      const koreanBackgroundParts = koreanParts.filter((part) => !koreanPoseParts.includes(part));
      const keptEnglish = [];
      let poseKoreanIndex = 0;
      englishParts.forEach((englishPart) => {
        const targetSection = classifyEnglishSentence(englishPart, 'background');
        if (targetSection === 'background') {
          keptEnglish.push(sentenceCase(englishPart));
          return;
        }
        const matchedKorean = targetSection === 'expression_pose'
          ? koreanPoseParts[poseKoreanIndex++] || fallbackPoseKorean(englishPart)
          : '';
        if (!matchedKorean) return;
        additions.push({
          targetSection,
          sourceIndex: sentenceIndex,
          en: targetSection === 'expression_pose' ? cleanPoseEnglish(englishPart) : sentenceCase(englishPart),
          ko: targetSection === 'expression_pose' ? cleanPoseKorean(matchedKorean, englishPart) : matchedKorean,
        });
      });
      if (keptEnglish.length && koreanBackgroundParts.length) {
        retained.push({
          ...sentence,
          en: keptEnglish.join(' '),
          ko: koreanBackgroundParts.join(' '),
        });
      }
      return;
    }

    const keptEnglish = [];
    const keptKorean = [];
    englishParts.forEach((englishPart, partIndex) => {
      const targetSection = classifyEnglishSentence(englishPart, 'background');
      if (targetSection === 'background') {
        keptEnglish.push(sentenceCase(englishPart));
        keptKorean.push(koreanParts[partIndex]);
        return;
      }
      additions.push({
        targetSection,
        sourceIndex: sentenceIndex,
        en: targetSection === 'expression_pose' ? cleanPoseEnglish(englishPart) : sentenceCase(englishPart),
        ko: targetSection === 'expression_pose'
          ? cleanPoseKorean(koreanParts[partIndex], englishPart)
          : koreanParts[partIndex],
      });
    });

    if (keptEnglish.length) {
      retained.push({
        ...sentence,
        en: keptEnglish.join(' '),
        ko: keptKorean.join(' '),
      });
    }
  });

  promptJson.background.sentences = retained;
  additions.forEach((addition) => {
    if (!addition.en || !addition.ko || isAlreadyPresent(promptJson, addition.targetSection, addition.en)) return;
    promptJson[addition.targetSection].sentences.push({
      id: uniqueSentenceId(
        promptJson,
        addition.targetSection + '-relocated-background-' + (addition.sourceIndex + 1),
      ),
      en: addition.en,
      ko: addition.ko,
    });
    stats.relocatedBackgroundRecords += 1;
  });

  const koreanSubjectPose = /^(?:그녀|여성|피사체)(?:는|은|가)?[^.!?。]*(?:서 있|앉|누워|걷|달리|손을|팔을|다리를|무릎을|고개를|시선을|바라|미소|표정)/;
  const movedKorean = [];
  promptJson.background.sentences.forEach((sentence) => {
    const parts = splitSentences(sentence.ko);
    const kept = parts.filter((part) => {
      if (!koreanSubjectPose.test(part)) return true;
      movedKorean.push(part);
      return false;
    });
    sentence.ko = kept.join(' ');
  });
  promptJson.background.sentences = promptJson.background.sentences.filter((sentence) => String(sentence.ko || '').trim());
  if (movedKorean.length && promptJson.expression_pose.sentences.length) {
    const target = promptJson.expression_pose.sentences[0];
    movedKorean.forEach((part) => {
      if (!normalize(target.ko).includes(normalize(part))) target.ko = (target.ko + ' ' + part).trim();
    });
    stats.relocatedKoreanBackgroundSentences += movedKorean.length;
  }
}

function applyKnownRepairs(promptJson, itemId) {
  if (!promptJson) return;

  promptJson.background.sentences.forEach((sentence) => {
    sentence.ko = String(sentence.ko || '')
      .replace(
        /장소는 실제처럼 느껴질 만큼 충분히 활기차면서도 피사체가 시각적으로 명확하게 유지되며,?[^.!?。]*(?:[.!?。]|$)/g,
        '장소는 실제처럼 느껴질 만큼 충분히 활기찹니다.',
      )
      .replace(
        /장소는 실제처럼 느껴질 만큼 충분히 [^.!?。]*피사체가 시각적으로 명확하게 [^.!?。]*(?:[.!?。]|$)/g,
        '장소는 실제처럼 느껴질 만큼 충분히 생동감이 있습니다.',
      );
  });

  promptJson.expression_pose.sentences.forEach((sentence) => {
    sentence.ko = String(sentence.ko || '')
      .replace(/\s*,?\s*(?:가까운\s+)?(?:실내\s+)?배경은[^.!?。]*(?:[.!?。]|$)/g, '')
      .trim();
  });

  if (itemId === 'img-ayt6zaj-mrpqyqug') {
    promptJson.background.sentences.forEach((sentence) => {
      if (/poised fashion pose against a clean studio backdrop/i.test(sentence.en)) {
        sentence.en = 'The setting uses a clean studio backdrop.';
      }
    });
  }

  if (itemId === 'img-m30ht5u-mrc77umj') {
    promptJson.background.sentences.forEach((sentence) => {
      if (/Behind her head and the other arm extended forward to take a selfie/i.test(sentence.en)) {
        sentence.en = 'The setting is on a dark seat or sofa in a modern cozy interior with a textured stone wall, a light marble surface, and warm wood furniture.';
      }
    });
    const pose = 'One arm is positioned behind her head while the other extends forward to take a selfie.';
    if (!isAlreadyPresent(promptJson, 'expression_pose', pose)) {
      promptJson.expression_pose.sentences.push({
        id: uniqueSentenceId(promptJson, 'expression_pose-restored-selfie-arms'),
        en: pose,
        ko: '한쪽 팔은 머리 뒤에 두고 다른 쪽 팔은 셀카를 찍기 위해 앞으로 뻗고 있습니다.',
      });
    }
  }

  if (itemId === 'img-j5cuu3s-mrc76qah') {
    promptJson.background.sentences[0].en = 'The setting has a simple neutral gray wall and a partially visible white woven chair, creating a clean minimal interior.';
    promptJson.background.sentences[0].ko = '배경에는 단순하고 중립적인 회색 벽과 옆으로 일부 보이는 흰색 짜임 의자가 있어 깨끗하고 미니멀한 실내 분위기를 조성합니다.';
  }

  if (itemId === 'img-nyeuo2m-mrc64626') {
    promptJson.background.sentences[0].en = 'The setting is against a dark stone or concrete wall in a moody modern interior with dark textured surfaces and a casual nightlife atmosphere.';
    promptJson.background.sentences[0].ko = '배경은 어두운 석재 또는 콘크리트 벽과 짙은 질감의 표면으로 구성된 무드 있는 현대적 실내이며, 캐주얼한 나이트라이프 분위기를 자아냅니다.';
  }

  if (itemId === 'img-7e0mn8j-mrc6wo4x') {
    promptJson.expression_pose.sentences.forEach((sentence) => {
      sentence.ko = String(sentence.ko || '').replace(
        /그녀는 야외 가든 카페의 엮은 고리버들 의자에 앉아 있으며, 주변에는 무성한 초록색 식물들과 나무 울타리가 있고, 옆에는 작은 분홍색 퀼트 핸드백이 놓여 있다\.?/g,
        '그녀는 앉은 자세를 취하고 있습니다.',
      );
    });
  }
}

function removeRedundantSentenceRecords(promptJson) {
  if (!promptJson) return;
  SECTION_KEYS.forEach((sectionKey) => {
    const seen = [];
    const cleaned = [];
    (promptJson[sectionKey]?.sentences || []).forEach((sentence) => {
      const englishParts = splitSentences(sentence.en);
      const koreanParts = splitSentences(sentence.ko);
      if (englishParts.length !== koreanParts.length) {
        cleaned.push(sentence);
        seen.push(normalize(sentence.en));
        return;
      }
      const keptEnglish = [];
      const keptKorean = [];
      englishParts.forEach((englishPart, index) => {
        const candidate = normalize(englishPart);
        const redundant = seen.some((existing) => (
          existing === candidate
          || candidate.startsWith(existing) && existing.length >= 35
        ));
        if (redundant) return;
        keptEnglish.push(sentenceCase(englishPart));
        keptKorean.push(koreanParts[index]);
        seen.push(candidate);
      });
      if (keptEnglish.length) {
        cleaned.push({
          ...sentence,
          en: keptEnglish.join(' '),
          ko: keptKorean.join(' '),
        });
      }
    });
    promptJson[sectionKey].sentences = cleaned;
  });
}

function promptText(promptJson) {
  return SECTION_KEYS
    .map((key) => (promptJson?.[key]?.sentences || []).map((sentence) => sentence.en).filter(Boolean).join('\n').trim())
    .filter(Boolean)
    .join('\n\n\n');
}

function simpleStringHash(value) {
  const text = String(value || '');
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function promptFingerprint(promptJson) {
  const parts = [];
  SECTION_KEYS.forEach((key) => {
    (promptJson?.[key]?.sentences || []).forEach((sentence) => {
      parts.push([
        sentence.id || '',
        String(sentence.en || '').trim(),
        String(sentence.ko || '').trim(),
      ].join('\n'));
    });
  });
  return simpleStringHash(parts.join('\n---\n'));
}

function promptCharacters(items) {
  const totals = Object.fromEntries(SECTION_KEYS.map((key) => [key, 0]));
  items.forEach((item) => {
    SECTION_KEYS.forEach((key) => {
      totals[key] += existingText(item.promptJson, key).length;
    });
  });
  return totals;
}

function auditItems(items) {
  const audit = {
    emptySections: [],
    backgroundPose: [],
    backgroundCamera: [],
    expressionBackground: [],
    koreanBackgroundPose: [],
    koreanBackgroundCamera: [],
    koreanExpressionBackground: [],
  };

  items.forEach((item) => {
    SECTION_KEYS.forEach((key) => {
      const sentences = item.promptJson?.[key]?.sentences || [];
      if (!sentences.length || sentences.some((sentence) => !String(sentence.en || '').trim() || !String(sentence.ko || '').trim())) {
        audit.emptySections.push({ id: item.id, section: key });
      }
    });

    const background = existingText(item.promptJson, 'background');
    const expression = existingText(item.promptJson, 'expression_pose');
    if (splitSentences(background).some((sentence) => POSE_PATTERN.test(sentence))) {
      audit.backgroundPose.push({ id: item.id, text: background });
    }
    if (/\b(?:camera|composition|lens|(?:camera|portrait) framing|subject (?:visually clear|centered|in focus))\b/i.test(background)) {
      audit.backgroundCamera.push({ id: item.id, text: background });
    }
    if (splitSentences(expression).some((sentence) => BACKGROUND_PATTERN.test(sentence) && !POSE_PATTERN.test(sentence))) {
      audit.expressionBackground.push({ id: item.id, text: expression });
    }

    const backgroundKorean = (item.promptJson?.background?.sentences || []).map((sentence) => sentence.ko).join(' ');
    const expressionKorean = (item.promptJson?.expression_pose?.sentences || []).map((sentence) => sentence.ko).join(' ');
    if (/(?:^|[.!?。]\s*)(?:그녀|여성|피사체)(?:는|은|가)?[^.!?。]*(?:서 있|앉|누워|걷|달리|손을|팔을|다리를|무릎을|고개를|시선을|바라|미소|표정)/.test(backgroundKorean)) {
      audit.koreanBackgroundPose.push({ id: item.id, text: backgroundKorean });
    }
    if (/(?:카메라|구도|프레이밍|세로 프레임|렌즈|(?:피사체|인물)[^.!?。]*(?:시각적으로 명확|선명하게|중앙|초점))/.test(backgroundKorean)) {
      audit.koreanBackgroundCamera.push({ id: item.id, text: backgroundKorean });
    }
    if (/(?:배경은|장소는|환경은|실내에는|거리에는|주변에는)/.test(expressionKorean)) {
      audit.koreanExpressionBackground.push({ id: item.id, text: expressionKorean });
    }
  });

  return Object.fromEntries(Object.entries(audit).map(([key, values]) => [key, {
    count: values.length,
    samples: values.slice(0, 3),
  }]));
}

function restoreItems(currentItems, sourceItems) {
  const sourceById = new Map(sourceItems.map((item) => [item.id, item]));
  const stats = {
    items: currentItems.length,
    movedRecords: 0,
    movedEnglishCharacters: 0,
    duplicatesSkipped: 0,
    skippedMissingTranslation: 0,
    skippedMismatchedTranslation: 0,
    missingSourceItems: 0,
    relocatedBackgroundRecords: 0,
    relocatedKoreanBackgroundSentences: 0,
    moves: {},
    samples: {},
  };

  currentItems.forEach((item) => {
    const sourceItem = sourceById.get(item.id);
    if (!sourceItem) {
      stats.missingSourceItems += 1;
      return;
    }

    restorePrompt(item.promptJson, sourceItem.promptJson, stats);
    restorePrompt(item.promptBaselineJson, sourceItem.promptBaselineJson, stats);
    relocateBackgroundContamination(item.promptJson, stats);
    relocateBackgroundContamination(item.promptBaselineJson, stats);
    applyKnownRepairs(item.promptJson, item.id);
    applyKnownRepairs(item.promptBaselineJson, item.id);
    removeRedundantSentenceRecords(item.promptJson);
    removeRedundantSentenceRecords(item.promptBaselineJson);
    item.finalPrompt = promptText(item.promptJson);
    if (item.promptBaselineJson) item.promptBaselineFingerprint = promptFingerprint(item.promptBaselineJson);

    const sourceVersions = new Map((sourceItem.versions || []).map((version) => [version.id, version]));
    (item.versions || []).forEach((version) => {
      const sourceVersion = sourceVersions.get(version.id);
      if (!sourceVersion) return;
      restorePrompt(version.promptJson, sourceVersion.promptJson, stats);
      relocateBackgroundContamination(version.promptJson, stats);
      applyKnownRepairs(version.promptJson, item.id);
      removeRedundantSentenceRecords(version.promptJson);
      version.finalPrompt = promptText(version.promptJson);
    });
  });
  return stats;
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function main() {
  const write = process.argv.includes('--write');
  const currentItems = JSON.parse(fs.readFileSync(ITEMS_PATH, 'utf8'));
  const sourceItems = JSON.parse(fs.readFileSync(SOURCE_BACKUP_PATH, 'utf8'));
  const beforeCharacters = promptCharacters(currentItems);
  const stats = restoreItems(currentItems, sourceItems);
  const afterCharacters = promptCharacters(currentItems);
  const audit = auditItems(currentItems);

  let backupPath = '';
  if (write) {
    backupPath = path.join(ROOT, 'backup', 'items-before-content-restoration-' + timestamp() + '.json');
    fs.copyFileSync(ITEMS_PATH, backupPath);
    fs.writeFileSync(ITEMS_PATH, JSON.stringify(currentItems, null, 2) + '\n', 'utf8');
  }

  process.stdout.write(JSON.stringify({
    mode: write ? 'write' : 'dry-run',
    sourceBackup: SOURCE_BACKUP_PATH,
    backupCreated: backupPath,
    beforeCharacters,
    afterCharacters,
    audit,
    stats,
  }, null, 2) + '\n');
}

module.exports = {
  classifyEnglishSentence,
  cleanPoseEnglish,
  cleanPoseKorean,
  restoreItems,
  splitSentences,
};

if (require.main === module) main();
