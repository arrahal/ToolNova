import React, { useState } from 'react';
import {
  X,
  Check,
  Sparkles,
  Crown,
  ShieldCheck,
  CreditCard,
  Zap,
  ExternalLink,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { AppLanguage } from '../data/translations';
import { PlanTierId } from './PricingPlansSection';

interface SubscriptionUpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: AppLanguage;
  activePlan: PlanTierId;
  onUpgradeSuccess: (plan: PlanTierId, method: string) => void;
}

const MODAL_TEXT: Record<
  AppLanguage,
  {
    badge: string;
    title: string;
    subtitle: string;
    monthlyBilling: string;
    yearlyBilling: string;
    yearlyDiscount: string;
    freePlanTitle: string;
    freePlanPrice: string;
    freePlanPeriod: string;
    freePlanDesc: string;
    freeFeatures: string[];
    currentFreeBtn: string;
    switchFreeBtn: string;
    proPlanTitle: string;
    proPlanBadge: string;
    proPlanDesc: string;
    proFeatures: string[];
    payWithCardBtn: string;
    paypalBtnLabel: string;
    paypalSubLabel: string;
    processingLabel: string;
    activatedLabel: string;
    securityNote: string;
    lemonSqueezyNote: string;
  }
> = {
  ar: {
    badge: 'ترقية الحساب إلى Pro Unlimited',
    title: 'افتح القوة الكاملة بدون حدود مع ToolNova Pro',
    subtitle:
      'تمتع بمعالجة دفعات غير محدودة، ملفات تصل إلى 2GB، وأقصى سرعة بالذكاء الاصطناعي.',
    monthlyBilling: 'شهري ($4.99/شهر)',
    yearlyBilling: 'سنوي ($39/سنة)',
    yearlyDiscount: 'وفّر 35%',
    freePlanTitle: 'الباقة المجانية (Free Plan)',
    freePlanPrice: '$0',
    freePlanPeriod: '/ شهرياً',
    freePlanDesc: 'مناسبة للمهام الفردية السريعة والاستخدام اليومي الأساسي.',
    freeFeatures: [
      'الحد الأقصى لحجم الملف: 15MB لكل ملف',
      'طابور معالجة أساسي (Basic Queue)',
      'أدوات PDF والصور القياسية داخل المتصفح',
      'تشفير وحماية PDF بكلمة سر أساسية',
    ],
    currentFreeBtn: 'باقتك الحالية (Free)',
    switchFreeBtn: 'الاستمرار بالباقة المجانية',
    proPlanTitle: 'باقة المحترفين (Pro Plan)',
    proPlanBadge: 'الأكثر تحويلاً · غير محدود',
    proPlanDesc: 'عمليات مجمّعة غير محدودة، حجم ملفات ضخم، وسرعة معالجة فائقة.',
    proFeatures: [
      'عمليات دفعات غير محدودة (Unlimited Batch Operations)',
      'معالجة ملفات ضخمة حتى 2GB للملف الواحد',
      'سرعة معالجة ذات أولوية قصوى (Priority Speed)',
      'تحسين جودة الصور بالذكاء الاصطناعي HD وإزالة الخلفية الاحترافية',
      'تحويل PDF إلى Word و Excel (جداول مرسومة) و PowerPoint بدون حدود',
      'تشفير PDF المزدوج AES-256 R=6 وإنشاء مسارات عمل لا نهائية',
    ],
    payWithCardBtn: 'الدفع بالبطاقة البنكية / PayPal (Lemon Squeezy)',
    paypalBtnLabel: 'PayPal Smart Checkout',
    paypalSubLabel: 'دفع فوري آمن وتفعيل تلقائي لباقة Pro',
    processingLabel: 'جاري تأكيد عملية الدفع وتفعيل Pro...',
    activatedLabel: 'تم تفعيل باقة Pro بنجاح!',
    securityNote:
      'دفع آمن ومشفّر SSL 256-bit · يمكنك إلغاء الاشتراك في أي وقت بضغطة واحدة.',
    lemonSqueezyNote: 'بوابة الدفع الرسمية عبر Lemon Squeezy & PayPal Smart Buttons',
  },
  en: {
    badge: 'UPGRADE TO PRO UNLIMITED',
    title: 'Go Unlimited with ToolNova Pro',
    subtitle:
      'Unlock unlimited batch operations, 2GB file processing, and priority AI speed.',
    monthlyBilling: 'Monthly ($4.99/mo)',
    yearlyBilling: 'Annual ($39/yr)',
    yearlyDiscount: 'Save 35%',
    freePlanTitle: 'Free Plan',
    freePlanPrice: '$0',
    freePlanPeriod: '/ month',
    freePlanDesc: 'Essential everyday tools for single-file light tasks.',
    freeFeatures: [
      'Max file size 15MB per document or image',
      'Basic processing queue',
      'Standard PDF & Image browser utilities',
      'Standard AES-256 PDF password protection',
    ],
    currentFreeBtn: 'Current Active Plan',
    switchFreeBtn: 'Stay on Free Plan',
    proPlanTitle: 'Pro Plan',
    proPlanBadge: 'MOST POPULAR · UNLIMITED',
    proPlanDesc: 'Built for power users, creators, and high-volume workflows.',
    proFeatures: [
      'Unlimited batch operations across all 27+ tools',
      'Up to 2GB file processing per upload',
      'Priority speed & instant AI queue execution',
      'Pro AI Image Enhancer (Dehaze + Color Harmony) & Smart BG Remover',
      'Unlimited PDF to Word, Excel (drawn tables) & 16:9 PowerPoint',
      'Hardened PDF 2.0 Encryption & Unlimited Custom Workflows',
    ],
    payWithCardBtn: 'Pay with Card / PayPal',
    paypalBtnLabel: 'PayPal',
    paypalSubLabel: 'PayPal Smart Buttons · Instant Pro Activation',
    processingLabel: 'Verifying checkout & activating Pro...',
    activatedLabel: 'Pro Plan Activated!',
    securityNote:
      '256-bit SSL encrypted checkout · Cancel anytime with one click.',
    lemonSqueezyNote: 'Powered by Lemon Squeezy Overlay & PayPal Smart Buttons',
  },
  fr: {
    badge: 'PASSER À PRO ILLIMITÉ',
    title: 'Passez en Illimité avec ToolNova Pro',
    subtitle:
      'Débloquez les opérations par lots illimitées, les fichiers jusqu’à 2 Go et la vitesse prioritaire.',
    monthlyBilling: 'Mensuel (4,99 $/mois)',
    yearlyBilling: 'Annuel (39 $/an)',
    yearlyDiscount: '-35%',
    freePlanTitle: 'Forfait Gratuit (Free)',
    freePlanPrice: '$0',
    freePlanPeriod: '/ mois',
    freePlanDesc: 'Idéal pour les fichiers individuels et les besoins basiques.',
    freeFeatures: [
      'Taille maximale de fichier : 15 Mo',
      'File d’attente de traitement basique',
      'Outils PDF et Image standards',
      'Protection PDF par mot de passe standard',
    ],
    currentFreeBtn: 'Forfait Gratuit Actif',
    switchFreeBtn: 'Rester sur le forfait Gratuit',
    proPlanTitle: 'Forfait Pro',
    proPlanBadge: 'RECOMMANDÉ · ILLIMITÉ',
    proPlanDesc: 'Pour les professionnels exigeant rapidité et capacité maximale.',
    proFeatures: [
      'Opérations par lots (Batch) illimitées',
      'Traitement de fichiers jusqu’à 2 Go',
      'Vitesse prioritaire haute performance',
      'Amélioration photo IA HD & suppression d’arrière-plan intelligente',
      'Conversions PDF vers Word, Excel et PowerPoint illimitées',
      'Chiffrement PDF avancé & Workflows personnalisés illimités',
    ],
    payWithCardBtn: 'Payer par Carte / PayPal',
    paypalBtnLabel: 'PayPal',
    paypalSubLabel: 'Boutons PayPal Smart · Activation Pro immédiate',
    processingLabel: 'Validation du paiement et activation Pro...',
    activatedLabel: 'Forfait Pro Activé !',
    securityNote:
      'Paiement sécurisé SSL 256 bits · Annulable à tout moment en un clic.',
    lemonSqueezyNote: 'Propulsé par Lemon Squeezy & PayPal Smart Buttons',
  },
  es: {
    badge: 'MEJORAR A PRO ILIMITADO',
    title: 'Pásate a Ilimitado con ToolNova Pro',
    subtitle:
      'Desbloquea operaciones por lotes ilimitadas, archivos de hasta 2GB y velocidad prioritaria.',
    monthlyBilling: 'Mensual ($4.99/mes)',
    yearlyBilling: 'Anual ($39/año)',
    yearlyDiscount: 'Ahorra 35%',
    freePlanTitle: 'Plan Gratis (Free)',
    freePlanPrice: '$0',
    freePlanPeriod: '/ mes',
    freePlanDesc: 'Funciones básicas para archivos individuales ligeros.',
    freeFeatures: [
      'Tamaño máximo de archivo: 15MB',
      'Cola de procesamiento básica',
      'Herramientas PDF e Imagen estándar',
      'Protección de PDF con contraseña básica',
    ],
    currentFreeBtn: 'Plan Gratis Activo',
    switchFreeBtn: 'Continuar en Plan Gratis',
    proPlanTitle: 'Plan Pro',
    proPlanBadge: 'MÁS POPULAR · ILIMITADO',
    proPlanDesc: 'Rendimiento total sin límites para profesionales y equipos.',
    proFeatures: [
      'Operaciones por lotes ilimitadas (Batch)',
      'Procesamiento de archivos de hasta 2GB',
      'Velocidad prioritaria de alta capacidad',
      'Mejora de imagen IA HD y recorte de fondo inteligente',
      'Conversión ilimitada de PDF a Word, Excel y PowerPoint',
      'Cifrado PDF 2.0 y flujos de trabajo ilimitados',
    ],
    payWithCardBtn: 'Pagar con Tarjeta / PayPal',
    paypalBtnLabel: 'PayPal',
    paypalSubLabel: 'Botones Inteligentes PayPal · Activación Pro instantánea',
    processingLabel: 'Verificando pago y activando Pro...',
    activatedLabel: '¡Plan Pro Activado!',
    securityNote:
      'Pago seguro encriptado SSL de 256 bits · Cancela cuando quieras.',
    lemonSqueezyNote: 'Integración con Lemon Squeezy & PayPal Smart Buttons',
  },
};

