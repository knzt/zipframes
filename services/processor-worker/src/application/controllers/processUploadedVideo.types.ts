import type { VideoUploadedEvent } from '@zipframes/schemas/video-service';

export interface ProcessUploadedVideoRequest {
  readonly event: VideoUploadedEvent;
  readonly attempt: number;
}
