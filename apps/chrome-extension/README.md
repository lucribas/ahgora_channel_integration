# Extensão Ahgora para Channel

Extensão Chrome Manifest V3 que usa abas já autenticadas para capturar o espelho Ahgora, comparar o extrato Channel e preparar lançamentos `PROJETOS` para revisão. Ela não solicita credenciais, não envia formulários e não substitui a conferência humana.

## Instalação e comandos

Requisitos: Node.js 24 LTS, npm 11+ e Chrome/Chromium 116+. Ruby 3 é usado apenas pelos testes de paridade durante o desenvolvimento; não entra no runtime nem no pacote.

Execute em `apps/chrome-extension`:

| Ordem | Finalidade                            | Comando exato                |
| ----: | ------------------------------------- | ---------------------------- |
|     1 | Instalação imutável                   | `npm ci`                     |
|     2 | Chromium do e2e                       | `npm run e2e:install`        |
|     3 | Desenvolvimento (encerrar com Ctrl+C) | `npm run dev`                |
|     4 | Typecheck                             | `npm run typecheck`          |
|     5 | Lint/formato                          | `npm run lint`               |
|     6 | Unitários                             | `npm run test:unit`          |
|     7 | Paridade Ruby/TypeScript              | `npm run test:parity`        |
|     8 | Integração DOM                        | `npm run test:integration`   |
|     9 | E2E Chromium                          | `npm run test:e2e`           |
|    10 | Smoke autenticado opt-in              | `npm run test:authenticated` |
|    11 | Todas as suítes locais                | `npm test`                   |
|    12 | Build                                 | `npm run build`              |
|    13 | ZIP reproduzível                      | `npm run package`            |

Após `npm run build`, abra `chrome://extensions`, habilite o modo do desenvolvedor, escolha **Carregar sem compactação** e selecione `apps/chrome-extension/dist`. `npm run package` gera `artifacts/ahgora-channel-extension-0.1.0.zip` somente com o runtime da extensão. O comando `npm run dev` usa `dist-dev`, preservando a build instalável em `dist`.

## Uso

1. Clique na action para abrir o painel lateral.
2. No painel, escolha **Registrar** para Ahgora; mude para a aba Ahgora e clique novamente na action. Repita o gesto para Channel. Navegação para outra origem ou perda da concessão exige novo registro.
3. Confira projeto e atividade, inicialmente preenchidos com `D15C0401.0 PETROBRAS_SUSTENTAÇÃO CERTIFICARE` e `1.3 ME04_Medição de agosto.26`. Tipo de atividade e tarefa usam `Nenhum` por padrão. Uma configuração já registrada na operação prevalece sobre esses valores iniciais. Escolha mês-calendário anterior, mês explícito ou intervalo inclusivo. Overrides aceitam uma linha `AAAA-MM-DD=HH:MM,HH:MM,...` e permanecem apenas em `storage.session`.
4. Use **Capturar e comparar**. A prévia começa sem seleção e mostra três totais distintos: horas capturadas nos registros Ahgora efetivos, horas novas disponíveis para revisão antes das decisões e horas dos itens atualmente selecionados para preencher. Itens iguais e divergentes nunca são candidatos a preenchimento.
5. Selecione individualmente, recuse ou use **Selecionar restantes**. O total **A preencher (selecionados)** acompanha essas decisões. **Executar dry-run** encerra com relatório e não escreve em página alguma.
6. **Aplicar selecionados** prepara somente o primeiro item no formulário Channel. Confira e, se desejar, salve manualmente no próprio Channel. Depois use **Revise/salve no Channel e avançar**. A extensão revalida o estado antes de preencher o próximo item.
7. **Cancelar operação** impede o despacho de novas escritas e preserva os resultados já observados. Se o `executeScript` do item corrente já tiver sido despachado, o cancelamento não desfaz esse preenchimento; ele impede o próximo item da fila.

O Channel legado expõe um formulário para um único item e a ação de salvar é um submit. Por isso esta versão não sobrescreve o formulário para simular lote: ela mantém uma fila manual, nunca clica em salvar e nunca mostra `Enviado` como disponível.

## Períodos e paridade

- default: mês-calendário anterior, sempre na janela 26–25, independentemente do dia atual;
- mês explícito: janela 26 do mês anterior até 25 do mês escolhido;
- intervalo: início e fim inclusivos, com início não posterior ao fim;
- modo anual, CSV, `OPERACOES`, `AVULSO` e regras históricas do Expert estão fora do escopo;
- linhas Channel repetidas preservam a ordem e a última linha da data vence; não são somadas;
- divergências existentes são exibidas e não corrigidas;
- o parser de batidas preserva o comportamento Ruby, mostra avisos para valores incomuns/pares invertidos e bloqueia duração não positiva antes do formulário.

