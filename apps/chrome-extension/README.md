# Extensão Ahgora para Channel

Extensão Chrome Manifest V3 que reutiliza as sessões de abas já autenticadas para consultar as APIs do Ahgora e do Channel, comparar os dados e enviar lançamentos `PROJETOS` selecionados. Ela não solicita nem armazena credenciais.

## Instalação e comandos

Requisitos: Node.js 24 LTS, npm 11+ e Chrome/Chromium 116+. Ruby 3 é usado apenas pelos testes de paridade durante o desenvolvimento; não entra no runtime nem no pacote.

Execute em `apps/chrome-extension`:

| Ordem | Finalidade                            | Comando exato                              |
| ----: | ------------------------------------- | ------------------------------------------ |
|     1 | Instalação imutável                   | `npm ci`                                   |
|     2 | Chromium do e2e                       | `npm run e2e:install`                      |
|     3 | Desenvolvimento (encerrar com Ctrl+C) | `npm run dev`                              |
|     4 | Typecheck                             | `npm run typecheck`                        |
|     5 | Lint/formato                          | `npm run lint`                             |
|     6 | Unitários                             | `npm run test:unit`                        |
|     7 | Paridade Ruby/TypeScript              | `npm run test:parity`                      |
|     8 | Integração DOM                        | `npm run test:integration`                 |
|     9 | E2E Chromium                          | `npm run test:e2e`                         |
|    10 | Smoke autenticado opt-in              | `npm run test:authenticated`               |
|    11 | Fluxo real headless opt-in            | `npm run test:authenticated:headless-flow` |
|    12 | Todas as suítes locais                | `npm test`                                 |
|    13 | Build                                 | `npm run build`                            |
|    14 | ZIP reproduzível                      | `npm run package`                          |

Após `npm run build`, abra `chrome://extensions`, habilite o modo do desenvolvedor, escolha **Carregar sem compactação** e selecione `apps/chrome-extension/dist`. `npm run package` gera `artifacts/ahgora-channel-extension-0.1.0.zip` somente com o runtime da extensão. O comando `npm run dev` usa `dist-dev`, preservando a build instalável em `dist`.

## Uso

