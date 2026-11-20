import React, { useState, useEffect } from 'react';
import {
  X,
  Plus,
  ArrowRight,
  ArrowLeft,
  Trash2,
  Check,
  Layers,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { TOOLS_DATA, WorkflowPreset } from '../data/toolsData';
import { AppLanguage, getLocalizedTool } from '../data/translations';
import { WORKFLOW_VALIDATION_LIMITS, WorkflowMutationInput } from '../lib/firebase';

interface WorkflowBuilderModalProps {
  isOpen: boolean;
  language?: AppLanguage;
  editingWorkflow?: WorkflowPreset | null;
  onClose: () => void;
  onSaveWorkflow: (input: WorkflowMutationInput, editingId?: string) => Promise<void> | void;
}

interface ModalLabels {
  createTitle: string;
  editTitle: string;
  subtitle: string;
  nameLabel: string;
  namePlaceholder: string;
  descLabel: string;
  descPlaceholder: string;
  optionalTag: string;
  savedSecLabel: string;
  savedSecHint: string;
  sequenceLabel: (count: number, max: number) => string;
  emptyStepsHint: string;
  appendLabel: string;
  removeStepLabel: string;
  cancelBtn: string;
  saveCreateBtn: string;
  saveEditBtn: string;
  savingBtn: string;
  errNameBounds: string;
  errDescBounds: string;
  errStepsBounds: string;
  errSavedSecBounds: string;
}

const MODAL_STRINGS: Record<AppLanguage, ModalLabels> = {
  ar: {
    createTitle: 'إنشاء مسار عمل مخصص',
    editTitle: 'تعديل مسار العمل',
    subtitle: 'اربط ما بين 1 و 10 أدوات (PDF، Office، صور، صوت، فيديو) في مسار عمل واحد متسلسل',
    nameLabel: 'اسم مسار العمل (1–120 حرفاً)',
    namePlaceholder: 'مثال: دمج ملفات PDF وحمايتها وضغطها',
    descLabel: 'وصف قصير (0–500 حرف)',
    descPlaceholder: 'صف ما يقوم به هذا المسار المؤتمت (اختياري)...',
    optionalTag: 'اختياري',
    savedSecLabel: 'الوقت المقدر الموفر لكل تشغيل (0–86400 ثانية)',
    savedSecHint: 'ثانية',
    sequenceLabel: (count, max) => `تسلسل خطوات المسار (${count}/${max} خطوات)`,
    emptyStepsHint: 'اختر أداة واحدة على الأقل من القائمة أدناه لإضافتها إلى المسار...',
    appendLabel: 'اضغط على أي أداة لإضافتها إلى المسار (من 1 إلى 10 خطوات)',
    removeStepLabel: 'حذف الخطوة',
    cancelBtn: 'إلغاء',
    saveCreateBtn: 'حفظ مسار العمل',
    saveEditBtn: 'حفظ التعديلات',
    savingBtn: 'جارٍ الحفظ...',
    errNameBounds: 'يجب أن يتراوح اسم مسار العمل بين 1 و 120 حرفاً.',
    errDescBounds: 'يجب ألا يتجاوز الوصف 500 حرف.',
    errStepsBounds: 'يجب أن يحتوي مسار العمل على ما بين 1 و 10 خطوات.',
    errSavedSecBounds: 'يجب أن يكون الوقت المقدر الموفر رقماً بين 0 و 86400 ثانية.',
  },
  fr: {
    createTitle: 'Créer un flux de travail personnalisé',
    editTitle: 'Modifier le flux de travail',
    subtitle: 'Enchaînez de 1 à 10 outils PDF, Office, Image, Audio ou Vidéo en un seul flux réutilisable',
    nameLabel: 'Nom du flux (1–120 caractères)',
    namePlaceholder: 'ex: Fusionner, filigraner et compresser un PDF',
    descLabel: 'Description courte (0–500 caractères)',
    descPlaceholder: 'Décrivez ce que ce flux automatise (facultatif)...',
    optionalTag: 'Facultatif',
    savedSecLabel: 'Temps économisé estimé par exécution (0–86400 s)',
    savedSecHint: 'sec',
    sequenceLabel: (count, max) => `Séquence d'exécution (${count}/${max} étapes)`,
    emptyStepsHint: 'Cliquez sur un outil ci-dessous pour l’ajouter à votre séquence...',
    appendLabel: 'Cliquez sur un outil pour l’ajouter au flux (1 à 10 étapes)',
    removeStepLabel: 'Supprimer l’étape',
    cancelBtn: 'Annuler',
    saveCreateBtn: 'Enregistrer le flux',
    saveEditBtn: 'Enregistrer les modifications',
    savingBtn: 'Enregistrement...',
    errNameBounds: 'Le nom du flux doit contenir entre 1 et 120 caractères.',
    errDescBounds: 'La description ne peut pas dépasser 500 caractères.',
    errStepsBounds: 'Le flux doit contenir entre 1 et 10 étapes.',
    errSavedSecBounds: 'Le temps économisé doit être compris entre 0 et 86400 secondes.',
  },
  en: {
    createTitle: 'Create a Custom Workflow',
    editTitle: 'Edit Custom Workflow',
    subtitle: 'Chain 1 to 10 PDF, Office, Image, Audio, or Video tools into a reusable 1-click pipeline',
    nameLabel: 'Workflow Name (1–120 chars)',
    namePlaceholder: 'e.g., Podcast Audio Master & Transcribe',
    descLabel: 'Short Description (0–500 chars)',
    descPlaceholder: 'Describe what this workflow automates (optional)...',
    optionalTag: 'Optional',
    savedSecLabel: 'Estimated Time Saved per Run (0–86400 sec)',
    savedSecHint: 'sec',
    sequenceLabel: (count, max) => `Pipeline Execution Sequence (${count}/${max} steps)`,
    emptyStepsHint: 'Click any tool below to append it to your pipeline sequence...',
    appendLabel: 'Click a Tool to Append to Pipeline (1–10 steps)',
    removeStepLabel: 'Remove step',
    cancelBtn: 'Cancel',
    saveCreateBtn: 'Save Custom Workflow',
    saveEditBtn: 'Save Changes',
    savingBtn: 'Saving...',
    errNameBounds: 'Workflow name must be between 1 and 120 characters.',
    errDescBounds: 'Description must be between 0 and 500 characters.',
    errStepsBounds: 'Workflow must contain between 1 and 10 steps.',
    errSavedSecBounds: 'Estimated saved time must be between 0 and 86400 seconds.',
  },
  es: {
    createTitle: 'Crear un flujo de trabajo personalizado',
    editTitle: 'Editar flujo de trabajo',
    subtitle: 'Encadena de 1 a 10 herramientas de PDF, Office, Imagen, Audio o Video en un flujo reutilizable',
    nameLabel: 'Nombre del flujo (1–120 caracteres)',
    namePlaceholder: 'ej: Unir, marcar y comprimir PDF',
    descLabel: 'Descripción breve (0–500 caracteres)',
    descPlaceholder: 'Describe qué automatiza este flujo (opcional)...',
    optionalTag: 'Opcional',
    savedSecLabel: 'Tiempo estimado ahorrado por ejecución (0–86400 s)',
    savedSecHint: 'seg',
    sequenceLabel: (count, max) => `Secuencia de ejecución (${count}/${max} pasos)`,
    emptyStepsHint: 'Haz clic en cualquier herramienta abajo para añadirla a la secuencia...',
    appendLabel: 'Haz clic en una herramienta para añadirla al flujo (1–10 pasos)',
    removeStepLabel: 'Eliminar paso',
    cancelBtn: 'Cancelar',
    saveCreateBtn: 'Guardar flujo personalizado',
    saveEditBtn: 'Guardar cambios',
    savingBtn: 'Guardando...',
    errNameBounds: 'El nombre del flujo debe tener entre 1 y 120 caracteres.',
    errDescBounds: 'La descripción debe tener entre 0 y 500 caracteres.',
    errStepsBounds: 'El flujo debe contener entre 1 y 10 pasos.',
    errSavedSecBounds: 'El tiempo estimado ahorrado debe estar entre 0 y 86400 segundos.',
  },
};

export const WorkflowBuilderModal: React.FC<WorkflowBuilderModalProps> = ({
  isOpen,
  language = 'ar',
  editingWorkflow = null,
  onClose,
  onSaveWorkflow,
}) => {
  const [name, setName] = useState('Custom Media Automation');
  const [description, setDescription] = useState('');
  const [selectedStepIds, setSelectedStepIds] = useState<string[]>([
    'image-resizer',
    'color-filter-lab',
    'format-converter',
  ]);
  const [estimatedSavedSec, setEstimatedSavedSec] = useState<number>(66);
  const [customSavedSecEdited, setCustomSavedSecEdited] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const labels = MODAL_STRINGS[language] || MODAL_STRINGS.ar;
  const isRtl = language === 'ar';
  const StepArrowIcon = isRtl ? ArrowLeft : ArrowRight;

  useEffect(() => {
    if (!isOpen) return;
    setErrorMessage(null);
    setIsSubmitting(false);

    if (editingWorkflow) {
      setName(editingWorkflow.name);
      setDescription(editingWorkflow.description ?? '');
      setSelectedStepIds(
        editingWorkflow.steps.slice(0, WORKFLOW_VALIDATION_LIMITS.MAX_STEPS)
      );
      setEstimatedSavedSec(
        Math.max(
          WORKFLOW_VALIDATION_LIMITS.MIN_ESTIMATED_SAVED_SEC,
          Math.min(
            WORKFLOW_VALIDATION_LIMITS.MAX_ESTIMATED_SAVED_SEC,
            Number(editingWorkflow.estimatedSavedSec) || 0
          )
        )
      );
      setCustomSavedSecEdited(true);
    } else {
      const defaultSteps = ['image-resizer', 'color-filter-lab', 'format-converter'];
      setName(language === 'ar' ? 'مسار أتمتة وسائط مخصص' : 'Custom Media Automation');
      setDescription('');
      setSelectedStepIds(defaultSteps);
      setEstimatedSavedSec(defaultSteps.length * 22);
      setCustomSavedSecEdited(false);
    }
  }, [isOpen, editingWorkflow, language]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const updateSteps = (updater: (prev: string[]) => string[]) => {
    setSelectedStepIds((prev) => {
      const next = updater(prev);
      if (!customSavedSecEdited) {
        setEstimatedSavedSec(
          Math.min(WORKFLOW_VALIDATION_LIMITS.MAX_ESTIMATED_SAVED_SEC, next.length * 22)
        );
      }
      return next;
    });
  };

  const handleAddStep = (id: string) => {
    if (selectedStepIds.length >= WORKFLOW_VALIDATION_LIMITS.MAX_STEPS) return;
    setErrorMessage(null);
    updateSteps((prev) => [...prev, id]);
  };

  const handleRemoveStep = (index: number) => {
    setErrorMessage(null);
    updateSteps((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedName = name.trim();
    if (
      trimmedName.length < WORKFLOW_VALIDATION_LIMITS.MIN_NAME_LENGTH ||
      trimmedName.length > WORKFLOW_VALIDATION_LIMITS.MAX_NAME_LENGTH
    ) {
      setErrorMessage(labels.errNameBounds);
      return;
    }

    const trimmedDescription = description.trim();
    if (
      description.length > WORKFLOW_VALIDATION_LIMITS.MAX_DESCRIPTION_LENGTH ||
      trimmedDescription.length > WORKFLOW_VALIDATION_LIMITS.MAX_DESCRIPTION_LENGTH
    ) {
      setErrorMessage(labels.errDescBounds);
      return;
    }

    if (
      selectedStepIds.length < WORKFLOW_VALIDATION_LIMITS.MIN_STEPS ||
      selectedStepIds.length > WORKFLOW_VALIDATION_LIMITS.MAX_STEPS
    ) {
      setErrorMessage(labels.errStepsBounds);
      return;
    }

    if (
      !Number.isFinite(estimatedSavedSec) ||
      estimatedSavedSec < WORKFLOW_VALIDATION_LIMITS.MIN_ESTIMATED_SAVED_SEC ||
      estimatedSavedSec > WORKFLOW_VALIDATION_LIMITS.MAX_ESTIMATED_SAVED_SEC
    ) {
      setErrorMessage(labels.errSavedSecBounds);
      return;
    }

    setIsSubmitting(true);
    try {
      await onSaveWorkflow(
        {
          name: trimmedName,
          description: trimmedDescription,
          steps: selectedStepIds,
          estimatedSavedSec: Math.round(estimatedSavedSec),
        },
        editingWorkflow?.id
      );
      onClose();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      role="dialog"
      aria-modal="true"
      aria-labelledby="workflow-builder-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 backdrop-blur-xs p-4 overflow-y-auto"
    >
      <div className="relative w-full max-w-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#e5322d] text-white flex items-center justify-center shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2
                id="workflow-builder-title"
                className="text-base font-extrabold text-[#111827] dark:text-white"
              >
                {editingWorkflow ? labels.editTitle : labels.createTitle}
              </h2>
              <p className="text-xs text-[#64748b] dark:text-slate-400">{labels.subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            aria-label={labels.cancelBtn}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors cursor-pointer disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-5">
          {errorMessage && (
            <div
              role="alert"
              className="flex items-start gap-2.5 p-3.5 rounded-xl bg-red-50 dark:bg-rose-950/50 border border-red-200 dark:border-rose-800 text-xs font-semibold text-red-700 dark:text-rose-300"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#e5322d]" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="wf-name-input"
                  className="block text-xs font-bold text-[#111827] dark:text-slate-300"
                >
                  {labels.nameLabel}
                </label>
                <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                  {name.trim().length}/{WORKFLOW_VALIDATION_LIMITS.MAX_NAME_LENGTH}
                </span>
              </div>
              <input
                id="wf-name-input"
                type="text"
                required
                minLength={WORKFLOW_VALIDATION_LIMITS.MIN_NAME_LENGTH}
                maxLength={WORKFLOW_VALIDATION_LIMITS.MAX_NAME_LENGTH}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={labels.namePlaceholder}
                className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-slate-400"
              />
            </div>

            <div>
              <label
                htmlFor="wf-saved-sec-input"
                className="block text-xs font-bold text-[#111827] dark:text-slate-300 mb-1.5"
              >
                {labels.savedSecLabel}
              </label>
              <div className="relative">
                <input
                  id="wf-saved-sec-input"
                  type="number"
                  min={WORKFLOW_VALIDATION_LIMITS.MIN_ESTIMATED_SAVED_SEC}
                  max={WORKFLOW_VALIDATION_LIMITS.MAX_ESTIMATED_SAVED_SEC}
                  step={1}
                  value={estimatedSavedSec}
                  onChange={(e) => {
                    setCustomSavedSecEdited(true);
                    const nextVal =
                      e.target.value === '' ? 0 : Math.trunc(Number(e.target.value));
                    setEstimatedSavedSec(Number.isFinite(nextVal) ? nextVal : 0);
                  }}
                  className="w-full px-3.5 py-2 text-xs font-mono tabular-nums rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-slate-400"
                />
                <span
                  className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-[11px] text-slate-400 ${
                    isRtl ? 'left-3' : 'right-3'
                  }`}
                >
                  {labels.savedSecHint}
                </span>
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="wf-description-input"
                className="block text-xs font-bold text-[#111827] dark:text-slate-300"
              >
                {labels.descLabel}{' '}
                <span className="font-normal text-slate-400">({labels.optionalTag})</span>
              </label>
              <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                {description.length}/{WORKFLOW_VALIDATION_LIMITS.MAX_DESCRIPTION_LENGTH}
              </span>
            </div>
            <input
              id="wf-description-input"
              type="text"
              maxLength={WORKFLOW_VALIDATION_LIMITS.MAX_DESCRIPTION_LENGTH}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={labels.descPlaceholder}
              className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-slate-400"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-[#111827] dark:text-slate-300">
                {labels.sequenceLabel(
                  selectedStepIds.length,
                  WORKFLOW_VALIDATION_LIMITS.MAX_STEPS
                )}
              </span>
              <span className="text-xs text-[#64748b] font-mono tabular-nums">
                ~{estimatedSavedSec} {labels.savedSecHint}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-[#f7f7fa] dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-2 min-h-[68px]">
              {selectedStepIds.length === 0 ? (
                <span className="text-xs text-slate-400">{labels.emptyStepsHint}</span>
              ) : (
                selectedStepIds.map((id, idx) => {
                  const tool = TOOLS_DATA.find((item) => item.id === id);
                  if (!tool) return null;
                  const locTool = getLocalizedTool(tool, language);
                  const StepIcon = tool.icon;
                  return (
                    <React.Fragment key={`${id}-${idx}`}>
                      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xs">
                        <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                        <StepIcon className="w-3.5 h-3.5 text-[#e5322d]" />
                        <span className="text-xs font-bold text-[#111827] dark:text-slate-200 whitespace-nowrap">
                          {locTool.title}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveStep(idx)}
                          className="text-slate-400 hover:text-[#e5322d] transition-colors ms-1 cursor-pointer"
                          title={labels.removeStepLabel}
                          aria-label={labels.removeStepLabel}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {idx < selectedStepIds.length - 1 && (
                        <StepArrowIcon className="w-4 h-4 text-slate-400 shrink-0" />
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#111827] dark:text-slate-300 mb-2">
              {labels.appendLabel}
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-56 overflow-y-auto p-1">
              {TOOLS_DATA.map((tool) => {
                const Icon = tool.icon;
                const locTool = getLocalizedTool(tool, language);
                return (
                  <button
                    key={tool.id}
                    type="button"
                    disabled={
                      selectedStepIds.length >= WORKFLOW_VALIDATION_LIMITS.MAX_STEPS ||
                      isSubmitting
                    }
                    onClick={() => handleAddStep(tool.id)}
                    className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:shadow-sm hover:border-slate-300 bg-white dark:bg-slate-900 text-start transition-all disabled:opacity-40 cursor-pointer"
                  >
                    <Icon className="w-4 h-4 text-[#e5322d] shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-[#111827] dark:text-slate-100 truncate">
                        {locTool.title}
                      </div>
                      <div className="text-[10px] text-[#64748b] truncate">
                        {locTool.hubLabel}
                      </div>
                    </div>
                    <Plus className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-40"
            >
              {labels.cancelBtn}
            </button>
            <button
              type="submit"
              disabled={
                isSubmitting ||
                !name.trim() ||
                selectedStepIds.length < WORKFLOW_VALIDATION_LIMITS.MIN_STEPS ||
                selectedStepIds.length > WORKFLOW_VALIDATION_LIMITS.MAX_STEPS
              }
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold bg-[#e5322d] hover:bg-[#d12823] text-white transition-colors cursor-pointer disabled:opacity-40"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {labels.savingBtn}
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  {editingWorkflow ? labels.saveEditBtn : labels.saveCreateBtn}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
