# Decisão da Onda 1 — interface, arquitetura e stack da extensão Chrome

**Status:** `APROVADO`

**Aprovação do Gate 1:** registrada em 2026-08-22, após gateway técnico independente aprovado no ciclo 2.

**Data da pesquisa:** 2026-08-22

**Escopo deste artefato:** pesquisa, propostas de baixa fidelidade e decisões do Gate 1. Nenhum código, manifesto ou dependência foi criado nesta onda.

## 1. Resumo para decisão

A recomendação é a **Proposta B — action + side panel persistente + badge**, implementada com HTML, CSS e TypeScript sem framework de UI. O side panel acomoda a tabela de dias, divergências e resultados sem desaparecer quando o usuário alterna entre Ahgora e Channel; o badge oferece apenas um estado curto e não contém dados pessoais.

A recomendação foi aprovada com `activeTab` e dois gestos/reconcessões como estratégia de acesso. As demais decisões numeradas da seção 12 também foram aprovadas sem alterações.

## 2. Método e limites da pesquisa

As evidências são identificadas assim:

- **FATO OFICIAL:** comportamento descrito pela documentação do Chrome, Node ou ferramenta correspondente.
- **OBSERVAÇÃO PÚBLICA:** recurso descrito em página oficial ou na Chrome Web Store, sem instalação nem auditoria da extensão.
- **ALEGAÇÃO DO PUBLICADOR:** promessa feita na listagem da própria extensão; não foi verificada por execução.
- **INFERÊNCIA:** conclusão de produto ou engenharia derivada das evidências. Não é uma capacidade garantida pela fonte.

Não foram instaladas extensões de terceiros, concedidas permissões, acessados Ahgora/Channel reais nem usados dados do usuário. Também não foram inventados hosts, URLs ou seletores.

## 3. Jornada proposta e estados visíveis

### 3.1 Jornada ponta a ponta

1. **Detectar/selecionar abas:** o usuário concede ou ativa acesso às abas Ahgora e Channel já autenticadas; se houver mais de uma candidata, escolhe explicitamente cada uma.
2. **Escolher período:** default, mês ou intervalo, conforme o recorte aprovado.
3. **Capturar Ahgora:** a extensão lê o espelho e apresenta progresso; ainda não escreve no Channel.
4. **Validar:** regras portadas do Ruby produzem dias válidos, avisos e itens bloqueados.
5. **Comparar Channel:** a extensão lê os registros existentes, preserva `last row wins` e identifica novo, igual ou divergente.
6. **Revisar prévia:** o usuário vê período efetivo, totais, linhas e avisos, seleciona ou recusa itens e pode cancelar. O modo prévia/dry-run termina aqui sem alterar página alguma.
7. **Aplicar selecionados:** somente itens explicitamente selecionados são preenchidos; não há submit automático.
8. **Conferir resultado:** cada linha informa se foi preenchida, reconhecida pelo site, ignorada ou falhou. O usuário revisa diretamente no Channel.
9. **Enviar:** recomendado fora da primeira entrega. Se vier a existir depois, será uma ação separada e explicitamente confirmada.

### 3.2 Estados que não podem ser confundidos

| Estado | Significado na UI | Ação possível | O que ainda não aconteceu |
| --- | --- | --- | --- |
| `capturado` | O Ahgora foi lido e há uma entrada bruta da operação | Validar/comparar ou cancelar | Nenhuma escrita no Channel |
| `validado` | Regras e comparação terminaram; a prévia pode ser revisada | Selecionar, recusar, executar dry-run ou aplicar | Nenhum campo foi preenchido |
| `preenchido` | A extensão tentou escrever o valor no formulário | Conferir resultado por linha | Reconhecimento e envio não são presumidos |
| `confirmado pelo site` | A página manteve/reconheceu o valor preenchido conforme condição observável | Revisar no Channel | O formulário ainda não foi enviado |
| `enviado` | O site confirmou uma ação de submit separada | Consultar relatório | Não aplicável à primeira entrega recomendada |

Estados auxiliares: `sem acesso`, `aba ausente`, `login necessário`, `capturando`, `comparando`, `parcial`, `cancelando`, `cancelado`, `falha recuperável` e `falha final`. Cor e ícone são reforços; rótulo textual e estado de foco são obrigatórios.

### 3.3 Decisões humanas obrigatórias

- conceder/ativar acesso a cada sistema;
- escolher abas quando houver ambiguidade;
- revisar período, totais, divergências e avisos;
- selecionar os itens que podem ser aplicados;
- acionar `Aplicar selecionados`;
- revisar o resultado no Channel;
- enviar definitivamente no próprio site, fora da automação inicial recomendada.

Nenhum erro parcial é convertido em sucesso do lote. Cancelar impede novas escritas, mas o relatório deve conservar o resultado das linhas já processadas.

## 4. Pesquisa oficial do Chrome e impacto

