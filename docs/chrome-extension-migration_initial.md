# Prompt inicial — migração da automação Ruby para extensão Chrome

## Leitura Obrigatória

Antes de gerar o plano, descubra `$ROOT` pela raiz do workspace ou do repositório Git, inspecione `git status` e leia integralmente, quando existirem:

- `apps/chrome-extension/propose.md`, como proposta de produto e critérios desejados;
- `apps/standalone/README.md`, `apps/standalone/Gemfile`, `apps/standalone/Gemfile.lock`, `apps/standalone/config.example.sh`, `apps/standalone/executar_ultima_semana.sh` e `apps/standalone/ansible/instalar_prerequisitos.yml`;
- `apps/standalone/source/faz_apontamentos.rb`, `apps/standalone/source/Ahgora.rb`, `apps/standalone/source/Channel.rb`, `apps/standalone/source/Expert.rb`, `apps/standalone/source/vars.rb` e `apps/standalone/source/stdoutlog.rb`;
- `apps/standalone/test/all_test.rb` e `apps/standalone/test/support/fake_channel.rb`;
- demais instruções, documentação, prompts, planos, resultados, código, testes e configurações executáveis que passem a existir no escopo antes da elaboração do plano.

Não leia nem copie para o plano arquivos locais com credenciais, logs, screenshots, PDFs, CSVs, registros de ponto ou dados pessoais. Em particular, não use `apps/standalone/config.sh`, o conteúdo de `apps/standalone/log/` nem CSVs locais como fonte. Caso uma validação futura dependa de dados desse tipo, planeje fixtures sintéticas e sanitizadas e registre a validação real como pendência controlada.

Trate o código, os testes e as configurações executáveis como fontes de verdade para o comportamento atual. Trate `apps/chrome-extension/propose.md` como fonte dos requisitos da migração. Identifique e registre divergências entre proposta, README, código ativo, código legado, testes e configurações, sem corrigir nem reproduzir silenciosamente comportamentos duvidosos.

## Contexto

- `$ROOT` é a raiz do repositório atual, descoberta pelo workspace ou Git.
- Este artefato está em `docs/chrome-extension-migration_initial.md`.
- As áreas envolvidas são `apps/standalone/`, `apps/chrome-extension/` e `docs/`.
- No estado verificado ao criar este prompt, `apps/chrome-extension/` contém somente `propose.md`: ainda não há implementação, manifesto, package manager, build ou testes da extensão.
- A implementação de referência é uma CLI Ruby com Selenium. `faz_apontamentos.rb` coordena os modos Ahgora → Channel e importação de CSV, períodos, dry-run, comparação, confirmação e gravação; `Ahgora.rb` lê o espelho; `Channel.rb` consulta e inclui apontamentos; `Expert.rb` converte horas ainda não apontadas em atividade configurada.
- O fluxo ativo do Ahgora abre o espelho em um iframe, trabalha com períodos de fechamento de 26 a 25, seleciona o mês, interpreta o calendário textual, aceita overrides configurados, ignora dias sem batidas ou com quantidade ímpar e soma pares de batidas em minutos. O método de tabela legado deve ser distinguido do caminho ativo antes de qualquer portabilidade.
- `Channel#get_batidas` filtra o extrato pelo período e retorna uma entrada para cada linha lida, sem somar entradas da mesma data. Em seguida, `faz_apontamentos.rb` converte essas entradas com `map { ... }.to_h`; se houver datas duplicadas, somente o último valor encontrado para cada data é preservado. Sobre esse resultado, o orquestrador só cria candidatos para datas ausentes; datas existentes com duração divergente são relatadas, mas não corrigidas automaticamente. Essa substituição pelo último valor é semântica observável de paridade, ainda que possa ser considerada uma limitação.
- O `Expert` ativo exige duração positiva e atribui toda a duração a um único projeto e uma única atividade configurados; tipo de atividade e tarefa possuem defaults. O método de exemplo contém regras interativas e históricas que não devem ser tratadas como regra ativa sem evidência.
- Antes de cada gravação há confirmação individual, opção de confirmar todos os itens restantes, recusa ou saída. O dry-run não chama a inclusão no Channel. A inclusão ativa salva o formulário e tenta capturar a resposta exibida pelo site.
- A automação Ruby autentica com usuário e senha e controla o navegador por WebDriver. A extensão deve substituir isso pelo uso das sessões já autenticadas em abas abertas, sem solicitar, capturar, armazenar ou transmitir senhas, cookies ou tokens.
- Os testes Ruby existentes cobrem apenas parte do comportamento, incluindo períodos do espelho, configuração do `Expert`, dry-run de CSV e saída sem gravação. O plano não deve inferir cobertura ou paridade além dessas evidências.
- A proposta contém requisitos mais amplos que o comportamento Ruby observável. O plano deve rotular claramente o que é paridade, adaptação obrigatória ao navegador, melhoria deliberada ou item fora do primeiro recorte.

