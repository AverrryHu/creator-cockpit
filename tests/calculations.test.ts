import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateGoalHealth,
  currentFollowers,
  isQualityQualified,
  publishedWithin,
  qualifiedContents,
  startOfWeekISO,
} from "../app/lib/calculations.ts";
import { DEFAULT_CREATOR_PROFILE, DEFAULT_PAGE_TITLES, DEFAULT_STAGE_COLORS, type ContentItem, type GoalCycle, type LiveSession, type ScheduleObject, type ScheduleObjectType, type StageEvent, type WorkspaceState } from "../app/lib/model.ts";
import {
  addReviewDay,
  moveLiveSession,
  moveReviewDay,
  removeLiveSession,
  removeReviewDay,
  moveScheduleObject,
  removeScheduleObject,
  saveScheduleObject,
  saveScheduleObjectType,
  saveLiveSession,
} from "../app/lib/schedule.ts";
import { migrateWorkspace } from "../app/lib/storage.ts";
import { completeContentReview, deleteContentFromWorkspace } from "../app/lib/workspace.ts";
import {
  canScheduleStage,
  completedPublishingEvents,
  moveStageEventToDate,
  removeStageEvent,
  scheduleStageForDate,
  setContentStageCompletion,
  sortStageEvents,
  stageProgress,
  toggleStageEvent,
  transitionContentStage,
} from "../app/lib/workflow.ts";

const goal: GoalCycle = {
  id: "q3",
  objective: "稳定产出",
  startDate: "2026-07-01",
  endDate: "2026-09-30",
  status: "active",
  outputTarget: 4,
  quotas: [{ contentType: "AI 产品实测", target: 4 }],
  followerStart: 100,
  followerTarget: 200,
  qualityMetric: "saveRate",
  qualityThreshold: 5,
  qualityTarget: 2,
};

function content(partial: Partial<ContentItem> = {}): ContentItem {
  return {
    id: "content-1",
    title: "测试内容",
    idea: "",
    contentType: "AI 产品实测",
    tier: "B",
    stage: "review",
    publicationStatus: "published",
    priority: "normal",
    tags: [],
    createdAt: "2026-07-01",
    updatedAt: "2026-07-01",
    publishedAt: "2026-07-10",
    xhsLink: "",
    coverCopy: "",
    publishCopy: "",
    topic: {
      audience: "", painPoint: "", pointOfView: "", commonAngle: "", contrastAngle: "", assets: "", minimumProduction: "",
      score: { audience: 0, pain: 0, scene: 0, demonstrable: 0, distribution: 0, efficiency: 0 },
    },
    script: { headline: "", hook: "", conclusion: "", body: "", example: "", ending: "" },
    recordingNotes: "",
    editingNotes: "",
    metrics: { views: 1_000, likes: 60, saves: 60, comments: 10, followerGain: 20, capturedAt: "2026-07-13" },
    review: { rating: 0, analysis: "", learnedRule: "", completedAt: "" },
    ...partial,
  };
}

function workspace(item = content(), events: StageEvent[] = []): WorkspaceState {
  return {
    schemaVersion: 11,
    profile: { ...DEFAULT_CREATOR_PROFILE },
    pageTitles: { ...DEFAULT_PAGE_TITLES },
    setupComplete: true,
    lastBackupAt: "",
    contents: [item],
    stageEvents: events,
    reviewDays: [],
    liveSessions: [],
    scheduleObjectTypes: [],
    scheduleObjects: [],
    stageColors: { ...DEFAULT_STAGE_COLORS },
    goal,
    goalHistory: [],
    followerSnapshots: [],
    insightRules: [],
    contentTypes: ["AI 产品实测"],
  };
}

test("published records are counted once and respect quarter boundaries", () => {
  const records = [
    content(),
    content({ id: "outside", publishedAt: "2026-10-01" }),
    content({ id: "draft", publicationStatus: "draft" }),
  ];
  assert.equal(publishedWithin(records, goal.startDate, goal.endDate).length, 1);
  assert.equal(publishedWithin([content({ publishedAt: "2026-09-30" })], goal.startDate, goal.endDate).length, 1);
  assert.equal(publishedWithin([content({ publicationStatus: "draft" })], goal.startDate, goal.endDate).length, 0);
});

test("quality KR only counts snapshots captured at T+3 or later", () => {
  const early = content({ metrics: { views: 1_000, likes: 60, saves: 60, comments: 10, followerGain: 20, capturedAt: "2026-07-12" } });
  assert.equal(isQualityQualified(early, goal), false);
  assert.equal(isQualityQualified(content(), goal), true);
  assert.deepEqual(qualifiedContents([early, content()], goal).map((item) => item.id), ["content-1"]);
});