| Evidência oficial | Fato documentado | Impacto nesta decisão |
| --- | --- | --- |
| [Popup de action](https://developer.chrome.com/docs/extensions/develop/ui/add-popup) | O popup fica associado à action e fecha quando perde foco. | Serve para ação curta/status, mas é frágil para revisar uma tabela enquanto se alterna entre abas. A Proposta A precisa de uma página interna separada para a revisão longa. |
| [Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel) | A API existe a partir do Chrome 114; `sidePanel.open()` está disponível a partir do Chrome 116 e deve ser chamado após interação do usuário. O painel pode permanecer aberto durante navegação entre abas. | É a superfície mais adequada à revisão persistente. A action do usuário abre o painel; não se presume abertura arbitrária pelo service worker. |
| [`activeTab`](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab) | Concede acesso temporário à aba ativa em resposta a gesto do usuário. A concessão é por aba e não concede automaticamente acesso a uma segunda aba. | Um fluxo somente com `activeTab` exige um gesto explícito em cada aba e reconcessão quando a concessão se perde. |
| [Declaração e solicitação de permissões](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions) | Hosts podem ser declarados como opcionais e solicitados em runtime. | Hosts exatos opcionais evitam `<all_urls>` e tornam a concessão deliberada, mas os padrões precisam ser conhecidos e declarados; não podem ser fabricados agora. |
| [`storage`](https://developer.chrome.com/docs/extensions/reference/api/storage) | `storage.session` mantém dados em memória durante a sessão do navegador; `storage.local` persiste até a extensão ser removida. | Operação e dados de horas ficam em `storage.session`; `storage.local` fica restrito a preferência não sensível e útil, se aprovada. |
| [Ciclo de vida do service worker](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle) | O Chrome pode encerrar o service worker ocioso; variáveis globais podem se perder. | O coordenador não pode depender apenas de globais para retomar uma operação. Estado transitório mínimo usa `storage.session`. |
| [Content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts) | Content scripts executam no contexto de páginas e podem ler/modificar seu DOM conforme as permissões aplicáveis. | Leitura e preenchimento ficam em adapters/content scripts; o service worker nunca manipula DOM. |
| [Teste e2e de extensões](https://developer.chrome.com/docs/extensions/how-to/test/end-to-end-testing) e [Playwright — extensões Chrome](https://playwright.dev/docs/chrome-extensions) | Extensões podem ser carregadas em Chromium persistente para testes; o suporte documentado do Playwright usa Chromium e contexto persistente. | O e2e local usa páginas sintéticas e Chromium provisionado, sem login real. |

**INFERÊNCIA:** a persistência visual do side panel reduz perda de contexto e erro de revisão, mas não torna o estado de negócio persistente por si só. Estado e UI continuam separados.

## 5. Referências públicas de extensões semelhantes

As referências abaixo servem apenas para reconhecer padrões de interação, não para copiar código, identidade visual, permissões ou alegações de segurança.

| Referência pública | Evidência observada em 2026-08-22 | Padrão aproveitável | Limite/risco da comparação |
| --- | --- | --- | --- |
| [Clockify Time Tracker — Web Store](https://chromewebstore.google.com/detail/clockify-time-tracker/pmjeegjhjdlccodhacdgbgfagbpmccpe) | **OBSERVAÇÃO PÚBLICA:** action rápida, estado de acompanhamento e integração contextual em páginas, conforme a listagem. | A action deve iniciar/indicar uma operação sem exigir que o usuário abandone a aba atual. | É um timer conectado a serviço próprio e a listagem declara acesso amplo para integrações; não sustenta nossa política de hosts mínimos. |
| [Toggl Track — Web Store](https://chromewebstore.google.com/detail/toggl-track-productivity/oejgccbfbmkkpaidnkphaiaecficdnfn) | **OBSERVAÇÃO PÚBLICA:** timer no menu da extensão e botões inseridos em ferramentas escolhidas. | Combinar estado global curto com affordance contextual pode reduzir troca de contexto. | O fluxo é iniciar/parar timer, não comparar e preencher lote; não justifica injeção contextual nesta primeira entrega. |
| [Harvest + Chrome](https://www.getharvest.com/integrations/chrome) | **OBSERVAÇÃO PÚBLICA:** timer pela toolbar e integração dentro de ferramentas de projeto. | Status acessível na toolbar e ação contextual são padrões conhecidos para horas. | Produto/conta e operação são diferentes; não demonstra revisão segura de vários dias. |
| [Text Blaze — Web Store](https://chromewebstore.google.com/detail/text-blaze-templates-and/idgadaccgipmpannjkmfddolnnhmeklj) e [guia rápido](https://blaze.today/guides/quickstart/) | **OBSERVAÇÃO PÚBLICA:** o usuário prepara snippets/forms, ajusta campos e os insere numa página. **INFERÊNCIA:** isso forma uma sequência útil de preparar → revisar variáveis → aplicar. | Separar preparação da escrita e tornar os dados editáveis/revisáveis antes da aplicação. | A fonte não descreve nosso fluxo de comparação nem garante uma prévia por dia; a sequência é uma inferência de UX. |
| [FormM8 — Web Store](https://chromewebstore.google.com/detail/formm8-%E2%80%94-workflow-form-fi/iblppnefpafekjelffhbnkbnmhdaiipf) | **ALEGAÇÃO DO PUBLICADOR:** mostra valores antigos/novos, permite selecionar campos, pré-visualiza correspondências e nunca envia automaticamente. | Preview/diff antes de preencher e escolha granular são diretamente relevantes. | Extensão não instalada nem auditada; privacidade, robustez e compatibilidade são alegações do publicador. |
| [Fillwright — Web Store](https://chromewebstore.google.com/detail/fillwright-%E2%80%94-form-autofil/palnlbjjlahikjhmjlbglnfcplndappf) | **ALEGAÇÃO DO PUBLICADOR:** relata depois do preenchimento o que funcionou, falhou e por quê, inclusive em iframes/controles modernos. | Resultado por item e falha parcial explícita, sem declarar sucesso otimista. | Alegações técnicas não foram verificadas e não autorizam inventar eventos ou seletores para Channel. |
| [Tap Time — Web Store](https://chromewebstore.google.com/detail/tap-time-%E2%80%93-work-hours-tra/pkjdfnaafkgojhhfhdoljckcfhdgpali) | **ALEGAÇÃO DO PUBLICADOR:** time tracker residente no side panel, sem sair da aba atual. | Valida que o side panel é uma superfície reconhecível para horas e permanência contextual. | O produto registra horas localmente; não coordena duas abas nem preenche formulário. |

**INFERÊNCIA consolidada:** produtos de horas favorecem entrada/status curto na action ou no contexto da página; produtos de preenchimento responsável favorecem preview e resultado por item. Para este caso, o side panel combina melhor as duas necessidades sem inserir uma aplicação complexa no DOM corporativo.

## 6. Critérios ponderados

A nota de cada proposta vai de 1 (fraca) a 5 (forte). O total normalizado é `soma(peso × nota) / 5`.

| Critério | Peso | Por que importa |
| --- | ---: | --- |
| Persistência e espaço para revisão | 20 | O usuário precisa comparar vários dias e alternar entre duas abas sem perder a prévia. |
| Segurança contra ação acidental e clareza dos cinco estados | 20 | Preencher e enviar são estados distintos; a UI deve tornar essa separação inequívoca. |
| Superfície de permissões e privacidade | 15 | A solução não pode recorrer a cookies, `<all_urls>` ou histórico permanente. |
| Acessibilidade | 10 | Tabela, alertas, seleção e progresso precisam funcionar por teclado e sem depender de cor. |
| Coordenação de duas abas | 10 | Ahgora e Channel são contextos separados, com zero/uma/múltiplas candidatas. |
| Custo inicial de implementação | 10 | A primeira entrega deve ser pragmática e sem framework/patterns desnecessários. |
| Testabilidade e manutenção | 10 | Domínio, coordenação e adapters devem poder ser verificados sem páginas reais. |
| Continuidade no contexto da página | 5 | O usuário deve conferir o Channel sem navegar para uma aplicação externa. |
| **Total** | **100** |  |

## 7. Proposta A — popup compacto + página interna de revisão

### Jornada

O usuário abre o popup, registra/seleciona as duas abas e inicia captura. Ao terminar, a extensão abre uma página interna em uma nova aba para a tabela, seleção e resultado. O popup mostra apenas o estado resumido e um link para reabrir a revisão.

### Wireframes de baixa fidelidade

```text
┌ Popup 360 × ~500 ─────────────┐
│ Ahgora   ● pronta      [trocar]│
│ Channel  ● pronta      [trocar]│
│ Período  [mês anterior      ▾]│
│                               │
│ [ Capturar e comparar ]       │
│ Estado: validado · 12 itens   │
│ [ Abrir revisão em nova aba ] │
│ [ Cancelar ]                  │
└───────────────────────────────┘

┌ Página chrome-extension://…/review ──────────────────────┐
│ Capturado ✓  Validado ✓  Preenchido —  Confirmado —       │
│ Enviado — (indisponível nesta primeira entrega)            │
│ 26/06–25/07 · Ahgora 96h · aplicar 88h · 2 avisos         │
│ [ ] Data       Ahgora  Channel  Resultado                  │
│ [ ] 27/06      08:00   —        novo                       │
│ [ ] 28/06      08:00   07:30    divergente                 │
│ [Selecionar restantes] [Dry-run] [Aplicar selecionados]   │
│ [Cancelar]                                                 │
└────────────────────────────────────────────────────────────┘
```

### Estados, ações e componentes

- Popup: acesso às abas, período, captura, status resumido e cancelamento.
- Página interna: prévia, divergências, seleção granular, `Selecionar restantes`, dry-run, `Aplicar selecionados` e resultado por linha.
- Os cinco estados permanecem visíveis; `Enviado` fica indisponível e fora da primeira entrega, sem botão de submit.
- Service worker coordena; content scripts/adapters leem e escrevem; domínio puro calcula; estado transitório permite reabrir a página.
- APIs candidatas: `action`, `scripting`, `storage.session` e a estratégia de host aprovada. `tabs` não deve ser incluída sem necessidade demonstrada.

### Vantagens, limitações, custo e teste

- Vantagens: superfícies simples; página interna oferece bastante espaço; sem UI inserida nos sites.
- Limitações: abre uma terceira aba; o popup fecha ao trocar foco; revisão fica afastada do Channel; é preciso manter popup e página coerentes.
- Custo: **médio**. Duas superfícies de UI e roteamento/reabertura de estado.
- Teste: unitário de domínio/estado, integração de popup/página e e2e da nova aba. Risco MV3 **médio** por retomada após popup fechar e service worker suspender.

## 8. Proposta B — action + side panel persistente + badge (recomendada)

### Jornada

O usuário clica na action para abrir o side panel. Nele registra/seleciona as duas abas, escolhe período, captura, compara, revisa e aplica itens. O painel permanece disponível ao alternar entre Ahgora e Channel. O badge mostra apenas estado curto (`…`, `12`, `!`, `✓`) e nunca horas, datas ou projetos.

### Wireframes de baixa fidelidade

```text
┌ Side panel 400–520 px ──────────────────────┐
│ Transferência de horas              [Ajuda] │
│ Ahgora  ● pronta                  [selecionar]│
│ Channel ● pronta                  [selecionar]│
│ Período [mês anterior                    ▾] │
│ [ Capturar e comparar ]                   │
│                                           │
│ Capturado ✓  Validado ✓                   │
│ Preenchido — Confirmado — Enviado —       │
│ 26/06–25/07 · Ahgora 96h · aplicar 88h    │
│ ┌───────────────────────────────────────┐ │
│ │[ ] 27/06  08:00  —      novo          │ │
│ │[ ] 28/06  08:00  07:30  divergente    │ │
│ │[ ] 01/07  08:00  —      aviso         │ │
│ └───────────────────────────────────────┘ │
│ [Selecionar restantes] [Executar dry-run] │
│ [ Aplicar selecionados ]                  │
│ [ Cancelar operação ]                     │
└───────────────────────────────────────────┘

Toolbar badge:  [ … ] capturando | [12] pendentes | [ ! ] parcial | [ ✓ ] concluído
```

### Estados, ações e componentes

- Side panel único: acesso às abas, período, progresso, prévia/diff, seleção, cancelamento e relatório.
- Badge: indicador não sensível; tooltip acessível complementa o significado.
- Os cinco estados permanecem visíveis; `Enviado` fica indisponível e fora da primeira entrega, sem botão de submit.
- Service worker mínimo: coordena `operationId`, abas e etapas; não contém regra de DOM.
- Dois content scripts/adapters: Ahgora para leitura; Channel para leitura e preenchimento, com APIs de leitura e escrita separadas.
- Domínio TypeScript puro: períodos, parsing, overrides, comparação, Expert e plano de transferência.
- APIs candidatas: `sidePanel`, `action`, `scripting`, `storage`/`storage.session` e a estratégia de host aprovada. `cookies` e `<all_urls>` são excluídos; `tabs` só entra se uma necessidade que as permissões de host/activeTab não cubram for demonstrada.

### Vantagens, limitações, custo e teste

- Vantagens: persistência ao trocar de aba, espaço adequado, fluxo único, revisão junto ao Channel e separação visual clara entre prévia e aplicação.
- Limitações: baseline recomendado Chrome 116+ para abertura programática após gesto; largura exige tabela responsiva/linhas expansíveis; ainda há coordenação de ciclo de vida MV3.
- Custo: **médio**. Uma superfície principal, badge simples e arquitetura alinhada às fronteiras reais.
- Teste: domínio/estado em Node, adapters em jsdom, integração em DOM sintético e e2e do side panel em Chromium. Risco MV3 **baixo–médio**, mitigado por `storage.session` para estado mínimo e teste de retomada.

## 9. Proposta C — popup de status + revisão contextual no Channel

### Jornada

O popup registra as abas e inicia a captura. Quando a prévia estiver pronta, um painel contextual próprio da extensão é inserido na página do Channel; ali o usuário revisa e aplica. O popup e o badge mantêm apenas status e comando para reabrir/focar a revisão.

### Wireframes de baixa fidelidade

```text
┌ Popup 360 × ~500 ─────────────┐
│ Ahgora   ● pronta              │
│ Channel  ● pronta              │
│ Período [mês anterior       ▾]│
│ [ Capturar e comparar ]        │
│ Estado: 12 itens para revisar  │
│ [ Ir para revisão no Channel ] │
│ [ Cancelar ]                   │
└───────────────────────────────┘

┌ Channel ─────────────────────────────────────────────────┐
│ [conteúdo original do site]                              │
│ ┌ Painel contextual da extensão ───────────────────────┐ │
│ │ Capturado ✓ Validado ✓ Preenchido — Confirmado —     │ │
│ │ Enviado — (indisponível nesta primeira entrega)      │ │
│ │ [ ] 27/06 08:00 novo   [ ] 28/06 divergente          │ │
│ │ [Selecionar restantes] [Dry-run]                     │ │
│ │ [Aplicar selecionados] [Cancelar/fechar]             │ │
│ └───────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

### Estados, ações e componentes

- Popup/badge: captura e estado resumido.
- UI contextual isolada por container próprio no Channel: prévia, seleção e relatório.
- Os cinco estados permanecem visíveis; `Enviado` fica indisponível e fora da primeira entrega, sem botão de submit.
- Service worker, domínio e adapters são iguais às outras propostas, mas a UI compartilha o contexto do content script do Channel e precisa evitar colisões de CSS, foco e eventos.
- APIs candidatas: `action`, `scripting`, estratégia de host e `storage.session`; não exige `sidePanel`.

### Vantagens, limitações, custo e teste

- Vantagens: revisão literalmente ao lado do formulário; pode associar resultado à página visível.
- Limitações: maior risco de interferir no DOM corporativo, conflitos de estilo/foco, navegação removendo a UI, acessibilidade mais difícil e acoplamento maior entre UI e adapter.
- Custo: **alto**. Isolamento de estilos, montagem/desmontagem, navegação, responsividade e testes contra DOM hospedeiro.
- Teste: todos os níveis da B mais cenários de colisão CSS, remoção/reinjeção, foco e navegação. Risco MV3/DOM **alto** em comparação às demais.

## 10. Comparação e recomendação

| Critério (peso) | A — popup + página | B — side panel | C — contextual |
| --- | ---: | ---: | ---: |
| Persistência/espaço (20) | 2 | 5 | 4 |
| Segurança/estados (20) | 4 | 5 | 4 |
| Permissões/privacidade (15) | 4 | 4 | 3 |
| Acessibilidade (10) | 3 | 4 | 3 |
| Duas abas (10) | 3 | 5 | 4 |
| Custo inicial (10) | 3 | 4 | 2 |
| Teste/manutenção (10) | 4 | 4 | 2 |
| Contexto da página (5) | 3 | 4 | 5 |
| **Total normalizado** | **65/100** | **90/100** | **68/100** |

**Recomendação: B.** Ela vence por tornar persistente a tarefa que mais exige atenção — revisão de vários itens entre duas abas — sem inserir a interface principal no DOM do Channel. A escolha não implica framework UI nem armazenamento permanente.

### Componentes recomendados para a Proposta B

```text
action (gesto) ──abre──> side panel (UI e revisão)
                           │ mensagens tipadas
                           v
                    service worker mínimo
                    │                   │
             adapter Ahgora       adapter Channel
             leitura do DOM       leitura | escrita separada
                    \                   /
                     domínio TypeScript puro
             períodos | regras | comparação | Expert

storage.session: operação transitória
storage.local: somente preferência não sensível aprovada
badge: estado curto e não sensível
```

Não se propõe repository pattern, event bus, DI container, store global, design system ou biblioteca de componentes. Funções e módulos diretos bastam. Guards manuais pequenos ficam somente nas fronteiras externas (mensagens, DOM e storage); não haverá validação redundante entre funções/classes internas tipadas.

## 11. Decisões técnicas e funcionais recomendadas

### 11.1 Permissões: duas alternativas válidas

| Estratégia | Fluxo real | Benefícios | Limitações/riscos | Quando escolher |
| --- | --- | --- | --- | --- |
| `activeTab` com dois gestos | Na aba Ahgora, usuário clica na action/ação explícita para conceder acesso temporário; repete na aba Channel. A extensão registra os dois tab IDs para a operação. | Não declara hosts persistentes; concessão fortemente contextual. | A concessão é individual por aba, não cobre a segunda automaticamente e pode se perder com navegação/origem; onboarding e retomada são mais trabalhosos. Detecção automática de candidatas fica limitada. | Hosts variam por ambiente/usuário ou não podem ser declarados no pacote. Aceita-se o custo de dois gestos e possível reconcessão. |
| `optional_host_permissions` com hosts exatos | Os dois padrões exatos, depois de conhecidos, são declarados como opcionais; um gesto do usuário solicita cada acesso em runtime. Content scripts são injetados/ativados somente após concessão. | Melhor retomada e coordenação recorrente de duas abas; evita `<all_urls>`; acesso é revogável e deliberado. | Os padrões exatos precisam existir antes do build e o prompt de acesso deve ser explicado. Não é possível colocar placeholders no manifesto final. | Os dois hosts são estáveis, podem ser informados/aprovados e o uso recorrente justifica a concessão. |

**Recomendação condicional:** usar **hosts exatos opcionais** quando os dois padrões estáveis forem fornecidos e aprovados antes da Onda 2. Caso isso não seja possível, adotar **`activeTab` com dois gestos**, mostrando claramente `Ativar Ahgora nesta aba` e `Ativar Channel nesta aba`. Não usar `cookies`, `<all_urls>` ou host inventado em nenhuma alternativa.

### 11.2 Stack recomendada (não instalada nesta onda)

| Área | Escolha recomendada | Justificativa/condição |
| --- | --- | --- |
| Runtime de desenvolvimento | [Node.js 24 LTS](https://nodejs.org/en/about/previous-releases) | Linha LTS atual e única versão de baseline para CI/desenvolvimento. Registrar a versão exata usada na Onda 2. |
| Package manager | npm + `package-lock.json`; instalação por `npm ci` | Já acompanha Node, reduz ferramentas e oferece instalação imutável documentada pelo [npm](https://docs.npmjs.com/cli/commands/npm-ci/). |
| Linguagem | TypeScript `strict: true` | Contratos claros sem runtime Ruby; datas civis e minutos inteiros ficam explícitos. |
| UI | HTML/CSS/TypeScript sem React/Vue/Angular e sem biblioteca de componentes | Uma tela principal não justifica framework. Componentes semânticos nativos e funções de renderização são suficientes. |
| Build MV3 | [Vite 8.2.2](https://www.npmjs.com/package/vite/v/8.2.2) + [`@crxjs/vite-plugin` 2.7.1](https://www.npmjs.com/package/@crxjs/vite-plugin/v/2.7.1) | Versões propostas para pin exato e lockfile na Onda 2; consulte também o [anúncio oficial do Vite 8](https://vite.dev/blog/announcing-vite8/). A integração geral é orientada pelo [guia CRXJS](https://crxjs.dev/guide/installation/from-scratch/), mas o guia sozinho não comprova compatibilidade com Vite 8. **Condição:** executar spike de build real antes do domínio; incompatibilidade material volta ao Gate 1, sem troca silenciosa. |
| Unitário/paridade | Vitest em ambiente Node | Rápido para domínio puro e golden masters; paridade é uma suíte/tag separada, não outro runner. |
| DOM de adapters | Vitest + jsdom | DOM sintético e sanitizado, sem navegador/login real para a maioria dos adapters. |
| Integração/e2e | [Playwright](https://playwright.dev/docs/chrome-extensions/) + Chromium | Carrega extensão descompactada em contexto persistente e permite duas páginas simuladas. |
| Lint | ESLint flat config + [typescript-eslint](https://typescript-eslint.io/getting-started/) | Configuração atual e direta para TypeScript. |
| Formatação | [Prettier](https://prettier.io/docs/install.html), versão pinada | Formatação determinística; roda via script separado ou check no lint conforme package aprovado. |
| Validação runtime | Predicados manuais pequenos | Validar apenas mensagens, DOM e storage externos. Sem Zod/Valibot inicialmente e sem hardening interno redundante. |

Em 2026-08-22, a consulta reproduzível `npm view @crxjs/vite-plugin@2.7.1 peerDependencies` retornou `vite: '^3.0.0 || ^4.0.0 || ^5.0.0 || ^6.0.0 || ^7.0.0 || ^8.0.0'`. Isso comprova que o metadado publicado de CRXJS 2.7.1 aceita Vite 8, mas não substitui o spike de build/dev da extensão. A Onda 2 deve fixar `@crxjs/vite-plugin` em `2.7.1`, Vite em `8.2.2` e registrar as resoluções no `package-lock.json`.

### 11.3 Tabela exata de comandos proposta para os gates

Todos os comandos abaixo terão como diretório de trabalho `$ROOT/apps/chrome-extension`. Os scripts ainda não existem porque a Onda 1 não implementa o projeto; a Onda 2 deverá criá-los exatamente com estes nomes e com ações reais, sem `echo` ou suíte vazia.

| Ordem | Finalidade | Comando copiável exato |
| ---: | --- | --- |
| 1 | Instalação imutável pelo lockfile | `npm ci` |
| 2 | Provisionar o Chromium usado pelo e2e com a devDependency local | `npm run e2e:install` |
| 3 | Desenvolvimento/watch (smoke com encerramento controlado) | `npm run dev` |
| 4 | Typecheck estrito | `npm run typecheck` |
| 5 | Lint e verificação de formato | `npm run lint` |
| 6 | Testes unitários de domínio/mensagens | `npm run test:unit` |
| 7 | Golden masters/paridade Ruby → TypeScript | `npm run test:parity` |
| 8 | Adapters e coordenação em DOM/páginas sintéticas | `npm run test:integration` |
| 9 | Extensão carregada em Chromium, duas páginas sintéticas | `npm run test:e2e` |
| 10 | Agregador das suítes aprovadas | `npm test` |
| 11 | Build de produção | `npm run build` |
| 12 | Pacote distribuível local e inspecionável | `npm run package` |

O `package.json` deve declarar exatamente `"e2e:install": "playwright install chromium"`. Depois de `npm ci`, a resolução de scripts do npm coloca o binário da devDependency local no `PATH`; portanto, o comando falha se Playwright não estiver instalado pelo lockfile e não realiza instalação implícita de pacote. O `package` deve depender de build validado e gerar arquivo fora do código-fonte com conteúdo determinístico; o nome final será definido pelo `package.json`, não por um comando improvisado no gate. Se o Chromium já estiver provisionado no ambiente, o comando 2 ainda deve ser executado/registrado, salvo decisão explícita do Gate 1 de torná-lo etapa de ambiente separada.

### 11.4 Recorte funcional recomendado

| Tema | Default recomendado para a primeira entrega | Classificação/observação |
| --- | --- | --- |
| Tipo de lançamento | Somente `PROJETOS` | `PARIDADE`; `OPERACOES` e `AVULSO` ficam fora. |
| Ação final | Capturar → revisar → preencher → revisar no Channel; sem submit pela extensão | Mantém preenchimento e envio estruturalmente separados; submissão fica fora da primeira entrega. |
| Períodos | Default (mês-calendário anterior, janela 26–25), mês explícito e intervalo inclusivo | `PARIDADE`; a tabela da seção 11.5 fecha cada modo e suas combinações. |
| Modo anual | Não implementar nem harmonizar agora | Tanto a assimetria Ruby quanto uma harmonização ficam documentadas fora do escopo; nenhuma correção silenciosa. Os casos caracterizadores permanecem como contrato para uma rodada futura. |
| Ações Ruby `sim/não/todos/sair` | Seleção granular de linhas, inicialmente sem seleção, + `Selecionar restantes` + `Aplicar selecionados` + `Cancelar operação` | `ADAPTAÇÃO_MV3`: preserva incluir, recusar, aprovar restantes e sair, mas permite revisar o lote antes da escrita. `Aplicar` permanece desabilitado até uma seleção explícita. |
| Dry-run | `Executar dry-run` conclui a análise/relatório sem chamar qualquer escrita | `PARIDADE`; não é apenas um rótulo visual. |
| Parsing de `HH:MM` e pares invertidos | Preservar o parser permissivo internamente para testes/paridade; mostrar aviso claro para valor fora da faixa usual ou par invertido. Total não positivo continua bloqueado antes de preencher, coerente com a falha posterior do `Expert` Ruby. | Decisão explícita necessária: preserva cálculo observável sem aplicar resultado inválido silenciosamente. Não interpretar overnight. |
| Overrides | Permitir overrides configuráveis por operação, com a semântica Ruby caracterizada; mantê-los em `storage.session`, pois contêm horários. | `PARIDADE` com adaptação de configuração. Persistência em `storage.local` não é recomendada. Qualquer validação mais estrita é melhoria deliberada e exige decisão própria. |
| Datas apenas no Channel | Invisíveis na prévia de paridade e sem mudar candidatos | Diagnóstico separado é melhoria opcional e fica fora da primeira entrega. |
| Duplicidades Channel | Última linha da data vence; não somar | `PARIDADE`. |
| Preferências persistentes | `storage.local` somente se uma preferência não sensível provar utilidade (por exemplo, modo de período preferido); inicialmente, nenhuma é obrigatória | Evita persistência sem valor. Projeto/atividade podem ser sensíveis ao contexto corporativo e exigem decisão antes de persistir. |
| CSV e filesystem | Fora | `FORA_DO_ESCOPO`. |
| Regras `OPERACOES`, `AVULSO` e exemplo histórico do Expert | Fora | `FORA_DO_ESCOPO`. |

### 11.5 Matriz explícita dos modos de período

| Modo Ruby/UI | Status na primeira entrega | Regra preservada | Exclusividade e validação |
| --- | --- | --- | --- |
| Default, sem opção explícita | `INCLUÍDO` | Usa literalmente o mês-calendário anterior de `Date.today << 1` e a janela 26 do mês anterior ao selecionado até 25 do selecionado, independentemente de hoje estar antes, no ou depois do dia 25. | É o fallback apenas quando mês, intervalo e ano não foram escolhidos. Não pode coexistir como seleção explícita com outro modo. |
| `--month AAAA-MM` | `INCLUÍDO` | O mês informado é o mês de fechamento da mesma janela 26–25. | Mutuamente exclusivo com intervalo e `--year`; exige um único mês válido. |
| `start/end` inclusivo | `INCLUÍDO` | Inclui as duas pontas e pode exigir mais de um espelho/mês. | `start` e `end` são obrigatórios juntos; exige `start ≤ end`; mutuamente exclusivo com `--month` e `--year`. |
| `--year` | `FORA_DO_ESCOPO` | Não será exposto nem implementado agora. A assimetria Ruby abaixo deve ser caracterizada antes de uma entrega futura. | Continua conceitualmente exclusivo com `--month` e intervalo. Não harmonizar períodos nesta entrega. |

#### Casos caracterizadores da assimetria anual Ruby

Os exemplos usam datas sintéticas para tornar o contrato legível. No Ahgora, o Ruby toma o ano de `Date.today << 1` e enumera de janeiro até o mês resultante. No Channel, começa em `01/01` do ano de `Time.new - 31 dias` e termina em hoje. A enumeração Ahgora representa os meses selecionados pelo Ruby, não uma proposta de harmonização.

| Hoje sintético | Ahgora observável | Channel observável | Assimetria a preservar em teste futuro |
| --- | --- | --- | --- |
| 2026-01-15 (janeiro) | `Date.today << 1` cai em 2025-12; ano 2025, janeiro até dezembro. | `hoje - 31d` cai em 2025; 2025-01-01 até 2026-01-15. | Channel avança até janeiro de 2026; Ahgora termina no mês resultante de dezembro de 2025. |
| 2026-02-15 (fevereiro) | Resultado 2026-01; ano 2026, janeiro até janeiro. | `hoje - 31d` permanece em 2026; 2026-01-01 até 2026-02-15. | Channel termina no dia atual de fevereiro; Ahgora enumera somente até o mês resultante de janeiro. |
| 2026-07-15 (meio do ano) | Resultado 2026-06; ano 2026, janeiro até junho. | `hoje - 31d` permanece em 2026; 2026-01-01 até 2026-07-15. | Channel inclui o período até o dia atual de julho; Ahgora enumera somente até junho. |
| 2026-12-31 → 2027-01-01 (virada dez/jan) | Em 31/12: resultado 2026-11, janeiro–novembro de 2026. Em 01/01: resultado 2026-12, janeiro–dezembro de 2026. | Em 31/12: 2026-01-01–2026-12-31. Em 01/01: `hoje - 31d` ainda cai em 2026, logo 2026-01-01–2027-01-01. | O salto do conjunto Ahgora na virada e o término móvel do Channel não são equivalentes; nenhuma das janelas deve ser substituída pela outra silenciosamente. |

Esses casos não recolocam `--year` no escopo. Eles impedem que uma implementação futura trate a harmonização como correção técnica neutra: harmonizar será `MELHORIA_DELIBERADA` e exigirá nova aprovação.

## 12. Aprovação do usuário

Resposta registrada:

```text
1 B; 2 sim; 3 sim; 4 activeTab; 5 sim; 6 sim;
7 sim; 8 sim; 9 sim; 10 sim; 11 sim; 12 sim; 13 sim.
```

Todas as decisões abaixo estão aprovadas. A Onda 2 deve tratá-las como requisitos; qualquer mudança material exige novo direcionamento do usuário.

Responda a todos os itens. Pode aceitar o default escrevendo apenas o número e a opção recomendada; em caso de alteração, descreva a escolha.

1. **Superfície de UI:** aprova **B — action + side panel + badge** (recomendado), ou escolhe A/C?
2. **Componentes/arquitetura:** aprova side panel único, badge não sensível, service worker mínimo, domínio puro e adapters Ahgora/Channel separados (recomendado)?
3. **Stack:** aprova Node 24 LTS, npm lockfile, TypeScript strict, Vite 8.2.2 + CRXJS 2.7.1 pinados e condicionados ao spike real, Vitest Node/jsdom, Playwright Chromium, ESLint flat + typescript-eslint e Prettier, sem framework de UI e sem biblioteca de schemas (recomendado)?
4. **Permissões:** prefere **hosts exatos opcionais** se puder fornecê-los/aprová-los antes da Onda 2 (recomendado para hosts estáveis) ou `activeTab` com dois gestos/reconcessões? Não inclua credenciais; se os hosts não puderem ser compartilhados agora, escolha `activeTab`.
5. **Recorte de negócio:** aprova somente `PROJETOS`, deixando CSV, `OPERACOES`, `AVULSO` e regras históricas fora (recomendado)?
6. **Preenchimento/envio:** aprova preencher itens selecionados e revisar no Channel, sem submit pela extensão na primeira entrega (recomendado)?
7. **Períodos:** aprova a matriz da seção 11.5: default + mês explícito + intervalo inclusivo, com exclusividade/ordem validadas, e ano fora (recomendado)?
8. **Ano:** confirma que tanto a paridade assimétrica anual quanto sua harmonização ficam fora desta entrega, sem implementação silenciosa (recomendado)?
9. **Ações por item/lote:** aprova seleção granular inicialmente vazia + `Selecionar restantes` + `Aplicar selecionados` + `Cancelar operação` como adaptação de `sim/não/todos/sair` (recomendado)?
10. **Parsing:** aprova preservar o parsing permissivo/cálculo literal para paridade, emitir aviso visível para valores estranhos e impedir preenchimento de total não positivo, sem interpretar overnight (recomendado)?
11. **Overrides e storage:** aprova overrides por operação em `storage.session`, nenhuma persistência de horas e `storage.local` somente para preferência não sensível que prove utilidade (recomendado)?
12. **Datas somente no Channel:** aprova mantê-las invisíveis na paridade e deixar diagnóstico separado para depois (recomendado)?
13. **Comandos:** aprova literalmente a tabela da seção 11.3, incluindo `npm run e2e:install` resolvido pela devDependency local e sem instalação implícita (recomendado)?

Modelo de resposta curta:

```text
1 B; 2 sim; 3 sim; 4 hosts opcionais exatos; 5 sim; 6 sim;
7 sim; 8 sim; 9 sim; 10 sim; 11 sim; 12 sim; 13 sim.
```

O Gate 1 está `APROVADO`; a Onda 2 pode iniciar.

## 13. Riscos e pendências rastreáveis

| Risco/pendência | Consequência | Tratamento proposto |
| --- | --- | --- |
| Hosts exatos ainda não decididos | Manifesto não pode ser finalizado sem inventar acesso. | Decisão 4; fallback explícito para `activeTab` com dois gestos. |
| Compatibilidade Vite 8.2.2 × CRXJS 2.7.1 aceita pelo peer range, mas ainda não comprovada neste repositório | Bootstrap/build pode falhar apesar do metadado compatível. | Pin/lockfile e spike mínimo na Onda 2 antes do domínio; incompatibilidade material volta ao usuário, sem trocar stack silenciosamente. |
| Seletores/eventos reais não validados | Fixture pode passar e site real falhar. | Portar apenas evidência Ruby; marcar validação manual controlada na Onda 3. |
| Side panel depende do baseline Chrome | Chrome anterior ao 116 não atende a abertura recomendada. | Adotar Chrome 116+ como baseline mínimo, sujeito à aprovação do item 1. |
| Service worker efêmero | Perda de progresso se estado existir apenas em memória. | Persistir somente snapshot estrutural transitório em `storage.session`; testar retomada. |
| Parsing Ruby permissivo | Horário fora da faixa ou par invertido pode produzir resultado surpreendente/negativo. | Preservar caracterização, mostrar aviso e bloquear total não positivo; decisão 10 impede endurecimento silencioso. |
| Preenchimento parcial | Alguns valores podem ser aceitos e outros falharem. | Resultado por item, cancelamento entre itens e nenhuma afirmação de sucesso do lote. |
| Dados pessoais em horas/projetos | Persistência/log pode expor contexto laboral. | Sem histórico/telemetria; operação em `storage.session`; badge e diagnóstico sem conteúdo individualizante. |
| Extensões semelhantes não foram instaladas/auditadas | Alegações públicas podem estar incompletas. | Usar somente padrões de UX e manter explícita a classe da evidência. |

## 14. Critério de saída do Gate 1

O artefato técnico foi aprovado porque contém três propostas comparáveis, jornada, estados, wireframes, critérios ponderados, estratégia de permissões, componentes, stack, comandos, fontes, riscos e recorte funcional. O Gate 1 foi concluído depois que:

1. um revisor independente aprovar a consistência técnica deste documento; e
2. o usuário responder explicitamente aos treze itens da seção 12.

A resposta explícita do usuário foi registrada na seção 12; não houve aprovação presumida por silêncio.
