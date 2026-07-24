"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type WheelEvent,
} from "react";
import {
  calculateGoalHealth,
  currentFollowers,
  formatMetric,
  percent,
  publishedWithin,
  startOfWeekISO,
  todayISO,
} from "./lib/calculations";
import {
  CONTENT_STAGES,
  DEFAULT_CONTENT_TYPES,
  DEFAULT_CREATOR_PROFILE,
  DEFAULT_PAGE_TITLES,
  DEFAULT_STAGE_COLORS,
  NEXT_ACTIONS,
  QUALITY_LABELS,
  SCHEDULABLE_STAGES,
  STAGE_LABELS,
  WORK_STAGES,
  type ContentItem,
  type ContentStage,
  type CreatorProfile,
  type FollowerSnapshot,
  type GoalCycle,
  type InsightRule,
  type LiveSession,
  type PageTitleKey,
  type QualityMetric,
  type ScheduleObject,
  type ScheduleObjectType,
  type StageEvent,
  type WorkStage,
  type WorkspaceState,
} from "./lib/model";
import {
  addReviewDay,
  moveLiveSession as moveLiveSessionInWorkspace,
  moveReviewDay as moveReviewDayInWorkspace,
  removeLiveSession as removeLiveSessionFromWorkspace,
  removeReviewDay as removeReviewDayFromWorkspace,
  removeScheduleObject as removeScheduleObjectFromWorkspace,
  saveScheduleObject as saveScheduleObjectInWorkspace,
  saveScheduleObjectType as saveScheduleObjectTypeInWorkspace,
  saveLiveSession as saveLiveSessionInWorkspace,
  moveScheduleObject as moveScheduleObjectInWorkspace,
} from "./lib/schedule";
import {
  clearWorkspace,
  loadWorkspace,
  migrateWorkspace,
  mergeWorkspace,
  saveWorkspace,
  validateImport,
} from "./lib/storage";
import { completeContentReview, deleteContentFromWorkspace } from "./lib/workspace";
import {
  canScheduleStage,
  completedPublishingEvents,
  moveStageEventToDate,
  moveStageEvent,
  nextContentStage,
  removeStageEvent,
  scheduleContentForDate,
  scheduleStageForDate,
  setContentStageCompletion,
  sortStageEvents,
  stageIndex,
  stageProgress,
  toggleStageEvent,
  transitionContentStage,
} from "./lib/workflow";

type NavView = "momentum" | "schedule" | "pipeline" | "goals" | "review" | "settings";
type DailyStageEntry = { event: StageEvent; item: ContentItem };
type ContentDrawerTab = "overview" | "topic" | "script" | "recording" | "editing" | "publish" | "review";

const date = todayISO();

function shiftDate(value: string, days: number) {
  const next = new Date(`${value}T12:00:00`);
  next.setDate(next.getDate() + days);
  return next.toISOString().slice(0, 10);
}

function dashboardTitle(profile: CreatorProfile) {
  return profile.dashboardTitle.trim() || `${profile.creatorName.trim() || "我的"}的自媒体 Dashboard`;
}

function creatorMark(profile: CreatorProfile) {
  const name = profile.creatorName.trim();
  return name ? Array.from(name)[0].toUpperCase() : "造";
}

function blankTopic() {
  return {
    audience: "",
    painPoint: "",
    pointOfView: "",
    commonAngle: "",
    contrastAngle: "",
    assets: "",
    minimumProduction: "",
    score: { audience: 0, pain: 0, scene: 0, demonstrable: 0, distribution: 0, efficiency: 0 },
  };
}

function blankScript() {
  return { headline: "", hook: "", conclusion: "", body: "", example: "", ending: "" };
}

function createContent(partial: Partial<ContentItem> & Pick<ContentItem, "id" | "title">): ContentItem {
  return {
    id: partial.id,
    title: partial.title,
    idea: partial.idea ?? partial.title,
    contentType: partial.contentType ?? DEFAULT_CONTENT_TYPES[0],
    tier: partial.tier ?? "B",
    stage: partial.stage ?? "inbox",
    publicationStatus: partial.publicationStatus ?? "draft",
    priority: partial.priority ?? "normal",
    tags: partial.tags ?? [],
    createdAt: partial.createdAt ?? "2026-07-01",
    updatedAt: partial.updatedAt ?? "2026-07-18",
    publishedAt: partial.publishedAt ?? "",
    xhsLink: partial.xhsLink ?? "",
    coverCopy: partial.coverCopy ?? "",
    publishCopy: partial.publishCopy ?? "",
    topic: partial.topic ?? blankTopic(),
    script: partial.script ?? blankScript(),
    recordingNotes: partial.recordingNotes ?? "",
    editingNotes: partial.editingNotes ?? "",
    metrics: partial.metrics ?? { views: 0, likes: 0, saves: 0, comments: 0, followerGain: 0, capturedAt: "" },
    review: partial.review ?? {
      rating: 0,
      analysis: "",
      learnedRule: "",
      completedAt: "",
    },
  };
}

function createGoal(): GoalCycle {
  return {
    id: "goal-2026-q3",
    objective: "建立稳定的 AI 内容产线，并做出能够代表账号方向的系列内容。",
    startDate: "2026-07-01",
    endDate: "2026-09-30",
    status: "active",
    outputTarget: 36,
    quotas: [
      { contentType: "AI 产品实测", target: 10 },
      { contentType: "AI 工作流 / 教程", target: 10 },
      { contentType: "Vibe Coding 作品", target: 8 },
      { contentType: "AI 热点观点", target: 6 },
      { contentType: "商业内容", target: 2 },
    ],
    followerStart: 4200,
    followerTarget: 10000,
    qualityMetric: "saveRate",
    qualityThreshold: 3.5,
    qualityTarget: 8,
  };
}

function normalizeGoalQuotas(outputTarget: number, quotas: GoalCycle["quotas"]) {
  const target = Math.max(0, outputTarget || 0);
  const assigned = quotas.filter((item) => item.contentType !== "其他");
  const assignedTotal = assigned.reduce((sum, item) => sum + Math.max(0, item.target || 0), 0);
  const unallocated = Math.max(0, target - assignedTotal);
  return unallocated ? [...assigned, { contentType: "其他", target: unallocated }] : assigned;
}

