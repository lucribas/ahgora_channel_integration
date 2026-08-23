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

# Plano de implementação — migração da automação Ruby para extensão Chrome

## 1. Como executar este plano

Este arquivo é o prompt operacional da implementação. Antes de iniciar cada onda:

1. descubra e confirme `$ROOT` por `git rev-parse --show-toplevel`;
2. leia integralmente `docs/chrome-extension-migration_initial.md`, este plano e as instruções aplicáveis que existirem no momento da execução;
3. execute `git status --short`, identifique alterações preexistentes e não as descarte, sobrescreva ou inclua inadvertidamente;
4. confirme o estado atual de `apps/chrome-extension/`, porque a constatação de que ele contém apenas `propose.md` vale para o planejamento e pode mudar antes da implementação;
5. não leia, copie, versione ou exponha `apps/standalone/config.sh`, `apps/standalone/log/`, PDFs, TXT, screenshots, dumps, CSVs locais ou dados pessoais. Não leia nem use `apps/standalone/source/apontamentos_channel_julho_2026.csv`;
6. use fixtures sintéticas e sanitizadas. Se uma validação depender dos sites ou de dados reais, registre-a como validação manual controlada, sem copiar o conteúdo observado;
7. classifique cada requisito e alteração como `PARIDADE`, `ADAPTAÇÃO_MV3`, `MELHORIA_DELIBERADA` ou `FORA_DO_ESCOPO` e mantenha essa classificação em `docs/ruby-to-extension-mapping.md` e no resultado final;
8. não avance para a onda seguinte enquanto o gate da onda atual não estiver aprovado.

Os gates devem ser conduzidos por um revisor independente de quem implementou a onda. O revisor compara requisitos, diff, testes e evidências; não aceita declarações sem saída de comando ou inspeção reproduzível. Cada reprovação inicia um ciclo de correção na mesma onda, até o máximo de três. O Gate 1 também exige decisão humana explícita e, por isso, nunca pode ser autoaprovado por agente.

## 2. Resumo executivo

Migrar incrementalmente a automação Selenium/Ruby de `apps/standalone/` para uma extensão Chrome Manifest V3, sem Ruby em runtime e usando exclusivamente sessões que o usuário já autenticou nas abas do Ahgora e do Channel. A primeira entrega deverá capturar o espelho, preservar as regras ativas do Ruby, comparar os dados do Channel, apresentar prévia e preencher o formulário com revisão humana. Envio definitivo, quando tecnicamente validado, permanece separado, desabilitado por padrão e sujeito a confirmação explícita.

A execução tem três ondas:

- **Onda 1 — descoberta e decisão colaborativa:** pesquisar referências atuais e extensões semelhantes, comparar de duas a três propostas de UI/UX e alternativas técnicas, prototipar quando útil e pausar para o usuário escolher/aprovar a abordagem e os componentes;
- **Onda 2 — fundação, domínio e paridade:** criar o projeto conforme a decisão aprovada, portar regras puras e contratos, preparar manifesto seguro, testes e matriz Ruby → TypeScript;
- **Onda 3 — integração, UI e validação:** implementar adapters DOM, coordenação entre abas, experiência escolhida, prévia/preenchimento seguro, documentação, integração/e2e e empacotamento.

## 3. Estado atual comprovado e fontes de verdade

### 3.1 Estado do repositório no planejamento

- `apps/chrome-extension/` não possui implementação, manifesto, package manager, build ou testes; contém somente `propose.md`.
- Não há stack frontend estabelecida para a extensão. Package manager, ferramenta de build, biblioteca de validação e superfície da interface são decisões da Onda 1, não decisões implícitas deste plano.
- `apps/standalone/` é a referência funcional observável. Seus testes cobrem apenas uma parte da aplicação e não demonstram paridade completa.
- Artefatos locais e não versionados podem conter dados pessoais. Eles não são fontes autorizadas para fixtures ou documentação.

### 3.2 Leitura obrigatória da implementação

Revalidar, sem acessar os artefatos proibidos:

- `apps/standalone/source/faz_apontamentos.rb`: CLI, validação de períodos, modos Ahgora/CSV, comparação, semântica de hash, dry-run e confirmação;
- `apps/standalone/source/Ahgora.rb`: caminho ativo do espelho, iframe `mirror`, período 26–25, seleção mensal, parsing textual, overrides, batidas pares/ímpares e cálculo em minutos; manter `process_batidas_legacy` separado do caminho ativo;
- `apps/standalone/source/Channel.rb`: período do extrato, desativação de paginação, parsing linha a linha, seleção por prefixo, preenchimento, envio e resposta por toast;
- `apps/standalone/source/Expert.rb`: `associaProjeto` ativo, duração positiva, um projeto/atividade configurados e defaults; não portar `associaProjeto_exemplo` como regra ativa;
- `apps/standalone/source/vars.rb`, `apps/standalone/config.example.sh`, `apps/standalone/README.md`, scripts, Gemfiles e testes permitidos;
- `apps/chrome-extension/propose.md`, como requisitos de produto, segurança, arquitetura, teste e aceite;
- instruções e artefatos novos que existirem quando a execução começar.

Em divergências, priorizar código ativo, testes e configuração executável; registrar a divergência sem corrigir o comportamento silenciosamente.

## 4. Matriz inicial de comportamentos e contratos

Expandir esta matriz em `docs/ruby-to-extension-mapping.md` durante as Ondas 2 e 3. Cada linha deve apontar para origem Ruby, destino TypeScript, fixture/teste e evidência.

