import React, { useState } from 'react';
import { X, Plus, ArrowRight, Trash2, Check, Layers } from 'lucide-react';
import { TOOLS_DATA, WorkflowPreset } from '../data/toolsData';

interface WorkflowBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveWorkflow: (newWf: WorkflowPreset) => void;
}

export const WorkflowBuilderModal: React.FC<WorkflowBuilderModalProps> = ({
  isOpen,
  onClose,
  onSaveWorkflow,
}) => {
  const [name, setName] = useState('Custom Media Automation');
  const [description, setDescription] = useState(
    'Automated multi-step client-side pipeline for rapid file preparation.'
  );
  const [selectedStepIds, setSelectedStepIds] = useState<string[]>([
    'image-resizer',
    'color-filter-lab',
    'format-converter',
  ]);

  if (!isOpen) return null;

  const handleAddStep = (id: string) => {
    if (selectedStepIds.length >= 5) return;
    setSelectedStepIds((prev) => [...prev, id]);
  };

  const handleRemoveStep = (index: number) => {
    setSelectedStepIds((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || selectedStepIds.length === 0) return;

    const newWf: WorkflowPreset = {
      id: `wf-custom-${Date.now()}`,
      name: name.trim(),
      description: description.trim() || 'Custom multi-tool pipeline.',
      steps: selectedStepIds,
      runsCount: 1,
      estimatedSavedSec: selectedStepIds.length * 22,
    };
    onSaveWorkflow(newWf);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#e5322d] text-white flex items-center justify-center">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-[#111827] dark:text-white">
                Create a Custom Workflow
              </h2>
              <p className="text-xs text-[#64748b] dark:text-slate-400">
                Chain up to 5 PDF, Image, Audio, or Video tools into a reusable 1-click pipeline
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-[#111827] dark:text-slate-300 mb-1.5">
                Workflow Name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Podcast Audio Master & Transcribe"
                className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-slate-400"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#111827] dark:text-slate-300 mb-1.5">
                Short Description
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what this workflow automates..."
                className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-slate-400"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-[#111827] dark:text-slate-300">
                Pipeline Execution Sequence ({selectedStepIds.length}/5 steps)
              </span>
              <span className="text-xs text-[#64748b] font-mono tabular-nums">
                Est. time saved: ~{selectedStepIds.length * 22}s / run
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-[#f7f7fa] dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-2 min-h-[68px]">
              {selectedStepIds.length === 0 ? (
                <span className="text-xs text-slate-400">
                  Click any tool below to append it to your pipeline sequence...
                </span>
              ) : (
                selectedStepIds.map((id, idx) => {
                  const t = TOOLS_DATA.find((item) => item.id === id);
                  if (!t) return null;
                  const StepIcon = t.icon;
                  return (
                    <React.Fragment key={`${id}-${idx}`}>
                      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xs">
                        <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                          0{idx + 1}
                        </span>
                        <StepIcon className="w-3.5 h-3.5 text-[#e5322d]" />
                        <span className="text-xs font-bold text-[#111827] dark:text-slate-200 whitespace-nowrap">
                          {t.title}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveStep(idx)}
                          className="text-slate-400 hover:text-[#e5322d] transition-colors ml-1"
                          title="Remove step"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {idx < selectedStepIds.length - 1 && (
                        <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#111827] dark:text-slate-300 mb-2">
              Click a Tool to Append to Pipeline
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-56 overflow-y-auto p-1">
              {TOOLS_DATA.map((tool) => {
                const Icon = tool.icon;
                return (
                  <button
                    key={tool.id}
                    type="button"
                    disabled={selectedStepIds.length >= 5}
                    onClick={() => handleAddStep(tool.id)}
                    className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:shadow-sm hover:border-slate-300 bg-white dark:bg-slate-900 text-left transition-all disabled:opacity-40 cursor-pointer"
                  >
                    <Icon className="w-4 h-4 text-[#e5322d] shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-[#111827] dark:text-slate-100 truncate">
                        {tool.title}
                      </div>
                      <div className="text-[10px] text-[#64748b] truncate">
                        {tool.hubLabel}
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
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={selectedStepIds.length === 0}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold bg-[#e5322d] hover:bg-[#d12823] text-white transition-colors cursor-pointer disabled:opacity-40"
            >
              <Check className="w-4 h-4" />
              Save Custom Workflow
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
