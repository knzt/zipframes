# Arquitetura por serviço

Documentos de arquitetura interna de cada microsserviço. A Clean Architecture é a base. `application/` junta o que o livro separa: casos de uso e interface adapters. O que vive nessa pasta, o que é um interface adapter aqui, como um pedido atravessa até a infraestrutura e por que a dependência aponta para dentro está em [layers.md](../layers.md), junto com a taxonomia das interfaces e a nomenclatura. O HTTP comum (saúde e OpenAPI) está em [http.md](../http.md). Cada serviço detalha aqui o mapa de pastas, componentes e fluxos do seu contexto.

| Serviço            | Documento                                    | Persistência         |
| ------------------ | -------------------------------------------- | -------------------- |
| `auth-service`     | [auth-service.md](./auth-service.md)         | Postgres (`auth-db`) |
| `processor-worker` | [processor-worker.md](./processor-worker.md) | Nenhuma (stateless)  |

Demais serviços (`video-service`, `notification-service`, `web-client`) entram nesta pasta à medida que forem implementados.
