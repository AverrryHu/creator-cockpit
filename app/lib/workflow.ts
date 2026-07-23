import {
  CONTENT_STAGES,
  SCHEDULABLE_STAGES,
  WORK_STAGES,
  type ContentItem,
  type ContentStage,
  type StageEvent,
  type WorkStage,
  type WorkspaceState,
} from "./model.ts";

const PUBLISH_PROGRESS: Record<ContentStage, number> = {
  inbox: 0.05,
  topic: 0.15,
  script: 0.3,
  recording: 0.5,
  editing: 0.7,
  publishing: 0.85,
  review: 0.95,
  archived: 1,
};

export function stageProgress(stage: ContentStage) {
  return PUBLISH_PROGRESS[stage];
}

export function nextContentStage(stage: ContentStage): ContentStage {
  const index = CONTENT_STAGES.indexOf(stage);
  return CONTENT_STAGES[Math.min(CONTENT_STAGES.length - 1, index + 1)] ?? stage;
}

export function stageIndex(stage: ContentStage) {
  return CONTENT_STAGES.indexOf(stage);
}

export function canScheduleStage(
  state: WorkspaceState,
  contentId: string,
  stage: WorkStage,
  plannedDate: string,
) {
  const content = state.contents.find((item) => item.id === contentId);
  if (!content || content.stage === "archived" || !SCHEDULABLE_STAGES.includes(stage) || !plannedDate) return false;
  if (stageIndex(content.stage) > stageIndex(stage)) return false;
  return !state.stageEvents.some((event) => {
    if (event.contentId !== contentId || event.completedAt || event.stage === stage) return false;
    const eventIndex = stageIndex(event.stage);
    const targetIndex = stageIndex(stage);
    return (
      (eventIndex < targetIndex && event.plannedDate > plannedDate) ||
      (eventIndex > targetIndex && event.plannedDate < plannedDate)
    );
  });
}

export function sortStageEvents(events: StageEvent[]) {
  return [...events].sort(
    (a, b) =>
      Number(Boolean(a.completedAt)) - Number(Boolean(b.completedAt)) ||
      a.rank - b.rank,
  );
}

export function scheduleStageForDate(
  state: WorkspaceState,
  contentId: string,
  stage: WorkStage,
  plannedDate: string,
): WorkspaceState {
  const content = state.contents.find((item) => item.id === contentId);
  if (!content || !canScheduleStage(state, contentId, stage, plannedDate)) return state;
  const nextRank =
    Math.max(
      0,
      ...state.stageEvents
        .filter((event) => event.plannedDate === plannedDate)
        .map((event) => event.rank),
    ) + 1;
  const openEvent = state.stageEvents.find(
    (event) =>
      event.contentId === contentId &&
      event.stage === stage &&
      !event.completedAt,
  );
  const stageEvents = openEvent
    ? state.stageEvents.map((event) =>
        event.id === openEvent.id
          ? { ...event, stage, plannedDate, rank: nextRank }
          : event,
      )
    : [
        ...state.stageEvents,
        {
          id: crypto.randomUUID(),
          contentId,
          stage,
          plannedDate,
          rank: nextRank,
          completedAt: "",
        },
      ];
  return {
    ...state,
    contents: stage === "publishing" && content.publicationStatus !== "published"
      ? state.contents.map((item) =>
          item.id === contentId ? { ...item, publicationStatus: "scheduled" } : item,
        )
      : state.contents,
    stageEvents,
  };
}

export function scheduleContentForDate(
  state: WorkspaceState,
  contentId: string,
  plannedDate: string,
): WorkspaceState {
  const content = state.contents.find((item) => item.id === contentId);
  if (!content || content.stage === "archived" || content.stage === "inbox") return state;
  return scheduleStageForDate(state, contentId, content.stage, plannedDate);
}

export function moveStageEventToDate(
  state: WorkspaceState,
  eventId: string,
  plannedDate: string,
): WorkspaceState {
  const moving = state.stageEvents.find((event) => event.id === eventId);
  if (!moving || !plannedDate) return state;
  if (!moving.completedAt && !canScheduleStage(state, moving.contentId, moving.stage, plannedDate)) return state;
  const nextRank = Math.max(
    0,
    ...state.stageEvents.filter((event) => event.plannedDate === plannedDate && event.id !== eventId).map((event) => event.rank),
  ) + 1;
  const stageEvents = state.stageEvents.map((event) =>
    event.id === eventId ? { ...event, plannedDate, rank: nextRank } : event,
  );
  return {
    ...state,
    contents: state.contents.map((content) => {
      if (content.id !== moving.contentId) return content;
      if (moving.stage === "publishing" && moving.completedAt) {
        return { ...content, publishedAt: plannedDate, updatedAt: plannedDate };
      }
      return { ...content, updatedAt: plannedDate };
    }),
    stageEvents,
  };
}

