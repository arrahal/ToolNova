import { HubCategory, ToolItem } from './toolsData';

export type AppLanguage = 'ar' | 'fr' | 'en' | 'es';

export const LANGUAGE_OPTIONS: {
  code: AppLanguage;
  label: string;
  shortLabel: string;
  dir: 'rtl' | 'ltr';
}[] = [
  { code: 'ar', label: 'العربية', shortLabel: 'AR', dir: 'rtl' },
  { code: 'fr', label: 'Français', shortLabel: 'FR', dir: 'ltr' },
  { code: 'en', label: 'English', shortLabel: 'EN', dir: 'ltr' },
  { code: 'es', label: 'Español', shortLabel: 'ES', dir: 'ltr' },
];

export interface UiStrings {
  heroTitle: string;
  heroSubtitlePrefix: string;
  heroSubtitleSuffix: string;
  searchPlaceholder: string;
  createWorkflowBtn: string;
  createWorkflowCardTitle: string;
  createWorkflowCardDesc: string;
  openAction: string;
  newBadge: string;
  workYourWayTitle: string;
  workYourWaySubtitle: string;
  presetPipelineLabel: string;
  savedSecSuffix: string;
  launchBtn: string;
  privacyTitle: string;
  privacyDesc: string;
  sessionActivityTitle: string;
  sessionCompletedSuffix: string;
  sessionEmptyDesc: string;
  noToolsTitle: string;
  noToolsDesc: string;
  resetFiltersBtn: string;
  savedWorkflowsTitle: string;
  savedWorkflowsDesc: string;
  newWorkflowBtn: string;
  runPipelineBtn: string;
  pricingNavLabel: string;
  loginBtnLabel: string;
  registerBtnLabel: string;
  accountProfileLabel: string;
  logoutBtnLabel: string;
  categoryLabels: Record<HubCategory, string>;
  hubLabels: Record<'pdf' | 'word' | 'excel' | 'powerpoint' | 'image' | 'text' | 'audio' | 'video', string>;
}

