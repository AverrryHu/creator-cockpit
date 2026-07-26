export type ContentStage =
  | "inbox"
  | "topic"
  | "script"
  | "recording"
  | "editing"
  | "publishing"
  | "review"
  | "archived";

export type WorkStage = Exclude<ContentStage, "archived">;
export type ContentTier = "A" | "B" | "C";
export type QualityMetric =
  | "views"
  | "likeRate"
  | "saveRate"
  | "commentRate"
  | "followerGain";
export interface TopicCard {
  audience: string;
  painPoint: string;
  pointOfView: string;
  commonAngle: string;
  contrastAngle: string;
  assets: string;
  minimumProduction: string;
  score: {
    audience: number;
    pain: number;
    scene: number;
    demonstrable: number;
    distribution: number;
    efficiency: number;
  };
}

export interface ScriptDraft {
  headline: string;
  hook: string;
  conclusion: string;
  body: string;
  example: string;
  ending: string;
}

export interface MetricsSnapshot {
  views: number;
  likes: number;
  saves: number;
  comments: number;
  followerGain: number;
  capturedAt: string;
}

export interface Review {
  rating: number;
  analysis: string;
  learnedRule: string;
  completedAt: string;
}

export interface ContentItem {
  id: string;
  title: string;
  idea: string;
  contentType: string;
  tier: ContentTier;
  stage: ContentStage;
  publicationStatus: "draft" | "scheduled" | "published";
  priority: "high" | "normal" | "low";
  tags: string[];
  createdAt: string;
  updatedAt: string;
  publishedAt: string;
  xhsLink: string;
  coverCopy: string;
  publishCopy: string;
  topic: TopicCard;
  script: ScriptDraft;
  recordingNotes: string;
  editingNotes: string;
  metrics: MetricsSnapshot;
  review: Review;
}

export interface StageEvent {
  id: string;
  contentId: string;
  stage: WorkStage;
  plannedDate: string;
  rank: number;
  completedAt: string;
}

export interface ReviewDay {
  id: string;
  plannedDate: string;
  note: string;
  createdAt: string;
}