## Saída Esperada

Gere exclusivamente o plano em `docs/chrome-extension-migration_plan.md`; não implemente código, não crie a extensão e não altere outros artefatos nesta etapa.

O plano deve ser acionável, incremental, rastreável e reutilizável como prompt de implementação. Deve conter resumo executivo, estado atual comprovado, matriz dos comportamentos e contratos afetados, escopo e fora de escopo, decisões técnicas, premissas, riscos, pendências, validações, divergências e entregáveis por arquivo. Relacione cada comportamento Ruby relevante à futura implementação TypeScript e ao respectivo teste de paridade.

Durante a geração e revisão do plano, use subagentes com `gpt-5.6-sol` e esforço `high`: uma etapa de geração ou correção e uma etapa independente de gateway de revisão por ciclo. Repita por até três ciclos, consolidando os achados na thread principal. Não confunda esses ciclos editoriais com as ondas de implementação descritas pelo plano.

O arquivo `docs/chrome-extension-migration_plan.md` deve começar com a seguinte abertura operacional, preservando seu sentido e seus limites:

```md
seja:
- $ROOT=<raiz do repositório atual, descoberta pelo workspace ou Git>
- $PLAN_PATH=docs/chrome-extension-migration_plan.md
- N=3

durante a execução do plano:
- execute até N ondas sequencialmente;
- depois de cada onda, execute um gate independente contra os requisitos, o código atual e validações proporcionais ao risco;
- se um gate falhar, corrija a onda com base nos achados e repita o gate, limitando-o a três ciclos de correção;
- após o terceiro ciclo sem aprovação, interrompa a progressão, registre a pendência e aguarde direcionamento do usuário;
- depois da última onda aprovada, execute um gate final independente de integração ou e2e proporcional ao escopo;
- registre o resultado em docs/chrome-extension-migration_plan-results.md, incluindo escopo implementado, decisões, premissas, validações, observações, pendências residuais e melhorias futuras.
```

Separe explicitamente cada onda de implementação, seu gate independente e o gate final. Para cada onda, detalhe objetivo, dependências, arquivos previstos, comportamento a preservar, testes, comandos de validação, evidências esperadas, critérios de aprovação e condições de parada. Planeje até três ondas, sem preencher artificialmente todas elas quando uma decomposição menor for suficiente.

## Prompt Base

### Objetivo

Planeje a migração incremental da automação Ruby de `apps/standalone/` para uma extensão Google Chrome Manifest V3 em `apps/chrome-extension/`, com TypeScript estrito e sem Ruby em runtime. A extensão deverá capturar o espelho de ponto na aba já autenticada do Ahgora, aplicar com fidelidade as regras ativas do Ruby, comparar ou preencher o Channel na respectiva aba autenticada, exibir prévia e exigir ação explícita do usuário antes de qualquer envio definitivo.