export const UI_TRANSLATIONS: Record<AppLanguage, UiStrings> = {
  ar: {
    heroTitle: 'مرحباً بك، لنبدأ العمل الآن',
    heroSubtitlePrefix: 'منصتك الذكية الشاملة لمعالجة المستندات والوسائط · ',
    heroSubtitleSuffix: ' أداة احترافية تعمل مباشرة في متصفحك (PDF، Word، Excel، PowerPoint، صور، نصوص، صوت، فيديو)',
    searchPlaceholder: 'ابحث عن أداة أو صيغة (مثل: دمج PDF، إصلاح Word، تنظيف Excel، PowerPoint، إزالة الخلفية، استخراج إيميلات)...',
    createWorkflowBtn: 'إنشاء مسار عمل',
    createWorkflowCardTitle: 'أنشئ مسار عمل مخصص',
    createWorkflowCardDesc:
      'اجمع أدواتك المفضلة في خطوة واحدة متسلسلة لأتمتة مهامك المتكررة واستخدامها في أي وقت.',
    openAction: 'فتح',
    newBadge: 'جديد!',
    workYourWayTitle: 'اعمل بطريقتك الخاصة',
    workYourWaySubtitle:
      'اربط أدوات الـ PDF والـ Word والـ Excel والصور والنصوص والصوت في مسارات عمل ذكية داخل المتصفح — أو شغّل أحد المسارات الجاهزة بضغطة واحدة.',
    presetPipelineLabel: 'مسار جاهز',
    savedSecSuffix: 'ثانية موفرة',
    launchBtn: 'تشغيل',
    privacyTitle: 'خصوصية وأمان 100% داخل متصفحك',
    privacyDesc:
      'تتم معالجة جميع ملفات الـ PDF، مستندات Word، جداول Excel، العروض التقديمية، الصور، والتسجيلات محلياً عبر WebAssembly دون رفع أي ملف لخوادم خارجية.',
    sessionActivityTitle: 'سجل العمليات في هذه الجلسة',
    sessionCompletedSuffix: 'مكتملة',
    sessionEmptyDesc:
      'اضغط على أي أداة في الأعلى لمعالجة ملفاتك — سيتم عرض سجل الملفات التي قمت بتحميلها هنا.',
    noToolsTitle: 'لم يتم العثور على أدوات مطابقة',
    noToolsDesc: 'لا توجد أداة تطابق بحثك في هذا القسم.',
    resetFiltersBtn: 'إعادة ضبط الفلاتر',
    savedWorkflowsTitle: 'مسارات العمل المحفوظة',
    savedWorkflowsDesc: 'قم بأتمتة مهام الـ PDF والـ Office والصور والصوت في خطوات متسلسلة.',
    newWorkflowBtn: 'مسار جديد',
    runPipelineBtn: 'تشغيل المسار الآن',
    pricingNavLabel: 'الأسعار والباقات',
    loginBtnLabel: 'تسجيل الدخول',
    registerBtnLabel: 'إنشاء حساب',
    accountProfileLabel: 'حسابي الشخصي',
    logoutBtnLabel: 'تسجيل الخروج',
    categoryLabels: {
      all: 'الكل',
      workflows: 'مسارات العمل',
      pdf: 'أدوات PDF',
      word: 'أدوات Word',
      excel: 'أدوات Excel',
      powerpoint: 'PowerPoint',
      image: 'استوديو الصور',
      text: 'النصوص والمعالجة',
      audio: 'مختبر الصوت',
      video: 'الفيديو والذكاء الاصطناعي',
      convert: 'التحويل والتصدير',
      security: 'الحماية والضغط',
    },
    hubLabels: {
      pdf: 'أدوات PDF',
      word: 'استوديو Word',
      excel: 'بيانات Excel',
      powerpoint: 'عروض PowerPoint',
      image: 'استوديو الصور',
      text: 'معالج النصوص',
      audio: 'مختبر الصوت',
      video: 'الفيديو والذكاء',
    },
  },
  fr: {
    heroTitle: 'Bonjour, commençons maintenant',
    heroSubtitlePrefix: 'Votre boîte à outils intelligente tout-en-un · ',
    heroSubtitleSuffix: ' outils locaux pour PDF, Word, Excel, PowerPoint, Images, Texte, Audio et Vidéo',
    searchPlaceholder:
      'Rechercher un outil ou format (ex: Fusionner PDF, Réparer Word, Nettoyer Excel, PowerPoint, Détourage)...',
    createWorkflowBtn: 'Créer un flux',
    createWorkflowCardTitle: 'Créer un flux de travail',
    createWorkflowCardDesc:
      'Créez des flux personnalisés avec vos outils favoris, automatisez vos tâches et réutilisez-les à tout moment.',
    openAction: 'Ouvrir',
    newBadge: 'Nouveau!',
    workYourWayTitle: 'Travaillez à votre façon',
    workYourWaySubtitle:
      'Enchaînez les outils PDF, Office, Image, Texte, Audio et Vidéo dans votre navigateur ou lancez un flux prédéfini en un clic.',
    presetPipelineLabel: 'Flux prédéfini',
    savedSecSuffix: 's gagnées',
    launchBtn: 'Lancer',
    privacyTitle: 'Architecture 100% confidentielle côté client',
    privacyDesc:
      'Propulsé par WebAssembly, pdf-lib, PDF.js, ExcelJS et HTML5 Canvas. Vos CV, PDF, Word, Excel, photos et fichiers audio ne quittent jamais votre navigateur.',
    sessionActivityTitle: 'Activité de la session locale',
    sessionCompletedSuffix: 'terminées',
    sessionEmptyDesc:
      'Cliquez sur une carte ci-dessus pour traiter un fichier — vos exportations apparaîtront ici.',
    noToolsTitle: 'Aucun outil correspondant',
    noToolsDesc: 'Aucun outil ne correspond à votre recherche dans cette catégorie.',
    resetFiltersBtn: 'Réinitialiser les filtres',
    savedWorkflowsTitle: 'Flux de travail enregistrés',
    savedWorkflowsDesc: 'Automatisez vos tâches PDF, Office, Image, Audio et Vidéo en séquence.',
    newWorkflowBtn: 'Nouveau flux',
    runPipelineBtn: 'Exécuter le flux',
    pricingNavLabel: 'Tarifs & Forfaits',
    loginBtnLabel: 'Connexion',
    registerBtnLabel: 'Créer un compte',
    accountProfileLabel: 'Mon Profil',
    logoutBtnLabel: 'Déconnexion',
    categoryLabels: {
      all: 'Tout',
      workflows: 'Flux de travail',
      pdf: 'Hub PDF',
      word: 'Studio Word',
      excel: 'Excel & Données',
      powerpoint: 'PowerPoint',
      image: 'Studio Image',
      text: 'Texte & Outils',
      audio: 'Labo Audio',
      video: 'Vidéo & IA',
      convert: 'Convertir & Exporter',
      security: 'Sécurité & Optimiser',
    },
    hubLabels: {
      pdf: 'Hub PDF',
      word: 'Studio Word',
      excel: 'Excel & Données',
      powerpoint: 'PowerPoint',
      image: 'Studio Image',
      text: 'Outils Texte',
      audio: 'Labo Audio',
      video: 'Vidéo & IA',
    },
  },
  en: {
    heroTitle: "Hi there, let's get started",
    heroSubtitlePrefix: 'Your All-in-One Smart Media & Office Toolbox · ',
    heroSubtitleSuffix: ' Client-Side Tools across PDF, Word, Excel, PowerPoint, Image, Text, Audio & Video',
    searchPlaceholder:
      'Search tools by name or format (e.g., Merge PDF, Word Doctor, Excel Cleaner, PowerPoint, Background Remover)...',
    createWorkflowBtn: 'Create Workflow',
    createWorkflowCardTitle: 'Create a workflow',
    createWorkflowCardDesc:
      'Create custom workflows with your favorite tools, automate tasks, and reuse them anytime.',
    openAction: 'Open',
    newBadge: 'New!',
    workYourWayTitle: 'Work your way',
    workYourWaySubtitle:
      'Chain PDF, Word, Excel, PowerPoint, Image, Text, Audio, and Video tools into zero-upload browser pipelines—or launch any preset workflow below with one click.',
    presetPipelineLabel: 'Preset Pipeline',
    savedSecSuffix: 's saved',
    launchBtn: 'Launch',
    privacyTitle: '100% Client-Side Privacy Architecture',
    privacyDesc:
      'Powered by WebAssembly, pdf-lib, PDF.js, ExcelJS, PptxGenJS, and HTML5 Canvas. Your confidential PDFs, Word docs, spreadsheets, photos, and videos never leave your browser.',
    sessionActivityTitle: 'Local Session Activity',
    sessionCompletedSuffix: 'completed',
    sessionEmptyDesc:
      'Click any tool card above to process a sample or local file—your exported files will be logged here.',
    noToolsTitle: 'No matching tools found',
    noToolsDesc: 'No tools matched your search query in this category view.',
    resetFiltersBtn: 'Reset Filters',
    savedWorkflowsTitle: 'Saved Multi-Step Workflows',
    savedWorkflowsDesc:
      'Automate repetitive PDF, Office, Image, Audio, and Video tasks in a single sequential pipeline.',
    newWorkflowBtn: 'New Workflow',
    runPipelineBtn: 'Run Pipeline Now',
    pricingNavLabel: 'Pricing & Plans',
    loginBtnLabel: 'Sign In',
    registerBtnLabel: 'Create Account',
    accountProfileLabel: 'My Account',
    logoutBtnLabel: 'Sign Out',
    categoryLabels: {
      all: 'All',
      workflows: 'Workflows',
      pdf: 'PDF Hub',
      word: 'Word Studio',
      excel: 'Excel & Data',
      powerpoint: 'PowerPoint',
      image: 'Image Studio',
      text: 'Text & Fixer',
      audio: 'Audio Lab',
      video: 'Video & AI',
      convert: 'Convert & Export',
      security: 'Security & Optimize',
    },
    hubLabels: {
      pdf: 'PDF Hub',
      word: 'Word Studio',
      excel: 'Excel & Data',
      powerpoint: 'PowerPoint',
      image: 'Image Studio',
      text: 'Text & Fixer',
      audio: 'Audio Lab',
      video: 'Video & AI',
    },
  },
  es: {
    heroTitle: 'Hola, empecemos ahora',
    heroSubtitlePrefix: 'Tu caja de herramientas inteligente todo en uno · ',
    heroSubtitleSuffix: ' herramientas locales para PDF, Word, Excel, PowerPoint, Imagen, Texto, Audio y Video',
    searchPlaceholder:
      'Buscar herramientas o formatos (ej: Unir PDF, Reparar Word, Limpiar Excel, PowerPoint, Quitar fondo)...',
    createWorkflowBtn: 'Crear flujo',
    createWorkflowCardTitle: 'Crear un flujo de trabajo',
    createWorkflowCardDesc:
      'Crea flujos personalizados con tus herramientas favoritas, automatiza tareas y reutilízalos cuando quieras.',
    openAction: 'Abrir',
    newBadge: '¡Nuevo!',
    workYourWayTitle: 'Trabaja a tu manera',
    workYourWaySubtitle:
      'Encadena herramientas de PDF, Office, Imagen, Texto, Audio y Video en tu navegador o ejecuta un flujo predefinido con un clic.',
    presetPipelineLabel: 'Flujo predefinido',
    savedSecSuffix: 's ahorrados',
    launchBtn: 'Ejecutar',
    privacyTitle: 'Privacidad 100% en tu navegador',
    privacyDesc:
      'Impulsado por WebAssembly, pdf-lib, PDF.js, ExcelJS y HTML5 Canvas. Tus documentos PDF, Word, Excel, fotos y audios nunca salen de tu dispositivo.',
    sessionActivityTitle: 'Actividad de la sesión local',
    sessionCompletedSuffix: 'completadas',
    sessionEmptyDesc:
      'Haz clic en cualquier herramienta arriba para procesar un archivo; tus descargas se registrarán aquí.',
    noToolsTitle: 'No se encontraron herramientas',
    noToolsDesc: 'Ninguna herramienta coincide con tu búsqueda en esta categoría.',
    resetFiltersBtn: 'Restablecer filtros',
    savedWorkflowsTitle: 'Flujos de trabajo guardados',
    savedWorkflowsDesc: 'Automatiza tareas repetitivas de PDF, Office, Imagen, Audio y Video en secuencia.',
    newWorkflowBtn: 'Nuevo flujo',
    runPipelineBtn: 'Ejecutar flujo ahora',
    pricingNavLabel: 'Precios y Planes',
    loginBtnLabel: 'Iniciar sesión',
    registerBtnLabel: 'Crear cuenta',
    accountProfileLabel: 'Mi Cuenta',
    logoutBtnLabel: 'Cerrar sesión',
    categoryLabels: {
      all: 'Todo',
      workflows: 'Flujos',
      pdf: 'Hub PDF',
      word: 'Studio Word',
      excel: 'Excel y Datos',
      powerpoint: 'PowerPoint',
      image: 'Estudio Imagen',
      text: 'Texto y Utilidades',
      audio: 'Lab Audio',
      video: 'Video e IA',
      convert: 'Convertir y Exportar',
      security: 'Seguridad y Optimizar',
    },
    hubLabels: {
      pdf: 'Hub PDF',
      word: 'Studio Word',
      excel: 'Excel y Datos',
      powerpoint: 'PowerPoint',
      image: 'Estudio Imagen',
      text: 'Texto y Utilidades',
      audio: 'Lab Audio',
      video: 'Video e IA',
    },
  },
};

