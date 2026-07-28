import type {
  ContentItem,
  ContentStage,
  CreatorProfile,
  DesignStyle,
  InspirationCard,
  LiveSession,
  NavigationItemId,
  PageTitles,
  ReviewDay,
  ScheduleObject,
  ScheduleObjectType,
  StageEvent,
  WorkspaceState,
} from "./model.ts";
import {
  CONTENT_STAGES,
  DEFAULT_CREATOR_PROFILE,
  DEFAULT_DESIGN_STYLE,
  DEFAULT_NAVIGATION_ORDER,
  DEFAULT_PAGE_TITLES,
  DEFAULT_SCHEDULE_OBJECT_TYPES,
  DEFAULT_STAGE_COLORS,
} from "./model.ts";

const DB_NAME = "creator-cockpit";
const DB_VERSION = 1;
const STORE_NAME = "workspace";
const WORKSPACE_KEY = "primary";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadWorkspace(): Promise<WorkspaceState | null> {
  if (typeof indexedDB === "undefined") return null;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(WORKSPACE_KEY);
    request.onsuccess = () => {
      resolve(migrateWorkspace(request.result));
    };
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

export async function saveWorkspace(state: WorkspaceState) {
  if (typeof indexedDB === "undefined") return;
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(state, WORKSPACE_KEY);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function clearWorkspace() {
  if (typeof indexedDB === "undefined") return;
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(WORKSPACE_KEY);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

export function validateImport(value: unknown): value is WorkspaceState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as {
    schemaVersion?: number;
    contents?: unknown;
    followerSnapshots?: unknown;
    contentTypes?: unknown;
    goal?: unknown;
  };
  return (
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].includes(candidate.schemaVersion ?? 0) &&
    Array.isArray(candidate.contents) &&
    Array.isArray(candidate.followerSnapshots) &&
    Array.isArray(candidate.contentTypes) &&
    Boolean(candidate.goal)
  );
}

type LegacyReview = Partial<ContentItem["review"]> & {
  diagnosis?: "选题" | "表达" | "包装" | "执行" | "未判断";
  audienceSignal?: string;
  selfJudgment?: string;
  nextAction?: "不做延展" | "改角度重发" | "做系列" | "升级精品" | "待决定";
};

type LegacyContentItem = Omit<ContentItem, "stage" | "review"> & {
  stage: ContentStage | "production";
  review?: LegacyReview;
  weeklyPlanId?: string | null;
  productionState?: "ready_to_shoot" | "recording" | "editing" | "ready_to_publish";
  productionNotes?: string;
  todayRank?: number | null;
  todayPlanDate?: string;
  todayCompletedAt?: string;
  targetPublishAt?: string;
  reviewDueAt?: string;
};

type LegacyWorkspace = Omit<WorkspaceState, "schemaVersion" | "designStyle" | "navigationOrder" | "profile" | "pageTitles" | "inspirationCards" | "contents" | "stageEvents" | "reviewDays" | "liveSessions" | "scheduleObjectTypes" | "scheduleObjects" | "stageColors"> & {
  schemaVersion: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16;
  designStyle?: DesignStyle;
  navigationOrder?: NavigationItemId[];
  profile?: Partial<CreatorProfile>;
  pageTitles?: Partial<PageTitles>;
  inspirationCards?: Partial<InspirationCard>[];
  contents: LegacyContentItem[];
  stageEvents?: StageEvent[];
  reviewDays?: Partial<ReviewDay>[];
  liveSessions?: Partial<LiveSession>[];
  scheduleObjectTypes?: Partial<ScheduleObjectType>[];
  scheduleObjects?: Partial<ScheduleObject>[];
  stageColors?: Partial<Record<ContentStage, string>>;
  weeklyPlans?: unknown[];
  monthlyReviews?: unknown[];
};

function normalizeStageColors(value: unknown): Record<ContentStage, string> {
  const candidate = value && typeof value === "object" ? value as Partial<Record<ContentStage, unknown>> : {};
  return Object.fromEntries(CONTENT_STAGES.map((stage) => {
    const color = candidate[stage];
    return [stage, typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color) ? color.toUpperCase() : DEFAULT_STAGE_COLORS[stage]];
  })) as Record<ContentStage, string>;
}

