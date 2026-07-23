import type {
  LiveSession,
  ReviewDay,
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
