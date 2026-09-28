// Publish to an Instagram Business/Creator account via the Graph API.
// Instagram fetches the image from a public URL, so a hosting target (FTP / wedding / Drive) must be on.
const { json, need } = require('./http');
const share = () => require('./index');

async function send({ photo, cfg, vars }) {
  need(cfg, ['igUserId', 'accessToken'], 'Instagram');
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
    await fetch(`${api}/media?image_url=${encodeURIComponent(imageUrl)}&caption=${encodeURIComponent(vars.caption)}&access_token=${token}`, { method: 'POST' }),
    'Instagram (create)'
  );
  // Wait until Instagram has processed the container.
  for (let i = 0; i < 20; i++) {
    const st = await json(
      await fetch(`https://graph.facebook.com/${cfg.graphVersion}/${created.id}?fields=status_code&access_token=${token}`),
      'Instagram (status)'
    );
    if (st.status_code === 'FINISHED') break;
    if (st.status_code === 'ERROR') throw new Error('Instagram could not process the image');
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
