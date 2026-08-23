# Resultado da implementação — migração da automação Ruby para extensão Chrome

**Status:** `GATE_FINAL_APROVADO`

**Data:** 2026-08-22

**Plano executado:** `docs/chrome-extension-migration_plan.md`

## 1. Resultado executivo

Foi implementada a primeira entrega da extensão Chrome Manifest V3 para o fluxo Ahgora → comparação Channel → prévia → preenchimento assistido de `PROJETOS`.

A extensão usa abas que o usuário já autenticou, exige um gesto `activeTab` separado em cada aba, mantém a operação em `chrome.storage.session`, apresenta revisão no side panel e preenche no máximo um item por vez. Ela não solicita credenciais, não declara hosts persistentes, não salva nem submete o formulário Channel e não contém Ruby em runtime.

O gate final independente foi aprovado após 88 testes, inspeção do manifesto e do ZIP e duas gerações idênticas do pacote. Compatibilidade com o DOM autenticado, o clique real da action e o reinício forçado do service worker permanecem validações manuais explícitas; portanto este resultado não declara paridade total com os sites reais.

## 2. Escopo entregue por onda

### Onda 1 — descoberta e decisão (`O1-T01`–`O1-T10`)

- jornada, riscos, estados e decisões humanas mapeados;
- pesquisa oficial atual do Chrome e pesquisa de extensões semelhantes registradas;
- propostas A, B e C comparadas com os mesmos critérios e wireframes;
- decisão humana registrada literalmente como `1 B; 2 sim; 3 sim; 4 activeTab; 5 sim; 6 sim; 7 sim; 8 sim; 9 sim; 10 sim; 11 sim; 12 sim; 13 sim.`;
- escolhida a Proposta B: action, side panel persistente e badge sanitizado;
- escolhidos HTML/CSS/TypeScript sem framework, Node 24, npm, Vite/CRXJS, Vitest/jsdom e Playwright;
- Gate 1 técnico e humano aprovado no ciclo 2.

Referência: `docs/chrome-extension-ui-decision.md`.

### Onda 2 — fundação, domínio e paridade (`O2-T01`–`O2-T11`)

- projeto TypeScript strict, scripts, lockfile, build MV3 e empacotamento determinístico;
- manifesto com `activeTab`, `scripting`, `storage` e `sidePanel`, mais permissão opcional para o host exato do iframe Ahgora;
- domínio de datas civis, períodos, batidas, overrides, duração, comparação, seleção e Expert;
- contratos de mensagens, validação de operação/remetente e armazenamento de sessão;
- oráculo sanitizado que carrega as regras Ruby reais permitidas e compara saídas normalizadas;
- matriz B01–B19 criada com origem Ruby, destino TypeScript, teste e status;
- Gate 2 aprovado no ciclo 1.

### Onda 3 — adapters, coordenação, UI e pacote (`O3-T01`–`O3-T12`)

- adapter Ahgora com detecção, iframe, seleção mensal, waits observáveis, múltiplos espelhos e filtro inclusivo;
- adapter Channel com leitura ordenada, `last row wins`, preenchimento exclusivo de `PROJETOS`, seleção por prefixo e confirmação de valores;
- leitura e escrita separadas; nenhum caminho de submit/salvamento;
- coordenação real por `operationId`, revisão, `inFlight`, lock em memória/sessão, binding de aba/origem e cancelamento síncrono antes de qualquer `await`;
- revalidação final depois de `tabs.get`, seguida de despacho sem novo `await`; cancelamento antes/durante essa barreira produz zero nova escrita;
- side panel em pt-BR com período efetivo, cinco marcos, seleção/recusa, selecionar restantes, dry-run, cancelamento, fila manual e resultado por item;
- totais numéricos de `Capturado`, `Novos para revisar (pré-seleção)` e `A preencher (selecionados)`;
- integração coordenada usando o mesmo coordenador e adapters de produção sobre DOM sintético;
- e2e Chromium da extensão, UI, reidratação, duplo clique e dry-run sem alteração/submissão;
- documentação de uso, arquitetura, seletores, limites e validação manual;
- Gate 3 aprovado no ciclo 5 e gate final independente aprovado.

## 3. Decisões, premissas e alterações em relação ao plano