| ID | Classificação inicial | Comportamento observável ou contrato | Destino planejado | Cobertura mínima |
| --- | --- | --- | --- | --- |
| B01 | PARIDADE | No modo padrão, o Ruby usa literalmente `Date.today << 1`: seleciona o mês-calendário anterior, independentemente de hoje estar antes, no ou depois do dia 25, e processa de 26 do mês anterior ao selecionado até 25 do selecionado. `--month AAAA-MM` escolhe explicitamente um mês para a mesma janela 26–25 | domínio de datas, contratos e UI | caracterização com relógio injetado + paridade |
| B02 | PARIDADE | Caminho ativo entra no iframe `mirror`, seleciona mês e interpreta o calendário textual entre cabeçalho e resumo | adapter Ahgora | fixture DOM sanitizada + manual real |
| B03 | PARIDADE | Dia sem batida é omitido; quantidade ímpar de batidas é avisada e omitida | domínio | unitário + golden master |
| B04 | PARIDADE | Batidas são somadas em pares pelo cálculo literal `fim - início`, em minutos inteiros, sem regra de virada de dia ou arredondamento adicional; pares invertidos podem produzir total negativo e depois falhar no Expert | domínio | unitário + golden master |
| B05 | PARIDADE | Override configurado substitui integralmente as batidas capturadas; o Ruby usa a primeira entrada de uma data repetida, aceita qualquer par de dois dígitos em `HH:MM` sem validar faixas, rejeita formato diferente e deixa quantidade ímpar ser ignorada no processamento posterior | configuração/domínio | unitário + golden master |
| B06 | PARIDADE | Extrato Channel retorna uma entrada por linha; duplicidades não são somadas e a posterior conversão em hash preserva somente a última duração da data | domínio/adapter Channel | unitário + paridade explícita |
| B07 | PARIDADE | O Ruby itera somente as chaves do Ahgora: uma data do Ahgora ausente no Channel vira candidata; valor igual é `ok`; valor divergente é reportado sem correção; datas existentes somente no Channel são ignoradas | comparação/domínio/UI | unitário + integração |
| B08 | PARIDADE | `Expert#associaProjeto` exige duração positiva e aloca tudo em um único projeto/atividade configurados, com tipo e tarefa default `Nenhum` | configuração/domínio | unitário + golden master |
| B09 | PARIDADE; UX ADAPTADA É ADAPTAÇÃO_MV3 | O dry-run Ruby não chama inclusão; a prévia/dry-run da extensão deve manter a barreira equivalente: não enviar `FILL_TARGET`, não alterar DOM e não submeter. A confirmação Ruby permite incluir um item, recusá-lo, aprovar todos os restantes ou sair; representar ou agrupar essas ações de outra forma exige classificação `ADAPTAÇÃO_MV3` e aprovação humana | máquina de estados/UI | unitário + integração/e2e |
| B10 | PARIDADE | Seleções do Channel aceitam prefixo da opção; data é `DD/MM/AAAA` e duração `HH:MM` | adapter Channel | fixture DOM + manual real |
| B11 | ADAPTAÇÃO_MV3 | Login por senha/WebDriver é substituído por detecção de abas e sessões já autenticadas | service worker/content scripts/UI | integração + manual real |
| B12 | ADAPTAÇÃO_MV3 | Estado de operação e mensagens cruzam contextos MV3 com payload, remetente, aba, URL e `operationId` validados em runtime | mensagens/coordenação | unitário + integração |
| B13 | ADAPTAÇÃO_MV3 | Logs e screenshots locais são substituídos por diagnóstico sanitizado, sem conteúdo de página, pessoa, credencial, cookie ou token | shared/UI | unitário + revisão de segurança |
| B14 | MELHORIA_DELIBERADA | Sleeps fixos passam a condições observáveis, com timeout, erro acionável e cancelamento, somente onde a condição equivalente for comprovada | adapters/waits | integração + manual real |
| B15 | MELHORIA_DELIBERADA | Idempotência, detecção de navegação, preenchimento parcial e confirmação do valor reconhecido pelo site tornam falhas visíveis | coordenação/adapter/UI | integração/e2e + manual real |
| B16 | FORA_DO_ESCOPO INICIAL | Importação CSV, `OPERACOES`, `AVULSO`, regras históricas do método de exemplo e comentários sem suporte comprovado não entram na primeira entrega, salvo decisão explícita do usuário no Gate 1 | backlog documentado | rastreabilidade, sem implementação |
| B17 | PARIDADE OU FORA_DO_ESCOPO, CONFORME GATE 1 | Além do default e de `--month`, o Ruby oferece intervalo inclusivo `start/end` e `--year`; exige as duas pontas do intervalo, início ≤ fim e exclusividade entre intervalo, mês e ano. O Gate 1 define quais modos entram na primeira entrega | domínio/contratos/UI ou backlog explícito | unitário + integração para os modos aprovados |
| B18 | PARIDADE OU MELHORIA_DELIBERADA, CONFORME GATE 1 | O parser ativo de horários aceita `\d{2}:\d{2}` sem faixas; não modela virada de dia; horários fora de faixa e pares invertidos seguem o cálculo literal, e duração não positiva falha depois no Expert. Endurecer a validação ou interpretar overnight é mudança deliberada | domínio/configuração/UI | caracterização Ruby + decisão + golden master |
| B19 | PARIDADE/LIMITAÇÃO OU MELHORIA_DELIBERADA, CONFORME GATE 1 | Em `--year`, o Ahgora toma o ano de `Date.today << 1` e enumera janeiro até o mês-calendário anterior; o Channel inicia em `01/01` do ano de `Time.new - 31 dias` e termina hoje. Essa assimetria é comportamento observável, especialmente na virada do ano; harmonizá-la exige aprovação como melhoria deliberada | domínio/adapters/UI | caracterização em janeiro, fevereiro, meio do ano e virada dez/jan |

Reclassificações são permitidas apenas com justificativa e aprovação registradas. Em especial, somar duplicidades do Channel, exibir datas que existem somente no Channel, corrigir divergências existentes, harmonizar os períodos anuais Ahgora/Channel, validar faixas de horário, interpretar virada de dia, acrescentar arredondamento ou enviar automaticamente são mudanças funcionais, não paridade.

## 5. Escopo, limites e princípios transversais

### 5.1 Dentro da primeira entrega

- Manifest V3, TypeScript com `strict: true`, build e pacote carregável como extensão descompactada;
- fluxo Ahgora → comparação com Channel → prévia → preenchimento do tipo `PROJETOS`;
- domínio puro para datas civis e durações inteiras em minutos;
- seleção explícita quando houver múltiplas abas e mensagens acionáveis quando faltar aba/login;
- configuração não sensível para projeto, atividade, tipo e tarefa, sem identificadores reais em código, fixture ou documentação;
- pelo menos um modo de período aprovado no Gate 1, com os demais implementados somente se o usuário os incluir explicitamente na primeira entrega;
- semântica de decisão por item/lote e prévia/dry-run exatamente conforme a alternativa aprovada no Gate 1;
- permissões mínimas e política de dados sem histórico permanente, telemetria ou código remoto;
- documentação, mapeamento Ruby → TypeScript, testes unitários, adapters com DOM sintético, integração/e2e local proporcional e validação manual controlada.

### 5.2 Fora da primeira entrega, salvo decisão registrada no Gate 1

