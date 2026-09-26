# Resultado: primeiro recorte do construtor moldável

## Entregue em código
- `Meu painel` como área inicial. Fontes à esquerda, canvas de 12 colunas e inspetor à direita, responsivos. As abas legadas continuam disponíveis.
- Dataset manual por cliente: campos tipados (`texto`/`número`), linhas, nome, origem e período próprios. O administrador cria e edita; o leitor somente consulta.
- Visualizações configuráveis: métrica, barras, tabela e texto. Seleção de dimensão/medida, soma/média/contagem, número/moeda, largura 3/6/9/12, ordem por drag/drop ou botões de direção. Configuração persistida por cliente no diretório privado, com versão e conflito de revisão.
- Catálogo Meta Ads **somente quando a conta do cliente está conectada no servidor**: gasto, impressões e todos os cliques, níveis campanha/conjunto/anúncio. Fonte Meta isolada dos datasets manuais. GA4, CRM e Formulários aparecem como não conectados, sem simular dados.
- Respostas sem valores numéricos informados não são exibidas como zero. Nenhuma atribuição de linhas manuais a campanhas, leads únicos ou vendas é inferida.

## Verificado neste estado de código
- `pnpm test`: **135 testes em 15 arquivos** passaram; `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build` e `git diff --check` terminaram com exit 0.
- Testes de API incluem 401/403 por sessão/cliente/papel, mesma origem, 400 para payload inválido, 409 para revisão obsoleta, armazenamento privado e rejeição de arquivos corrompidos.
- Navegador contra build de produção local com dois clientes **inteiramente fictícios**: login, seleção e separação de clientes, canvas, fonte Meta desconectada sem chamada Meta, escrita de widget, persistência após recarga, leitura pelo endpoint, restauração do documento inicial e ausência de overflow a 1440 e 390 px. Valor monetário de três colunas permanece numa linha.
- Prévia HTTPS temporária verificada **após** reiniciar o build final: `verify-builder.py` confirmou anônimo 401, leitura/escrita/readback do administrador, Origin forjado 403, payload inválido 400, revisão obsoleta 409, segundo cliente inalterado e restauração; `verify.py` confirmou os blocos legados. O navegador Chromium externo repetiu login, troca de clientes, persistência, restauração, ausência de chamada Meta e layout sem overflow em 1440 e 390 px. `curl` retornou HTTP 200 com TLS válido.
- Revisão independente do backend sem achados P0/P1. Revisão independente da interface encontrou um P1 (células numéricas nulas exibidas como zero); correção e teste focal passaram. O revisor confirmou a correção e notou que a primeira versão do teste usava outro identificador de campo, de modo que o RED inicial não comprovava o caso de célula nula. O fixture foi corrigido para `taxa: null`, validado pelo parser, e o teste focal + a suíte completa passaram. Não atribuir ao fixture corrigido um RED que não foi observado.

## Limites
Este é um **primeiro recorte funcional**, não paridade com Data Studio/Power BI. Não há modelagem de joins, campos calculados, tipagem percentual com denominador, canvas com coordenadas livres, redimensionamento por arraste, colaboração simultânea, múltiplas páginas, nem fontes GA4/CRM/formulário conectadas. O layout é uma grade responsiva de 12 colunas com ordem e largura configuráveis. Não inserir dados pessoais de leads em conjuntos manuais.

A prévia pública temporária contém somente dados fictícios; nenhum push nem publicação de produção foi autorizado.
