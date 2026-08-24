# Arquitetura

```text
action (gesto activeTab) ── registra origem/aba ──┐
                                                  v
side panel ── mensagens ──> service worker ── scripting.executeScript (MAIN)
                              │                    ├─ API JSON Ahgora
                              │                    └─ DWR + POST Channel
                              v
                    domínio TypeScript puro
          período | batidas | comparação | Expert | seleção

storage.session: operação corrente, configuração, overrides e fila
storage.local: catálogo Channel, TAGs e preferência de fonte
badge: somente estado curto
```

O painel pode abrir os dois logins. Uma permissão opcional limitada a `www.ahgora.com.br`, `app.ahgora.com.br` e `channel.certi.org.br` autoriza a assistência nessas páginas: o script espera usuário e senha já preenchidos, aciona o submit e não devolve os valores. O detector diferencia formulário presente de formulário realmente visível e confirma o marcador da página de trabalho. Enquanto houver estado pendente, o painel também faz uma verificação passiva periódica, sem reenviar o formulário; isso cobre autenticação já concluída e transições internas que não geram evento de navegação. Como a mesma concessão permite `scripting.executeScript` nos hosts exatos, o service worker registra automaticamente os IDs das abas que ele próprio abriu. A recusa mantém `activeTab` e o registro manual como fallback.

O painel escolhe o papel pendente (`source` ou `target`). A concessão só nasce no clique seguinte da action na aba do site; o listener recebe o `tab.id` e registra também a origem. O service worker revalida tab ID, origem e `operationId` antes de toda injeção. Se a aba fechar, navegar para outra origem ou perder `activeTab`, a operação para e pede novo gesto.

Os adapters de captura e apontamento não navegam nem clicam. Ahgora usa `/api-espelho/apuracao/{referencia}` com bearer da própria página quando presente ou cookie de sessão. Channel usa `ApontamentoAjax.listarApontamentoPorData` e a consulta individual de cada dia para obter duração, projeto e atividade. A consulta de catálogo enumera os projetos do usuário e chama `getAtividadesByProjeto` para cada um, com concorrência limitada; o resultado é armazenado em `storage.local`. Cada TAG persiste projeto, atividade, tipo de atividade e tarefa. Na prévia, um dia novo possui uma lista ordenada de marcações cuja soma é invariavelmente o total capturado; reduzir a marcação de saldo promove o valor informado a uma alocação e cria um novo saldo na mesma unidade. A escrita resolve a TAG completa de cada marcação, valida o total diário acumulado esperado, obtém tarefas pelas interfaces DWR e os tokens do formulário novo por GET, e grava por POST Struts. Depois de cada POST, o total diário esperado é confirmado antes da marcação seguinte. A intenção de parada é registrada antes de persistir a UI, bloqueando o próximo despacho; efeitos já despachados são descartados/reconciliados por nova captura. Se participante ou empresa não estiverem na página registrada, um GET autenticado do Extrato recupera o contexto antes do DWR.

Durante `capturing`, o coordenador publica três marcos reais no `storage.session`: Ahgora em execução/Channel aguardando, Ahgora concluído/Channel em execução e ambos concluídos. Cada sistema tem sua própria barra indeterminada enquanto a request está aberta e seu próprio detalhe de contagem ou falha; não existe temporizador simulando porcentagem.

O coordenador cria uma fila e, após uma única autorização em **Enviar selecionados**, processa um item por vez. Antes e depois do POST consulta o extrato: igualdade é idempotente, divergência ou confirmação ausente interrompe a fila. Não há confirmação individual entre itens.

O estado transitório fica em `storage.session`, pois o service worker MV3 pode ser suspenso. Catálogo, TAGs, TAG padrão e escala de fonte ficam em `storage.local`; credenciais e tokens nunca entram nesses stores. A UI reidrata pelos dois estados e reage a mudanças no storage. Não existe store, event bus, container de DI ou validação repetida entre módulos internos; há guards apenas nas fronteiras de mensagens, storage e DOM.