- importação de CSV e acesso a filesystem;
- tipos `OPERACOES` e `AVULSO`;
- regras interativas/históricas de `associaProjeto_exemplo`;
- preenchimento de comentários que o Ruby já marca como não funcional;
- agregação de duplicidades, correção automática de divergências ou novos arredondamentos;
- manipulação de senhas, cookies, tokens, CAPTCHA, MFA ou bypass de políticas de sessão;
- publicação na Chrome Web Store, telemetria, backend, sincronização em nuvem ou suporte a navegadores não aprovados;
- alegação de compatibilidade com DOM real antes da validação autenticada.
- modos de período não escolhidos no Gate 1, registrados individualmente como `FORA_DO_ESCOPO` em vez de omitidos implicitamente.

### 5.3 Segurança e privacidade obrigatórias

- nunca solicitar, capturar, persistir ou transmitir senha, cookie, token ou cabeçalho de autenticação;
- não usar permissão `cookies`, `<all_urls>`, código remoto, `eval`, `new Function`, analytics ou scripts de terceiros;
- usar memória e, apenas se necessário para sobreviver ao ciclo do service worker, `chrome.storage.session`; `chrome.storage.local` somente para preferências não sensíveis aprovadas;
- validar em runtime mensagens, payloads, estado, `operationId`, `sender.tab.id`, frame e URL/origin antes de executar ações;
- tratar horas e projetos como dados pessoais; não registrar linhas, totais individualizantes ou HTML completo no diagnóstico;
- manter CSP compatível com MV3 e inspecionar manifesto e pacote final;
- não inventar domínio. A estratégia de acesso a hosts deve ser decidida na Onda 1 com base nos domínios fornecidos de forma não sensível e nas restrições atuais do Chrome.

## 6. Onda 1 — descoberta, UI/UX e decisões colaborativas

### Objetivo

Produzir e discutir com o usuário alternativas comparáveis de experiência e arquitetura antes de escrever a extensão. Esta onda é exclusivamente de pesquisa, descoberta, prototipação de baixa fidelidade e decisão: não criar manifesto, package.json, código executável da extensão, dependências ou implementação de produção.

### Dependências

- fontes da seção 3 lidas e estado do repositório revalidado;
- acesso web para pesquisa atual; se indisponível, interromper a onda e pedir orientação em vez de apresentar memória desatualizada como pesquisa;
- participação do usuário no final da onda;
- nenhuma decisão tecnológica presumida a partir da estrutura sugerida em `propose.md`.

### Arquivos previstos

- criar `docs/chrome-extension-ui-decision.md` para registrar pesquisa, propostas, comparação, feedback e decisão;
- opcionalmente criar wireframes de baixa fidelidade em Markdown/SVG próprio ou HTML estático não executável em `docs/chrome-extension-ui/`, se isso tornar a comparação materialmente melhor;
- não alterar `apps/chrome-extension/` nesta onda.

### Tarefas acionáveis e rastreáveis

- **O1-T01 — jornada e riscos:** mapear a jornada `detectar abas → capturar → validar → comparar → revisar → preencher → conferir → opcionalmente enviar`, estados vazios/erro/parcial/cancelado e pontos onde uma ação humana é obrigatória.
- **O1-T02 — pesquisa oficial atual:** consultar documentação oficial vigente do Chrome para Manifest V3, action/popup, side panel, content scripts e frames, service worker, messaging, `activeTab`, `scripting`, `tabs`, `host_permissions`/`optional_host_permissions`, `chrome.storage.session`, CSP e testes. Registrar URL direta, data de acesso, restrição observada e impacto na decisão; diferenciar fato documentado de inferência.
- **O1-T03 — pesquisa de produtos semelhantes:** pesquisar extensões atuais de timesheet, captura/preenchimento assistido e automação de formulário com fluxo de prévia. Selecionar referências suficientes para identificar padrões, sem instalar extensões, conceder acesso aos sites corporativos ou copiar código/identidade visual. Registrar fonte, data, padrão útil, risco de privacidade e limitação da comparação. Preferir páginas oficiais/Chrome Web Store e verificar atualidade.
- **O1-T04 — requisitos de UI/UX:** converter achados em critérios ponderados, no mínimo: clareza dos cinco estados (`capturado`, `validado`, `preenchido`, `confirmado pelo site`, `enviado`), espaço para tabela e divergências, persistência ao trocar abas, acessibilidade, prevenção de envio acidental, tratamento de múltiplas abas, manutenção e superfície de permissões. Cada proposta deve mostrar como o usuário inclui um item, recusa um item, aprova os itens restantes, sai/cancela o lote e executa prévia/dry-run sem preencher nem enviar.
- **O1-T05 — propostas comparáveis:** elaborar de duas a três propostas completas. Incluir obrigatoriamente: (A) popup compacto e fluxo por etapas; (B) side panel persistente; (C) abordagem híbrida, se a pesquisa sustentar, como popup para status/entrada e side panel ou página interna para revisão. Para cada uma, apresentar jornada, wireframe, estados, componentes, permissões/API necessárias, vantagens, limitações, custo de implementação/teste, risco MV3 e adequação aos requisitos. Não declarar vencedora sem aplicar os mesmos critérios às alternativas.
- **O1-T06 — componentes, ferramentas e comandos:** comparar e recomendar, sem instalar, as opções de package manager e lockfile, versão mínima do Node, build/bundling, TypeScript, lint/format, runner unitário, DOM de teste, integração/e2e, validação runtime, CSS/componentes de UI e estratégia de prototipação. Comparar HTML/CSS/TypeScript sem framework com qualquer framework proposto; framework só pode vencer com justificativa proporcional. Para a stack recomendada, produzir uma tabela sem placeholders com diretório de trabalho, finalidade e comando copiável exato para instalação imutável, `dev`, agregador `test`, `build`, `typecheck`, `lint`, `test:unit`, `test:parity`, `test:integration`, `test:e2e` e `package` (ou nomes equivalentes mapeados um a um). A instalação deve ser a sintaxe real do gerenciador escolhido, por exemplo `npm ci`, `pnpm install --frozen-lockfile`, `yarn install --immutable` ou equivalente comprovado.
- **O1-T07 — arquitetura e permissões:** comparar as fronteiras de domínio, adapters, content scripts, service worker, UI e configuração. Apresentar opções viáveis para os hosts sem fabricar domínios: build configurado com hosts exatos; permissões opcionais exatas aprovadas; ou fluxo limitado por `activeTab` e gesto do usuário, considerando que duas abas precisam ser coordenadas. Documentar limitações reais de cada opção e proibir fallback silencioso para `<all_urls>`.
- **O1-T08 — decisões de produto:** pedir ao usuário que confirme o recorte `PROJETOS`, política de preenchimento versus envio, armazenamento de preferências, tratamento de overrides, experiência para múltiplas abas e o destino de CSV/`OPERACOES`/`AVULSO`. Obter decisões separadas sobre: (a) preservar literalmente ou adaptar em UI as ações Ruby `sim`, `não`, `todos os restantes` e `sair`; (b) incluir ou excluir individualmente os modos default 26–25, mês explícito, intervalo inclusivo e ano; (c) para `--year`, preservar a assimetria Ahgora/Channel como limitação de paridade ou harmonizá-la como `MELHORIA_DELIBERADA`; (d) preservar o parsing permissivo/sem overnight ou introduzir validação mais estrita como melhoria deliberada; (e) continuar ignorando datas exclusivas do Channel ou exibi-las como melhoria deliberada. Para toda adaptação, registrar classificação, razão, efeito de compatibilidade e aceite humano. Não associar `Date.today << 1` a uma decisão de fechamento baseada no dia atual: apresentar datas concretas que demonstrem que é sempre o mês-calendário anterior.
- **O1-T09 — apresentação:** apresentar ao usuário uma síntese com matriz de decisão, recomendação justificada, wireframes/protótipos, componentes propostos, permissões esperadas, riscos e perguntas que alteram o resultado.
- **O1-T10 — registro:** registrar em `docs/chrome-extension-ui-decision.md` a alternativa escolhida, ajustes pedidos, componentes aprovados, decisões rejeitadas, pendências e a tabela exata de comandos da stack selecionada. A tabela só passa a `APROVADA` junto com a resposta humana inequívoca; até lá, marcar o documento como `AGUARDANDO_APROVAÇÃO`.

