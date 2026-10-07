import React, { useState } from 'react';
import {
  Check,
  Sparkles,
  ShieldCheck,
  Zap,
  Building2,
  Crown,
} from 'lucide-react';
import { AppLanguage } from '../data/translations';

export type PlanTierId = 'free' | 'pro' | 'business';

interface PricingPlansSectionProps {
  language: AppLanguage;
  activePlan: PlanTierId;
  onSelectPlan: (plan: PlanTierId) => void;
}

const PRICING_CONTENT: Record<
  AppLanguage,
  {
    badge: string;
    title: string;
    subtitle: string;
    monthlyLabel: string;
    yearlyLabel: string;
    saveBadge: string;
    perMonth: string;
    popularBadge: string;
    currentPlanBtn: string;
    selectPlanBtn: string;
    plans: {
      id: PlanTierId;
      name: string;
      tagline: string;
      monthlyPrice: number;
      yearlyPrice: number;
      features: string[];
    }[];
  }
> = {
  ar: {
    badge: 'تسعير الخدمات والباقات',
    title: 'اختر الباقة المناسبة لاحتياجاتك وأعمالك',
    subtitle:
      'جميع الباقات تمنحك معالجة سريعة ومحمية داخل المتصفح لملفات الـ PDF والصور والصوت والفيديو بدون أي إعلانات مزعجة.',
    monthlyLabel: 'اشتراك شهري',
    yearlyLabel: 'اشتراك سنوي',
    saveBadge: 'وفّر 25%',
    perMonth: '/ شهرياً',
    popularBadge: 'الأكثر طلباً للمحترفين',
    currentPlanBtn: 'باقتك الحالية المفعّلة ✓',
    selectPlanBtn: 'اختيار وتفعيل هذه الباقة',
    plans: [
      {
        id: 'free',
        name: 'الباقة الأساسية (Starter Free)',
        tagline: 'للاستخدام الشخصي اليومي السريع على المستندات والصور.',
        monthlyPrice: 0,
        yearlyPrice: 0,
        features: [
          'الوصول إلى جميع أدوات PDF الأساسية (دمج، تقسيم، تدوير، ترقيم)',
          'تحويل PDF إلى Word و Excel و PowerPoint حتى 15 ميغابايت للملف',
          'تغيير حجم وقص الصور وتحويل الصيغ (JPG, PNG, WebP)',
          'حماية ملفات PDF بكلمة سر قياسية AES-256',
          'معالجة محلية آمنة 100% داخل متصفحك',
        ],
      },
      {
        id: 'pro',
        name: 'باقة المحترفين (Pro Studio)',
        tagline: 'للمهندسين، المصممين، وصناع المحتوى الذين يحتاجون لأقصى دقة وذكاء.',
        monthlyPrice: 9,
        yearlyPrice: 7,
        features: [
          'تحويل احترافي غير محدود: PDF إلى Word و Excel (مع رسم الجداول) و PowerPoint 16:9',
          'تحسين جودة الصور بالذكاء الاصطناعي (إزالة الضباب + تناسق الألوان التلقائي HD)',
          'إزالة خلفية الصور الاحترافية مع الحفاظ الكامل على العنصر الرئيسي',
          'تشفير PDF المزدوج المضاد لكسر الحماية (AES-256 R=6 Standard)',
          'إنشاء وتشغيل مسارات عمل ذكية (Workflows) غير محدودة بضغطة واحدة',
          'تصدير صوتيات WAV/MP3 وضغط الفيديو 1080p بدون علامة مائية',
        ],
      },
      {
        id: 'business',
        name: 'باقة الشركات والمؤسسات (Business)',
        tagline: 'للشركات وفرق العمل التي تتطلب معالجة دفعات كبيرة وأمان مؤسسي.',
        monthlyPrice: 24,
        yearlyPrice: 18,
        features: [
          'كل مميزات باقة المحترفين (Pro Studio) بدون أي حدود لحجم الملفات',
          'معالجة دفعات كبيرة (Batch Processing) لعشرات ملفات الـ PDF والصور معاً',
          'أختام رسمية وعلامات مائية مخصصة باسم شركتك أو مؤسستك',
          'إدارة حسابات فريق العمل (حتى 10 مستخدمين في نفس الباقة)',
          'دعم فني مخصص ذو أولوية قصوى وتحديثات فورية للمحركات',
        ],
      },
    ],
  },
  fr: {
    badge: 'Tarifs & Forfaits des Services',
    title: 'Choisissez le forfait adapté à vos besoins',
    subtitle:
      'Une tarification transparente selon votre volume de documents PDF, images haute résolution et flux automatisés.',
    monthlyLabel: 'Mensuel',
    yearlyLabel: 'Annuel',
    saveBadge: '-25%',
    perMonth: '/ mois',
    popularBadge: 'Le plus populaire',
    currentPlanBtn: 'Forfait Actif ✓',
    selectPlanBtn: 'Choisir ce forfait',
    plans: [
      {
        id: 'free',
        name: 'Forfait Gratuit (Starter)',
        tagline: 'Idéal pour les besoins quotidiens rapides sur vos PDF et images.',
        monthlyPrice: 0,
        yearlyPrice: 0,
        features: [
          'Outils PDF essentiels (Fusionner, Diviser, Pivoter, Numéroter)',
          'Conversion PDF en Word, Excel et PowerPoint (jusqu’à 15 Mo)',
          'Redimensionnement d’image et conversion JPG / PNG / WebP',
          'Protection PDF par mot de passe standard AES-256',
          'Traitement 100% local et confidentiel dans le navigateur',
        ],
      },
      {
        id: 'pro',
        name: 'Forfait Pro Studio',
        tagline: 'Pour les professionnels exigeant une précision maximale et les outils IA.',
        monthlyPrice: 9,
        yearlyPrice: 7,
        features: [
          'Conversions illimitées PDF vers Word, Excel (tableaux tracés) & PowerPoint 16:9',
          'Amélioration d’image IA (Anti-brume Dehaze + Harmonie des couleurs HD)',
          'Détourage intelligent & suppression d’arrière-plan avec protection du sujet',
          'Chiffrement PDF 2.0 AES-256 haute sécurité',
          'Création illimitée de flux de travail automatisés (Workflows)',
          'Compression vidéo 1080p et studio audio complet sans filigrane',
        ],
      },
      {
        id: 'business',
        name: 'Forfait Business & Équipe',
        tagline: 'Pour les entreprises et équipes traitant de grands volumes de fichiers.',
        monthlyPrice: 24,
        yearlyPrice: 18,
        features: [
          'Toutes les fonctionnalités Pro Studio sans limite de taille de fichier',
          'Traitement par lots (Batch) pour des dizaines de PDF et photos simultanément',
          'Filigranes et tampons de sécurité personnalisés au nom de l’entreprise',
          'Jusqu’à 10 comptes collaborateurs inclus',
          'Support technique prioritaire dédié 24/7',
        ],
      },
    ],
  },
  en: {
    badge: 'Service Pricing & Plans',
    title: 'Flexible Plans Tailored to Your Workflow',
    subtitle:
      'Transparent pricing by package tier—unlock unlimited AI image enhancement, smart background removal, and enterprise PDF pipelines.',
    monthlyLabel: 'Monthly Billing',
    yearlyLabel: 'Annual Billing',
    saveBadge: 'Save 25%',
    perMonth: '/ month',
    popularBadge: 'Most Popular',
    currentPlanBtn: 'Current Active Plan ✓',
    selectPlanBtn: 'Select & Activate Plan',
    plans: [
      {
        id: 'free',
        name: 'Starter Free',
        tagline: 'Essential everyday PDF, image, and audio utilities for personal use.',
        monthlyPrice: 0,
        yearlyPrice: 0,
        features: [
          'Core PDF utilities (Merge, Split, Rotate, Page Numbers)',
          'PDF to Word, Excel & PowerPoint conversion up to 15 MB per file',
          'Image Resizer, Cropper & Format Converter (JPG, PNG, WebP)',
          'Standard AES-256 PDF Password Protection',
          '100% Client-Side Browser Privacy Architecture',
        ],
      },
      {
        id: 'pro',
        name: 'Pro Studio',
        tagline: 'Full power for creators, engineers, and professionals.',
        monthlyPrice: 9,
        yearlyPrice: 7,
        features: [
          'Unlimited PDF to Word, Drawn-Table Excel (.XLSX) & 16:9 PowerPoint (.PPTX)',
          'AI Image Enhancer (Atmospheric Dehaze + Smart Color Harmony + Unsharp HD)',
          'Smart Connected-Edge Background Remover with Foreground Core Protection',
          'Hardened PDF 2.0 AES-256 (R=6) Document Encryption',
          'Unlimited Multi-Step Custom Workflows & Automation Pipelines',
          '1080p Video Compression, GIF Encoding & Lossless WAV Audio Export',
        ],
      },
      {
        id: 'business',
        name: 'Business Enterprise',
        tagline: 'Built for teams, agencies, and high-volume document operations.',
        monthlyPrice: 24,
        yearlyPrice: 18,
        features: [
          'Everything in Pro Studio with unlimited file sizes & batch queues',
          'High-speed multi-file batch processing across PDF & Image Studio',
          'Custom corporate watermarks, legal stamps & brand presets',
          'Team workspace management for up to 10 member seats',
          'Dedicated priority engineering support & SLA guarantee',
        ],
      },
    ],
  },
  es: {
    badge: 'Precios y Planes de Servicio',
    title: 'Elige el plan ideal para tu trabajo',
    subtitle:
      'Precios claros según tu paquete: desbloquea mejora de imágenes con IA, recorte de fondos inteligente y conversión avanzada de PDF.',
    monthlyLabel: 'Mensual',
    yearlyLabel: 'Anual',
    saveBadge: 'Ahorra 25%',
    perMonth: '/ mes',
    popularBadge: 'Más Popular',
    currentPlanBtn: 'Plan Actual Activo ✓',
    selectPlanBtn: 'Seleccionar este Plan',
    plans: [
      {
        id: 'free',
        name: 'Plan Básico (Gratis)',
        tagline: 'Para tareas personales diarias con documentos PDF e imágenes.',
        monthlyPrice: 0,
        yearlyPrice: 0,
        features: [
          'Herramientas PDF esenciales (Unir, Dividir, Rotar, Numerar)',
          'Conversión de PDF a Word, Excel y PowerPoint hasta 15 MB',
          'Redimensionar, recortar y convertir imágenes (JPG, PNG, WebP)',
          'Protección de PDF con contraseña estándar AES-256',
          'Privacidad 100% local dentro de tu navegador',
        ],
      },
      {
        id: 'pro',
        name: 'Plan Pro Studio',
        tagline: 'Para profesionales y creadores que requieren máxima calidad e IA.',
        monthlyPrice: 9,
        yearlyPrice: 7,
        features: [
          'Conversión ilimitada PDF a Word, Excel (con tablas dibujadas) y PowerPoint 16:9',
          'Mejorador de Imagen IA (Eliminación de niebla Dehaze + Armonía de color HD)',
          'Removedor de fondo inteligente conservando el objeto principal al 100%',
          'Cifrado avanzado de documentos PDF 2.0 AES-256',
          'Flujos de trabajo personalizados (Workflows) ilimitados',
          'Compresión de video 1080p y exportación de audio WAV sin marcas',
        ],
      },
      {
        id: 'business',
        name: 'Plan Business Empresas',
        tagline: 'Para empresas y equipos con alto volumen de documentos.',
        monthlyPrice: 24,
        yearlyPrice: 18,
        features: [
          'Todo lo incluido en Pro Studio sin límites de tamaño de archivo',
          'Procesamiento por lotes (Batch) de múltiples archivos simultáneamente',
          'Marcas de agua y sellos corporativos personalizados',
          'Acceso para equipos de hasta 10 usuarios incluidos',
          'Soporte técnico prioritario dedicado',
        ],
      },
    ],
  },
};

