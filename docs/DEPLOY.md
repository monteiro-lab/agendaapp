# Publicar e validar no iPhone

O passo a passo do que falta para o lembrete tocar no aparelho com o app
fechado. Três peças precisam estar de pé ao mesmo tempo:

```
[iPhone: PWA instalado]  ←push─  [Vercel: /api/*]  ←SQL→  [sua máquina: Postgres]
                                        ↑
                                  (crontab a cada minuto, na sua máquina)
```

---

## 1. Postgres alcançável pela Vercel

A função serverless roda na internet: `localhost` não serve.

1. Expor a máquina do banco com host/DNS público e a porta liberada.
2. Ligar **SSL** no Postgres (`ssl = on`, com certificado — autoassinado serve).
3. Aplicar as migrations e criar o usuário mínimo: ver
   [`../db/README.md`](../db/README.md) e
   [`../producao/usuario_minimo.sql`](../producao/usuario_minimo.sql).

Testar de fora da sua rede:

```sh
psql "postgres://agenda_app:SENHA@SEU_HOST:5432/agenda?sslmode=require" -c "select 1"
```

## 2. Deploy do app

O root do projeto na Vercel é **`app/`** — é lá que estão o `package.json` e a
pasta `api/`. A detecção de framework (Vite) cuida do resto.

```sh
cd app
npx vercel            # primeira vez: vincula o projeto
npx vercel --prod
```

Na tela de configuração, se perguntado: **Root Directory = `app`**.

### Variáveis de ambiente (painel da Vercel → Settings → Environment Variables)

| Variável | Valor |
| --- | --- |
| `DATABASE_URL` | `postgres://agenda_app:SENHA@SEU_HOST:5432/agenda?sslmode=require` |
| `VAPID_PUBLIC_KEY` | a mesma do `.env` local |
| `VAPID_PRIVATE_KEY` | idem — **só no servidor** |
| `VAPID_SUBJECT` | `mailto:seu@email` |
| `DISPARAR_SECRET` | o mesmo que vai no crontab |
| `VITE_VAPID_PUBLIC_KEY` | igual à `VAPID_PUBLIC_KEY` |
| `VITE_API_BASE` | **deixe vazio** — app e API no mesmo domínio |

O `.env` local não sobe no deploy. Só as `VITE_*` entram no bundle do cliente;
`VAPID_PRIVATE_KEY` e `DISPARAR_SECRET` ficam no servidor.

⚠️ As `VITE_*` são lidas **no build**. Mudou uma delas? Refaça o deploy.

## 3. Gatilho de minuto

Na máquina do Postgres, seguir [`../producao/README.md`](../producao/README.md):
instalar `disparar.sh`, criar `/etc/agenda-disparar.env` com a URL da Vercel e o
segredo, e adicionar a linha do `crontab`.

Conferir:

```sh
curl -fsS -H "Authorization: Bearer $DISPARAR_SECRET" \
  https://SEU-APP.vercel.app/api/disparar
# → {"ok":true,"enviados":0,"falhas":0,"inscricoesRemovidas":0}
```

---

## 4. No iPhone (Tarefa 11)

Web Push no iOS exige **iOS 16.4+** e o PWA **instalado na tela inicial**. No
Safari comum não funciona, e isso não é contornável.

1. Abrir a URL da Vercel no **Safari** (não em outro navegador).
2. **Compartilhar → Adicionar à Tela de Início.**
3. Abrir o app **pelo ícone da tela inicial**.
4. Importar a grade (só na primeira vez).
5. Tocar em **"Ativar lembretes"** e conceder a permissão.
   O botão fica verde e diz quantos lembretes foram agendados.
6. Em Ajustes (⚙), configurar a trava — Face ID ou PIN.

### O teste que prova tudo

1. Criar um atendimento **daqui a ~20 minutos** (use "só nesta data").
2. Conferir no banco que o lembrete chegou:
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
- O Postgres precisa continuar ligado e alcançável: se a máquina cair, os
  lembretes param (a agenda no aparelho continua funcionando).