test("follower snapshots are sorted before growth is calculated", () => {
  const followers = currentFollowers(goal, [
    { date: "2026-07-20", followers: 145 },
    { date: "2026-07-03", followers: 112 },
    { date: "2026-10-01", followers: 999 },
  ]);
  assert.equal(followers, 145);
  const health = calculateGoalHealth(goal, [content()], [{ date: "2026-07-20", followers: 145 }], new Date("2026-07-20T20:00:00"));
  assert.equal(health.outputRemaining, 3);
  assert.equal(health.followerRemaining, 55);
});

test("quarter setup rhythm and Shanghai week boundaries remain correct", () => {
  const health = calculateGoalHealth(goal, [], [], new Date("2026-07-03T23:00:00"));
  assert.equal(health.status, "setting_up");
  assert.equal(Math.round(health.timeProgress * 92), 3);
  assert.equal(startOfWeekISO(new Date("2026-07-19T16:30:00.000Z")), "2026-07-20");
});

test("completed Todo events sink while undo restores original ordering", () => {
  const events: StageEvent[] = [
    { id: "first", contentId: "first", stage: "script", plannedDate: "2026-07-18", rank: 1, completedAt: "" },
    { id: "second", contentId: "second", stage: "script", plannedDate: "2026-07-18", rank: 2, completedAt: "2026-07-18T09:00:00.000Z" },
    { id: "third", contentId: "third", stage: "script", plannedDate: "2026-07-18", rank: 3, completedAt: "" },
  ];
  assert.deepEqual(sortStageEvents(events).map((item) => item.id), ["first", "third", "second"]);
  assert.deepEqual(sortStageEvents(events.map((event) => event.id === "second" ? { ...event, completedAt: "" } : event)).map((item) => item.id), ["first", "second", "third"]);
});

test("completing a Todo stage advances global stage and can be undone", () => {
  const item = content({ stage: "script", publicationStatus: "draft", publishedAt: "" });
  const event: StageEvent = { id: "event-1", contentId: item.id, stage: "script", plannedDate: "2026-07-18", rank: 1, completedAt: "" };
  const completed = toggleStageEvent(workspace(item, [event]), event.id, "2026-07-18T09:00:00.000Z");
  assert.equal(completed.contents[0].stage, "recording");
  assert.ok(completed.stageEvents[0].completedAt);
  const restored = toggleStageEvent(completed, event.id, "unused");
  assert.equal(restored.contents[0].stage, "script");
  assert.equal(restored.stageEvents[0].completedAt, "");
  assert.equal(stageProgress("script"), 0.3);
  assert.equal(stageProgress("recording"), 0.5);
  assert.equal(stageProgress("review"), 0.95);
  assert.equal(stageProgress("archived"), 1);
});

test("repeated Todo completion and undo never removes later scheduled stages", () => {
  const item = content({ stage: "script", publicationStatus: "draft", publishedAt: "" });
  const events: StageEvent[] = [
    { id: "script-today", contentId: item.id, stage: "script", plannedDate: "2026-07-18", rank: 1, completedAt: "" },
    { id: "recording-today", contentId: item.id, stage: "recording", plannedDate: "2026-07-18", rank: 2, completedAt: "" },
    { id: "editing-today", contentId: item.id, stage: "editing", plannedDate: "2026-07-18", rank: 3, completedAt: "" },
  ];
  const firstCompleted = toggleStageEvent(workspace(item, events), "script-today", "2026-07-18T09:00:00.000Z");
  const firstUndone = toggleStageEvent(firstCompleted, "script-today", "unused");
  const secondCompleted = toggleStageEvent(firstUndone, "script-today", "2026-07-18T09:05:00.000Z");
  const secondUndone = toggleStageEvent(secondCompleted, "script-today", "unused");

  assert.equal(secondUndone.contents[0].stage, "script");
  assert.deepEqual(secondUndone.stageEvents.map((event) => [event.id, event.completedAt]), [
    ["script-today", ""],
    ["recording-today", ""],
    ["editing-today", ""],
  ]);
});

