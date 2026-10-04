# Yorus Dash

Sistema independente de dashboards para clientes da Yorus. **Não é o site institucional Data Hub.** A interface se inspira no BI Basilar entregue como referência visual, sem reutilizar seus dados comerciais.

## Handover técnico e operacional

Consulte [docs/HANDOVER.md](docs/HANDOVER.md) para arquitetura, funcionalidades, limitações, configuração, inventário da prévia, runbook de publicação e próximos passos. O documento separa as verificações executadas das evidências históricas e das pendências.

## Primeiro recorte

- **Meu painel (construtor):** o administrador cria conjuntos manuais com campos tipados e linhas, escolhe medidas e dimensões, escolhe formatos pré-configurados na galeria **Criar visual** (métrica, barras horizontais, colunas, linhas, área, pontos, pizza, rosca, treemap e tabela), além de texto, e configura agregação e formato. Os presets usam campos reais da fonte disponível e abrem o editor de campos; sem fonte compatível, abrem um rascunho sem métricas inventadas. O inspetor troca o tipo mantendo dados, posição e dimensões. Linhas/áreas seguem a ordem das categorias, não constituem série diária; pizza/rosca/treemap só calculam participações sobre os valores agregados exibidos se todos forem informados, não negativos e com soma positiva. Tooltips, legendas e **Ver dados** preservam rótulos completos (os eixos podem abreviá-los). O canvas usa uma grade de 12 colunas: clique em um gráfico para selecioná-lo, arraste pelo controle **Arrastar** para mudar de lugar e puxe a alça no canto para redimensionar largura e altura. O inspetor permite definir medidas exatas em colunas/linhas; a disposição fica salva por cliente. Leitores veem sem editar. Veja `docs/briefs/dashboard-builder.md` para limites e critérios.
- **Fontes Meta:** catálogo versionado a partir do SDK oficial v26.0.2, com candidatos numéricos escalares, ações comuns, vídeo e descoberta de eventos/conversões personalizados retornados pela conta no período. O editor oferece sugestões clicáveis junto da busca por nome ou identificador. Em tabelas Meta já criadas, adicionar/remover uma métrica salva as colunas e atualiza a consulta diretamente; a coluna adicionada é trazida à área visível, com confirmação e botão **Ver tabela atualizada**. Título, tamanho e demais rascunhos continuam exigindo **Salvar visualização**. Até 20 métricas por tabela; outros visuais usam uma medida. Campos são solicitados sob demanda, somente na conta autorizada no servidor. Estar no catálogo não garante retorno para toda conta/objetivo/nível: dados ausentes ficam nulos e campos rejeitados recebem aviso, sem zeros inventados. IDs, rankings, dimensões, histogramas e estruturas sem valor escalar não são medidas; segmentações adicionais não foram implementadas. Datas Meta não alteram conjuntos manuais. CTRs conhecidos são normalizados para frações antes da formatação; alcance/custos/taxas usam totais `summary` da API, nunca soma de públicos nem média de percentuais. Percentual manual sem denominador validado continua indisponível.
- As abas analíticas anteriores (Visão geral, campanhas, conjuntos, anúncios, perfil, custos e metodologia) permanecem disponíveis, inclusive o editor legado de blocos. **O construtor é um primeiro recorte funcional, não equivalência completa com Data Studio ou Power BI.**
- Cliente-piloto configurável: eConfor, conta Meta Ads expressamente autorizada. A demonstração temporária anterior usa somente clientes e dados fictícios; a prévia separada em `dash.yorus.top` consulta a API Meta de verdade, sob Cloudflare Access.
- **Blocos legados por cliente:** investimento Meta/manual, pergunta com alternativas/contagens e nota de leitura, armazenados separadamente em `DASH_DATA_DIR`. Perguntas sem contagens exibem apenas a estrutura; contagens manuais exigem fonte e período, não mudam com filtros de mídia e não permitem atribuição por campanha. Veja `docs/briefs/modular-blocks.md`.
- Meta Ads Insights em leitura somente. `clicks` significa **todos os cliques**, não cliques no link. Gastos na moeda configurada para a conta.
- GA4, respostas linha a linha, CRM, qualificação e vendas **não estão conectados**. Não inferir CPL, CAC, retorno ou qualidade de leads dessas métricas isoladas.
- Um usuário só pode consultar clientes de sua lista no servidor. O browser nunca escolhe o ID da conta Meta como autoridade.

## Ambiente local

### Personalizar o painel

1. Em **Editar painel**, abra **Visuais e fontes** para criar gráficos ou conjuntos manuais. A galeria tem busca e grupos por finalidade: resumo, comparação, evolução por categorias e participação. Selecione um visual para abrir suas **Propriedades**; apenas um painel lateral ocupa espaço de cada vez.
2. Ajuste largura, altura, coluna e linha iniciais no inspetor, ou mova/redimensione no canvas. O layout salva automaticamente. **Duplicar visual** copia os campos e a aparência para uma área livre, preservando os demais visuais.
3. Em **Editar dados e formato → Aparência**, personalize cor do gráfico, fundo, texto, tamanho da fonte, casas decimais, título, legenda e valores, conforme o tipo de visual. A aparência tem prévia imediata; **Salvar visualização** confirma e **Cancelar** descarta o rascunho. **Restaurar aparência padrão** remove as opções personalizadas ao salvar.
4. **Visualizar** recolhe as ferramentas e amplia a área de leitura. Voltar a editar preserva o rascunho aberto. **Expandir painel** oculta a navegação externa para dedicar mais espaço aos gráficos, tanto na edição quanto na leitura; **Recolher painel** restaura a navegação. Usuários leitores recebem somente a visualização. No celular, os cartões se empilham sem alterar suas posições salvas para desktop.