1. Clique na action para abrir o painel lateral.
2. Em **Abrir, autenticar e conectar**, use **Abrir páginas e tentar login**. A extensão abre os dois sites e pede acesso opcional aos três hosts exatos. Barras e mensagens independentes mostram carregamento, espera pelo preenchimento automático, envio e confirmação da sessão. Enquanto o processo estiver ativo, **Parar login** interrompe as novas tentativas automáticas. Se o gerenciador de senhas preencher usuário e senha, ela aciona o submit sem copiar esses valores e registra as duas abas automaticamente.
3. Normalmente não há outra interação. Enquanto houver login pendente, o painel verifica passivamente as abas, além de reagir às navegações. Um formulário que permaneça oculto no DOM não é confundido com login aberto; a página de trabalho e seu marcador estrutural são confirmados antes do registro automático. Quando as duas abas estiverem conectadas, a etapa 1 é recolhida automaticamente e mostra **Concluído**; clique no título para reabri-la. **Verificar logins novamente** também permite repetir a leitura sem abrir abas duplicadas. Se a permissão for recusada, a interface explica por que ela é necessária e oferece **Permitir acesso e tentar novamente**. **Acesso manual** permanece como fallback.
4. Em **Definição de marcações de ponto no Channel**, use **Obter do Channel**. A extensão consulta todos os projetos disponíveis e, para cada projeto, somente as atividades permitidas ao usuário autenticado; o resultado e a data da consulta ficam no cache local. Escolha projeto e atividade; o nome da TAG é criado automaticamente como `Projeto — Atividade`. **Opções avançadas desta TAG** define Tipo de atividade e Tarefa, ambos `Nenhum` por padrão; esses valores são salvos e usados junto com a TAG. É possível manter várias TAGs, excluir uma e marcar uma delas como padrão.
5. Os botões `A−` e `A+`, no topo, ajustam as letras entre 80% e 140%. TAGs completas, catálogo, TAG padrão e tamanho das letras persistem localmente entre operações.
6. Na etapa separada **Capturar e comparar marcações**, o padrão é o mês específico atual; também é possível escolher mês-calendário anterior ou intervalo inclusivo. Overrides aceitam uma linha `AAAA-MM-DD=HH:MM,HH:MM,...` e permanecem apenas em `storage.session`. Use **Capturar e comparar**; as barras Ahgora e Channel mostram separadamente espera, consulta em andamento, quantidade recebida, conclusão ou falha. **Parar captura** aparece somente durante a execução e descarta seu resultado tardio.
7. Na etapa **4. Revisar e selecionar dias**, cada dia novo começa com uma marcação de `100%` e a TAG padrão. Em **Dividir por**, escolha **Percentual** ou **Duração**; ao reduzir o valor, uma nova marcação com o saldo restante e a TAG padrão aparece automaticamente, usando a mesma unidade escolhida. O saldo também pode ser reduzido para criar outras marcações, e cada uma aceita sua própria TAG. O resumo mantém `Distribuído` igual ao total capturado e `Falta 00:00`. Cada linha já existente detalha as marcações, projetos e atividades lidos do Channel. Cada marcação removível apresenta **Excluir** à direita; a exclusão pede confirmação, usa o identificador exato do Channel e atualiza a prévia depois da confirmação do backend. Azul-claro indica item disponível para envio, verde-claro indica igualdade/confirmação, amarelo-claro indica divergência e vermelho-claro indica erro ou bloqueio. Itens iguais ou divergentes não exibem checkbox de envio.
8. Em cada linha nova, escolha a TAG no dropdown — a TAG padrão aparece primeiro e já vem selecionada — e use somente o checkbox para incluir ou retirar o dia da seleção; **Selecionar restantes** marca todos os pendentes. O total **Selecionados para enviar** acompanha essas decisões. **Executar dry-run** encerra com relatório e não escreve em página alguma.
9. Depois que ao menos um item enviável for marcado, a etapa **5. Enviar ao Channel** libera **Enviar selecionados** e **Cancelar operação**. **Enviar selecionados** é a autorização única para toda a seleção. A barra da própria etapa mostra a data em revalidação e a contagem confirmada (`n de N`). Enquanto houver envio ativo, **Parar envio** impede o próximo POST; como um POST já despachado não pode ser desfeito, a interface exige capturar e comparar novamente. Cada confirmação transforma a linha em **Já igual**, mostra o projeto/atividade realmente aplicados, atualiza a cor para verde e remove o item dos totais pendentes.
10. **Cancelar operação** impede o despacho das próximas requisições. Uma requisição que já chegou ao Channel não pode ser revertida pela extensão.

O Channel continua recebendo um item por requisição. A fila é sequencial e interrompe na primeira resposta ausente ou divergente para evitar repetição ambígua.

## Períodos e paridade

- default: mês-calendário anterior, sempre na janela 26–25, independentemente do dia atual;
- mês explícito: janela 26 do mês anterior até 25 do mês escolhido;
- intervalo: início e fim inclusivos, com início não posterior ao fim;
- modo anual, CSV, `OPERACOES`, `AVULSO` e regras históricas do Expert estão fora do escopo;
- linhas Channel repetidas preservam a ordem e a última linha da data vence; não são somadas;
- divergências existentes são exibidas e não corrigidas;
- o parser de batidas preserva o comportamento Ruby, mostra avisos para valores incomuns/pares invertidos e bloqueia duração não positiva antes do formulário.

## Permissões e dados

O manifesto usa `activeTab`, `scripting`, `storage` e `sidePanel`; não declara permissões de host obrigatórias. Três hosts exatos aparecem como permissões opcionais para login, registro automático e execução nas páginas abertas pela extensão. O usuário pode recusá-las; nesse caso, o gesto `activeTab` em cada aba permanece como fallback temporário. Os requests rodam no contexto principal da página para que o navegador aplique o cookie de sessão ou o bearer já mantido pelo próprio sistema; a extensão não lê cookies e não persiste tokens ou credenciais. `chrome.storage.session` contém a operação corrente e pode incluir datas, horas, projeto, atividade e estado das etapas até o fim da sessão. `chrome.storage.local` contém somente o catálogo Channel, as TAGs e a preferência de tamanho das letras.

Fixtures sintéticas comprovam o contrato local, não compatibilidade com páginas autenticadas. Antes de usar em dados reais, siga [docs/manual-validation.md](docs/manual-validation.md). Arquitetura e manutenção dos adapters estão em [docs/architecture.md](docs/architecture.md).

