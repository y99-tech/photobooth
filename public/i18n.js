// Guest-facing languages. Arabic switches the whole layout to right-to-left.
// Add a language by copying the "en" block. Admin pages stay in English.
(function (global) {
  const STR = {
    en: {
      tapToStart: 'TAP TO<br>START', single: '📷 Single', strip: '🎞️ 4-shot', gif: '✨ GIF', boomerang: '🔁 Boomerang', message: '🎥 Message',
      galleryHint: 'Scan on the venue Wi-Fi to see & download all photos', uploadHint: 'Add your own photos',
      photoOf: 'Photo {i} of {n}', poseOf: 'Pose {i} of {n}', lookAtCamera: '👀 Look at the camera!',
      boomReady: '🔁 Boomerang — get ready to move!', boomMove: '🔴 Move! Wave, jump, cheers!',
      msgReady: '🎥 Get ready to record your message!', msgRec: '🔴 Recording — {s}s left', msgStop: 'Stop ■',
      removingBg: 'Removing the background…', aiUnavailable: 'AI background removal is not available on this device',
      background: 'Background 🌄', frame: 'Frame', elegant: 'Elegant', polaroid: 'Polaroid', minimal: 'Minimal', none: 'No frame',
      beauty: '✨ Beauty', stickers: 'Stickers 🎉', addGreeting: 'Add a greeting 💌', greetingPh: '…or write your own wishes', namePh: 'Your name(s)',
      retake: '↺ Retake', accept: 'Looks great ✓', makingBoomerang: '⏳ Making your boomerang…', makingGif: '⏳ Making your GIF…', savingVideo: '⏳ Saving your message…',
      scanToDownload: 'Scan to download 📲', connectWifi: 'Connect to the venue Wi-Fi, then scan', printIt: 'Print it 🖨️', print: '🖨️ Print', printAnother: '🖨️ Print another',
      printing: '🖨️ Printing {n}…', waitingPrinter: '🖨️ Waiting for the printer…', printingCollect: '🖨️ Printing… collect your photo at the printer',
      printSent: '✅ Sent to the printer — collect it in a moment!', printFailed: '⚠️ Print failed: ', emailIt: 'Or email it to me', send: 'Send',
      offers: 'Send me news & offers from {business}', postIt: 'Post it', done: 'Done ✓', emailSent: '📧 On its way to {to}', postingTo: 'Posting to {x}…',
      couldNotSave: '⚠️ Could not save: ', handsFreeHint: '{icons} to start · 👍 to accept', thanksMessage: '💌 Thank you! Your message was saved for the couple.',
      // guest phone pages
      yourPhoto: 'Your photo', savePhoto: '⬇ Save photo', saveGif: '⬇ Save GIF', saveVideo: '⬇ Save video', share: '📤 Share…',
      iphoneHint: 'On iPhone: tap “Share…” → “Save Image”, or long-press the photo.', iphoneVideo: 'On iPhone: tap “Share…” → “Save Video”.',
      morePhotos: 'More photos', viewGallery: 'View the whole gallery →', notFound: 'Photo not found.',
      gallery: 'Gallery', galleryTap: 'Tap a photo to download or share it · updates live', loadMore: 'Load more', photos: '{n} photos', scanAll: 'Scan for all photos',
      uploadTitle: 'Share your photos', uploadIntro: 'Add the photos & videos you took today — they go straight into the couple’s album.',
      choose: '📷 Choose photos / videos', uploadBtn: '⬆ Upload', uploading: 'Uploading {i} of {n}…', uploaded: '🎉 Thank you! {n} uploaded.', uploadFailed: 'Upload failed: ',
      yourName: 'Your name (optional)', yourMsg: 'A message for the couple (optional)', pendingReview: 'They will appear after the hosts approve them.',
      greetings: ['Wishing you a lifetime of love and happiness!', 'Congratulations to the happy couple!', 'So happy to celebrate with you today!', 'Love, laughter and happily ever after!']
    },
    ar: {
      tapToStart: 'المس<br>للبدء', single: '📷 صورة', strip: '🎞️ ٤ لقطات', gif: '✨ متحركة', boomerang: '🔁 بوميرانج', message: '🎥 رسالة',
      galleryHint: 'امسح الرمز على شبكة الواي فاي لمشاهدة وتحميل كل الصور', uploadHint: 'أضف صورك',
      photoOf: 'الصورة {i} من {n}', poseOf: 'الوضعية {i} من {n}', lookAtCamera: '👀 انظر إلى الكاميرا!',
      boomReady: '🔁 بوميرانج — استعدوا للحركة!', boomMove: '🔴 تحركوا! لوّحوا، اقفزوا، احتفلوا!',
      msgReady: '🎥 استعد لتسجيل رسالتك!', msgRec: '🔴 جارٍ التسجيل — متبقٍ {s} ث', msgStop: 'إيقاف ■',
      removingBg: 'جارٍ إزالة الخلفية…', aiUnavailable: 'إزالة الخلفية بالذكاء الاصطناعي غير متاحة على هذا الجهاز',
      background: 'الخلفية 🌄', frame: 'الإطار', elegant: 'أنيق', polaroid: 'بولارويد', minimal: 'بسيط', none: 'بدون إطار',
      beauty: '✨ تجميل', stickers: 'ملصقات 🎉', addGreeting: 'أضف تهنئة 💌', greetingPh: '…أو اكتب تهنئتك', namePh: 'اسمك',
      retake: '↺ إعادة', accept: 'رائعة ✓', makingBoomerang: '⏳ جارٍ تجهيز البوميرانج…', makingGif: '⏳ جارٍ تجهيز الصورة المتحركة…', savingVideo: '⏳ جارٍ حفظ رسالتك…',
      scanToDownload: 'امسح للتحميل 📲', connectWifi: 'اتصل بشبكة الواي فاي ثم امسح الرمز', printIt: 'اطبعها 🖨️', print: '🖨️ طباعة', printAnother: '🖨️ طباعة نسخة أخرى',
      printing: '🖨️ جارٍ طباعة {n}…', waitingPrinter: '🖨️ في انتظار الطابعة…', printingCollect: '🖨️ جارٍ الطباعة… استلم صورتك من الطابعة',
      printSent: '✅ أُرسلت للطابعة — استلمها بعد لحظات!', printFailed: '⚠️ فشلت الطباعة: ', emailIt: 'أو أرسلها إلى بريدي', send: 'إرسال',
      offers: 'أرسلوا لي عروض وأخبار {business}', postIt: 'انشرها', done: 'تم ✓', emailSent: '📧 في الطريق إلى {to}', postingTo: 'جارٍ النشر على {x}…',
      couldNotSave: '⚠️ تعذّر الحفظ: ', handsFreeHint: '{icons} للبدء · 👍 للموافقة', thanksMessage: '💌 شكرًا! حُفظت رسالتك للعروسين.',
      yourPhoto: 'صورتك', savePhoto: '⬇ حفظ الصورة', saveGif: '⬇ حفظ الصورة المتحركة', saveVideo: '⬇ حفظ الفيديو', share: '📤 مشاركة…',
      iphoneHint: 'على الآيفون: اضغط «مشاركة…» ثم «حفظ الصورة»، أو اضغط مطولًا على الصورة.', iphoneVideo: 'على الآيفون: اضغط «مشاركة…» ثم «حفظ الفيديو».',
      morePhotos: 'صور أخرى', viewGallery: '← شاهد كل الصور', notFound: 'الصورة غير موجودة.',
      gallery: 'المعرض', galleryTap: 'اضغط على صورة لتحميلها أو مشاركتها · يتحدث مباشرة', loadMore: 'المزيد', photos: '{n} صورة', scanAll: 'امسح لكل الصور',
      uploadTitle: 'شارك صورك', uploadIntro: 'أضف الصور والفيديوهات التي التقطتها اليوم — تذهب مباشرة إلى ألبوم العروسين.',
      choose: '📷 اختر صورًا / فيديوهات', uploadBtn: '⬆ رفع', uploading: 'جارٍ رفع {i} من {n}…', uploaded: '🎉 شكرًا! تم رفع {n}.', uploadFailed: 'فشل الرفع: ',
      yourName: 'اسمك (اختياري)', yourMsg: 'رسالة للعروسين (اختياري)', pendingReview: 'ستظهر بعد موافقة المضيفين.',
      greetings: ['ألف مبروك وبالرفاء والبنين!', 'بارك الله لكما وبارك عليكما وجمع بينكما في خير', 'نتمنى لكما حياة مليئة بالحب والسعادة', 'مبروك للعروسين الجميلين!']
    },
    fr: {
      tapToStart: 'TOUCHEZ<br>POUR COMMENCER', single: '📷 Photo', strip: '🎞️ 4 photos', gif: '✨ GIF', boomerang: '🔁 Boomerang', message: '🎥 Message',
      galleryHint: 'Scannez sur le Wi-Fi pour voir et télécharger toutes les photos', uploadHint: 'Ajoutez vos photos',
      photoOf: 'Photo {i} sur {n}', poseOf: 'Pose {i} sur {n}', lookAtCamera: '👀 Regardez l’appareil !',
      boomReady: '🔁 Boomerang — préparez-vous à bouger !', boomMove: '🔴 Bougez ! Saluez, sautez, trinquez !',
      msgReady: '🎥 Préparez votre message !', msgRec: '🔴 Enregistrement — {s}s', msgStop: 'Stop ■',
      removingBg: 'Suppression de l’arrière-plan…', aiUnavailable: 'La suppression d’arrière-plan par IA n’est pas disponible',
      background: 'Arrière-plan 🌄', frame: 'Cadre', elegant: 'Élégant', polaroid: 'Polaroid', minimal: 'Minimal', none: 'Sans cadre',
      beauty: '✨ Beauté', stickers: 'Autocollants 🎉', addGreeting: 'Ajoutez un mot 💌', greetingPh: '…ou écrivez vos vœux', namePh: 'Vos prénoms',
      retake: '↺ Refaire', accept: 'Parfait ✓', makingBoomerang: '⏳ Création du boomerang…', makingGif: '⏳ Création du GIF…', savingVideo: '⏳ Enregistrement…',
      scanToDownload: 'Scannez pour télécharger 📲', connectWifi: 'Connectez-vous au Wi-Fi puis scannez', printIt: 'Imprimer 🖨️', print: '🖨️ Imprimer', printAnother: '🖨️ Encore une',
      printing: '🖨️ Impression de {n}…', waitingPrinter: '🖨️ En attente de l’imprimante…', printingCollect: '🖨️ Impression… récupérez votre photo',
      printSent: '✅ Envoyé à l’imprimante !', printFailed: '⚠️ Échec de l’impression : ', emailIt: 'Ou recevez-la par e-mail', send: 'Envoyer',
      offers: 'Recevoir les offres de {business}', postIt: 'Publier', done: 'Terminé ✓', emailSent: '📧 Envoyé à {to}', postingTo: 'Publication sur {x}…',
      couldNotSave: '⚠️ Enregistrement impossible : ', handsFreeHint: '{icons} pour commencer · 👍 pour valider', thanksMessage: '💌 Merci ! Votre message a été enregistré.',
      yourPhoto: 'Votre photo', savePhoto: '⬇ Enregistrer', saveGif: '⬇ Enregistrer le GIF', saveVideo: '⬇ Enregistrer la vidéo', share: '📤 Partager…',
      iphoneHint: 'Sur iPhone : « Partager… » → « Enregistrer l’image ».', iphoneVideo: 'Sur iPhone : « Partager… » → « Enregistrer la vidéo ».',
      morePhotos: 'Plus de photos', viewGallery: 'Voir toute la galerie →', notFound: 'Photo introuvable.',
      gallery: 'Galerie', galleryTap: 'Touchez une photo pour la télécharger · en direct', loadMore: 'Plus', photos: '{n} photos', scanAll: 'Scannez pour toutes les photos',
      uploadTitle: 'Partagez vos photos', uploadIntro: 'Ajoutez vos photos et vidéos du jour — elles rejoignent l’album des mariés.',
      choose: '📷 Choisir photos / vidéos', uploadBtn: '⬆ Envoyer', uploading: 'Envoi {i} sur {n}…', uploaded: '🎉 Merci ! {n} envoyé(s).', uploadFailed: 'Échec : ',
      yourName: 'Votre nom (facultatif)', yourMsg: 'Un mot pour les mariés (facultatif)', pendingReview: 'Visible après validation par les hôtes.',
      greetings: ['Tous nos vœux de bonheur !', 'Félicitations aux jeunes mariés !', 'Quelle joie de fêter ce jour avec vous !', 'Amour, rires et bonheur pour toujours !']
    },
    es: {
      tapToStart: 'TOCA<br>PARA EMPEZAR', single: '📷 Foto', strip: '🎞️ 4 fotos', gif: '✨ GIF', boomerang: '🔁 Boomerang', message: '🎥 Mensaje',
      galleryHint: 'Escanea en el Wi-Fi para ver y descargar todas las fotos', uploadHint: 'Sube tus fotos',
      photoOf: 'Foto {i} de {n}', poseOf: 'Pose {i} de {n}', lookAtCamera: '👀 ¡Mira a la cámara!',
      boomReady: '🔁 Boomerang — ¡prepárate para moverte!', boomMove: '🔴 ¡Muévete! ¡Saluda, salta, brinda!',
      msgReady: '🎥 ¡Prepárate para grabar tu mensaje!', msgRec: '🔴 Grabando — {s}s', msgStop: 'Parar ■',
      removingBg: 'Quitando el fondo…', aiUnavailable: 'La eliminación de fondo con IA no está disponible',
      background: 'Fondo 🌄', frame: 'Marco', elegant: 'Elegante', polaroid: 'Polaroid', minimal: 'Minimal', none: 'Sin marco',
      beauty: '✨ Belleza', stickers: 'Stickers 🎉', addGreeting: 'Añade un saludo 💌', greetingPh: '…o escribe tus deseos', namePh: 'Tu(s) nombre(s)',
      retake: '↺ Repetir', accept: '¡Perfecta! ✓', makingBoomerang: '⏳ Creando tu boomerang…', makingGif: '⏳ Creando tu GIF…', savingVideo: '⏳ Guardando tu mensaje…',
      scanToDownload: 'Escanea para descargar 📲', connectWifi: 'Conéctate al Wi-Fi y escanea', printIt: 'Imprímela 🖨️', print: '🖨️ Imprimir', printAnother: '🖨️ Otra copia',
      printing: '🖨️ Imprimiendo {n}…', waitingPrinter: '🖨️ Esperando la impresora…', printingCollect: '🖨️ Imprimiendo… recoge tu foto',
      printSent: '✅ ¡Enviada a la impresora!', printFailed: '⚠️ Error al imprimir: ', emailIt: 'O envíala a mi correo', send: 'Enviar',
      offers: 'Quiero recibir ofertas de {business}', postIt: 'Publicar', done: 'Listo ✓', emailSent: '📧 Enviada a {to}', postingTo: 'Publicando en {x}…',
      couldNotSave: '⚠️ No se pudo guardar: ', handsFreeHint: '{icons} para empezar · 👍 para aceptar', thanksMessage: '💌 ¡Gracias! Tu mensaje se guardó para los novios.',
      yourPhoto: 'Tu foto', savePhoto: '⬇ Guardar foto', saveGif: '⬇ Guardar GIF', saveVideo: '⬇ Guardar vídeo', share: '📤 Compartir…',
      iphoneHint: 'En iPhone: «Compartir…» → «Guardar imagen».', iphoneVideo: 'En iPhone: «Compartir…» → «Guardar vídeo».',
      morePhotos: 'Más fotos', viewGallery: 'Ver toda la galería →', notFound: 'Foto no encontrada.',
      gallery: 'Galería', galleryTap: 'Toca una foto para descargarla · en vivo', loadMore: 'Ver más', photos: '{n} fotos', scanAll: 'Escanea para todas las fotos',
      uploadTitle: 'Comparte tus fotos', uploadIntro: 'Sube las fotos y vídeos de hoy — van directo al álbum de los novios.',
      choose: '📷 Elegir fotos / vídeos', uploadBtn: '⬆ Subir', uploading: 'Subiendo {i} de {n}…', uploaded: '🎉 ¡Gracias! {n} subidas.', uploadFailed: 'Error: ',
      yourName: 'Tu nombre (opcional)', yourMsg: 'Un mensaje para los novios (opcional)', pendingReview: 'Aparecerán cuando los anfitriones las aprueben.',
      greetings: ['¡Les deseamos una vida llena de amor y felicidad!', '¡Felicidades a los novios!', '¡Qué alegría celebrar con ustedes!', '¡Amor, risas y felices para siempre!']
    }
  };
  const NAMES = { en: 'English', ar: 'العربية', fr: 'Français', es: 'Español' };
  const RTL_LANGS = ['ar', 'he', 'fa', 'ur'];
  let lang = 'en';

  function set(l) {
    lang = STR[l] ? l : 'en';
    document.documentElement.lang = lang;
    document.documentElement.dir = RTL_LANGS.includes(lang) ? 'rtl' : 'ltr';
    apply(document);
    return lang;
  }

  function t(key, vars) {
    let s = (STR[lang] && STR[lang][key]) ?? STR.en[key] ?? key;
    if (vars && typeof s === 'string') s = s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
    return s;
  }

  // <x data-i18n="key">, <input data-i18n-ph="key">, <x data-i18n-html="key">
  function apply(root) {
    root.querySelectorAll('[data-i18n]').forEach((el) => (el.textContent = t(el.dataset.i18n)));
    root.querySelectorAll('[data-i18n-html]').forEach((el) => (el.innerHTML = t(el.dataset.i18nHtml)));
    root.querySelectorAll('[data-i18n-ph]').forEach((el) => (el.placeholder = t(el.dataset.i18nPh)));
  }

  // Pick a language for a guest's phone: their phone language if the booth offers it.
  function pick(allowed, fallback) {
    const want = (navigator.language || '').slice(0, 2).toLowerCase();
    return (allowed || []).includes(want) ? want : fallback || 'en';
  }

  global.I18n = { defaultGreetings: () => STR.en.greetings, set, t, apply, pick, get: () => lang, NAMES, LANGS: Object.keys(STR), isRtl: () => RTL_LANGS.includes(lang) };
})(window);