O editor compacto separa **Campos** e **Aparência** em abas que preservam o mesmo rascunho. **Ver visual** leva ao cartão selecionado. Além dos tipos existentes, **Pontos** compara categorias com hastes a partir do zero, inclusive valores negativos; **Treemap** mostra a participação de cada categoria pela área do retângulo. Treemap exige valores informados, não negativos e total positivo, e só aceita medidas Meta aditivas. Barras horizontais também representam valores negativos a partir de uma origem comum.

As opções ficam no documento privado de cada cliente. Documentos anteriores continuam válidos sem migração. Cores aceitam hexadecimal de seis dígitos, fontes de 12 a 32 px e precisão de 0 a 4 casas; não é permitido inserir CSS. O limite continua em 50 visuais e 64 KB por documento. Linhas e áreas representam a ordem das categorias da fonte, não uma série temporal diária.

### Explorar e comparar

- Clique em uma categoria nas barras, colunas, pontos, linhas, área, pizza, rosca, treemap ou tabela para filtrar. Os pontos também aceitam Enter/Espaço; tabelas usam botões nativos. Clique novamente na categoria selecionada ou em **Limpar filtro** para voltar. O título do cartão continua selecionando suas propriedades para edição.
- Há um filtro ativo por vez, válido durante a sessão. Em dados manuais, somente os visuais do mesmo conjunto são afetados. Na Meta, campanha filtra campanha/conjunto/anúncio, conjunto filtra conjunto/anúncio e anúncio filtra anúncio. Os outros cartões indicam que estão fora do escopo. A seleção usa IDs Meta, inclusive quando campanhas têm nomes iguais. Visuais Meta legados com média/contagem não iniciam filtros de entidade.
- **Comparar com período anterior** mostra valor anterior e variação percentual nos indicadores Meta. A consulta usa o intervalo imediatamente anterior, com a mesma duração inclusiva, e o mesmo filtro de entidade. Valores ausentes, base zero, consulta parcial ou falha recebem uma explicação. As cores são neutras: aumento de gasto não significa automaticamente melhora. Fontes manuais preservam seu período próprio.
- **Desfazer / Refazer** restauram até 20 alterações salvas nesta sessão, incluindo layout, formato, visuais e conjuntos. Cada restauração salva uma nova revisão; erros não avançam o histórico. Conflitos exigem recarregar, o que limpa o histórico. Salve ou cancele rascunhos antes de usar esses botões. Os atalhos Ctrl/Cmd+Z e Ctrl/Cmd+Shift+Z funcionam com foco no editor, preservando a edição nativa de campos de texto. Uma nova alteração elimina o caminho de refazer; trocar de cliente ou recarregar inicia um histórico vazio.

Os filtros Meta passam pela rota autenticada, com `entityLevel` e `entityId` validados, e seguem para `filtering` no endpoint de Insights da conta autorizada. Os totais continuam vindo do resumo da API, incluindo métricas não aditivas; o filtro nunca seleciona outra conta. Respostas atrasadas ou com cliente, período ou filtro diferente são descartadas. A comparação é opcional e acrescenta consultas apenas para os níveis com indicadores.

### Executar

Use Node 22.13+ e pnpm.

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm lint
pnpm exec tsc --noEmit
pnpm build
pnpm dev
```

As variáveis privadas estão descritas em `.env.example`; **não coloque valores no repositório**. Sem usuários/segredo de sessão configurados, os dados permanecem inacessíveis. `DASH_DATA_DIR` deve ser um caminho absoluto privado e persistente, fora do repo, com modo `0700`. Num contêiner com `USER node`, o volume deve ser gravável pelo UID 1000. Não use múltiplas réplicas com o armazenamento em arquivo: migre para banco transacional antes de escalar. Configuração de clientes e usuários é externa ao build; para adicionar outro cliente, associe sua conta Meta autorizada à configuração de servidor e conceda permissão explicitamente aos usuários destinados a vê-lo. Nenhum cliente fictício é enviado como exemplo de dados reais. Fluxo detalhado: `docs/onboarding.md`.

## Segurança e publicação

Dados de clientes não devem ser publicados numa URL aberta. A prévia de revisão em `dash.yorus.top` está atrás de Cloudflare Access (política Sócios Yorus) e de login próprio, com origem privada acessada somente pelo túnel; detalhes e limites de verificação em `docs/security.md`. Isso não é publicação definitiva nem dispensa controle de acesso individual e validação do login de um sócio no caminho público.
