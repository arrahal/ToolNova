import { AppLanguage } from '../data/translations';

export interface VideoAiTranslations {
  // Shared / Modal / File Upload
  closeWorkspaceAria: string;
  localPrivacyNote: string;
  uploadVideoBtn: string;
  changeVideoBtn: string;
  uploadMediaBtn: string;
  changeMediaBtn: string;
  dropVideoPromptTitle: string;
  dropVideoPromptDesc: string;
  dropMediaPromptTitle: string;
  dropMediaPromptDesc: string;
  maxSizeLimitLabel: string;
  fileTooLargeError: (actualMB: string, maxMB: number) => string;
  invalidMediaError: string;
  ffmpegLoadStage: string;
  processingStage: string;
  extractingAudioStage: string;
  transcribingStage: string;
  detectingLanguageStage: string;
  etaLabel: (seconds: string) => string;
  etaCalculating: string;
  cancelBtn: string;
  cancelledNotice: string;
  downloadResultBtn: string;
  clearFileBtn: string;
  sourceFileLabel: string;
  durationLabel: string;
  dimensionsLabel: string;
  inputSizeLabel: string;
  outputSizeLabel: string;
  savedPercentageLabel: (pct: string) => string;
  sizeIncreasedNotice: (pct: string) => string;
  previewInputTab: string;
  previewOutputTab: string;

  // 1. Video Compressor
  resolutionLabel: string;
  resolutionOriginal: string;
  crfLabel: string;
  crfHintHighQuality: string;
  crfHintBalanced: string;
  crfHintMaxCompression: string;
  audioBitrateLabel: string;
  audioMuteOption: string;
  estimatedTargetSizeLabel: string;
  estimatedSavingsLabel: (pct: string) => string;
  maxLimitConfigLabel: string;
  compressActionBtn: string;
  compressingBtn: string;
  downloadMp4Btn: string;
  compressionSuccessSummary: (outSize: string, savedPct: string) => string;
  compressionFailedError: string;

  // 2. Video to GIF
  trimRangeLabel: string;
  trimStartLabel: string;
  trimEndLabel: string;
  setStartFromPlayheadBtn: string;
  setEndFromPlayheadBtn: string;
  selectedClipDurationLabel: (sec: string) => string;
  gifFpsLabel: string;
  gifWidthLabel: string;
  gifWidthOriginal: string;
  preservedAspectLabel: (w: number, h: number) => string;
  gifLoopLabel: string;
  gifLoopInfinite: string;
  gifLoopOnce: string;
  gifLoopThreeTimes: string;
  paletteNotice: string;
  gifLargeEstimateWarning: (estMB: string) => string;
  gifOver15MbWarning: (actualMB: string) => string;
  convertGifActionBtn: string;
  convertingGifBtn: string;
  downloadGifBtn: string;
  gifSuccessSummary: (w: number, h: number, sizeStr: string) => string;
  gifFailedError: string;

  // 3. Speech to Text
  modeFileTab: string;
  modeMicTab: string;
  whisperModelLabel: string;
  whisperTinyLabel: string;
  whisperBaseLabel: string;
  whisperLanguageLabel: string;
  langAutoDetect: string;
  langArabic: string;
  langFrench: string;
  langEnglish: string;
  langSpanish: string;
  detectedLanguageLabel: (code: string) => string;
  backendBadgeWebGpu: string;
  backendBadgeWasm: string;
  modelDownloadLabel: string;
  modelCachedReadyNotice: string;
  modelLoadedFromCacheNotice: string;
  startTranscriptionBtn: string;
  transcribingInProgressBtn: string;
  micStartBtn: string;
  micStopBtn: string;
  micUnsupportedTitle: string;
  micUnsupportedDesc: string;
  micPermissionError: string;
  micListeningStatus: string;
  emptyTranscriptFileHint: string;
  emptyTranscriptMicHint: string;
  segmentsCountLabel: (count: number) => string;
  addSegmentBtn: string;
  deleteSegmentAria: string;
  seekToSegmentAria: (timeStr: string) => string;
  segmentTextPlaceholder: string;
  speakerDefaultFile: string;
  speakerDefaultMic: string;
  exportSectionLabel: string;
  noSegmentsToExportError: string;
  transcriptionFailedError: string;
  transcriptTitleDoc: string;
}

