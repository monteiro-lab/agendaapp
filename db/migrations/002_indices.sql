-- Índice da chave estrangeira de `lembretes`.
--
-- O Postgres não cria índice para FK automaticamente. Sem ele, o
-- `on delete cascade` disparado quando um endpoint responde 410 Gone
-- (inscrição morta) faria varredura sequencial em `lembretes`.

create index if not exists lembretes_inscricao_idx
  on lembretes (inscricao_id);