| Tema             | Resultado                                                                                                             |
| ---------------- | --------------------------------------------------------------------------------------------------------------------- |
| UI               | Proposta B: action + side panel persistente + badge.                                                                  |
| Acesso           | `activeTab`, com gesto separado para Ahgora e Channel e reconcessão quando necessária.                                |
| Stack            | Node.js 24, npm 11, TypeScript sem framework, Vite 8.2.2 + CRXJS 2.7.1, Vitest 4.1.11/jsdom e Playwright 1.62.1.      |
| Produto          | Somente `PROJETOS`; projeto/atividade por operação; tipo/tarefa default `Nenhum`.                                     |
| Períodos         | Default 26–25 do mês-calendário anterior, mês explícito e intervalo inclusivo. Ano fora.                              |
| Parsing          | Comportamento permissivo do Ruby preservado com avisos; duração não positiva é bloqueada antes do DOM.                |
| Decisão por item | Adaptação aprovada para prévia inicialmente vazia, seleção/recusa, selecionar restantes, aplicar e cancelar.          |
| Channel          | O formulário legado comporta um item; a extensão pausa a fila após cada preenchimento para revisão/salvamento manual. |
| Envio            | Fora desta entrega. Não há botão, mensagem ou caminho de submit/salvamento.                                           |
| Estado           | Somente `storage.session`; nenhuma preferência ou histórico em `storage.local`.                                       |
| DOM real         | Seletores derivam do Ruby e são cobertos por fixtures, mas compatibilidade autenticada segue pendente.                |

O arquivo solicitado `docs/MODEL_SELECTION_PLAN.md` não existia no workspace. A execução usou o fallback informado ao usuário: geração/correção com `gpt-5.6-sol high`; gateways iniciais com `gpt-5.6-terra high` e ciclos 3–5/final com `gpt-5.6-sol high`.

O plano documental previa até três ciclos de correção, enquanto a instrução posterior do usuário definiu explicitamente ciclos 1–5. A instrução posterior foi aplicada. Os ciclos adicionais fecharam corridas de cancelamento e o requisito de totais antes do gate final.

## 4. Classificação final

A classificação detalhada e a evidência por comportamento estão em `docs/ruby-to-extension-mapping.md`.

- `PARIDADE`: B01–B10 nos recortes ativos, B17a e o cálculo/parser de B18.
- `ADAPTAÇÃO_MV3`: fluxo de decisão B09b, sessões autenticadas B11, coordenação/mensagens B12, diagnóstico B13 e avisos/bloqueio preventivo de B18.
- `MELHORIA_DELIBERADA`: waits observáveis B14 e idempotência/revalidação/resultado parcial B15.
- `FORA_DO_ESCOPO`: CSV, `OPERACOES`, `AVULSO`, regras históricas/comentários B16, modo anual B17b/B19, submissão e publicação na Chrome Web Store.
- `PENDENTE_DOM_REAL`: seletores/eventos autenticados, concessão real em duas abas, fila em formulário real e reinício forçado do service worker.

## 5. Comandos e evidências finais

Ambiente observado:

- Node.js `v24.11.0`;
- npm `11.6.1`;
- Ruby `3.2.3` somente para paridade;
- Vite `8.2.2`, Vitest `4.1.11` e Playwright `1.62.1`;
- `npm ci`: 307 pacotes instalados, 308 auditados, 0 vulnerabilidades.

Os comandos abaixo foram executados literalmente em `apps/chrome-extension`. As durações são da repetição final local e podem variar por máquina.

| Finalidade                 | Comando exato              | Resultado final                                                 | Duração |
| -------------------------- | -------------------------- | --------------------------------------------------------------- | ------: |
| Instalação imutável        | `npm ci`                   | passou; 0 vulnerabilidades                                      |  3,14 s |
| Chromium do e2e            | `npm run e2e:install`      | passou                                                          |  0,65 s |
| Desenvolvimento            | `npm run dev`              | Vite pronto em 255 ms; encerrado pelo timeout controlado de 5 s |  5,00 s |
| Typecheck                  | `npm run typecheck`        | passou                                                          |  2,81 s |
| Lint/formato               | `npm run lint`             | passou                                                          |  5,93 s |
| Unitários                  | `npm run test:unit`        | 48/48                                                           |  1,46 s |
| Paridade Ruby/TS           | `npm run test:parity`      | 16/16                                                           |  1,89 s |
| Integração DOM/coordenador | `npm run test:integration` | 22/22                                                           |  2,23 s |
| E2E Chromium               | `npm run test:e2e`         | 2/2                                                             |  7,03 s |
| Agregador                  | `npm test`                 | 88/88                                                           | 12,41 s |
| Build                      | `npm run build`            | passou; 42 módulos                                              |  0,44 s |
| Pacote                     | `npm run package`          | passou                                                          |  0,63 s |