export const PricingPlansSection: React.FC<PricingPlansSectionProps> = ({
  language,
  activePlan,
  onSelectPlan,
}) => {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('yearly');
  const P = PRICING_CONTENT[language];

  return (
    <section
      id="pricing-section"
      className="mt-16 pt-12 border-t border-slate-200 dark:border-slate-800/80 scroll-mt-20"
    >
      <div className="text-center max-w-2xl mx-auto mb-8">
        <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-bold bg-red-50 text-[#e5322d] border border-red-200/80 mb-3">
          <Crown className="w-3.5 h-3.5" />
          {P.badge}
        </span>
        <h2 className="text-xl sm:text-2xl font-extrabold text-[#111827] dark:text-white mb-2">
          {P.title}
        </h2>
        <p className="text-xs sm:text-sm text-[#64748b] dark:text-slate-400 leading-relaxed mb-6">
          {P.subtitle}
        </p>

        {/* Monthly / Yearly Pill Toggle */}
        <div className="inline-flex items-center p-1 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xs">
          <button
            type="button"
            onClick={() => setBillingCycle('monthly')}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
              billingCycle === 'monthly'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50'
            }`}
          >
            {P.monthlyLabel}
          </button>
          <button
            type="button"
            onClick={() => setBillingCycle('yearly')}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all inline-flex items-center gap-1.5 cursor-pointer ${
              billingCycle === 'yearly'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50'
            }`}
          >
            <span>{P.yearlyLabel}</span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-extrabold">
              {P.saveBadge}
            </span>
          </button>
        </div>
      </div>

      {/* 3 Clean White Pricing Tier Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        {P.plans.map((plan) => {
          const isPro = plan.id === 'pro';
          const isCurrent = activePlan === plan.id;
          const price =
            billingCycle === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice;

          return (
            <div
              key={plan.id}
              className={`relative rounded-2xl p-6 bg-white dark:bg-slate-900 text-[#111827] dark:text-white flex flex-col justify-between transition-all hover:shadow-md ${
                isPro
                  ? 'border-2 border-[#e5322d] shadow-sm'
                  : 'border border-slate-200 dark:border-slate-800 hover:border-slate-300'
              }`}
            >
              {isPro && (
                <div className="absolute -top-3.5 right-6 left-6 flex justify-center">
                  <span className="px-3.5 py-1 rounded-full bg-[#e5322d] text-white text-[11px] font-extrabold shadow-xs inline-flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    {P.popularBadge}
                  </span>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <h3 className="text-base font-extrabold text-[#111827] dark:text-white">
                    {plan.name}
                  </h3>
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      plan.id === 'free'
                        ? 'bg-slate-100 text-slate-600'
                        : plan.id === 'pro'
                        ? 'bg-red-50 text-[#e5322d]'
                        : 'bg-emerald-50 text-emerald-600'
                    }`}
                  >
                    {plan.id === 'free' ? (
                      <ShieldCheck className="w-4 h-4" />
                    ) : plan.id === 'pro' ? (
                      <Zap className="w-4 h-4" />
                    ) : (
                      <Building2 className="w-4 h-4" />
                    )}
                  </div>
                </div>

                <p className="text-xs leading-relaxed mb-5 text-[#64748b] dark:text-slate-400">
                  {plan.tagline}
                </p>

                <div className="flex items-baseline gap-1.5 pb-5 mb-5 border-b border-slate-200 dark:border-slate-800">
                  <span className="text-3xl font-extrabold font-mono tabular-nums text-[#111827] dark:text-white">
                    ${price}
                  </span>
                  <span className="text-xs font-medium text-[#64748b] dark:text-slate-400">
                    {P.perMonth}
                  </span>
                </div>

                <ul className="space-y-2.5 mb-6">
                  {plan.features.map((feat, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-2.5 text-xs leading-relaxed"
                    >
                      <span
                        className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                          isPro
                            ? 'bg-red-50 text-[#e5322d]'
                            : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400'
                        }`}
                      >
                        <Check className="w-3 h-3" />
                      </span>
                      <span className="text-slate-700 dark:text-slate-300">
                        {feat}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <button
                type="button"
                onClick={() => onSelectPlan(plan.id)}
                className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  isCurrent
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : isPro
                    ? 'bg-[#e5322d] hover:bg-[#d12823] text-white shadow-xs'
                    : 'bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100'
                }`}
              >
                {isCurrent ? P.currentPlanBtn : P.selectPlanBtn}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
};
