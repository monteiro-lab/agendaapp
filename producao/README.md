# Produção — a máquina que hospeda o Postgres

Dois papéis rodam aqui: o **banco** e o **gatilho de minuto**. O app fica na
Vercel; esta máquina é o que ela não pode ser — algo sempre ligado, com disco.

```
producao/
├── usuario_minimo.sql   # papel da aplicação no Postgres (contém senha)
└── disparar.sh          # o gatilho de minuto, chamado pelo crontab
```

## 1. Banco

Ver [`../db/README.md`](../db/README.md): aplicar as migrations, rodar o
`usuario_minimo.sql` e expor o Postgres com SSL.

## 2. Gatilho de minuto

A Vercel não serve para isso: função serverless escala a zero e o cron do plano
Hobby dispara **1x por dia**. Então quem acorda o app a cada minuto é o
`crontab` desta máquina.

### Instalar

```sh
sudo install -m 0755 disparar.sh /usr/local/bin/agenda-disparar
sudo install -m 0600 /dev/null   /etc/agenda-disparar.env
sudo tee /etc/agenda-disparar.env >/dev/null <<'EOF'
API_BASE=https://SEU-APP.vercel.app
DISPARAR_SECRET=o-mesmo-segredo-cadastrado-na-vercel
EOF
sudo chmod 0600 /etc/agenda-disparar.env
```

O segredo fica **no arquivo de ambiente, com modo 0600** — nunca na linha do
crontab: argumento de processo aparece no `ps aux` para qualquer usuário da
máquina.

### A linha do crontab

```sh
crontab -e
```

```cron
* * * * * /usr/local/bin/agenda-disparar
```

O script já cuida de:

- **não sobrepor rodadas** (`flock`; se a anterior ainda roda, esta é pulada);
- **desistir em 45s**, antes que o cron dispare a próxima;
- **calar quando não há nada** — só registra no log quando houve envio ou
  falha, senão seriam 1440 linhas por dia.

### Conferir

```sh
# na mão, uma vez:
sudo AGENDA_ENV=/etc/agenda-disparar.env /usr/local/bin/agenda-disparar

# o que o cron registrou (Debian/Ubuntu):
journalctl -t CRON --since '10 min ago'
grep agenda-disparar /var/log/syslog

# a fila, direto no banco:
psql -U agenda -d agenda -c \
  "select count(*) filter (where not enviado) pendentes,
          count(*) filter (where not enviado and disparar_em <= now()) vencidos
     from lembretes;"
```

Se `vencidos` ficar crescendo, o gatilho não está chegando na Vercel: teste o
`curl` à mão e confira `API_BASE`, o segredo e a saída de rede da máquina.

### Comportamento verificado

| Situação | Resultado |
| --- | --- |
| nada vencido | silencioso, sai 0 |
| lembrete vencido | registra `{"ok":true,"enviados":N,...}`, sai 0 |
| segredo errado | `401`, mensagem no stderr, sai 1 (o cron avisa) |
| `API_BASE` ausente | falha explicando qual variável falta, sai 1 |
