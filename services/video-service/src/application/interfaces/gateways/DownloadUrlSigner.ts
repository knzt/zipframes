export interface SignDownloadInput {
  readonly key: string;
  /** Name the browser saves the file as. */
  readonly downloadFileName: string;
  readonly expiresInSeconds: number;
}

export interface SignedDownloadUrl {
  readonly url: string;
  readonly expiresInSeconds: number;
}

/**
 * A short-lived URL restricted to one object: the client downloads the
 * frames package straight from the storage.
 */
export interface DownloadUrlSigner {
  readonly sign: (input: SignDownloadInput) => Promise<SignedDownloadUrl>;
}