function normalizeCreatorProfile(value: unknown): CreatorProfile {
  const candidate = value && typeof value === "object" ? value as Partial<Record<keyof CreatorProfile, unknown>> : {};
  const hasCreatorName = typeof candidate.creatorName === "string";
  const creatorName = hasCreatorName ? candidate.creatorName.trim() : DEFAULT_CREATOR_PROFILE.creatorName;
  const dashboardTitle = typeof candidate.dashboardTitle === "string" && candidate.dashboardTitle.trim()
    ? candidate.dashboardTitle.trim()
    : hasCreatorName
      ? `${creatorName || "我的"}的自媒体 Dashboard`
      : DEFAULT_CREATOR_PROFILE.dashboardTitle;
  return {
    creatorName,
    dashboardTitle,
    primaryPlatform: typeof candidate.primaryPlatform === "string" && candidate.primaryPlatform.trim()
      ? candidate.primaryPlatform.trim()
      : DEFAULT_CREATOR_PROFILE.primaryPlatform,
    contentFocus: typeof candidate.contentFocus === "string"
      ? candidate.contentFocus.trim()
      : DEFAULT_CREATOR_PROFILE.contentFocus,
  };
}

function normalizeDesignStyle(value: unknown): DesignStyle {
  return value === "editorial" || value === "swiss" || value === "future" || value === "retro" || value === "bauhaus"
    ? value
    : DEFAULT_DESIGN_STYLE;
}

function normalizeNavigationOrder(value: unknown): NavigationItemId[] {
  const allowed = new Set<NavigationItemId>(DEFAULT_NAVIGATION_ORDER);
  const seen = new Set<NavigationItemId>();
  const ordered = Array.isArray(value)
    ? value.flatMap((item) => {
        if (typeof item !== "string" || !allowed.has(item as NavigationItemId)) return [];
        const id = item as NavigationItemId;
        if (seen.has(id)) return [];
        seen.add(id);
        return [id];
      })
    : [];
  return [...ordered, ...DEFAULT_NAVIGATION_ORDER.filter((id) => !seen.has(id))];
}

function normalizePageTitles(value: unknown, goalObjective = ""): PageTitles {
  const candidate = value && typeof value === "object"
    ? value as Partial<Record<keyof PageTitles, unknown>>
    : {};
  return Object.fromEntries(Object.entries(DEFAULT_PAGE_TITLES).map(([key, fallback]) => {
    const title = candidate[key as keyof PageTitles];
    const migratedFallback = key === "goals" && goalObjective.trim() ? goalObjective.trim() : fallback;
    return [key, typeof title === "string" && title.trim() ? title : migratedFallback];
  })) as PageTitles;
}

function normalizeInspirationCards(value: unknown): InspirationCard[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  return value.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Partial<InspirationCard>;
    const text = typeof candidate.text === "string" ? candidate.text.trim() : "";
    if (!text) return [];
    const id = typeof candidate.id === "string" && candidate.id
      ? candidate.id
      : `migrated-inspiration-${index}`;
    if (ids.has(id)) return [];
    ids.add(id);
    const createdAt = typeof candidate.createdAt === "string" && candidate.createdAt
      ? candidate.createdAt
      : "1970-01-01T00:00:00.000Z";
    return [{
      id,
      text,
      createdAt,
      updatedAt: typeof candidate.updatedAt === "string" && candidate.updatedAt
        ? candidate.updatedAt
        : createdAt,
      convertedContentIds: Array.isArray(candidate.convertedContentIds)
        ? candidate.convertedContentIds.filter((contentId): contentId is string => typeof contentId === "string")
        : [],
    }];
  });
}

function normalizeReviewDays(value: unknown): ReviewDay[] {
  return Array.isArray(value)
    ? value.flatMap((item, index) => {
        if (!item || typeof item !== "object") return [];
        const candidate = item as Partial<ReviewDay>;
        if (typeof candidate.plannedDate !== "string" || !candidate.plannedDate) return [];
        return [{
          id: typeof candidate.id === "string" && candidate.id ? candidate.id : `migrated-review-day-${candidate.plannedDate}-${index}`,
          plannedDate: candidate.plannedDate,
          note: typeof candidate.note === "string" ? candidate.note : "",
          createdAt: typeof candidate.createdAt === "string" && candidate.createdAt
            ? candidate.createdAt
            : `${candidate.plannedDate}T12:00:00.000Z`,
        }];
      })
    : [];
}

