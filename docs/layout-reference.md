# Referência visual do BI operacional

Referência fornecida por Leo: HTML `BI_Casa_Parque_Ceramica (1).html` (Basilar / Casa Parque Cerâmica). Não copiar dados de mídia, IDs, métricas nem inferências do cliente para a aplicação multi-cliente.

## Invariantes de interface

- Tela cheia com sidebar Yorus e abas reais; cada aba troca um painel, sem expandir/fechar a visualização.
- Fundo grafite, painéis levemente elevados, divisórias discretas, uma cor de ênfase laranja Yorus, texto claro; Satoshi nos títulos/botões e Inter no corpo.
- Cabeçalho contextual (cliente, empreendimento, canal, intervalo e atualização), filtros por período/conta/campanha/conjunto/peça; escopo de cada métrica sempre visível.
- Visão geral: KPIs, leitura executiva, comparações e evolução temporal. Abas de segmentações e anúncios: tabelas com custo, volume, participação e taxas. Metodologia/limitações acessíveis e exportação.
- A leitura deve distinguir **dado de mídia**, **sinal analítico** e **resultado comercial validado**. Nenhuma atribuição de vendas sem CRM conciliado.
- Layout responsivo: sidebar pode virar navegação horizontal no mobile; tabelas rolam horizontalmente sem esmagar colunas. Estados de carregamento, vazio e erro.

## Contrato inicial dos conectores

Meta Ads e GA4 entram como fontes independentes de leitura via API. Cada consulta registra provedor, conta/propriedade, período, horário de coleta, status, avisos e linhas. Não somar métricas de plataformas distintas nem assumir que clique Meta equivale a sessão GA4. A UI atual do repositório é uma demonstração ilustrativa: o painel real somente será conectado depois de autenticação por cliente e validação de dados ao vivo.