test("stage scheduling reschedules one shared event and updates publishing status", () => {
  const item = content({ stage: "recording", publicationStatus: "draft", publishedAt: "" });
  const first = scheduleStageForDate(workspace(item), item.id, "recording", "2026-07-20");
  const moved = scheduleStageForDate(first, item.id, "recording", "2026-07-22");
  assert.equal(moved.stageEvents.length, 1);
  assert.equal(moved.stageEvents[0].plannedDate, "2026-07-22");
  const publishing = scheduleStageForDate(moved, item.id, "publishing", "2026-07-25");
  assert.equal(publishing.contents[0].publicationStatus, "scheduled");
  const removed = removeStageEvent(publishing, publishing.stageEvents.find((event) => event.stage === "publishing")!.id);
  assert.equal(removed.contents[0].publicationStatus, "draft");
});

test("inspiration stays in the pipeline and never creates a calendar event", () => {
  const item = content({ stage: "inbox", publicationStatus: "draft", publishedAt: "" });
  const state = workspace(item);
  assert.equal(canScheduleStage(state, item.id, "inbox", "2026-07-20"), false);
  assert.equal(scheduleStageForDate(state, item.id, "inbox", "2026-07-20").stageEvents.length, 0);
  const promoted = transitionContentStage(state, item.id, "topic", "2026-07-20");
  assert.equal(promoted.contents[0].stage, "topic");
  assert.equal(promoted.stageEvents.length, 0);
});

test("manual stage completion cascades backward and undo cascades forward", () => {
  const item = content({ stage: "topic", publicationStatus: "draft", publishedAt: "" });
  const completed = setContentStageCompletion(
    workspace(item),
    item.id,
    "editing",
    true,
    "2026-07-20",
    "2026-07-20T09:00:00.000Z",
  );
  assert.equal(completed.contents[0].stage, "publishing");
  assert.deepEqual(completed.stageEvents.map((event) => [event.stage, Boolean(event.completedAt)]), [
    ["topic", true],
    ["script", true],
    ["recording", true],
    ["editing", true],
  ]);
  const undone = setContentStageCompletion(
    completed,
    item.id,
    "recording",
    false,
    "2026-07-21",
    "unused",
  );
  assert.equal(undone.contents[0].stage, "recording");
  assert.deepEqual(undone.stageEvents.map((event) => [event.stage, Boolean(event.completedAt)]), [
    ["topic", true],
    ["script", true],
    ["recording", false],
    ["editing", false],
  ]);
});

test("completed calendar events remain draggable and keep completion state", () => {
  const item = content({ stage: "publishing", publicationStatus: "scheduled", publishedAt: "" });
  const planned = scheduleStageForDate(workspace(item), item.id, "publishing", "2026-07-25");
  const published = setContentStageCompletion(
    planned,
    item.id,
    "publishing",
    true,
    "2026-07-20",
    "2026-07-20T09:00:00.000Z",
  );
  const publishingEvent = published.stageEvents.find((event) => event.stage === "publishing")!;
  assert.equal(published.contents[0].publicationStatus, "published");
  assert.equal(published.contents[0].publishedAt, "2026-07-20");
  assert.equal(published.stageEvents.some((event) => event.stage === "review"), false);
  const moved = moveStageEventToDate(published, publishingEvent.id, "2026-07-21");
  assert.equal(moved.stageEvents.find((event) => event.id === publishingEvent.id)?.plannedDate, "2026-07-21");
  assert.ok(moved.stageEvents.find((event) => event.id === publishingEvent.id)?.completedAt);
  assert.equal(moved.contents[0].publishedAt, "2026-07-21");
  assert.equal(moved.stageEvents.some((event) => event.stage === "review"), false);
});

test("stage scheduling enforces order but allows consecutive stages on the same day", () => {
  const item = content({ stage: "recording", publicationStatus: "draft", publishedAt: "" });
  const withRecording = scheduleStageForDate(workspace(item), item.id, "recording", "2026-07-22");
  assert.equal(canScheduleStage(withRecording, item.id, "editing", "2026-07-21"), false);
  assert.equal(canScheduleStage(withRecording, item.id, "editing", "2026-07-22"), true);
  const invalid = scheduleStageForDate(withRecording, item.id, "editing", "2026-07-21");
  assert.equal(invalid.stageEvents.length, 1);
  const sameDay = scheduleStageForDate(withRecording, item.id, "editing", "2026-07-22");
  assert.deepEqual(sameDay.stageEvents.map((event) => event.stage), ["recording", "editing"]);
});