function normalizeLiveSessions(value: unknown): LiveSession[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Partial<LiveSession>;
    if (typeof candidate.plannedDate !== "string" || !candidate.plannedDate) return [];
    const createdAt = typeof candidate.createdAt === "string" && candidate.createdAt
      ? candidate.createdAt
      : `${candidate.plannedDate}T12:00:00.000Z`;
    return [{
      id: typeof candidate.id === "string" && candidate.id ? candidate.id : `migrated-live-${candidate.plannedDate}-${index}`,
      title: typeof candidate.title === "string" && candidate.title.trim() ? candidate.title.trim() : "未命名直播",
      plannedDate: candidate.plannedDate,
      startTime: typeof candidate.startTime === "string" ? candidate.startTime : "",
      endTime: typeof candidate.endTime === "string" ? candidate.endTime : "",
      platform: typeof candidate.platform === "string" ? candidate.platform : "",
      content: typeof candidate.content === "string" ? candidate.content : "",
      createdAt,
      updatedAt: typeof candidate.updatedAt === "string" && candidate.updatedAt ? candidate.updatedAt : createdAt,
    }];
  });
}

function normalizeScheduleObjectTypes(value: unknown): ScheduleObjectType[] {
  const names = new Set<string>();
  const ids = new Set<string>();
  const systemKinds = new Set<string>();
  const normalized = (Array.isArray(value) ? value : []).flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Partial<ScheduleObjectType>;
    const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
    const id = typeof candidate.id === "string" && candidate.id ? candidate.id : `migrated-schedule-type-${index}`;
    const kind = candidate.kind === "review" || candidate.kind === "live" || candidate.kind === "custom"
      ? candidate.kind
      : "custom";
    if (
      !name
      || names.has(name.toLocaleLowerCase())
      || ids.has(id)
      || (kind !== "custom" && systemKinds.has(kind))
    ) return [];
    names.add(name.toLocaleLowerCase());
    ids.add(id);
    if (kind !== "custom") systemKinds.add(kind);
    const createdAt = typeof candidate.createdAt === "string" && candidate.createdAt
      ? candidate.createdAt
      : "1970-01-01T00:00:00.000Z";
    return [{
      id,
      kind,
      name,
      description: typeof candidate.description === "string" ? candidate.description.trim() : "",
      color: typeof candidate.color === "string" && /^#[0-9a-f]{6}$/i.test(candidate.color)
        ? candidate.color.toUpperCase()
        : "#6C7A72",
      archived: candidate.archived === true,
      createdAt,
    }];
  });
  const missingDefaults = DEFAULT_SCHEDULE_OBJECT_TYPES
    .filter((defaultType) => !normalized.some((item) => item.kind === defaultType.kind))
    .map((item) => ({ ...item }));
  return [...missingDefaults, ...normalized];
}

function normalizeScheduleObjects(value: unknown, types: ScheduleObjectType[]): ScheduleObject[] {
  if (!Array.isArray(value)) return [];
  const typeIds = new Set(types.map((item) => item.id));
  return value.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Partial<ScheduleObject>;
    if (
      typeof candidate.typeId !== "string"
      || !typeIds.has(candidate.typeId)
      || typeof candidate.plannedDate !== "string"
      || !candidate.plannedDate
    ) return [];
    const createdAt = typeof candidate.createdAt === "string" && candidate.createdAt
      ? candidate.createdAt
      : `${candidate.plannedDate}T12:00:00.000Z`;
    const type = types.find((item) => item.id === candidate.typeId);
    return [{
      id: typeof candidate.id === "string" && candidate.id ? candidate.id : `migrated-schedule-object-${candidate.plannedDate}-${index}`,
      typeId: candidate.typeId,
      title: typeof candidate.title === "string" && candidate.title.trim() ? candidate.title.trim() : type?.name || "未命名日程",
      plannedDate: candidate.plannedDate,
      startTime: typeof candidate.startTime === "string" ? candidate.startTime : "",
      endTime: typeof candidate.endTime === "string" ? candidate.endTime : "",
      details: typeof candidate.details === "string" ? candidate.details.trim() : "",
      createdAt,
      updatedAt: typeof candidate.updatedAt === "string" && candidate.updatedAt ? candidate.updatedAt : createdAt,
    }];
  });
}

