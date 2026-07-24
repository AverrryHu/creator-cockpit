import assert from "node:assert/strict";
import test from "node:test";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("renders the creator cockpit shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>内容驾驶舱<\/title>/i);
  assert.match(html, /Avery的自媒体 Dashboard/);
  assert.match(html, /今日 Todo/);
  assert.match(html, /档期规划/);
  assert.match(html, /今天要完成的阶段/);
  assert.match(html, /大目标（阶段）/);
  assert.match(html, /复盘实验室/);
  assert.match(html, /GPT Live 不是翻译器/);
  assert.doesNotMatch(html, developmentPreviewMeta);
  assert.doesNotMatch(html, /react-loading-skeleton/);
});

test("keeps device-local storage and AI fallback contracts in source", async () => {
  const [page, layout, storage, model, schedule, api, styles] = await Promise.all([
    import("node:fs/promises").then(({ readFile }) => readFile(new URL("../app/Cockpit.tsx", import.meta.url), "utf8")),
    import("node:fs/promises").then(({ readFile }) => readFile(new URL("../app/layout.tsx", import.meta.url), "utf8")),
    import("node:fs/promises").then(({ readFile }) => readFile(new URL("../app/lib/storage.ts", import.meta.url), "utf8")),
    import("node:fs/promises").then(({ readFile }) => readFile(new URL("../app/lib/model.ts", import.meta.url), "utf8")),
    import("node:fs/promises").then(({ readFile }) => readFile(new URL("../app/lib/schedule.ts", import.meta.url), "utf8")),
    import("node:fs/promises").then(({ readFile }) => readFile(new URL("../app/api/ai/analyze/route.ts", import.meta.url), "utf8")),
    import("node:fs/promises").then(({ readFile }) => readFile(new URL("../app/globals.css", import.meta.url), "utf8")),
  ]);
  assert.match(page, /今日 Todo[\s\S]*档期规划/);
  assert.match(page, /\{ id: "schedule" as const, label: "档期规划", icon: "schedule" \}/);
  assert.doesNotMatch(page, /PeriodView|setPeriod/);
  assert.match(page, /momentumPeriod/);
  assert.match(page, /推进时间范围/);
  assert.match(page, /function WeekOverview/);
  assert.match(page, /已发布 \/ 预期发布/);
  assert.match(page, /本周需要推进的内容/);
  assert.match(page, /overdueStages/);
  assert.match(styles, /\.week-summary-kpis/);
  assert.match(styles, /\.week-stage-list/);
  assert.match(page, /\{ id: "goals" as const, label: "大目标（阶段）", icon: "goals" \}/);
  assert.match(page, /配置目标指标/);
  assert.match(page, /function FollowerTrendChart/);
  assert.match(page, /function GoalSettingsModal/);
  assert.match(page, /账号粉丝趋势/);
  assert.match(page, /快照记录（折线图原始数据）/);
  assert.match(page, /editingSnapshotId/);
  assert.match(page, /保存修改/);
  assert.match(page, /该日期已经有一条快照/);
  assert.match(page, /按内容档位/);
  assert.match(page, /按内容类型/);
  assert.doesNotMatch(page, /className="objective-input"/);
  assert.match(styles, /\.goal-core-grid/);
  assert.match(styles, /\.follower-chart/);
  assert.match(styles, /\.snapshot-record/);
  assert.match(styles, /\.goal-config-modal/);
  assert.match(styles, /\.mobile-nav\s*\{[^}]*grid-template-columns:\s*repeat\(5,\s*1fr\)/);
  assert.match(page, /sidebarCollapsed/);
  assert.match(page, /className="theme-toggle"/);
  assert.match(page, /深色模式/);
  assert.match(page, /creator-cockpit-theme/);
  assert.match(layout, /prefers-color-scheme: dark/);
  assert.match(layout, /document\.documentElement\.dataset\.theme/);
  assert.match(styles, /html\[data-theme="dark"\]/);
  assert.match(styles, /\.mobile-theme-toggle/);
  assert.match(page, /创作者档案/);
  assert.match(page, /看板标题预览/);
  assert.match(page, /先把它变成你的工作台/);
  assert.match(page, /document\.title = workspaceTitle/);
  assert.match(page, /function EditablePageTitle/);
  assert.match(page, /aria-label="页面主标题"/);
  assert.match(page, /updatePageTitle/);
  assert.match(page, /state\.pageTitles\[momentumPeriod\]/);
  assert.match(page, /value=\{state\.pageTitles\.schedule\}/);
  assert.match(page, /pageTitle=\{state\.pageTitles\.pipeline\}/);
  assert.match(page, /pageTitle=\{state\.pageTitles\.goals\}/);
  assert.match(page, /pageTitle=\{state\.pageTitles\.review\}/);
  assert.match(page, /pageTitle=\{state\.pageTitles\.settings\}/);
  assert.match(styles, /\.editable-page-title/);
  assert.match(page, /收起侧边栏/);
  assert.match(styles, /\.cockpit-shell\.sidebar-collapsed\s*\{\s*--sidebar:\s*72px/);
  assert.match(page, /stageEvents/);
  assert.match(page, /stageColors/);
  assert.match(page, /StageColorModal/);
  assert.match(page, /恢复默认配色/);
  assert.match(page, /阶段已完成/);
  assert.match(page, /schedule-calendar-event/);
  assert.match(page, /schedule-operation-event/);
  assert.match(page, /schedule-operation-event-icon/);
  assert.match(page, /legend-content-stage/);
  assert.match(page, /legend-operation-event/);
  assert.doesNotMatch(page, /schedule-special-event/);
  assert.match(page, /复盘、直播和自定义日程可重复创建/);
  assert.doesNotMatch(page, /schedule-event-fill/);
  assert.match(page, /<em>\{STAGE_LABELS\[event\.stage\]\}<\/em><strong>\{item\.title\}<\/strong>/);
  assert.match(page, /recordingNotes/);
  assert.match(page, /editingNotes/);
  assert.doesNotMatch(page, /录制 \/ 剪辑/);
  assert.match(page, /StageScheduleField/);
  assert.match(page, /StageStatusPanel/);
  assert.match(page, /阶段完成状态/);
  assert.match(page, /前置阶段已同步/);
  assert.match(page, /eventId: event\.id/);
  assert.match(page, /moveEvent\(data\.eventId, plannedDate\)/);
  assert.match(page, /scheduleStageForDate/);
  assert.match(page, /复盘不再针对单条内容排期/);
  assert.match(page, /灵感无需排期/);
  assert.match(page, /SCHEDULABLE_STAGES/);
  assert.match(page, /灵感只用于收集，不需要设置完成日期/);
  assert.match(page, /onWheel=\{scrollHorizontalRow\}/);
  assert.match(page, /aria-label="周日历，可横向滚动"/);
  assert.match(page, /className="schedule-content-percent"/);
  assert.match(page, /内容完成度 \$\{progress\}%/);
  assert.match(page, /className="schedule-day-cell empty compact"/);
  assert.match(styles, /\.schedule-stage-chips\s*\{[^}]*flex-wrap:\s*nowrap/);
  assert.match(styles, /\.schedule-stage-chips\s*\{[^}]*overflow-x:\s*auto/);
  assert.match(styles, /\.schedule-operation-templates\s*\{[^}]*display:\s*flex[^}]*flex-wrap:\s*nowrap[^}]*overflow-x:\s*auto/);
  assert.match(styles, /\.schedule-week-scroll\s*\{[^}]*overflow-x:\s*auto/);
  assert.match(page, /每个模板都可无限次拖入日历/);
  assert.match(page, /schedule-type-template/);
  assert.match(page, /type\.kind === "review"/);
  assert.match(page, /type\.kind === "live"/);
  assert.match(page, /新建日程类型/);
  assert.match(page, /function ScheduleObjectModal/);
  assert.match(page, /function ScheduleTypeModal/);
  assert.match(page, /function ScheduleTypeManagerModal/);
  assert.match(page, /function ScheduleTypeDeleteModal/);
  assert.match(page, /管理日程类型/);
  assert.doesNotMatch(page, /aria-label="新建日程类型">＋ 新建<\/button>/);
  assert.match(page, />＋ 新建类型<\/button>/);
  assert.match(page, /只删除模板/);
  assert.match(page, /模板和日程一起删除/);
  assert.match(page, /function LiveSessionModal/);
  assert.match(page, /\{type\.name\}内容 \/ 流程/);
  assert.match(page, /复盘、直播和自定义日程可重复创建/);
  assert.match(page, /state\.reviewDays/);
  assert.match(page, /state\.liveSessions/);
  assert.match(page, /state\.scheduleObjectTypes/);
  assert.match(page, /state\.scheduleObjects/);
  assert.match(schedule, /addReviewDay/);
  assert.match(schedule, /saveLiveSession/);
  assert.match(model, /export interface LiveSession/);
  assert.match(model, /export interface ReviewDay/);
  assert.match(model, /SCHEDULABLE_STAGES:[^=]+=\s*\[[^\]]*"publishing",[^\]]*\];/);
  assert.doesNotMatch(model, /SCHEDULABLE_STAGES:[^=]+=\s*\[[^\]]*"review",[^\]]*\];/);
  assert.doesNotMatch(page, /function WeekView/);
  assert.doesNotMatch(page, /WeeklyPlanModal/);
  assert.match(page, /全局当前阶段/);
  assert.match(page, /删除此内容/);
  assert.match(page, /deleteContentFromWorkspace/);
  assert.match(page, /给这篇内容定型/);
  assert.match(page, /定型评价/);
  assert.match(page, /点击星星完成定型评价/);
  assert.match(page, /复盘分析/);
  assert.match(page, /沉淀为内容规则/);
  assert.match(page, /保存复盘/);
  assert.match(page, /更新复盘/);
  assert.match(page, /发布后自动进入待复盘/);
  assert.match(page, /复盘完成率/);
  assert.match(page, /平均星级/);
  assert.match(page, /<h2>待复盘<\/h2>/);
  assert.match(page, /<h2>已复盘<\/h2>/);
  assert.match(page, /open=\{\(id\) => openContent\(id, "review"\)\}/);
  assert.match(page, /useState<ContentDrawerTab>\(initialTab\)/);
  assert.match(page, /completeContentReview/);
  assert.match(page, /ruleDeposited/);
  assert.doesNotMatch(page, /<span>问题归因<\/span>/);
  assert.doesNotMatch(page, /<span>评论里的受众信号<\/span>/);
  assert.doesNotMatch(page, /<span>下一步<\/span><select value=\{item\.review\.nextAction\}/);
  assert.match(storage, /normalizeReview/);
  assert.match(storage, /normalizePageTitles/);
  assert.match(storage, /schemaVersion:\s*13/);
  assert.match(model, /DEFAULT_SCHEDULE_OBJECT_TYPES/);
  assert.match(storage, /normalizeReviewDays/);
  assert.match(storage, /normalizeLiveSessions/);
  assert.match(styles, /\.star-rating/);
  assert.match(styles, /\.review-block/);
  assert.match(styles, /\.review-ledger-row/);
  assert.match(styles, /\.review-kpi-grid/);
  assert.match(styles, /\.review-save-bar/);
  assert.match(page, /导出完整备份/);
  assert.match(storage, /indexedDB\.open/);
  assert.match(storage, /schemaVersion/);
  assert.match(storage, /normalizeStageColors/);
  assert.match(api, /OPENAI_API_KEY/);
  assert.match(api, /mode:\s*"prompt"/);
  assert.match(api, /json_schema/);
});
