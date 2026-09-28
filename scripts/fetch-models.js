#!/usr/bin/env node
// Downloads the offline AI models once (AI background removal, gesture & smile triggers).
// Runs automatically after `npm install`; safe to re-run. The booth works without them —
// the AI features just stay unavailable until the models are present.
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'models');
const BASE = 'https://storage.googleapis.com/mediapipe-models';
const MODELS = {
  'selfie_segmenter.tflite': `${BASE}/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite`,
  'gesture_recognizer.task': `${BASE}/gesture_recognizer/gesture_recognizer/float16/latest/gesture_recognizer.task`,
  'face_landmarker.task': `${BASE}/face_landmarker/face_landmarker/float16/latest/face_landmarker.task`
};

(async () => {
  fs.mkdirSync(DIR, { recursive: true });
  let failed = 0;
  for (const [name, url] of Object.entries(MODELS)) {
    const dest = path.join(DIR, name);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) continue;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(120000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      fs.writeFileSync(dest + '.part', Buffer.from(await res.arrayBuffer()));
      fs.renameSync(dest + '.part', dest);
      console.log(`[models] ✓ ${name}`);
    } catch (e) {
      failed++;
      console.warn(`[models] could not download ${name} (${e.message}) — AI features need internet once; run: node scripts/fetch-models.js`);
    }
  }
  if (process.argv.includes('--strict') && failed) process.exit(1);
})();