function normalizeContentStage(item: LegacyContentItem): ContentStage {
  if (item.stage !== "production") return item.stage;
  return item.productionState === "editing" || item.productionState === "ready_to_publish"
    ? "editing"
    : "recording";
}

function normalizeEventStage(stage: string): StageEvent["stage"] {
  if (stage === "production") return "recording";
  if (stage === "archived") return "review";
  if (["inbox", "topic", "script", "recording", "editing", "publishing", "review"].includes(stage)) {
    return stage as StageEvent["stage"];
  }
  return "inbox";
}

function normalizeReview(value: LegacyReview | undefined): ContentItem["review"] {
  const rating = Number(value?.rating);
  const analysis = typeof value?.analysis === "string" ? value.analysis.trim() : "";
  const legacyNotes = [
    typeof value?.selfJudgment === "string" ? value.selfJudgment.trim() : "",
    typeof value?.audienceSignal === "string" && value.audienceSignal.trim()
      ? `评论信号：${value.audienceSignal.trim()}`
      : "",
    value?.diagnosis && value.diagnosis !== "未判断"
      ? `旧版判断：${value.diagnosis}${value.nextAction && value.nextAction !== "待决定" ? ` · ${value.nextAction}` : ""}`
      : value?.nextAction && value.nextAction !== "待决定"
        ? `旧版判断：${value.nextAction}`
        : "",
  ].filter(Boolean);
  return {
    rating: Number.isFinite(rating) ? Math.max(0, Math.min(5, Math.round(rating))) : 0,
    analysis: analysis || legacyNotes.join("\n\n"),
    learnedRule: typeof value?.learnedRule === "string" ? value.learnedRule : "",
    completedAt: typeof value?.completedAt === "string" ? value.completedAt : "",
  };
}

function normalizeContent(item: LegacyContentItem): ContentItem {
  const normalized = {
    ...item,
    stage: normalizeContentStage(item),
    publicationStatus: item.publicationStatus === "published"
      ? "published"
      : item.targetPublishAt
        ? "scheduled"
        : item.publicationStatus,
    recordingNotes: item.recordingNotes || item.productionNotes || "",
    editingNotes: item.editingNotes || item.productionNotes || "",
    review: normalizeReview(item.review),
  } as Record<string, unknown>;
  delete normalized.productionState;
  delete normalized.productionNotes;
  delete normalized.todayRank;
  delete normalized.todayPlanDate;
  delete normalized.todayCompletedAt;
  delete normalized.weeklyPlanId;
  delete normalized.targetPublishAt;
  delete normalized.reviewDueAt;
  return normalized as unknown as ContentItem;
}

function buildStageEvents(workspace: LegacyWorkspace, contents: ContentItem[]) {
  const events: StageEvent[] = [];
  const keys = new Set<string>();
  const add = (event: StageEvent) => {
    const key = `${event.contentId}:${event.stage}:${event.plannedDate}`;
    if (event.stage === "inbox" || !event.plannedDate || keys.has(key)) return;
    keys.add(key);
    events.push(event);
  };

  for (const event of workspace.stageEvents ?? []) {
    add({
      ...event,
      stage: normalizeEventStage(String(event.stage)),
      rank: Number.isFinite(event.rank) ? event.rank : 0,
      completedAt: event.completedAt ?? "",
    });
  }

  for (const legacy of workspace.contents) {
    const content = contents.find((item) => item.id === legacy.id);
    if (!content) continue;
    if (legacy.todayRank !== null && legacy.todayRank !== undefined && legacy.todayPlanDate) {
      add({
        id: `migrated-today-${legacy.id}-${legacy.todayPlanDate}`,
        contentId: legacy.id,
        stage: content.stage === "archived" ? "review" : content.stage,
        plannedDate: legacy.todayPlanDate,
        rank: legacy.todayRank,
        completedAt: legacy.todayCompletedAt ?? "",
      });
    }
    if (content.publicationStatus === "published" && content.publishedAt) {
      add({
        id: `migrated-publish-${content.id}-${content.publishedAt}`,
        contentId: content.id,
        stage: "publishing",
        plannedDate: content.publishedAt,
        rank: 0,
        completedAt: `${content.publishedAt}T12:00:00.000Z`,
      });
    } else if (legacy.targetPublishAt) {
      add({
        id: `migrated-publish-plan-${content.id}-${legacy.targetPublishAt}`,
        contentId: content.id,
        stage: "publishing",
        plannedDate: legacy.targetPublishAt,
        rank: 0,
        completedAt: "",
      });
    }
    if ((content.stage === "review" || content.stage === "archived") && legacy.reviewDueAt) {
      const reviewCompleted = content.stage === "archived";
      add({
        id: `migrated-review-${content.id}-${legacy.reviewDueAt}`,
        contentId: content.id,
        stage: "review",
        plannedDate: legacy.reviewDueAt,
        rank: 0,
        completedAt: reviewCompleted
          ? `${content.metrics.capturedAt || legacy.reviewDueAt}T12:00:00.000Z`
          : "",
      });
    }
  }
  return events;
}