const TOOL_TEXT_TRANSLATIONS: Record<
  string,
  Record<Exclude<AppLanguage, 'en'>, { title: string; description: string }>
> = {
  'merge-pdf': {
    ar: {
      title: 'دمج PDF',
      description: 'ادمج عدة ملفات PDF في ملف واحد بالترتيب الذي تريده بسهولة وسرعة فائقة.',
    },
    fr: {
      title: 'Fusionner PDF',
      description: 'Combinez plusieurs fichiers PDF dans l’ordre souhaité en quelques secondes.',
    },
    es: {
      title: 'Unir PDF',
      description: 'Combina varios archivos PDF en el orden que prefieras de forma rápida y sencilla.',
    },
  },
  'split-pdf': {
    ar: {
      title: 'تقسيم PDF',
      description: 'افصل صفحة واحدة أو مجموعة صفحات محددة من ملف PDF إلى ملفات مستقلة.',
    },
    fr: {
      title: 'Diviser PDF',
      description: 'Séparez une page ou un ensemble de pages pour créer des fichiers PDF indépendants.',
    },
    es: {
      title: 'Dividir PDF',
      description: 'Extrae una página o un rango de páginas en archivos PDF independientes.',
    },
  },
  'compress-pdf': {
    ar: {
      title: 'ضغط PDF',
      description: 'قلل حجم ملف الـ PDF مع الحفاظ على أعلى جودة ممكنة للنصوص والصور.',
    },
    fr: {
      title: 'Compresser PDF',
      description: 'Réduisez la taille de vos fichiers PDF tout en conservant une qualité optimale.',
    },
    es: {
      title: 'Comprimir PDF',
      description: 'Reduce el tamaño de tu archivo PDF manteniendo la máxima calidad visual.',
    },
  },
  'pdf-to-word': {
    ar: {
      title: 'PDF إلى Word',
      description: 'حوّل ملفات PDF والسير الذاتية إلى ملفات Word (.DOCX) قابلة للتعديل مع حفظ التصميم والصورة.',
    },
    fr: {
      title: 'PDF en Word',
      description: 'Convertissez vos PDF en documents DOCX éditables en conservant la mise en page et la photo.',
    },
    es: {
      title: 'PDF a Word',
      description: 'Convierte tus archivos PDF en documentos Word (.DOCX) editables conservando el diseño y foto.',
    },
  },
  'pdf-to-powerpoint': {
    ar: {
      title: 'PDF إلى PowerPoint',
      description: 'حوّل ملفات PDF إلى عروض تقديمية احترافية (.PPTX) بشرائح قابلة للتعديل.',
    },
    fr: {
      title: 'PDF en PowerPoint',
      description: 'Transformez vos fichiers PDF en présentations PowerPoint (.PPTX) 16:9 éditables.',
    },
    es: {
      title: 'PDF a PowerPoint',
      description: 'Convierte tus archivos PDF en presentaciones PowerPoint (.PPTX) 16:9 editables.',
    },
  },
  'pdf-to-excel': {
    ar: {
      title: 'PDF إلى Excel',
      description: 'استخرج البيانات وارسم جداول Excel (.XLSX) منسقة وملونة تلقائياً من ملفات PDF.',
    },
    fr: {
      title: 'PDF en Excel',
      description: 'Extrayez les données et tracez automatiquement des tableaux Excel (.XLSX) structurés.',
    },
    es: {
      title: 'PDF a Excel',
      description: 'Extrae datos y dibuja tablas Excel (.XLSX) estructuradas directamente desde tu PDF.',
    },
  },
  'word-to-pdf': {
    ar: {
      title: 'Word إلى PDF',
      description: 'حوّل مستندات Word (.DOCX) والنصوص إلى ملفات PDF جاهزة للطباعة والمشاركة.',
    },
    fr: {
      title: 'Word en PDF',
      description: 'Convertissez vos fichiers DOC, DOCX et textes en documents PDF universels.',
    },
    es: {
      title: 'Word a PDF',
      description: 'Convierte documentos DOCX y archivos de texto en archivos PDF listos para compartir.',
    },
  },
  'jpg-to-pdf': {
    ar: {
      title: 'صور إلى PDF',
      description: 'حوّل صور JPG و PNG و WebP إلى مستند PDF واحد في ثوانٍ مع ضبط الهوامش.',
    },
    fr: {
      title: 'JPG en PDF',
      description: 'Convertissez vos images JPG, PNG et WebP en un document PDF en quelques secondes.',
    },
    es: {
      title: 'JPG a PDF',
      description: 'Convierte imágenes JPG, PNG y WebP en un documento PDF en segundos.',
    },
  },
  'edit-pdf': {
    ar: {
      title: 'تعديل PDF',
      description: 'أضف نصوصاً أو ملاحظات أو أختاماً توضيحية مباشرة على صفحات ملف الـ PDF.',
    },
    fr: {
      title: 'Modifier PDF',
      description: 'Ajoutez du texte, des notes et des annotations directement sur vos pages PDF.',
    },
    es: {
      title: 'Editar PDF',
      description: 'Añade texto, notas y anotaciones directamente sobre tus páginas PDF.',
    },
  },
  'watermark-pdf': {
    ar: {
      title: 'علامة مائية PDF',
      description: 'أضف نصاً أو ختم علامة مائية احترافية على صفحات PDF مع التحكم في الشفافية والزاوية.',
    },
    fr: {
      title: 'Filigrane PDF',
      description: 'Estampillez un texte en filigrane sur votre PDF avec contrôle de l’opacité.',
    },
    es: {
      title: 'Marca de agua',
      description: 'Estampa texto como marca de agua en tu PDF eligiendo transparencia y rotación.',
    },
  },
  'rotate-pdf': {
    ar: {
      title: 'تدوير PDF',
      description: 'قم بتدوير صفحات ملف الـ PDF بزاوية 90° أو 180° أو 270° وحفظها فوراً.',
    },
    fr: {
      title: 'Pivoter PDF',
      description: 'Faites pivoter toutes les pages de votre PDF à 90°, 180° ou 270° instantanément.',
    },
    es: {
      title: 'Rotar PDF',
      description: 'Gira las páginas de tu archivo PDF a 90°, 180° o 270° en un instante.',
    },
  },
  'unlock-pdf': {
    ar: {
      title: 'فتح قفل PDF',
      description: 'أزل قيود الحماية من ملفات الـ PDF المصرح لك باستخدامها بسهولة.',
    },
    fr: {
      title: 'Déverrouiller PDF',
      description: 'Supprimez les restrictions de vos fichiers PDF autorisés en un clic.',
    },
    es: {
      title: 'Desbloquear PDF',
      description: 'Elimina restricciones de contraseña en tus archivos PDF autorizados.',
    },
  },
  'protect-pdf': {
    ar: {
      title: 'حماية PDF',
      description: 'أضف ختم حماية وتأمين لمستندات PDF الحساسة لمنع التعديل غير المصرح به.',
    },
    fr: {
      title: 'Protéger PDF',
      description: 'Sécurisez vos documents PDF confidentiels localement dans votre navigateur.',
    },
    es: {
      title: 'Proteger PDF',
      description: 'Protege y sella tus documentos PDF confidenciales localmente.',
    },
  },
  'organize-pdf': {
    ar: {
      title: 'ترتيب صفحات PDF',
      description: 'أعد ترتيب صفحات ملف الـ PDF أو احذف الصفحات غير المرغوب فيها بسهولة.',
    },
    fr: {
      title: 'Organiser PDF',
      description: 'Triez, réorganisez ou extrayez les pages de votre fichier PDF comme vous le souhaitez.',
    },
    es: {
      title: 'Organizar PDF',
      description: 'Ordena y reorganiza las páginas de tu archivo PDF a tu gusto.',
    },
  },
  'page-numbers-pdf': {
    ar: {
      title: 'ترقيم صفحات PDF',
      description: 'أضف أرقام الصفحات إلى مستند PDF مع اختيار الموضع (أسفل الوسط، اليمين، أو الأعلى).',
    },
    fr: {
      title: 'Numéros de page',
      description: 'Ajoutez facilement une numérotation claire en haut ou au bas de chaque page PDF.',
    },
    es: {
      title: 'Números de página',
      description: 'Añade numeración de páginas en el encabezado o pie de página de tu PDF.',
    },
  },
  'pdf-to-markdown': {
    ar: {
      title: 'PDF إلى Markdown',
      description: 'حوّل نصوص وجداول وعناوين ملف الـ PDF إلى صيغة Markdown نظيفة ومنسقة.',
    },
    fr: {
      title: 'PDF en Markdown',
      description: 'Convertissez vos PDF en fichiers Markdown propres avec titres et tableaux.',
    },
    es: {
      title: 'PDF a Markdown',
      description: 'Convierte archivos PDF en código Markdown limpio con encabezados y tablas.',
    },
  },
  'image-resizer': {
    ar: {
      title: 'تغيير حجم وقص الصور',
      description: 'غيّر أبعاد الصورة بالبكسل واضبط نسب العرض إلى الارتفاع (16:9, 4:3, 1:1) بدقة عالية.',
    },
    fr: {
      title: 'Redimensionner & Rogner',
      description: 'Modifiez les dimensions en pixels et verrouillez les ratios d’image (16:9, 4:3, 1:1).',
    },
    es: {
      title: 'Redimensionar y Recortar',
      description: 'Cambia dimensiones en píxeles y ajusta proporciones (16:9, 4:3, 1:1) con precisión.',
    },
  },
  'combine-images': {
    ar: {
      title: 'دمج وتجميع الصور',
      description: 'ادمج عدة صور جنباً إلى جنب أفقياً أو عمودياً أو في شبكة مجمعة واحدة.',
    },
    fr: {
      title: 'Combiner des images',
      description: 'Assemblez plusieurs images horizontalement, verticalement ou en grille.',
    },
    es: {
      title: 'Combinar imágenes',
      description: 'Une varias imágenes en una tira horizontal, vertical o cuadrícula.',
    },
  },
  'color-filter-lab': {
    ar: {
      title: 'مختبر الألوان والفلاتر',
      description: 'تحكم في السطوع والتباين والتشبع اللوني وطبّق فلاتر احترافية مباشرة.',
    },
    fr: {
      title: 'Labo Couleurs & Filtres',
      description: 'Ajustez la luminosité, le contraste, la saturation et appliquez des filtres studio.',
    },
    es: {
      title: 'Laboratorio de Color y Filtros',
      description: 'Ajusta brillo, contraste, saturación y aplica filtros artísticos en vivo.',
    },
  },
  'ai-image-enhancer': {
    ar: {
      title: 'تحسين جودة الصور بالذكاء',
      description: 'وضّح تفاصيل الصور وزد من حدة الحواف وجودة الدقة مباشرة داخل المتصفح.',
    },
    fr: {
      title: 'Amélioration d’image IA',
      description: 'Améliorez la netteté, les détails et la clarté de vos photos localement.',
    },
    es: {
      title: 'Mejorador de Imagen IA',
      description: 'Mejora la nitidez, claridad y resolución de tus imágenes en el navegador.',
    },
  },
  'background-remover': {
    ar: {
      title: 'إزالة خلفية الصور',
      description: 'احذف خلفية الصورة فوراً وحمّلها بصيغة PNG شفافة عالية الدقة.',
    },
    fr: {
      title: 'Supprimer l’arrière-plan',
      description: 'Détourez vos images instantanément et exportez en PNG transparent.',
    },
    es: {
      title: 'Quitar fondo de imagen',
      description: 'Elimina el fondo de tus imágenes al instante y exporta en PNG transparente.',
    },
  },
  'format-converter': {
    ar: {
      title: 'محول صيغ الصور',
      description: 'حوّل الصور بين صيغ WebP و PNG و JPG و HEIC مع التحكم في نسبة الجودة.',
    },
    fr: {
      title: 'Convertisseur de formats',
      description: 'Convertissez vos images entre WebP, PNG, JPG et HEIC avec contrôle de qualité.',
    },
    es: {
      title: 'Convertidor de formatos',
      description: 'Convierte imágenes entre WebP, PNG, JPG y HEIC ajustando la calidad.',
    },
  },
  'pdf-to-jpg': {
    ar: {
      title: 'PDF إلى صور JPG',
      description: 'حوّل كل صفحة من ملف الـ PDF إلى صورة JPG أو PNG عالية الوضوح.',
    },
    fr: {
      title: 'PDF en JPG',
      description: 'Convertissez chaque page d’un PDF en image JPG ou PNG haute résolution.',
    },
    es: {
      title: 'PDF a JPG',
      description: 'Convierte cada página de tu PDF en una imagen JPG o PNG de alta resolución.',
    },
  },
  'audio-trimmer': {
    ar: {
      title: 'قص وتقطيع الصوت',
      description: 'اقطع أجزاء دقيقة من المقاطع الصوتية عبر الموجة الصوتية التفاعلية وحمّلها بصيغة WAV.',
    },
    fr: {
      title: 'Découpeur Audio',
      description: 'Coupez des sections précises de vos pistes audio sur une forme d’onde interactive.',
    },
    es: {
      title: 'Recortador de Audio',
      description: 'Corta secciones precisas de pistas de audio sobre una onda interactiva.',
    },
  },
  'speed-pitch': {
    ar: {
      title: 'تغيير سرعة ونبرة الصوت',
      description: 'تحكم في سرعة التشغيل (0.5x–2.0x) وطبقة الصوت للمحاضرات والمقاطع الصوتية.',
    },
    fr: {
      title: 'Vitesse & Tonalité Audio',
      description: 'Modifiez le tempo, la vitesse de lecture et la hauteur tonale en temps réel.',
    },
    es: {
      title: 'Velocidad y Tono de Audio',
      description: 'Modifica la velocidad de reproducción y el tono en semitonos fácilmente.',
    },
  },
  'extract-audio': {
    ar: {
      title: 'استخراج الصوت من الفيديو',
      description: 'استخرج المسار الصوتي من ملفات الفيديو MP4 و MOV وحفظه بصيغة صوتية نقية.',
    },
    fr: {
      title: 'Extraire l’audio d’une vidéo',
      description: 'Convertissez vos vidéos MP4 et MOV en pistes audio WAV/MP3 haute qualité.',
    },
    es: {
      title: 'Extraer audio de video',
      description: 'Convierte videos MP4 y MOV en pistas de audio WAV/MP3 de alta calidad.',
    },
  },
  'volume-booster': {
    ar: {
      title: 'رفع وتقوية مستوى الصوت',
      description: 'ارفع مستوى الصوت حتى +12 dB مع مانع تشويش ذكي للحفاظ على نقاء الصوت.',
    },
    fr: {
      title: 'Amplificateur de volume',
      description: 'Augmentez le volume sonore jusqu’à +12 dB sans distorsion grâce au limiteur DSP.',
    },
    es: {
      title: 'Amplificador de volumen',
      description: 'Aumenta la ganancia de sonido hasta +12 dB sin distorsión.',
    },
  },
  'video-compressor': {
    ar: {
      title: 'ضغط وتصغير الفيديو',
      description: 'قلل حجم ملفات الفيديو مع التحكم في الدقة (1080p/720p/480p) ومعدل البت.',
    },
    fr: {
      title: 'Compresseur Vidéo',
      description: 'Réduisez la taille de vos vidéos en ajustant la résolution et le facteur CRF.',
    },
    es: {
      title: 'Compresor de Video',
      description: 'Reduce el tamaño de tus videos ajustando la resolución y calidad CRF.',
    },
  },
  'video-to-gif': {
    ar: {
      title: 'تحويل الفيديو إلى GIF',
      description: 'حوّل لقطات الفيديو إلى صور متحركة GIF خفيفة مع التحكم في عدد الإطارات والأبعاد.',
    },
    fr: {
      title: 'Vidéo en GIF animé',
      description: 'Transformez vos clips vidéo en GIFs animés légers avec contrôle des FPS.',
    },
    es: {
      title: 'Video a GIF animado',
      description: 'Convierte clips de video en GIFs animados ligeros configurando FPS y tamaño.',
    },
  },
  'speech-to-text': {
    ar: {
      title: 'تحويل الكلام إلى نص',
      description: 'فرّغ التسجيلات الصوتية والإملاء المباشر باللغة العربية والفرنسية والإنجليزية إلى نص أو ملف ترجمة SRT.',
    },
    fr: {
      title: 'Transcription Audio en Texte',
      description: 'Transcrivez la parole en texte horodaté, Markdown ou sous-titres SRT.',
    },
    es: {
      title: 'Voz a Texto / Transcribir',
      description: 'Transcribe grabaciones o dictado en vivo a texto, Markdown o subtítulos SRT.',
    },
  },
  'word-format-doctor': {
    ar: {
      title: 'مصلح تنسيق مستندات Word',
      description: 'أصلح تقطع الأسطر بعد النسخ من PDF، احذف الفراغات الزائدة، واضبط علامات الترقيم العربية وصدّر ملف Word (.DOCX) منسق.',
    },
    fr: {
      title: 'Réparateur de format Word',
      description: 'Corrigez les sauts de ligne cassés, supprimez les espaces doubles et exportez un fichier Word (.DOCX) propre.',
    },
    es: {
      title: 'Doctor de Formato Word',
      description: 'Corrige saltos de línea rotos al copiar de PDF, limpia espacios extra y exporta un documento Word (.DOCX) impecable.',
    },
  },
  'merge-word-docs': {
    ar: {
      title: 'دمج ملفات Word (.DOCX)',
      description: 'ادمج عدة ملفات Word ونصوص في مستند (.DOCX) موحد مع فهرس تلقائي وفواصل صفحات احترافية.',
    },
    fr: {
      title: 'Fusionner des fichiers Word',
      description: 'Combinez plusieurs documents Word (.DOCX) et textes en un seul fichier maître avec table des matières.',
    },
    es: {
      title: 'Unir Documentos Word',
      description: 'Combina varios archivos Word (.DOCX) y textos en un documento maestro con saltos de página automáticos.',
    },
  },
  'excel-duplicate-cleaner': {
    ar: {
      title: 'منظف بيانات وتكرارات Excel',
      description: 'احذف الصفوف المكررة والفارغة تلقائياً، نظّف المسافات المخفية، وحّد حالة الأحرف وصدّر جدول Excel (.XLSX) نظيف.',
    },
    fr: {
      title: 'Nettoyeur de doublons Excel',
      description: 'Supprimez les lignes en double, nettoyez les espaces invisibles et exportez une feuille Excel (.XLSX) propre.',
    },
    es: {
      title: 'Limpiador de Duplicados Excel',
      description: 'Elimina filas duplicadas y vacías, limpia espacios ocultos y exporta una tabla Excel (.XLSX) estructurada.',
    },
  },
  'excel-csv-converter': {
    ar: {
      title: 'محول Excel / CSV / JSON إلى PDF',
      description: 'أصلح مشاكل ترميز ملفات CSV العربية، وحوّل بيانات CSV و JSON إلى جداول Excel (.XLSX) ملونة أو تقارير PDF.',
    },
    fr: {
      title: 'Convertisseur Excel / CSV / JSON & PDF',
      description: 'Corrigez l’encodage CSV et convertissez vos données CSV ou JSON en tableaux Excel (.XLSX) ou rapports PDF.',
    },
    es: {
      title: 'Convertidor Excel / CSV / JSON y PDF',
      description: 'Corrige la codificación CSV y convierte datos JSON o CSV en hojas Excel (.XLSX) o informes PDF.',
    },
  },
  'ppt-slide-generator': {
    ar: {
      title: 'صانع عروض PowerPoint الذكي',
      description: 'حوّل ملخصات الاجتماعات والمحاضرات أو النقاط النصية فوراً إلى عرض تقديمي (.PPTX) بشرائح عريضة 16:9 جاهزة.',
    },
    fr: {
      title: 'Créateur instantané PowerPoint',
      description: 'Transformez vos notes de réunion ou plans de cours en une présentation PowerPoint (.PPTX) 16:9 en un clic.',
    },
    es: {
      title: 'Creador Instantáneo de PowerPoint',
      description: 'Convierte apuntes, esquemas o texto en una presentación PowerPoint (.PPTX) panorámica 16:9 al instante.',
    },
  },
  'ppt-notes-extractor': {
    ar: {
      title: 'محول العروض إلى ملخص Word و PDF',
      description: 'حوّل نقاط وعناوين العروض التقديمية إلى مذكرة مراجعة وتلخيص جاهزة للطباعة بصيغة Word (.DOCX) أو PDF.',
    },
    fr: {
      title: 'Générateur de synthèse PowerPoint',
      description: 'Convertissez le plan de vos diapositives en un document de synthèse imprimable Word (.DOCX) ou PDF.',
    },
    es: {
      title: 'Generador de Apuntes de Presentación',
      description: 'Convierte el esquema de tus diapositivas en un resumen imprimible en formato Word (.DOCX) o PDF.',
    },
  },
  'id-passport-photo-maker': {
    ar: {
      title: 'صانع صور البطاقة وجواز السفر والـ CV',
      description: 'صمّم صور رسمية بمقاس 35×45 مم أو 2×2 بوصة للسيرة الذاتية والوثائق مع خلفية استوديو موحدة وورقة طباعة مجمعة.',
    },
    fr: {
      title: 'Photo d’identité & Passeport Pro',
      description: 'Créez des photos biométriques 35×45mm ou 2×2 pouces pour CV et passeport avec planche d’impression 4×6.',
    },
    es: {
      title: 'Creador de Fotos Carnet y Pasaporte',
      description: 'Crea fotos biométricas 35×45mm o 2×2 pulgadas para CV y documentos con hoja imprimible de múltiples fotos.',
    },
  },
  'image-watermark-privacy': {
    ar: {
      title: 'ختم الصور وإخفاء البيانات الحساسة',
      description: 'احمِ صورك ووثائقك بعلامة مائية متكررة مع تمويه أو طمس أرقام البطاقات والتواقيع والمعلومات السرية.',
    },
    fr: {
      title: 'Filigrane Photo & Floutage Confidentialité',
      description: 'Protégez vos images par filigrane répété et floutez les numéros confidentiels ou informations sensibles.',
    },
    es: {
      title: 'Marca de Agua y Censura de Privacidad',
      description: 'Protege fotos con marca de agua en mosaico y pixela u oculta datos sensibles o números de identificación.',
    },
  },
  'smart-text-cleaner': {
    ar: {
      title: 'منظف النصوص وإزالة التشكيل العربي',
      description: 'أزل التشكيل والحركات والـ كشيدة من النصوص العربية، احذف الأسطر المكررة، رتّب القوائم أبجدياً واحسب عدد الكلمات.',
    },
    fr: {
      title: 'Nettoyeur de Texte & Diacritiques',
      description: 'Supprimez le Tashkeel arabe, éliminez les lignes dupliquées, triez vos listes A–Z et comptez les mots.',
    },
    es: {
      title: 'Limpiador Inteligente de Texto',
      description: 'Elimina signos diacríticos, borra líneas duplicadas, ordena listas A–Z y analiza estadísticas de palabras.',
    },
  },
  'data-extractor-studio': {
    ar: {
      title: 'مستخرج الإيميلات وأرقام الهواتف',
      description: 'استخرج جميع عناوين البريد الإلكتروني وأرقام الهواتف تلقائياً من النصوص الطويلة والملفات في قائمة منظمة.',
    },
    fr: {
      title: 'Extracteur d’Emails & Téléphones',
      description: 'Extrayez automatiquement toutes les adresses e-mail et numéros de téléphone depuis un texte brut ou fichier.',
    },
    es: {
      title: 'Extractor de Correos y Teléfonos',
      description: 'Extrae automáticamente todas las direcciones de email y números de teléfono desde textos o registros.',
    },
  },
};

export function getLocalizedTool(tool: ToolItem, lang: AppLanguage): {
  title: string;
  description: string;
  hubLabel: string;
} {
  const hubLabel = UI_TRANSLATIONS[lang].hubLabels[tool.hub];
  if (lang === 'en') {
    return {
      title: tool.title,
      description: tool.description,
      hubLabel,
    };
  }
  const entry = TOOL_TEXT_TRANSLATIONS[tool.id]?.[lang];
  return {
    title: entry?.title || tool.title,
    description: entry?.description || tool.description,
    hubLabel,
  };
}
