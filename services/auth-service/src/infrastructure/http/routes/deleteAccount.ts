import { BEARER_SECURITY, type HttpRouteDefinition } from '../httpRoute.js';
import { problemDetailsSchema } from '../problemDetails.schema.js';
import type { DeleteAccountController } from '../../../interface-adapters/DeleteAccountController.js';

export const deleteAccountRoute = (controller: DeleteAccountController): HttpRouteDefinition => ({
  method: 'DELETE',
  path: '/account',
  openApi: {
    tags: ['Identidade'],
    summary: 'Exclui a conta do usuário autenticado',
    security: BEARER_SECURITY,
    response: {
      204: { description: 'Conta excluída', type: 'null' },
      401: problemDetailsSchema('Token ausente, inválido ou expirado'),
    },
  },
  handle: (request) => controller.handle(request),
});
