# Banco — o "despertador"

Postgres puro, rodando **na máquina das outras aplicações** (não na Vercel: função
serverless é stateless, escala a zero e não tem disco durável). Administrado pelo
PgAdmin.

## O que fica aqui — e o que nunca fica

| Guarda | Não guarda |
| --- | --- |
| endpoint da inscrição push + chaves `p256dh`/`auth` | nome de paciente |
| `ocorrencia_uid` (id opaco, sem significado) | telefone, observações |
| `disparar_em` (quando mandar o push) | qualquer coisa que identifique alguém |

Se um dia uma coluna com dado de paciente aparecer aqui, o desenho foi violado —
o aparelho é a fonte da verdade, o servidor é só o relógio.

## Arquivos

```
db/migrations/                # schema — aplicado em ordem alfabética
├── 001_init.sql              # inscricoes_push, lembretes, índice de envio
└── 002_indices.sql           # índice da FK (o cascade do 410 Gone usa)
```

O papel da aplicação (manual, contém senha) fica em
[`../producao/usuario_minimo.sql`](../producao/usuario_minimo.sql), junto com o
gatilho de minuto.

## Dev local

O `docker-compose.yml` monta `db/migrations/` em `/docker-entrypoint-initdb.d`,
então `docker compose up` já cria tudo:

```bash
docker compose up -d postgres
```

⚠️ Esses scripts rodam **só na primeira inicialização do volume**. Se você
adicionar uma migration depois, aplique à mão (PgAdmin ou `psql`) ou recrie o
volume com `docker compose down -v` (apaga os dados).

No dev a `DATABASE_URL` vai **sem** `sslmode=require` — o Postgres do compose
não tem SSL:

```
postgres://agenda:senha@localhost:5432/agenda
```

## Produção

1. Aplicar `migrations/001_init.sql` e `migrations/002_indices.sql` no PgAdmin,
   nessa ordem (são idempotentes: `if not exists`).
2. Abrir `../producao/usuario_minimo.sql`, trocar a senha e executar.
3. Expor o Postgres com host/DNS público, porta liberada e **SSL**. A URL da
   Vercel usa `?sslmode=require`.

## Conferir se ficou certo

```sql
-- as duas tabelas existem?
select table_name from information_schema.tables
 where table_schema = 'public' order by table_name;

-- os índices esperados?
select indexname from pg_indexes
 where tablename in ('inscricoes_push', 'lembretes') order by indexname;

-- o usuário da aplicação só alcança as duas tabelas?
select table_name, privilege_type from information_schema.role_table_grants
 where grantee = 'agenda_app' order by table_name, privilege_type;

-- o que está na fila para disparar
select count(*) filter (where not enviado) as pendentes,
       count(*) filter (where not enviado and disparar_em <= now()) as vencidos
  from lembretes;
```
