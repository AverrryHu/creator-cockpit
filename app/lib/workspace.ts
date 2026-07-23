import type { WorkspaceState } from "./model";
import { setContentStageCompletion } from "./workflow.ts";

export function deleteContentFromWorkspace(state: WorkspaceState, contentId: string): WorkspaceState {
  return {
    ...state,
    contents: state.contents.filter((item) => item.id !== contentId),
    stageEvents: state.stageEvents.filter((event) => event.contentId !== contentId),
    insightRules: state.insightRules.filter((rule) => rule.sourceContentId !== contentId),
  };
}

export function completeContentReview(
  state: WorkspaceState,
  contentId: string,
  transitionDate: string,
  completedAt: string,
): WorkspaceState {
  const content = state.contents.find((item) => item.id === contentId);
  if (
    !content
    || content.publicationStatus !== "published"
    || !content.review.rating
    || !content.review.analysis.trim()
  ) return state;
  const withReviewStatus: WorkspaceState = {
    ...state,
    contents: state.contents.map((item) => item.id === contentId
      ? { ...item, review: { ...item.review, completedAt } }
      : item),
  };
  return setContentStageCompletion(
    withReviewStatus,
    contentId,
    "review",
    true,
    transitionDate,
    completedAt,
  );
}