O plano deve preservar primeiro o comportamento observável. Correções funcionais, robustez adicional e novas capacidades propostas devem ser separadas da paridade e justificadas. Não invente seletores, URLs, regras de negócio, arredondamentos, eventos DOM, permissões, formatos ou arquitetura.

### Áreas e fontes a inspecionar

- `apps/standalone/source/faz_apontamentos.rb`: entrada, opções, validação de período e configuração, modos de operação, conversão das linhas com `map { ... }.to_h`, comparação por data, dry-run, confirmação e tratamento de falhas;
- `apps/standalone/source/Ahgora.rb`: fluxo ativo e legado, iframe, seleção do período 26–25, seletores, parsing, overrides, formatos, cálculos, waits, screenshots e condições de erro;
- `apps/standalone/source/Channel.rb`: leitura do extrato, paginação, filtros, parsing, tipos de apontamento, campos, seletores, retries, salvamento e resposta do site;
- `apps/standalone/source/Expert.rb`: regras ativas, regras apenas exemplificativas, formatos, validações e configuração de projeto/atividade;
- `apps/standalone/source/vars.rb`, `apps/standalone/config.example.sh` e documentação: contratos de configuração, defaults e distinção entre valores públicos, identificadores pessoais e segredos;
- `apps/standalone/test/`: baseline comprovado, lacunas e oportunidades de golden master/paridade sem dados reais;
- `apps/chrome-extension/propose.md`: experiência desejada, arquitetura sugerida, segurança, robustez, testes, documentação e critérios de aceite;
- `apps/chrome-extension/`: confirme novamente o estado no momento do planejamento e preserve qualquer evolução posterior do usuário;
- `docs/`: confirme se surgiram artefatos anteriores de mapeamento, plano ou resultados e confronte-os com o código entregue.

### Comportamentos e contratos a mapear

- Fluxo ponta a ponta, seleção de período, formatos de data e duração, cálculo por pares de batidas e comparação Ahgora/Channel.
- Regra exata para datas ausentes, datas com o mesmo total e datas com total divergente. Preserve como referência de paridade o fato de que linhas repetidas do Channel não são somadas e que a conversão para hash mantém apenas o último valor de cada data. Qualquer agregação, soma de duplicidades ou correção de divergências deve ser tratada como mudança funcional deliberada, separada da reprodução fiel e coberta por decisão e testes próprios.
- Configuração e alocação do `Expert`, incluindo valores obrigatórios, defaults, validação de duração e separação entre método ativo e exemplo histórico.
- Confirmação, opção equivalente ao dry-run, prevenção de duplicidade, preenchimento parcial, cancelamento e submissão final.
- Seletores e estratégias reais do DOM, iframe, carregamento assíncrono, retries, timeouts e sleeps existentes. O plano deve substituir sleeps fixos por condições observáveis somente quando a equivalência e a condição aguardada estiverem claras.
- Erros e limitações observáveis, inclusive suposições frágeis do parsing atual, sem convertê-los silenciosamente em requisitos desejados.
- Funcionalidades dependentes de CLI, filesystem, CSV, WebDriver, variáveis de ambiente, logs e screenshots, indicando para cada uma adaptação ao navegador, recorte posterior ou exclusão justificada.

### Decisões que o plano deve fechar

