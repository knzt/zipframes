/** One frame per second, PNG, zero-padded names. */
export const FRAME_FPS = 1;
export const FRAME_EXTENSION = 'png';

export const frameFileName = (index: number): string =>
  `frame_${String(index).padStart(4, '0')}.${FRAME_EXTENSION}`;

/** Deterministic result key — reprocessing overwrites the same object. */
export const resultObjectKey = (ownerId: string, videoId: string): string =>
  `outputs/${ownerId}/${videoId}.zip`;

export interface ProcessingJob {
  readonly videoId: string;
  readonly ownerId: string;
  readonly sourceKey: string;
  readonly originalFileName: string;
  readonly sizeBytes: number;
  readonly attempt: number;
  readonly correlationId: string;
}
