-- Usuário da aplicação, com permissão mínima (SPEC §4.1 e §11).
--
-- NÃO fica em db/migrations/ porque aquela pasta é aplicada automaticamente
-- pelo docker-compose no dev local, e este script tem senha.
--
-- Como usar (PgAdmin, conectado como superusuário no banco `agenda`):
--   1. troque TROQUE_ESTA_SENHA por uma senha longa e aleatória;
--   2. execute;
--   3. use essa senha na DATABASE_URL da Vercel;
--   4. NÃO salve este arquivo com a senha real — ele é versionado.
--
-- Rodar depois de 001_init.sql e 002_indices.sql.

-- 1) O papel. Só login; nada de superuser, createdb ou createrole.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'agenda_app') then
    create role agenda_app login password 'TROQUE_ESTA_SENHA';
  end if;
end
$$;

-- 2) Conectar no banco e enxergar o schema — nada além disso.
grant connect on database agenda to agenda_app;
grant usage on schema public to agenda_app;

-- Impede o padrão permissivo do Postgres de criar objetos em `public`.
revoke create on schema public from agenda_app;
revoke all on schema public from public;

-- 3) Só as duas tabelas do "despertador", e só o CRUD que as rotas usam.
grant select, insert, update, delete on inscricoes_push to agenda_app;
grant select, insert, update, delete on lembretes       to agenda_app;

-- 4) As sequences dos bigserial (sem isso, o insert falha).
grant usage, select on sequence inscricoes_push_id_seq to agenda_app;
grant usage, select on sequence lembretes_id_seq       to agenda_app;

-- 5) Conferência: deve listar exatamente as duas tabelas.
-- select table_name, privilege_type
--   from information_schema.role_table_grants
--  where grantee = 'agenda_app'
--  order by table_name, privilege_type;
