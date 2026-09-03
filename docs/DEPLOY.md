# Publicar e validar no iPhone

Estado atual do deploy e o que falta para o lembrete tocar no aparelho com o
app fechado.

```
[iPhone: PWA instalado]  ←push─  [Vercel: /api/*]  ──SQL──  [Neon: Postgres]
                                        ▲
                          (GitHub Actions, disparar.yml, a cada minuto —
                           vigiado por vigia.yml)
```

> **Desvio do desenho original:** o SPEC (§3, §4) previa o Postgres rodando
> **na sua própria máquina**, exposto manualmente com SSL. Para validar o
> deploy mais rápido, usamos **Neon** (Postgres gerenciado) via a integração
> nativa da Vercel. Funciona e mantém o mesmo contrato de dados — só muda
> **onde** o banco roda; se depois você preferir migrar para uma máquina
> própria, é só trocar `DATABASE_URL` e reaplicar as migrations. O restante
> deste documento reflete o que está no ar **hoje**, com Neon.

---

## Estado atual (já feito)

| Peça | Onde | Status |
| --- | --- | --- |
| App + rotas serverless | Vercel, projeto `agendaapp` | ✅ no ar |
| Banco | Neon (Postgres gerenciado), projeto `neon-amethyst-flower` | ✅ migrations aplicadas |
| Usuário de permissão mínima | `agenda_app`, só nas duas tabelas | ✅ criado e testado |
| Variáveis de ambiente | Vercel → Production/Preview | ✅ cadastradas |
| Deployment Protection (SSO) | Vercel | ✅ desligada (precisa ser pública para o cron e o iPhone) |
| Gatilho de minuto | GitHub Actions, `.github/workflows/disparar.yml` | ✅ rodando |
| Vigia do gatilho | GitHub Actions, `.github/workflows/vigia.yml` | ✅ abre Issue (e-mail) se parar |
| Deploy automático | GitHub Actions, `.github/workflows/deploy.yml` | ✅ a cada push em `main`, com testes antes |
| Validação no iPhone real | — | ✅ **feita (Tarefa 11)** |

**URL de produção:** `https://agendaapp-ndmg-devs-projects.vercel.app`
(alias estável do projeto — sobrevive a cada novo `vercel deploy --prod`).

Confirmado por teste direto: `/api/inscrever`, `/api/sincronizar` e
`/api/disparar` respondendo certo contra o Neon, com o usuário de permissão
mínima.

---

## 1. Onde fica o Postgres agora

**Neon**, provisionado pela integração `vercel integration add neon`, já
conectado ao projeto. Dados de acesso:

- Banco: `neondb` (nome padrão do Neon — o SPEC previa `agenda`, mas o nome do
  banco não importa para nada no código).
- Papel `neondb_owner`: administrativo, usado só para aplicar migrations.
  Gerenciar via `npx neonctl` (autenticado) ou o painel do Neon.
- Papel `agenda_app`: o que a aplicação usa de fato — só `select/insert/
  update/delete` nas duas tabelas, sem `create` no schema. Criado a partir de
  [`../producao/usuario_minimo.sql`](../producao/usuario_minimo.sql) (adaptado
  para o nome do banco `neondb`).

Migrations já aplicadas: `db/migrations/001_init.sql` e `002_indices.sql`.

**Se um dia migrar para uma máquina própria:** siga
[`../db/README.md`](../db/README.md) (seção "Produção") do zero — expor com
SSL, aplicar as duas migrations, rodar `usuario_minimo.sql` com o nome de
banco `agenda` — e troque só a `DATABASE_URL` na Vercel.

## 2. Deploy do app

Já feito. Para republicar depois de mudanças:

```sh
cd app
npx vercel deploy --prod
```

O projeto está vinculado (`.vercel/project.json`, não versionado). Root
directory = `app/` (onde estão `package.json` e `api/`).

### Variáveis de ambiente cadastradas (Production e Preview)

| Variável | Origem |
| --- | --- |
| `DATABASE_URL` | montada à mão com o papel `agenda_app` no Neon (Secret) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | as mesmas do `.env` local (Secret) |
| `DISPARAR_SECRET` | o mesmo do `.env` local (Secret) |
| `VITE_VAPID_PUBLIC_KEY` | igual à `VAPID_PUBLIC_KEY` (Config) |
| `VITE_API_BASE` | **não cadastrada** — vazia, app e API no mesmo domínio |

As `DATABASE_URL`/`VAPID_PRIVATE_KEY`/`DISPARAR_SECRET`/`VAPID_SUBJECT`/
`VAPID_PUBLIC_KEY` foram cadastradas como **Secret**: o próprio Vercel CLI não
consegue mais lê-las de volta (`vercel env pull` as mostra como
`[SENSITIVE]`). Se precisar trocar alguma, use `vercel env rm` seguido de
`vercel env add` — não dá para "editar".

⚠️ As `VITE_*` são lidas **no build**. Mudou uma delas? Rode
`vercel deploy --prod` de novo.

### Uma armadilha que já mordeu este deploy