test("publishing creates only a completed publish event", () => {
  const item = content({ stage: "review", publicationStatus: "published", publishedAt: "2026-07-20" });
  const events = completedPublishingEvents(workspace(item), item, "2026-07-20T12:00:00.000Z");
  assert.deepEqual(events.map((event) => [event.stage, event.plannedDate, Boolean(event.completedAt)]), [
    ["publishing", "2026-07-20", true],
  ]);
});

test("saving a valid review marks it reviewed without creating a calendar stage", () => {
  const item = content({
    review: { rating: 4, analysis: "场景具体，但开头还可以更快。", learnedRule: "", completedAt: "" },
  });
  const next = completeContentReview(
    workspace(item),
    item.id,
    "2026-07-13",
    "2026-07-13T12:00:00.000Z",
  );
  assert.equal(next.contents[0].review.completedAt, "2026-07-13T12:00:00.000Z");
  assert.equal(next.contents[0].stage, "archived");
  assert.equal(next.stageEvents.some((event) => event.stage === "review"), false);
});

test("review completion requires both a star rating and written analysis", () => {
  const item = content({ review: { rating: 0, analysis: "", learnedRule: "", completedAt: "" } });
  const state = workspace(item);
  assert.equal(completeContentReview(state, item.id, "2026-07-13", "2026-07-13T12:00:00.000Z"), state);
  const unpublished = content({
    publicationStatus: "scheduled",
    publishedAt: "",
    review: { rating: 4, analysis: "已经写好，但内容还没发布。", learnedRule: "", completedAt: "" },
  });
  const unpublishedState = workspace(unpublished);
  assert.equal(completeContentReview(unpublishedState, unpublished.id, "2026-07-13", "2026-07-13T12:00:00.000Z"), unpublishedState);
});

test("review days can be created repeatedly, moved, and removed independently", () => {
  const first = addReviewDay(workspace(), "2026-07-20", "2026-07-18T12:00:00.000Z");
  const second = addReviewDay(first, "2026-07-20", "2026-07-18T12:01:00.000Z");
  assert.equal(second.reviewDays.length, 2);
  assert.notEqual(second.reviewDays[0].id, second.reviewDays[1].id);
  const moved = moveReviewDay(second, second.reviewDays[0].id, "2026-07-22");
  assert.equal(moved.reviewDays.find((item) => item.id === second.reviewDays[0].id)?.plannedDate, "2026-07-22");
  const removed = removeReviewDay(moved, second.reviewDays[1].id);
  assert.deepEqual(removed.reviewDays.map((item) => item.id), [second.reviewDays[0].id]);
});

test("live sessions are separate records that keep details when dragged", () => {
  const session: LiveSession = {
    id: "live-1",
    title: "AI 工具答疑",
    plannedDate: "2026-07-20",
    startTime: "20:00",
    endTime: "21:00",
    platform: "小红书",
    content: "演示工具并回答问题",
    createdAt: "2026-07-18T12:00:00.000Z",
    updatedAt: "2026-07-18T12:00:00.000Z",
  };
  const saved = saveLiveSession(workspace(), session);
  assert.deepEqual(saved.liveSessions, [session]);
  const moved = moveLiveSession(saved, session.id, "2026-07-23", "2026-07-19T12:00:00.000Z");
  assert.equal(moved.liveSessions[0].plannedDate, "2026-07-23");
  assert.equal(moved.liveSessions[0].content, session.content);
  const removed = removeLiveSession(moved, session.id);
  assert.deepEqual(removed.liveSessions, []);
});

test("custom schedule templates can create unlimited independent events", () => {
  const type: ScheduleObjectType = {
    id: "schedule-type-event",
    name: "活动",
    description: "线下活动或展会",
    color: "#4F7A72",
    createdAt: "2026-07-18T12:00:00.000Z",
  };
  const withType = saveScheduleObjectType(workspace(), type);
  assert.deepEqual(withType.scheduleObjectTypes, [type]);
  assert.equal(saveScheduleObjectType(withType, { ...type, id: "duplicate-type" }), withType);
  assert.equal(saveScheduleObjectType(withType, { ...type, id: "builtin-type", name: "复盘" }), withType);
  const first: ScheduleObject = {
    id: "schedule-object-1",
    typeId: type.id,
    title: "WAIC 探展",
    plannedDate: "2026-07-20",
    startTime: "10:00",
    endTime: "16:00",
    details: "提前准备采访清单",
    createdAt: "2026-07-18T12:01:00.000Z",
    updatedAt: "2026-07-18T12:01:00.000Z",
  };
  const second = { ...first, id: "schedule-object-2", title: "创作者交流会", startTime: "19:00" };
  const saved = saveScheduleObject(saveScheduleObject(withType, first), second);
  assert.equal(saved.scheduleObjects.length, 2);
  assert.notEqual(saved.scheduleObjects[0].id, saved.scheduleObjects[1].id);
  const moved = moveScheduleObject(saved, first.id, "2026-07-22", "2026-07-19T12:00:00.000Z");
  assert.equal(moved.scheduleObjects.find((item) => item.id === first.id)?.plannedDate, "2026-07-22");
  assert.equal(moved.scheduleObjects.find((item) => item.id === first.id)?.details, first.details);
  const removed = removeScheduleObject(moved, second.id);
  assert.deepEqual(removed.scheduleObjects.map((item) => item.id), [first.id]);
});

