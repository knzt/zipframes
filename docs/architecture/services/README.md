# Arquitetura por serviço

Documentos de arquitetura interna de cada microsserviço, alinhados à **Clean Architecture** de Robert C. Martin (Uncle Bob).

As regras gerais de dependência do monorepo estão em [layers.md](../layers.md). Cada serviço pode detalhar aqui o mapa de pastas, componentes e fluxos do seu contexto.

| Serviço            | Documento                                    | Persistência         |
| ------------------ | -------------------------------------------- | -------------------- |
| `auth-service`     | [auth-service.md](./auth-service.md)         | Postgres (`auth-db`) |
| `processor-worker` | [processor-worker.md](./processor-worker.md) | Nenhuma (stateless)  |

Demais serviços (`video-service`, `notification-service`, `web-client`) entram nesta pasta à medida que forem implementados.