Captura, aplicação e avanço usam um lock por `operationId` antes do primeiro acesso ao DOM. O lock combina exclusão em memória com `inFlight` e `revision` em `storage.session`: duplo clique/segunda mensagem é recusado e efeitos antigos não sobrescrevem cancelamento. O wrapper real do handler registra `CANCEL_OPERATION` sincronicamente por `operationId`, depois da autorização do remetente e antes de qualquer `await`; o ramo assíncrono persiste `cancelled` antes de atualizar o badge. Para escrever, `validated-write.ts` aguarda a revalidação de aba/origem (`tabs.get`), relê a sessão e compara o marcador de intenção, `operationId`, fase, `inFlight`, `revision` e binding; sem outro `await`, despacha `executeChannelFill`, que cria imediatamente o `executeScript`. A UI desabilita as ações de efeito enquanto há request local ou `inFlight` reidratado; `Cancelar operação` permanece disponível como a única exceção.

O limite é o despacho: cancelar enquanto `tabs.get` ou a releitura final está em andamento impede a escrita. Depois que `executeScript` já foi chamado, não existe rollback seguro do DOM corrente; o item pode terminar de ser preenchido, mas o estado cancelado impede qualquer avanço ou escrita seguinte.

O registry é apenas uma barreira imediata em memória. Ele é limpo somente depois que uma nova operação foi persistida com sucesso, quando o novo `operationId` já invalida trabalhos antigos. Se o service worker reiniciar, `storage.session` volta a ser a autoridade: fase cancelada ou lease/revisão divergente continuam bloqueando o despacho mesmo com o registry vazio.

`tests/integration/coordinated-flow.test.ts` executa o coordenador de produção com adapters Ahgora/Channel sobre DOM sintético: captura, leitura, comparação, prévia, seleção e fila de preenchimento, inclusive cancelamento e ausência de submit. `tests/e2e/extension.spec.ts` carrega extensão + duas páginas/iframe, mas hidrata uma prévia para testar UI/dry-run; não substitui a validação manual do gesto `activeTab`.

Os totais da prévia são derivados em `application/types.ts` exclusivamente de `durationMinutes`: **Capturado** soma todos os registros Ahgora efetivos em `sourceRows`; **Novos para revisar (pré-seleção)** soma itens `missing` com duração positiva e permanece como referência do conjunto originalmente revisável; **A preencher (selecionados)** soma apenas esse mesmo conjunto quando a decisão atual é `selected`. A UI apenas formata os minutos e nunca reconverte `ahgoraDuration` textual.

A leitura detalhada do Channel também preserva identificador, duração e permissão de remoção de cada marcação. **Excluir** revalida o identificador no dia esperado, chama a mesma operação DWR `excluirApontamento(id)` usada pelo Channel e relê o dia antes de confirmar o sucesso; em seguida, as duas fontes são recapturadas para atualizar a prévia. A exclusão usa o mesmo lock por `operationId` das demais ações com efeito.

## Estados

- `setup`: registro/configuração;
- `capturing`: duas leituras sem escrita;
- `preview`: comparação pronta e seleção inicialmente vazia;
- `dry-run`: relatório somente leitura;
- `waiting-review`: estado transitório entre dois itens confirmados;
- `partial`: fila interrompida ou resultado misto;
- `completed`: todos os itens selecionados foram confirmados;
- `cancelled`/`failed`: não há novas escritas.

A UI apresenta cinco etapas de tarefa: `Conectar`, `Definir`, `Capturar`, `Revisar` e `Enviar`. A etapa 1 usa disclosure nativo e recolhe após as duas abas serem conectadas. A etapa 3 contém somente configuração e feedback da leitura; a etapa 4 concentra comparação, TAGs e seleção; a etapa 5 contém autorização, progresso e confirmação da escrita.

## Manutenção de seletores

Seletores ficam centralizados em `src/sites/source` e `src/sites/target`, acompanhados da referência Ruby e do status de validação. Uma fixture demonstra apenas o contrato sintético. Mudança real deve ser comprovada pelo checklist manual sem guardar HTML, screenshots ou conteúdo pessoal.
