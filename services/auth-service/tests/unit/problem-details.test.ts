import { describe, expect, it } from 'vitest';

import { problemDetails } from '../../src/infrastructure/http/problem-details.js';

describe('problemDetails', () => {
  it('includes detail and correlationId when given', () => {
    expect(problemDetails(400, 'Bad request', 'why', 'corr-1')).toEqual({
      type: 'about:blank',
      status: 400,
      title: 'Bad request',
      detail: 'why',
      correlationId: 'corr-1',
    });
  });

  it('omits detail and correlationId when not given, rather than sending null', () => {
    const result = problemDetails(401, 'Invalid credentials');

    expect(result).toEqual({ type: 'about:blank', status: 401, title: 'Invalid credentials' });
    expect(result).not.toHaveProperty('detail');
    expect(result).not.toHaveProperty('correlationId');
  });
});
