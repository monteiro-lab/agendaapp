-- Tabelas do "despertador". NÃO guardam dados de paciente.
-- Rodar no PgAdmin (ou aplicado automaticamente pelo docker-compose no dev local).

create table if not exists inscricoes_push (
  id          bigserial primary key,
  endpoint    text unique not null,
  p256dh      text not null,
  auth        text not null,
  criado_em   timestamptz not null default now()
);

create table if not exists lembretes (
  id             bigserial primary key,
  inscricao_id   bigint not null references inscricoes_push(id) on delete cascade,
  ocorrencia_uid text not null,               -- id opaco, SEM nome de paciente
  disparar_em    timestamptz not null,
  enviado        boolean not null default false,
  unique (inscricao_id, ocorrencia_uid)       -- re-sincronizar não duplica
);

create index if not exists lembretes_a_enviar_idx
  on lembretes (disparar_em) where not enviado;
