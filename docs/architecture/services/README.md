# Arquitetura por serviço

Documentos de arquitetura interna de cada microsserviço. A Clean Architecture é a base. Os quatro anéis em `src/` são `domain/`, `application/` (casos de uso e ports), `interface-adapters/` (controllers) e `infrastructure/` (drivers). `main/` é o composition root (`start.ts` e factories). O que vive em cada pasta, a direção da dependência e a nomenclatura estão em [layers.md](../layers.md). O HTTP comum (saúde e OpenAPI) está em [http.md](../http.md). Cada serviço detalha aqui o mapa de pastas, componentes e fluxos do seu contexto.

| Serviço            | Documento                                    | Persistência                          |
| ------------------ | -------------------------------------------- | ------------------------------------- |
| `auth-service`     | [auth-service.md](./auth-service.md)         | Postgres (`auth-db`)                  |
| `video-service`    | [video-service.md](./video-service.md)       | Postgres (`video-db`) e Redis (cache) |
| `processor-worker` | [processor-worker.md](./processor-worker.md) | Nenhuma (stateless)                   |

Demais serviços (`notification-service`, `web-client`) entram nesta pasta à medida que forem implementados.
