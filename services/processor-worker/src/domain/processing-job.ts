export interface ProcessingJob {
  readonly videoId: string;
  readonly ownerId: string;
  readonly sourceKey: string;
  readonly originalFileName: string;
  readonly sizeBytes: number;
  readonly attempt: number;
  readonly correlationId: string;
}
