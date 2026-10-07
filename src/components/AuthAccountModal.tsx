import React, { useState, useEffect } from 'react';
import {
  X,
  Mail,
  Lock,
  User,
  Phone,
  Building2,
  MapPin,
  CheckCircle2,
  ShieldCheck,
  Sparkles,
  LogOut,
  CreditCard,
} from 'lucide-react';
import { AppLanguage } from '../data/translations';

export interface UserProfileData {
  fullName: string;
  email: string;
  phone: string;
  companyOrRole: string;
  country: string;
  planId: 'free' | 'pro' | 'business';
  joinedAt: string;
}

interface AuthAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: AppLanguage;
  currentUser: UserProfileData | null;
  onSaveUser: (user: UserProfileData) => void;
  onLogout: () => void;
  onOpenPricing?: () => void;
}

const AUTH_LABELS: Record<
  AppLanguage,
  {
    signInTab: string;
    registerTab: string;
    profileTitle: string;
    subtitle: string;
    fullNameLabel: string;
    fullNamePlaceholder: string;
    emailLabel: string;
    emailPlaceholder: string;
    passwordLabel: string;
    passwordPlaceholder: string;
    phoneLabel: string;
    phonePlaceholder: string;
    companyLabel: string;
    companyPlaceholder: string;
    countryLabel: string;
    countryPlaceholder: string;
    planLabel: string;
    submitSignIn: string;
    submitRegister: string;
    saveProfileChanges: string;
    logoutBtn: string;
    upgradePlanBtn: string;
    privacyNote: string;
    savedToast: string;
    planNames: Record<'free' | 'pro' | 'business', string>;
  }
> = {
  ar: {
    signInTab: 'تسجيل الدخول',
    registerTab: 'إنشاء حساب والمعلومات الشخصية',
    profileTitle: 'حسابي والمعلومات الخاصة',
    subtitle: 'سجل دخولك باستخدام البريد الإلكتروني وأدخل معلوماتك الخاصة لحفظ إعداداتك وباقتك.',
    fullNameLabel: 'الاسم الكامل',
    fullNamePlaceholder: 'مثال: لحسن الرحال (Lahcen Arrahal)',
    emailLabel: 'البريد الإلكتروني (Email)',
    emailPlaceholder: 'name@example.com',
    passwordLabel: 'كلمة المرور',
    passwordPlaceholder: '••••••••',
    phoneLabel: 'رقم الهاتف',
    phonePlaceholder: '+212 600 000 000',
    companyLabel: 'المهنة / الشركة أو المؤسسة',
    companyPlaceholder: 'مهندس / شركة / طالب...',
    countryLabel: 'الدولة / المدينة',
    countryPlaceholder: 'المغرب - الدار البيضاء',
    planLabel: 'الباقة الحالية',
    submitSignIn: 'دخول إلى الحساب',
    submitRegister: 'إنشاء الحساب وحفظ المعلومات',
    saveProfileChanges: 'حفظ وتحديث المعلومات الشخصية',
    logoutBtn: 'تسجيل الخروج',
    upgradePlanBtn: 'ترقية الباقة / عرض الأسعار',
    privacyNote: 'تُحفظ معلوماتك بأمان تام مع تشفير الجلسة المحلية ومزامنة باقتك المختارة.',
    savedToast: 'تم حفظ بيانات حسابك بنجاح!',
    planNames: {
      free: 'الباقة الأساسية (Free)',
      pro: 'باقة المحترفين (Pro Studio)',
      business: 'باقة الشركات والأعمال (Business Enterprise)',
    },
  },
  fr: {
    signInTab: 'Connexion',
    registerTab: 'Créer un compte & Infos',
    profileTitle: 'Mon Profil & Informations Personnelles',
    subtitle: 'Connectez-vous avec votre e-mail et gérez vos informations personnelles et votre forfait.',
    fullNameLabel: 'Nom complet',
    fullNamePlaceholder: 'Ex: Lahcen Arrahal',
    emailLabel: 'Adresse e-mail',
    emailPlaceholder: 'nom@exemple.com',
    passwordLabel: 'Mot de passe',
    passwordPlaceholder: '••••••••',
    phoneLabel: 'Numéro de téléphone',
    phonePlaceholder: '+33 6 00 00 00 00',
    companyLabel: 'Profession / Entreprise',
    companyPlaceholder: 'Entreprise, Freelance, Étudiant...',
    countryLabel: 'Pays / Ville',
    countryPlaceholder: 'Maroc / France',
    planLabel: 'Forfait actuel',
    submitSignIn: 'Se connecter',
    submitRegister: 'Créer mon compte',
    saveProfileChanges: 'Enregistrer mes informations',
    logoutBtn: 'Se déconnecter',
    upgradePlanBtn: 'Changer de forfait / Tarifs',
    privacyNote: 'Vos informations personnelles sont sécurisées et synchronisées avec votre espace de travail.',
    savedToast: 'Profil mis à jour avec succès !',
    planNames: {
      free: 'Forfait Gratuit (Starter)',
      pro: 'Forfait Pro Studio',
      business: 'Forfait Business & Équipe',
    },
  },
  en: {
    signInTab: 'Sign In',
    registerTab: 'Create Account & Personal Info',
    profileTitle: 'My Account & Personal Information',
    subtitle: 'Sign in with your email and manage your personal details and active service plan.',
    fullNameLabel: 'Full Name',
    fullNamePlaceholder: 'e.g., Lahcen Arrahal',
    emailLabel: 'Email Address',
    emailPlaceholder: 'you@example.com',
    passwordLabel: 'Password',
    passwordPlaceholder: '••••••••',
    phoneLabel: 'Phone Number',
    phonePlaceholder: '+1 (555) 000-0000',
    companyLabel: 'Role / Organization',
    companyPlaceholder: 'Company, Designer, Engineer...',
    countryLabel: 'Country / City',
    countryPlaceholder: 'Morocco / London / New York',
    planLabel: 'Active Subscription Plan',
    submitSignIn: 'Sign In to Workspace',
    submitRegister: 'Create Account & Save Info',
    saveProfileChanges: 'Save Personal Information',
    logoutBtn: 'Sign Out',
    upgradePlanBtn: 'View Pricing & Upgrade Plan',
    privacyNote: 'Your account details and workspace preferences are encrypted and stored locally.',
    savedToast: 'Account information saved!',
    planNames: {
      free: 'Starter Free Plan',
      pro: 'Pro Studio Plan',
      business: 'Business Enterprise Plan',
    },
  },
  es: {
    signInTab: 'Iniciar sesión',
    registerTab: 'Crear cuenta y Datos personales',
    profileTitle: 'Mi Cuenta y Datos Personales',
    subtitle: 'Inicia sesión con tu correo y administra tu información personal y tu plan activo.',
    fullNameLabel: 'Nombre completo',
    fullNamePlaceholder: 'Ej: Lahcen Arrahal',
    emailLabel: 'Correo electrónico',
    emailPlaceholder: 'correo@ejemplo.com',
    passwordLabel: 'Contraseña',
    passwordPlaceholder: '••••••••',
    phoneLabel: 'Número de teléfono',
    phonePlaceholder: '+34 600 000 000',
    companyLabel: 'Profesión / Empresa',
    companyPlaceholder: 'Empresa, Estudiante, Profesional...',
    countryLabel: 'País / Ciudad',
    countryPlaceholder: 'Marruecos / Madrid',
    planLabel: 'Plan de suscripción activo',
    submitSignIn: 'Iniciar sesión',
    submitRegister: 'Crear cuenta y Guardar datos',
    saveProfileChanges: 'Guardar información personal',
    logoutBtn: 'Cerrar sesión',
    upgradePlanBtn: 'Ver Precios y Planes',
    privacyNote: 'Tus datos personales están protegidos y sincronizados con tu espacio de trabajo.',
    savedToast: '¡Datos guardados correctamente!',
    planNames: {
      free: 'Plan Básico Gratis',
      pro: 'Plan Pro Studio',
      business: 'Plan Business Empresas',
    },
  },
};