- Estrutura final dentro de `apps/chrome-extension/`, package manager, versões mínimas e ferramenta de build, evitando frameworks de UI sem justificativa.
- Fronteiras entre domínio puro, adapters DOM dos dois sites, content scripts, coordenação entre abas, mensagens, popup, configuração e testes.
- Estratégia de descoberta e seleção de zero, uma ou múltiplas abas, detecção de login, navegação durante a operação, cancelamento e retomada segura.
- Contratos tipados e validação em runtime de mensagens, payloads, remetente, aba, URL e operação corrente entre service worker, content scripts e popup.
- Permissões mínimas do Manifest V3. Como as URLs vêm de configuração e `config.example.sh` contém valores genéricos ou placeholders, o plano deve definir uma estratégia segura e testável para `host_permissions` sem fabricar domínios e sem recorrer silenciosamente a `<all_urls>` ou à permissão `cookies`.
- Política de dados: estado transitório preferencialmente em memória ou `chrome.storage.session`, preferências não sensíveis somente quando necessárias, sem histórico permanente, telemetria, código remoto, credenciais, cookies, tokens ou conteúdo pessoal em logs.
- Modelo de datas civis e durações inteiras que preserve os formatos e a precisão do Ruby sem conversões acidentais de timezone ou arredondamentos novos.
- Estratégia de seleção e disparo de eventos compatível com o DOM real do Channel, sem presumir frameworks ou eventos que não tenham evidência.
- Escopo da primeira entrega para o modo CSV e para tipos `OPERACOES` e `AVULSO`: inclua-os somente se a proposta e a evidência sustentarem a prioridade; caso contrário, registre-os explicitamente como fora de escopo e preserve a rastreabilidade.
- Tratamento do envio definitivo. O padrão deve ser captura, prévia e preenchimento para revisão; qualquer ação de salvar/enviar precisa de confirmação explícita, totais visíveis e evidência de que o site reconheceu os valores.
- Estratégia de configuração para projeto, atividade, tipo e tarefa sem embutir identificadores pessoais ou corporativos no código, manifesto, fixtures ou documentação.
- Compatibilidade, empacotamento, carregamento como extensão descompactada, manutenção de seletores e diagnóstico sanitizado.

### Entregáveis a representar no plano

- implementação Manifest V3 em `apps/chrome-extension/`, com TypeScript `strict: true`, dependências mínimas e separação de responsabilidades;
- interface em português do Brasil para detecção das abas, captura, período, prévia, totais, divergências, avisos, preenchimento, relatório e confirmação quando suportada;
- `docs/ruby-to-extension-mapping.md`, rastreando código Ruby, responsabilidade, comportamento observado, destino TypeScript, teste de paridade e status;
- documentação da extensão sobre instalação, comandos, arquitetura, permissões, política de dados, uso, validação manual, limitações e troubleshooting, com caminhos finais coerentes com `apps/chrome-extension/`;
- scripts para desenvolvimento, build, typecheck, lint, testes unitários, testes de integração e empacotamento, ajustados às ferramentas efetivamente escolhidas;
- fixtures sintéticas e sanitizadas, testes unitários de domínio e mensagens, testes de adapters DOM e estratégia de golden master/paridade com o Ruby;
- integração ou e2e local que cubra, quando viável, duas páginas simuladas, captura, prévia, preenchimento e ausência de submissão sem confirmação;
- atualização de governança somente se fizer parte dos requisitos aceitos e sem substituir instruções que venham a existir;
- registro final da execução em `docs/chrome-extension-migration_plan-results.md`.

### Validação esperada

- Estabeleça o baseline dos testes Ruby aplicáveis sem alterar expectativas para fazê-los passar e sem expor dados locais.
- Planeje testes de paridade com entradas determinísticas e sanitizadas, usando o Ruby como oráculo quando a regra puder ser isolada com alteração mínima.
- Cubra parsing e formatação de datas e durações, períodos 26–25, quantidade par e ímpar de batidas, overrides, ausência de registros, duração inválida ou não positiva, configuração do `Expert`, dias novos, iguais e divergentes, linhas duplicadas do Channel com preservação do último valor, prevenção de preenchimento duplicado e preenchimento parcial.
- Valide contratos de mensagens, origem e URL das abas, permissões do manifesto, ausência de `<all_urls>`, ausência de segredos e proibição de código remoto.
- Inclua comandos e critérios de aprovação para testes, typecheck, lint, build, empacotamento, inspeção do manifesto e do pacote, `git diff --check` e `git status`.
- Reserve validação manual autenticada apenas ao que não puder ser comprovado localmente: seletores reais, frames, eventos aceitos, estados de login, reconhecimento dos valores, mensagens do site e eventual submissão. Não declare equivalência ou sucesso sem evidência.
