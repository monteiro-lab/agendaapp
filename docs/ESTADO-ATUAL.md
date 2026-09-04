# Estado atual do projeto — Agenda de Atendimentos

> Gerado em 2026-09-04, ao final de uma sessão longa. Serve pra retomar o
> trabalho numa conversa nova sem perder contexto. Não é doc de produto —
> é uma fotografia do momento. Se ficar desatualizado, é só apagar.

---

## O que é o projeto

PWA de agenda de atendimentos (React + Vite + Dexie), com lembretes push que
disparam mesmo com o app fechado. Uso pessoal, no iPhone. Fonte da verdade da
especificação: [`docs/SPEC.md`](SPEC.md). Contrato de processo:
[`../CLAUDE.md`](../CLAUDE.md).

**Invariante que rege tudo:** dados de paciente (nome, telefone, observações)
vivem **só no aparelho** (IndexedDB/Dexie). O servidor só conhece um id opaco
por atendimento e o horário de disparo do push — nunca um nome.

---

## Estado: as 12 tarefas do SPEC — concluídas

Todo o plano de construção original (`docs/SPEC.md` §10) está pronto e
**validado no iPhone real** (Tarefa 11, incluindo push chegando com o app
fechado). Isso inclui: PWA instalável, Dexie, importação da grade do PDF
original, tela da agenda, geração de ocorrências, banco Postgres, rotas
serverless, push no cliente, service worker, gatilho de minuto, trava por
PIN/biometria.

## Desvios do SPEC original (deliberados, documentados)

- **Banco: Neon (Postgres gerenciado)**, não uma máquina própria como o SPEC
  previa — decisão para validar o deploy mais rápido. Ver
  [`DEPLOY.md`](DEPLOY.md) §1. Se um dia migrar para máquina própria: só
  trocar `DATABASE_URL` e reaplicar as migrations (`db/README.md`).
- **Gatilho de minuto: GitHub Actions**, não crontab numa máquina própria —
  mesma razão. O caminho self-hosted continua pronto em
  [`../producao/README.md`](../producao/README.md) se precisar.

---

## Deploy — como está publicado hoje

| Peça | Onde |
| --- | --- |
| App + rotas serverless | Vercel, projeto `agendaapp` (conta `ndmg-dev`, time `ndmg-devs-projects`) |
| **URL de produção** | `https://agendaapp-ndmg-devs-projects.vercel.app` |
| Banco | Neon, projeto `neon-amethyst-flower`, usuário `agenda_app` (permissão mínima) |
| Repositório | `github.com/monteiro-lab/agendaapp`, branch `main` |
| Deploy automático | GitHub Actions (`.github/workflows/deploy.yml`) a cada push em `main` — roda os testes antes do build; quebra o pipeline se algo regredir |
| Gatilho de minuto | GitHub Actions (`.github/workflows/disparar.yml`), cron `*/5 * * * *` |
| Vigia do gatilho | GitHub Actions (`.github/workflows/vigia.yml`), a cada 30 min — abre uma Issue (e-mail) se `disparar.yml` não tiver rodado com sucesso nos últimos ~20 min |

**Por que o deploy é via GitHub Actions e não a integração nativa Git↔Vercel:**
o repositório (`monteiro-lab`) e a conta Vercel (`ndmg-dev`) são contas
diferentes; o GitHub App da Vercel não atravessa contas assim. Contornado
chamando a CLI da Vercel direto com um token de conta (não um token de
projeto — só o de conta resolve `/v2/user`, exigido pela CLI). Detalhes em
[`DEPLOY.md`](DEPLOY.md) §2.

**Segredos vivem em dois lugares, sem sobreposição:**
- Vercel (Production/Preview), tipo *Secret*: `DATABASE_URL`,
  `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT`, `DISPARAR_SECRET`.
  Tipo *Config*: `VITE_VAPID_PUBLIC_KEY`. `VITE_API_BASE` fica **vazia**
  (app e API no mesmo domínio).
- GitHub Actions (secrets do repositório): `VERCEL_TOKEN`, `VERCEL_ORG_ID`,
  `VERCEL_PROJECT_ID` (pro deploy), `AGENDA_API_BASE` + `DISPARAR_SECRET`
  (pro gatilho).

---

## As features construídas além do SPEC (nesta sessão)

### Redesign visual
Paleta reduzida a neutros + um único acento azul-petróleo (`#0f5c66`), status
marcado por barra fina + tag (nunca fundo colorido cheio), ícones SVG
próprios (`src/ui/icones.tsx`) no lugar de emoji, favicon novo (folha de
calendário + check, combinando com a paleta).

### Exportar PDF (pedido específico do usuário)
Layout replica o PDF original que semeou a grade (`Agenda Atualizada.pdf`):
tabela Hora × Seg-Sex, cabeçalho navy arredondado com pontinhos decorativos,
uma cor por dia. Generalizado depois para **qualquer período** (não só uma
semana — um mês vira N tabelas, uma por semana, com paginação). jsPDF
carregado sob demanda (import dinâmico), fora do bundle principal.
Arquivo: `src/pdf/exportarAgenda.ts`, UI: `src/ui/ExportarPdf.tsx`.

### Lote 1 de 7 features (usuário pediu "implemente todas")
1. **Dados do paciente** (telefone/observações) editáveis em qualquer horário
2. **Backup/restauração** local (`.json`, nunca sai do aparelho sem pedir)
3. **Confirmações desenhadas** — substituiu o `confirm()` nativo por um modal
   no estilo do app (`src/ui/confirmar.tsx`, hook `useConfirmar`)
