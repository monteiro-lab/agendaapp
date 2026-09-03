# Agenda de Atendimentos — PWA com lembretes

Web app + PWA para a agenda de atendimentos, com lembretes que disparam mesmo
com o app fechado. Os dados dos pacientes ficam **só no aparelho**.

> **Especificação:** [`docs/SPEC.md`](docs/SPEC.md) · **Contrato de trabalho:**
> [`CLAUDE.md`](CLAUDE.md) · **Publicar:** [`docs/DEPLOY.md`](docs/DEPLOY.md)

## Como funciona

O aparelho é a fonte da verdade. O servidor é só um despertador: no horário ele
manda um push com **um id opaco**, e o service worker monta a notificação com o
nome lido do banco local. O servidor nunca vê dado de paciente.

```
[iPhone: IndexedDB]  ──horários (só uid)──→  [Postgres na sua máquina]
        ▲                                              │
        │                                     (crontab a cada minuto)
        │                                              ▼
        └────── push { uid } ──────  [/api/disparar na Vercel + web-push]
```

## Estrutura

```
agenda/
├── app/                    # o PWA e as rotas serverless
│   ├── src/
│   │   ├── db/             # Dexie: schema, CRUD, geração de ocorrências
│   │   ├── ui/             # agenda semanal, editor, ajustes, trava
│   │   ├── push/           # permissão, inscrição, sincronização
│   │   ├── seguranca/      # trava por PIN/biometria
│   │   └── sw/             # service worker (recebe o push)
│   ├── api/                # inscrever · sincronizar · disparar
│   └── vite-dev-api.ts     # serve as rotas no `npm run dev`
├── db/migrations/          # SQL das tabelas
├── producao/               # usuário mínimo do banco + gatilho de minuto
├── docs/                   # SPEC e guia de deploy
└── docker-compose.yml      # dev local: postgres + pgadmin + app
```

## Rodar localmente

```bash
docker compose up -d postgres     # banco + migrations
cd app && npm install && npm run dev
```

Abre em `http://localhost:5173`. O `.env` da raiz alimenta tanto o compose
quanto o Vite (que o lê via `envDir`).

Para gerar as chaves do zero: `npx web-push generate-vapid-keys`.

## Estado

Tarefas 1–10 e 12 do SPEC prontas e verificadas. Deploy no ar:
**https://agendaapp-ndmg-devs-projects.vercel.app** (Vercel + Neon — ver o
desvio do desenho original em [`docs/DEPLOY.md`](docs/DEPLOY.md)). Falta
instalar o gatilho de minuto em algum lugar sempre ligado e validar a
Tarefa 11 (iPhone real).

**Limites conhecidos:**

- Não há exportação/backup: perder o aparelho perde a agenda.
- A trava é um portão de tela, não criptografia (o service worker precisa ler
  os nomes com o app fechado).
- Web Push no iOS exige iOS 16.4+ e o PWA instalado na tela inicial.
