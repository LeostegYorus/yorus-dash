# Catálogo Meta e tabelas com múltiplas métricas — resultado

## Entregue

- Catálogo pesquisável de métricas em todos os visuais Meta, substituindo o seletor fixo de três medidas.
- Registro de campos derivado do SDK oficial Meta v26.0.2 (URL de origem em `lib/meta-insights-fields.json`), contendo os candidatos escalares numéricos, seeds de ações/vídeo/cliques externos e subtipos de eventos descobertos na conta/período.
- Até 20 medidas por tabela, seleção por checkbox e ordem de seleção persistida. Formatação por coluna. Outros gráficos usam a primeira medida.
- Campos selecionados consultados sob demanda; autenticação, origem permitida e vínculo de conta continuam no servidor. IDs arbitrários, campos desconhecidos, override de conta e subtipos inseguros são rejeitados.
- Totais da API `summary`, CTRs normalizados de pontos percentuais para frações, ausência preservada como `null`. Tabelas novas mantêm entidades por ID, inclusive nomes iguais, sem somar taxas ou públicos sobrepostos.
- Endpoint legado permanece inalterado sem parâmetros `metrics`/`catalog`. Painéis antigos com média/contagem de linhas nas três métricas originais preservam significado, formato e edição; a UI informa quando estão usando agregação legada.
- Pizza/rosca não aceitam alcance, CTR, custos ou outras medidas não aditivas: bloqueio no parser e ao salvar/trocar tipo, mais aviso ao renderizar configuração recebida fora desse contrato.

## Limites explícitos

O catálogo não é promessa de dados para todos os objetivos, contas, níveis ou recortes. Campos numéricos especializados podem manter o identificador da API quando uma tradução/unidade não foi confirmada. Textos, IDs, rankings, histogramas e objetos não escalares não são medidas. Novas segmentações/breakdowns não fazem parte desta rodada. Subtipos especializados não retornados pelas famílias consultadas não são inventados. Não se somam variantes de eventos para fabricar um total de leads/compras.

Descoberta inicial consulta nove famílias de ações; os demais campos são solicitados quando selecionados. Uma chamada aceita até 200 IDs, tem orçamento de 40 requests/30s e cinco páginas por grupo. Campos incompatíveis conhecidos podem ser isolados; erros de autorização/rate-limit/transporte não provocam retries indiscriminados. Falhas/ausências permanecem sinalizadas e nulas.

## Evidência e revisões

- Probe pré-implementação: Graph v26.0, conta do piloto autorizada, período 2026-09-01 a 2026-09-25, cinco campanhas. Campos escalares, arrays de ações, conversões personalizadas e `default_summary=true` foram observados de fato.
- TDD: falhas observadas para total de alcance (não somar audiências), tabela multicoluna, busca/seleção, outbound metrics, legado avg/count, radiais não aditivos, edição de tabela legada, nomes de campanha longos e avisos indevidos em cards completos; depois correções e GREEN.
- Revisão `/tmp/yorus-meta-metrics-review.md`: dois achados altos (legados e radiais) tratados antes da publicação. Re-revisão `/tmp/yorus-meta-metrics-rereview.md`: ambos resolvidos; seis testes focados e 96 casos independentes de agregação legada passaram.
- A checagem inicial completa passou testes/lint mas teve dois erros TypeScript nas respostas de teste `unknown`; casts corrigidos. Não houve relaxamento da validação em produção.
- Gates finais: **397 testes em 22 arquivos**, lint, TypeScript, build e `git diff --check` com exit 0. Avisos de build preexistentes: Node `module.register()` e classificação estática de rotas do vinext.

## Verificação live e navegador

- Consulta pelo conector novo contra a API autorizada: catálogo com **306 opções** no recorte, cinco campanhas, conversão personalizada descoberta e totais comparados com resposta bruta. `partial` por métricas ausentes em algumas linhas é mantido, não convertido em zero.
- Navegador autenticado na origem privada: busca, seleção e salvamento de nove colunas (investimento, alcance, frequência, CPC, CPM, CTR, cliques no link, ação lead e conversão personalizada); **45 valores** normalizados comparados com resposta bruta, mais totais de alcance/CPC/CTR. Persistência após reload comprovada.
- Desktop 1600 e mobile 390 verificados; tabela rola internamente. Uma sobreposição de nomes de campanhas foi vista na primeira captura, reproduzida em teste e corrigida com quebra dentro da célula. Segunda captura e medição dos limites de texto passaram. Avisos de campos ausentes não contaminam cards completos que não usam esses campos.
- Evidência final exclusiva: `/root/.local/share/yorus-dash-live-qa/meta-catalog-17sMAv/`; arquivos privados e não versionados.
- A tabela temporária de QA foi removida com readback; widgets/datasets do usuário preservados.
- `https://dash.yorus.top/` atualizado, serviços ativos e acesso anônimo redirecionado ao Cloudflare Access. A autenticação pública por código de e-mail não foi automatizada. Prévia sintética antiga segue isolada e operacional, sem atualização desta rodada.
- Commits locais, sem push ou publicação em yorus.ag.
