# Agenda de Atendimentos — PWA com lembretes

Web app + PWA para a agenda de atendimentos, com lembretes que disparam mesmo
com o app fechado. Os dados dos pacientes ficam **só no aparelho**.

> **Especificação:** [`docs/SPEC.md`](docs/SPEC.md) · **Contrato de trabalho:**
> [`CLAUDE.md`](CLAUDE.md) · **Publicar:** [`docs/DEPLOY.md`](docs/DEPLOY.md)

**No ar:** https://agendaapp-ndmg-devs-projects.vercel.app

## Como funciona

O aparelho é a fonte da verdade. O servidor é só um despertador: no horário ele
manda um push com **um id opaco**, e o service worker monta a notificação com o
nome lido do banco local. O servidor nunca vê dado de paciente.

```
[iPhone: IndexedDB]  ──horários (só uid)──→  [Neon: Postgres]
        ▲                                              │
        │                          (GitHub Actions, a cada minuto,
        │                           vigiado por um segundo workflow)
        │                                              ▼
        └────── push { uid } ──────  [/api/disparar na Vercel + web-push]
```

## Estrutura

```
agenda/
├── app/                    # o PWA e as rotas serverless
│   ├── src/
│   │   ├── db/             # Dexie: schema, CRUD, geração de ocorrências,
│   │   │                   #   backup/restauração — com testes (vitest)
│   │   ├── ui/             # agenda semanal, editor, busca, ajustes, trava
│   │   ├── push/           # permissão, inscrição, sincronização
│   │   ├── seguranca/      # trava por PIN/biometria
│   │   └── sw/             # service worker (recebe o push)
│   ├── api/                # inscrever · sincronizar · disparar
│   └── vite-dev-api.ts     # serve as rotas no `npm run dev`
├── db/migrations/          # SQL das tabelas
├── producao/               # caminho self-hosted (usuário mínimo + crontab),
│                           #   não é o que está em produção hoje
├── docs/                   # SPEC e guia de deploy
├── .github/workflows/      # deploy automático, gatilho de minuto, vigia
└── docker-compose.yml      # dev local: postgres + pgadmin + app
```

## Rodar localmente

```bash
docker compose up -d postgres     # banco + migrations
cd app && npm install && npm run dev
npm test                          # roda os testes (vitest + fake-indexeddb)
```

Abre em `http://localhost:5173`. O `.env` da raiz alimenta tanto o compose
quanto o Vite (que o lê via `envDir`).

Para gerar as chaves do zero: `npx web-push generate-vapid-keys`.

## Deploy

Automático: todo push em `main` roda os testes e publica na Vercel via
GitHub Actions ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)).
Detalhes e o porquê de não usar a integração nativa Git↔Vercel em
[`docs/DEPLOY.md`](docs/DEPLOY.md).

## Estado

Todo o plano de construção do SPEC (Tarefas 1–12) está pronto e validado,
inclusive no iPhone real. Depois disso, adicionamos por conta própria:

- **Dados do paciente** (telefone/observações) editáveis no horário
- **Backup/restauração** local (`.json`, nunca sai do aparelho sem pedir)
- **Confirmações desenhadas**, no lugar do `confirm()` do navegador
- **Busca de paciente** com atalho para o próximo horário
- **Pausa temporária** de recorrência (ex.: férias), sem perder a série
- **Testes automatizados** do núcleo (geração de ocorrências, CRUD, backup)
- **Vigia do gatilho de minuto** — avisa por e-mail se parar de disparar

**Limites conhecidos:**

- A trava é um portão de tela, não criptografia (o service worker precisa ler
  os nomes com o app fechado).
- Web Push no iOS exige iOS 16.4+ e o PWA instalado na tela inicial.
- Se o repositório ficar 60+ dias sem nenhuma atividade, o GitHub suspende
  todos os workflows agendados de uma vez — inclusive o gatilho e o vigia
  (ver `docs/DEPLOY.md`).
