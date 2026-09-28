const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CONFIG_PATH = process.env.PHOTOBOOTH_CONFIG || path.join(ROOT, 'config.json');

const DEFAULTS = {
  port: 8080,
  adminPin: '1234',
  // Base URL guests' phones use to reach this booth (leave empty to auto-detect the LAN IP).
  publicBaseUrl: '',
  // Where the QR code on the share screen points: "local" (booth over Wi-Fi) or "remote"
  // (first public URL returned by an uploader, falls back to local while uploading).
  qrTarget: 'local',

  event: {
    title: 'Sarah & Adam',
    subtitle: 'Our Wedding Day',
    date: '',
    hashtag: '#SarahAndAdam',
    greetings: [
      'Wishing you a lifetime of love and happiness!',
      'Congratulations to the happy couple!',
      'So happy to celebrate with you today!',
      'Love, laughter and happily ever after!'
    ]
  },

  booth: {
    camera: 'auto', // "auto" | "dslr" | "webcam"
    countdown: 3,
    mode: 'single', // "single" | "strip" (4 shots)
    template: 'elegant', // "elegant" | "polaroid" | "minimal" | "none"
    accent: '#c9a36b',
    mirrorPreview: true,
    maxLongEdge: 2400, // px of the final composed image
    jpegQuality: 0.9,
    idleSeconds: 90,
    allowGuestGreeting: true,
    allowEmail: true,
    // Phone remote control over Wi-Fi (open /remote on the phone). Empty = use adminPin.
    remotePin: '',
    // Keys that trigger a shot: Bluetooth shutter buttons / presenter clickers / USB arcade buttons.
    triggerKeys: ['Enter', ' ', 'AudioVolumeUp', 'AudioVolumeDown', 'PageDown', 'PageUp', 'ArrowRight', 'F5', 'b']
  },

  dslr: {
    driver: 'auto', // "auto" (gphoto2 on Linux/Pi/macOS, digicam on Windows) | "gphoto2" | "digicam"
    gphoto2: 'gphoto2',
    digicamCmd: 'C:\\Program Files (x86)\\digiCamControl\\CameraControlCmd.exe',
    digicamRemoteCmd: 'C:\\Program Files (x86)\\digiCamControl\\CameraControlRemoteCmd.exe',
    digicamWebUrl: 'http://127.0.0.1:5513',
    livePreview: true,
    captureTimeoutMs: 20000
  },

  // Uploads that run automatically for every photo (guest does nothing).
  autoShare: ['drive', 'ftp', 'wedding'],

  share: {
    email: {
      enabled: false,
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      user: '',
      pass: '',
      from: '',
      subject: 'Your photo from {title}',
      body: 'Thanks for celebrating with us!\n\n{greeting}\n\nDownload: {url}'
    },
    drive: {
      enabled: false,
      folderId: '',
      makePublic: true,
      // Option A: OAuth client + refresh token (works with a normal Google account)
      clientId: '',
      clientSecret: '',
      refreshToken: '',
      // Option B: service account JSON (use a Shared Drive folder)
      serviceAccountJson: ''
    },
    ftp: {
      enabled: false,
      host: '',
      port: 21,
      user: '',
      password: '',
      secure: false,
      remoteDir: '/public_html/photobooth',
      publicUrlPrefix: 'https://example.com/photobooth'
    },
    wedding: {
      // Generic HTTP upload for any digital wedding platform / guestbook / own API.
      enabled: false,
      name: 'Digital Wedding',
      url: '',
      method: 'POST',
      fileField: 'photo',
      headers: { Authorization: 'Bearer YOUR_TOKEN' },
      fields: { eventId: '', greeting: '{greeting}', guest: '{guest}', caption: '{caption}' },
      urlPath: 'url' // dot path in JSON response that contains the public photo URL
    },
    facebook: {
      enabled: false,
      pageId: '',
      pageAccessToken: '',
      graphVersion: 'v21.0'
    },
    instagram: {
      // Needs a public image URL, so enable ftp / wedding / drive (public) too.
      enabled: false,
      igUserId: '',
      accessToken: '',
      graphVersion: 'v21.0'
    },
    telegram: {
      enabled: false,
      botToken: '',
      chatId: ''
    }
  },

  // Caption template used for social posts & uploads.
  caption: '{greeting}\n— {guest}\n{hashtag}'
};

function isObj(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

function deepMerge(base, over) {
  if (!isObj(over)) return base;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) {
    out[k] = isObj(v) && isObj(base[k]) ? deepMerge(base[k], v) : v;
  }
  return out;
}

let current = null;

function load() {
  let user = {};
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      user = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch (e) {
      console.error(`[config] cannot parse ${CONFIG_PATH}: ${e.message} — using defaults`);
    }
  }
  current = deepMerge(DEFAULTS, user);
  return current;
}

function get() {
  return current || load();
}

function save(next) {
  current = deepMerge(DEFAULTS, next);
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(current, null, 2));
  return current;
}

// Config safe to hand to the kiosk browser (no secrets).
function publicView() {
  const c = get();
  const enabled = Object.fromEntries(
    Object.entries(c.share).map(([k, v]) => [k, !!v.enabled])
  );
  return { event: c.event, booth: { ...c.booth, remotePin: undefined }, weddingName: c.share.wedding.name, dslr: { livePreview: c.dslr.livePreview }, share: enabled };
}

module.exports = { load, get, save, publicView, DEFAULTS, ROOT, CONFIG_PATH };
