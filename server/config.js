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
    mode: 'single', // default mode: "single" | "strip" | "gif" | "boomerang"
    modes: ['single', 'strip', 'gif', 'boomerang'], // modes guests can pick
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

  greenScreen: {
    enabled: false,
    keyColor: 'auto', // "auto" (sampled from the top corners) or a colour like "#00b140" (green) / "#0047bb" (blue)
    similarity: 0.4, // 0–1: how much of the screen colour is removed (raise if green is left behind)
    smoothness: 0.1, // 0–1: soft edge width (raise for smoother hair edges)
    spill: 0.3, // 0–1: removes green reflections on skin / clothes
    defaultBackground: 'builtin:gold', // a built-in id or an uploaded background id
    allowGuestChoice: true, // guests pick the background on the review screen
    livePreview: true // show the replaced background live while posing
  },

  animation: {
    size: 720, // long edge (px) of GIFs and boomerang videos
    gifFrames: 4, // poses in GIF mode
    gifFrameMs: 600, // how long each GIF pose shows
    boomerangSeconds: 1.5, // length of the recorded burst
    boomerangFps: 15,
    boomerangFormat: 'video', // "video" (MP4/WebM, small & sharp) | "gif"
    videoLoops: 2 // back-and-forth loops in the saved video (recording takes this long; players loop it anyway)
  },

  video: {
    ffmpeg: 'ffmpeg', // path to ffmpeg (optional)
    convertToMp4: true // convert WebM recordings to H.264 MP4 when ffmpeg is installed
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

  print: {
    enabled: false,
    printer: '', // empty = system default printer
    auto: false, // print every photo automatically (copies = autoCopies)
    autoCopies: 1,
    maxCopies: 2, // most copies a guest can pick per photo
    maxPrintsPerPhoto: 4, // guard against guests printing the same photo again and again
    scaling: 'fill', // "fill" (edge to edge, crops a little) | "fit" (whole photo, may leave borders)
    media: '', // CUPS paper size, e.g. "4x6", "w288h432", "A6", "Postcard" (empty = printer default)
    borderless: false, // CUPS: ask gutenprint / DNP drivers for borderless output
    marginMm: 0, // Windows: white border around the photo
    extraOptions: [] // CUPS: extra "-o" options, one per line
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
  return { event: c.event, booth: { ...c.booth, remotePin: undefined }, weddingName: c.share.wedding.name, dslr: { livePreview: c.dslr.livePreview }, share: enabled,
    print: { enabled: !!c.print.enabled, auto: !!c.print.auto, maxCopies: c.print.maxCopies },
    animation: c.animation, greenScreen: c.greenScreen };
}

module.exports = { load, get, save, publicView, DEFAULTS, ROOT, CONFIG_PATH };