### Entregáveis e evidências esperadas

- documento com fontes atuais e datas de acesso;
- comparação lado a lado de pelo menos duas e preferencialmente três propostas;
- wireframe de cada alternativa em granularidade equivalente;
- matriz de decisão com critérios e pesos explicados, sem falsa precisão;
- lista fechada dos componentes/ferramentas aprovados, ou pendências explícitas;
- tabela fechada de comandos da stack, sem marcadores genéricos, incluindo instalação imutável e os dez scripts/ações requeridos, com qualquer nome equivalente explicitamente mapeado;
- tabela de escopo dos quatro modos de período (`INCLUÍDO` ou `FORA_DO_ESCOPO`) e regras de combinação aprovadas;
- decisão sobre preservar ou harmonizar a assimetria anual, acompanhada de exemplos em janeiro, fevereiro, meio do ano e virada dezembro/janeiro;
- mapeamento aprovado das ações por item/lote, incluindo a garantia verificável de que prévia/dry-run é somente leitura;
- decisão explícita sobre parsing permissivo, virada de dia, horários fora de faixa/pares invertidos, overrides duplicados/ímpares e datas exclusivas do Channel;
- resposta do usuário citada ou resumida fielmente no registro de decisão, sem dados sensíveis;
- `git diff --check` e `git status --short` demonstrando que somente artefatos de descoberta previstos foram alterados.

### Gate independente da Onda 1 — técnico e humano

O revisor independente verifica:

- pesquisa atual, fontes diretas e distinção entre evidência e inferência;
- presença de duas a três alternativas comparáveis, sem solução favorecida por detalhamento desigual;
- cobertura da jornada, acessibilidade, segurança, permissões, MV3, testes, custo e manutenção;
- tabela de comandos completa e executável para o package manager escolhido, sem placeholders ou sintaxe de outro gerenciador;
- ausência de código de produção, manifesto, dependências e decisão tecnológica silenciosa;
- rastreabilidade do feedback e das decisões pendentes.

Depois da revisão técnica aprovada, **PAUSAR A EXECUÇÃO E AGUARDAR A ESCOLHA/APROVAÇÃO EXPLÍCITA DO USUÁRIO**. O Gate 1 só é aprovado quando o usuário escolher ou aprovar:

1. superfície e fluxo de UI/UX;
2. componentes e ferramentas de desenvolvimento;
3. arquitetura e estratégia de permissões/hosts;
4. recorte funcional da primeira entrega;
5. política de preencher, revisar e eventualmente enviar.
6. modos de período incluídos e excluídos, com validações de combinação e ordem;
7. preservação ou adaptação das ações `sim/não/todos/sair`, do parsing permissivo e da invisibilidade de datas exclusivas do Channel;
8. preservação da assimetria anual como limitação de paridade ou sua harmonização como melhoria deliberada;
9. tabela exata de instalação e comandos da stack que será usada nos gates seguintes.

Silêncio, ausência de objeção ou recomendação do agente não contam como aprovação. Enquanto houver decisão material aberta, não iniciar a Onda 2.

### Condições de parada

- pesquisa web indisponível ou fontes insuficientes para conclusão atual;
- domínios/estratégia de host incapazes de atender permissões mínimas;
- necessidade de acessar dados proibidos para comparar propostas;
- rejeição ou falta de aprovação explícita do usuário;
- terceiro ciclo de correção do gate sem aprovação.

## 7. Onda 2 — fundação MV3, domínio e paridade verificável

### Objetivo

Implementar somente a fundação aprovada e as regras puras necessárias ao fluxo `PROJETOS`, estabelecendo segurança, contratos, build, testes de paridade e rastreabilidade antes da automação DOM completa.

### Dependências

- Gate 1 técnico e humano aprovado;
- `docs/chrome-extension-ui-decision.md` com stack, superfície, arquitetura, permissões e escopo decididos;
- hosts exatos ou estratégia aprovada que funcione sem `<all_urls>`;
- alterações do usuário reavaliadas e preservadas.

### Arquivos previstos

Os nomes exatos podem ser ajustados à decisão da Onda 1, preservando responsabilidades:

- `apps/chrome-extension/package.json`, lockfile do package manager escolhido, `tsconfig.json`, configuração de build, lint e testes;
- `apps/chrome-extension/manifest.json` ou template/gerador determinístico aprovado para hosts exatos;
- `apps/chrome-extension/src/domain/` para modelos, datas, duração, período, overrides, comparação, alocação e validação;
- `apps/chrome-extension/src/messaging/` para discriminated unions, validação runtime e erros;
- `apps/chrome-extension/src/background/service-worker.ts` com esqueleto de máquina de estados, sem automação DOM não testada;
- `apps/chrome-extension/src/shared/` para erros, cancelamento, waits e diagnóstico sanitizado;
- `apps/chrome-extension/tests/unit/`, `tests/parity/` e `tests/fixtures/` apenas com dados sintéticos;
- `docs/ruby-to-extension-mapping.md`;
- documentação mínima de comandos e decisões aprovadas.

