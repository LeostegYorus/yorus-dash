# Implantação de um cliente no Yorus Dash

> Este guia descreve a configuração do produto, **não** autoriza expor dados de clientes em URL pública.

1. Cadastrar o slug, nome, moeda e **conta Meta Ads explicitamente autorizada** em `DASH_CLIENTS_JSON` no servidor. A mesma conta não pode pertencer a dois slugs.
2. Conceder o slug somente aos usuários pertinentes em `DASH_USERS_JSON`. `admin` compõe blocos; os demais perfis consultam. Senhas são hashes scrypt; o segredo de sessão não vai ao repositório. Consulte `.env.example` e `docs/security.md`.
3. Preparar `DASH_DATA_DIR` como diretório absoluto fora do repositório, persistente, de propriedade do usuário que roda Node e modo `0700`. Não colocar em diretório temporário no ambiente de produção. Armazenamento em arquivo exige **uma réplica Node**; fazer backup do diretório e restaurar em ambiente restrito. Antes de escalar, migrar a um banco transacional.
4. Entrar como administrador, escolher o cliente e criar blocos nas seções **Visão geral**, **Perfil dos leads** e **Custos e decisão**. Investimento Meta usa o filtro de mídia; investimento manual requer valor, fonte e período próprios e não é somado ao Meta. Pergunta pode existir sem resultados; para registrar distribuição, preencher todas as contagens com fonte e período. Notas diferenciam fato (com fonte), hipótese e decisão.
5. Revisar como usuário somente leitura: nenhum controle de edição, nenhuma informação do outro cliente, pergunta vazia sem percentuais e período manual explícito. Trocar o filtro Meta não altera valores manuais.

## Quando precisar reproduzir os cruzamentos da referência

O PDF Basilar (ver `docs/form-template-reference.md`) recomenda renda × momento, finalidade × criativo, barreira × momento e respostas × mídia. **Agregados por pergunta não contêm as linhas ou chaves necessárias.** Será necessário export autorizado ou acesso de leitura aos formulários, com mapeamento de pergunta/opção e IDs de campanha/conjunto/anúncio, além da decisão de tratamento de dados pessoais. Não importar PII para os blocos de contagem. Sem isso, não chamar o perfil de atribuição por campanha nem calcular custo por perfil.

## Publicação

A prévia atual não é pública. Antes de publicar com dados reais, decidir quem pode entrar, configurar MFA/Access ou OIDC, validar os acessos por usuário/cliente e então testar a rota externa, API, gravação e leitura de volta. Não usar login local isolado como único controle para internet pública.
