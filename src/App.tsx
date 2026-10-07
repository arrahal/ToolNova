import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Search,
  Sun,
  Moon,
  ArrowUpRight,
  ArrowRight,
  Play,
  Plus,
  X,
  CheckCircle2,
  ShieldCheck,
  Cpu,
  FolderKanban,
  Globe,
  User,
  Crown,
  Check,
} from 'lucide-react';
import {
  TOOLS_DATA,
  CATEGORY_TABS,
  INITIAL_WORKFLOWS,
  HubCategory,
  ToolItem,
  WorkflowPreset,
} from './data/toolsData';
import {
  AppLanguage,
  LANGUAGE_OPTIONS,
  UI_TRANSLATIONS,
  getLocalizedTool,
} from './data/translations';
import { ToolBrandIcon } from './components/ToolBrandIcon';
import { ToolWorkspaceModal } from './components/ToolWorkspaceModal';
import { WorkflowBuilderModal } from './components/WorkflowBuilderModal';
import { AuthAccountModal, UserProfileData } from './components/AuthAccountModal';
import { PricingPlansSection, PlanTierId } from './components/PricingPlansSection';

export default function App() {
  const [darkMode, setDarkMode] = useState(false);
  const [language, setLanguage] = useState<AppLanguage>('ar');
  const [activeCategory, setActiveCategory] = useState<HubCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTool, setSelectedTool] = useState<ToolItem | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string>('pdf-to-word');
  const [workflows, setWorkflows] = useState<WorkflowPreset[]>(INITIAL_WORKFLOWS);
  const [isWorkflowModalOpen, setIsWorkflowModalOpen] = useState(false);
  const [activeWorkflowRunner, setActiveWorkflowRunner] = useState<{
    workflow: WorkflowPreset;
    stepIndex: number;
  } | null>(null);
  const [sessionHistory, setSessionHistory] = useState<
    { id: string; toolTitle: string; detail: string; time: string }[]
  >([]);
  const [isLangMenuOpen, setIsLangMenuOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserProfileData | null>(() => {
    try {
      const saved = localStorage.getItem('toolnova_user_profile');
      return saved ? (JSON.parse(saved) as UserProfileData) : null;
    } catch {
      return null;
    }
  });
  const [activePlan, setActivePlan] = useState<PlanTierId>(() => {
    try {
      const saved = localStorage.getItem('toolnova_user_profile');
      if (saved) {
        const parsed = JSON.parse(saved) as UserProfileData;
        if (parsed.planId) return parsed.planId;
      }
    } catch {
      // ignore
    }
    return 'pro';
  });

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const langMenuRef = useRef<HTMLDivElement | null>(null);
  const t = UI_TRANSLATIONS[language];
  const currentLangMeta =
    LANGUAGE_OPTIONS.find((l) => l.code === language) || LANGUAGE_OPTIONS[0];

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [darkMode]);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = currentLangMeta.dir;
  }, [language, currentLangMeta.dir]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        langMenuRef.current &&
        !langMenuRef.current.contains(e.target as Node)
      ) {
        setIsLangMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === '/' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const filteredTools = useMemo(() => {
    return TOOLS_DATA.filter((tool) => {
      const matchesCategory =
        activeCategory === 'all' ||
        activeCategory === 'workflows' ||
        tool.hub === activeCategory ||
        tool.subcategories.includes(activeCategory);

      if (!matchesCategory) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const loc = getLocalizedTool(tool, language);
      return (
        tool.title.toLowerCase().includes(q) ||
        tool.description.toLowerCase().includes(q) ||
        loc.title.toLowerCase().includes(q) ||
        loc.description.toLowerCase().includes(q) ||
        loc.hubLabel.toLowerCase().includes(q) ||
        tool.formats.some((f) => f.toLowerCase().includes(q))
      );
    });
  }, [activeCategory, searchQuery, language]);

  const handleOpenTool = (tool: ToolItem) => {
    setSelectedCardId(tool.id);
    const loc = getLocalizedTool(tool, language);
    setSelectedTool({
      ...tool,
      title: loc.title,
      description: loc.description,
      hubLabel: loc.hubLabel,
    });
  };

  const handleRecordHistory = (toolTitle: string, detail: string) => {
    const now = new Date();
    const timeStr = now.toTimeString().slice(0, 8);
    setSessionHistory((prev) => [
      { id: `${Date.now()}`, toolTitle, detail, time: timeStr },
      ...prev.slice(0, 7),
    ]);
  };

  const handleStartWorkflow = (wf: WorkflowPreset) => {
    const firstTool = TOOLS_DATA.find((item) => item.id === wf.steps[0]);
    if (firstTool) {
      const loc = getLocalizedTool(firstTool, language);
      setActiveWorkflowRunner({ workflow: wf, stepIndex: 0 });
      setSelectedTool({
        ...firstTool,
        title: loc.title,
        description: loc.description,
        hubLabel: loc.hubLabel,
      });
    }
  };

  const handleAdvanceWorkflowStep = () => {
    if (!activeWorkflowRunner) return;
    const nextIdx = activeWorkflowRunner.stepIndex + 1;
    if (nextIdx < activeWorkflowRunner.workflow.steps.length) {
      const nextToolId = activeWorkflowRunner.workflow.steps[nextIdx];
      const nextTool = TOOLS_DATA.find((item) => item.id === nextToolId);
      if (nextTool) {
        const loc = getLocalizedTool(nextTool, language);
        setActiveWorkflowRunner({
          workflow: activeWorkflowRunner.workflow,
          stepIndex: nextIdx,
        });
        setSelectedTool({
          ...nextTool,
          title: loc.title,
          description: loc.description,
          hubLabel: loc.hubLabel,
        });
      }
    } else {
      handleRecordHistory(
        `Workflow: ${activeWorkflowRunner.workflow.name}`,
        `Completed all ${activeWorkflowRunner.workflow.steps.length} pipeline stages locally.`
      );
      setActiveWorkflowRunner(null);
      setSelectedTool(null);
    }
  };

  return (
    <div
      id="top"
      dir={currentLangMeta.dir}
      className="min-h-screen flex flex-col bg-[#FAFAFC] dark:bg-[#0B0F19] text-slate-900 dark:text-slate-100 transition-colors duration-150 relative overflow-x-hidden"
    >
      {/* Ambient Background Curves */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      >
        <div className="absolute -top-36 -left-36 w-[540px] h-[540px] rounded-full bg-rose-200/35 dark:bg-rose-950/20 blur-3xl" />
        <div className="absolute top-12 -right-32 w-[500px] h-[500px] rounded-full bg-orange-100/45 dark:bg-violet-950/20 blur-3xl" />
        <div className="absolute -bottom-40 left-1/3 w-[640px] h-[420px] rounded-full bg-rose-100/40 dark:bg-cyan-950/15 blur-3xl" />
      </div>

      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-30 h-14 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/90 dark:border-slate-800 px-4 sm:px-6 flex items-center justify-between gap-3">
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveCategory('all');
            setSearchQuery('');
          }}
          className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-white whitespace-nowrap flex items-center gap-2"
        >
          <span className="w-2.5 h-2.5 rounded-full bg-rose-600 inline-block" />
          ToolNova
        </a>

        <nav className="hidden lg:flex items-center gap-5 text-xs font-semibold text-slate-700 dark:text-slate-300">
          {(['pdf', 'image', 'audio', 'video', 'workflows'] as const).map(
            (navId) => (
              <button
                key={navId}
                onClick={() => setActiveCategory(navId)}
                className={`whitespace-nowrap shrink-0 py-1 transition-colors cursor-pointer hover:text-slate-950 dark:hover:text-white hover:underline underline-offset-4 ${
                  activeCategory === navId
                    ? 'text-rose-600 dark:text-rose-400 underline'
                    : ''
                }`}
              >
                {t.categoryLabels[navId]}
              </button>
            )
          )}
          <a
            href="#pricing-section"
            className="whitespace-nowrap shrink-0 py-1 text-rose-600 dark:text-rose-400 font-bold inline-flex items-center gap-1 hover:underline underline-offset-4"
          >
            <Crown className="w-3.5 h-3.5" />
            {t.pricingNavLabel}
          </a>
        </nav>

        {/* Right Actions: Globe Language Popover + Theme Toggle + Email Login/Profile + Create Workflow */}
        <div className="flex items-center gap-2">
          {/* Compact Globe Button that opens the Language Selection Popover on Click */}
          <div ref={langMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setIsLangMenuOpen((prev) => !prev)}
              aria-expanded={isLangMenuOpen}
              aria-label="Select Language"
              title="تغيير اللغة / Change Language"
              className={`p-2 rounded-lg border transition-colors flex items-center gap-1 cursor-pointer ${
                isLangMenuOpen
                  ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-500 text-rose-600 dark:text-rose-400'
                  : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Globe className="w-4 h-4" />
            </button>

            {isLangMenuOpen && (
              <div
                role="menu"
                className={`absolute top-full mt-2 w-44 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl py-1.5 z-50 ${
                  currentLangMeta.dir === 'rtl' ? 'left-0' : 'right-0'
                }`}
              >
                {LANGUAGE_OPTIONS.map((langOpt) => {
                  const isSelectedLang = language === langOpt.code;
                  return (
                    <button
                      key={langOpt.code}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setLanguage(langOpt.code);
                        setIsLangMenuOpen(false);
                      }}
                      className={`w-full px-3.5 py-2 text-xs font-bold flex items-center justify-between transition-colors cursor-pointer ${
                        isSelectedLang
                          ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span>{langOpt.label}</span>
                      <span className="flex items-center gap-1 text-[10px] font-mono text-slate-400">
                        {langOpt.shortLabel}
                        {isSelectedLang && (
                          <Check className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <button
            onClick={() => setDarkMode((prev) => !prev)}
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Toggle color theme"
            title="Toggle Light / Dark Mode"
          >
            {darkMode ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4" />
            )}
          </button>

          {/* Email Sign In / Personal Info Account Button */}
          <button
            type="button"
            onClick={() => setIsAuthModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/90 hover:border-rose-500 text-slate-800 dark:text-slate-100 transition-colors cursor-pointer"
          >
            <User className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
            <span className="max-w-[115px] truncate">
              {currentUser ? currentUser.fullName : t.loginBtnLabel}
            </span>
          </button>

          <button
            onClick={() => setIsWorkflowModalOpen(true)}
            className="hidden sm:inline-flex px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {t.createWorkflowBtn}
          </button>
        </div>
      </header>

      {/* Active Workflow Runner Banner */}
      {activeWorkflowRunner && (
        <div className="relative z-20 bg-slate-900 text-white dark:bg-slate-800 px-6 py-2.5 border-b border-slate-700">
          <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-rose-400">
                Active Workflow: {activeWorkflowRunner.workflow.name}
              </span>
              <span className="text-slate-400">·</span>
              <span className="font-mono tabular-nums">
                Step {activeWorkflowRunner.stepIndex + 1} of{' '}
                {activeWorkflowRunner.workflow.steps.length}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleAdvanceWorkflowStep}
                className="px-3 py-1 rounded-md bg-rose-600 hover:bg-rose-500 text-white font-semibold inline-flex items-center gap-1 cursor-pointer"
              >
                {activeWorkflowRunner.stepIndex + 1 <
                activeWorkflowRunner.workflow.steps.length
                  ? 'Next Pipeline Step'
                  : 'Finish Workflow'}
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setActiveWorkflowRunner(null)}
                className="text-slate-400 hover:text-white"
              >
                Exit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Dashboard */}
      <main className="relative z-10 flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-16">
        <section className="text-center max-w-4xl mx-auto mb-8">
          <h1
            className="text-2xl sm:text-[26px] font-bold tracking-tight text-slate-900 dark:text-white mb-2"
            style={{ textWrap: 'balance' }}
          >
            {t.heroTitle}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mb-6">
            {t.heroSubtitlePrefix}
            <span className="font-mono font-bold text-slate-800 dark:text-slate-200 tabular-nums">
              {TOOLS_DATA.length}
            </span>
            {t.heroSubtitleSuffix}
          </p>

          <div className="max-w-xl mx-auto mb-5 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.searchPlaceholder}
              className="w-full pl-10 pr-16 py-2.5 text-xs sm:text-sm rounded-xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 shadow-2xs focus:outline-none focus:border-slate-900 dark:focus:border-slate-400 transition-colors"
            />
            {searchQuery ? (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                aria-label="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            ) : (
              <kbd className="hidden sm:inline-block absolute right-3 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[10px] font-mono text-slate-400 bg-slate-100 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700">
                /
              </kbd>
            )}
          </div>

          <div
            role="tablist"
            aria-label="Tool category filter"
            className="flex items-center justify-start sm:justify-center gap-2 overflow-x-auto pb-2 no-scrollbar"
          >
            {CATEGORY_TABS.map((tab) => {
              const isActive = activeCategory === tab.id;
              return (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveCategory(tab.id)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap shrink-0 transition-all duration-150 cursor-pointer border ${
                    isActive
                      ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white shadow-2xs'
                      : 'bg-white text-slate-700 border-slate-300/90 hover:border-slate-900 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700 dark:hover:border-slate-400'
                  }`}
                >
                  {t.categoryLabels[tab.id]}
                </button>
              );
            })}
          </div>
        </section>

        {activeCategory === 'workflows' && (
          <section className="mb-10">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  {t.savedWorkflowsTitle} ({workflows.length})
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t.savedWorkflowsDesc}
                </p>
              </div>
              <button
                onClick={() => setIsWorkflowModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                {t.newWorkflowBtn}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {workflows.map((wf) => (
                <div
                  key={wf.id}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between hover:border-slate-900 dark:hover:border-slate-400 transition-colors"
                >
                  <div>
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
                      <span className="font-mono tabular-nums">
                        {wf.steps.length} · ~{wf.estimatedSavedSec} {t.savedSecSuffix}
                      </span>
                      <span className="font-mono tabular-nums">
                        {wf.runsCount} runs
                      </span>
                    </div>
                    <h3 className="text-[15px] font-bold text-slate-900 dark:text-white mb-1">
                      {wf.name}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
                      {wf.description}
                    </p>

                    <div className="flex flex-wrap items-center gap-1.5 mb-5 text-xs text-slate-700 dark:text-slate-300">
                      {wf.steps.map((stepId, sIdx) => {
                        const stepTool = TOOLS_DATA.find((item) => item.id === stepId);
                        if (!stepTool) return null;
                        const locStep = getLocalizedTool(stepTool, language);
                        return (
                          <React.Fragment key={`${stepId}-${sIdx}`}>
                            <span className="font-medium">{locStep.title}</span>
                            {sIdx < wf.steps.length - 1 && (
                              <span
                                aria-hidden="true"
                                className="text-slate-400 px-0.5"
                              >
                                →
                              </span>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </div>
                  </div>

                  <button
                    onClick={() => handleStartWorkflow(wf)}
                    className="w-full py-2 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-200 text-white dark:text-slate-900 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    {t.runPipelineBtn}
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {filteredTools.length === 0 ? (
          <div className="max-w-md mx-auto my-12 p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center">
            <FolderKanban className="w-8 h-8 text-slate-400 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">
              {t.noToolsTitle}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              {t.noToolsDesc}
            </p>
            <button
              onClick={() => {
                setSearchQuery('');
                setActiveCategory('all');
              }}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-900 text-white dark:bg-white dark:text-slate-900 cursor-pointer"
            >
              {t.resetFiltersBtn}
            </button>
          </div>
        ) : (
          <section aria-label="Tools Grid">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3.5">
              {filteredTools.map((tool) => {
                const isSelected = selectedCardId === tool.id;
                const loc = getLocalizedTool(tool, language);

                return (
                  <button
                    key={tool.id}
                    type="button"
                    onClick={() => handleOpenTool(tool)}
                    className={`group text-start rounded-xl p-5 bg-white dark:bg-slate-900/95 transition-all duration-150 flex flex-col justify-between min-h-[168px] cursor-pointer ${
                      isSelected
                        ? 'border-[1.5px] border-slate-900 dark:border-slate-200 shadow-sm'
                        : 'border border-slate-200/90 dark:border-slate-800 hover:border-slate-900 dark:hover:border-slate-300 hover:shadow-md'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        {/* Bespoke Expressive Service Icon */}
                        <ToolBrandIcon tool={tool} />

                        <div className="text-[11px] text-slate-400 dark:text-slate-500 flex items-center gap-1 font-medium">
                          {tool.isNew && (
                            <>
                              <span className="text-blue-600 dark:text-blue-400 font-semibold">
                                {t.newBadge}
                              </span>
                              <span aria-hidden="true">·</span>
                            </>
                          )}
                          <span>{tool.formats[0]}</span>
                        </div>
                      </div>

                      <h2 className="text-[15px] font-bold text-slate-900 dark:text-slate-100 mt-4 mb-1.5 group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors leading-snug">
                        {loc.title}
                      </h2>

                      <p className="text-[11.5px] leading-relaxed text-slate-500 dark:text-slate-400 line-clamp-3">
                        {loc.description}
                      </p>
                    </div>

                    <div className="pt-3 mt-2 flex items-center justify-between text-[10.5px] text-slate-400 dark:text-slate-500">
                      <span>{loc.hubLabel}</span>
                      <span className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-900 dark:text-white font-semibold inline-flex items-center gap-0.5">
                        {t.openAction}
                        <ArrowUpRight className="w-3 h-3" />
                      </span>
                    </div>
                  </button>
                );
              })}

              {/* Create a workflow card */}
              <button
                type="button"
                onClick={() => setIsWorkflowModalOpen(true)}
                className="group relative overflow-hidden text-start rounded-xl p-5 bg-[#FFF3EE] dark:bg-rose-950/30 border border-rose-200/90 dark:border-rose-800/60 hover:border-rose-500 dark:hover:border-rose-400 transition-all duration-150 flex flex-col justify-between min-h-[168px] cursor-pointer"
              >
                <svg
                  aria-hidden="true"
                  className="pointer-events-none absolute -right-4 top-2 w-28 h-28 text-rose-300/60 dark:text-rose-700/30"
                  viewBox="0 0 100 100"
                  fill="none"
                >
                  <rect
                    x="45"
                    y="10"
                    width="36"
                    height="36"
                    rx="6"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeDasharray="3 3"
                    transform="rotate(20 45 10)"
                  />
                  <path
                    d="M25 75 H65 C72 75 75 70 75 62"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                  <circle cx="25" cy="75" r="3" fill="currentColor" />
                </svg>

                <div className="relative z-10">
                  <h2 className="text-[15px] font-bold text-slate-900 dark:text-white mb-2">
                    {t.createWorkflowCardTitle}
                  </h2>
                  <p className="text-[11.5px] leading-relaxed text-slate-600 dark:text-slate-300">
                    {t.createWorkflowCardDesc}
                  </p>
                </div>

                <div className="relative z-10 pt-4 mt-2 flex items-center gap-1 text-xs font-bold text-slate-900 dark:text-white group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors">
                  <span>{t.createWorkflowBtn}</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </div>
              </button>
            </div>
          </section>
        )}

        <section className="mt-16 pt-12 border-t border-slate-200/80 dark:border-slate-800/80">
          <div className="text-center max-w-2xl mx-auto mb-8">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mb-2">
              {t.workYourWayTitle}
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              {t.workYourWaySubtitle}
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {workflows.slice(0, 3).map((wf, index) => (
              <div
                key={wf.id}
                className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      0{index + 1}. {t.presetPipelineLabel}
                    </span>
                    <span className="font-mono tabular-nums">
                      ~{wf.estimatedSavedSec} {t.savedSecSuffix}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">
                    {wf.name}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
                    {wf.description}
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[65%]">
                    {wf.steps
                      .map((id) => {
                        const found = TOOLS_DATA.find((item) => item.id === id);
                        return found ? getLocalizedTool(found, language).title : null;
                      })
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                  <button
                    onClick={() => handleStartWorkflow(wf)}
                    className="text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline inline-flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    {t.launchBtn}
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <PricingPlansSection
            language={language}
            activePlan={activePlan}
            onSelectPlan={(plan) => {
              setActivePlan(plan);
              if (currentUser) {
                const updated: UserProfileData = {
                  ...currentUser,
                  planId: plan,
                };
                setCurrentUser(updated);
                try {
                  localStorage.setItem('toolnova_user_profile', JSON.stringify(updated));
                } catch {
                  // ignore
                }
              } else {
                setIsAuthModalOpen(true);
              }
            }}
          />

          <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">
                  {t.privacyTitle}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  {t.privacyDesc}
                </p>
              </div>
            </div>

            <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-slate-700 dark:text-slate-300" />
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {t.sessionActivityTitle}
                  </h3>
                </div>
                <span className="text-xs font-mono text-slate-400 tabular-nums">
                  {sessionHistory.length} {t.sessionCompletedSuffix}
                </span>
              </div>

              {sessionHistory.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t.sessionEmptyDesc}
                </p>
              ) : (
                <div className="space-y-1.5 max-h-24 overflow-y-auto">
                  {sessionHistory.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300"
                    >
                      <span className="flex items-center gap-1.5 truncate">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <strong>{item.toolTitle}:</strong> {item.detail}
                      </span>
                      <span className="font-mono text-[11px] text-slate-400 tabular-nums ml-2 shrink-0">
                        {item.time}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 py-6">
        <div className="max-w-[1440px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
          <div>
            <strong className="text-slate-900 dark:text-white">ToolNova.com</strong> —{' '}
            {t.heroSubtitlePrefix}
            {TOOLS_DATA.length}
            {t.heroSubtitleSuffix}
          </div>
          <div className="flex items-center gap-4">
            {(['pdf', 'image', 'audio', 'video'] as const).map((hubId, i) => (
              <React.Fragment key={hubId}>
                {i > 0 && <span>·</span>}
                <button
                  onClick={() => setActiveCategory(hubId)}
                  className="hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                >
                  {t.categoryLabels[hubId]}
                </button>
              </React.Fragment>
            ))}
          </div>
        </div>
      </footer>

      <ToolWorkspaceModal
        tool={selectedTool}
        onClose={() => setSelectedTool(null)}
        onRecordHistory={handleRecordHistory}
      />

      <WorkflowBuilderModal
        isOpen={isWorkflowModalOpen}
        onClose={() => setIsWorkflowModalOpen(false)}
        onSaveWorkflow={(newWf) => {
          setWorkflows((prev) => [newWf, ...prev]);
          setActiveCategory('workflows');
        }}
      />

      <AuthAccountModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        language={language}
        currentUser={currentUser}
        onSaveUser={(user) => {
          setCurrentUser(user);
          setActivePlan(user.planId);
          try {
            localStorage.setItem('toolnova_user_profile', JSON.stringify(user));
          } catch {
            // ignore
          }
          handleRecordHistory(
            language === 'ar' ? 'الحساب الشخصي' : 'User Account',
            `${user.fullName} (${user.email}) · Plan: ${user.planId.toUpperCase()}`
          );
        }}
        onLogout={() => {
          setCurrentUser(null);
          try {
            localStorage.removeItem('toolnova_user_profile');
          } catch {
            // ignore
          }
        }}
        onOpenPricing={() => {
          document
            .getElementById('pricing-section')
            ?.scrollIntoView({ behavior: 'smooth' });
        }}
      />
    </div>
  );
}