### Tarefas acionáveis e rastreáveis

- **O2-T01 — bootstrap aprovado:** criar o projeto com as versões mínimas e dependências aprovadas; configurar TypeScript `strict: true`, build MV3 reproduzível e scripts funcionais para `dev`, agregador `test`, `build`, `typecheck`, `lint`, `test:unit`, `test:parity`, `test:integration`, `test:e2e` e `package`, ou nomes equivalentes exatamente mapeados na decisão da Onda 1. Nenhum script pode ser placeholder, apenas `echo`, ignorar falhas ou passar com uma suíte relevante vazia. O agregador deve executar as suítes definidas pela stack; integração/e2e começam com smoke tests significativos da fundação e são ampliados na Onda 3. Não trocar a stack ou os comandos decididos sem voltar ao usuário.
- **O2-T02 — manifesto mínimo:** implementar somente APIs e hosts necessários à arquitetura aprovada. Justificar cada permissão; comprovar ausência de `cookies`, `<all_urls>`, código remoto e CSP relaxada.
- **O2-T03 — modelo de domínio:** representar datas civis em `YYYY-MM-DD`, horários `HH:MM`, durações como minutos inteiros, batidas, apontamentos, divergências, configuração, plano de transferência, seleção por item e resultado por linha. Evitar `Date` com timezone para datas civis e floats para duração. Modelar separadamente período default, mês, intervalo inclusivo e ano somente para os modos aprovados; tipos não devem permitir combinações ambíguas.
- **O2-T04 — períodos:** usar relógio injetável e caracterizar/portar separadamente: default baseado literalmente em `Date.today << 1`, isto é, mês-calendário anterior em qualquer dia do mês, com janela 26–25; `--month` como mês de fechamento explícito; intervalo `start/end` inclusivo que pode requerer vários espelhos; e `--year`. Para o ano, preservar quando aprovado que o Ahgora usa o ano de `Date.today << 1` e enumera janeiro até esse mês, enquanto o Channel começa em `01/01` do ano de `Time.new - 31 dias` e termina hoje. Implementar apenas os modos aprovados no Gate 1, registrar cada excluído como `FORA_DO_ESCOPO` e preservar as validações aplicáveis: duas pontas obrigatórias, início menor ou igual ao fim e exclusividade entre intervalo, mês e ano. Uma janela anual harmonizada deve coexistir em caso de teste separado, classificada e aprovada como `MELHORIA_DELIBERADA`, nunca substituir a caracterização Ruby silenciosamente.
- **O2-T05 — parsing de batidas e overrides:** antes de escolher uma validação desejada, criar testes de caracterização do Ruby para regex permissiva `\d{2}:\d{2}`, valores fora da faixa usual, ausência de virada de dia, subtração literal de pares invertidos e falha posterior do Expert quando o total não é positivo. Cobrir overrides duplicados (primeira entrada vence), de formato inválido, ímpares, com pares invertidos e fora de faixa. Implementar exatamente a decisão do Gate 1; qualquer endurecimento ou overnight deve permanecer `MELHORIA_DELIBERADA`, com teste separado da paridade.
- **O2-T06 — comparação e Expert:** portar semântica de `map { ... }.to_h` (`last row wins`), estados ausente/igual/divergente e alocação ativa do Expert para um `PROJETOS`; exigir duração positiva e aplicar defaults aprovados. Iterar por datas do Ahgora e testar que uma data presente somente no Channel não produz candidato nem divergência. Se o Gate 1 aprovar sua exibição, mantê-la em saída diagnóstica separada e classificada como melhoria, sem mudar o conjunto de candidatos.
- **O2-T07 — contratos e máquina de estados:** definir mensagens tipadas e validar runtime; implementar estados e transições para detecção, captura, validação, prévia/dry-run, seleção por item, preenchimento, aprovação dos restantes, recusa, cancelamento do lote e falha, conforme o mapeamento aprovado. Garantir por desenho que a transição de prévia/dry-run não possa emitir `FILL_TARGET`, chamar adapter DOM de escrita ou chegar a submissão. Rejeitar operação antiga, URL/origem/aba/frame incompatível e payload inválido.
- **O2-T08 — dados e configuração:** implementar apenas preferências não sensíveis aprovadas. Estado transitório em memória ou `storage.session`; nada de histórico permanente. Adicionar redaction e diagnóstico estrutural sem conteúdo pessoal.
- **O2-T09 — golden master:** criar um harness mínimo e sanitizado para usar regras Ruby isoláveis como oráculo, sem grande refatoração e sem Selenium/dados reais. Comparar saídas normalizadas Ruby e TypeScript para casos sustentados, incluindo os comportamentos permissivos/limites de B04, B05 e B18. Se isolar uma regra exigir alterar comportamento Ruby, registrar a limitação e usar especificação caracterizadora revisada.
- **O2-T10 — testes:** cobrir cada modo de período aprovado; default com hoje antes do dia 25, exatamente no dia 25 e depois do dia 25, sempre selecionando o mês-calendário anterior; virada dezembro/janeiro; mês explícito; período dentro de um mês e cruzando o dia 25; intervalo inclusivo; todas as combinações inválidas de opções e ordem invertida. Para `--year`, caracterizar separadamente os intervalos efetivos Ahgora e Channel em janeiro, fevereiro, meio do ano e na virada dezembro/janeiro, incluindo o ano anterior resultante de `Date.today << 1` e de `Time.new - 31 dias`; se houver harmonização aprovada, testá-la separadamente como melhoria. Cobrir ainda: vazio; par/ímpar; override válido, inválido, duplicado, ímpar, invertido e fora de faixa; horário fora de faixa; ausência de overnight; duração negativa/não positiva; data/duração inválidas; novo/igual/divergente; data só no Channel ignorada; duplicidade `last wins`; Expert/config/defaults; mensagens válidas/inválidas; origem/URL/aba/operação; inclusão individual, recusa individual, aprovação dos restantes, cancelamento de lote e prévia/dry-run sem `FILL_TARGET`, escrita DOM ou submissão.
- **O2-T11 — mapeamento:** preencher `docs/ruby-to-extension-mapping.md` com referências precisas a métodos Ruby, comportamento, classificação, destino TypeScript, teste e status `implementado`, `pendente DOM real` ou `fora do escopo`.

Não acessar o CSV local referenciado pelos testes Ruby. Para o baseline, executar apenas testes Ruby que não leiam dados proibidos, por filtro explícito, e registrar que os cenários CSV ficaram fora do baseline por segurança. Criar fixtures novas, obviamente sintéticas, para qualquer cobertura equivalente.