export const VIDEO_AI_STRINGS: Record<AppLanguage, VideoAiTranslations> = {
  ar: {
    closeWorkspaceAria: 'إغلاق نافذة الأداة',
    localPrivacyNote: 'تتم المعالجة بالكامل داخل متصفحك دون رفع أي ملف إلى أي خادم خارجي.',
    uploadVideoBtn: 'رفع ملف فيديو',
    changeVideoBtn: 'تغيير الفيديو',
    uploadMediaBtn: 'رفع ملف صوت أو فيديو',
    changeMediaBtn: 'تغيير الملف',
    dropVideoPromptTitle: 'اختر أو اسحب ملف فيديو هنا للبدء',
    dropVideoPromptDesc: 'يدعم الصيغ MP4 وWebM وMOV محلياً عبر محرك FFmpeg.wasm مباشرة في المتصفح.',
    dropMediaPromptTitle: 'ارفع ملف صوت أو فيديو لتفريغه نصياً',
    dropMediaPromptDesc: 'يدعم MP3 وWAV وM4A وOGG وMP4 وWebM وMOV مع استخراج الصوت بتردد 16 كيلوهرتز وتفريغه بنموذج Whisper.',
    maxSizeLimitLabel: 'الحد الأقصى لحجم الملف',
    fileTooLargeError: (actualMB, maxMB) =>
      `حجم الملف المحدد (${actualMB} ميجابايت) يتجاوز الحد الأقصى المسموح به (${maxMB} ميجابايت). يرجى اختيار ملف أصغر أو رفع الحد الأقصى.`,
    invalidMediaError: 'تعذر قراءة بيانات هذا الملف. يرجى التأكد من أن الملف الصوتي أو المرئي سليم ومدعوم.',
    ffmpegLoadStage: 'جاري تهيئة محرك FFmpeg.wasm المحلي...',
    processingStage: 'جاري معالجة الإطارات وترميز الملف...',
    extractingAudioStage: 'جاري استخراج المسار الصوتي بتردد 16 كيلوهرتز أحادي القناة...',
    transcribingStage: 'جاري التفريغ النصي وحساب التوقيتات الزمنية عبر Whisper...',
    detectingLanguageStage: 'جاري التعرف التلقائي على لغة المتحدث...',
    etaLabel: (seconds) => `الوقت المتبقي التقريبي: ${seconds}`,
    etaCalculating: 'جاري حساب الوقت المتبقي...',
    cancelBtn: 'إلغاء العملية',
    cancelledNotice: 'تم إيقاف العملية وإلغاؤها فوراً بناءً على طلبك.',
    downloadResultBtn: 'تنزيل الملف الناتج',
    clearFileBtn: 'إزالة الملف',
    sourceFileLabel: 'الملف الأصلي',
    durationLabel: 'المدة',
    dimensionsLabel: 'الأبعاد',
    inputSizeLabel: 'الحجم الأصلي',
    outputSizeLabel: 'الحجم بعد المعالجة',
    savedPercentageLabel: (pct) => `وفّرت ${pct}%`,
    sizeIncreasedNotice: (pct) => `زاد الحجم بنسبة ${pct}% (جرّب رفع قيمة CRF لتقليل الحجم)`,
    previewInputTab: 'معاينة الأصل',
    previewOutputTab: 'معاينة النتيجة',

    resolutionLabel: 'دقة الفيديو المستهدفة',
    resolutionOriginal: 'الأصلية',
    crfLabel: 'معامل الجودة والضغط (CRF)',
    crfHintHighQuality: '18 (جودة عالية جداً)',
    crfHintBalanced: '24 (متوازن)',
    crfHintMaxCompression: '34 (أقصى ضغط)',
    audioBitrateLabel: 'معدل بت الصوت (AAC)',
    audioMuteOption: 'بدون صوت (كتم)',
    estimatedTargetSizeLabel: 'الحجم المتوقع تقريباً',
    estimatedSavingsLabel: (pct) => `توفير تقديري ~${pct}%`,
    maxLimitConfigLabel: 'الحد الأقصى المسموح للملف (ميجابايت)',
    compressActionBtn: 'بدء ضغط الفيديو إلى MP4 (H.264)',
    compressingBtn: 'جاري ضغط الفيديو...',
    downloadMp4Btn: 'تنزيل الفيديو المضغوط (.MP4)',
    compressionSuccessSummary: (outSize, savedPct) =>
      `اكتمل ضغط الفيديو بترميز H.264 MP4 (${outSize} · التوفير: ${savedPct}%).`,
    compressionFailedError: 'تعذر إتمام ضغط الفيديو. يرجى التحقق من سلامة الملف أو تجربة دقة أقل.',

    trimRangeLabel: 'قص وتحديد مقطع الـ GIF على الشريط الزمني',
    trimStartLabel: 'وقت البداية (ثانية)',
    trimEndLabel: 'وقت النهاية (ثانية)',
    setStartFromPlayheadBtn: 'تعيين البداية عند الموضع الحالي',
    setEndFromPlayheadBtn: 'تعيين النهاية عند الموضع الحالي',
    selectedClipDurationLabel: (sec) => `مدة المقطع المحدد: ${sec} ثانية`,
    gifFpsLabel: 'معدل الإطارات في الثانية (FPS)',
    gifWidthLabel: 'عرض الصورة المتحركة (مع حفظ النسبة الأصلية)',
    gifWidthOriginal: 'العرض الأصلي',
    preservedAspectLabel: (w, h) => `الأبعاد الناتجة المحفوظة: ${w}×${h} بكسل`,
    gifLoopLabel: 'تكرار الحركة (Loop)',
    gifLoopInfinite: 'تكرار مستمر تلقائي',
    gifLoopOnce: 'تشغيل مرة واحدة فقط',
    gifLoopThreeTimes: 'تكرار 3 مرات',
    paletteNotice: 'يتم توليد لوحة ألوان مخصصة من 256 لوناً (palettegen + paletteuse) لمنع تشوه الألوان.',
    gifLargeEstimateWarning: (estMB) =>
      `تنبيه استباقي: الإعدادات الحالية قد تنتج ملف GIF كبيراً (~${estMB} ميجابايت). يُنصح بتقصير المقطع أو خفض العرض/الإطارات.`,
    gifOver15MbWarning: (actualMB) =>
      `تنبيه: حجم ملف GIF الناتج (${actualMB} ميجابايت) يتجاوز 15 ميجابايت. لتقليل الحجم، قلّل مدة المقطع أو اختر عرضاً أو معدل إطارات أقل.`,
    convertGifActionBtn: 'تحويل المقطع المحدد إلى GIF متحرك',
    convertingGifBtn: 'جاري توليد لوحة الألوان وإنشاء الـ GIF...',
    downloadGifBtn: 'تنزيل الصورة المتحركة (.GIF)',
    gifSuccessSummary: (w, h, sizeStr) => `تم إنشاء صورة GIF متحركة بأبعاد ${w}×${h} (${sizeStr}).`,
    gifFailedError: 'تعذر تحويل المقطع إلى GIF. يرجى التأكد من أن وقت النهاية أكبر من وقت البداية.',

    modeFileTab: 'تفريغ ملف صوتي / فيديو (Whisper AI)',
    modeMicTab: 'إملاء مباشر بالميكروفون',
    whisperModelLabel: 'حجم نموذج Whisper المحلي',
    whisperTinyLabel: 'Whisper Tiny (سريع وخفيف · ~45 ميجابايت)',
    whisperBaseLabel: 'Whisper Base (دقة أعلى للعربية واللغات · ~85 ميجابايت)',
    whisperLanguageLabel: 'لغة التسجيل',
    langAutoDetect: 'كشف تلقائي للغة',
    langArabic: 'العربية (ar)',
    langFrench: 'الفرنسية (fr)',
    langEnglish: 'الإنجليزية (en)',
    langSpanish: 'الإسبانية (es)',
    detectedLanguageLabel: (code) => `اللغة المكتشفة: ${code.toUpperCase()}`,
    backendBadgeWebGpu: 'تسريع WebGPU نشط',
    backendBadgeWasm: 'معالج WebAssembly',
    modelDownloadLabel: 'تحميل ملفات نموذج Whisper الذكي',
    modelCachedReadyNotice: 'يُحفظ النموذج تلقائياً في ذاكرة المتصفح المؤقتة ليعمل فوراً في المرات القادمة دون إعادة تحميل.',
    modelLoadedFromCacheNotice: 'تم تحميل نموذج Whisper مباشرة من ذاكرة المتصفح المؤقتة.',
    startTranscriptionBtn: 'بدء التفريغ النصي الآن',
    transcribingInProgressBtn: 'جاري التفريغ الصوتي...',
    micStartBtn: 'بدء الإملاء عبر الميكروفون',
    micStopBtn: 'إيقاف الاستماع',
    micUnsupportedTitle: 'الإملاء المباشر عبر الميكروفون غير مدعوم في هذا المتصفح',
    micUnsupportedDesc:
      'متصفحك الحالي لا يوفر واجهة Web SpeechRecognition. لن يتم إدراج أي نص وهمي — يمكنك التبديل إلى تبويب «تفريغ ملف صوتي / فيديو (Whisper AI)» لتفريغ تسجيلاتك محلياً في جميع المتصفحات.',
    micPermissionError: 'تعذر الوصول إلى الميكروفون. يرجى منح إذن الميكروفون للمتصفح والمحاولة مجدداً.',
    micListeningStatus: 'جاري الاستماع... تحدّث بوضوح لإضافة المقاطع مع توقيتاتها الفعلية.',
    emptyTranscriptFileHint: 'ارفع ملفاً صوتياً أو مرئياً واضغط «بدء التفريغ النصي الآن» لعرض المقاطع الزمنية القابلة للتعديل هنا.',
    emptyTranscriptMicHint: 'اضغط على زر «بدء الإملاء عبر الميكروفون» لبدء التسجيل الحي وتحويل حديثك إلى مقاطع زمنية حقيقية.',
    segmentsCountLabel: (count) => `المقاطع المفرّغة (${count})`,
    addSegmentBtn: 'إضافة مقطع يدوي',
    deleteSegmentAria: 'حذف هذا المقطع',
    seekToSegmentAria: (timeStr) => `الانتقال في المشغل إلى التوقيت ${timeStr}`,
    segmentTextPlaceholder: 'اكتب أو عدّل النص هنا...',
    speakerDefaultFile: 'المتحدث',
    speakerDefaultMic: 'ميكروفون مباشر',
    exportSectionLabel: 'تصدير النص والترجمة المصاحبة (ترميز UTF-8 BOM ودعم كامل للعربية RTL)',
    noSegmentsToExportError: 'لا توجد مقاطع نصية لتصديرها بعد.',
    transcriptionFailedError: 'حدث خطأ أثناء تفريغ الملف الصوتي. يرجى التحقق من اتصال الشبكة عند التحميل الأول للنموذج أو تجربة ملف آخر.',
    transcriptTitleDoc: 'تفريغ نصي زمني — ToolNova',
  },

  fr: {
    closeWorkspaceAria: 'Fermer l’espace de travail',
    localPrivacyNote: 'Traitement 100 % local dans votre navigateur — aucun fichier n’est envoyé vers un serveur.',
    uploadVideoBtn: 'Importer une vidéo',
    changeVideoBtn: 'Changer de vidéo',
    uploadMediaBtn: 'Importer un fichier audio ou vidéo',
    changeMediaBtn: 'Changer de fichier',
    dropVideoPromptTitle: 'Sélectionnez ou déposez une vidéo ici',
    dropVideoPromptDesc: 'Prend en charge MP4, WebM et MOV localement via le moteur FFmpeg.wasm.',
    dropMediaPromptTitle: 'Importez un fichier audio ou vidéo à transcrire',
    dropMediaPromptDesc: 'Extraction audio 16 kHz mono par FFmpeg.wasm puis transcription locale par Whisper ONNX.',
    maxSizeLimitLabel: 'Taille maximale autorisée',
    fileTooLargeError: (actualMB, maxMB) =>
      `Le fichier sélectionné (${actualMB} Mo) dépasse la limite configurée de ${maxMB} Mo. Choisissez un fichier plus léger ou augmentez la limite.`,
    invalidMediaError: 'Impossible de lire ce fichier média. Vérifiez qu’il s’agit d’un fichier audio ou vidéo valide.',
    ffmpegLoadStage: 'Initialisation du moteur local FFmpeg.wasm...',
    processingStage: 'Encodage des images en cours...',
    extractingAudioStage: 'Extraction de la piste audio en 16 kHz mono...',
    transcribingStage: 'Transcription horodatée par Whisper en cours...',
    detectingLanguageStage: 'Détection automatique de la langue parlée...',
    etaLabel: (seconds) => `Temps restant estimé : ${seconds}`,
    etaCalculating: 'Calcul du temps restant...',
    cancelBtn: 'Annuler la tâche',
    cancelledNotice: 'La tâche a été immédiatement interrompue.',
    downloadResultBtn: 'Télécharger le résultat',
    clearFileBtn: 'Retirer le fichier',
    sourceFileLabel: 'Fichier source',
    durationLabel: 'Durée',
    dimensionsLabel: 'Dimensions',
    inputSizeLabel: 'Taille initiale',
    outputSizeLabel: 'Taille finale',
    savedPercentageLabel: (pct) => `${pct} % économisés`,
    sizeIncreasedNotice: (pct) => `+${pct} % (augmentez le CRF pour réduire la taille)`,
    previewInputTab: 'Aperçu source',
    previewOutputTab: 'Aperçu résultat',

    resolutionLabel: 'Résolution cible',
    resolutionOriginal: 'Originale',
    crfLabel: 'Facteur de qualité constante (CRF)',
    crfHintHighQuality: '18 (Haute qualité)',
    crfHintBalanced: '24 (Équilibré)',
    crfHintMaxCompression: '34 (Compression max)',
    audioBitrateLabel: 'Débit audio (AAC)',
    audioMuteOption: 'Sans audio (Muet)',
    estimatedTargetSizeLabel: 'Taille finale estimée',
    estimatedSavingsLabel: (pct) => `Gain estimé ~${pct} %`,
    maxLimitConfigLabel: 'Limite max de fichier (Mo)',
    compressActionBtn: 'Compresser la vidéo en MP4 (H.264)',
    compressingBtn: 'Compression H.264 en cours...',
    downloadMp4Btn: 'Télécharger la vidéo MP4 (.MP4)',
    compressionSuccessSummary: (outSize, savedPct) =>
      `Vidéo compressée en MP4 H.264 (${outSize} · économie : ${savedPct} %).`,
    compressionFailedError: 'Échec de la compression vidéo. Vérifiez le fichier source ou essayez une résolution inférieure.',

    trimRangeLabel: 'Découpage précis de l’extrait sur la chronologie',
    trimStartLabel: 'Début (secondes)',
    trimEndLabel: 'Fin (secondes)',
    setStartFromPlayheadBtn: 'Définir début à la lecture',
    setEndFromPlayheadBtn: 'Définir fin à la lecture',
    selectedClipDurationLabel: (sec) => `Durée de l’extrait : ${sec} s`,
    gifFpsLabel: 'Images par seconde (FPS)',
    gifWidthLabel: 'Largeur du GIF (proportions préservées)',
    gifWidthOriginal: 'Originale',
    preservedAspectLabel: (w, h) => `Dimensions conservées : ${w}×${h} px`,
    gifLoopLabel: 'Mode de répétition (Loop)',
    gifLoopInfinite: 'Boucle infinie',
    gifLoopOnce: 'Lire une seule fois',
    gifLoopThreeTimes: 'Répéter 3 fois',
    paletteNotice: 'Génération d’une palette optimale 256 couleurs (palettegen + paletteuse) pour un rendu net.',
    gifLargeEstimateWarning: (estMB) =>
      `Attention : ces réglages peuvent produire un GIF volumineux (~${estMB} Mo). Réduisez la durée, la largeur ou les FPS.`,
    gifOver15MbWarning: (actualMB) =>
      `Avertissement : le GIF généré pèse ${actualMB} Mo (plus de 15 Mo). Raccourcissez l’extrait ou réduisez la largeur / les FPS pour alléger le fichier.`,
    convertGifActionBtn: 'Générer le GIF animé',
    convertingGifBtn: 'Génération de la palette et du GIF...',
    downloadGifBtn: 'Télécharger le GIF (.GIF)',
    gifSuccessSummary: (w, h, sizeStr) => `GIF animé généré en ${w}×${h} (${sizeStr}).`,
    gifFailedError: 'Échec de la création du GIF. Vérifiez que la fin est supérieure au début.',

    modeFileTab: 'Fichier Audio / Vidéo (Whisper IA)',
    modeMicTab: 'Dictée microphone en direct',
    whisperModelLabel: 'Modèle Whisper local',
    whisperTinyLabel: 'Whisper Tiny (Rapide & léger · ~45 Mo)',
    whisperBaseLabel: 'Whisper Base (Précision supérieure · ~85 Mo)',
    whisperLanguageLabel: 'Langue parlée',
    langAutoDetect: 'Détection automatique',
    langArabic: 'Arabe (ar)',
    langFrench: 'Français (fr)',
    langEnglish: 'Anglais (en)',
    langSpanish: 'Espagnol (es)',
    detectedLanguageLabel: (code) => `Langue détectée : ${code.toUpperCase()}`,
    backendBadgeWebGpu: 'Accélération WebGPU',
    backendBadgeWasm: 'Moteur WebAssembly',
    modelDownloadLabel: 'Téléchargement du modèle Whisper',
    modelCachedReadyNotice: 'Le modèle est mis en cache dans votre navigateur pour un démarrage instantané lors de vos prochaines visites.',
    modelLoadedFromCacheNotice: 'Modèle Whisper chargé depuis le cache local du navigateur.',
    startTranscriptionBtn: 'Lancer la transcription',
    transcribingInProgressBtn: 'Transcription en cours...',
    micStartBtn: 'Démarrer la dictée micro',
    micStopBtn: 'Arrêter l’écoute',
    micUnsupportedTitle: 'Dictée vocale en direct non prise en charge par ce navigateur',
    micUnsupportedDesc:
      'Votre navigateur ne propose pas l’API Web SpeechRecognition. Aucun faux texte n’est généré — utilisez l’onglet « Fichier Audio / Vidéo (Whisper IA) » qui fonctionne dans tous les navigateurs.',
    micPermissionError: 'Accès au microphone refusé ou indisponible. Vérifiez les autorisations du navigateur.',
    micListeningStatus: 'Écoute en cours... Parlez clairement pour ajouter des segments horodatés réels.',
    emptyTranscriptFileHint: 'Importez un fichier audio ou vidéo puis cliquez sur « Lancer la transcription » pour obtenir les segments horodatés.',
    emptyTranscriptMicHint: 'Cliquez sur « Démarrer la dictée micro » pour dicter en direct avec horodatage réel.',
    segmentsCountLabel: (count) => `Segments transcrits (${count})`,
    addSegmentBtn: 'Ajouter un segment',
    deleteSegmentAria: 'Supprimer ce segment',
    seekToSegmentAria: (timeStr) => `Aller à ${timeStr} dans le lecteur`,
    segmentTextPlaceholder: 'Modifiez le texte du segment...',
    speakerDefaultFile: 'Intervenant',
    speakerDefaultMic: 'Micro direct',
    exportSectionLabel: 'Exporter la transcription (UTF-8 avec BOM & support RTL arabe)',
    noSegmentsToExportError: 'Aucun segment à exporter pour le moment.',
    transcriptionFailedError: 'La transcription a échoué. Vérifiez votre connexion lors du premier téléchargement du modèle ou essayez un autre fichier.',
    transcriptTitleDoc: 'Transcription horodatée — ToolNova',
  },

  en: {
    closeWorkspaceAria: 'Close tool workspace',
    localPrivacyNote: 'Processed 100% locally in your browser — your files are never uploaded to any server.',
    uploadVideoBtn: 'Upload Video',
    changeVideoBtn: 'Change Video',
    uploadMediaBtn: 'Upload Audio or Video',
    changeMediaBtn: 'Change File',
    dropVideoPromptTitle: 'Select or drop a video file to begin',
    dropVideoPromptDesc: 'Supports MP4, WebM, and MOV locally via single-thread FFmpeg.wasm in a Web Worker.',
    dropMediaPromptTitle: 'Upload an audio or video file to transcribe',
    dropMediaPromptDesc: 'Extracts 16 kHz mono audio with FFmpeg.wasm and transcribes locally with Whisper ONNX.',
    maxSizeLimitLabel: 'Max file size limit',
    fileTooLargeError: (actualMB, maxMB) =>
      `Selected file (${actualMB} MB) exceeds the configured ${maxMB} MB limit. Please choose a smaller file or increase the limit.`,
    invalidMediaError: 'Could not decode this media file. Please verify it is a valid audio or video recording.',
    ffmpegLoadStage: 'Initializing local FFmpeg.wasm engine...',
    processingStage: 'Encoding frames in Web Worker...',
    extractingAudioStage: 'Extracting 16 kHz mono audio stream...',
    transcribingStage: 'Transcribing timestamped segments with Whisper...',
    detectingLanguageStage: 'Auto-detecting spoken language...',
    etaLabel: (seconds) => `Estimated time remaining: ${seconds}`,
    etaCalculating: 'Calculating ETA...',
    cancelBtn: 'Cancel Job',
    cancelledNotice: 'Processing cancelled immediately.',
    downloadResultBtn: 'Download Output',
    clearFileBtn: 'Remove File',
    sourceFileLabel: 'Source File',
    durationLabel: 'Duration',
    dimensionsLabel: 'Dimensions',
    inputSizeLabel: 'Input Size',
    outputSizeLabel: 'Output Size',
    savedPercentageLabel: (pct) => `${pct}% saved`,
    sizeIncreasedNotice: (pct) => `+${pct}% larger (increase CRF to shrink further)`,
    previewInputTab: 'Source Preview',
    previewOutputTab: 'Output Preview',

    resolutionLabel: 'Target Output Resolution',
    resolutionOriginal: 'Original',
    crfLabel: 'Constant Rate Factor (CRF Quality)',
    crfHintHighQuality: '18 (High quality)',
    crfHintBalanced: '24 (Balanced)',
    crfHintMaxCompression: '34 (Smallest size)',
    audioBitrateLabel: 'Audio Bitrate (AAC)',
    audioMuteOption: 'Mute (Strip audio)',
    estimatedTargetSizeLabel: 'Estimated Target Size',
    estimatedSavingsLabel: (pct) => `Est. ~${pct}% reduction`,
    maxLimitConfigLabel: 'Max File Size Limit (MB)',
    compressActionBtn: 'Compress Video to H.264 MP4',
    compressingBtn: 'Compressing Video...',
    downloadMp4Btn: 'Download Compressed MP4 (.MP4)',
    compressionSuccessSummary: (outSize, savedPct) =>
      `Compressed H.264 MP4 ready (${outSize} · ${savedPct}% saved).`,
    compressionFailedError: 'Video compression failed. Please check the input file or try a lower target resolution.',

    trimRangeLabel: 'Trim Clip Range on Scrubber',
    trimStartLabel: 'Start Time (sec)',
    trimEndLabel: 'End Time (sec)',
    setStartFromPlayheadBtn: 'Set Start to Playhead',
    setEndFromPlayheadBtn: 'Set End to Playhead',
    selectedClipDurationLabel: (sec) => `Selected clip duration: ${sec}s`,
    gifFpsLabel: 'Frame Rate (FPS)',
    gifWidthLabel: 'Output Width (preserves source aspect ratio)',
    gifWidthOriginal: 'Original',
    preservedAspectLabel: (w, h) => `Preserved output dimensions: ${w}×${h} px`,
    gifLoopLabel: 'Loop Behavior',
    gifLoopInfinite: 'Infinite Loop',
    gifLoopOnce: 'Play Once (No Loop)',
    gifLoopThreeTimes: 'Loop 3 Times',
    paletteNotice: 'Uses custom 256-color palette generation (palettegen + paletteuse) for clean gradients.',
    gifLargeEstimateWarning: (estMB) =>
      `Heads up: current settings may produce a large GIF (~${estMB} MB). Consider trimming shorter or lowering width/FPS.`,
    gifOver15MbWarning: (actualMB) =>
      `Size warning: generated GIF is ${actualMB} MB (over 15 MB). Trim a shorter clip or reduce width/FPS for faster sharing.`,
    convertGifActionBtn: 'Convert Trimmed Clip to Animated GIF',
    convertingGifBtn: 'Generating Palette & Encoding GIF...',
    downloadGifBtn: 'Download Animated GIF (.GIF)',
    gifSuccessSummary: (w, h, sizeStr) => `Created ${w}×${h} animated GIF (${sizeStr}).`,
    gifFailedError: 'GIF conversion failed. Ensure end time is greater than start time.',

    modeFileTab: 'Transcribe Audio / Video File (Whisper AI)',
    modeMicTab: 'Live Microphone Dictation',
    whisperModelLabel: 'Whisper Model Size',
    whisperTinyLabel: 'Whisper Tiny (Fast & lightweight · ~45 MB)',
    whisperBaseLabel: 'Whisper Base (Higher accuracy · ~85 MB)',
    whisperLanguageLabel: 'Spoken Language',
    langAutoDetect: 'Auto-detect language',
    langArabic: 'Arabic (ar)',
    langFrench: 'French (fr)',
    langEnglish: 'English (en)',
    langSpanish: 'Spanish (es)',
    detectedLanguageLabel: (code) => `Detected language: ${code.toUpperCase()}`,
    backendBadgeWebGpu: 'WebGPU Accelerated',
    backendBadgeWasm: 'WebAssembly CPU',
    modelDownloadLabel: 'Downloading Whisper AI Model',
    modelCachedReadyNotice: 'Model weights are cached in your browser so future transcriptions start immediately offline.',
    modelLoadedFromCacheNotice: 'Whisper model loaded from browser cache.',
    startTranscriptionBtn: 'Transcribe File Now',
    transcribingInProgressBtn: 'Transcribing...',
    micStartBtn: 'Start Microphone Dictation',
    micStopBtn: 'Stop Listening',
    micUnsupportedTitle: 'Live microphone dictation is not supported in this browser',
    micUnsupportedDesc:
      'Your browser does not provide the Web SpeechRecognition API. No fake text is inserted — switch to the "Transcribe Audio / Video File (Whisper AI)" tab to transcribe recordings locally in any browser.',
    micPermissionError: 'Microphone access was denied or unavailable. Please check your browser permissions.',
    micListeningStatus: 'Listening... Speak clearly to append real timestamped segments.',
    emptyTranscriptFileHint: 'Upload an audio or video file and click "Transcribe File Now" to generate editable timestamped segments.',
    emptyTranscriptMicHint: 'Click "Start Microphone Dictation" to dictate live speech with real elapsed timestamps.',
    segmentsCountLabel: (count) => `Timestamped Segments (${count})`,
    addSegmentBtn: 'Add Segment',
    deleteSegmentAria: 'Delete segment',
    seekToSegmentAria: (timeStr) => `Seek player to ${timeStr}`,
    segmentTextPlaceholder: 'Edit segment transcript...',
    speakerDefaultFile: 'Speaker',
    speakerDefaultMic: 'Live Mic',
    exportSectionLabel: 'Export Transcript & Captions (UTF-8 BOM & Arabic RTL Ready)',
    noSegmentsToExportError: 'No transcript segments available to export yet.',
    transcriptionFailedError: 'Audio transcription failed. Check your connection on first model download or try another media file.',
    transcriptTitleDoc: 'Timestamped Transcript — ToolNova',
  },

  es: {
    closeWorkspaceAria: 'Cerrar espacio de trabajo',
    localPrivacyNote: 'Procesamiento 100 % local en tu navegador: ningún archivo se sube a servidores externos.',
    uploadVideoBtn: 'Subir video',
    changeVideoBtn: 'Cambiar video',
    uploadMediaBtn: 'Subir audio o video',
    changeMediaBtn: 'Cambiar archivo',
    dropVideoPromptTitle: 'Selecciona o arrastra un archivo de video para comenzar',
    dropVideoPromptDesc: 'Compatible con MP4, WebM y MOV localmente mediante FFmpeg.wasm en un Web Worker.',
    dropMediaPromptTitle: 'Sube un archivo de audio o video para transcribir',
    dropMediaPromptDesc: 'Extrae audio mono a 16 kHz con FFmpeg.wasm y transcribe localmente con Whisper ONNX.',
    maxSizeLimitLabel: 'Límite máximo de archivo',
    fileTooLargeError: (actualMB, maxMB) =>
      `El archivo seleccionado (${actualMB} MB) supera el límite configurado de ${maxMB} MB. Elige un archivo menor o amplía el límite.`,
    invalidMediaError: 'No se pudo leer este archivo multimedia. Asegúrate de que sea un archivo de audio o video válido.',
    ffmpegLoadStage: 'Inicializando motor local FFmpeg.wasm...',
    processingStage: 'Codificando fotogramas en segundo plano...',
    extractingAudioStage: 'Extrayendo pista de audio mono a 16 kHz...',
    transcribingStage: 'Transcribiendo segmentos con marcas de tiempo mediante Whisper...',
    detectingLanguageStage: 'Detectando automáticamente el idioma hablado...',
    etaLabel: (seconds) => `Tiempo restante estimado: ${seconds}`,
    etaCalculating: 'Calculando tiempo restante...',
    cancelBtn: 'Cancelar tarea',
    cancelledNotice: 'Proceso cancelado de inmediato.',
    downloadResultBtn: 'Descargar archivo resultante',
    clearFileBtn: 'Quitar archivo',
    sourceFileLabel: 'Archivo original',
    durationLabel: 'Duración',
    dimensionsLabel: 'Dimensiones',
    inputSizeLabel: 'Tamaño original',
    outputSizeLabel: 'Tamaño final',
    savedPercentageLabel: (pct) => `${pct} % ahorrado`,
    sizeIncreasedNotice: (pct) => `+${pct} % mayor (aumenta el CRF para reducir tamaño)`,
    previewInputTab: 'Vista previa original',
    previewOutputTab: 'Vista previa final',

    resolutionLabel: 'Resolución de salida',
    resolutionOriginal: 'Original',
    crfLabel: 'Factor de calidad constante (CRF)',
    crfHintHighQuality: '18 (Alta calidad)',
    crfHintBalanced: '24 (Equilibrado)',
    crfHintMaxCompression: '34 (Máxima compresión)',
    audioBitrateLabel: 'Tasa de bits de audio (AAC)',
    audioMuteOption: 'Sin audio (Silenciar)',
    estimatedTargetSizeLabel: 'Tamaño final estimado',
    estimatedSavingsLabel: (pct) => `Ahorro estimado ~${pct} %`,
    maxLimitConfigLabel: 'Límite máximo de archivo (MB)',
    compressActionBtn: 'Comprimir video a MP4 (H.264)',
    compressingBtn: 'Comprimiendo video...',
    downloadMp4Btn: 'Descargar video comprimido (.MP4)',
    compressionSuccessSummary: (outSize, savedPct) =>
      `Video MP4 H.264 comprimido listo (${outSize} · ahorro: ${savedPct} %).`,
    compressionFailedError: 'Error al comprimir el video. Verifica el archivo o prueba con una resolución menor.',

    trimRangeLabel: 'Recortar fragmento en la línea de tiempo',
    trimStartLabel: 'Inicio (seg)',
    trimEndLabel: 'Fin (seg)',
    setStartFromPlayheadBtn: 'Fijar inicio en posición actual',
    setEndFromPlayheadBtn: 'Fijar fin en posición actual',
    selectedClipDurationLabel: (sec) => `Duración del recorte: ${sec} s`,
    gifFpsLabel: 'Fotogramas por segundo (FPS)',
    gifWidthLabel: 'Ancho del GIF (conserva proporción original)',
    gifWidthOriginal: 'Original',
    preservedAspectLabel: (w, h) => `Dimensiones conservadas: ${w}×${h} px`,
    gifLoopLabel: 'Repetición (Loop)',
    gifLoopInfinite: 'Bucle infinito',
    gifLoopOnce: 'Reproducir una vez',
    gifLoopThreeTimes: 'Repetir 3 veces',
    paletteNotice: 'Genera una paleta adaptativa de 256 colores (palettegen + paletteuse) para máxima fidelidad.',
    gifLargeEstimateWarning: (estMB) =>
      `Aviso previo: la configuración actual podría generar un GIF pesado (~${estMB} MB). Recorta menos segundos o reduce ancho/FPS.`,
    gifOver15MbWarning: (actualMB) =>
      `Advertencia de tamaño: el GIF generado pesa ${actualMB} MB (supera 15 MB). Reduce la duración, el ancho o los FPS para aligerarlo.`,
    convertGifActionBtn: 'Convertir recorte a GIF animado',
    convertingGifBtn: 'Generando paleta y codificando GIF...',
    downloadGifBtn: 'Descargar GIF animado (.GIF)',
    gifSuccessSummary: (w, h, sizeStr) => `GIF animado creado en ${w}×${h} (${sizeStr}).`,
    gifFailedError: 'No se pudo generar el GIF. Verifica que el tiempo final sea mayor que el inicial.',

    modeFileTab: 'Transcribir Archivo Audio / Video (Whisper IA)',
    modeMicTab: 'Dictado por Micrófono en Vivo',
    whisperModelLabel: 'Tamaño del modelo Whisper',
    whisperTinyLabel: 'Whisper Tiny (Rápido y ligero · ~45 MB)',
    whisperBaseLabel: 'Whisper Base (Mayor precisión · ~85 MB)',
    whisperLanguageLabel: 'Idioma hablado',
    langAutoDetect: 'Detección automática',
    langArabic: 'Árabe (ar)',
    langFrench: 'Francés (fr)',
    langEnglish: 'Inglés (en)',
    langSpanish: 'Español (es)',
    detectedLanguageLabel: (code) => `Idioma detectado: ${code.toUpperCase()}`,
    backendBadgeWebGpu: 'Acelerado por WebGPU',
    backendBadgeWasm: 'Motor WebAssembly',
    modelDownloadLabel: 'Descargando modelo Whisper IA',
    modelCachedReadyNotice: 'El modelo se guarda en la caché del navegador para iniciar al instante la próxima vez.',
    modelLoadedFromCacheNotice: 'Modelo Whisper cargado desde la caché del navegador.',
    startTranscriptionBtn: 'Transcribir archivo ahora',
    transcribingInProgressBtn: 'Transcribiendo...',
    micStartBtn: 'Iniciar dictado por micrófono',
    micStopBtn: 'Detener escucha',
    micUnsupportedTitle: 'El dictado en vivo por micrófono no es compatible con este navegador',
    micUnsupportedDesc:
      'Tu navegador no incluye la API Web SpeechRecognition. No se insertará texto simulado; usa la pestaña «Transcribir Archivo Audio / Video (Whisper IA)», compatible con todos los navegadores.',
    micPermissionError: 'Permiso de micrófono denegado o no disponible. Revisa los permisos del navegador.',
    micListeningStatus: 'Escuchando... Habla con claridad para añadir segmentos con marcas de tiempo reales.',
    emptyTranscriptFileHint: 'Sube un archivo de audio o video y pulsa «Transcribir archivo ahora» para obtener segmentos editables.',
    emptyTranscriptMicHint: 'Pulsa «Iniciar dictado por micrófono» para dictar en tiempo real con marcas de tiempo reales.',
    segmentsCountLabel: (count) => `Segmentos transcritos (${count})`,
    addSegmentBtn: 'Añadir segmento',
    deleteSegmentAria: 'Eliminar segmento',
    seekToSegmentAria: (timeStr) => `Ir a ${timeStr} en el reproductor`,
    segmentTextPlaceholder: 'Edita el texto del segmento...',
    speakerDefaultFile: 'Hablante',
    speakerDefaultMic: 'Micrófono en vivo',
    exportSectionLabel: 'Exportar transcripción y subtítulos (UTF-8 con BOM y soporte RTL árabe)',
    noSegmentsToExportError: 'Aún no hay segmentos para exportar.',
    transcriptionFailedError: 'Error al transcribir el audio. Verifica tu conexión en la primera descarga del modelo o prueba otro archivo.',
    transcriptTitleDoc: 'Transcripción con marcas de tiempo — ToolNova',
  },
};