O smoke autenticado é deliberadamente opt-in. Ele recebe URLs e credenciais somente por variáveis de ambiente e autentica um contexto efêmero do Chrome. O caminho direto consulta as APIs e prepara o POST completo, mas usa `commit: false`; nenhuma gravação real é executada pelo teste. Para usar a configuração legada local: `set -a; source ../standalone/config.sh; RUN_AUTHENTICATED_SMOKE=1 npm run test:authenticated`.

O runner `test:authenticated:headless-flow` carrega a extensão empacotada em um perfil Chromium efêmero com permissões de host exatas apenas para as duas origens configuradas. Ele exige `RUN_AUTHENTICATED_HEADLESS_FLOW=1`, `CHANNEL_FLOW_START` e `CHANNEL_FLOW_END`. Sem `CHANNEL_FLOW_COMMIT=1`, apenas captura e compara. Com esse flag, envia POSTs reais somente se todas as datas estiverem ausentes e sem avisos, confirma cada gravação pelo Channel e repete a comparação exigindo igualdade. Exemplo não destrutivo: `set -a; source ../standalone/config.sh; RUN_AUTHENTICATED_HEADLESS_FLOW=1 CHANNEL_FLOW_START=2026-08-20 CHANNEL_FLOW_END=2026-08-21 npm run test:authenticated:headless-flow`.

### Escopo exato dos testes de navegador

O e2e carrega a extensão e duas páginas HTTP sintéticas, incluindo o iframe Ahgora, mas começa de uma prévia colocada em `storage.session`: ele comprova renderização, seleção inicialmente vazia, bloqueio de duplo clique, reidratação e dry-run sem alterar/submeter Channel. Ele não é chamado de fluxo completo porque o Playwright não concede `activeTab` pela action real.

O fluxo automatizado padrão depois do gesto fica na integração coordenada: ela comprova captura, leitura, comparação, seleção e envio sequencial de toda a fila após uma única ação. Os testes de contrato usam respostas sintéticas e o smoke autenticado valida os contratos reais sem fazer POST de gravação. A gravação real automatizada fica isolada no runner headless opt-in descrito acima.

## Catálogos RAG

Os catálogos de reuniões e a decisão de interface estão documentados em
[`docs/rag-catalogs.md`](docs/rag-catalogs.md). Gere novamente os JSONs com
`npm run convert:rag` sempre que um dos CSVs de `docs/rag` for alterado.

## Limitações e solução de problemas

### Diagnóstico no console

As mensagens de diagnóstico começam com `[AhgoraChannel]` e registram apenas códigos, origens, IDs técnicos, contagens e presença/ausência de elementos. Projeto, atividade, datas, horas, conteúdo das páginas e credenciais não são impressos.

1. Abra `chrome://extensions`, localize **Ahgora para Channel** e clique no link **service worker** para ver registro de abas, requests e erros de coordenação.
2. Nas abas, filtre o Console por `[AhgoraChannel][AhgoraApi]`, `[ChannelCatalog]`, `[ChannelApiRead]` ou `[ChannelApiWrite]`.
3. Reproduza o erro e filtre o Console por `AhgoraChannel`. Ao relatar o problema, copie o objeto completo dessas mensagens e informe a ação executada.

- **Acesso perdido/aba navegou:** escolha Registrar novamente e clique na action na aba correta.
- **Login/API indisponível:** autentique-se manualmente e mantenha a aba Channel no Extrato, onde o cliente DWR necessário está carregado.
- **Contexto Channel ausente:** a extensão faz um GET autenticado do Extrato para recuperar participante e empresa antes do DWR. Se ainda falhar, a mensagem distingue participante, empresa, login ou cliente DWR ausente; o Console registra somente a origem estrutural desses valores.
- **Registro existente:** duração igual é tratada como idempotente; duração divergente interrompe a fila e não é sobrescrita.
- **Fila parcial:** resultados anteriores são verdadeiros por item; itens restantes continuam pendentes. Não interprete como lote concluído.
- **Validação real de escrita:** o smoke comum apenas prepara tokens, IDs e corpo. Somente **Enviar selecionados** ou o runner headless com `CHANNEL_FLOW_COMMIT=1` enviam apontamentos reais; ambos confirmam o resultado relendo o Channel.