O E2E de navegador começa de uma prévia colocada em `storage.session` porque o Playwright não concede `activeTab` pela action real. Ele não é apresentado como fluxo completo. A integração coordenada complementar usa `background/coordinator.ts` e os adapters de produção para cobrir captura → comparação → prévia → seleção → fila → preenchimento, com contador de submit igual a zero.

O baseline via `/usr/local/bin/bundle` permaneceu indisponível com exit `127`, pois seu shebang aponta para `/usr/bin/ruby3.1`, ausente neste ambiente. Isso não foi ocultado nem corrigido fora do escopo. O oráculo sanitizado executado com Ruby 3.2.3 e os 16 testes de paridade passaram.

## 6. Gates e ciclos de correção

| Gate/ciclo          | Resultado | Achado e resolução                                                                             |
| ------------------- | --------- | ---------------------------------------------------------------------------------------------- |
| Onda 1, ciclo 1     | correção  | ajustes técnicos/documentais antes da decisão.                                                 |
| Onda 1, ciclo 2     | aprovado  | decisão humana e stack registradas.                                                            |
| Onda 2, ciclo 1     | aprovado  | fundação, domínio e paridade aceitos.                                                          |
| Onda 3, ciclo 1     | rejeitado | integração não percorria o coordenador real; faltavam barreiras contra efeitos concorrentes.   |
| Onda 3, ciclo 2     | rejeitado | cancelamento durante `tabs.get` ainda podia anteceder a releitura final.                       |
| Onda 3, ciclo 3     | rejeitado | a intenção de cancelar ainda não era visível antes dos `await` do handler.                     |
| Onda 3, ciclo 4     | aprovado  | registry síncrono, persistência antes do badge e teste pelo handler real eliminaram a corrida. |
| Gate final inicial  | rejeitado | UI não mostrava totais de horas capturadas/a preencher.                                        |
| Onda 3, ciclo 5     | aprovado  | três totais numéricos adicionados com cobertura unitária, integração e e2e.                    |
| Gate final repetido | aprovado  | 88 testes, manifesto, scans e ZIP reproduzível aprovados.                                      |

## 7. Manifesto, pacote e política de dados

- Manifest V3, Chrome mínimo 116;
- permissões obrigatórias: somente `activeTab`, `scripting`, `storage` e `sidePanel`;
- nenhum `host_permissions`, `cookies`, `tabs` ou `<all_urls>`; `optional_host_permissions` contém somente `https://mirror.app.ahgora.com.br/*`;
- nenhum código remoto, `eval`, `new Function`, telemetria, credencial, cookie ou token;
- estado transitório pode conter datas, horas, projeto e atividade apenas em `chrome.storage.session`;
- badge e diagnósticos contêm apenas estado estrutural sanitizado;
- nenhuma captura de HTML, screenshot ou dado real foi criada.

Artefato: `apps/chrome-extension/artifacts/ahgora-channel-extension-0.1.0.zip`.

- SHA-256: `ada9495c94f51a689a66b902d92867d023b0a01d9dffce5c7cc9700a3d082acd` em duas gerações;
- 18.059 bytes compactados, 47.940 bytes descompactados;
- 7 arquivos exclusivamente de runtime;
- sem testes, fixtures, documentação interna, dependências de desenvolvimento ou source maps.

## 8. Validações manuais e riscos residuais

As APIs reais e o fluxo headless completo foram validados em páginas autenticadas. Permanecem pendentes apenas os pontos que dependem do Chrome instalado/interação manual, conforme `apps/chrome-extension/docs/manual-validation.md`:

- gesto real da action e concessão/reconcessão `activeTab` nas duas abas;
- confirmação visual do side panel com a extensão instalada pelo usuário;
- cancelamento sob latência real;
- retomada depois de encerramento forçado do service worker.

Cancelar antes ou durante a revalidação impede o despacho. Depois que o POST já foi despachado, a extensão não pode desfazer o item corrente; ela impede o item seguinte. O envio é automático depois da autorização única em **Enviar selecionados**.

Observações não bloqueantes do toolchain:

- `npm ci` emitiu aviso de depreciação para uma dependência transitiva `glob@10.5.0`, com auditoria em 0 vulnerabilidades;
- Vite/CRXJS emitiu aviso de depreciação de configuração HMR atribuída ao plugin; o servidor iniciou e build/testes passaram.

## 9. Arquivos principais

- `apps/chrome-extension/manifest.json`, `package.json`, `package-lock.json` e configurações de build/teste/lint;
- `apps/chrome-extension/src/domain/` — regras puras portadas;
- `apps/chrome-extension/src/sites/source/` — adapter Ahgora;
- `apps/chrome-extension/src/sites/target/` — adapters Channel de leitura e preenchimento;
- `apps/chrome-extension/src/background/` — coordenação, locks, cancelamento e escrita validada;
- `apps/chrome-extension/src/ui/` — side panel;
- `apps/chrome-extension/tests/` — unitários, paridade, integração, fixtures sintéticas e e2e;
- `apps/chrome-extension/README.md` — instalação, comandos e uso;
- `apps/chrome-extension/docs/architecture.md` e `manual-validation.md`;
- `docs/chrome-extension-ui-decision.md` e `docs/ruby-to-extension-mapping.md`;
- `.gitignore` — artefatos de build/teste e arquivos locais sensíveis conhecidos.

## 10. Uso e próximos passos

```bash
cd apps/chrome-extension
npm ci
npm run build
```

Em `chrome://extensions`, habilite o modo do desenvolvedor, escolha **Carregar sem compactação** e selecione `apps/chrome-extension/dist`. Antes de operar com dados reais, execute o checklist manual com autorização do usuário e registre somente evidência sanitizada.

Melhorias futuras possíveis, sem compromisso nesta entrega:

- atualizar dependências quando CRXJS eliminar os avisos transitivos/de HMR;
- validar e versionar ajustes de seletores somente após evidência sanitizada do DOM autenticado;
- avaliar modo anual, CSV ou outros tipos apenas como novos escopos explícitos;
- manter o runner de fluxo real opt-in restrito a períodos explicitamente autorizados.

## 11. Correções e smoke autenticado pós-gate (2026-08-22)

Uma validação autenticada opt-in foi executada com as credenciais locais da versão Ruby, em contexto efêmero e sem registrar URLs, credenciais, datas, horas, projetos ou atividades. O formulário de login foi enviado apenas para autenticação; o formulário de apontamento Channel teve `submit` e `requestSubmit` bloqueados e permaneceu sem envio.

Evidências reais produziram as seguintes correções:

- campos condicionais da UI voltaram a respeitar `hidden`;
- seleção de mês Ahgora passou a aguardar botões renderizados de forma assíncrona;
- o parser Ahgora aceita cabeçalho semanal `Sat` e preserva dias vazios para que overrides compatíveis com Ruby possam substituí-los;
- controles `PROJETOS` Channel são resolvidos no documento real e suas opções dependentes são aguardadas em ordem;
- uma data padrão em formulário novo não é mais confundida com formulário ocupado quando a duração está vazia;
- saídas do desenvolvimento em `dist-dev/` foram excluídas do lint.

Resultados posteriores:

- typecheck, lint e build: aprovados;
- unitários: 50/50;
- paridade Ruby/TypeScript: 16/16;
- integração: 43/43;
- E2E: 2/2;
- total local: 111/111;
- captura Ahgora, override, leitura/comparação Channel e abertura estrutural do formulário real: aprovadas;
- pacote reproduzível em duas gerações, SHA-256 `23d9dd0977ba07d4dd25dd20b3536154dce02af10ad632739b832771738fc8de`.

