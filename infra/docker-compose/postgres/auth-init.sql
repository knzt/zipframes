-- Extensões exigidas pelo schema do auth-service.
-- citext torna a comparação de e-mail insensível a maiúsculas (ver docs/04-modelo-de-dados.md).
CREATE EXTENSION IF NOT EXISTS citext;