export const AuthAccountModal: React.FC<AuthAccountModalProps> = ({
  isOpen,
  onClose,
  language,
  currentUser,
  onSaveUser,
  onLogout,
  onOpenPricing,
}) => {
  const [mode, setMode] = useState<'login' | 'register'>('register');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [companyOrRole, setCompanyOrRole] = useState('');
  const [country, setCountry] = useState('');
  const [planId, setPlanId] = useState<'free' | 'pro' | 'business'>('pro');
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [formError, setFormError] = useState('');

  const L = AUTH_LABELS[language];

  useEffect(() => {
    if (currentUser) {
      setFullName(currentUser.fullName);
      setEmail(currentUser.email);
      setPhone(currentUser.phone);
      setCompanyOrRole(currentUser.companyOrRole);
      setCountry(currentUser.country);
      setPlanId(currentUser.planId);
    } else {
      setFullName('');
      setEmail('');
      setPassword('');
      setPhone('');
      setCompanyOrRole('');
      setCountry('');
      setPlanId('pro');
    }
    setSavedSuccess(false);
    setFormError('');
  }, [currentUser, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const cleanEmail = email.trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setFormError(
        language === 'ar'
          ? 'يرجى إدخال بريد إلكتروني صحيح.'
          : 'Please enter a valid email address.'
      );
      return;
    }

    if (!currentUser && password.trim().length < 4) {
      setFormError(
        language === 'ar'
          ? 'يرجى إدخال كلمة مرور (4 أحرف أو أرقام على الأقل).'
          : 'Please enter a password (at least 4 characters).'
      );
      return;
    }

    const derivedName =
      fullName.trim() ||
      cleanEmail
        .split('@')[0]
        .replace(/[._-]/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());

    const profile: UserProfileData = {
      fullName: derivedName,
      email: cleanEmail,
      phone: phone.trim() || '+212 600-000000',
      companyOrRole: companyOrRole.trim() || 'Independent Professional',
      country: country.trim() || 'Morocco',
      planId,
      joinedAt: currentUser?.joinedAt || new Date().toISOString().slice(0, 10),
    };

    onSaveUser(profile);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 900);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-6">
        {/* Clean Light iLovePDF Header */}
        <div className="px-6 py-5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-red-50 text-[#e5322d] border border-red-100 flex items-center justify-center shrink-0">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-[#111827] dark:text-white">
                {currentUser ? L.profileTitle : mode === 'login' ? L.signInTab : L.registerTab}
              </h2>
              <p className="text-xs text-[#64748b] dark:text-slate-400 mt-0.5">{L.subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Switcher Tabs (when not logged in) */}
        {!currentUser && (
          <div className="grid grid-cols-2 border-b border-slate-200 dark:border-slate-800 bg-[#f7f7fa] dark:bg-slate-900/60 p-1.5 gap-1.5">
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setFormError('');
              }}
              className={`py-2 px-3 rounded-full text-xs font-bold transition-all cursor-pointer ${
                mode === 'register'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {L.registerTab}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setFormError('');
              }}
              className={`py-2 px-3 rounded-full text-xs font-bold transition-all cursor-pointer ${
                mode === 'login'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {L.signInTab}
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {formError && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs font-semibold text-rose-700 dark:text-rose-300">
              {formError}
            </div>
          )}

          {savedSuccess && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-xs font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{L.savedToast}</span>
            </div>
          )}

          {/* Email & Password Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className={currentUser ? 'sm:col-span-2' : ''}>
              <label className="block text-xs font-bold text-[#111827] dark:text-slate-300 mb-1.5">
                {L.emailLabel} *
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={L.emailPlaceholder}
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-slate-400"
                />
              </div>
            </div>

            {!currentUser && (
              <div>
                <label className="block text-xs font-bold text-[#111827] dark:text-slate-300 mb-1.5">
                  {L.passwordLabel} *
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={L.passwordPlaceholder}
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-slate-400"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Personal Information Fields */}
          {(mode === 'register' || Boolean(currentUser)) && (
            <div className="space-y-3.5 pt-1 border-t border-slate-100 dark:border-slate-800">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-[#111827] dark:text-slate-300 mb-1.5">
                    {L.fullNameLabel}
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder={L.fullNamePlaceholder}
                      className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-slate-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#111827] dark:text-slate-300 mb-1.5">
                    {L.phoneLabel}
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder={L.phonePlaceholder}
                      className="w-full pl-9 pr-3 py-2 text-xs font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-slate-400"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-[#111827] dark:text-slate-300 mb-1.5">
                    {L.companyLabel}
                  </label>
                  <div className="relative">
                    <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={companyOrRole}
                      onChange={(e) => setCompanyOrRole(e.target.value)}
                      placeholder={L.companyPlaceholder}
                      className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-slate-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#111827] dark:text-slate-300 mb-1.5">
                    {L.countryLabel}
                  </label>
                  <div className="relative">
                    <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      placeholder={L.countryPlaceholder}
                      className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-slate-400"
                    />
                  </div>
                </div>
              </div>

              {/* Active Plan Selector inside Account */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-[#111827] dark:text-slate-300">
                    {L.planLabel}
                  </label>
                  {onOpenPricing && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenPricing();
                      }}
                      className="text-[11px] font-bold text-[#e5322d] hover:underline inline-flex items-center gap-1 cursor-pointer"
                    >
                      <CreditCard className="w-3 h-3" />
                      {L.upgradePlanBtn}
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(['free', 'pro', 'business'] as const).map((tier) => (
                    <button
                      key={tier}
                      type="button"
                      onClick={() => setPlanId(tier)}
                      className={`py-2 px-2.5 rounded-full text-[11px] font-bold border transition-all cursor-pointer flex items-center justify-center gap-1 ${
                        planId === tier
                          ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {tier === 'pro' && <Sparkles className="w-3 h-3 text-amber-400 shrink-0" />}
                      <span className="truncate">{L.planNames[tier]}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="p-3 rounded-xl bg-[#f7f7fa] dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 flex items-center gap-2.5 text-[11px] text-[#64748b] dark:text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{L.privacyNote}</span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            {currentUser && (
              <button
                type="button"
                onClick={() => {
                  onLogout();
                  onClose();
                }}
                className="px-4 py-2.5 rounded-xl border border-rose-200 dark:border-rose-800 text-[#e5322d] hover:bg-red-50 text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                {L.logoutBtn}
              </button>
            )}

            <button
              type="submit"
              className="flex-1 py-2.5 px-5 rounded-xl bg-[#e5322d] hover:bg-[#d12823] text-white text-xs font-bold shadow-sm transition-colors cursor-pointer"
            >
              {currentUser
                ? L.saveProfileChanges
                : mode === 'login'
                ? L.submitSignIn
                : L.submitRegister}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
