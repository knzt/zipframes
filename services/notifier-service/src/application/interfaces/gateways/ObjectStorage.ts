export interface SignGetUrlInput {
  readonly key: string;
  readonly expiresInSeconds: number;
  readonly downloadFileName: string;
}

export interface ObjectStorage {
  signGetUrl: (input: SignGetUrlInput) => Promise<string>;
}
