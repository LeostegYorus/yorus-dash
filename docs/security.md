# Isolamento e publicação do Yorus Dash

## Fronteira de dados

O cliente escolhido na interface é um **slug**, não um ID de conta de anúncio. O servidor resolve slug -> cliente -> conta Meta autorizada somente após identificar o usuário e verificar seu membership. Nenhum usuário recebe credencial Meta. Toda resposta com dados deve usar `Cache-Control: no-store`. O token Meta é compartilhado no servidor com permissões mínimas (`ads_read`) e nunca é publicado no JavaScript.

A primeira configuração conhecida é eConfor (`act_2851473791833439`, BRL). Para outro cliente, o operador configura **novo vínculo de conta autorizado** e concede acesso apenas aos usuários desse cliente. Não usar um seletor de contas Meta acessíveis como se todas fossem autorizadas.

## Blocos e dados inseridos pela Yorus

Blocos do cliente são persistidos em diretório privado (`DASH_DATA_DIR`) fora do repositório, separados por slug validado. Leitura requer membership; escrita exige `role=admin` e controle de versão para impedir sobrescrita silenciosa. A primeira versão aceita apenas perguntas/contagens **agregadas**, orçamento informado e notas, sem armazenar nomes, telefones ou linhas de leads. Fonte e período são obrigatórios para contagens e valores manuais. Esses totais não são atribuídos automaticamente a campanhas; cruzamento exige dados linha a linha e chave de origem conciliável.

## Camadas de acesso planejadas

1. Autenticação de borda apropriada à internet: Cloudflare Access no host `dash.yorus.top`, com política restrita e login por código no e-mail para os sócios Yorus. A aplicação Access deve ser criada e verificada ANTES de qualquer publicação. O DNS atual de `dash.yorus.top` está respondendo pelo wildcard antigo, não é prova de rota ativa.
2. Sessão própria do app (usuário/senha forte com scrypt, cookie HttpOnly, assinatura e expiração). O usuário vê apenas seus clientes.
3. Para receber clientes externos, substituir ou complementar o acesso da borda por uma política que inclua identidades específicas e mantenha a verificação por cliente no app. Não compartilhar senha administrativa entre clientes.

O Access atual do host `hermes.yorus.top` usa uma política privada “Sócios Yorus”, com login por código de e-mail. Isso serve como referência de arquitetura, **não é autorização automática para copiar essa política** ou publicar o novo host. Um proxy sem Access e apenas senha compartilhada não é implantação de produção aprovada.

## Integrações

Meta Ads: campanhas/conjuntos/anúncios. `clicks` da API = todos os cliques. Sem leads e CRM não apresentar qualificação, CPL ou vendas. GA4 só após obter a propriedade autorizada e conceder acesso de Leitor à service account; não usar o token Google Workspace atual sem escopo Analytics.
