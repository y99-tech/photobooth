// Post to a Facebook Page (Graph API). Needs a Page access token with pages_manage_posts.
const { fileBlob, fileName, json, need } = require('./http');

async function send({ file, cfg, vars }) {
  need(cfg, ['pageId', 'pageAccessToken'], 'Facebook');
  const form = new FormData();
  form.append('source', fileBlob(file), fileName(file));
  form.append('message', vars.caption);
  form.append('access_token', cfg.pageAccessToken);
  const res = await fetch(`https://graph.facebook.com/${cfg.graphVersion}/${cfg.pageId}/photos`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(60000)
  });
  const body = await json(res, 'Facebook');
  return { postId: body.post_id || body.id, url: body.post_id ? `https://facebook.com/${body.post_id}` : null };
}

async function test(cfg) {
  need(cfg, ['pageId', 'pageAccessToken'], 'Facebook');
  const res = await fetch(
    `https://graph.facebook.com/${cfg.graphVersion}/${cfg.pageId}?fields=name&access_token=${encodeURIComponent(cfg.pageAccessToken)}`
  );
  const body = await json(res, 'Facebook');
  return { ok: true, message: `Connected to page "${body.name}"` };
}

module.exports = { send, test };