test("deleting content clears its schedule and insight references", () => {
  const state: WorkspaceState = {
    ...workspace(),
    contents: [content(), content({ id: "keep" })],
    stageEvents: [
      { id: "delete-event", contentId: "content-1", stage: "publishing", plannedDate: "2026-07-13", rank: 0, completedAt: "" },
      { id: "keep-event", contentId: "keep", stage: "publishing", plannedDate: "2026-07-13", rank: 0, completedAt: "" },
    ],
    insightRules: [
      { id: "delete-rule", text: "删除", sourceContentId: "content-1", createdAt: "2026-07-13", active: true },
      { id: "keep-rule", text: "保留", sourceContentId: "keep", createdAt: "2026-07-13", active: true },
    ],
  };
  const next = deleteContentFromWorkspace(state, "content-1");
  assert.deepEqual(next.contents.map((item) => item.id), ["keep"]);
  assert.deepEqual(next.insightRules.map((rule) => rule.id), ["keep-rule"]);
  assert.deepEqual(next.stageEvents.map((event) => event.id), ["keep-event"]);
});

test("legacy workspaces migrate dates into stage events and discard weekly planning", () => {
  const legacyContent = {
    ...content({ stage: "script", publicationStatus: "scheduled", publishedAt: "" }),
    stage: "production",
    productionState: "editing",
    productionNotes: "旧版制作备注",
    todayRank: 2,
    todayPlanDate: "2026-07-18",
    todayCompletedAt: "",
    targetPublishAt: "2026-07-22",
    reviewDueAt: "",
    review: {
      diagnosis: "表达",
      audienceSignal: "观众都在追问模板",
      selfJudgment: "开头不够具体。",
      nextAction: "做系列",
      learnedRule: "先展示最终结果。",
    },
  };
  const migrated = migrateWorkspace({
    schemaVersion: 3,
    setupComplete: true,
    lastBackupAt: "",
    contents: [legacyContent],
    stageEvents: [
      { id: "legacy-inbox-event", contentId: legacyContent.id, stage: "inbox", plannedDate: "2026-07-17", rank: 1, completedAt: "" },
    ],
    goal,
    goalHistory: [],
    weeklyPlans: [{ id: "legacy-week" }],
    monthlyReviews: [],
    followerSnapshots: [],
    insightRules: [],
    contentTypes: ["AI 产品实测"],
  });
  assert.equal(migrated?.schemaVersion, 11);
  assert.equal(migrated?.profile.dashboardTitle, "Avery的自媒体 Dashboard");
  assert.equal(migrated?.pageTitles.goals, goal.objective);
  assert.equal(migrated?.stageColors.recording, DEFAULT_STAGE_COLORS.recording);
  assert.equal(migrated?.contents[0].stage, "editing");
  assert.equal("targetPublishAt" in (migrated?.contents[0] ?? {}), false);
  assert.equal("weeklyPlans" in (migrated ?? {}), false);
  assert.deepEqual(migrated?.stageEvents.map((event) => [event.stage, event.plannedDate]), [
    ["editing", "2026-07-18"],
    ["publishing", "2026-07-22"],
  ]);
  assert.equal(migrated?.contents[0].recordingNotes, "旧版制作备注");
  assert.equal(migrated?.contents[0].editingNotes, "旧版制作备注");
  assert.equal(migrated?.contents[0].review.rating, 0);
  assert.match(migrated?.contents[0].review.analysis ?? "", /开头不够具体/);
  assert.match(migrated?.contents[0].review.analysis ?? "", /评论信号：观众都在追问模板/);
  assert.equal(migrated?.contents[0].review.learnedRule, "先展示最终结果。");
  assert.equal(migrated?.contents[0].review.completedAt, "");
  assert.deepEqual(migrated?.reviewDays, []);
  assert.deepEqual(migrated?.liveSessions, []);
  assert.deepEqual(migrated?.scheduleObjectTypes, []);
  assert.deepEqual(migrated?.scheduleObjects, []);
});

