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

## Fora deste recorte

Conexões GA4, CRM e respostas individuais de formulário; cruzamentos entre fontes, joins, campos calculados, filtros arbitrários por widget, atribuição de campanhas a respostas/vendas, colaboração simultânea, histórico de versões, controle de permissão por dashboard e equivalência integral com ferramentas de BI. A interface deve identificar indisponibilidade, jamais simular fontes ou atribuições.

## Critérios de aceite

Criar dataset manual e widget, recarregar e ver o mesmo painel; alterar formato/largura/ordem; leitor não edita; alternar clientes não vaza informação; fonte Meta ausente não dispara consulta; validações do servidor barram campos, origens, valores e IDs inválidos; suites, lint, tipos e build passam; prévia sintética navegável em desktop e celular.