### Comandos de validação

Executar literalmente os comandos registrados na tabela aprovada em `docs/chrome-extension-ui-decision.md`. Não adaptar flags durante o gate e não usar placeholders. A linha de instalação precisa ser a instalação imutável real do gerenciador escolhido (`npm ci`, `pnpm install --frozen-lockfile`, `yarn install --immutable` ou equivalente validado). Em seguida, executar os comandos exatos mapeados para `typecheck`, `lint`, `test:unit`, `test:parity`, `test:integration`, `test:e2e`, agregador `test`, `build` e `package`; executar `dev` como smoke test com inicialização e encerramento controlados, sem deixar processo órfão.

Os únicos comandos fixos desta seção, independentes da stack escolhida, são:

```bash
cd "$ROOT/apps/standalone"
bundle exec ruby -Itest test/all_test.rb --name '/test_week_|test_missing_required_configuration|test_expert_maps_all_hours/'

cd "$ROOT"
git diff --check
git status --short
```

Registrar o comando exato, exit code, versão, quantidade de testes, duração e avisos de cada linha da tabela. Não alterar comandos durante o gate nem alterar testes/expectativas para ocultar falhas de baseline; qualquer correção da tabela exige nova aprovação da decisão da Onda 1.

### Evidências e critérios de aprovação

- instalação reproduzível pelo comando imutável exato aprovado, lockfile e versões documentadas;
- todos os comandos aprovados para `dev`, agregador `test`, `build`, `typecheck`, `lint`, `test:unit`, `test:parity`, `test:integration`, `test:e2e` e `package` existem, são significativos e foram executados sem substituição de sintaxe;
- manifesto gerado/inspecionado com justificativa por permissão;
- TypeScript estrito, lint, unitários, paridade e build aprovados com contagens registradas;
- nenhum teste ou fixture lê arquivos proibidos ou contém dados pessoais;
- matriz cobre B01–B19, identifica individualmente os modos de período fora do escopo e distingue pendências DOM/manual;
- domínio não depende de `chrome`, DOM, timezone implícito ou float de horas;
- teste explícito demonstra `last row wins`, sem agregação acidental;
- teste explícito demonstra que data exclusiva do Channel é ignorada na paridade e que qualquer exibição adicional não altera candidatos;
- testes de estado provam as quatro decisões de item/lote aprovadas e que prévia/dry-run não pode produzir `FILL_TARGET`, escrita DOM ou submissão;
- golden masters caracterizam parsing permissivo, cálculo literal negativo e overrides limítrofes sem endurecimento silencioso;
- testes com relógio controlado comprovam o mês-calendário anterior antes/no/depois do dia 25 e a virada dezembro/janeiro; `--year` caracteriza a assimetria Ahgora/Channel em janeiro, fevereiro e meio do ano, ou testa separadamente a harmonização aprovada;
- revisão do diff não encontra segredo, URL/domínio fabricado ou mudança alheia.

### Gate independente da Onda 2

O revisor deve confrontar cada teste com o Ruby ativo, inspecionar a matriz, o manifesto, dependências, fronteiras de domínio e segurança. Deve conferir o escopo de cada modo de período, as combinações inválidas, `Date.today << 1` antes/no/depois do dia 25, a virada dezembro/janeiro, a assimetria anual Ahgora/Channel, a iteração apenas por datas do Ahgora, a semântica por item/lote e a barreira estrutural entre prévia e preenchimento. Deve executar literalmente a instalação e cada comando da tabela aprovada, inclusive smoke de `dev` com encerramento controlado, e confrontar scripts com suas ações reais. Reprovar se houver regra inventada, seleção mensal condicionada indevidamente ao dia de hoje, harmonização anual não aprovada, comando genérico/substituído, script vazio, stack diferente da aprovada, permissão ampla, fixture suspeita, teste tautológico, alegação de paridade sem oráculo/evidência, acoplamento de domínio ao DOM ou validação de horário/overnight não aprovada.

### Condições de parada

- a decisão aprovada na Onda 1 não pode ser implementada sem mudança material;
- falta host/permissão específica e seria necessário ampliar acesso;
- golden master exigiria ler dados proibidos ou alterar regra Ruby substantivamente;
- baseline revela divergência que muda a definição de paridade;
- terceiro ciclo de correção sem aprovação.

## 8. Onda 3 — adapters DOM, coordenação, UI aprovada e validação integrada

### Objetivo

Completar o fluxo utilizável da primeira entrega conforme a UI/arquitetura aprovadas: detectar abas e login, capturar o Ahgora, consultar/comparar Channel, mostrar prévia, preencher de modo idempotente e produzir relatório, sem envio não confirmado.

### Dependências

- Gate 2 aprovado;
- seletores existentes no Ruby mapeados e fixtures sintéticas suficientes;
- qualquer seletor/evento não sustentado marcado como pendente de validação, nunca inventado;
- acesso manual aos sites não é pressuposto para testes automatizados locais.

### Arquivos previstos

- `apps/chrome-extension/src/content/` e `src/sites/source|target/` para content scripts, adapters e seletores centralizados;
- `apps/chrome-extension/src/background/service-worker.ts` para coordenação final;
- diretório de UI aprovado na Onda 1, por exemplo `src/ui/popup/`, `src/ui/side-panel/` ou ambos;
- `apps/chrome-extension/tests/integration/`, `tests/e2e/` e fixtures HTML sintéticas dos dois sites;
- `apps/chrome-extension/README.md`, `apps/chrome-extension/docs/architecture.md` e `apps/chrome-extension/docs/manual-validation.md`;
- scripts de build/package e diretório ignorado de artefatos, conforme decisão aprovada;
- atualização final de `docs/ruby-to-extension-mapping.md`;
- instruções de governança apenas se exigidas e aprovadas; não criar/alterar `AGENTS.md` automaticamente só porque `propose.md` o sugere.

### Tarefas acionáveis e rastreáveis