test("pending legacy per-content review dates are removed from the calendar", () => {
  const item = content({ stage: "review", review: { rating: 0, analysis: "", learnedRule: "", completedAt: "" } });
  const migrated = migrateWorkspace({
    ...workspace(item, [
      { id: "pending-review-a", contentId: item.id, stage: "review", plannedDate: "2026-07-24", rank: 0, completedAt: "" },
      { id: "pending-review-b", contentId: "another-content", stage: "review", plannedDate: "2026-07-24", rank: 1, completedAt: "" },
    ]),
    schemaVersion: 9,
  });
  assert.deepEqual(migrated?.stageEvents.map((event) => event.stage), ["publishing"]);
  assert.equal(migrated?.stageEvents.some((event) => event.stage === "review"), false);
  assert.deepEqual(migrated?.reviewDays, []);
});

test("archived legacy content is recognized as reviewed", () => {
  const item = content({
    stage: "archived",
    review: { rating: 5, analysis: "表现稳定。", learnedRule: "保持具体场景。", completedAt: "" },
  });
  const migrated = migrateWorkspace({
    ...workspace(item, [{ id: "completed-review", contentId: item.id, stage: "review", plannedDate: "2026-07-13", rank: 0, completedAt: "2026-07-13T12:00:00.000Z" }]),
    schemaVersion: 7,
  });
  assert.equal(migrated?.schemaVersion, 11);
  assert.equal(migrated?.contents[0].review.completedAt, "2026-07-13T12:00:00.000Z");
  assert.equal(migrated?.stageEvents.some((event) => event.stage === "review"), false);
});

test("creator profile survives backup migration", () => {
  const restored = migrateWorkspace({
    ...workspace(),
    profile: {
      creatorName: "Mia",
      dashboardTitle: "Mia 的视频工作室",
      primaryPlatform: "B站",
      contentFocus: "设计与效率",
    },
  });
  assert.deepEqual(restored?.profile, {
    creatorName: "Mia",
    dashboardTitle: "Mia 的视频工作室",
    primaryPlatform: "B站",
    contentFocus: "设计与效率",
  });
});

test("review days, live sessions, and custom schedules survive versioned backup migration", () => {
  const session: LiveSession = {
    id: "live-backup",
    title: "周末直播",
    plannedDate: "2026-07-25",
    startTime: "19:30",
    endTime: "20:30",
    platform: "小红书",
    content: "一周 AI 工具复盘",
    createdAt: "2026-07-18T12:00:00.000Z",
    updatedAt: "2026-07-18T12:00:00.000Z",
  };
  const restored = migrateWorkspace({
    ...workspace(),
    reviewDays: [{ id: "review-backup", plannedDate: "2026-07-24", note: "", createdAt: "2026-07-18T12:00:00.000Z" }],
    liveSessions: [session],
    scheduleObjectTypes: [{
      id: "schedule-type-backup",
      name: "活动",
      description: "线下安排",
      color: "#4F7A72",
      createdAt: "2026-07-18T12:00:00.000Z",
    }],
    scheduleObjects: [{
      id: "schedule-object-backup",
      typeId: "schedule-type-backup",
      title: "行业交流会",
      plannedDate: "2026-07-26",
      startTime: "14:00",
      endTime: "17:00",
      details: "带名片",
      createdAt: "2026-07-18T12:00:00.000Z",
      updatedAt: "2026-07-18T12:00:00.000Z",
    }],
  });
  assert.equal(restored?.schemaVersion, 11);
  assert.equal(restored?.reviewDays[0].plannedDate, "2026-07-24");
  assert.deepEqual(restored?.liveSessions[0], session);
  assert.equal(restored?.scheduleObjectTypes[0].name, "活动");
  assert.equal(restored?.scheduleObjects[0].title, "行业交流会");
});

test("moving a pipeline card forward records every crossed stage", () => {
  const item = content({ stage: "script", publicationStatus: "draft", publishedAt: "" });
  const next = transitionContentStage(workspace(item), item.id, "publishing", "2026-07-18");
  assert.equal(next.contents[0].stage, "publishing");
  assert.deepEqual(next.stageEvents.map((event) => event.stage), ["script", "recording", "editing"]);
  assert.ok(next.stageEvents.every((event) => Boolean(event.completedAt)));
});