A Vercel roda `api/**/*.ts` como **ESM nativo, sem empacotar** — imports
relativos precisam de extensão explícita (`./_lib/db.js`, não `./_lib/db`),
porque o Node exige isso sob `moduleResolution: node16/nodenext`. Nem o
`npm run dev` (Vite resolve sozinho) nem testes locais com `tsx` pegam esse
erro — só apareceu como `ERR_MODULE_NOT_FOUND` no runtime real da Vercel.
`tsconfig.api.json` já foi ajustado para `node16` para o `npm run typecheck`
pegar isso da próxima vez.

## 3. Deployment Protection

Por padrão, um projeto de time na Vercel nasce atrás de **SSO** — qualquer
acesso, incluindo `/api/disparar`, exige login na Vercel. Isso bloquearia o
cron e o Safari do iPhone. Já foi desligado:

```sh
npx vercel project protection disable agendaapp --sso
```

## 4. Gatilho de minuto

Roda como workflow agendado do GitHub Actions
([`../.github/workflows/disparar.yml`](../.github/workflows/disparar.yml)) —
grátis, já que o repositório está no GitHub, e não exige um servidor extra
sempre ligado (a Vercel não serve para isso: cron do Hobby é 1x/dia, sem
worker permanente).

Segredos usados (cadastrados no repositório, `Settings → Secrets and
variables → Actions`):

```
AGENDA_API_BASE=https://agendaapp-ndmg-devs-projects.vercel.app
DISPARAR_SECRET=<o mesmo cadastrado na Vercel>
```

**Ressalva:** o cron do GitHub Actions não garante precisão de minuto — sob
carga da plataforma pode atrasar alguns minutos. Tolerável porque o lembrete
já sai com 15 min de folga e `/api/disparar` reprocessa qualquer coisa
vencida na última hora.

**Vigia** ([`../.github/workflows/vigia.yml`](../.github/workflows/vigia.yml)):
a cada 30 minutos, confere se `disparar.yml` teve alguma execução com sucesso
nos últimos ~10 minutos. Se não teve, abre uma Issue no repositório (que
notifica por e-mail); fecha sozinha quando o gatilho volta a rodar.

> Limite honesto: se o repositório inteiro ficar 60+ dias sem nenhuma
> atividade, o GitHub suspende **todos** os workflows agendados de uma vez —
> inclusive o vigia. Não há como um workflow agendado vigiar essa suspensão
> específica sem algo externo sempre ligado, fora do escopo gratuito daqui.

Se um dia precisar migrar para uma máquina própria (self-hosted), o caminho
já existe pronto em [`../producao/README.md`](../producao/README.md) — o
script `disparar.sh` + `crontab` fazem a mesma coisa, independente de onde o
Postgres está.

Conferir manualmente:

```sh
curl -fsS -H "Authorization: Bearer $DISPARAR_SECRET" \
  https://agendaapp-ndmg-devs-projects.vercel.app/api/disparar
# → {"ok":true,"enviados":0,"falhas":0,"inscricoesRemovidas":0}
```

---

## 5. No iPhone (Tarefa 11) — já validado, roteiro para referência

Web Push no iOS exige **iOS 16.4+** e o PWA **instalado na tela inicial**. No
Safari comum não funciona, e isso não é contornável.

1. Abrir `https://agendaapp-ndmg-devs-projects.vercel.app` no **Safari**.
2. **Compartilhar → Adicionar à Tela de Início.**
3. Abrir o app **pelo ícone da tela inicial**.
4. Importar a grade (só na primeira vez).
5. Tocar em **"Ativar lembretes"** e conceder a permissão.
   O botão fica verde e diz quantos lembretes foram agendados.
6. Em Ajustes (⚙), configurar a trava — Face ID ou PIN.

### O teste que prova tudo

1. Criar um atendimento **daqui a ~20 minutos** (use "só nesta data").
2. Conferir no banco que o lembrete chegou (via `neonctl` ou o painel do
   Neon):
   ```sql
   select ocorrencia_uid, disparar_em, enviado from lembretes order by disparar_em limit 5;
   ```
   O `disparar_em` deve ser **15 minutos antes** do horário do atendimento.
3. **Fechar o app** no iPhone (deslizar para cima, tirar do multitarefa).
4. Esperar. A notificação deve chegar com **hora e nome do paciente** — montada
   no aparelho, porque o servidor mandou só o id opaco.

### Se não chegar

| Sintoma | Onde olhar |
| --- | --- |
| botão diz "Instale na tela inicial" | está no Safari, não no app instalado |
| permissão não aparece | iOS < 16.4, ou o toque não veio do botão |
| `lembretes` vazio no banco | a sincronização falhou — ver console do app |
| `enviado = false` e `disparar_em` no passado | o cron não está batendo: testar o `curl` à mão |
| `enviado = true` e nada chegou | Apple recusou o push — conferir `VAPID_SUBJECT` e as chaves |
| notificação genérica ("Atendimento em breve") | o uid chegou mas não está no banco local do aparelho |

Atraso de alguns minutos é normal no iOS — por isso o lembrete sai com 15
minutos de folga.

---

## Depois de publicar

- A agenda vive **só no iPhone**. Trocar de aparelho, limpar os dados do Safari
  ou desinstalar o PWA **apaga tudo**, e o servidor não tem cópia (por desenho).
  Não existe exportação hoje — se isso preocupar, é a próxima coisa a construir.
- O banco (Neon) e a Vercel são serviços de terceiros: se um deles cair ou
  mudar de plano/preço, os lembretes param (a agenda no aparelho continua
  funcionando offline).
