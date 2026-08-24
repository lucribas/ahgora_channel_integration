# Catálogos RAG de apontamento

## Fontes e geração

Os CSVs mantidos em `docs/rag` são contratos de entrada. O comando abaixo os
converte de forma determinística para os assets usados pela extensão:

```bash
npm run convert:rag
```

Os arquivos gerados ficam em `assets/rag` e são empacotados separadamente pelo
Vite. Cada item preserva a linha original, grupo, evento, orientação de duração,
comentário e campos brutos, além do destino interpretado.

## Tipos interpretados

| Tipo                 | Preenchimento no Channel                          | Complemento do usuário |
| -------------------- | ------------------------------------------------- | ---------------------- |
| `PROJECT` fixo       | Projeto, tipo, atividade e tarefa                 | Nenhum                 |
| `PROJECT` contextual | Projeto e/ou atividade vêm da TAG                 | TAG contextual         |
| `AD_HOC`             | Cliente, natureza, tipo de atividade e comentário | Nenhum                 |
| `SKIP`               | Não gera escrita                                  | Item fica desabilitado |

Quando a planilha usa `CERTI` como projeto junto de uma atividade contextual,
o conversor o interpreta como contexto e exige uma TAG. `CERTI` é um cliente do
fluxo Avulso e não identifica, por si só, um projeto do Channel.

## Decisão de UI/UX

A escolha fica dentro de cada marcação porque uma divisão diária pode usar
destinos diferentes. A ordem é:

1. escolher a origem (`Minhas TAGs` ou um catálogo RAG);
2. filtrar e escolher um item agrupado pela seção da planilha;
3. conferir a prévia compacta do destino;
4. escolher uma TAG somente quando o item for contextual;
5. definir percentual ou duração.

O filtro com seleção agrupada evita uma lista plana de dezenas de opções. A
divulgação progressiva remove campos irrelevantes dos itens fixos e Avulsos,
mas mantém o destino visível antes do envio. A implementação usa controles HTML
nativos, rótulos explícitos, grupos e opções desabilitadas, seguindo os padrões
de interação de [combobox](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/)
e [listbox agrupada](https://www.w3.org/WAI/ARIA/apg/patterns/listbox/).

## Validação

- testes unitários validam contagens, schema e interpretação dos quatro tipos;
- testes de integração verificam as atribuições e os corpos de POST de Projeto
  e Avulso;
- o E2E valida troca de fonte, busca, seleção e prévia do destino;
- o teste autenticado destrutivo é opt-in por
  `RUN_AUTHENTICATED_RAG_WRITE=1`. Ele usa somente 21/08/2026, confirma os dois
  modelos, remove as marcações de teste e restaura o total capturado do Ahgora
  no projeto padrão, inclusive em caso de falha intermediária.
