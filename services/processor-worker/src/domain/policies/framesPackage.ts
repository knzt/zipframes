/** Deterministic object key — reprocessing overwrites the same frames package. */
export const framesPackageObjectKey = (ownerId: string, videoId: string): string =>
  `outputs/${ownerId}/${videoId}.zip`;
