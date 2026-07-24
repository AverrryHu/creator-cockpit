import type {
  LiveSession,
  ReviewDay,
  ScheduleObject,
  ScheduleObjectType,
  WorkspaceState,
} from "./model.ts";

export function addReviewDay(
  state: WorkspaceState,
  plannedDate: string,
  createdAt: string,
): WorkspaceState {
  if (!plannedDate) return state;
  const reviewDay: ReviewDay = {
    id: crypto.randomUUID(),
    plannedDate,
    note: "",
    createdAt,
  };
  return { ...state, reviewDays: [...state.reviewDays, reviewDay] };
}

export function moveReviewDay(
  state: WorkspaceState,
  reviewDayId: string,
  plannedDate: string,
): WorkspaceState {
  if (!plannedDate || !state.reviewDays.some((item) => item.id === reviewDayId)) return state;
  return {
    ...state,
    reviewDays: state.reviewDays.map((item) =>
      item.id === reviewDayId ? { ...item, plannedDate } : item,
    ),
  };
}

export function removeReviewDay(
  state: WorkspaceState,
  reviewDayId: string,
): WorkspaceState {
  return {
    ...state,
    reviewDays: state.reviewDays.filter((item) => item.id !== reviewDayId),
  };
}

export function saveLiveSession(
  state: WorkspaceState,
  session: LiveSession,
): WorkspaceState {
  if (!session.id || !session.plannedDate || !session.title.trim()) return state;
  const exists = state.liveSessions.some((item) => item.id === session.id);
  return {
    ...state,
    liveSessions: exists
      ? state.liveSessions.map((item) => item.id === session.id ? session : item)
      : [...state.liveSessions, session],
  };
}

export function moveLiveSession(
  state: WorkspaceState,
  liveSessionId: string,
  plannedDate: string,
  updatedAt: string,
): WorkspaceState {
  if (!plannedDate || !state.liveSessions.some((item) => item.id === liveSessionId)) return state;
  return {
    ...state,
    liveSessions: state.liveSessions.map((item) =>
      item.id === liveSessionId ? { ...item, plannedDate, updatedAt } : item,
    ),
  };
}

export function removeLiveSession(
  state: WorkspaceState,
  liveSessionId: string,
): WorkspaceState {
  return {
    ...state,
    liveSessions: state.liveSessions.filter((item) => item.id !== liveSessionId),
  };
}

export function saveScheduleObjectType(
  state: WorkspaceState,
  type: ScheduleObjectType,
): WorkspaceState {
  if (!type.id || !type.name.trim() || !/^#[0-9a-f]{6}$/i.test(type.color)) return state;
  const normalized = { ...type, name: type.name.trim(), description: type.description.trim(), color: type.color.toUpperCase() };
  const duplicate = state.scheduleObjectTypes.some(
    (item) => item.id !== normalized.id && item.name.toLocaleLowerCase() === normalized.name.toLocaleLowerCase(),
  );
  if (duplicate || ["复盘", "直播"].includes(normalized.name)) return state;
  const exists = state.scheduleObjectTypes.some((item) => item.id === normalized.id);
  return {
    ...state,
    scheduleObjectTypes: exists
      ? state.scheduleObjectTypes.map((item) => item.id === normalized.id ? normalized : item)
      : [...state.scheduleObjectTypes, normalized],
  };
}

export function saveScheduleObject(
  state: WorkspaceState,
  object: ScheduleObject,
): WorkspaceState {
  if (!object.id || !object.typeId || !object.title.trim() || !object.plannedDate) return state;
  if (!state.scheduleObjectTypes.some((item) => item.id === object.typeId)) return state;
  const normalized = { ...object, title: object.title.trim(), details: object.details.trim() };
  const exists = state.scheduleObjects.some((item) => item.id === normalized.id);
  return {
    ...state,
    scheduleObjects: exists
      ? state.scheduleObjects.map((item) => item.id === normalized.id ? normalized : item)
      : [...state.scheduleObjects, normalized],
  };
}

export function moveScheduleObject(
  state: WorkspaceState,
  objectId: string,
  plannedDate: string,
  updatedAt: string,
): WorkspaceState {
  if (!plannedDate || !state.scheduleObjects.some((item) => item.id === objectId)) return state;
  return {
    ...state,
    scheduleObjects: state.scheduleObjects.map((item) =>
      item.id === objectId ? { ...item, plannedDate, updatedAt } : item,
    ),
  };
}

export function removeScheduleObject(
  state: WorkspaceState,
  objectId: string,
): WorkspaceState {
  return {
    ...state,
    scheduleObjects: state.scheduleObjects.filter((item) => item.id !== objectId),
  };
}