export function migrateWorkspace(value: unknown): WorkspaceState | null {
  if (!validateImport(value)) return null;
  const legacy = value as unknown as LegacyWorkspace;
  const contents = legacy.contents.map(normalizeContent);
  const legacyStageEvents = buildStageEvents(legacy, contents);
  const scheduleObjectTypes = normalizeScheduleObjectTypes(legacy.scheduleObjectTypes);
  const reviewedContents = contents.map((content) => {
    if (content.review.completedAt || content.publicationStatus !== "published") return content;
    const completedReview = legacyStageEvents.find(
      (event) => event.contentId === content.id && event.stage === "review" && Boolean(event.completedAt),
    );
    if (!completedReview && content.stage !== "archived") return content;
    const completedAt = completedReview?.completedAt
      || `${content.metrics.capturedAt || content.updatedAt || content.publishedAt}T12:00:00.000Z`;
    return { ...content, review: { ...content.review, completedAt } };
  });
  return {
    schemaVersion: 16,
    designStyle: normalizeDesignStyle(legacy.designStyle),
    navigationOrder: normalizeNavigationOrder(legacy.navigationOrder),
    profile: normalizeCreatorProfile(legacy.profile),
    pageTitles: normalizePageTitles(legacy.pageTitles, legacy.goal.objective),
    setupComplete: legacy.setupComplete ?? true,
    lastBackupAt: legacy.lastBackupAt ?? "",
    inspirationCards: normalizeInspirationCards(legacy.inspirationCards),
    contents: reviewedContents,
    stageEvents: legacyStageEvents.filter((event) => event.stage !== "review"),
    reviewDays: normalizeReviewDays(legacy.reviewDays),
    liveSessions: normalizeLiveSessions(legacy.liveSessions),
    scheduleObjectTypes,
    scheduleObjects: normalizeScheduleObjects(legacy.scheduleObjects, scheduleObjectTypes),
    stageColors: normalizeStageColors(legacy.stageColors),
    goal: legacy.goal,
    goalHistory: legacy.goalHistory ?? [],
    followerSnapshots: legacy.followerSnapshots ?? [],
    insightRules: legacy.insightRules ?? [],
    contentTypes: legacy.contentTypes ?? [],
  };
}

export function mergeWorkspace(current: WorkspaceState, incoming: WorkspaceState): WorkspaceState {
  const mergeById = <T extends { id: string }>(left: T[], right: T[]) => {
    const map = new Map(left.map((item) => [item.id, item]));
    right.forEach((item) => map.set(item.id, item));
    return Array.from(map.values());
  };
  return {
    ...current,
    schemaVersion: 16,
    inspirationCards: mergeById(current.inspirationCards, incoming.inspirationCards),
    contents: mergeById(current.contents, incoming.contents),
    stageEvents: mergeById(current.stageEvents, incoming.stageEvents),
    reviewDays: mergeById(current.reviewDays, incoming.reviewDays),
    liveSessions: mergeById(current.liveSessions, incoming.liveSessions),
    scheduleObjectTypes: mergeById(current.scheduleObjectTypes, incoming.scheduleObjectTypes),
    scheduleObjects: mergeById(current.scheduleObjects, incoming.scheduleObjects),
    stageColors: normalizeStageColors({ ...current.stageColors, ...incoming.stageColors }),
    goalHistory: mergeById(current.goalHistory ?? [], incoming.goalHistory ?? []),
    followerSnapshots: mergeById(current.followerSnapshots, incoming.followerSnapshots),
    insightRules: mergeById(current.insightRules, incoming.insightRules),
    contentTypes: Array.from(new Set([...current.contentTypes, ...incoming.contentTypes])),
  };
}