export interface LiveSession {
  id: string;
  title: string;
  plannedDate: string;
  startTime: string;
  endTime: string;
  platform: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export type ScheduleObjectKind = "review" | "live" | "custom";

export interface ScheduleObjectType {
  id: string;
  kind: ScheduleObjectKind;
  name: string;
  description: string;
  color: string;
  archived: boolean;
  createdAt: string;
}

export const DEFAULT_SCHEDULE_OBJECT_TYPES: ScheduleObjectType[] = [
  {
    id: "schedule-type-review",
    kind: "review",
    name: "复盘",
    description: "集中查看全部待复盘内容",
    color: "#82637E",
    archived: false,
    createdAt: "1970-01-01T00:00:00.000Z",
  },
  {
    id: "schedule-type-live",
    kind: "live",
    name: "直播",
    description: "安排主题与直播内容",
    color: "#B45A3C",
    archived: false,
    createdAt: "1970-01-01T00:00:00.000Z",
  },
];

export interface ScheduleObject {
  id: string;
  typeId: string;
  title: string;
  plannedDate: string;
  startTime: string;
  endTime: string;
  details: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContentQuota {
  contentType: string;
  target: number;
}

export interface GoalCycle {
  id: string;
  objective: string;
  startDate: string;
  endDate: string;
  status: "active" | "archived";
  outputTarget: number;
  quotas: ContentQuota[];
  followerStart: number;
  followerTarget: number;
  qualityMetric: QualityMetric;
  qualityThreshold: number;
  qualityTarget: number;
}

export interface FollowerSnapshot {
  id: string;
  date: string;
  followers: number;
}

export interface InsightRule {
  id: string;
  text: string;
  sourceContentId: string | null;
  createdAt: string;
  active: boolean;
}

export interface CreatorProfile {
  creatorName: string;
  dashboardTitle: string;
  primaryPlatform: string;
  contentFocus: string;
}

export type PageTitleKey =
  | "today"
  | "week"
  | "schedule"
  | "pipeline"
  | "goals"
  | "review"
  | "settings";

export type PageTitles = Record<PageTitleKey, string>;

export interface WorkspaceState {
  schemaVersion: 13;
  profile: CreatorProfile;
  pageTitles: PageTitles;
  contents: ContentItem[];
  stageEvents: StageEvent[];
  reviewDays: ReviewDay[];
  liveSessions: LiveSession[];
  scheduleObjectTypes: ScheduleObjectType[];
  scheduleObjects: ScheduleObject[];
  stageColors: Record<ContentStage, string>;
  goal: GoalCycle;
  goalHistory: GoalCycle[];
  followerSnapshots: FollowerSnapshot[];
  insightRules: InsightRule[];
  contentTypes: string[];
  setupComplete: boolean;
  lastBackupAt: string;
}

export interface GoalHealth {
  timeProgress: number;
  outputProgress: number;
  followerProgress: number;
  qualityProgress: number;
  overallProgress: number;
  status: "setting_up" | "ahead" | "on_track" | "at_risk" | "behind";
  weeksRemaining: number;
  outputRemaining: number;
  outputPerWeek: number;
  followerRemaining: number;
  followersPerWeek: number;
  pipelineCoverage: number;
  biggestRisk: string;
  recommendation: string;
}

export const STAGE_LABELS: Record<ContentStage, string> = {
  inbox: "灵感",
  topic: "大纲",
  script: "脚本",
  recording: "录制",
  editing: "剪辑",
  publishing: "发布",
  review: "复盘",
  archived: "归档",
};

export const NEXT_ACTIONS: Record<ContentStage, string> = {
  inbox: "转成大纲卡",
  topic: "确认角度与档位",
  script: "完成脚本骨架",
  recording: "完成录制",
  editing: "完成剪辑",
  publishing: "完善发布信息",
  review: "录入数据并复盘",
  archived: "已完成",
};

export const CONTENT_STAGES: ContentStage[] = [
  "inbox",
  "topic",
  "script",
  "recording",
  "editing",
  "publishing",
  "review",
  "archived",
];

export const WORK_STAGES: WorkStage[] = [
  "inbox",
  "topic",
  "script",
  "recording",
  "editing",
  "publishing",
  "review",
];

export const SCHEDULABLE_STAGES: WorkStage[] = [
  "topic",
  "script",
  "recording",
  "editing",
  "publishing",
];

export const DEFAULT_CREATOR_PROFILE: CreatorProfile = {
  creatorName: "示例创作者",
  dashboardTitle: "示例创作者的内容工作台",
  primaryPlatform: "小红书",
  contentFocus: "内容创作与效率工具",
};

export const DEFAULT_PAGE_TITLES: PageTitles = {
  today: "今天，只完成已经排好的阶段",
  week: "看清这一周，要把哪些内容推到哪里",
  schedule: "把内容的每个阶段，放进真实档期",
  pipeline: "让每条内容都走到发布与反馈",
  goals: "看清这阶段，离目标还有多远",
  review: "让每次发布，都留下下一次能用的判断",
  settings: "设置与备份",
};

export const DEFAULT_STAGE_COLORS: Record<ContentStage, string> = {
  inbox: "#8C8172",
  topic: "#B1843D",
  script: "#6F7653",
  recording: "#4F7C83",
  editing: "#607A9A",
  publishing: "#BD5D3D",
  review: "#82637E",
  archived: "#7C7D76",
};

export const DEFAULT_CONTENT_TYPES = [
  "AI 产品实测",
  "AI 工作流 / 教程",
  "Vibe Coding 作品",
  "AI 热点观点",
  "商业内容",
];

export const QUALITY_LABELS: Record<QualityMetric, string> = {
  views: "播放量",
  likeRate: "点赞率",
  saveRate: "收藏率",
  commentRate: "评论率",
  followerGain: "单条涨粉",
};