## Permissões e dados

O manifesto usa `activeTab`, `scripting`, `storage` e `sidePanel`; não declara `host_permissions` persistentes. Como o espelho Ahgora fica em um iframe de outra origem, declara apenas `https://mirror.app.ahgora.com.br/*` em `optional_host_permissions` e solicita esse acesso ao clicar em **Registrar Ahgora**. Cada site ainda exige gesto na própria aba. `chrome.storage.session` contém somente a operação corrente e pode incluir datas, horas, projeto e atividade até o fim da sessão. Não há `storage.local`, histórico, telemetria, código remoto, acesso a cookies ou captura de senha/token. Badge e erros usam apenas estado estrutural.

Fixtures sintéticas comprovam o contrato local, não compatibilidade com páginas autenticadas. Antes de usar em dados reais, siga [docs/manual-validation.md](docs/manual-validation.md). Arquitetura e manutenção dos adapters estão em [docs/architecture.md](docs/architecture.md).

O smoke autenticado é deliberadamente opt-in. Ele recebe URLs e credenciais somente por variáveis de ambiente, autentica um contexto efêmero do Chrome, não registra valores sensíveis e instala uma barreira contra `submit`/`requestSubmit` no formulário Channel. Para usar a configuração legada local: `set -a; source ../standalone/config.sh; RUN_AUTHENTICATED_SMOKE=1 npm run test:authenticated`. Esse teste não faz parte de `npm test`.

### Escopo exato dos testes de navegador

O e2e carrega a extensão e duas páginas HTTP sintéticas, incluindo o iframe Ahgora, mas começa de uma prévia colocada em `storage.session`: ele comprova renderização, seleção inicialmente vazia, bloqueio de duplo clique, reidratação e dry-run sem alterar/submeter Channel. Ele não é chamado de fluxo completo porque o Playwright não concede `activeTab` pela action real.

O fluxo automatizado completo depois do gesto fica na integração coordenada: ela usa o mesmo `background/coordinator.ts` do service worker, o adapter Ahgora, leitura Channel injetada, comparação, seleção e preenchimento/fila em documentos sintéticos, verificando ausência de submit. O clique real da action, a concessão `activeTab` e o DOM autenticado continuam no checklist manual.

## Limitações e solução de problemas

### Diagnóstico no console

As mensagens de diagnóstico começam com `[AhgoraChannel]` e registram apenas códigos, origens, IDs técnicos, contagens e presença/ausência de elementos. Projeto, atividade, datas, horas, conteúdo das páginas e credenciais não são impressos.

1. Abra `chrome://extensions`, localize **Ahgora para Channel** e clique no link **service worker** para ver registro de abas, permissão/frame Ahgora, execução Channel e erros de coordenação.
2. Na aba Channel, abra as DevTools e consulte o Console para ver `[AhgoraChannel][ChannelRead]` e `[AhgoraChannel][ChannelFill]`, incluindo quais controles foram encontrados e quantas opções cada seletor possuía.
3. Reproduza o erro e filtre o Console por `AhgoraChannel`. Ao relatar o problema, copie o objeto completo dessas mensagens e informe a ação executada.

- **Acesso perdido/aba navegou:** escolha Registrar novamente e clique na action na aba correta.
- **Login necessário/estrutura não encontrada:** autentique-se manualmente, confira a página esperada e execute o checklist; não altere seletores sem evidência sanitizada.
- **Leitura do Channel:** mantenha a aba registrada na página de Extrato. Se o modal **Apontar horas** estiver aberto, feche ou cancele o formulário antes de capturar; a extensão não o fecha automaticamente para não descartar dados.
- **Channel já contém valores no formulário:** revise ou limpe/salve manualmente. A extensão recusa sobrescrever um formulário ocupado.
- **Fila parcial:** resultados anteriores são verdadeiros por item; itens restantes continuam pendentes. Não interprete como lote concluído.
- **DOM real parcialmente validado:** captura Ahgora, override, leitura/comparação Channel e preenchimento com os prefixos configurados foram exercitados em sessões reais sem submit. O gesto `activeTab`, a aceitação do prompt opcional e o reinício real do service worker continuam no checklist manual.
- **Iframe Ahgora:** depois de instalar ou atualizar, recarregue a extensão e use **Registrar Ahgora** para conceder o acesso opcional ao host exato do espelho; depois vá à aba e clique no ícone como antes.