export function moveStageEvent(
  state: WorkspaceState,
  eventId: string,
  direction: -1 | 1,
): WorkspaceState {
  const event = state.stageEvents.find((item) => item.id === eventId);
  if (!event || event.completedAt) return state;
  const active = sortStageEvents(
    state.stageEvents.filter(
      (item) => item.plannedDate === event.plannedDate && !item.completedAt,
    ),
  );
  const index = active.findIndex((item) => item.id === eventId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= active.length) return state;
  const swap = active[target];
  return {
    ...state,
    stageEvents: state.stageEvents.map((item) =>
      item.id === event.id
        ? { ...item, rank: swap.rank }
        : item.id === swap.id
          ? { ...item, rank: event.rank }
          : item,
    ),
  };
}

export function removeStageEvent(state: WorkspaceState, eventId: string): WorkspaceState {
  const removing = state.stageEvents.find((event) => event.id === eventId);
  const remaining = state.stageEvents.filter((event) => event.id !== eventId);
  return {
    ...state,
    contents: removing?.stage === "publishing" &&
      !removing.completedAt &&
      !remaining.some(
        (event) =>
          event.contentId === removing.contentId &&
          event.stage === "publishing" &&
          !event.completedAt,
      )
      ? state.contents.map((item) =>
          item.id === removing.contentId && item.publicationStatus !== "published"
            ? { ...item, publicationStatus: "draft" }
            : item,
        )
      : state.contents,
    stageEvents: remaining,
  };
}

export function toggleStageEvent(
  state: WorkspaceState,
  eventId: string,
  completedAt: string,
): WorkspaceState {
  const event = state.stageEvents.find((item) => item.id === eventId);
  const content = state.contents.find((item) => item.id === event?.contentId);
  if (!event || !content) return state;
  const undoing = Boolean(event.completedAt);
  const nextStage = nextContentStage(event.stage);
  const hasLaterCompletion = state.stageEvents.some(
    (item) =>
      item.contentId === content.id &&
      item.id !== event.id &&
      Boolean(item.completedAt) &&
      stageIndex(item.stage) > stageIndex(event.stage),
  );
  const contents = state.contents.map((item) => {
    if (item.id !== content.id) return item;
    if (undoing) {
      return !hasLaterCompletion && item.stage === nextStage
        ? { ...item, stage: event.stage, updatedAt: event.plannedDate }
        : item;
    }
    return {
      ...item,
      stage: nextStage,
      updatedAt: event.plannedDate,
    };
  });
  const stageEvents = state.stageEvents.map((item) =>
      item.id === eventId
        ? { ...item, completedAt: undoing ? "" : completedAt }
        : item,
    );
  return { ...state, contents, stageEvents };
}

export function transitionContentStage(
  state: WorkspaceState,
  contentId: string,
  stage: ContentStage,
  transitionDate: string,
): WorkspaceState {
  const content = state.contents.find((item) => item.id === contentId);
  if (!content || content.stage === stage) return state;
  const movingForward = stageIndex(stage) > stageIndex(content.stage);
  const oldStage = content.stage;
  let stageEvents = state.stageEvents;

  if (movingForward && oldStage !== "archived") {
    const crossedStages = WORK_STAGES.slice(
      WORK_STAGES.indexOf(oldStage),
      Math.min(stageIndex(stage), WORK_STAGES.length),
    ).filter((crossedStage) => SCHEDULABLE_STAGES.includes(crossedStage));
    for (const crossedStage of crossedStages) {
      const openEvent = stageEvents.find(
        (event) =>
          event.contentId === contentId &&
          event.stage === crossedStage &&
          !event.completedAt,
      );
      if (openEvent) {
        stageEvents = stageEvents.map((event) =>
          event.id === openEvent.id
            ? { ...event, plannedDate: transitionDate, completedAt: new Date().toISOString() }
            : event,
        );
      } else if (
        !stageEvents.some(
          (event) =>
            event.contentId === contentId &&
            event.stage === crossedStage &&
            Boolean(event.completedAt),
        )
      ) {
        stageEvents = [
          ...stageEvents,
          {
            id: crypto.randomUUID(),
            contentId,
            stage: crossedStage,
            plannedDate: transitionDate,
            rank: 0,
            completedAt: new Date().toISOString(),
          },
        ];
      }
    }
  } else if (!movingForward && stage !== "archived") {
    stageEvents = stage === "inbox"
      ? stageEvents.filter((event) => event.contentId !== contentId || Boolean(event.completedAt))
      : stageEvents.map((event) =>
          event.contentId === contentId &&
          event.stage === oldStage &&
          !event.completedAt
            ? { ...event, stage }
            : event,
        );
  }

  return {
    ...state,
    contents: state.contents.map((item) =>
      item.id === contentId ? { ...item, stage, updatedAt: transitionDate } : item,
    ),
    stageEvents,
  };
}

