export type ProblemDetails = {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail?: string;
  readonly correlationId?: string;
};

export const problemDetails = (
  status: number,
  title: string,
  detail?: string,
  correlationId?: string,
): ProblemDetails => ({
  type: 'about:blank',
  status,
  title,
  ...(detail !== undefined ? { detail } : {}),
  ...(correlationId !== undefined ? { correlationId } : {}),
});

export const PROBLEM_CONTENT_TYPE = 'application/problem+json';
