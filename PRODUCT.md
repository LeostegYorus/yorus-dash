# Product

<!-- impeccable:product-schema 1 -->

## Platform
web

## Users
- Confirmado: equipe Yorus opera painéis de diferentes clientes.
- Inferido do produto atual: administrador Yorus configura blocos; usuários com permissão específica consultam apenas seus clientes. O acesso externo de clientes ainda depende de decisão e provisionamento.

## Product Purpose
Sistema de BI operacional multi-cliente, separado da prévia institucional Data Hub. Organiza indicadores de mídia e blocos configuráveis de investimento, perguntas e distribuições de formulários, contexto e decisões por cliente, para apoiar leitura e operação. O painel deve evoluir para cruzar mídia, perfil e resultado comercial somente quando existirem dados e chaves de conciliação.

## Operating Context
- Referência estrutural: HTML Basilar / Casa Parque Cerâmica fornecido por Leo; PDF de perguntas de formulário acompanha a referência. São modelos de organização, não dados transferíveis para outros clientes.
- Primeira conta real e autorizada: Meta Ads da eConfor. GA4 e CRM ainda não conectados.
- A equipe precisa configurar módulos por cliente sem editar código, guardar dados de forma durável e ver claramente fonte, período e limitações de cada bloco.

## Capabilities and Constraints
- Confirmado: seleção de cliente, login, separação de dados, API Meta somente leitura, exportação de mídia, layout analítico responsivo.
- Confirmado no pedido atual: blocos configuráveis de informações, inclusive investimento e perguntas de formulários; não se limitar a KPIs pré-fixados.
- Inferido para a primeira versão por ausência de resposta à escolha de fonte: entrada manual de contagens agregadas por alternativa, com fonte e período; sem dados pessoais ou cruzamento automático com mídia. Importação linha a linha/CSV depende de exemplo real e mapeamento posterior.
- Não publicar dados comerciais em link aberto. Dados do HTML/PDF não são métricas reais de outro cliente. Não chamar clique Meta de lead, CPL de CAC, ou declarar vendas sem CRM.

## Brand Commitments
Yorus; Satoshi nos títulos/botões e Inter no corpo. Referência de layout HTML Basilar com navegação lateral, filtros, KPIs, tabelas, distribuição e metodologia. Fundo grafite com ênfase laranja Yorus.

## Evidence on Hand
- HTML de referência: `/root/.hermes/cache/documents/doc_bfbd83063560_BI_Casa_Parque_Ceramica (1).html`.
- PDF de referência: `/root/.hermes/cache/documents/doc_a63d999a90d1_[YS] BASILAR - PERGUNTAS FORMULARIO.pdf` (quatro dimensões: finalidade, momento, barreira e renda; respostas reais de outros clientes não fornecidas).
- Conector Meta eConfor testado com campanhas, conjuntos e anúncios; não há export de respostas ou CRM fornecido para importar.

## Product Principles
- Cada bloco exibe escopo, período, fonte e estado de dados.
- A interface permite compor e reorganizar sem alterar o código.
- Configuração de perguntas não equivale a respostas coletadas; agregados manuais não permitem atribuição por campanha.
- Permissão de usuário e vínculo de conta são checados no servidor.
