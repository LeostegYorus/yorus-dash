# Análise interativa e histórico de edição

> Execução: superpowers:executing-plans, diretamente neste chat. Autorização: “manda bala” após a proposta de filtros, comparação e desfazer/refazer.

**Objetivo:** explorar os dados entre visuais e editar com reversão segura, preservando o layout escuro e compacto.
**Arquitetura:** seleção e comparação são estado de leitura da sessão; o documento persistido não muda. Filtros manuais ficam no próprio dataset. Filtros Meta usam IDs de entidades e consultas na conta autorizada, incluindo o resumo da API. Histórico limitado a 20 documentos salvos, com novas revisões a cada desfazer/refazer.
**Stack:** React, TypeScript, SVG, Vitest; nenhuma dependência nova.
**Especificação:** proposta aprovada no chat e `docs/briefs/dashboard-builder.md`.

## Restrições e foco de revisão
- Fontes manuais nunca seguem o período Meta; datasets diferentes não são cruzados.
- Um filtro ativo por vez. Meta: campanha afeta campanha/conjunto/anúncio; conjunto afeta conjunto/anúncio; anúncio afeta anúncio. Cartões fora do escopo são identificados.
- Comparação apenas em indicadores Meta, usando o intervalo anterior de igual duração inclusiva. Zero, ausentes, dados parciais e falhas não geram variação enganosa.
- Desfazer/refazer só após gravação bem-sucedida; versão atual no PUT, sem ultrapassar conflitos, rascunhos ou mudança de cliente. Atalhos não interceptam campos de edição.
- Respostas atrasadas ou com identidade/filtro incorretos não reaparecem. IDs repetidos por nome permanecem distinguíveis.
- Trabalho local, preservando as alterações existentes. Sem publicação, alteração de anúncios ou acesso a segredos.

## Tarefas
1. [x] Testar e implementar filtros Meta validados no conector e rota: `entityLevel`, `entityId`, serialização `filtering`, resumo filtrado e identidade de retorno.
2. [x] Testar e implementar auxiliares de período/filtro e interação acessível entre cartões. Criar `lib/builder-analysis.ts`; adaptar gráfico, treemap e dashboard; chips visíveis e limpar seleção.
3. [x] Testar e implementar comparação em indicadores: consulta anterior independente, cancelamento, resumo e mensagens de indisponibilidade.
4. [x] Testar e implementar histórico de edição: desfazer/refazer, limite, falha/conflito, ramificação e isolamento; atalhos Ctrl/Cmd+Z e Shift+Z.
5. [x] Validar no navegador desktop/celular, atualizar documentação, executar suíte completa, tipos, lint e build; revisão independente.

Cada tarefa funcional começa com testes que falham no comportamento ausente, seguida de implementação e verificação. Suíte inicial: 422 aprovados e 19 falhas existentes de permissões/symlinks Windows em blocks-route, blocks-store, builder-route e builder-store.


## Evidências de conclusão
- RED: conector/rota sem suporte a filtros; interface sem filtros, comparação ou histórico. GREEN: 186 testes focados e 20 testes de limites aprovados.
- Revisão independente: um problema em nomes Meta duplicados. Teste reproduziu `aria-pressed=false` após filtrar; seleção/toggle agora usam IDs estáveis. Teste GREEN.
- Suíte completa: 463 aprovados, mesmas 19 falhas anteriores Windows (blocks-route, blocks-store, builder-route, builder-store), em 28 arquivos. Log local: work/analysis-final-tests.log.
- TypeScript, ESLint e build concluídos com sucesso. `diff --check` sem erros de whitespace.
- Navegador: comparação sintética +25% e +11,1%, filtro Meta por campanha mantendo manual fora do escopo, desfazer/refazer do tipo de gráfico, interação por teclado, viewport móvel 390 px sem overflow da página.
- Escopo da revisão: mudanças anteriores de aparência já revisadas; conferência visual desta etapa realizada no navegador. API Meta ao vivo não exercitada; contratos do conector/rota testados com transporte sintético. Não houve alteração de permissões para contornar as falhas Windows.
- Decisão de entrega: manter trabalho local e não publicar; prévia original 4318 preservada, demonstração isolada da comparação em 4319/preview-meta.html. Histórico de edição e filtros são de sessão, não histórico persistente.