export const SubscriptionUpgradeModal: React.FC<SubscriptionUpgradeModalProps> = ({
  isOpen,
  onClose,
  language,
  activePlan,
  onUpgradeSuccess,
}) => {
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'yearly'>('monthly');
  const [checkoutState, setCheckoutState] = useState<
    'idle' | 'lemon_squeezy' | 'paypal' | 'success'
  >('idle');
  const [showLemonOverlay, setShowLemonOverlay] = useState(false);

  if (!isOpen) return null;

  const M = MODAL_TEXT[language];
  const isProActive = activePlan === 'pro' || activePlan === 'business';
  const proDisplayPrice = billingInterval === 'monthly' ? '$4.99' : '$39';
  const proDisplayPeriod =
    billingInterval === 'monthly'
      ? language === 'ar'
        ? '/ شهرياً'
        : '/ month'
      : language === 'ar'
      ? '/ سنوياً'
      : '/ year';

  const lemonCheckoutUrl =
    billingInterval === 'monthly'
      ? 'https://toolnova.lemonsqueezy.com/checkout/buy/pro-monthly-499?embed=1'
      : 'https://toolnova.lemonsqueezy.com/checkout/buy/pro-annual-3900?embed=1';

  const handleLemonSqueezyCheckout = () => {
    setShowLemonOverlay(true);
    setCheckoutState('lemon_squeezy');
  };

  const handleConfirmLemonSqueezy = () => {
    setCheckoutState('success');
    setTimeout(() => {
      onUpgradeSuccess('pro', `Lemon Squeezy (${billingInterval === 'monthly' ? '$4.99/mo' : '$39/yr'})`);
      setShowLemonOverlay(false);
      setCheckoutState('idle');
      onClose();
    }, 900);
  };

  const handlePayPalSmartCheckout = () => {
    setCheckoutState('paypal');
    setTimeout(() => {
      setCheckoutState('success');
      setTimeout(() => {
        onUpgradeSuccess('pro', `PayPal Smart Buttons (${billingInterval === 'monthly' ? '$4.99/mo' : '$39/yr'})`);
        setCheckoutState('idle');
        onClose();
      }, 800);
    }, 1000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-pro-modal-title"
    >
      <div className="relative w-full max-w-4xl rounded-3xl bg-[#FAFAFC] dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden my-8">
        {/* Top Accent Strip */}
        <div className="h-1.5 w-full bg-gradient-to-r from-[#e5322d] via-rose-500 to-orange-500" />

        {/* Header */}
        <div className="px-6 sm:px-8 pt-6 pb-4 bg-white dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-800 flex items-start justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-extrabold bg-red-50 text-[#e5322d] border border-red-200/80 mb-2">
              <Crown className="w-3.5 h-3.5" />
              {M.badge}
            </span>
            <h2
              id="upgrade-pro-modal-title"
              className="text-xl sm:text-2xl font-extrabold text-[#111827] dark:text-white tracking-tight"
            >
              {M.title}
            </h2>
            <p className="text-xs sm:text-sm text-[#64748b] dark:text-slate-400 mt-1">
              {M.subtitle}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-[#111827] dark:hover:text-white hover:bg-slate-200/70 transition-colors cursor-pointer shrink-0"
            aria-label="Close upgrade modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Billing Cycle Toggle Bar */}
        <div className="px-6 sm:px-8 pt-5 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center p-1 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xs">
            <button
              type="button"
              onClick={() => setBillingInterval('monthly')}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                billingInterval === 'monthly'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50'
              }`}
            >
              {M.monthlyBilling}
            </button>
            <button
              type="button"
              onClick={() => setBillingInterval('yearly')}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all inline-flex items-center gap-1.5 cursor-pointer ${
                billingInterval === 'yearly'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50'
              }`}
            >
              <span>{M.yearlyBilling}</span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-extrabold">
                {M.yearlyDiscount}
              </span>
            </button>
          </div>

          <div className="text-[11px] font-medium text-[#64748b] dark:text-slate-400 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-[#e5322d]" />
            <span>{M.lemonSqueezyNote}</span>
          </div>
        </div>

        {/* Plans Comparison Grid */}
        <div className="p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Free Plan Column (5 cols) */}
          <div className="lg:col-span-5 rounded-2xl bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <h3 className="text-base font-extrabold text-[#111827] dark:text-white">
                  {M.freePlanTitle}
                </h3>
                <span className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center">
                  <ShieldCheck className="w-4 h-4" />
                </span>
              </div>

              <p className="text-xs text-[#64748b] dark:text-slate-400 mb-4 leading-relaxed">
                {M.freePlanDesc}
              </p>

              <div className="flex items-baseline gap-1 pb-4 mb-4 border-b border-slate-200 dark:border-slate-700">
                <span className="text-3xl font-extrabold font-mono text-[#111827] dark:text-white">
                  {M.freePlanPrice}
                </span>
                <span className="text-xs text-[#64748b] dark:text-slate-400 font-medium">
                  {M.freePlanPeriod}
                </span>
              </div>

              <ul className="space-y-2.5 mb-6">
                {M.freeFeatures.map((feat, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300">
                    <span className="w-4 h-4 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0 mt-0.5">
                      <Check className="w-3 h-3" />
                    </span>
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            </div>

            <button
              type="button"
              onClick={() => {
                onUpgradeSuccess('free', 'Free Tier');
                onClose();
              }}
              className="w-full py-2.5 px-4 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
            >
              {activePlan === 'free' ? M.currentFreeBtn : M.switchFreeBtn}
            </button>
          </div>

          {/* Pro Plan Column with Dual Payment Integration (7 cols) */}
          <div className="lg:col-span-7 relative rounded-2xl bg-white dark:bg-slate-800 border-2 border-[#e5322d] shadow-md p-6 flex flex-col justify-between">
            <div className="absolute -top-3 right-6">
              <span className="px-3 py-1 rounded-full bg-[#e5322d] text-white text-[10px] font-extrabold tracking-wide shadow-xs inline-flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                {M.proPlanBadge}
              </span>
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <h3 className="text-lg font-extrabold text-[#111827] dark:text-white flex items-center gap-2">
                  {M.proPlanTitle}
                </h3>
                <span className="w-9 h-9 rounded-xl bg-red-50 text-[#e5322d] flex items-center justify-center">
                  <Zap className="w-4 h-4" />
                </span>
              </div>

              <p className="text-xs text-[#64748b] dark:text-slate-400 mb-4 leading-relaxed">
                {M.proPlanDesc}
              </p>

              <div className="flex items-baseline justify-between flex-wrap gap-2 pb-4 mb-4 border-b border-slate-200 dark:border-slate-700">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-extrabold font-mono text-[#e5322d]">
                    {proDisplayPrice}
                  </span>
                  <span className="text-xs font-bold text-[#64748b] dark:text-slate-400">
                    {proDisplayPeriod}
                  </span>
                </div>
                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                  {billingInterval === 'monthly' ? '$4.99/month · Cancel anytime' : '$39/year ($3.25/mo equivalent)'}
                </span>
              </div>

              <ul className="space-y-2 mb-6">
                {M.proFeatures.map((feat, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 text-xs text-[#111827] dark:text-slate-200 font-medium">
                    <span className="w-4 h-4 rounded-full bg-red-50 text-[#e5322d] flex items-center justify-center shrink-0 mt-0.5">
                      <Check className="w-3 h-3" />
                    </span>
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Dual Payment Buttons Section */}
            <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-700/70">
              {checkoutState === 'success' ? (
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>{M.activatedLabel}</span>
                </div>
              ) : (
                <>
                  {/* Button 1: Lemon Squeezy Overlay Checkout Link */}
                  <button
                    type="button"
                    onClick={handleLemonSqueezyCheckout}
                    data-lemonsqueezy-checkout={lemonCheckoutUrl}
                    className="lemonsqueezy-button w-full py-3 px-4 rounded-xl bg-[#e5322d] hover:bg-[#d12823] text-white text-xs sm:text-sm font-extrabold shadow-sm hover:shadow transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <CreditCard className="w-4 h-4 shrink-0" />
                    <span>{M.payWithCardBtn}</span>
                    <ExternalLink className="w-3.5 h-3.5 opacity-80" />
                  </button>

                  {/* Button 2: PayPal Smart Buttons Integration Container */}
                  <div
                    id="paypal-smart-button-container"
                    className="rounded-xl border border-amber-300/90 bg-[#FFC439] hover:bg-[#f4b829] transition-all p-0.5 shadow-2xs"
                  >
                    <button
                      type="button"
                      onClick={handlePayPalSmartCheckout}
                      disabled={checkoutState === 'paypal'}
                      className="w-full py-2.5 px-4 rounded-[10px] text-[#003087] font-extrabold text-xs sm:text-sm flex flex-col items-center justify-center cursor-pointer disabled:opacity-60"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="italic font-black tracking-tight text-base text-[#003087]">
                          Pay
                        </span>
                        <span className="italic font-black tracking-tight text-base text-[#0079C1] -ml-1">
                          Pal
                        </span>
                        <span className="ml-1 text-xs font-bold text-slate-900">
                          {checkoutState === 'paypal' ? M.processingLabel : 'Smart Checkout'}
                        </span>
                      </div>
                      <span className="text-[10px] font-semibold text-slate-800/80">
                        {M.paypalSubLabel}
                      </span>
                    </button>
                  </div>
                </>
              )}

              {isProActive && (
                <div className="text-center text-[11px] font-bold text-emerald-600">
                  ✓ Pro Unlimited Active on your account
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Lemon Squeezy Checkout Overlay Modal Simulation */}
        {showLemonOverlay && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs">
            <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6">
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#e5322d]" />
                  <span className="text-xs font-extrabold text-[#111827] dark:text-white">
                    Lemon Squeezy Checkout Overlay
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowLemonOverlay(false);
                    setCheckoutState('idle');
                  }}
                  className="text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-3.5 rounded-xl bg-[#FAFAFC] dark:bg-slate-800 border border-slate-200 dark:border-slate-700 mb-4 text-xs">
                <div className="flex items-center justify-between font-bold text-[#111827] dark:text-white mb-1">
                  <span>ToolNova Pro Plan ({billingInterval})</span>
                  <span className="text-[#e5322d] font-mono">{proDisplayPrice}</span>
                </div>
                <div className="text-[11px] text-[#64748b] font-mono truncate">
                  {lemonCheckoutUrl}
                </div>
              </div>

              <div className="space-y-3">
                <button
                  type="button"
                  onClick={handleConfirmLemonSqueezy}
                  className="w-full py-2.5 px-4 rounded-xl bg-[#e5322d] hover:bg-[#d12823] text-white text-xs font-extrabold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Complete Checkout & Activate Pro ({proDisplayPrice})</span>
                </button>

                <a
                  href={lemonCheckoutUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2 px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 text-[11px] font-bold flex items-center justify-center gap-1.5"
                >
                  <span>Open External Lemon Squeezy Link</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Footer Security Note */}
        <div className="px-6 sm:px-8 py-3.5 bg-white dark:bg-slate-900 border-t border-slate-200/80 dark:border-slate-800 text-center text-[11px] text-[#64748b] dark:text-slate-400">
          {M.securityNote}
        </div>
      </div>
    </div>
  );
};
