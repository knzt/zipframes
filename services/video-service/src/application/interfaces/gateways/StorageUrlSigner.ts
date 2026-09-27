export interface SignedUrl {
  readonly url: string;
  readonly expiresInSeconds: number;
}

export interface SignUploadInput {
  readonly key: string;
  readonly contentType: string;
  /** Signed into the URL, so the storage refuses a body of any other size. */
  readonly sizeBytes: number;
  readonly expiresInSeconds: number;
}

export interface SignDownloadInput {
  readonly key: string;
  /** Name the browser saves the file as. */
  readonly downloadFileName: string;
  readonly expiresInSeconds: number;
}

/**
 * Short-lived URLs restricted to a single object. The client talks to the
 * storage with them directly; the file never passes through this service.
 */
export interface StorageUrlSigner {
  readonly signUpload: (input: SignUploadInput) => Promise<SignedUrl>;
  readonly signDownload: (input: SignDownloadInput) => Promise<SignedUrl>;
}
