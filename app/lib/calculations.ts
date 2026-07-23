import type {
  ContentItem,
  GoalCycle,
  GoalHealth,
  QualityMetric,
} from "./model";

const DAY = 86_400_000;
const SHANGHAI_DATE_FORMATTER = new Intl.DateTimeFormat("en", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : 0));
}

export function parseDate(value: string) {
  return value ? new Date(`${value}T12:00:00`) : new Date(Number.NaN);
}

export function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function todayISO() {
  return dateISOInShanghai(new Date());
}

export function dateISOInShanghai(date: Date) {
  const parts = Object.fromEntries(SHANGHAI_DATE_FORMATTER.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function startOfWeekISO(date = new Date()) {
  const next = parseDate(dateISOInShanghai(date));
  const day = next.getDay() || 7;
  next.setDate(next.getDate() - day + 1);
  return isoDate(next);
}

export function endOfWeekISO(weekStart: string) {
  const end = parseDate(weekStart);
  end.setDate(end.getDate() + 6);
  return isoDate(end);
}

export function isWithin(date: string, start: string, end: string) {
  if (!date) return false;
  return date >= start && date <= end;
}

export function publishedWithin(
  contents: ContentItem[],
  start: string,
  end: string,
) {
  return contents.filter(
    (item) => item.publicationStatus === "published" && isWithin(item.publishedAt, start, end),
  );
}

export function metricValue(item: ContentItem, metric: QualityMetric) {
  const { metrics } = item;
  if (metric === "views") return metrics.views;
  if (metric === "followerGain") return metrics.followerGain;
  if (!metrics.views) return 0;
  if (metric === "likeRate") return (metrics.likes / metrics.views) * 100;
  if (metric === "saveRate") return (metrics.saves / metrics.views) * 100;
  return (metrics.comments / metrics.views) * 100;
}

export function t3Date(publishedAt: string) {
  if (!publishedAt) return "";
  const due = parseDate(publishedAt);
  due.setDate(due.getDate() + 3);
  return isoDate(due);
}

export function isQualityQualified(item: ContentItem, goal: GoalCycle) {
  return Boolean(
    item.metrics.capturedAt &&
    item.metrics.capturedAt >= t3Date(item.publishedAt) &&
    metricValue(item, goal.qualityMetric) >= goal.qualityThreshold,
  );
}

export function qualifiedContents(contents: ContentItem[], goal: GoalCycle) {
  return publishedWithin(contents, goal.startDate, goal.endDate).filter(
    (item) => isQualityQualified(item, goal),
  );
}

export function currentFollowers(
  goal: GoalCycle,
  snapshots: { date: string; followers: number }[],
) {
  const eligible = snapshots
    .filter((item) => item.date >= goal.startDate && item.date <= goal.endDate)
    .sort((a, b) => a.date.localeCompare(b.date));
  return eligible.at(-1)?.followers ?? goal.followerStart;
}

export function calculateGoalHealth(
  goal: GoalCycle,
  contents: ContentItem[],
  snapshots: { date: string; followers: number }[],
  now = new Date(),
): GoalHealth {
  const start = parseDate(goal.startDate);
  const end = parseDate(goal.endDate);
  const current = parseDate(isoDate(now));
  const totalDays = Math.max(1, (end.getTime() - start.getTime()) / DAY + 1);
  const elapsedDays = Math.max(0, Math.min(totalDays, (current.getTime() - start.getTime()) / DAY + 1));
  const timeProgress = clamp(elapsedDays / totalDays);
  const published = publishedWithin(contents, goal.startDate, goal.endDate);
  const qualified = qualifiedContents(contents, goal);
  const followers = currentFollowers(goal, snapshots);
  const followerDeltaTarget = Math.max(1, goal.followerTarget - goal.followerStart);

  const outputProgress = clamp(published.length / Math.max(1, goal.outputTarget));
  const followerProgress = clamp((followers - goal.followerStart) / followerDeltaTarget);
  const qualityProgress = clamp(qualified.length / Math.max(1, goal.qualityTarget));
  const overallProgress = (outputProgress + followerProgress + qualityProgress) / 3;
  const paceRatio = timeProgress > 0 ? overallProgress / timeProgress : 1;
  const firstThreeDays = elapsedDays <= 3;
  let status: GoalHealth["status"] = "setting_up";
  if (!firstThreeDays) {
    if (paceRatio >= 1.1) status = "ahead";
    else if (paceRatio >= 0.85) status = "on_track";
    else if (paceRatio >= 0.65) status = "at_risk";
    else status = "behind";
  }

  const weeksRemaining = Math.max(1, Math.ceil((end.getTime() - current.getTime() + DAY) / DAY / 7));
  const outputRemaining = Math.max(0, goal.outputTarget - published.length);
  const followerRemaining = Math.max(0, goal.followerTarget - followers);
  const pipeline = contents.filter(
    (item) =>
      item.stage !== "inbox" &&
      item.stage !== "archived" &&
      item.publicationStatus !== "published",
  ).length;
  const expectedNextTwoWeeks = Math.max(1, Math.ceil((outputRemaining / weeksRemaining) * 2));
  const pipelineCoverage = clamp(pipeline / expectedNextTwoWeeks);

  const gaps = [
    { key: "产出", value: outputProgress },
    { key: "涨粉", value: followerProgress },
    { key: "质量", value: qualityProgress },
  ].sort((a, b) => a.value - b.value);
  const biggestRisk = gaps[0]?.key ?? "产出";
  const recommendations: Record<string, string> = {
    产出: `未来每周至少发布 ${Math.ceil(outputRemaining / weeksRemaining)} 条，先补足 B/C 档常规产能。`,
    涨粉: `每周需要净增约 ${Math.ceil(followerRemaining / weeksRemaining)} 人，优先延展高收藏内容。`,
    质量: `还需 ${Math.max(0, goal.qualityTarget - qualified.length)} 条达标内容，把有效选题升级成系列。`,
  };

  return {
    timeProgress,
    outputProgress,
    followerProgress,
    qualityProgress,
    overallProgress,
    status,
    weeksRemaining,
    outputRemaining,
    outputPerWeek: Math.ceil(outputRemaining / weeksRemaining),
    followerRemaining,
    followersPerWeek: Math.ceil(followerRemaining / weeksRemaining),
    pipelineCoverage,
    biggestRisk,
    recommendation: recommendations[biggestRisk],
  };
}

export function monthKey(date = new Date()) {
  return dateISOInShanghai(date).slice(0, 7);
}

export function percent(value: number) {
  return `${Math.round(clamp(value) * 100)}%`;
}

export function formatMetric(value: number, digits = 0) {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: digits }).format(value || 0);
}
