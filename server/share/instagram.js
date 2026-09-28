// Publish to an Instagram Business/Creator account via the Graph API.
// Instagram fetches the image from a public URL, so a hosting target (FTP / wedding / Drive) must be on.
const { json, need } = require('./http');
const share = () => require('./index');

async function send({ photo, file, cfg, vars }) {
  need(cfg, ['igUserId', 'accessToken'], 'Instagram');
  if (/\.gif$/i.test(file)) {
    const e = new Error('Instagram does not accept GIFs — use boomerang video mode for Instagram');
    e.permanent = true;
    throw e;
  }
  if (/\.webm$/i.test(file)) {
    const e = new Error('Instagram needs MP4 video — install ffmpeg on the booth so boomerangs are saved as MP4');
    e.permanent = true;
    throw e;
  }
  const isVideo = /\.mp4$/i.test(file);
  let imageUrl = share().publicUrl(require('../store').get(photo.id));
  if (!imageUrl) {
    const e = new Error('Instagram needs a public image URL — enable FTP hosting, the wedding platform, or public Google Drive');
    e.permanent = true;
    throw e;
  }
  // Drive "view" links are HTML pages; Instagram needs the raw file.
  const m = imageUrl.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (m) imageUrl = `https://drive.google.com/uc?export=download&id=${m[1]}`;

  const api = `https://graph.facebook.com/${cfg.graphVersion}/${cfg.igUserId}`;
  const token = encodeURIComponent(cfg.accessToken);
  const created = await json(
    // Boomerang videos are published as Reels.
    await fetch(`${api}/media?${isVideo ? `media_type=REELS&video_url=` : 'image_url='}${encodeURIComponent(imageUrl)}&caption=${encodeURIComponent(vars.caption)}&access_token=${token}`, { method: 'POST' }),
    'Instagram (create)'
  );
  // Wait until Instagram has processed the container.
  for (let i = 0; i < (isVideo ? 60 : 20); i++) {
    const st = await json(
      await fetch(`https://graph.facebook.com/${cfg.graphVersion}/${created.id}?fields=status_code&access_token=${token}`),
      'Instagram (status)'
    );
    if (st.status_code === 'FINISHED') break;
    if (st.status_code === 'ERROR') throw new Error(`Instagram could not process the ${isVideo ? 'video' : 'image'}`);
    await new Promise((r) => setTimeout(r, 2000));
  }
  const pub = await json(
    await fetch(`${api}/media_publish?creation_id=${created.id}&access_token=${token}`, { method: 'POST' }),
    'Instagram (publish)'
  );
  return { postId: pub.id };
}

async function test(cfg) {
  need(cfg, ['igUserId', 'accessToken'], 'Instagram');
  const body = await json(
    await fetch(`https://graph.facebook.com/${cfg.graphVersion}/${cfg.igUserId}?fields=username&access_token=${encodeURIComponent(cfg.accessToken)}`),
    'Instagram'
  );
  return { ok: true, message: `Connected to @${body.username}` };
}

module.exports = { send, test };