4. **Busca de paciente** com atalho pro próximo horário
5. **Pausa temporária de recorrência** (`Recorrencia.pausadaAte`) — ex.: férias
6. **Testes automatizados** (vitest + fake-indexeddb) do núcleo crítico
7. **Vigia do gatilho de minuto** — e isso **achou um bug real em produção**:
   o cron `* * * * *` do GitHub Actions simplesmente não disparava sozinho
   (2h39 sem execução automática). Corrigido para `*/5 * * * *`.

### Lote 2 de 7 features (mesmo padrão, sequência: 5, 1+2, 3, 4, 6, 7)
1+2. **Tela de pacientes com ficha e histórico** (`src/ui/Pacientes.tsx`) —
   lista com filtro, ficha editável, horários fixos ativos, histórico completo
3. **Exportar PDF de período customizado** (generalização do exporter acima)
4. **Estatística de comparecimento** (`src/ui/Estatisticas.tsx`) — % realizada
   vs cancelada, por paciente ou por mês, sem cálculo financeiro
5. **Testar notificação** — rota nova `/api/testar-push` (sem o
   `DISPARAR_SECRET`), manda um push na hora pra provar a cadeia inteira
6. **Bloqueio progressivo do PIN** — 5 erros trancam por 30s, dobra a cada
   novo estouro; o PIN certo também é recusado durante o bloqueio
7. **Linha do "agora"** na visão do dia, entre os horários passados e futuros

**Estado do teste:** 33 testes automatizados (`npm test`), todos passando.
Tudo commitado e já em produção (push feito, deploy verificado saudável).

---

## Sugestões de feature ainda não implementadas

Dei essas sugestões na última mensagem da sessão anterior; nenhuma foi
começada ainda:

1. **🔍 Achado real, prioridade alta:** o vigia (`vigia.yml`) só detecta
   quando `disparar.yml` **para de rodar** — não detecta quando ele roda mas
   **os envios estão falhando** (`falhas > 0` na resposta). O `grep -q
   '"ok":true'` do `disparar.yml` passa mesmo com falhas. Precisa endurecer
   pra também checar `"falhas":0`, ou o vigia nunca vai avisar sobre uma
   chave VAPID revogada, por exemplo.
2. Marcar um dia inteiro como "sem atendimento" (feriado) — hoje só existe
   pausa por recorrência, não por data específica afetando tudo daquele dia.
3. Copiar a configuração de um dia da semana pra outro.
4. Exportar contatos (nome + telefone) num formato leve, separado do backup
   completo — pra importar rápido no catálogo do celular.
5. Modo escuro.
6. Atalhos de teclado (setas ←/→ pra navegar semana) — a grade já tem layout
   de desktop (5 colunas em telas largas).

---

## Onde as coisas estão no código

```
agenda/
├── app/src/
│   ├── db/              # Dexie: schema, CRUD, geração de ocorrências,
│   │                     backup/restauração, testes (*.test.ts)
│   ├── ui/               # todas as telas — Agenda.tsx é o coração
│   ├── pdf/              # exportarAgenda.ts (jsPDF, layout da grade original)
│   ├── push/             # inscrição, sincronização, teste de notificação
│   ├── seguranca/        # trava.ts (PIN/biometria) + trava.test.ts
│   └── sw/sw.ts           # service worker
├── app/api/               # inscrever · sincronizar · disparar · testar-push
├── .github/workflows/     # deploy.yml · disparar.yml · vigia.yml
├── db/                    # migrations SQL + README
├── producao/              # caminho self-hosted alternativo (não é o usado)
└── docs/                  # SPEC.md · DEPLOY.md · este arquivo
```

## Comandos úteis

```bash
# dev local
docker compose up -d postgres
cd app && npm install && npm run dev
npm test            # 33 testes, vitest + fake-indexeddb

# deploy manual (normalmente é automático a cada push)
cd app && npx vercel deploy --prod

# ver os workflows do GitHub Actions
gh run list --repo monteiro-lab/agendaapp --limit 10
```

## Limites conhecidos (não são bugs, são decisões)

- A trava é um **portão de tela, não criptografia** — o service worker
  precisa ler os dados com o app fechado, então não dá pra cifrar em repouso.
- PIN esquecido **não tem recuperação** — só apagando os dados do app.
- Se o repositório GitHub ficar 60+ dias sem nenhuma atividade, o GitHub
  suspende **todos** os workflows agendados de uma vez (gatilho e vigia
  inclusive). Nenhum workflow agendado consegue vigiar essa suspensão
  específica sem algo externo sempre ligado.
- Sem exportação de contatos avulsa (só o backup completo em `.json`).

---

## Prompt pronto para continuar numa conversa nova

Copie e cole isto como primeira mensagem:

```
Leia docs/ESTADO-ATUAL.md pra pegar o contexto do projeto Agenda de
Atendimentos — já tem o SPEC inteiro implementado e validado, mais 13
features extras construídas numa sessão anterior, tudo em produção.

Quero continuar implementando as sugestões pendentes listadas lá, nesta
ordem:

1. Corrigir o vigia (vigia.yml) pra detectar falhas de envio, não só
   ausência de execução — hoje ele passa mesmo com falhas > 0.
2. Marcar um dia inteiro como "sem atendimento" (feriado).
3. Copiar a configuração de um dia da semana pra outro.
4. Exportar contatos (nome + telefone) separado do backup completo.
5. Modo escuro.
6. Atalhos de teclado (setas pra navegar semana).

Pode implementar uma de cada vez, com um plano curto antes de cada uma
(como fizemos no restante do projeto). Não dê push até eu pedir — eu aviso
quando quiser mandar tudo pra produção.
```