- **O3-T01 — adapter Ahgora:** detectar página/login, localizar iframe `mirror` no frame correto, aguardar condições observáveis, selecionar o mês ou os meses requeridos pelo modo de período aprovado e extrair o calendário conforme seletores/textos sustentados. No default, usar o mês-calendário anterior derivado do relógio da operação, sem inferir fechamento pelo dia 25. No ano, usar janeiro até o mês de `Date.today << 1` quando essa paridade tiver sido aprovada. Filtrar intervalos de forma inclusiva quando esse modo estiver no escopo. Devolver DTO serializável e erros sanitizados. Centralizar seletores com referência Ruby e status de validação.
- **O3-T02 — adapter Channel de leitura:** detectar página/login, configurar o período aprovado (default, mês, intervalo inclusivo e/ou ano), desativar paginação conforme comportamento comprovado, aguardar relatório por condição observável, ler uma entrada por linha e preservar ordem/duplicidade para que o domínio aplique `last wins`. No default, derivar o mês-calendário anterior independentemente do dia atual e consultar sua janela 26–25. Para o ano em paridade, usar início `01/01` do ano de `Time.new - 31 dias` e fim hoje, ainda que isso não coincida com os meses do Ahgora; harmonizar somente se o Gate 1 aprovou a melhoria. Datas exclusivas do Channel não devem aparecer na prévia de paridade; exibi-las em seção diagnóstica separada somente se a melhoria tiver sido aprovada no Gate 1.
- **O3-T03 — adapter Channel de preenchimento:** limitar a `PROJETOS`, selecionar opções por prefixo, preencher data e duração, disparar somente eventos comprovados pela fixture ou validação real e verificar o valor reconhecido. Retornar resultado por linha; falha parcial não é sucesso completo. Expor API de escrita separada da API de leitura e instrumentá-la em testes para provar que prévia/dry-run nunca a invoca.
- **O3-T04 — submissão segura:** separar `fill` de `submit`. Por padrão apenas preencher e deixar revisão. Se envio foi aprovado no Gate 1 e os seletores/eventos foram validados, expor `Preencher e enviar` desabilitado por padrão, com confirmação explícita de dias/horas e evidência do retorno do site. Caso contrário, manter envio fora da UI e documentar pendência.
- **O3-T05 — coordenação de abas:** tratar zero/uma/múltiplas candidatas, seleção explícita, login, navegação/reload, tab fechada, frame incorreto, service worker suspenso, operação concorrente, cancelamento e retomada segura. Revalidar tab/origin/operationId em cada mensagem. Implementar as transições aprovadas para incluir individualmente, recusar item, aprovar restantes e cancelar/sair; cancelar impede novos preenchimentos e submissões, preservando no relatório o que já ocorreu.
- **O3-T06 — UI aprovada:** implementar em pt-BR a proposta escolhida, sem expandir escopo. Mostrar abas, controles apenas para os modos de período aprovados, configuração, progresso, prévia linha a linha, seleção/recusa por item, ação aprovada para os restantes, cancelamento do lote, totais, divergências, avisos, confirmação e relatório; distinguir visual e textualmente os cinco estados. Exibir datas inicial/final efetivas e descrever o default como mês-calendário anterior, sem sugerir decisão por fechamento. Quando `--year` preservar a paridade assimétrica, mostrar separadamente os intervalos efetivos de Ahgora e Channel e um aviso de limitação; quando harmonizado, identificar a mudança deliberada. Prévia/dry-run deve declarar que nenhuma página será alterada e não pode habilitar uma rota implícita de preenchimento/submissão. Garantir teclado, foco, labels, contraste e mensagens não dependentes apenas de cor. Se os rótulos/ações não forem equivalentes a `sim/não/todos/sair`, documentar a adaptação MV3 aprovada e preservar a semântica decidida.
- **O3-T07 — idempotência:** antes de preencher, comparar estado atual; não duplicar valores; marcar `already-correct`, `skipped`, `not-found`, `validation-error` ou `failed`; após cada escrita confirmar valor resultante. Não corrigir divergência existente sem ação funcional aprovada.
- **O3-T08 — integração local:** usar duas páginas sanitizadas que simulem iframe/calendário e extrato/formulário, incluindo mudanças assíncronas e eventos. Cobrir os modos de período aprovados e suas validações, com relógio controlado antes/no/depois do dia 25, virada dezembro/janeiro e casos anuais de janeiro, fevereiro e meio do ano; validar intervalos distintos Ahgora/Channel ou a harmonização deliberada aprovada. Cobrir captura → prévia; prévia/dry-run sem mensagem `FILL_TARGET`, alteração DOM ou submissão; inclusão individual; recusa; aprovação dos restantes; cancelamento durante o lote; preenchimento parcial; datas exclusivas do Channel; e submissão somente após confirmação explícita quando suportada.
- **O3-T09 — e2e:** quando o ambiente suportar Chrome/Chromium e a stack aprovada, carregar a extensão empacotada e executar o fluxo local. Se não suportar, manter teste implementado, registrar comando e impedimento preciso, sem declarar aprovação.
- **O3-T10 — documentação:** explicar instalação, versões, scripts, build, package, carregamento descompactado, configuração de hosts e campos, permissões, política de dados, uso, estados, cancelamento, semântica exata dos períodos, assimetria anual preservada ou harmonização aprovada, troubleshooting, arquitetura, manutenção de seletores, validação manual e limitações. Reproduzir a tabela final de comandos exatos, mantendo mapeamento para instalação imutável, `dev`, agregador `test`, `build`, `typecheck`, `lint`, quatro suítes e `package`.
- **O3-T11 — validação manual controlada:** com autorização e participação do usuário, validar apenas o que páginas sintéticas não comprovam: hosts, detecção de login, iframe, seleção mensal, parsing atual, campos/opções, eventos aceitos, reconhecimento de valor, toast e eventual submissão. Registrar somente resultado sanitizado (`pass/fail`, etapa, seletor lógico, data da validação), nunca HTML, screenshot, horas, projetos ou pessoa.
- **O3-T12 — empacotamento:** produzir artefato reprodutível contendo apenas runtime necessário. Inspecionar ZIP/listagem, manifesto final e source maps conforme política aprovada; excluir testes, segredos, fixtures, docs internas e dependências de desenvolvimento.

### Comandos de validação

Executar literalmente, sem tradução de sintaxe ou placeholders, a tabela final de comandos aprovada e documentada pela extensão: instalação imutável, `typecheck`, `lint`, `test:unit`, `test:parity`, `test:integration`, `test:e2e`, agregador `test`, `build`, `package` e smoke controlado de `dev`. A tabela deve conter os comandos reais do gerenciador escolhido; por exemplo, somente se npm tiver sido aprovado, os comandos terão a forma `npm ci` e `npm run ...`.

Depois desses comandos exatos, executar os checks independentes do gerenciador:

```bash
cd "$ROOT"
rg -n '(<all_urls>|"cookies"|eval\(|new Function|AHGORA_PASSWORD|CHANNEL_PASSWORD)' apps/chrome-extension docs/ruby-to-extension-mapping.md
git diff --check
git status --short
```

Complementar com:

