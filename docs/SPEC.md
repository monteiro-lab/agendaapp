# Agenda de Atendimentos — PWA com lembretes

Spec de construção para o Claude Code. Cada tarefa da seção **Plano de construção** é
pensada para ser executada uma de cada vez, verificando o resultado antes de seguir.

---

## 1. Objetivo

Web app + PWA para a agenda de atendimentos, com:
- inserção/edição fácil dos agendamentos (grade semanal, seg–sex, 08h–18h);
- lembrete que dispara **com o app fechado**, alguns minutos antes de cada atendimento;
- dados dos pacientes **guardados só no aparelho** (privacidade / LGPD).

Usuária final: **iPhone (iOS)**.

---

## 2. Arquitetura em uma frase

O aparelho é a **fonte da verdade** (dados locais). Um servidor mínimo é só um
**"despertador"**: no horário, ele manda um push que carrega apenas um **id opaco** da
ocorrência (sem nome de paciente). O aparelho acorda, procura esse id no banco local e
**monta a notificação** com o nome e os detalhes. O servidor nunca vê dados de paciente.

```
[iPhone: IndexedDB]  --sincroniza horários-->  [Postgres na sua máquina]
        ^                                              |
        |                                     (crontab a cada minuto)
        |                                              v
        |  push com id opaco  <---- [/api/disparar na Vercel + web-push]
        v
[service worker lê o banco local e mostra a notificação]
```

**Por que assim:** lembrete com app fechado exige um servidor para disparar o push; manter
os dados no aparelho preserva a privacidade. O truque do "push com id opaco" concilia os dois.

---

## 3. Decisões e restrições (não reabrir sem motivo)

- **Deploy do app:** Vercel.
- **Banco:** Postgres puro, rodando **na mesma máquina das outras aplicações** (não no
  Supabase, não como contêiner na Vercel). Administrado via PgAdmin.
- **Vercel + Docker:** a Vercel roda `Dockerfile.vercel`, mas como função serverless
  (stateless, escala a zero após ~5 min ocioso, sem storage durável, sem deploy de
  docker-compose). Portanto **Postgres não roda na Vercel** e **não há worker sempre ligado
  na Vercel**.
- **Gatilho de minuto:** externo — o `crontab` da máquina do Postgres bate em `/api/disparar`.
  (O cron nativo da Vercel no plano Hobby só roda 1x/dia, então não serve.)
- **iOS:** Web Push exige o PWA **instalado na tela inicial** (iOS 16.4+) e permissão
  concedida a partir de um toque. Pode haver atraso de alguns minutos — agende o push com
  folga (ex.: 15 min antes).

---

## 4. Pré-requisitos (fazer antes de começar)

1. **Postgres acessível pela Vercel:** na máquina das outras apps, expor o Postgres com
   host/DNS público, porta liberada e **SSL** (`sslmode=require`). Criar um banco e um
   usuário dedicado com permissão mínima (só as duas tabelas abaixo).
2. **Chaves VAPID** (para o Web Push):
   ```
   npx web-push generate-vapid-keys
   ```
3. **Node 20+**, Docker e Docker Compose instalados.

---

## 5. Estrutura do repositório

```
agenda/
├── app/                       # PWA + rotas serverless (React + Vite + Dexie)
│   ├── src/
│   │   ├── db/                # schema Dexie + CRUD
│   │   ├── ui/                # tela da agenda (mobile-first)
│   │   ├── push/              # permissão, inscrição, sincronização
│   │   └── sw/                # service worker (recebe push, monta notificação)
│   ├── api/                   # inscrever / sincronizar / disparar
│   ├── Dockerfile.vercel      # opcional (caminho de contêiner na Vercel)
│   └── vite.config.ts
├── db/
│   └── migrations/            # SQL das tabelas (rodar no PgAdmin)
└── docker-compose.yml         # dev local: app + postgres + pgadmin
```

---

## 6. Modelo de dados

### 6.1 No aparelho — IndexedDB via Dexie (contém nomes)

- **pacientes**: `id`, `nome`, `telefone?`, `observacoes?`
- **recorrencias** (o padrão da grade): `id`, `pacienteId?` (nulo = **VAGO**),
  `diaSemana` (1=seg … 5=sex), `hora` (`"14:00"`, `"10:20"` — campo livre, não só hora cheia),
  `regraCobranca` (`particular` | `copart20` | `copart40` | `pos`), `ativa` (bool)
- **ocorrencias** (instância real numa data): `id` (UID opaco), `recorrenciaId?`,
  `pacienteId?`, `data` (`YYYY-MM-DD`), `hora`, `status`
  (`agendada` | `realizada` | `cancelada` | `remarcada`), `observacoes?`

### 6.2 No Postgres — sem dados de paciente

