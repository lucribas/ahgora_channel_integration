# Ahgora Channel Integration

Automatiza a comparacao das batidas do Ahgora com os apontamentos do Channel e
permite importar apontamentos de um arquivo CSV.

## Modos de operacao

- **Importa CSV:** le cada linha do CSV e cria o apontamento correspondente no
  Channel.
- **Importa Ahgora:** consulta os dois sistemas, encontra dias ainda nao
  apontados e usa a configuracao do `Expert` para gerar o apontamento.
- **Dry-run:** executa o processamento e mostra o que seria gravado, sem chamar
  a operacao de inclusao do Channel. Com CSV, o dry-run e totalmente offline e
  nao pede credenciais.

## Requisitos

- Ruby 2.7 ou superior;
- Bundler;
- Google Chrome ou Chromium.

Instale as dependencias na raiz do projeto:

```bash
bundle install
```

O projeto usa `webdrivers` para detectar a versao do Chrome e obter um
ChromeDriver compativel. Para usar binarios instalados manualmente, configure
`CHROME_BINARY` e/ou `CHROMEDRIVER_PATH`.

## Configuracao

Copie o arquivo de exemplo, edite os valores e carregue-o no terminal:

```bash
cp config.example.sh config.sh
source config.sh
```

`config.sh` e ignorado pelo Git. As variaveis necessarias sao:

| Variavel | Uso |
| --- | --- |
| `AHGORA_LOGIN_URL` | Pagina de login da empresa no Ahgora |
| `AHGORA_BATIDAS_URL` | Pagina-base das batidas |
| `AHGORA_MIRROR_URL` | Pagina do espelho de ponto na interface atual |
| `AHGORA_MATRICULA` | Matricula do usuario |
| `AHGORA_PUNCH_OVERRIDES` | Correcoes manuais opcionais no formato `data=hora,hora,...` |
| `CHANNEL_LOGIN_URL` | Pagina de login do Channel |
| `CHANNEL_EXTRATO_URL` | Pagina do extrato de apontamentos |
| `CHANNEL_USERNAME` | Usuario do Channel |
| `CHANNEL_DEFAULT_PROJECT` | Projeto usado pelo `Expert` |
| `CHANNEL_DEFAULT_ACTIVITY` | Atividade associada pelo `Expert` |
| `CHANNEL_DEFAULT_ACTIVITY_TYPE` | Tipo de atividade; padrao `Nenhum` |
| `CHANNEL_DEFAULT_TASK` | Tarefa; padrao `Nenhum` |

As senhas podem ser informadas interativamente ou pelas variaveis opcionais
`AHGORA_PASSWORD` e `CHANNEL_PASSWORD`. Evite passa-las na linha de comando,
pois argumentos podem aparecer na lista de processos.

## CSV

O arquivo deve ter este cabecalho:

```csv
Tipo,Projeto,Tipo de Atividade,Associar Atividade,Associar tarefa,Data,Duração,Comentarios
PROJETOS,T15C0131.0,Nenhum,2.1.5.5,Nenhum,01/12/2021,08:00,
```

Datas usam `DD/MM/AAAA` e duracoes usam `HH:MM`. Os textos dos campos de
selecao podem ser prefixos das opcoes exibidas pelo Channel.

### Validar o CSV sem acessar sistemas externos

```bash
bundle exec ruby source/faz_apontamentos.rb \
  --import-csv source/apontamentos.csv \
  --dry-run
```

Forma curta equivalente:

```bash
bundle exec ruby source/faz_apontamentos.rb -i source/apontamentos.csv -n
```

### Importar o CSV

```bash
bundle exec ruby source/faz_apontamentos.rb -i source/apontamentos.csv
```

O programa pede confirmacao para cada item. `a` confirma todos os itens
restantes e `q` encerra a importacao sem processar os seguintes.

## Ahgora para Channel

Depois de carregar `config.sh`, execute:

```bash
bundle exec ruby source/faz_apontamentos.rb
```

Para consultar e calcular os novos apontamentos sem grava-los:

```bash
bundle exec ruby source/faz_apontamentos.rb --dry-run
```

Para selecionar explicitamente um mes do espelho (por exemplo, agosto de
2026), use:

```bash
bundle exec ruby source/faz_apontamentos.rb --month 2026-08 --dry-run
```

O mes segue o periodo de fechamento do espelho: agosto corresponde a 26 de
julho ate 25 de agosto.

Esse dry-run ainda autentica nos dois sistemas para realizar as consultas, mas
nunca chama `Channel#push_batida`.

Opcoes adicionais:

- `-d`, `--debug`: logs detalhados;
- `-s`, `--show-browser`: exibe o navegador;
- `-y`, `--year`: consulta os meses do ano atual;
- `-m`, `--month AAAA-MM`: consulta um mes especifico do espelho;
- `-n`, `--dry-run`: simula as inclusoes.

## Arquitetura

- `source/faz_apontamentos.rb`: CLI e orquestracao;
- `source/Ahgora.rb`: leitura das batidas via Selenium;
- `source/Channel.rb`: leitura e inclusao no Channel;
- `source/Expert.rb`: transforma horas nao apontadas em atividades;
- `source/vars.rb`: acesso centralizado as variaveis de ambiente;
- `source/stdoutlog.rb`: log em terminal e arquivo.

Os logs e screenshots ficam em `log/` e nao sao versionados.

## Testes

```bash
bundle exec ruby -Itest test/all_test.rb
```
