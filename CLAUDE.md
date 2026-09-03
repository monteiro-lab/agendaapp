# CLAUDE.md — contrato de trabalho neste repositório

Projeto: **Agenda de Atendimentos** — PWA com lembretes que disparam com o app fechado.
Fonte da verdade da especificação: [`docs/SPEC.md`](docs/SPEC.md). Este arquivo é o
**contrato de como trabalhar**; o SPEC é **o que construir**. Em caso de conflito entre
os dois, o SPEC vence quanto ao produto, este arquivo vence quanto ao processo.

---

## 1. Invariantes (não violar, nunca)

1. **Dados de paciente só no aparelho.** Nome, telefone e observações vivem apenas no
   IndexedDB (Dexie). Não podem ser enviados a nenhuma rota `/api/*`, gravados no
   Postgres, colocados no payload do push, em logs, em URLs ou em mensagens de erro.
2. **O servidor só conhece id opaco.** O Postgres guarda: inscrição push
   (`endpoint`, `p256dh`, `auth`), `ocorrencia_uid` (UID aleatório, sem significado) e
   `disparar_em`. Nada mais.
3. **Payload do push = `{ uid }`.** O service worker resolve nome/detalhes localmente.
4. **`/api/disparar` é sempre protegida** por `DISPARAR_SECRET`, validado no header
   **antes de qualquer consulta ao banco**.
5. **Postgres nunca na Vercel.** Funções serverless são stateless, escalam a zero e não
   têm storage durável. O banco roda na máquina das outras aplicações, exposto com SSL.
6. **O gatilho de minuto é externo.** `crontab` da máquina do Postgres batendo em
   `/api/disparar`. O cron nativo da Vercel (Hobby) roda 1x/dia e não serve; não existe
   worker sempre ligado na Vercel.
7. **Segredos só em variáveis de ambiente.** `VAPID_PRIVATE_KEY` e `DISPARAR_SECRET`
   nunca no bundle do cliente (apenas `VITE_*` vai para o cliente).

## 2. Processo de execução

- Seguir a **seção 10 do SPEC**, **uma tarefa por vez**, na ordem.
- Para cada tarefa: **plano curto primeiro** (arquivos a criar/mudar + abordagem),
  esperar o "ok" do usuário, só então implementar.
- Ao concluir: dizer **o que mudou**, **como verificar** (comando ou passo manual) e
  **parar**. Não avançar para a próxima tarefa sem pedido explícito.
- Ambiguidade → **perguntar**, não supor. Não aumentar escopo.
- Pedir confirmação antes de **instalar dependências pesadas** ou **apagar arquivos**.
- Idioma de trabalho e de UI: **português do Brasil**.

## 3. Stack e limites técnicos

- **App:** React + TypeScript + Vite + `vite-plugin-pwa` + Dexie. Mobile-first (iPhone).
- **Rotas serverless:** `app/api/*` (funções da Vercel, Node). Root do deploy = `app/`.
- **Banco:** Postgres puro, migrations em `db/migrations/*.sql`, aplicadas via PgAdmin
  (e automaticamente pelo `docker-compose` no dev local).
- **iOS:** Web Push exige PWA instalado na tela inicial (iOS 16.4+) e permissão pedida
  **a partir de um toque do usuário**. Pode atrasar minutos → lembrete com folga (15 min).
- **Dev local:** `docker-compose.yml` (postgres + pgadmin + app). Não é alvo de deploy.

## 4. Convenções acordadas

- **Fuso horário:** `America/Sao_Paulo`. `hora` é string local (`"14:00"`, `"10:20"`);
  a conversão para `timestamptz` acontece no cliente, que envia ISO em UTC.
- **`regraCobranca`** (`particular` | `copart20` | `copart40` | `pos`) é **rótulo
  informativo** — não há cálculo financeiro no escopo.
- **VAGO** = slot de recorrência sem `pacienteId` (nulo). Não é ausência de linha.
- **Horário livre:** a grade não é só de hora cheia (existe `10:20`).
- **Slots múltiplos:** o mesmo dia/hora pode ter mais de um paciente.
- **Dev local vs. produção:** a `DATABASE_URL` local **não** usa `sslmode=require`
  (o Postgres do compose não tem SSL); a de produção usa.
- Nomes de arquivos, tabelas e campos em **português**, como já está no SPEC.

## 5. Dados de referência

- `Agenda Atualizada.pdf` (raiz) — a grade real que semeia `recorrencias` na Tarefa 3.
  **Contém nomes de pacientes**: é insumo local, não versionar em repositório público
  nem enviar a serviços externos.
