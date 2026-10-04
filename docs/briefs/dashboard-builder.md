# Construtor do Yorus Dash

## Objetivo

Leo quer **montar o painel**, não apenas editar três tipos de bloco. O fluxo deve permitir selecionar uma fonte autorizada por cliente, escolher seus campos, ajustar visualização e formato, ordenar e dimensionar elementos no canvas e guardar a composição para visualização posterior. A interação do Looker Studio/Data Studio ou Power BI é referência; não há paridade de produto prometida.

## Recorte funcional inicial

- Painel próprio por cliente, com edição de administrador e leitura por viewer.
- Conjunto manual estruturado: nome, fonte, período fixo, colunas de texto/número e linhas; disponibilizar os campos ao editor de visualizações.
- Catálogo de campos Meta Ads somente para a conta associada ao cliente pela configuração do servidor; gasto, impressões, cliques e nomes de campanha/conjunto/anúncio no nível apropriado. Consulta somente quando configurada e utilizada.
- Visualizações configuráveis: indicador, barras, tabela e texto. Título, dimensão quando aplicável, medida, agregação, formatação e largura do elemento; ordenação acessível e posição salva.
- A data global afeta exclusivamente widgets Meta. Fontes manuais conservam sua origem e período; não misturar investimento manual com gasto Meta.
- Persistência privada isolada por cliente, versão otimista e rejeição de acesso de outro cliente. Sem dados reais na prévia de túnel.

## Personalização do editor

O editor permite alternar entre edição e leitura, recolher fontes/propriedades, duplicar um visual e informar sua posição exata na grade. A aparência opcional de cada visual guarda cores, tamanho de texto, precisão numérica e visibilidade de título, legenda e valores. A prévia da aparência não grava o documento; a confirmação ocorre em **Salvar visualização**. Mover, redimensionar e duplicar continuam salvando diretamente com verificação da versão. Documentos sem aparência mantêm o estilo padrão. Gráficos ajustam a área de desenho à dimensão do cartão; conteúdo que excede o espaço permanece rolável e acessível por teclado.

A interface escura e compacta oferece modo de foco (**Expandir painel**), galeria com busca e grupos, e abas **Campos/Aparência** com rascunho compartilhado. Os tipos adicionais **Pontos** e **Treemap** reutilizam os campos e a persistência existentes. Pontos e barras horizontais aceitam valores negativos com origem em zero. Treemap usa áreas proporcionais e não calcula participação quando houver valores ausentes, negativos ou total zero; medidas Meta não aditivas são rejeitadas pelo servidor. Rótulos pequenos podem ser abreviados ou omitidos no desenho, mantendo o conteúdo completo nos detalhes acessíveis.

Análise interativa: seleção única por categoria/entidade na sessão, limitada à mesma fonte e à hierarquia Meta compatível. Indicadores Meta podem comparar com o intervalo anterior de igual duração usando resumos da API. O editor guarda até 20 estados salvos em memória para desfazer/refazer, sem substituir o controle de revisão do servidor. Isso não é histórico persistente ou colaboração simultânea.

## Limites mantidos

Conexões GA4, CRM e respostas individuais de formulário; cruzamentos entre fontes, joins, campos calculados, filtros arbitrários por widget, atribuição de campanhas a respostas/vendas, colaboração simultânea, histórico de versões, controle de permissão por dashboard e equivalência integral com ferramentas de BI. A interface deve identificar indisponibilidade, jamais simular fontes ou atribuições.

## Critérios de aceite

Criar dataset manual e widget, recarregar e ver o mesmo painel; alterar formato/largura/ordem; leitor não edita; alternar clientes não vaza informação; fonte Meta ausente não dispara consulta; validações do servidor barram campos, origens, valores e IDs inválidos; suites, lint, tipos e build passam; prévia sintética navegável em desktop e celular.
