export {
  Video,
  brandVideoId,
  brandOwnerId,
  newVideoId,
  type VideoId,
  type OwnerId,
  type ReceiveVideoProps,
  type FailureProps,
  type PersistedVideo,
  type ProcessingEvent,
  type ProcessingEventOutcome,
  type IgnoredProcessingReason,
  type DownloadAvailability,
} from './entities/video.js';

export { InvalidVideoTransitionError, type VideoAction } from './errors/videoErrors.js';

export { videoQueuedFrom, type VideoQueued } from './events/videoQueued.js';

export { framesPackageKeyFor, sourceKeyFor } from './policies/storageKeys.js';

// The file name and the file itself are not re-exported here: they come
// from @zipframes/value-objects, the single source of the system's value
// objects, and whoever needs them imports them from there. What stays is
// the status machine, which is this aggregate's vocabulary rather than a
// validated value.
export {
  DELETABLE,
  PROCESSING_FINISHED,
  VIDEO_STATUSES,
  type VideoStatus,
} from './valueObjects/videoStatus.js';