- validação JSON e inspeção manual do `manifest.json` produzido;
- listagem do conteúdo do ZIP, sem extração destrutiva sobre o workspace;
- busca por padrões de segredo com ferramenta disponível, revisando falsos positivos sem imprimir valores;
- instalação limpa a partir do lockfile;
- checklist manual de `apps/chrome-extension/docs/manual-validation.md` quando autorizado.

O `rg` acima deve retornar vazio para ocorrências executáveis/proibidas; menções didáticas inevitáveis em documentação devem ser avaliadas pelo revisor e não confundidas com uso real.

### Evidências e critérios de aprovação

- todas as validações automatizadas aplicáveis passam, com comando, versão, contagem e duração registrados;
- e2e local prova captura, prévia, preenchimento e ausência de envio implícito;
- e2e prova que prévia/dry-run não emite `FILL_TARGET`, não altera DOM e não submete, e cobre inclusão/recusa por item, aprovação dos restantes e cancelamento do lote;
- relatório diferencia sucesso, já correto, ignorado, não encontrado, validação e falha;
- controles e contratos expõem somente os modos de período aprovados e rejeitam combinações/ordem inválidas;
- UI e integração mostram o mês-calendário anterior e os intervalos efetivos sem sugerir fechamento condicionado ao dia atual; o modo anual preserva e sinaliza a assimetria ou identifica a harmonização aprovada;
- a instalação imutável e todos os dez comandos/ações da tabela final foram executados exatamente como documentados, inclusive agregador e smoke controlado de `dev`;
- UI implementada corresponde à alternativa aprovada e atende teclado/foco/labels/contraste;
- manifesto e ZIP usam somente hosts/permissões/arquivos necessários;
- nenhum segredo, dado pessoal, conteúdo de página, telemetria ou código remoto;
- matriz B01–B19 atualizada com status e evidência honesta;
- documentação permite instalar, testar, empacotar e carregar a extensão;
- itens que dependem do DOM autenticado continuam marcados pendentes até validação real.

### Gate independente da Onda 3

O revisor executa literalmente a tabela de comandos aprovada e revisa arquitetura, UI, manifesto, pacote, segurança e rastreabilidade. Deve conferir os casos do relógio antes/no/depois do dia 25, virada dezembro/janeiro e assimetria anual em janeiro, fevereiro e meio do ano. Deve tentar cenários negativos: aba ambígua/fechada, login, frame errado, payload malformado, URL divergente, operação antiga, DOM atrasado, dia ímpar, override duplicado/fora de faixa/invertido, período ou combinação inválida, data exclusiva do Channel, duplicidade, divergência, recusa, aprovação dos restantes, preenchimento parcial, cancelamento e tentativa de preencher/enviar a partir de prévia/dry-run ou sem confirmação. Reprovar qualquer seleção mensal condicionada indevidamente ao dia de hoje, harmonização anual ou adaptação não aprovada, comando divergente da tabela, alegação de equivalência não sustentada ou submissão possível por fluxo implícito.

### Condições de parada

- DOM real diverge e a correção exigiria inventar seletor/evento ou ampliar permissão;
- envio não pode ser comprovado com segurança — nesse caso, manter somente preenchimento/revisão e registrar a limitação, sem bloquear o restante se o usuário aprovar o recorte;
- teste revela mudança funcional não aprovada;
- validação exigiria guardar ou versionar dados pessoais;
- terceiro ciclo de correção sem aprovação.

## 9. Gate final independente de integração/e2e

Após a Onda 3 aprovada, um revisor que não tenha conduzido a implementação final deve auditar o conjunto completo em checkout/instalação limpa quando viável.

### Checklist final

1. confrontar `docs/chrome-extension-migration_initial.md`, `apps/chrome-extension/propose.md`, a decisão da Onda 1 e este plano com o diff;
2. verificar rastreabilidade Ruby → TypeScript → teste para cada comportamento dentro do escopo;
3. verificar o registro humano dos modos de período, assimetria anual, ações por item/lote, parsing/overnight e tratamento de datas exclusivas do Channel; toda diferença deve estar classificada e aprovada;
4. executar baseline Ruby permitido e, literalmente a partir da tabela final, instalação imutável, `dev`, agregador `test`, build, typecheck, lint, testes unitários, paridade, integração, e2e e package;
5. executar o e2e local ponta a ponta nas duas páginas simuladas e comprovar que prévia/dry-run não emite `FILL_TARGET`, não altera DOM nem submete, além da ausência de submissão sem confirmação;
6. inspecionar manifesto, permissões, CSP, matches por frame/host, pacote e ausência de `<all_urls>`, `cookies`, código remoto, secrets e dados pessoais;
7. revisar tratamento de mensagens, tabs, frames, períodos — incluindo mês-calendário anterior e assimetria anual —, decisões por item/lote, operação concorrente, cancelamento, idempotência e falha parcial;
8. conferir que a UI distingue os cinco estados e não sugere sucesso completo quando falta confirmação do site;
9. verificar documentação e comandos do zero;
10. executar `git diff --check` e `git status --short`, separando mudanças do usuário das mudanças deste plano;
11. listar validações reais não executadas e impedir frases como “migração completa” ou “paridade total” quando houver pendências.

### Aprovação e parada

O gate final aprova somente se não houver falha crítica/alta, todas as verificações locais aplicáveis passarem e limitações manuais estiverem explícitas. Achados retornam à Onda 3 e seguem o limite de até três ciclos de correção. Depois do terceiro ciclo sem aprovação, parar e aguardar o usuário.

## 10. Registro obrigatório de resultados

Somente durante a execução deste plano, depois do gate final, criar `docs/chrome-extension-migration_plan-results.md` contendo:

- escopo implementado por onda e IDs de tarefa;
- alternativa de UI/UX, componentes e ferramentas escolhidos pelo usuário, com referência ao registro de decisão;
- classificação final `PARIDADE`, `ADAPTAÇÃO_MV3`, `MELHORIA_DELIBERADA` e `FORA_DO_ESCOPO`;
- decisões, premissas, divergências e alterações em relação ao plano;
- comandos executados, versões, contagem e resultado dos testes;
- tabela final dos comandos exatos e confirmação de que os gates não traduziram ou substituíram sua sintaxe;
- evidências dos gates e ciclos de correção;
- manifesto/permissões finais e política de dados;
- validações manuais executadas em forma sanitizada e as ainda pendentes;
- observações, riscos residuais, limitações e melhorias futuras;
- lista dos arquivos principais criados/alterados e instruções exatas de uso.

Não declarar sucesso para testes não executados, DOM real não validado, submissão não comprovada ou paridade sem evidência.
