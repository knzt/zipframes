export interface ControllerResponse {
  readonly status: number;
  readonly body: unknown;
  readonly contentType?: string;
}