```sql
-- db/migrations/001_init.sql
create table inscricoes_push (
  id          bigserial primary key,
  endpoint    text unique not null,
  p256dh      text not null,
  auth        text not null,
  criado_em   timestamptz not null default now()
);

create table lembretes (
  id             bigserial primary key,
  inscricao_id   bigint not null references inscricoes_push(id) on delete cascade,
  ocorrencia_uid text not null,               -- id opaco, SEM nome de paciente
  disparar_em    timestamptz not null,
  enviado        boolean not null default false,
  unique (inscricao_id, ocorrencia_uid)       -- re-sincronizar não duplica
);
create index on lembretes (disparar_em) where not enviado;
```

---

## 7. Fluxo dos lembretes

1. Ao mudar a agenda, o app calcula os lembretes dos próximos ~30 dias
   (`disparar_em = horário do atendimento − 15 min`) e faz **upsert** em `lembretes`,
   chaveado por `ocorrencia_uid` (editar/cancelar atualiza ou remove).
2. O `crontab` da máquina chama `GET /api/disparar` a cada minuto (com segredo no header).
3. `/api/disparar` seleciona `lembretes` vencidos e não enviados, envia o Web Push
   (payload = só `{ uid }`), marca `enviado = true`. Se o endpoint responder `410 Gone`,
   apaga a inscrição.
4. O service worker recebe o push, lê a ocorrência pelo `uid` no Dexie e mostra a
   notificação com nome + horário + regra de cobrança.

---

## 8. Variáveis de ambiente

**Vercel (rotas serverless):**
```
DATABASE_URL=postgres://usuario:senha@SEU_HOST:5432/agenda?sslmode=require
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:voce@exemplo.com
DISPARAR_SECRET=uma-string-longa-aleatoria
```

**App (build Vite):**
```
VITE_VAPID_PUBLIC_KEY=...        # mesma chave pública acima
VITE_API_BASE=https://SEU-APP.vercel.app
```

---

## 9. Docker

- **Dev local (`docker-compose.yml`):** sobe `postgres` (imagem oficial), `pgadmin` e o
  `app` em modo dev, tudo junto e reproduzível.
- **Produção do banco:** na máquina das outras apps, rodar o contêiner do Postgres (pode ser
  a imagem oficial), expor com SSL e aplicar as migrations pelo PgAdmin.
- **Produção do app:** deixar a detecção de framework da Vercel cuidar (mais simples) **ou**
  usar `Dockerfile.vercel` se quiser o contêiner como unidade de deploy. As duas funcionam.

---

## 10. Plano de construção (tarefas para o Claude Code)

Executar uma de cada vez.

1. **Andaime do PWA** — Vite + React + `vite-plugin-pwa`; manifest e service worker
   registrados; app instalável.
2. **Camada de dados local** — schema Dexie (pacientes, recorrencias, ocorrencias) + CRUD.
3. **Importar a grade** — script que semeia `recorrencias` a partir da agenda em PDF, para
   não digitar tudo do zero.
4. **Tela da agenda** — visão semanal (igual ao PDF), mobile-first; inserir/editar/marcar
   realizado; VAGO = slot sem paciente.
5. **Geração de ocorrências** — transformar `recorrencias` em datas concretas dos próximos
   30 dias, cada uma com `ocorrencia_uid`.
6. **Banco** — migrations SQL (`inscricoes_push`, `lembretes`) para aplicar no PgAdmin.
7. **Rotas serverless** — `/api/inscrever` (salva inscrição), `/api/sincronizar` (upsert dos
   lembretes dos próximos 30 dias), `/api/disparar` (protegida por `DISPARAR_SECRET`).
8. **Fiação do push no cliente** — pedir permissão a partir de um toque, salvar a inscrição,
   re-sincronizar sempre que a agenda mudar.
9. **Service worker** — no evento `push`, ler o `uid`, buscar no Dexie, mostrar a notificação
   com os dados locais.
10. **Gatilho de minuto** — linha de `crontab` na máquina do Postgres:
    ```
    * * * * * curl -fsS -H "Authorization: Bearer $DISPARAR_SECRET" https://SEU-APP.vercel.app/api/disparar >/dev/null 2>&1
    ```
11. **iPhone** — orientar "instalar na tela inicial", pedir permissão pós-instalação e
    validar o push no aparelho real.
12. **Segurança e acabamento** — trava por PIN/biometria (WebAuthn) para abrir o app;
    polimento visual.

---

## 11. Segurança e LGPD

- Nomes de pacientes ficam **só no aparelho**; o servidor guarda apenas inscrição push +
  horários + id opaco.
- `/api/disparar` sempre protegida pelo segredo; validar o header antes de qualquer consulta.
- Postgres com SSL e usuário de permissão mínima.
- Trava de app (PIN/biometria), já que são dados de saúde num contexto sensível.