function createDemoState(): WorkspaceState {
  const goal = createGoal();
  const contents = [
    createContent({
      id: "content-gpt-live",
      title: "GPT Live 不是翻译器，是我的口语陪练",
      idea: "用一个真实的展会英语对话，展示练习—实战—复盘的完整闭环。",
      contentType: "AI 产品实测",
      tier: "B",
      stage: "script",
      priority: "high",
      topic: {
        audience: "想练英语但不敢开口的职场人",
        painPoint: "练习场景与真实对话脱节",
        pointOfView: "AI 最有价值的不是翻译，而是制造低成本的真实练习。",
        commonAngle: "罗列实时语音功能",
        contrastAngle: "让 AI 先当老师，再去展会实战，回来继续复盘",
        assets: "对话录屏、WAIC 现场画面、前后对比",
        minimumProduction: "正面口播 + 2 段屏幕录制",
        score: { audience: 5, pain: 4, scene: 5, demonstrable: 5, distribution: 4, efficiency: 4 },
      },
      script: {
        headline: "我把 GPT Live 当成了 24 小时口语陪练",
        hook: "我最怕的不是英语差，是练了半天，真遇到外国人还是一句都说不出来。",
        conclusion: "AI 口语工具的终点，不是纠音，而是把你送进真实场景。",
        body: "1. 先让它模拟展会对话\n2. 到现场完成真实交流\n3. 回来复盘卡壳位置",
        example: "展示一次真实问答和复盘建议",
        ending: "先练一个你这周真的会遇到的场景。",
      },
    }),
    createContent({
      id: "content-cockpit",
      title: "我给自己的自媒体做了一个经营驾驶舱",
      idea: "把选题、制作、发布和复盘放到一条线上，展示真实使用场景。",
      contentType: "Vibe Coding 作品",
      tier: "A",
      stage: "editing",
      publicationStatus: "scheduled",
      priority: "high",
      topic: {
        audience: "被 Notion 和表格弄得更忙的内容创作者",
        painPoint: "灵感很多，但很少真正走到发布和复盘",
        pointOfView: "问题不是缺任务管理，而是缺一条内容从判断到反馈的闭环。",
        commonAngle: "展示一个好看的看板",
        contrastAngle: "从一条死在灵感池里的内容讲起",
        assets: "看板录屏、旧表格、流程对比",
        minimumProduction: "录屏 + 画外音",
        score: { audience: 5, pain: 5, scene: 5, demonstrable: 5, distribution: 4, efficiency: 3 },
      },
    }),
    createContent({
      id: "content-agent",
      title: "别再把 Agent 当聊天机器人",
      contentType: "AI 热点观点",
      tier: "C",
      stage: "topic",
      updatedAt: "2026-07-14",
      topic: {
        ...blankTopic(),
        audience: "正在尝试 AI Agent 的产品与运营人员",
        painPoint: "一直在对话，却没有稳定交付物",
        pointOfView: "Agent 的核心不是会聊天，而是围绕验收标准持续完成任务。",
        contrastAngle: "Prompt 的尽头不是更长的 Prompt，而是反馈循环",
        score: { audience: 4, pain: 4, scene: 4, demonstrable: 3, distribution: 4, efficiency: 5 },
      },
    }),
    createContent({
      id: "content-codex",
      title: "Codex 帮我把选题变成了可交互工具",
      contentType: "AI 工作流 / 教程",
      tier: "B",
      stage: "publishing",
      publicationStatus: "scheduled",
      coverCopy: "不是帮我写稿，而是做出一个工具",
      updatedAt: "2026-07-18",
    }),
    createContent({
      id: "content-workflow",
      title: "我的 AI 自媒体效率工作流",
      contentType: "AI 工作流 / 教程",
      tier: "B",
      stage: "review",
      publicationStatus: "published",
      publishedAt: "2026-07-16",
      metrics: { views: 6200, likes: 422, saves: 301, comments: 36, followerGain: 128, capturedAt: "2026-07-18" },
      review: {
        rating: 4,
        analysis: "流程本身有价值，评论也集中追问选题卡模板；但前 5 秒还可以更具体。",
        learnedRule: "讲工作流时先展示最终工作台，再解释每一步。",
        completedAt: "",
      },
    }),
    createContent({
      id: "content-creators",
      title: "从夯到拉：AI 博主类型锐评",
      contentType: "AI 热点观点",
      tier: "B",
      stage: "archived",
      publicationStatus: "published",
      publishedAt: "2026-07-10",
      metrics: { views: 1680, likes: 64, saves: 19, comments: 41, followerGain: 8, capturedAt: "2026-07-13" },
      review: {
        rating: 2,
        analysis: "评论讨论了分类，但没有形成收藏动机。标题承诺锐评，正文却更像温和分类。",
        learnedRule: "标题承诺评价，就必须给清晰标准和真正判断。",
        completedAt: "2026-07-13T12:00:00.000Z",
      },
    }),
    createContent({
      id: "content-kimi",
      title: "我让 Kimi Work 跑完竞品分析 70% 的脏活",
      contentType: "AI 产品实测",
      tier: "A",
      stage: "archived",
      publicationStatus: "published",
      publishedAt: "2026-07-13",
      metrics: { views: 12800, likes: 703, saves: 612, comments: 58, followerGain: 286, capturedAt: "2026-07-16" },
      review: {
        rating: 5,
        analysis: "产品经理集中收藏与私信要 Prompt。具体工作场景比功能介绍更能建立价值。",
        learnedRule: "AI 产品内容先讲一个高成本任务，再讲工具如何接管过程。",
        completedAt: "2026-07-16T12:00:00.000Z",
      },
    }),
    createContent({
      id: "content-input",
      title: "AI 信息太多，我只保留这三个输入源",
      contentType: "AI 工作流 / 教程",
      tier: "C",
      stage: "inbox",
      updatedAt: "2026-07-11",
    }),
  ];

  return {
    schemaVersion: 11,
    profile: { ...DEFAULT_CREATOR_PROFILE },
    pageTitles: { ...DEFAULT_PAGE_TITLES, goals: goal.objective },
    setupComplete: true,
    lastBackupAt: "",
    contents,
    stageEvents: [
      { id: "event-gpt-script", contentId: "content-gpt-live", stage: "script", plannedDate: date, rank: 1, completedAt: "" },
      { id: "event-gpt-record", contentId: "content-gpt-live", stage: "recording", plannedDate: date, rank: 2, completedAt: "" },
      { id: "event-cockpit-edit", contentId: "content-cockpit", stage: "editing", plannedDate: date, rank: 3, completedAt: "" },
      { id: "event-cockpit-publish", contentId: "content-cockpit", stage: "publishing", plannedDate: shiftDate(date, 2), rank: 1, completedAt: "" },
      { id: "event-agent-topic", contentId: "content-agent", stage: "topic", plannedDate: shiftDate(date, 1), rank: 1, completedAt: "" },
      { id: "event-agent-script", contentId: "content-agent", stage: "script", plannedDate: shiftDate(date, 2), rank: 2, completedAt: "" },
      { id: "event-codex-publish", contentId: "content-codex", stage: "publishing", plannedDate: shiftDate(date, 1), rank: 2, completedAt: "" },
      { id: "event-workflow-publish", contentId: "content-workflow", stage: "publishing", plannedDate: "2026-07-16", rank: 0, completedAt: "2026-07-16T12:00:00.000Z" },
      { id: "event-creators-publish", contentId: "content-creators", stage: "publishing", plannedDate: "2026-07-10", rank: 0, completedAt: "2026-07-10T12:00:00.000Z" },
      { id: "event-kimi-publish", contentId: "content-kimi", stage: "publishing", plannedDate: "2026-07-13", rank: 0, completedAt: "2026-07-13T12:00:00.000Z" },
    ],
    reviewDays: [
      { id: "review-day-demo", plannedDate: shiftDate(date, 3), note: "", createdAt: new Date().toISOString() },
    ],
    liveSessions: [
      {
        id: "live-demo",
        title: "AI 工具实战答疑",
        plannedDate: shiftDate(date, 5),
        startTime: "20:00",
        endTime: "21:00",
        platform: "小红书",
        content: "演示本周使用频率最高的三个 AI 工具，并回答看板搭建问题。",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    scheduleObjectTypes: [
      {
        id: "schedule-type-event",
        name: "活动",
        description: "线下活动、展会或特别安排",
        color: "#4F7A72",
        createdAt: new Date().toISOString(),
      },
    ],
    scheduleObjects: [
      {
        id: "schedule-object-event-demo",
        typeId: "schedule-type-event",
        title: "WAIC 创作者交流活动",
        plannedDate: shiftDate(date, 4),
        startTime: "14:00",
        endTime: "17:00",
        details: "准备采访问题和现场拍摄清单。",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    stageColors: { ...DEFAULT_STAGE_COLORS },
    goal,
    goalHistory: [],
    followerSnapshots: [
      { id: "followers-0701", date: "2026-07-01", followers: 4200 },
      { id: "followers-0714", date: "2026-07-14", followers: 4680 },
    ],
    insightRules: [
      { id: "rule-1", text: "AI 产品内容先讲一个高成本任务，再讲工具如何接管过程。", sourceContentId: "content-kimi", createdAt: "2026-07-16", active: true },
      { id: "rule-2", text: "标题承诺评价，就必须给清晰标准和真正判断。", sourceContentId: "content-creators", createdAt: "2026-07-13", active: true },
    ],
    contentTypes: DEFAULT_CONTENT_TYPES,
  };
}

function createBlankState(): WorkspaceState {
  const demo = createDemoState();
  return {
    ...demo,
    contents: [],
    stageEvents: [],
    reviewDays: [],
    liveSessions: [],
    scheduleObjectTypes: [],
    scheduleObjects: [],
    followerSnapshots: [],
    insightRules: [],
    pageTitles: { ...demo.pageTitles, goals: DEFAULT_PAGE_TITLES.goals },
    goal: { ...demo.goal, objective: "", outputTarget: 0, quotas: demo.goal.quotas.map((q) => ({ ...q, target: 0 })), followerStart: 0, followerTarget: 0, qualityTarget: 0 },
  };
}

function ProgressBar({ value, tone = "clay" }: { value: number; tone?: "clay" | "olive" | "ink" }) {
  return <div className="progress-track"><span className={`progress-fill ${tone}`} style={{ width: percent(value) }} /></div>;
}

function Empty({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return <div className="empty-state"><div className="empty-mark">＋</div><h3>{title}</h3><p>{body}</p>{action}</div>;
}

function Badge({ children, tone = "neutral", color }: { children: React.ReactNode; tone?: string; color?: string }) {
  return <span
    className={`badge badge-${tone}${color ? " badge-stage-custom" : ""}`}
    style={color ? { "--badge-color": color } as React.CSSProperties : undefined}
  >{children}</span>;
}

function EditablePageTitle({ value, fallback, onChange }: { value: string; fallback: string; onChange: (value: string) => void }) {
  return <label className="editable-page-title">
    <input
      value={value}
      placeholder={fallback}
      aria-label="页面主标题"
      title="点击修改页面标题"
      onChange={(event) => onChange(event.target.value)}
      onBlur={(event) => {
        const normalized = event.target.value.trim();
        onChange(normalized || fallback);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
    />
    <span>点击修改</span>
  </label>;
}

function Icon({ name }: { name: string }) {
  const icons: Record<string, string> = { momentum: "◫", schedule: "▤", pipeline: "▦", goals: "◎", review: "◌", settings: "⚙", plus: "＋", search: "⌕", spark: "✦", arrow: "→", backup: "⇩" };
  return <span aria-hidden="true" className="icon">{icons[name] ?? "·"}</span>;
}

export default function Cockpit() {
  const [state, setState] = useState<WorkspaceState>(() => createDemoState());
  const [hydrated, setHydrated] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [view, setView] = useState<NavView>("momentum");
  const [momentumPeriod, setMomentumPeriod] = useState<"today" | "week">("today");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showStageColors, setShowStageColors] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState<ContentDrawerTab>("overview");
  const [pipelineQuery, setPipelineQuery] = useState("");
  const [pipelineType, setPipelineType] = useState("全部类型");
  const [toast, setToast] = useState("");
  const [aiResult, setAiResult] = useState<{ title: string; mode: "direct" | "prompt"; prompt: string; result?: { summary: string; signals: string[]; risks: string[]; nextActions: string[] } } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const fileInput = useRef<HTMLInputElement>(null);
  const workspaceTitle = dashboardTitle(state.profile);

  useEffect(() => {
    loadWorkspace()
      .then((stored) => {
        if (stored) setState(stored);
        else setShowOnboarding(true);
      })
      .catch(() => setToast("本地数据读取失败，已先使用当前数据。"))
      .finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    document.title = workspaceTitle;
  }, [workspaceTitle]);

  useEffect(() => {
    if (!hydrated || showOnboarding) return;
    const timer = window.setTimeout(() => saveWorkspace(state).catch(() => setToast("自动保存失败，请先导出备份。")), 250);
    return () => window.clearTimeout(timer);
  }, [state, hydrated, showOnboarding]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const selected = state.contents.find((item) => item.id === selectedId) ?? null;
  const health = useMemo(() => calculateGoalHealth(state.goal, state.contents, state.followerSnapshots), [state]);
  const publishedQuarter = useMemo(() => publishedWithin(state.contents, state.goal.startDate, state.goal.endDate), [state.contents, state.goal]);
  const followers = currentFollowers(state.goal, state.followerSnapshots);
  const todayEntries = sortStageEvents(state.stageEvents.filter((event) => SCHEDULABLE_STAGES.includes(event.stage) && event.plannedDate === date))
    .map((event) => {
      const item = state.contents.find((content) => content.id === event.contentId);
      return item ? { event, item } : null;
    })
    .filter((entry): entry is DailyStageEntry => Boolean(entry));
  const reviewDue = state.contents.filter(
    (item) =>
      item.publicationStatus === "published" &&
      !item.review.completedAt &&
      Boolean(item.publishedAt) &&
      shiftDate(item.publishedAt, 3) <= date,
  );

  function updateContent(id: string, patch: Partial<ContentItem>) {
    setState((prev) => ({
      ...prev,
      contents: prev.contents.map((item) => item.id === id ? { ...item, ...patch, updatedAt: todayISO() } : item),
    }));
  }

  function updatePageTitle(key: PageTitleKey, value: string) {
    setState((prev) => ({ ...prev, pageTitles: { ...prev.pageTitles, [key]: value } }));
  }

  function openContent(id: string, tab: ContentDrawerTab = "overview") {
    setSelectedTab(tab);
    setSelectedId(id);
  }

  function deleteContent(item: ContentItem) {
    const confirmed = window.confirm(`确定永久删除「${item.title}」吗？\n\n它会同时从今日 Todo、档期、阶段目标统计和复盘中移除，且无法恢复。`);
    if (!confirmed) return;
    setState((prev) => deleteContentFromWorkspace(prev, item.id));
    setSelectedId(null);
    setToast("内容已永久删除");
  }

  function updateGoal(patch: Partial<GoalCycle>) {
    setState((prev) => {
      const goal = { ...prev.goal, ...patch };
      if (Object.hasOwn(patch, "outputTarget") || Object.hasOwn(patch, "quotas")) {
        goal.quotas = normalizeGoalQuotas(goal.outputTarget, goal.quotas);
      }
      return { ...prev, goal };
    });
  }

  function createContentAndOpen() {
    const item = createContent({ id: crypto.randomUUID(), title: "未命名内容", createdAt: todayISO(), updatedAt: todayISO() });
    setState((prev) => ({ ...prev, contents: [item, ...prev.contents] }));
    openContent(item.id);
  }

  function addToToday(id: string) {
    const item = state.contents.find((content) => content.id === id);
    if (!item || item.stage === "archived") return;
    if (item.stage === "inbox") {
      setToast("灵感无需排期，请先推进到大纲");
      return;
    }
    if (!canScheduleStage(state, id, item.stage, date)) {
      setToast("当前阶段与后续档期冲突，请到档期规划调整");
      return;
    }
    setState((prev) => scheduleContentForDate(prev, id, date));
    setToast("当前阶段已安排到今天");
  }

  function planStage(contentId: string, stage: WorkStage, plannedDate: string) {
    if (!plannedDate) return;
    if (!canScheduleStage(state, contentId, stage, plannedDate)) {
      setToast("排期与前后阶段冲突，请按阶段顺序安排");
      return;
    }
    setState((prev) => scheduleStageForDate(prev, contentId, stage, plannedDate));
    setToast(`${STAGE_LABELS[stage]}已安排到 ${plannedDate.slice(5)}`);
  }

  function clearStagePlan(contentId: string, stage: WorkStage) {
    const event = state.stageEvents.find(
      (item) => item.contentId === contentId && item.stage === stage && !item.completedAt,
    );
    if (!event) return;
    setState((prev) => removeStageEvent(prev, event.id));
    setToast(`已取消${STAGE_LABELS[stage]}排期`);
  }

  function moveCalendarEvent(eventId: string, plannedDate: string) {
    const event = state.stageEvents.find((item) => item.id === eventId);
    if (!event) return;
    if (!event.completedAt && !canScheduleStage(state, event.contentId, event.stage, plannedDate)) {
      setToast("改期与前后阶段冲突，请按阶段顺序安排");
      return;
    }
    setState((prev) => moveStageEventToDate(prev, eventId, plannedDate));
    setToast(`${STAGE_LABELS[event.stage]}已移动到 ${plannedDate.slice(5)}`);
  }

  function createReviewDay(plannedDate: string) {
    setState((prev) => addReviewDay(prev, plannedDate, new Date().toISOString()));
    setToast(`复盘已安排到 ${plannedDate.slice(5)}`);
  }

  function moveReviewDay(reviewDayId: string, plannedDate: string) {
    setState((prev) => moveReviewDayInWorkspace(prev, reviewDayId, plannedDate));
    setToast(`复盘已移动到 ${plannedDate.slice(5)}`);
  }

  function deleteReviewDay(reviewDayId: string) {
    setState((prev) => removeReviewDayFromWorkspace(prev, reviewDayId));
    setToast("已取消复盘");
  }

  function saveLiveSession(session: LiveSession) {
    setState((prev) => saveLiveSessionInWorkspace(prev, session));
    setToast("直播日程已保存");
  }

  function moveLiveSession(liveSessionId: string, plannedDate: string) {
    setState((prev) => moveLiveSessionInWorkspace(prev, liveSessionId, plannedDate, new Date().toISOString()));
    setToast(`直播已移动到 ${plannedDate.slice(5)}`);
  }

  function deleteLiveSession(liveSessionId: string) {
    setState((prev) => removeLiveSessionFromWorkspace(prev, liveSessionId));
    setToast("直播日程已删除");
  }

  function saveScheduleObjectType(type: ScheduleObjectType) {
    setState((prev) => saveScheduleObjectTypeInWorkspace(prev, type));
    setToast(`“${type.name.trim()}”已加入日程对象`);
  }

  function saveScheduleObject(object: ScheduleObject) {
    setState((prev) => saveScheduleObjectInWorkspace(prev, object));
    setToast(`${object.title.trim()}已保存`);
  }

  function moveScheduleObject(objectId: string, plannedDate: string) {
    setState((prev) => moveScheduleObjectInWorkspace(prev, objectId, plannedDate, new Date().toISOString()));
    setToast(`自定义日程已移动到 ${plannedDate.slice(5)}`);
  }

  function deleteScheduleObject(objectId: string) {
    setState((prev) => removeScheduleObjectFromWorkspace(prev, objectId));
    setToast("自定义日程已删除");
  }

  function setStageStatus(contentId: string, stage: WorkStage, completed: boolean) {
    const content = state.contents.find((item) => item.id === contentId);
    if (stage === "review" && completed && content?.publicationStatus !== "published") {
      setToast("内容发布后才能完成复盘");
      return;
    }
    if (stage === "review" && completed && (!content?.review.rating || !content.review.analysis.trim())) {
      setToast("请先到复盘页完成星级评价和复盘分析");
      return;
    }
    const completedAt = new Date().toISOString();
    setState((prev) => {
      const withReviewStatus = stage === "review"
        ? {
            ...prev,
            contents: prev.contents.map((item) => item.id === contentId
              ? { ...item, review: { ...item.review, completedAt: completed ? completedAt : "" } }
              : item),
          }
        : prev;
      return setContentStageCompletion(withReviewStatus, contentId, stage, completed, date, completedAt);
    });
    setToast(completed
      ? `${STAGE_LABELS[stage]}已完成，前置阶段已同步`
      : `${STAGE_LABELS[stage]}及后续阶段已恢复待完成`);
  }

  function moveToday(eventId: string, direction: -1 | 1) {
    setState((prev) => moveStageEvent(prev, eventId, direction));
  }

  function toggleTodayComplete(eventId: string) {
    const event = state.stageEvents.find((item) => item.id === eventId);
    const item = state.contents.find((content) => content.id === event?.contentId);
    if (!event || !item) return;
    if (event.stage === "publishing") {
      openContent(item.id, "publish");
      setToast(event.completedAt ? "发布记录请在内容详情中撤销" : "先填写发布时间并标记为已发布");
      return;
    }
    const completed = Boolean(event.completedAt);
    setState((prev) => toggleStageEvent(prev, eventId, new Date().toISOString()));
    setToast(completed ? `已撤销，恢复到${STAGE_LABELS[event.stage]}阶段` : `${STAGE_LABELS[event.stage]}已完成，进入${STAGE_LABELS[nextContentStage(event.stage)]}`);
  }

  function removeFromToday(eventId: string) {
    setState((prev) => removeStageEvent(prev, eventId));
    setToast("已移出今日推进");
  }

  function onDropStage(event: DragEvent, stage: ContentStage) {
    event.preventDefault();
    const id = event.dataTransfer.getData("text/content-id");
    if (!id) return;
    setState((prev) => transitionContentStage(prev, id, stage, date));
  }

  function markPublished(item: ContentItem) {
    if (!item.publishedAt) {
      setToast("请先填写实际发布时间");
      return;
    }
    const completedAt = new Date().toISOString();
    setState((prev) => {
      const publishedItem: ContentItem = {
        ...item,
        publicationStatus: "published",
        stage: "review",
        review: { ...item.review, completedAt: "" },
        updatedAt: date,
      };
      const next = {
        ...prev,
        contents: prev.contents.map((content) => content.id === item.id ? publishedItem : content),
      };
      return {
        ...next,
        stageEvents: completedPublishingEvents(next, publishedItem, completedAt),
      };
    });
    setToast("已发布，内容已进入待复盘");
  }

  function unmarkPublished(item: ContentItem) {
    setState((prev) => {
      const publishingEvents = prev.stageEvents.filter((event) => event.contentId === item.id && event.stage === "publishing");
      const latestPublishing = [...publishingEvents].sort((a, b) => b.plannedDate.localeCompare(a.plannedDate))[0];
      let stageEvents = prev.stageEvents
        .filter((event) => !(event.contentId === item.id && event.stage === "review" && !event.completedAt))
        .map((event) => event.id === latestPublishing?.id ? { ...event, plannedDate: date, completedAt: "" } : event);
      if (!latestPublishing) {
        stageEvents = [...stageEvents, {
          id: crypto.randomUUID(),
          contentId: item.id,
          stage: "publishing",
          plannedDate: date,
          rank: 0,
          completedAt: "",
        }];
      }
      return {
        ...prev,
        contents: prev.contents.map((content) => content.id === item.id ? {
          ...content,
          publicationStatus: "scheduled",
          publishedAt: "",
          stage: "publishing",
          updatedAt: date,
        } : content),
        stageEvents,
      };
    });
    setToast("已撤销发布记录");
  }

  function saveReview(item: ContentItem) {
    if (item.publicationStatus !== "published") {
      setToast("内容发布后才能保存复盘");
      return;
    }
    if (!item.review.rating || !item.review.analysis.trim()) {
      setToast("请先完成星级评价和复盘分析");
      return;
    }
    const completedAt = new Date().toISOString();
    setState((prev) => completeContentReview(prev, item.id, date, completedAt));
    setToast(item.review.completedAt ? "复盘已更新" : "复盘已保存，内容进入已复盘");
  }

  async function analyze(kind: "topic" | "script" | "review" | "goal", payload: unknown, title: string) {
    setAiLoading(true);
    setAiResult(null);
    try {
      const response = await fetch("/api/ai/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, payload }) });
      const data = await response.json();
      setAiResult({ title, mode: data.mode === "direct" ? "direct" : "prompt", prompt: data.prompt, result: data.result });
    } catch {
      setAiResult({ title, mode: "prompt", prompt: `请帮我分析以下${title}：\n\n${JSON.stringify(payload, null, 2)}` });
    } finally {
      setAiLoading(false);
    }
  }

  async function copyText(text: string) {
    await navigator.clipboard.writeText(text);
    setToast("已复制到剪贴板");
  }

  function exportData() {
    const next = { ...state, lastBackupAt: new Date().toISOString() };
    setState(next);
    const blob = new Blob([JSON.stringify(next, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `内容驾驶舱-${todayISO()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setToast("备份已导出");
  }

  async function importData(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      if (!validateImport(parsed)) throw new Error("invalid");
      if (importMode === "replace" && !window.confirm("覆盖会替换当前全部数据，确定继续吗？")) return;
      const restored = migrateWorkspace(parsed);
      if (!restored) throw new Error("invalid");
      setState(importMode === "merge" ? mergeWorkspace(state, restored) : restored);
      setToast(importMode === "merge" ? "数据已合并" : "数据已恢复");
    } catch {
      setToast("无法识别这个备份文件");
    } finally {
      event.target.value = "";
    }
  }

  function startWorkspace(mode: "demo" | "blank", profile: CreatorProfile) {
    const next = mode === "demo" ? createDemoState() : createBlankState();
    setState({ ...next, profile });
    setShowOnboarding(false);
    setHydrated(true);
  }

  const nav = [
    { id: "momentum" as const, label: "推进", icon: "momentum" },
    { id: "schedule" as const, label: "档期规划", icon: "schedule" },
    { id: "pipeline" as const, label: "内容管线", icon: "pipeline" },
    { id: "goals" as const, label: "大目标（阶段）", icon: "goals" },
    { id: "review" as const, label: "复盘实验室", icon: "review" },
  ];

  return (
    <div className={sidebarCollapsed ? "cockpit-shell sidebar-collapsed" : "cockpit-shell"}>
      <aside className="sidebar">
        <button
          className="sidebar-toggle"
          onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
          aria-label={sidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
          title={sidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
        ><span aria-hidden="true">{sidebarCollapsed ? "›" : "‹"}</span></button>
        <button className="brand" onClick={() => { setView("momentum"); setMomentumPeriod("today"); }} aria-label="返回今日 Todo">
          <span className="brand-mark">{creatorMark(state.profile)}</span><span><strong>{workspaceTitle}</strong><small>{state.profile.primaryPlatform}{state.profile.contentFocus ? ` · ${state.profile.contentFocus}` : ""}</small></span>
        </button>
        <nav aria-label="主导航">
          <div className="nav-section-label">工作台</div>
          {nav.map((item) => <button key={item.id} className={view === item.id ? "nav-item active" : "nav-item"} onClick={() => setView(item.id)} aria-label={item.label} title={sidebarCollapsed ? item.label : undefined}><Icon name={item.icon} /><span>{item.label}</span>{item.id === "review" && reviewDue.length > 0 ? <em>{reviewDue.length}</em> : null}</button>)}
        </nav>
        <div className="sidebar-bottom">
          <button className={view === "settings" ? "nav-item active" : "nav-item"} onClick={() => setView("settings")} aria-label="设置与备份" title={sidebarCollapsed ? "设置与备份" : undefined}><Icon name="settings" /><span>设置与备份</span></button>
          <div className="quarter-mini"><div><span>当前阶段进度</span><strong>{percent(health.timeProgress)}</strong></div><ProgressBar value={health.timeProgress} /><small>{health.weeksRemaining} 周后结束 · 本机自动保存</small></div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="mobile-brand"><span className="brand-mark">{creatorMark(state.profile)}</span><strong>{workspaceTitle}</strong></div>
          <div className="topbar-date"><span>{new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "long", day: "numeric", weekday: "long" }).format(new Date())}</span><small>目标第 {Math.max(1, Math.ceil(((new Date().getTime() - new Date(`${state.goal.startDate}T12:00:00`).getTime()) / 86_400_000 + 1) / 7))} 周</small></div>
          <div className="topbar-actions"><button className="ghost-button search-button" onClick={() => { setView("pipeline"); setTimeout(() => document.getElementById("pipeline-search")?.focus(), 0); }}><Icon name="search" />搜索内容</button><button className="primary-button" onClick={createContentAndOpen}><Icon name="plus" />新建内容</button></div>
        </header>

        <div className="page-scroll">
          {view === "momentum" ? (
            <section className="page momentum-page">
              <div className="page-heading split-heading"><div><span className="eyebrow">MOMENTUM</span><EditablePageTitle value={state.pageTitles[momentumPeriod]} fallback={DEFAULT_PAGE_TITLES[momentumPeriod]} onChange={(value) => updatePageTitle(momentumPeriod, value)} /><p>{momentumPeriod === "today" ? "今日 Todo 自动读取档期；一个任务就是一条内容的一个大阶段。" : "本周总览自动汇总档期，不需要再维护一份周计划。"}</p></div><div className="period-switch momentum-period-switch" role="tablist" aria-label="推进时间范围"><button className={momentumPeriod === "today" ? "active" : ""} onClick={() => setMomentumPeriod("today")} role="tab" aria-selected={momentumPeriod === "today"}>今日</button><button className={momentumPeriod === "week" ? "active" : ""} onClick={() => setMomentumPeriod("week")} role="tab" aria-selected={momentumPeriod === "week"}>本周</button></div></div>
              {momentumPeriod === "today" ? <DayView items={todayEntries} stageColors={state.stageColors} open={openContent} openSchedule={() => setView("schedule")} moveToday={moveToday} toggleComplete={toggleTodayComplete} removeFromToday={removeFromToday} /> : <WeekOverview state={state} open={openContent} openSchedule={() => setView("schedule")} />}
            </section>
          ) : null}

          {view === "schedule" ? <section className="page momentum-page"><div className="page-heading"><span className="eyebrow">PRODUCTION SCHEDULE</span><EditablePageTitle value={state.pageTitles.schedule} fallback={DEFAULT_PAGE_TITLES.schedule} onChange={(value) => updatePageTitle("schedule", value)} /><p>安排内容阶段，也可以放入复盘、直播和你自定义的日程对象。</p></div><ScheduleView state={state} open={openContent} openReview={() => setView("review")} schedule={planStage} moveEvent={moveCalendarEvent} unschedule={clearStagePlan} createReviewDay={createReviewDay} moveReviewDay={moveReviewDay} removeReviewDay={deleteReviewDay} saveLive={saveLiveSession} moveLive={moveLiveSession} removeLive={deleteLiveSession} saveObjectType={saveScheduleObjectType} saveObject={saveScheduleObject} moveObject={moveScheduleObject} removeObject={deleteScheduleObject} configureColors={() => setShowStageColors(true)} /></section> : null}
          {view === "pipeline" ? <PipelineView state={state} pageTitle={state.pageTitles.pipeline} updateTitle={(value) => updatePageTitle("pipeline", value)} query={pipelineQuery} setQuery={setPipelineQuery} type={pipelineType} setType={setPipelineType} open={openContent} addToday={addToToday} dropStage={onDropStage} create={createContentAndOpen} /> : null}
          {view === "goals" ? <GoalsView state={state} pageTitle={state.pageTitles.goals} updateTitle={(value) => updatePageTitle("goals", value)} health={health} followers={followers} published={publishedQuarter} updateGoal={updateGoal} setState={setState} /> : null}
          {view === "review" ? <ReviewView state={state} pageTitle={state.pageTitles.review} updateTitle={(value) => updatePageTitle("review", value)} open={(id) => openContent(id, "review")} setState={setState} /> : null}
          {view === "settings" ? <SettingsView state={state} pageTitle={state.pageTitles.settings} updateTitle={(value) => updatePageTitle("settings", value)} setState={setState} exportData={exportData} fileInput={fileInput} importData={importData} importMode={importMode} setImportMode={setImportMode} onReset={async () => { if (window.confirm("确定清空全部内容与目标数据吗？个人设置会保留，请先导出备份。")) { await clearWorkspace(); setState({ ...createBlankState(), profile: state.profile, pageTitles: state.pageTitles }); setToast("已清空内容与目标，个人设置已保留"); } }} /> : null}
        </div>
      </main>

      <nav className="mobile-nav" aria-label="移动端导航">{nav.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><Icon name={item.icon} /><span>{item.label}</span></button>)}</nav>
      {selected ? <ContentDrawer item={selected} initialTab={selectedTab} stageEvents={state.stageEvents} stageColors={state.stageColors} contentTypes={state.contentTypes} close={() => setSelectedId(null)} update={(patch) => updateContent(selected.id, patch)} changeStage={(stage) => setState((prev) => transitionContentStage(prev, selected.id, stage, date))} setStageStatus={(stage, completed) => setStageStatus(selected.id, stage, completed)} schedule={(stage, plannedDate) => planStage(selected.id, stage, plannedDate)} unschedule={(stage) => clearStagePlan(selected.id, stage)} remove={() => deleteContent(selected)} markPublished={() => markPublished(selected)} unmarkPublished={() => unmarkPublished(selected)} saveReview={() => saveReview(selected)} analyze={(kind, payload, title) => analyze(kind, payload, title)} aiLoading={aiLoading} ruleDeposited={Boolean(selected.review.learnedRule.trim() && state.insightRules.some((rule) => rule.sourceContentId === selected.id && rule.text === selected.review.learnedRule.trim()))} addRule={(text) => { const normalized = text.trim(); if (!normalized) return; setState((prev) => { const existing = prev.insightRules.find((rule) => rule.sourceContentId === selected.id && rule.text === normalized); if (existing) return { ...prev, insightRules: prev.insightRules.map((rule) => rule.id === existing.id ? { ...rule, active: true } : rule) }; const rule: InsightRule = { id: crypto.randomUUID(), text: normalized, sourceContentId: selected.id, createdAt: todayISO(), active: true }; return { ...prev, insightRules: [rule, ...prev.insightRules] }; }); setToast("已沉淀为内容规则"); }} /> : null}
      {showStageColors ? <StageColorModal colors={state.stageColors} close={() => setShowStageColors(false)} update={(stage, color) => setState((prev) => ({ ...prev, stageColors: { ...prev.stageColors, [stage]: color.toUpperCase() } }))} reset={() => setState((prev) => ({ ...prev, stageColors: { ...DEFAULT_STAGE_COLORS } }))} /> : null}
      {aiResult ? <AiModal result={aiResult} close={() => setAiResult(null)} copy={copyText} /> : null}
      {showOnboarding ? <Onboarding start={startWorkspace} /> : null}
      {toast ? <div className="toast" role="status">{toast}</div> : null}
    </div>
  );
}

function DayView({ items, stageColors, open, openSchedule, moveToday, toggleComplete, removeFromToday }: {
  items: DailyStageEntry[];
  stageColors: WorkspaceState["stageColors"];
  open: (id: string) => void;
  openSchedule: () => void;
  moveToday: (eventId: string, direction: -1 | 1) => void;
  toggleComplete: (eventId: string) => void;
  removeFromToday: (eventId: string) => void;
}) {
  const pending = items.filter(({ event }) => !event.completedAt).length;
  const completed = items.length - pending;
  return <div className="panel today-panel todo-only-panel">
    <div className="panel-heading"><div><span className="eyebrow">TODAY&apos;S TODO</span><h2>今天要完成的阶段</h2></div><div className="todo-heading-actions"><span className="count-label">{pending} 待完成 · {completed} 已完成</span><button className="text-button" onClick={openSchedule}>调整档期 →</button></div></div>
    {items.length ? <div className="today-list">{items.map(({ event, item }, index) => {
      const isDone = Boolean(event.completedAt);
      const waiting = !isDone && stageIndex(item.stage) < stageIndex(event.stage);
      return <article key={event.id} className={`${isDone ? "today-card completed" : "today-card"} ${waiting ? "waiting" : ""}`}>
        <label className="today-check" title={waiting ? `先完成${STAGE_LABELS[item.stage]}阶段` : isDone ? "取消完成并恢复原阶段" : `完成${STAGE_LABELS[event.stage]}阶段`}>
          <input type="checkbox" checked={isDone} disabled={waiting} onChange={() => toggleComplete(event.id)} aria-label={isDone ? `撤销完成：${item.title}·${STAGE_LABELS[event.stage]}` : `完成：${item.title}·${STAGE_LABELS[event.stage]}`} />
          <span aria-hidden="true">✓</span>
        </label>
        <div className="rank">{String(event.rank || index + 1).padStart(2, "0")}</div>
        <button className="today-main" onClick={() => open(item.id)}>
          {isDone ? <div className="completed-copy"><h3>{item.title}</h3><p>{STAGE_LABELS[event.stage]}已完成 · 当前进入{STAGE_LABELS[item.stage]}</p></div> : <><div><Badge tone={event.stage} color={stageColors[event.stage]}>{STAGE_LABELS[event.stage]}</Badge><Badge tone={`tier-${item.tier.toLowerCase()}`}>{item.tier}档</Badge>{waiting ? <Badge tone="neutral">等待前置阶段</Badge> : null}</div><h3>{item.title}</h3><p><Icon name="arrow" />{waiting ? `先完成${STAGE_LABELS[item.stage]}` : NEXT_ACTIONS[event.stage]}</p></>}
        </button>
        {!isDone ? <div className="today-controls"><button onClick={() => moveToday(event.id, -1)} aria-label="上移">↑</button><button onClick={() => moveToday(event.id, 1)} aria-label="下移">↓</button><button onClick={() => removeFromToday(event.id)} aria-label="取消今日排期">×</button></div> : <span className="done-status">阶段完成</span>}
      </article>;
    })}</div> : <Empty title="今天没有 Todo" body="去档期规划，把某条内容的一个阶段拖到今天。" action={<button className="secondary-button" onClick={openSchedule}>打开档期规划</button>} />}
    {items.length ? <div className="todo-footnote"><span>今日 Todo 完全来自档期</span><button onClick={openSchedule}>添加或调整阶段</button></div> : null}
  </div>;
}

function WeekOverview({ state, open, openSchedule }: {
  state: WorkspaceState;
  open: (id: string) => void;
  openSchedule: () => void;
}) {
  const weekStart = startOfWeekISO(new Date(`${date}T12:00:00`));
  const weekEnd = shiftDate(weekStart, 6);
  const weeklyEvents = state.stageEvents
    .filter((event) => SCHEDULABLE_STAGES.includes(event.stage) && event.plannedDate >= weekStart && event.plannedDate <= weekEnd)
    .sort((a, b) => a.plannedDate.localeCompare(b.plannedDate) || a.rank - b.rank);
  const grouped = new Map<string, StageEvent[]>();
  for (const event of weeklyEvents) grouped.set(event.contentId, [...(grouped.get(event.contentId) ?? []), event]);
  const weeklyContents = Array.from(grouped.entries())
    .map(([contentId, events]) => {
      const item = state.contents.find((content) => content.id === contentId);
      return item ? { item, events } : null;
    })
    .filter((entry): entry is { item: ContentItem; events: StageEvent[] } => Boolean(entry))
    .sort((a, b) => {
      const aDone = a.events.every((event) => Boolean(event.completedAt));
      const bDone = b.events.every((event) => Boolean(event.completedAt));
      return Number(aDone) - Number(bDone) || a.events[0].plannedDate.localeCompare(b.events[0].plannedDate);
    });
  const completedStages = weeklyEvents.filter((event) => Boolean(event.completedAt)).length;
  const pendingStages = weeklyEvents.length - completedStages;
  const overdueStages = weeklyEvents.filter((event) => !event.completedAt && event.plannedDate < date).length;
  const publishedContents = state.contents.filter(
    (item) => item.publicationStatus === "published" && item.publishedAt >= weekStart && item.publishedAt <= weekEnd,
  );
  const expectedPublishIds = new Set([
    ...weeklyEvents.filter((event) => event.stage === "publishing").map((event) => event.contentId),
    ...publishedContents.map((item) => item.id),
  ]);
  const formatStageDate = (plannedDate: string) => {
    const weekday = new Intl.DateTimeFormat("zh-CN", { weekday: "short" }).format(new Date(`${plannedDate}T12:00:00`));
    return `${weekday} ${plannedDate.slice(5).replace("-", ".")}`;
  };

  return <div className="week-overview">
    <section className="panel week-summary-panel">
      <header><div><span className="eyebrow">THIS WEEK</span><h2>{weekStart.slice(5)} — {weekEnd.slice(5)}</h2></div><button className="text-button" onClick={openSchedule}>调整本周档期 →</button></header>
      <div className="week-summary-kpis">
        <div><span>已发布 / 预期发布</span><strong>{publishedContents.length}<small> / {expectedPublishIds.size}</small></strong><em>以发布阶段档期统计</em></div>
        <div><span>阶段完成</span><strong>{completedStages}<small> / {weeklyEvents.length}</small></strong><em>{weeklyEvents.length ? `${percent(completedStages / weeklyEvents.length)} 完成率` : "本周暂无阶段"}</em></div>
        <div><span>涉及内容</span><strong>{weeklyContents.length}</strong><em>本周需要处理的内容</em></div>
        <div className={overdueStages ? "risk" : ""}><span>待推进阶段</span><strong>{pendingStages}</strong><em>{overdueStages ? `${overdueStages} 个已逾期` : "当前无逾期"}</em></div>
      </div>
    </section>

    <section className="week-content-section">
      <div className="week-content-heading"><div><span className="eyebrow">WEEKLY CONTENT</span><h2>本周需要推进的内容</h2></div><span>{weeklyContents.length} 条内容 · {weeklyEvents.length} 个阶段</span></div>
      {weeklyContents.length ? <div className="week-content-grid">{weeklyContents.map(({ item, events }) => {
        const completed = events.filter((event) => Boolean(event.completedAt)).length;
        const allDone = completed === events.length;
        const progress = Math.round(stageProgress(item.stage) * 100);
        return <article key={item.id} className={`week-content-card ${allDone ? "completed" : ""}`} style={{ "--stage-color": state.stageColors[item.stage] } as React.CSSProperties}>
          <button onClick={() => open(item.id)}>
            <header><div><Badge tone={item.stage} color={state.stageColors[item.stage]}>当前 · {STAGE_LABELS[item.stage]}</Badge><Badge tone={`tier-${item.tier.toLowerCase()}`}>{item.tier}档</Badge></div><span>{progress}%</span></header>
            <h3>{item.title}</h3>
            <div className="week-stage-list">{events.map((event) => {
              const isDone = Boolean(event.completedAt);
              const overdue = !isDone && event.plannedDate < date;
              return <span key={event.id} className={`${isDone ? "completed" : ""} ${overdue ? "overdue" : ""}`} style={{ "--stage-color": state.stageColors[event.stage] } as React.CSSProperties}><i>{isDone ? "✓" : ""}</i><strong>{STAGE_LABELS[event.stage]}</strong><time>{formatStageDate(event.plannedDate)}</time></span>;
            })}</div>
            <footer><span>{item.contentType}</span><strong>{completed} / {events.length} 阶段完成</strong></footer>
          </button>
        </article>;
      })}</div> : <div className="panel"><Empty title="本周还没有安排内容" body="去档期规划，把要推进的内容阶段放进本周。" action={<button className="secondary-button" onClick={openSchedule}>打开档期规划</button>} /></div>}
    </section>
  </div>;
}

type ScheduleDragData =
  | { kind: "content-stage"; contentId: string; stage: WorkStage; eventId?: string }
  | { kind: "review-day-template" }
  | { kind: "review-day"; reviewDayId: string }
  | { kind: "live-template" }
  | { kind: "live-session"; liveSessionId: string }
  | { kind: "schedule-object-template"; typeId: string }
  | { kind: "schedule-object"; objectId: string };

function ScheduleView({
  state,
  open,
  openReview,
  schedule,
  moveEvent,
  unschedule,
  createReviewDay,
  moveReviewDay,
  removeReviewDay,
  saveLive,
  moveLive,
  removeLive,
  saveObjectType,
  saveObject,
  moveObject,
  removeObject,
  configureColors,
}: {
  state: WorkspaceState;
  open: (id: string) => void;
  openReview: () => void;
  schedule: (contentId: string, stage: WorkStage, plannedDate: string) => void;
  moveEvent: (eventId: string, plannedDate: string) => void;
  unschedule: (contentId: string, stage: WorkStage) => void;
  createReviewDay: (plannedDate: string) => void;
  moveReviewDay: (reviewDayId: string, plannedDate: string) => void;
  removeReviewDay: (reviewDayId: string) => void;
  saveLive: (session: LiveSession) => void;
  moveLive: (liveSessionId: string, plannedDate: string) => void;
  removeLive: (liveSessionId: string) => void;
  saveObjectType: (type: ScheduleObjectType) => void;
  saveObject: (object: ScheduleObject) => void;
  moveObject: (objectId: string, plannedDate: string) => void;
  removeObject: (objectId: string) => void;
  configureColors: () => void;
}) {
  const [mode, setMode] = useState<"week" | "month">("month");
  const [anchor, setAnchor] = useState(date);
  const [liveDraft, setLiveDraft] = useState<LiveSession | null>(null);
  const [objectDraft, setObjectDraft] = useState<ScheduleObject | null>(null);
  const [typeDraft, setTypeDraft] = useState<ScheduleObjectType | null>(null);
  const anchorDate = new Date(`${anchor}T12:00:00`);
  const year = anchorDate.getFullYear();
  const month = anchorDate.getMonth() + 1;
  const monthDays = new Date(year, month, 0).getDate();
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const leading = (new Date(`${monthStart}T12:00:00`).getDay() + 6) % 7;
  const monthCells: Array<string | null> = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: monthDays }, (_, index) => `${year}-${String(month).padStart(2, "0")}-${String(index + 1).padStart(2, "0")}`),
  ];
  const weekStart = startOfWeekISO(anchorDate);
  const weekDates = Array.from({ length: 7 }, (_, index) => shiftDate(weekStart, index));
  const visibleDates = mode === "month" ? monthCells : weekDates;
  const periodLabel = mode === "month"
    ? `${year} 年 ${month} 月`
    : `${weekDates[0].slice(5)} — ${weekDates[6].slice(5)}`;

  const writeDrag = (event: DragEvent, data: ScheduleDragData) => {
    const value = JSON.stringify(data);
    event.dataTransfer.setData("application/x-stage-schedule", value);
    event.dataTransfer.setData("text/plain", value);
    event.dataTransfer.effectAllowed = data.kind.endsWith("template") ? "copyMove" : "move";
  };

  const scrollHorizontalRow = (event: WheelEvent<HTMLDivElement>) => {
    const row = event.currentTarget;
    if (row.scrollWidth <= row.clientWidth) return;
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    const maxScroll = row.scrollWidth - row.clientWidth;
    const nextScroll = Math.max(0, Math.min(maxScroll, row.scrollLeft + delta));
    if (nextScroll === row.scrollLeft) return;
    event.preventDefault();
    row.scrollLeft = nextScroll;
  };
  const readDrag = (event: DragEvent): ScheduleDragData | null => {
    const value = event.dataTransfer.getData("application/x-stage-schedule") || event.dataTransfer.getData("text/plain");
    try {
      const parsed = JSON.parse(value) as ScheduleDragData;
      if (parsed.kind === "content-stage") {
        return parsed.contentId && SCHEDULABLE_STAGES.includes(parsed.stage) ? parsed : null;
      }
      if (parsed.kind === "review-day-template" || parsed.kind === "live-template") return parsed;
      if (parsed.kind === "review-day" && parsed.reviewDayId) return parsed;
      if (parsed.kind === "live-session" && parsed.liveSessionId) return parsed;
      if (parsed.kind === "schedule-object-template" && parsed.typeId) return parsed;
      if (parsed.kind === "schedule-object" && parsed.objectId) return parsed;
      return null;
    } catch {
      return null;
    }
  };
  const movePeriod = (direction: -1 | 1) => {
    const next = new Date(`${anchor}T12:00:00`);
    if (mode === "week") next.setDate(next.getDate() + direction * 7);
    else next.setMonth(next.getMonth() + direction, 1);
    setAnchor(next.toISOString().slice(0, 10));
  };
  const pendingFor = (contentId: string, stage: WorkStage) => state.stageEvents.find(
    (event) => event.contentId === contentId && event.stage === stage && !event.completedAt,
  );
  const unscheduledContents = state.contents
    .filter((item) => item.stage !== "archived" && item.stage !== "review")
    .sort((a, b) => Number(b.priority === "high") - Number(a.priority === "high") || b.updatedAt.localeCompare(a.updatedAt));

  const openNewLive = (plannedDate: string) => {
    const timestamp = new Date().toISOString();
    setLiveDraft({
      id: crypto.randomUUID(),
      title: "",
      plannedDate,
      startTime: "20:00",
      endTime: "21:00",
      platform: state.profile.primaryPlatform,
      content: "",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  };

  const openNewObject = (typeId: string, plannedDate: string) => {
    const type = state.scheduleObjectTypes.find((item) => item.id === typeId);
    if (!type) return;
    const timestamp = new Date().toISOString();
    setObjectDraft({
      id: crypto.randomUUID(),
      typeId,
      title: type.name,
      plannedDate,
      startTime: "",
      endTime: "",
      details: "",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  };

  const openNewType = () => {
    const colors = ["#4F7A72", "#7B6D9B", "#A36A45", "#4C6F91", "#8A6B3F", "#55745A"];
    setTypeDraft({
      id: crypto.randomUUID(),
      name: "",
      description: "",
      color: colors[state.scheduleObjectTypes.length % colors.length],
      createdAt: new Date().toISOString(),
    });
  };

  const handleDayDrop = (data: ScheduleDragData, plannedDate: string) => {
    if (data.kind === "content-stage") {
      if (data.eventId) moveEvent(data.eventId, plannedDate);
      else schedule(data.contentId, data.stage, plannedDate);
    } else if (data.kind === "review-day-template") {
      createReviewDay(plannedDate);
    } else if (data.kind === "review-day") {
      moveReviewDay(data.reviewDayId, plannedDate);
    } else if (data.kind === "live-template") {
      openNewLive(plannedDate);
    } else if (data.kind === "live-session") {
      moveLive(data.liveSessionId, plannedDate);
    } else if (data.kind === "schedule-object-template") {
      openNewObject(data.typeId, plannedDate);
    } else {
      moveObject(data.objectId, plannedDate);
    }
  };

  const handlePoolDrop = (data: ScheduleDragData) => {
    if (data.kind === "content-stage") unschedule(data.contentId, data.stage);
  };

  const confirmRemoveLive = (session: LiveSession) => {
    if (!window.confirm(`确定删除直播日程「${session.title}」吗？`)) return false;
    removeLive(session.id);
    return true;
  };

  const confirmRemoveObject = (object: ScheduleObject) => {
    if (!window.confirm(`确定删除日程「${object.title}」吗？`)) return false;
    removeObject(object.id);
    return true;
  };

  const renderContentEvents = (plannedDate: string) => sortStageEvents(
    state.stageEvents.filter((event) => SCHEDULABLE_STAGES.includes(event.stage) && event.plannedDate === plannedDate),
  ).map((event) => {
    const item = state.contents.find((content) => content.id === event.contentId);
    if (!item) return null;
    const isDone = Boolean(event.completedAt);
    const overdue = !isDone && plannedDate < date;
    return <article
      key={event.id}
      draggable
      onDragStart={(dragEvent) => writeDrag(dragEvent, { kind: "content-stage", contentId: item.id, stage: event.stage, eventId: event.id })}
      className={`schedule-calendar-event ${isDone ? "completed" : ""} ${overdue ? "overdue" : ""}`}
      style={{ "--stage-color": state.stageColors[event.stage] } as React.CSSProperties}
    >
      <button className="schedule-event-main" onClick={() => open(item.id)} title={`${item.title} · ${STAGE_LABELS[event.stage]}`}>
        <em>{STAGE_LABELS[event.stage]}</em><strong>{item.title}</strong>{isDone ? <i>✓</i> : null}
      </button>
      {!isDone ? <button className="schedule-event-remove" onClick={() => unschedule(item.id, event.stage)} aria-label={`取消${item.title}的${STAGE_LABELS[event.stage]}排期`}>×</button> : null}
    </article>;
  });

  const renderReviewDays = (plannedDate: string) => state.reviewDays
    .filter((item) => item.plannedDate === plannedDate)
    .map((reviewDay) => {
      const pendingCount = state.contents.filter(
        (item) => item.publicationStatus === "published" && !item.review.completedAt,
      ).length;
      return <article
        key={reviewDay.id}
        draggable
        onDragStart={(dragEvent) => writeDrag(dragEvent, { kind: "review-day", reviewDayId: reviewDay.id })}
        className="schedule-calendar-event schedule-special-event review-day-event"
        style={{ "--stage-color": "#82637E" } as React.CSSProperties}
      >
        <button className="schedule-event-main" onClick={openReview} title="打开复盘实验室">
          <em>复盘</em><strong>{pendingCount ? `集中处理 ${pendingCount} 条待复盘` : "统一回看内容表现"}</strong>
        </button>
        <button className="schedule-event-remove" onClick={() => removeReviewDay(reviewDay.id)} aria-label="取消复盘">×</button>
      </article>;
    });

  const renderLiveSessions = (plannedDate: string) => state.liveSessions
    .filter((item) => item.plannedDate === plannedDate)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
    .map((session) => <article
      key={session.id}
      draggable
      onDragStart={(dragEvent) => writeDrag(dragEvent, { kind: "live-session", liveSessionId: session.id })}
      className="schedule-calendar-event schedule-special-event live-session-event"
      style={{ "--stage-color": "#B45A3C" } as React.CSSProperties}
    >
      <button className="schedule-event-main" onClick={() => setLiveDraft({ ...session })} title={session.content || session.title}>
        <em>直播</em><strong>{session.title}</strong><i>{session.startTime || "待定"}</i>
      </button>
      <button className="schedule-event-remove" onClick={() => confirmRemoveLive(session)} aria-label={`删除直播：${session.title}`}>×</button>
    </article>);

  const renderScheduleObjects = (plannedDate: string) => state.scheduleObjects
    .filter((item) => item.plannedDate === plannedDate)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
    .map((object) => {
      const type = state.scheduleObjectTypes.find((item) => item.id === object.typeId);
      if (!type) return null;
      return <article
        key={object.id}
        draggable
        onDragStart={(dragEvent) => writeDrag(dragEvent, { kind: "schedule-object", objectId: object.id })}
        className="schedule-calendar-event schedule-special-event custom-schedule-event"
        style={{ "--stage-color": type.color } as React.CSSProperties}
      >
        <button className="schedule-event-main" onClick={() => setObjectDraft({ ...object })} title={object.details || object.title}>
          <em>{type.name}</em><strong>{object.title}</strong>{object.startTime ? <i>{object.startTime}</i> : null}
        </button>
        <button className="schedule-event-remove" onClick={() => confirmRemoveObject(object)} aria-label={`删除${type.name}：${object.title}`}>×</button>
      </article>;
    });

  const renderDay = (plannedDate: string, compact: boolean) => {
    const day = Number(plannedDate.slice(-2));
    const weekday = new Intl.DateTimeFormat("zh-CN", { weekday: "short" }).format(new Date(`${plannedDate}T12:00:00`));
    return <section
      key={plannedDate}
      className={`schedule-day-cell ${plannedDate === date ? "today" : ""} ${compact ? "compact" : ""}`}
      data-date={plannedDate}
      aria-label={`${plannedDate} 档期`}
      onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }}
      onDrop={(event) => { event.preventDefault(); const data = readDrag(event); if (data) handleDayDrop(data, plannedDate); }}
    >
      <header><strong>{day}</strong>{!compact ? <span>{weekday}</span> : null}</header>
      <div className="schedule-day-events">{renderReviewDays(plannedDate)}{renderLiveSessions(plannedDate)}{renderScheduleObjects(plannedDate)}{renderContentEvents(plannedDate)}</div>
    </section>;
  };

  return <><div className="schedule-layout">
    <aside
      className="panel schedule-pool"
      onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }}
      onDrop={(event) => { event.preventDefault(); const data = readDrag(event); if (data) handlePoolDrop(data); }}
    >
      <div className="schedule-pool-heading"><div><span className="eyebrow">SCHEDULE POOL</span><h2>档期对象</h2></div><button className="stage-colors-button" onClick={configureColors}><span aria-hidden="true">◐</span>阶段配色</button></div>
      <p>先放运营日程，再把内容的大纲、脚本、录制、剪辑和发布拖到具体日期。</p>
      <section className="schedule-operation-pool">
        <header><div><strong>运营日程</strong><small>每个模板都可无限次拖入日历</small></div><div className="schedule-operation-actions"><span>无限次</span><button onClick={openNewType} aria-label="新建日程类型">＋ 新建</button></div></header>
        <div className="schedule-operation-templates" onWheel={scrollHorizontalRow}>
          <button
            draggable
            className="review-day-template"
            onDragStart={(event) => writeDrag(event, { kind: "review-day-template" })}
            aria-label="拖动创建复盘"
          ><span className="operation-icon">◌</span><span><strong>复盘</strong><small>集中查看待复盘内容</small></span></button>
          <button
            draggable
            className="live-day-template"
            onDragStart={(event) => writeDrag(event, { kind: "live-template" })}
            aria-label="拖动创建直播"
          ><span className="operation-icon">●</span><span><strong>直播</strong><small>安排主题与直播内容</small></span></button>
          {state.scheduleObjectTypes.map((type) => <button
            key={type.id}
            draggable
            className="custom-schedule-template"
            style={{ "--event-color": type.color } as React.CSSProperties}
            onDragStart={(event) => writeDrag(event, { kind: "schedule-object-template", typeId: type.id })}
            aria-label={`拖动创建${type.name}`}
          ><span className="operation-icon">◆</span><span><strong>{type.name}</strong><small>{type.description || `安排${type.name}`}</small></span></button>)}
        </div>
      </section>
      <div className="schedule-content-section-title"><div><strong>内容阶段</strong><small>复盘不再针对单条内容排期</small></div></div>
      <div className="schedule-content-list">{unscheduledContents.map((item) => {
        const firstStage = item.stage === "inbox" ? "topic" : item.stage as WorkStage;
        const remainingStages = SCHEDULABLE_STAGES.slice(SCHEDULABLE_STAGES.indexOf(firstStage));
        const progress = Math.round(stageProgress(item.stage) * 100);
        return <article key={item.id} className="schedule-content-card" style={{ "--stage-color": state.stageColors[item.stage] } as React.CSSProperties}>
          <button className="schedule-content-heading" onClick={() => open(item.id)}>
            <div className="schedule-content-heading-row"><div className="schedule-content-badges"><Badge tone={item.stage} color={state.stageColors[item.stage]}>当前 · {STAGE_LABELS[item.stage]}</Badge><Badge tone={`tier-${item.tier.toLowerCase()}`}>{item.tier}档</Badge></div><span className="schedule-content-percent">{progress}%</span></div>
            <strong>{item.title}</strong>
            <span className="schedule-content-progress" aria-label={`内容完成度 ${progress}%`}><i style={{ width: `${progress}%` }} /></span>
          </button>
          <div className="schedule-stage-chips" onWheel={scrollHorizontalRow} aria-label={`${item.title}的内容阶段，可横向滚动`}>{remainingStages.map((stage) => {
            const planned = pendingFor(item.id, stage);
            return <button
              key={stage}
              draggable
              onDragStart={(event) => writeDrag(event, { kind: "content-stage", contentId: item.id, stage })}
              onClick={() => open(item.id)}
              className={`${stage === item.stage ? "current" : ""} ${planned ? "scheduled" : ""}`}
              style={{ "--stage-color": state.stageColors[stage] } as React.CSSProperties}
              title={planned ? `已安排到 ${planned.plannedDate}` : `拖动安排${STAGE_LABELS[stage]}`}
            ><span>⠿</span>{STAGE_LABELS[stage]}{planned ? <small>{planned.plannedDate.slice(5)}</small> : null}</button>;
          })}</div>
        </article>;
      })}</div>
    </aside>

    <section className="panel schedule-calendar-panel">
      <header className="schedule-toolbar"><div><span className="eyebrow">PRODUCTION CALENDAR</span><h2>{periodLabel}</h2></div><div className="schedule-toolbar-actions"><div className="segmented"><button className={mode === "week" ? "active" : ""} onClick={() => setMode("week")}>周</button><button className={mode === "month" ? "active" : ""} onClick={() => setMode("month")}>月</button></div><div className="calendar-nav"><button onClick={() => movePeriod(-1)} aria-label="上一档期">‹</button><button onClick={() => setAnchor(date)}>今天</button><button onClick={() => movePeriod(1)} aria-label="下一档期">›</button></div></div></header>
      <div className="schedule-legend"><span><i className="legend-stage" />颜色区分阶段和日程</span><span>复盘、直播和自定义日程可重复创建</span><span>已有事件可继续拖动改期</span></div>
      {mode === "month" ? <><div className="schedule-weekdays">{["一", "二", "三", "四", "五", "六", "日"].map((day) => <span key={day}>{day}</span>)}</div><div className="schedule-month-grid">{visibleDates.map((plannedDate, index) => plannedDate ? renderDay(plannedDate, true) : <div key={`empty-${index}`} className="schedule-day-cell empty compact" />)}</div></> : <div className="schedule-week-scroll" onWheel={scrollHorizontalRow} tabIndex={0} aria-label="周日历，可横向滚动"><div className="schedule-week-grid">{weekDates.map((plannedDate) => renderDay(plannedDate, false))}</div></div>}
    </section>
  </div>{liveDraft ? <LiveSessionModal
    session={liveDraft}
    update={setLiveDraft}
    close={() => setLiveDraft(null)}
    save={(session) => { saveLive({ ...session, title: session.title.trim(), updatedAt: new Date().toISOString() }); setLiveDraft(null); }}
    remove={state.liveSessions.some((item) => item.id === liveDraft.id) ? () => {
      if (confirmRemoveLive(liveDraft)) setLiveDraft(null);
    } : undefined}
  /> : null}{objectDraft ? <ScheduleObjectModal
    object={objectDraft}
    type={state.scheduleObjectTypes.find((item) => item.id === objectDraft.typeId)}
    update={setObjectDraft}
    close={() => setObjectDraft(null)}
    save={(object) => { saveObject({ ...object, title: object.title.trim(), details: object.details.trim(), updatedAt: new Date().toISOString() }); setObjectDraft(null); }}
    remove={state.scheduleObjects.some((item) => item.id === objectDraft.id) ? () => {
      if (confirmRemoveObject(objectDraft)) setObjectDraft(null);
    } : undefined}
  /> : null}{typeDraft ? <ScheduleTypeModal
    type={typeDraft}
    update={setTypeDraft}
    close={() => setTypeDraft(null)}
    duplicate={["复盘", "直播", ...state.scheduleObjectTypes.map((item) => item.name)].some(
      (name) => name.toLocaleLowerCase() === typeDraft.name.trim().toLocaleLowerCase(),
    )}
    save={(type) => { saveObjectType(type); setTypeDraft(null); }}
  /> : null}</>;
}

function LiveSessionModal({ session, update, close, save, remove }: {
  session: LiveSession;
  update: (session: LiveSession) => void;
  close: () => void;
  save: (session: LiveSession) => void;
  remove?: () => void;
}) {
  const patch = (value: Partial<LiveSession>) => update({ ...session, ...value });
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) close(); }}>
    <section className="live-session-modal" role="dialog" aria-modal="true" aria-labelledby="live-session-title">
      <header><div><span className="eyebrow">LIVE SCHEDULE</span><h2 id="live-session-title">{remove ? "编辑直播日程" : "创建直播日程"}</h2><p>直播是独立于内容管线的日程对象，可以随时拖动改期。</p></div><button className="close-button" onClick={close} aria-label="关闭直播日程">×</button></header>
      <div className="live-session-form">
        <label className="field full"><span>直播主题</span><input autoFocus value={session.title} onChange={(event) => patch({ title: event.target.value })} placeholder="例如：AI 工具实战答疑" /></label>
        <div className="form-grid">
          <label className="field"><span>日期</span><input type="date" value={session.plannedDate} onChange={(event) => patch({ plannedDate: event.target.value })} /></label>
          <label className="field"><span>直播平台</span><input value={session.platform} onChange={(event) => patch({ platform: event.target.value })} placeholder="例如 小红书" /></label>
          <label className="field"><span>开始时间</span><input type="time" value={session.startTime} onChange={(event) => patch({ startTime: event.target.value })} /></label>
          <label className="field"><span>结束时间</span><input type="time" value={session.endTime} onChange={(event) => patch({ endTime: event.target.value })} /></label>
        </div>
        <label className="field full"><span>直播内容 / 流程</span><textarea className="large" value={session.content} onChange={(event) => patch({ content: event.target.value })} placeholder="记录要讲的主题、演示环节、互动问题和准备事项…" /></label>
      </div>
      <footer><div>{remove ? <button className="delete-live-button" onClick={remove}>删除这场直播</button> : null}</div><div><button className="text-button" onClick={close}>取消</button><button className="primary-button" disabled={!session.title.trim() || !session.plannedDate} onClick={() => save(session)}>保存直播日程</button></div></footer>
    </section>
  </div>;
}

function ScheduleObjectModal({ object, type, update, close, save, remove }: {
  object: ScheduleObject;
  type: ScheduleObjectType | undefined;
  update: (object: ScheduleObject) => void;
  close: () => void;
  save: (object: ScheduleObject) => void;
  remove?: () => void;
}) {
  const patch = (value: Partial<ScheduleObject>) => update({ ...object, ...value });
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) close(); }}>
    <section className="live-session-modal schedule-object-modal" role="dialog" aria-modal="true" aria-labelledby="schedule-object-title" style={{ "--event-color": type?.color || "#6C7A72" } as React.CSSProperties}>
      <header><div><span className="eyebrow">CUSTOM SCHEDULE</span><h2 id="schedule-object-title">{remove ? `编辑${type?.name || "日程"}` : `创建${type?.name || "日程"}`}</h2><p>这是独立于内容管线的日程，保存后仍可在日历中拖动改期。</p></div><button className="close-button" onClick={close} aria-label="关闭自定义日程">×</button></header>
      <div className="live-session-form">
        <div className="schedule-object-type-badge"><i />{type?.name || "自定义日程"}</div>
        <label className="field full"><span>标题</span><input autoFocus value={object.title} onChange={(event) => patch({ title: event.target.value })} placeholder={`例如：${type?.name || "线下活动"}`} /></label>
        <div className="form-grid">
          <label className="field"><span>日期</span><input type="date" value={object.plannedDate} onChange={(event) => patch({ plannedDate: event.target.value })} /></label>
          <div />
          <label className="field"><span>开始时间（可选）</span><input type="time" value={object.startTime} onChange={(event) => patch({ startTime: event.target.value })} /></label>
          <label className="field"><span>结束时间（可选）</span><input type="time" value={object.endTime} onChange={(event) => patch({ endTime: event.target.value })} /></label>
        </div>
        <label className="field full"><span>备注</span><textarea className="large" value={object.details} onChange={(event) => patch({ details: event.target.value })} placeholder="记录地点、流程、需要准备的材料等…" /></label>
      </div>
      <footer><div>{remove ? <button className="delete-live-button" onClick={remove}>删除这个日程</button> : null}</div><div><button className="text-button" onClick={close}>取消</button><button className="primary-button" disabled={!type || !object.title.trim() || !object.plannedDate} onClick={() => save(object)}>保存日程</button></div></footer>
    </section>
  </div>;
}

function ScheduleTypeModal({ type, update, close, save, duplicate }: {
  type: ScheduleObjectType;
  update: (type: ScheduleObjectType) => void;
  close: () => void;
  save: (type: ScheduleObjectType) => void;
  duplicate: boolean;
}) {
  const patch = (value: Partial<ScheduleObjectType>) => update({ ...type, ...value });
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) close(); }}>
    <section className="live-session-modal schedule-type-modal" role="dialog" aria-modal="true" aria-labelledby="schedule-type-title" style={{ "--event-color": type.color } as React.CSSProperties}>
      <header><div><span className="eyebrow">REUSABLE SCHEDULE</span><h2 id="schedule-type-title">新建日程类型</h2><p>创建一次，就会留在档期对象中，可以无限次拖入日历。</p></div><button className="close-button" onClick={close} aria-label="关闭新建日程类型">×</button></header>
      <div className="live-session-form">
        <label className="field full"><span>类型名称</span><input autoFocus maxLength={10} value={type.name} onChange={(event) => patch({ name: event.target.value })} placeholder="例如：活动" />{duplicate ? <small className="field-error">这个名称已经存在</small> : null}</label>
        <label className="field full"><span>一句话说明（可选）</span><input maxLength={40} value={type.description} onChange={(event) => patch({ description: event.target.value })} placeholder="例如：线下活动、展会或特别安排" /></label>
        <label className="schedule-type-color-field"><span>识别颜色</span><div><i style={{ background: type.color }} /><code>{type.color.toUpperCase()}</code><input type="color" value={type.color} onChange={(event) => patch({ color: event.target.value.toUpperCase() })} aria-label="日程类型颜色" /></div></label>
        <div className="schedule-type-preview"><span className="operation-icon">◆</span><span><strong>{type.name.trim() || "新类型"}</strong><small>{type.description.trim() || "拖入日历后创建具体日程"}</small></span></div>
      </div>
      <footer><div /><div><button className="text-button" onClick={close}>取消</button><button className="primary-button" disabled={!type.name.trim() || duplicate} onClick={() => save(type)}>创建类型</button></div></footer>
    </section>
  </div>;
}

function StageColorModal({ colors, close, update, reset }: {
  colors: WorkspaceState["stageColors"];
  close: () => void;
  update: (stage: ContentStage, color: string) => void;
  reset: () => void;
}) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) close(); }}>
    <section className="stage-color-modal" role="dialog" aria-modal="true" aria-labelledby="stage-color-title">
      <header><div><span className="eyebrow">STAGE COLORS</span><h2 id="stage-color-title">阶段配色</h2><p>修改后会同步到内容阶段、档期日历、今日 Todo 和内容管线。</p></div><button className="close-button" onClick={close} aria-label="关闭阶段配色">×</button></header>
      <div className="stage-color-grid">{CONTENT_STAGES.map((stage) => <label key={stage} style={{ "--stage-color": colors[stage] } as React.CSSProperties}>
        <span className="stage-color-preview"><i /></span>
        <strong>{STAGE_LABELS[stage]}</strong>
        <code>{colors[stage]}</code>
        <input type="color" value={colors[stage]} onChange={(event) => update(stage, event.target.value)} aria-label={`${STAGE_LABELS[stage]}颜色`} />
      </label>)}</div>
      <footer><button className="text-button" onClick={reset}>恢复默认配色</button><button className="primary-button" onClick={close}>完成</button></footer>
    </section>
  </div>;
}

function PipelineView({ state, pageTitle, updateTitle, query, setQuery, type, setType, open, addToday, dropStage, create }: { state: WorkspaceState; pageTitle: string; updateTitle: (value: string) => void; query: string; setQuery: (value: string) => void; type: string; setType: (value: string) => void; open: (id: string) => void; addToday: (id: string) => void; dropStage: (event: DragEvent, stage: ContentStage) => void; create: () => void }) {
  const stages = CONTENT_STAGES;
  const filtered = state.contents.filter((item) => (type === "全部类型" || item.contentType === type) && `${item.title} ${item.idea} ${item.tags.join(" ")}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="page pipeline-page">
    <div className="page-heading split-heading"><div><span className="eyebrow">CONTENT PIPELINE</span><EditablePageTitle value={pageTitle} fallback={DEFAULT_PAGE_TITLES.pipeline} onChange={updateTitle} /><p>这里保存全局当前阶段。阶段排期在档期规划与内容详情之间同步，今天到期的阶段会自动进入 Todo。</p></div><button className="primary-button" onClick={create}><Icon name="plus" />新建内容</button></div>
    <div className="pipeline-toolbar"><label className="search-field"><Icon name="search" /><input id="pipeline-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索标题、idea 或标签" /></label><select value={type} onChange={(e) => setType(e.target.value)}><option>全部类型</option>{state.contentTypes.map((item) => <option key={item}>{item}</option>)}</select><span>{filtered.length} 条内容</span></div>
    <div className="kanban">{stages.map((stage) => {
      const items = filtered.filter((item) => item.stage === stage);
      return <section key={stage} className="kanban-column" onDragOver={(e) => e.preventDefault()} onDrop={(e) => dropStage(e, stage)}>
        <header><div><i className="stage-dot" style={{ background: state.stageColors[stage] }} /><h2>{STAGE_LABELS[stage]}</h2></div><span>{items.length}</span></header>
        <div className="kanban-list">{items.map((item) => {
          const todayEvent = state.stageEvents.find((event) => event.contentId === item.id && event.stage === item.stage && event.plannedDate === date);
          const nextPlanned = state.stageEvents
            .filter((event) => event.contentId === item.id && !event.completedAt)
            .sort((a, b) => a.plannedDate.localeCompare(b.plannedDate) || a.rank - b.rank)[0];
          return <article key={item.id} draggable onDragStart={(e) => e.dataTransfer.setData("text/content-id", item.id)} className="kanban-card">
            <button className="kanban-card-main" onClick={() => open(item.id)}><div className="card-tags"><Badge tone={`tier-${item.tier.toLowerCase()}`}>{item.tier}档</Badge><span>{item.contentType}</span></div><h3>{item.title}</h3><p>{item.idea}</p><footer><span>{NEXT_ACTIONS[item.stage]}</span>{nextPlanned ? <time>{STAGE_LABELS[nextPlanned.stage]} · {nextPlanned.plannedDate.slice(5)}</time> : null}</footer></button>
            {stage === "archived" ? <span className="card-today archived">已归档</span> : stage === "inbox" ? <span className="card-today archived">灵感无需排期 · 先推进到大纲</span> : !todayEvent ? <button className="card-today" onClick={() => addToday(item.id)}>＋ 当前阶段安排今天</button> : <span className="card-today added">{todayEvent.completedAt ? "今日阶段已完成" : `今日 #${todayEvent.rank}`}</span>}
          </article>;
        })}</div>
        <button className="column-add" onClick={create}>＋ 添加内容</button>
      </section>;
    })}</div>
  </section>;
}

function GoalsView({ state, pageTitle, updateTitle, health, followers, published, updateGoal, setState }: { state: WorkspaceState; pageTitle: string; updateTitle: (value: string) => void; health: ReturnType<typeof calculateGoalHealth>; followers: number; published: ContentItem[]; updateGoal: (patch: Partial<GoalCycle>) => void; setState: React.Dispatch<React.SetStateAction<WorkspaceState>> }) {
  const [showConfig, setShowConfig] = useState(false);
  const [snapshotDate, setSnapshotDate] = useState(date);
  const [snapshotFollowers, setSnapshotFollowers] = useState("");
  const [editingSnapshotId, setEditingSnapshotId] = useState<string | null>(null);
  const [snapshotError, setSnapshotError] = useState("");
  const snapshots = [...state.followerSnapshots]
    .filter((item) => item.date >= state.goal.startDate && item.date <= state.goal.endDate)
    .sort((a, b) => a.date.localeCompare(b.date));
  const remainingDays = Math.max(0, Math.ceil((new Date(`${state.goal.endDate}T12:00:00`).getTime() - new Date(`${date}T12:00:00`).getTime()) / 86_400_000) + 1);
  const remainingLabel = remainingDays > 13 ? `${Math.ceil(remainingDays / 7)} 周` : `${remainingDays} 天`;
  const tierCounts = (["A", "B", "C"] as const).map((tier) => ({
    tier,
    count: published.filter((item) => item.tier === tier).length,
  }));
  const typeCounts = Array.from(new Set([...state.contentTypes, ...published.map((item) => item.contentType)]))
    .map((contentType) => ({ contentType, count: published.filter((item) => item.contentType === contentType).length }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count);
  const maxTypeCount = Math.max(1, ...typeCounts.map((item) => item.count));

  const resetSnapshotEditor = () => {
    setEditingSnapshotId(null);
    setSnapshotDate(date);
    setSnapshotFollowers("");
    setSnapshotError("");
  };

  const saveSnapshot = () => {
    const value = Number(snapshotFollowers);
    if (!snapshotDate || !Number.isFinite(value) || value < 0) {
      setSnapshotError("请填写有效的日期和粉丝数。");
      return;
    }
    if (snapshotDate < state.goal.startDate || snapshotDate > state.goal.endDate) {
      setSnapshotError("快照日期需要在当前阶段范围内。");
      return;
    }
    if (editingSnapshotId && state.followerSnapshots.some((item) => item.id !== editingSnapshotId && item.date === snapshotDate)) {
      setSnapshotError("该日期已经有一条快照，请修改为其他日期。");
      return;
    }
    setState((prev) => {
      if (editingSnapshotId) {
        return {
          ...prev,
          followerSnapshots: prev.followerSnapshots.map((item) => item.id === editingSnapshotId
            ? { ...item, date: snapshotDate, followers: value }
            : item),
        };
      }
      const existing = prev.followerSnapshots.find((item) => item.date === snapshotDate);
      return {
        ...prev,
        followerSnapshots: existing
          ? prev.followerSnapshots.map((item) => item.date === snapshotDate ? { ...item, followers: value } : item)
          : [...prev.followerSnapshots, { id: crypto.randomUUID(), date: snapshotDate, followers: value }],
      };
    });
    resetSnapshotEditor();
  };

  const editSnapshot = (snapshot: FollowerSnapshot) => {
    setEditingSnapshotId(snapshot.id);
    setSnapshotDate(snapshot.date);
    setSnapshotFollowers(String(snapshot.followers));
    setSnapshotError("");
  };

  const archiveAndStart = () => {
    if (!window.confirm("归档后当前阶段将只读保存，并创建一个新的阶段目标。确定继续吗？")) return;
    setState((prev) => {
      const start = new Date(`${prev.goal.endDate}T12:00:00`);
      if (Number.isNaN(start.getTime())) return prev;
      start.setDate(start.getDate() + 1);
      const end = new Date(start);
      end.setMonth(end.getMonth() + 3);
      end.setDate(end.getDate() - 1);
      const current = currentFollowers(prev.goal, prev.followerSnapshots);
      const nextGoal: GoalCycle = {
        id: crypto.randomUUID(),
        objective: "",
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
        status: "active",
        outputTarget: 0,
        quotas: prev.contentTypes.map((contentType) => ({ contentType, target: 0 })),
        followerStart: current,
        followerTarget: current,
        qualityMetric: prev.goal.qualityMetric,
        qualityThreshold: prev.goal.qualityThreshold,
        qualityTarget: 0,
      };
      return {
        ...prev,
        goalHistory: [...(prev.goalHistory ?? []), { ...prev.goal, status: "archived" }],
        goal: nextGoal,
      };
    });
    setShowConfig(false);
  };

  return <section className="page goals-page">
    <div className="page-heading stage-goal-heading">
      <div><span className="eyebrow">大目标（阶段）</span><EditablePageTitle value={pageTitle} fallback={DEFAULT_PAGE_TITLES.goals} onChange={updateTitle} /><p>{pageTitle.trim() !== state.goal.objective.trim() && state.goal.objective.trim() ? `阶段目标：${state.goal.objective} · ` : ""}{state.goal.startDate} — {state.goal.endDate} · 指标修改统一放在配置中。</p></div>
      <button className="primary-button" onClick={() => setShowConfig(true)}>配置目标指标</button>
    </div>

    <section className="panel goal-core-panel">
      <header><div><span className="eyebrow">CORE METRICS</span><h2>核心指标</h2></div><span>数据随发布记录与粉丝快照自动更新</span></header>
      <div className="goal-core-grid">
        <article><div><span>剩余时间</span><strong>{remainingLabel}</strong><small>时间已过 {percent(health.timeProgress)}</small></div><div className="goal-timeline"><ProgressBar value={health.timeProgress} tone="ink" /><footer><span>{state.goal.startDate.slice(5)}</span><span>{state.goal.endDate.slice(5)}</span></footer></div></article>
        <article><div><span>当前粉丝 / 目标粉丝</span><strong>{formatMetric(followers)}<small> / {formatMetric(state.goal.followerTarget)}</small></strong><small>还差 {formatMetric(health.followerRemaining)}</small></div><ProgressBar value={health.followerProgress} tone="olive" /></article>
        <article><div><span>已发布 / 计划发布</span><strong>{published.length}<small> / {state.goal.outputTarget}</small></strong><small>还需发布 {health.outputRemaining} 条</small></div><ProgressBar value={health.outputProgress} /></article>
      </div>
    </section>

    <section className="panel follower-analytics-panel">
      <header><div><span className="eyebrow">FOLLOWER GROWTH</span><h2>账号粉丝趋势</h2><p>通过快照记录真实增长过程；点击右侧记录可以修改原始数据。</p></div><div className="snapshot-entry-wrap">{editingSnapshotId ? <span className="snapshot-editing-label">正在修改 {snapshotDate.slice(5)}</span> : null}<div className="snapshot-entry"><label><span>日期</span><input type="date" min={state.goal.startDate} max={state.goal.endDate} value={snapshotDate} onChange={(event) => { setSnapshotDate(event.target.value); setSnapshotError(""); }} /></label><label><span>粉丝数</span><input type="number" min="0" value={snapshotFollowers} onChange={(event) => { setSnapshotFollowers(event.target.value); setSnapshotError(""); }} placeholder={String(followers)} /></label><button className="secondary-button" disabled={!snapshotFollowers} onClick={saveSnapshot}>{editingSnapshotId ? "保存修改" : "录入快照"}</button>{editingSnapshotId ? <button className="text-button snapshot-cancel-button" onClick={resetSnapshotEditor}>取消</button> : null}</div>{snapshotError ? <p className="snapshot-error">{snapshotError}</p> : null}</div></header>
      <div className="follower-analytics-body">
        <FollowerTrendChart snapshots={snapshots} startDate={state.goal.startDate} endDate={state.goal.endDate} startFollowers={state.goal.followerStart} targetFollowers={state.goal.followerTarget} />
        <aside><span>快照记录（折线图原始数据）</span><strong>{snapshots.length}</strong><small>次更新</small><div>{[...snapshots].reverse().map((item) => <button key={item.id} className={editingSnapshotId === item.id ? "snapshot-record active" : "snapshot-record"} onClick={() => editSnapshot(item)} aria-label={`修改 ${item.date} 的粉丝快照`}><span>{item.date.slice(5)}</span><strong>{formatMetric(item.followers)}</strong><em>编辑</em></button>)}</div></aside>
      </div>
    </section>

    <section className="panel content-analytics-panel">
      <header><div><span className="eyebrow">PUBLISHED CONTENT</span><h2>内容指标</h2><p>只统计当前阶段时间范围内已经发布的内容。</p></div><strong>{published.length}<small> 条已发布</small></strong></header>
      <div className="content-analytics-grid">
        <div><h3>按内容档位</h3><div className="goal-tier-grid">{tierCounts.map(({ tier, count }) => <article key={tier} className={`tier-${tier.toLowerCase()}`}><span>{tier}档</span><strong>{count}</strong><small>{published.length ? percent(count / published.length) : "0%"}</small></article>)}</div></div>
        <div><h3>按内容类型</h3>{typeCounts.length ? <div className="goal-type-list">{typeCounts.map((item) => <div key={item.contentType}><span>{item.contentType}</span><div><i style={{ width: percent(item.count / maxTypeCount) }} /></div><strong>{item.count}</strong></div>)}</div> : <p className="goal-empty-copy">发布内容后，这里会自动生成类型分布。</p>}</div>
      </div>
    </section>

    {showConfig ? <GoalSettingsModal goal={state.goal} goalHistory={state.goalHistory} contentTypes={state.contentTypes} close={() => setShowConfig(false)} save={(goal) => { updateGoal(goal); setShowConfig(false); }} archive={archiveAndStart} /> : null}
  </section>;
}

function FollowerTrendChart({ snapshots, startDate, endDate, startFollowers, targetFollowers }: { snapshots: FollowerSnapshot[]; startDate: string; endDate: string; startFollowers: number; targetFollowers: number }) {
  const startTime = new Date(`${startDate}T12:00:00`).getTime();
  const endTime = new Date(`${endDate}T12:00:00`).getTime();
  const totalTime = Math.max(1, endTime - startTime);
  const data = snapshots.some((item) => item.date === startDate)
    ? snapshots
    : [{ id: "goal-start", date: startDate, followers: startFollowers }, ...snapshots];
  const values = [...data.map((item) => item.followers), targetFollowers];
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values, minValue + 1);
  const padding = Math.max(1, (maxValue - minValue) * .08);
  const chartMin = Math.max(0, minValue - padding);
  const chartMax = maxValue + padding;
  const xFor = (value: string) => 4 + Math.max(0, Math.min(1, (new Date(`${value}T12:00:00`).getTime() - startTime) / totalTime)) * 92;
  const yFor = (value: number) => 92 - ((value - chartMin) / Math.max(1, chartMax - chartMin)) * 82;
  const points = data.map((item) => `${xFor(item.date)},${yFor(item.followers)}`).join(" ");
  const targetY = yFor(targetFollowers);

  return <div className="follower-chart">
    <div className="follower-chart-head"><span>粉丝数</span><div><i />实际增长 <em />目标</div></div>
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={`粉丝从 ${formatMetric(startFollowers)} 增长到 ${formatMetric(data.at(-1)?.followers ?? startFollowers)}，目标 ${formatMetric(targetFollowers)}`}>
      <title>粉丝增长折线图</title>
      {[20, 44, 68, 92].map((y) => <line key={y} x1="4" x2="96" y1={y} y2={y} className="chart-grid-line" vectorEffect="non-scaling-stroke" />)}
      <line x1="4" x2="96" y1={targetY} y2={targetY} className="chart-target-line" vectorEffect="non-scaling-stroke" />
      <polyline points={points} className="chart-growth-line" vectorEffect="non-scaling-stroke" />
      {data.map((item) => <circle key={item.id} cx={xFor(item.date)} cy={yFor(item.followers)} r="1.15" vectorEffect="non-scaling-stroke"><title>{item.date} · {formatMetric(item.followers)} 粉丝</title></circle>)}
    </svg>
    <footer><span>{startDate.slice(5)}</span><strong>当前 {formatMetric(data.at(-1)?.followers ?? startFollowers)}</strong><span>{endDate.slice(5)}</span></footer>
  </div>;
}

function GoalSettingsModal({ goal, goalHistory, contentTypes, close, save, archive }: { goal: GoalCycle; goalHistory: GoalCycle[]; contentTypes: string[]; close: () => void; save: (goal: GoalCycle) => void; archive: () => void }) {
  const [draft, setDraft] = useState<GoalCycle>(() => ({
    ...goal,
    quotas: [
      ...contentTypes.map((contentType) => goal.quotas.find((item) => item.contentType === contentType) ?? { contentType, target: 0 }),
      ...goal.quotas.filter((item) => item.contentType === "其他"),
    ],
  }));
  const assignedTotal = draft.quotas.filter((item) => item.contentType !== "其他").reduce((sum, item) => sum + Math.max(0, item.target || 0), 0);
  const unallocated = Math.max(0, draft.outputTarget - assignedTotal);
  const invalid = assignedTotal > draft.outputTarget || !draft.startDate || !draft.endDate || draft.endDate < draft.startDate;
  const updateQuota = (contentType: string, target: number) => setDraft((prev) => ({
    ...prev,
    quotas: prev.quotas.map((item) => item.contentType === contentType ? { ...item, target } : item),
  }));

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) close(); }}>
    <section className="goal-config-modal" role="dialog" aria-modal="true" aria-labelledby="goal-config-title">
      <header><div><span className="eyebrow">GOAL SETTINGS</span><h2 id="goal-config-title">配置大目标（阶段）</h2><p>保存后，外部总览与发布统计会自动重新计算。</p></div><button className="close-button" onClick={close} aria-label="关闭目标配置">×</button></header>
      <div className="goal-config-body">
        <section><h3>阶段方向与时间</h3><label className="field full"><span>阶段大目标</span><textarea value={draft.objective} onChange={(event) => setDraft((prev) => ({ ...prev, objective: event.target.value }))} placeholder="这一阶段，希望账号进入什么状态？" /></label><div className="form-grid"><label className="field"><span>开始日期</span><input type="date" value={draft.startDate} onChange={(event) => setDraft((prev) => ({ ...prev, startDate: event.target.value }))} /></label><label className="field"><span>结束日期</span><input type="date" value={draft.endDate} onChange={(event) => setDraft((prev) => ({ ...prev, endDate: event.target.value }))} /></label></div></section>
        <section><h3>发布目标</h3><label className="field goal-config-total"><span>计划发布总数</span><input type="number" min="0" value={draft.outputTarget} onChange={(event) => setDraft((prev) => ({ ...prev, outputTarget: Number(event.target.value) }))} /></label><div className="goal-config-quota">{draft.quotas.filter((item) => item.contentType !== "其他").map((quota) => <label key={quota.contentType}><span>{quota.contentType}</span><input type="number" min="0" value={quota.target} onChange={(event) => updateQuota(quota.contentType, Number(event.target.value))} /></label>)}</div><p className={assignedTotal > draft.outputTarget ? "validation-note" : "goal-config-hint"}>{assignedTotal > draft.outputTarget ? `类型配额已超过总目标 ${assignedTotal - draft.outputTarget} 条。` : `尚未分配的 ${unallocated} 条会自动归入“其他”。`}</p></section>
        <section><h3>账号粉丝目标</h3><div className="form-grid"><label className="field"><span>阶段开始粉丝</span><input type="number" min="0" value={draft.followerStart} onChange={(event) => setDraft((prev) => ({ ...prev, followerStart: Number(event.target.value) }))} /></label><label className="field"><span>阶段目标粉丝</span><input type="number" min="0" value={draft.followerTarget} onChange={(event) => setDraft((prev) => ({ ...prev, followerTarget: Number(event.target.value) }))} /></label></div></section>
        <details className="goal-quality-settings"><summary>质量门槛（可选）</summary><div className="quality-form"><label><span>主要指标</span><select value={draft.qualityMetric} onChange={(event) => setDraft((prev) => ({ ...prev, qualityMetric: event.target.value as QualityMetric }))}>{Object.entries(QUALITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label><span>单条门槛{["likeRate", "saveRate", "commentRate"].includes(draft.qualityMetric) ? "（%）" : ""}</span><input type="number" min="0" step="0.1" value={draft.qualityThreshold} onChange={(event) => setDraft((prev) => ({ ...prev, qualityThreshold: Number(event.target.value) }))} /></label><label><span>阶段达标条数</span><input type="number" min="0" value={draft.qualityTarget} onChange={(event) => setDraft((prev) => ({ ...prev, qualityTarget: Number(event.target.value) }))} /></label></div></details>
        {goalHistory.length ? <details className="goal-history-settings"><summary>历史阶段（{goalHistory.length}）</summary>{[...goalHistory].reverse().map((item) => <article key={item.id}><div><strong>{item.objective || "未命名阶段目标"}</strong><small>{item.startDate} — {item.endDate}</small></div><span>{item.outputTarget} 条发布目标</span><span>{formatMetric(item.followerTarget)} 粉丝目标</span></article>)}</details> : null}
      </div>
      <footer><button className="text-button" onClick={archive}>归档并开始下一阶段</button><div><button className="secondary-button" onClick={close}>取消</button><button className="primary-button" disabled={invalid} onClick={() => save(draft)}>保存配置</button></div></footer>
    </section>
  </div>;
}

function StarRating({ value, onChange, compact = false }: { value: number; onChange?: (value: number) => void; compact?: boolean }) {
  const rating = Math.max(0, Math.min(5, Math.round(value || 0)));
  const labels = ["未评价", "不理想", "偏弱", "一般", "不错", "代表作"];
  return <div className={compact ? "star-rating compact" : "star-rating"} role={onChange ? "radiogroup" : "img"} aria-label={rating ? `${rating} 星，${labels[rating]}` : "尚未评价"}>
    <div>{[1, 2, 3, 4, 5].map((star) => onChange
      ? <button type="button" key={star} className={star <= rating ? "active" : ""} onClick={() => onChange(star)} role="radio" aria-checked={rating === star} aria-label={`${star} 星`}>★</button>
      : <span key={star} className={star <= rating ? "active" : ""} aria-hidden="true">★</span>)}</div>
    {!compact ? <span>{rating ? `${rating} 星 · ${labels[rating]}` : "点击星星完成定型评价"}</span> : null}
  </div>;
}

function ReviewContentList({ items, reviewed, open }: { items: ContentItem[]; reviewed: boolean; open: (id: string) => void }) {
  if (!items.length) return <Empty title={reviewed ? "还没有已复盘内容" : "目前没有待复盘内容"} body={reviewed ? "完成第一篇内容复盘后，会沉淀到这里。" : "内容发布后，会自动进入待复盘区域。"} />;
  return <div className="review-ledger-list">{items.map((item) => {
    const reviewDue = item.publishedAt ? shiftDate(item.publishedAt, 3) : "";
    const overdue = !reviewed && Boolean(reviewDue && reviewDue <= date);
    return <button key={item.id} className="review-ledger-row" onClick={() => open(item.id)}><div className="review-ledger-content"><div><strong>{item.title}</strong><span className={`review-status-pill ${reviewed ? "completed" : overdue ? "overdue" : "pending"}`}>{reviewed ? "已复盘" : overdue ? "已到 T+3" : "待复盘"}</span></div><small>{item.contentType} · {item.tier}档 · 发布于 {item.publishedAt}</small></div><div className="review-ledger-metrics"><span><strong>{formatMetric(item.metrics.views)}</strong>播放</span><span><strong>{formatMetric(item.metrics.likes)}</strong>点赞</span><span><strong>{formatMetric(item.metrics.saves)}</strong>收藏</span><span><strong>+{formatMetric(item.metrics.followerGain)}</strong>涨粉</span><small>{item.metrics.capturedAt ? `${item.metrics.capturedAt.slice(5)} 快照` : "待录入数据快照"}</small></div><div className="review-ledger-judgment"><StarRating value={item.review.rating} compact /><p>{item.review.analysis || (reviewed ? "已保存复盘，暂未填写分析" : "点击进入，完成星级评价和复盘分析")}</p>{reviewed && item.review.completedAt ? <small>保存于 {item.review.completedAt.slice(0, 10)}</small> : null}</div><span className="review-ledger-arrow">→</span></button>;
  })}</div>;
}

function ReviewView({ state, pageTitle, updateTitle, open, setState }: { state: WorkspaceState; pageTitle: string; updateTitle: (value: string) => void; open: (id: string) => void; setState: React.Dispatch<React.SetStateAction<WorkspaceState>> }) {
  const published = state.contents.filter((item) => item.publicationStatus === "published").sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const pending = published.filter((item) => !item.review.completedAt);
  const reviewed = published.filter((item) => Boolean(item.review.completedAt)).sort((a, b) => b.review.completedAt.localeCompare(a.review.completedAt));
  const overdue = pending.filter((item) => item.publishedAt && shiftDate(item.publishedAt, 3) <= date).length;
  const completionRate = published.length ? reviewed.length / published.length : 0;
  const ratedReviewed = reviewed.filter((item) => item.review.rating > 0);
  const averageRating = ratedReviewed.length ? ratedReviewed.reduce((sum, item) => sum + item.review.rating, 0) / ratedReviewed.length : 0;
  return <section className="page review-page"><div className="page-heading"><span className="eyebrow">REVIEW LAB</span><EditablePageTitle value={pageTitle} fallback={DEFAULT_PAGE_TITLES.review} onChange={updateTitle} /><p>发布后自动进入待复盘；只有点击“保存复盘”，才会计入已复盘。</p></div>
    <div className="review-kpi-grid"><article className="panel"><span>发布样本</span><strong>{published.length}</strong><small>全部已发布内容</small></article><article className="panel pending"><span>待复盘</span><strong>{pending.length}</strong><small>{overdue ? `其中 ${overdue} 条已到 T+3` : "当前没有逾期复盘"}</small></article><article className="panel"><span>已复盘</span><strong>{reviewed.length}</strong><small>完成定型的内容</small></article><article className="panel"><span>复盘完成率</span><strong>{percent(completionRate)}</strong><small>{reviewed.length} / {published.length || 0} 条</small></article><article className="panel rating"><span>平均星级</span><strong>{averageRating ? averageRating.toFixed(1) : "—"}<em>/ 5</em></strong><small>统计有星级的已复盘内容</small></article></div>
    <div className="review-section-grid"><div className="panel review-ledger-panel pending-reviews"><div className="panel-heading"><div><span className="eyebrow">TO REVIEW</span><h2>待复盘</h2><p>发布即进入这里，优先处理已经到 T+3 的内容。</p></div><span className="count-label">{pending.length} 条</span></div><ReviewContentList items={pending} reviewed={false} open={open} /></div><div className="panel review-ledger-panel completed-reviews"><div className="panel-heading"><div><span className="eyebrow">REVIEWED</span><h2>已复盘</h2><p>已经完成定型评价与分析，可随时打开更新。</p></div><span className="count-label">{reviewed.length} 条</span></div><ReviewContentList items={reviewed} reviewed open={open} /></div></div>
    <div className="panel rules-panel"><div className="panel-heading"><div><span className="eyebrow">PLAYBOOK</span><h2>已沉淀的内容规则</h2></div><span>{state.insightRules.filter((item) => item.active).length} 条启用</span></div><div className="rule-grid">{state.insightRules.map((rule) => <article key={rule.id} className={rule.active ? "rule-card" : "rule-card inactive"}><span>判断 #{rule.id.slice(-2)}</span><p>{rule.text}</p><button onClick={() => setState((prev) => ({ ...prev, insightRules: prev.insightRules.map((item) => item.id === rule.id ? { ...item, active: !item.active } : item) }))}>{rule.active ? "停用" : "重新启用"}</button></article>)}</div></div>
  </section>;
}

function SettingsView({ state, pageTitle, updateTitle, setState, exportData, fileInput, importData, importMode, setImportMode, onReset }: { state: WorkspaceState; pageTitle: string; updateTitle: (value: string) => void; setState: React.Dispatch<React.SetStateAction<WorkspaceState>>; exportData: () => void; fileInput: React.RefObject<HTMLInputElement | null>; importData: (event: ChangeEvent<HTMLInputElement>) => void; importMode: "merge" | "replace"; setImportMode: (mode: "merge" | "replace") => void; onReset: () => void }) {
  const [newType, setNewType] = useState("");
  const updateProfile = (patch: Partial<CreatorProfile>) => setState((prev) => ({
    ...prev,
    profile: { ...prev.profile, ...patch },
  }));
  const updateCreatorName = (value: string) => setState((prev) => {
    const previousDefault = `${prev.profile.creatorName.trim() || "我的"}的自媒体 Dashboard`;
    const shouldFollowName = !prev.profile.dashboardTitle.trim() || prev.profile.dashboardTitle === previousDefault;
    return {
      ...prev,
      profile: {
        ...prev.profile,
        creatorName: value,
        dashboardTitle: shouldFollowName ? `${value.trim() || "我的"}的自媒体 Dashboard` : prev.profile.dashboardTitle,
      },
    };
  });

  return <section className="page settings-page">
    <div className="page-heading"><span className="eyebrow">SETTINGS</span><EditablePageTitle value={pageTitle} fallback={DEFAULT_PAGE_TITLES.settings} onChange={updateTitle} /><p>先把工作台变成你的，再放心把内容数据留在当前设备。</p></div>
    <div className="settings-grid">
      <div className="panel settings-card wide profile-settings-card">
        <div className="settings-icon">{creatorMark(state.profile)}</div>
        <div>
          <h2>创作者档案</h2>
          <p>这些信息只用于个性化工作台，不会公开上传。看板名称会同步到侧边栏和浏览器标签。</p>
          <div className="profile-settings-grid">
            <label className="field"><span>用户姓名 / 昵称</span><input value={state.profile.creatorName} onChange={(event) => updateCreatorName(event.target.value)} placeholder="例如 Avery" /></label>
            <label className="field"><span>看板名称</span><input value={state.profile.dashboardTitle} onChange={(event) => updateProfile({ dashboardTitle: event.target.value })} placeholder={`${state.profile.creatorName || "我的"}的自媒体 Dashboard`} /></label>
            <label className="field"><span>主要平台</span><input list="settings-platform-options" value={state.profile.primaryPlatform} onChange={(event) => updateProfile({ primaryPlatform: event.target.value })} placeholder="例如 小红书" /><datalist id="settings-platform-options"><option value="小红书" /><option value="抖音" /><option value="B站" /><option value="视频号" /><option value="多平台" /></datalist></label>
            <label className="field"><span>内容方向</span><input value={state.profile.contentFocus} onChange={(event) => updateProfile({ contentFocus: event.target.value })} placeholder="例如 AI 产品与工作流" /></label>
          </div>
          <div className="profile-preview"><span className="brand-mark">{creatorMark(state.profile)}</span><div><small>看板标题预览</small><strong>{dashboardTitle(state.profile)}</strong><em>{state.profile.primaryPlatform || "未设置平台"}{state.profile.contentFocus ? ` · ${state.profile.contentFocus}` : ""}</em></div></div>
        </div>
      </div>

      <div className="panel settings-card"><div className="settings-icon">⇩</div><div><h2>数据备份</h2><p>导出包含个人设置、内容、脚本、档期、目标、指标和规则的完整 JSON 文件。</p><button className="primary-button" onClick={exportData}>导出完整备份</button>{state.lastBackupAt ? <small>上次备份：{state.lastBackupAt.slice(0, 10)}</small> : <small>还没有导出过备份</small>}</div></div>
      <div className="panel settings-card"><div className="settings-icon">⇧</div><div><h2>导入与恢复</h2><p>合并会保留当前个人设置，并按 ID 更新记录；覆盖会恢复备份中的全部设置和数据。</p><div className="segmented"><button className={importMode === "merge" ? "active" : ""} onClick={() => setImportMode("merge")}>合并导入</button><button className={importMode === "replace" ? "active" : ""} onClick={() => setImportMode("replace")}>覆盖恢复</button></div><button className="secondary-button" onClick={() => fileInput.current?.click()}>选择备份文件</button><input ref={fileInput} type="file" accept="application/json" hidden onChange={importData} /></div></div>

      <div className="panel settings-card wide"><div className="settings-icon">#</div><div><h2>内容类型</h2><p>每条内容只能有一个主要类型。类型会用于阶段目标配额和复盘对比。</p><div className="type-chips">{state.contentTypes.map((type) => <span key={type}>{type}<button aria-label={`删除${type}`} onClick={() => setState((prev) => { const quotas = normalizeGoalQuotas(prev.goal.outputTarget, prev.goal.quotas.filter((item) => item.contentType !== type)); return { ...prev, contentTypes: prev.contentTypes.filter((item) => item !== type), goal: { ...prev.goal, quotas } }; })}>×</button></span>)}</div><div className="add-type"><input value={newType} onChange={(e) => setNewType(e.target.value)} placeholder="添加新的内容类型" /><button onClick={() => { const value = newType.trim(); if (!value || value === "其他" || state.contentTypes.includes(value)) return; setState((prev) => { const quotas = normalizeGoalQuotas(prev.goal.outputTarget, [...prev.goal.quotas, { contentType: value, target: 0 }]); return { ...prev, contentTypes: [...prev.contentTypes, value], goal: { ...prev.goal, quotas } }; }); setNewType(""); }}>添加</button></div></div></div>
      <div className="panel settings-card danger-card"><div className="settings-icon">!</div><div><h2>清空工作台</h2><p>删除当前浏览器中的全部内容与目标数据，保留创作者档案。操作前请先导出备份。</p><button className="danger-button" onClick={onReset}>清空内容与目标</button></div></div>
      <div className="panel settings-card"><div className="settings-icon">✦</div><div><h2>AI 辅助</h2><p>未配置密钥时自动生成提示词；配置后可在看板内直接得到结构化建议。</p><small>服务端变量：OPENAI_API_KEY<br />默认模型：gpt-5.6-luna</small></div></div>
    </div>
  </section>;
}

function StageScheduleField({ item, stage, stageEvents, schedule, unschedule, label = "计划完成时间" }: {
  item: ContentItem;
  stage: WorkStage;
  stageEvents: StageEvent[];
  schedule: (stage: WorkStage, plannedDate: string) => void;
  unschedule: (stage: WorkStage) => void;
  label?: string;
}) {
  const event = stageEvents.find((entry) => entry.contentId === item.id && entry.stage === stage && !entry.completedAt);
  const historical = item.stage === "archived" || stageIndex(item.stage) > stageIndex(stage);
  return <div className={`stage-schedule-field ${historical ? "historical" : ""}`}>
    <div><span>{label}</span><small>{historical ? "该阶段已经完成" : "修改后会同步到档期日历"}</small></div>
    <input type="date" value={event?.plannedDate ?? ""} disabled={historical} onChange={(changeEvent) => changeEvent.target.value ? schedule(stage, changeEvent.target.value) : unschedule(stage)} aria-label={`${STAGE_LABELS[stage]}${label}`} />
    {event && !historical ? <button type="button" onClick={() => unschedule(stage)}>取消排期</button> : null}
  </div>;
}

function StageStatusPanel({ item, stageColors, setStageStatus }: {
  item: ContentItem;
  stageColors: WorkspaceState["stageColors"];
  setStageStatus: (stage: WorkStage, completed: boolean) => void;
}) {
  return <section className="stage-status-panel">
    <header><div><strong>阶段完成状态</strong><small>完成后续阶段会自动补齐前置；撤销后，该阶段及后续恢复待完成。</small></div></header>
    <div className="stage-status-track">{WORK_STAGES.map((stage) => {
      const completed = item.stage === "archived" || stageIndex(item.stage) > stageIndex(stage);
      const current = item.stage === stage;
      return <button
        key={stage}
        type="button"
        className={`${completed ? "completed" : "pending"} ${current ? "current" : ""}`}
        style={{ "--stage-color": stageColors[stage] } as React.CSSProperties}
        onClick={() => setStageStatus(stage, !completed)}
        aria-pressed={completed}
        title={completed ? `点击将${STAGE_LABELS[stage]}及后续恢复为待完成` : `标记${STAGE_LABELS[stage]}完成`}
      ><span>{completed ? "✓" : ""}</span><strong>{STAGE_LABELS[stage]}</strong><em>{completed ? "已完成" : current ? "当前 · 待完成" : "待完成"}</em></button>;
    })}</div>
  </section>;
}

function ContentDrawer({ item, initialTab, stageEvents, stageColors, contentTypes, close, update, changeStage, setStageStatus, schedule, unschedule, remove, markPublished, unmarkPublished, saveReview, analyze, aiLoading, ruleDeposited, addRule }: { item: ContentItem; initialTab: ContentDrawerTab; stageEvents: StageEvent[]; stageColors: WorkspaceState["stageColors"]; contentTypes: string[]; close: () => void; update: (patch: Partial<ContentItem>) => void; changeStage: (stage: ContentStage) => void; setStageStatus: (stage: WorkStage, completed: boolean) => void; schedule: (stage: WorkStage, plannedDate: string) => void; unschedule: (stage: WorkStage) => void; remove: () => void; markPublished: () => void; unmarkPublished: () => void; saveReview: () => void; analyze: (kind: "topic" | "script", payload: unknown, title: string) => void; aiLoading: boolean; ruleDeposited: boolean; addRule: (text: string) => void }) {
  const [tab, setTab] = useState<ContentDrawerTab>(initialTab);
  const score = Object.values(item.topic.score).reduce((sum, value) => sum + value, 0);
  const updateTopic = (patch: Partial<ContentItem["topic"]>) => update({ topic: { ...item.topic, ...patch } });
  const updateScript = (patch: Partial<ContentItem["script"]>) => update({ script: { ...item.script, ...patch } });
  const updateMetrics = (key: keyof ContentItem["metrics"], value: number | string) => update({ metrics: { ...item.metrics, capturedAt: item.metrics.capturedAt || todayISO(), [key]: value } });
  const reviewPublished = item.publicationStatus === "published";
  const reviewStatus = !reviewPublished ? "unavailable" : item.review.completedAt ? "completed" : "pending";
  return <div className="drawer-backdrop" onMouseDown={(e) => { if (e.currentTarget === e.target) close(); }}><aside className="drawer" aria-label="内容详情"><header className="drawer-header"><div><div className="drawer-badges"><Badge tone={item.stage} color={stageColors[item.stage]}>{STAGE_LABELS[item.stage]}</Badge><Badge tone={`tier-${item.tier.toLowerCase()}`}>{item.tier}档</Badge></div><input className="drawer-title" value={item.title} onChange={(e) => update({ title: e.target.value })} /></div><button className="close-button" onClick={close} aria-label="关闭">×</button></header><div className="drawer-tabs">{(["overview", "topic", "script", "recording", "editing", "publish", "review"] as const).map((value) => <button key={value} className={tab === value ? "active" : ""} onClick={() => setTab(value)}>{({ overview: "概览", topic: "大纲", script: "脚本", recording: "录制", editing: "剪辑", publish: "发布", review: "复盘" })[value]}</button>)}</div><div className="drawer-body">
    {tab === "overview" ? <div className="drawer-section"><StageStatusPanel item={item} stageColors={stageColors} setStageStatus={setStageStatus} /><div className="form-grid"><label className="field"><span>全局当前阶段</span><select value={item.stage} onChange={(e) => changeStage(e.target.value as ContentStage)}>{Object.entries(STAGE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><small>修改后会同步到内容管线和 Todo。</small></label><label className="field"><span>内容档位</span><select value={item.tier} onChange={(e) => update({ tier: e.target.value as ContentItem["tier"] })}><option value="C">C档快发</option><option value="B">B档常规</option><option value="A">A档精品</option></select></label><label className="field"><span>主要类型</span><select value={item.contentType} onChange={(e) => update({ contentType: e.target.value })}>{contentTypes.map((type) => <option key={type}>{type}</option>)}</select></label><label className="field"><span>优先级</span><select value={item.priority} onChange={(e) => update({ priority: e.target.value as ContentItem["priority"] })}><option value="high">高</option><option value="normal">普通</option><option value="low">低</option></select></label></div>{SCHEDULABLE_STAGES.includes(item.stage as WorkStage) ? <StageScheduleField item={item} stage={item.stage as WorkStage} stageEvents={stageEvents} schedule={schedule} unschedule={unschedule} label="当前阶段计划完成" /> : item.stage === "inbox" ? <p className="stage-no-schedule-note">灵感只用于收集，不需要设置完成日期；进入大纲后再开始排期。</p> : item.stage === "review" ? <p className="stage-no-schedule-note">单篇内容不再安排复盘日期；可以在档期规划中放置统一的“复盘日”。</p> : null}<label className="field full"><span>原始 idea</span><textarea value={item.idea} onChange={(e) => update({ idea: e.target.value })} /></label><label className="field full"><span>标签（用顿号分隔）</span><input value={item.tags.join("、")} onChange={(e) => update({ tags: e.target.value.split(/[、,，]/).map((tag) => tag.trim()).filter(Boolean) })} /></label><div className="next-action-card"><span>下一步动作</span><strong>{NEXT_ACTIONS[item.stage]}</strong><p>上次更新：{item.updatedAt}</p></div></div> : null}
    {tab === "topic" ? <div className="drawer-section"><div className="section-title-row"><div><span className="eyebrow">TOPIC GATE</span><h3>大纲卡</h3></div><button className="ai-button small" disabled={aiLoading} onClick={() => analyze("topic", item.topic, "选题体检")}><Icon name="spark" />AI 体检</button></div><StageScheduleField item={item} stage="topic" stageEvents={stageEvents} schedule={schedule} unschedule={unschedule} />{[["目标受众", "audience"], ["具体痛点", "painPoint"], ["一句话观点", "pointOfView"], ["大家通常怎么讲", "commonAngle"], ["我的反差角度", "contrastAngle"], ["可展示素材", "assets"], ["最低成本拍法", "minimumProduction"]].map(([label, key]) => <label key={key} className="field full"><span>{label}</span><textarea value={String(item.topic[key as keyof typeof item.topic] ?? "")} onChange={(e) => updateTopic({ [key]: e.target.value })} /></label>)}<div className="score-card"><div><span>六维总分</span><strong>{score}<small> / 30</small></strong></div><div className="score-grid">{Object.entries({ audience: "受众", pain: "痛点", scene: "场景", demonstrable: "可展示", distribution: "传播", efficiency: "性价比" }).map(([key, label]) => <label key={key}><span>{label}</span><input type="range" min="0" max="5" value={item.topic.score[key as keyof typeof item.topic.score]} onChange={(e) => updateTopic({ score: { ...item.topic.score, [key]: Number(e.target.value) } })} /><strong>{item.topic.score[key as keyof typeof item.topic.score]}</strong></label>)}</div></div></div> : null}
    {tab === "script" ? <div className="drawer-section"><div className="section-title-row"><div><span className="eyebrow">SCRIPT</span><h3>先搭结构，再改措辞</h3></div><button className="ai-button small" disabled={aiLoading} onClick={() => analyze("script", item.script, "脚本质检")}><Icon name="spark" />AI 质检</button></div><StageScheduleField item={item} stage="script" stageEvents={stageEvents} schedule={schedule} unschedule={unschedule} />{[["标题方向", "headline"], ["开头 3 秒", "hook"], ["一句话结论", "conclusion"], ["内容结构", "body"], ["案例 / 演示", "example"], ["结尾行动 / 观点", "ending"]].map(([label, key]) => <label key={key} className="field full"><span>{label}</span><textarea className={key === "body" ? "large" : ""} value={item.script[key as keyof typeof item.script]} onChange={(e) => updateScript({ [key]: e.target.value })} /></label>)}</div> : null}
    {tab === "recording" ? <div className="drawer-section"><div className="stage-detail-strip"><span>录制阶段</span><Badge tone="recording" color={stageColors.recording}>录制</Badge><small>完成后进入剪辑</small></div><StageScheduleField item={item} stage="recording" stageEvents={stageEvents} schedule={schedule} unschedule={unschedule} /><label className="field full"><span>录制备注</span><textarea className="large" value={item.recordingNotes} onChange={(e) => update({ recordingNotes: e.target.value })} placeholder="记录机位、口播、录屏、演示路径和补拍素材…" /></label><div className="checklist"><strong>录制完成清单</strong>{["机位与画面可用", "收音清晰", "口播或演示路径完整", "必要素材与补拍镜头齐全"].map((text) => <label key={text}><input type="checkbox" />{text}</label>)}</div></div> : null}
    {tab === "editing" ? <div className="drawer-section"><div className="stage-detail-strip"><span>剪辑阶段</span><Badge tone="editing" color={stageColors.editing}>剪辑</Badge><small>完成后进入发布</small></div><StageScheduleField item={item} stage="editing" stageEvents={stageEvents} schedule={schedule} unschedule={unschedule} /><label className="field full"><span>剪辑备注</span><textarea className="large" value={item.editingNotes} onChange={(e) => update({ editingNotes: e.target.value })} placeholder="记录结构删改、字幕、包装、素材替换和导出要求…" /></label><div className="checklist"><strong>剪辑完成清单</strong>{["开头 5 秒直接进入场景", "案例或演示重点清楚", "字幕清楚可读", "封面与标题已确认", `${item.tier}档制作投入已控制`].map((text) => <label key={text}><input type="checkbox" />{text}</label>)}</div></div> : null}
    {tab === "publish" ? <div className="drawer-section"><StageScheduleField item={item} stage="publishing" stageEvents={stageEvents} schedule={schedule} unschedule={unschedule} label="计划发布日期" /><div className="form-grid"><label className="field"><span>发布状态</span><select value={item.publicationStatus} disabled><option value="draft">未排期</option><option value="scheduled">已排期</option><option value="published">已发布</option></select><small>由发布档期和实际发布记录自动更新。</small></label><label className="field"><span>实际发布时间</span><input type="date" value={item.publishedAt} onChange={(e) => update({ publishedAt: e.target.value })} /></label></div><label className="field full"><span>封面文案</span><input value={item.coverCopy} onChange={(e) => update({ coverCopy: e.target.value })} /></label><label className="field full"><span>发布正文</span><textarea className="large" value={item.publishCopy} onChange={(e) => update({ publishCopy: e.target.value })} /></label><label className="field full"><span>小红书链接</span><input value={item.xhsLink} onChange={(e) => update({ xhsLink: e.target.value })} placeholder="https://www.xiaohongshu.com/..." /></label>{item.publicationStatus !== "published" ? <><button className="primary-button full-button" disabled={!item.publishedAt} onClick={markPublished}>标记为已发布</button>{!item.publishedAt ? <p className="validation-note">先填写实际发布时间，系统才会计入阶段目标。</p> : null}</> : <div className="published-banner"><span>已发布于 {item.publishedAt} · 已进入待复盘列表</span><button onClick={unmarkPublished}>撤销发布记录</button></div>}</div> : null}
    {tab === "review" ? <div className="drawer-section review-drawer-section"><div className="section-title-row"><div><span className="eyebrow">T+3 REVIEW</span><h3>给这篇内容定型</h3></div><span className={`review-state-badge ${reviewStatus}`}>{reviewStatus === "completed" ? "已复盘" : reviewStatus === "pending" ? "待复盘" : "尚未发布"}</span></div><p className="stage-no-schedule-note">单篇内容不设置复盘档期；请在统一的“复盘日”集中处理待复盘内容。</p><section className="review-block"><header><span>01</span><div><strong>数据快照</strong><small>记录发布后的真实表现</small></div></header><div className="metrics-grid">{[["播放", "views"], ["点赞", "likes"], ["收藏", "saves"], ["评论", "comments"], ["涨粉", "followerGain"]].map(([label, key]) => <label key={key}><span>{label}</span><input type="number" min="0" value={item.metrics[key as keyof typeof item.metrics] as number} onChange={(e) => updateMetrics(key as keyof ContentItem["metrics"], Number(e.target.value))} /></label>)}</div><label className="field full"><span>数据快照日期</span><input type="date" value={item.metrics.capturedAt} onChange={(e) => updateMetrics("capturedAt", e.target.value)} /><small>建议在发布后第 3 天录入，便于横向比较内容表现。</small></label></section><section className="review-block review-rating-block"><header><span>02</span><div><strong>定型评价</strong><small>这篇内容最终值几颗星？</small></div></header><StarRating value={item.review.rating} onChange={(rating) => update({ review: { ...item.review, rating } })} /></section><section className="review-block"><header><span>03</span><div><strong>复盘分析</strong><small>写下为什么，以及下一条要怎么做</small></div></header><label className="field full"><textarea className="review-analysis-input" value={item.review.analysis} onChange={(e) => update({ review: { ...item.review, analysis: e.target.value } })} placeholder="例如：具体场景带来了高收藏，但开头进入主题太慢；下一条先展示结果，再解释过程。" /></label></section><section className="review-block review-rule-compose"><header><span>04</span><div><strong>这次学到的规则</strong><small>提炼成以后可以重复使用的一句话</small></div></header><label className="field full"><textarea value={item.review.learnedRule} onChange={(e) => update({ review: { ...item.review, learnedRule: e.target.value } })} placeholder="例如：讲工作流时，先展示最终工作台，再解释每一步。" /></label><button className="secondary-button full-button" disabled={!item.review.learnedRule.trim() || ruleDeposited} onClick={() => addRule(item.review.learnedRule)}>{ruleDeposited ? "已沉淀为内容规则" : "沉淀为内容规则"}</button></section><div className={`review-save-bar ${item.review.completedAt ? "completed" : ""}`}><div><strong>{!reviewPublished ? "发布后才能保存复盘" : item.review.completedAt ? "这篇内容已完成复盘" : "完成后再保存复盘"}</strong><small>{!reviewPublished ? "发布后会自动进入待复盘列表。" : item.review.completedAt ? `上次保存：${item.review.completedAt.slice(0, 10)}，仍可修改后更新。` : "至少需要完成星级评价和复盘分析。"}</small></div><button className="primary-button" disabled={!reviewPublished || !item.review.rating || !item.review.analysis.trim()} onClick={saveReview}>{item.review.completedAt ? "更新复盘" : "保存复盘"}</button></div></div> : null}
    <div className="drawer-footer-action"><small>永久操作，删除后无法恢复</small><button type="button" className="delete-content-button" onClick={remove}>删除此内容</button></div>
  </div></aside></div>;
}

function AiModal({ result, close, copy }: { result: { title: string; mode: "direct" | "prompt"; prompt: string; result?: { summary: string; signals: string[]; risks: string[]; nextActions: string[] } }; close: () => void; copy: (text: string) => void }) {
  return <div className="modal-backdrop"><div className="ai-modal"><header><div><span className="eyebrow">AI ASSISTANT</span><h2>{result.title}</h2></div><button className="close-button" onClick={close}>×</button></header>{result.mode === "direct" && result.result ? <div className="ai-output"><div className="ai-summary"><Icon name="spark" /><p>{result.result.summary}</p></div><div className="ai-columns"><div><h3>关键信号</h3>{result.result.signals.map((item) => <p key={item}>· {item}</p>)}</div><div><h3>风险</h3>{result.result.risks.map((item) => <p key={item}>· {item}</p>)}</div></div><div><h3>下一步动作</h3><ol>{result.result.nextActions.map((item) => <li key={item}>{item}</li>)}</ol></div></div> : <div className="prompt-output"><p>当前没有可用的 API 密钥，已整理好完整上下文。复制后交给 Codex 或 ChatGPT 即可。</p><textarea readOnly value={result.prompt} /><button className="primary-button" onClick={() => copy(result.prompt)}>复制完整提示词</button></div>}<footer><button className="text-button" onClick={() => copy(result.prompt)}>复制原始提示词</button><button className="secondary-button" onClick={close}>关闭</button></footer></div></div>;
}

function Onboarding({ start }: { start: (mode: "demo" | "blank", profile: CreatorProfile) => void }) {
  const [creatorName, setCreatorName] = useState("");
  const [primaryPlatform, setPrimaryPlatform] = useState("小红书");
  const [contentFocus, setContentFocus] = useState("");
  const profile: CreatorProfile = {
    creatorName: creatorName.trim(),
    dashboardTitle: `${creatorName.trim() || "我的"}的自媒体 Dashboard`,
    primaryPlatform: primaryPlatform.trim() || "小红书",
    contentFocus: contentFocus.trim(),
  };

  return <div className="modal-backdrop onboarding-backdrop"><div className="onboarding">
    <span className="brand-mark large">{creatorMark(profile)}</span>
    <span className="eyebrow">CREATOR COCKPIT</span>
    <h1>先把它变成你的工作台。</h1>
    <p>填写三个简单信息，内容与目标数据仍只保存在这台设备，不需要注册。</p>
    <div className="onboarding-profile">
      <label><span>姓名 / 昵称</span><input autoFocus value={creatorName} onChange={(event) => setCreatorName(event.target.value)} placeholder="例如 Avery" /></label>
      <label><span>主要平台</span><input list="onboarding-platform-options" value={primaryPlatform} onChange={(event) => setPrimaryPlatform(event.target.value)} /><datalist id="onboarding-platform-options"><option value="小红书" /><option value="抖音" /><option value="B站" /><option value="视频号" /><option value="多平台" /></datalist></label>
      <label><span>内容方向</span><input value={contentFocus} onChange={(event) => setContentFocus(event.target.value)} placeholder="例如 AI 产品与工作流" /></label>
    </div>
    <div className="onboarding-title-preview"><span>{creatorMark(profile)}</span><div><small>你的看板</small><strong>{dashboardTitle(profile)}</strong></div></div>
    <div className="onboarding-options"><button onClick={() => start("demo", profile)}><strong>从示例开始</strong><span>先体验完整内容管线，再替换成自己的内容</span><em>推荐 →</em></button><button onClick={() => start("blank", profile)}><strong>从空白开始</strong><span>只保留默认内容类型，建立自己的第一条内容</span><em>开始 →</em></button></div>
    <small>之后可以在“设置与备份”中修改个人信息、导出或恢复数据。</small>
  </div></div>;
}