Em 2026-08-23, a imagem fornecida pelo usuário e um novo smoke real provaram que projeto e atividade estavam corretos. O falso negativo era causado por referências a `<select>` substituídos pelo AJAX do Channel; depois de reconsultar cada controle, a seleção configurada e o preenchimento real passaram, sem submit. A falha da extensão instalada no Ahgora foi atribuída ao iframe de origem cruzada: o hostname visto no erro CORS pertencia somente a um recurso do site, enquanto o frame real usa `mirror.app.ahgora.com.br`. Uma extensão carregada com essa permissão alcançou os dois frames via `chrome.scripting.executeScript({ allFrames: true })` e encontrou o marcador mensal no frame correto. O aceite do prompt opcional, o clique real da action/`activeTab` e o reinício forçado do service worker continuam manuais.

Na mesma data, foram adicionados diagnósticos estruturais com o prefixo `[AhgoraChannel]` ao painel, service worker, captura Ahgora e leitura/preenchimento Channel. Os logs mostram códigos, contexto de execução, presença dos seletores e contagens de opções, sem conteúdo dos campos; um teste de integração comprova que projeto, atividade, data e duração não são registrados. O formulário inicial também passou a trazer os quatro valores Channel solicitados como defaults, preservando uma configuração já registrada na operação.

Depois disso, por decisão explícita do usuário, o runtime foi refatorado de automação DOM para requests autenticados diretos. Ahgora usa `/api-espelho/apuracao/{referencia}` com o bearer ou cookie mantido pela própria página; Channel usa DWR para extrato e resolução de IDs, GET para token Struts e POST para cada apontamento. Uma única ação processa toda a seleção, com releitura antes/depois de cada POST e interrupção em resposta ambígua. A validação autenticada passou em 3/3 casos com `commit: false`; nenhum apontamento real foi criado durante os testes. O caminho de POST e a confirmação posterior foram cobertos com contratos sintéticos.

## 12. Fluxo real headless e idempotência (2026-08-23)

Com autorização explícita do usuário, a extensão empacotada foi carregada em Chromium headless com permissões temporárias limitadas às origens configuradas. Não havia apontamentos em 20/08/2026 nem 21/08/2026, portanto nenhuma exclusão foi necessária. A extensão capturou 08:43 e 08:16 no Ahgora, inseriu os dois itens pelo fluxo completo e confirmou os mesmos totais pelo Channel. Uma nova sessão independente classificou ambos como `equal`, sem novo POST.

Durante as repetições, foram observadas oscilações de navegação/login e uma falha transitória de GET no Ahgora. O runner e os helpers autenticados agora repetem o ciclo de autenticação; o runtime repete somente GETs seguros em falhas de rede, HTTP 429 ou 5xx. Respostas de autenticação e demais 4xx falham imediatamente, e POSTs nunca são repetidos automaticamente. Dois testes de integração cobrem essas fronteiras.

## 13. Login assistido, progresso e contexto Channel (2026-08-23)

O painel agora começa por **Abrir, autenticar e conectar**. O botão abre os dois sites e pede permissão opcional somente para os hosts Ahgora/Channel conhecidos. Com autofill simulado sem submit, a extensão acionou os dois formulários, abriu as páginas de trabalho e registrou automaticamente as duas abas; ambos terminaram `ready`. Campos vazios não são submetidos e nenhum valor é devolvido ao service worker ou persistido. O antigo registro por clique na action fica oculto e existe apenas como fallback quando a permissão ou algum login não conclui.

Durante a captura, duas barras independentes refletem atualizações intermediárias reais em `storage.session`, sem porcentagem temporizada: Ahgora em execução/Channel aguardando, Ahgora concluído/Channel em execução e ambos concluídos. O runner headless passou exigindo as três transições e preservou a igualdade de 20/08/2026 e 21/08/2026.

O erro `channel-context-unavailable` ocorria antes de qualquer request DWR quando `participanteSelecionado` ou `ID_EMPRESA` não estavam na página registrada. A leitura agora faz GET autenticado do Extrato, recupera os dois valores estruturais e só então chama o DWR. Um smoke real removeu deliberadamente ambos do DOM/global e confirmou um GET seguido da leitura DWR. Falhas remanescentes distinguem login, participante, empresa e cliente DWR ausente. Resultado autenticado final: 4/4, sempre sem POST.
