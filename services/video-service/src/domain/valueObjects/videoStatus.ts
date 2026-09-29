/** Every stage of a video's life cycle, in the order it usually moves through them. */
export const VIDEO_STATUSES = [
  'QUEUED',
  'PROCESSING',
  'DONE',
  'FAILED',
  'EXPIRED',
  'DELETED',
] as const;

export type VideoStatus = (typeof VIDEO_STATUSES)[number];

/** Statuses the owner's list can show: a deleted video is never listed. */
export type ListableVideoStatus = Exclude<VideoStatus, 'DELETED'>;

/**
 * Statuses in which processing is over. Processing events that arrive after
 * one of them are ignored, which is what makes redelivery harmless.
 */
export const PROCESSING_FINISHED: readonly VideoStatus[] = ['DONE', 'FAILED', 'EXPIRED', 'DELETED'];

/**
 * Statuses the owner may delete from. A queued or processing video is left
 * alone until the worker settles it, so the worker never reads a source that
 * the owner already removed.
 */
export const DELETABLE: readonly VideoStatus[] = ['DONE', 'FAILED', 'EXPIRED'];