export function setContentStageCompletion(
  state: WorkspaceState,
  contentId: string,
  stage: WorkStage,
  completed: boolean,
  transitionDate: string,
  completedAt: string,
): WorkspaceState {
  const content = state.contents.find((item) => item.id === contentId);
  if (!content) return state;
  const targetIndex = stageIndex(stage);
  const alreadyCompleted = content.stage === "archived" || stageIndex(content.stage) > targetIndex;
  if (alreadyCompleted === completed) return state;

  if (stage === "review") {
    return {
      ...state,
      contents: state.contents.map((item) => item.id === contentId ? {
        ...item,
        stage: completed ? "archived" : "review",
        metrics: completed && !item.metrics.capturedAt
          ? { ...item.metrics, capturedAt: transitionDate }
          : item.metrics,
        updatedAt: transitionDate,
      } : item),
    };
  }

  if (!completed) {
    const stageEvents = state.stageEvents.map((event) =>
      event.contentId === contentId &&
      stageIndex(event.stage) >= targetIndex &&
      event.completedAt
        ? { ...event, completedAt: "" }
        : event,
    );
    const publishingIsPending = stageEvents.some(
      (event) => event.contentId === contentId && event.stage === "publishing" && !event.completedAt,
    );
    return {
      ...state,
      contents: state.contents.map((item) => item.id === contentId ? {
        ...item,
        stage,
        publicationStatus: targetIndex <= stageIndex("publishing")
          ? publishingIsPending ? "scheduled" : "draft"
          : item.publicationStatus,
        publishedAt: targetIndex <= stageIndex("publishing") ? "" : item.publishedAt,
        updatedAt: transitionDate,
      } : item),
      stageEvents,
    };
  }

  let stageEvents = [...state.stageEvents];
  for (const completingStage of SCHEDULABLE_STAGES.filter((candidate) => stageIndex(candidate) <= targetIndex)) {
    const completedEvent = stageEvents.find(
      (event) => event.contentId === contentId && event.stage === completingStage && Boolean(event.completedAt),
    );
    if (completedEvent) continue;
    const openEvent = stageEvents.find(
      (event) => event.contentId === contentId && event.stage === completingStage && !event.completedAt,
    );
    if (openEvent) {
      stageEvents = stageEvents.map((event) =>
        event.id === openEvent.id ? { ...event, plannedDate: transitionDate, completedAt } : event,
      );
    } else {
      stageEvents.push({
        id: crypto.randomUUID(),
        contentId,
        stage: completingStage,
        plannedDate: transitionDate,
        rank: 0,
        completedAt,
      });
    }
  }

  const completesPublishing = targetIndex >= stageIndex("publishing");
  const completedPublishing = stageEvents.find(
    (event) => event.contentId === contentId && event.stage === "publishing" && Boolean(event.completedAt),
  );
  const publishedAt = completesPublishing
    ? content.publishedAt || completedPublishing?.plannedDate || transitionDate
    : content.publishedAt;
  return {
    ...state,
    contents: state.contents.map((item) => item.id === contentId ? {
      ...item,
      stage: nextContentStage(stage),
      publicationStatus: completesPublishing ? "published" : item.publicationStatus,
      publishedAt,
      metrics: item.metrics,
      updatedAt: transitionDate,
    } : item),
    stageEvents,
  };
}

export function completedPublishingEvents(
  state: WorkspaceState,
  item: ContentItem,
  completedAt: string,
): StageEvent[] {
  const publishing = state.stageEvents.find(
    (event) => event.contentId === item.id && event.stage === "publishing" && !event.completedAt,
  );
  return publishing
    ? state.stageEvents.map((event) =>
        event.id === publishing.id
          ? { ...event, plannedDate: item.publishedAt, completedAt }
          : event,
      )
    : [
        ...state.stageEvents,
        {
          id: crypto.randomUUID(),
          contentId: item.id,
          stage: "publishing" as const,
          plannedDate: item.publishedAt,
          rank: 0,
          completedAt,
        },
      ];
}
