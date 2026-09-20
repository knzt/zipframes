/** Deterministic result key — reprocessing overwrites the same object. */
export const resultObjectKey = (ownerId: string, videoId: string): string =>
  `outputs/${ownerId}/${videoId}.zip`;
