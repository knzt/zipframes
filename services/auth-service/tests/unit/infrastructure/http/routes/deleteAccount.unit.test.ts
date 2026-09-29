import { describe, expect, it, vi } from 'vitest';

import type { DeleteAccountController } from '../../../../../src/interface-adapters/DeleteAccountController.js';
import { deleteAccountRoute } from '../../../../../src/infrastructure/http/routes/deleteAccount.js';

describe('deleteAccountRoute', () => {
  it('declares DELETE /account and delegates the request to the controller', async () => {
    const reply = { status: 204, body: undefined };
    const handle = vi.fn(async () => reply);
    const route = deleteAccountRoute({ handle } as unknown as DeleteAccountController);
    const request = { correlationId: 'corr-delete', body: undefined, authorization: 'Bearer x' };

    const response = await route.handle(request);

    expect(route.method).toBe('DELETE');
    expect(route.path).toBe('/account');
    expect(handle).toHaveBeenCalledWith(request);
    expect(response).toBe(reply);
  });
});
