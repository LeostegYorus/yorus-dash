# Isolamento e publicação do Yorus Dash

## Fronteira de dados

O cliente escolhido na interface é um **slug**, não um ID de conta de anúncio. O servidor resolve slug -> cliente -> conta Meta autorizada somente após identificar o usuário e verificar seu membership. Nenhum usuário recebe credencial Meta. Toda resposta com dados deve usar `Cache-Control: no-store`. O token Meta é compartilhado no servidor com permissões mínimas (`ads_read`) e nunca é publicado no JavaScript.

A primeira configuração conhecida é eConfor (`act_2851473791833439`, BRL). Para outro cliente, o operador configura **novo vínculo de conta autorizado** e concede acesso apenas aos usuários desse cliente. Não usar um seletor de contas Meta acessíveis como se todas fossem autorizadas.

## Blocos e dados inseridos pela Yorus

Blocos do cliente são persistidos em diretório privado (`DASH_DATA_DIR`) fora do repositório, separados por slug validado. Leitura requer membership; escrita exige `role=admin` e controle de versão para impedir sobrescrita silenciosa. A primeira versão aceita apenas perguntas/contagens **agregadas**, orçamento informado e notas, sem armazenar nomes, telefones ou linhas de leads. Fonte e período são obrigatórios para contagens e valores manuais. Esses totais não são atribuídos automaticamente a campanhas; cruzamento exige dados linha a linha e chave de origem conciliável.

## Construtor e dados inseridos manualmente
O construtor usa documentos independentes dos blocos legados. O mesmo `DASH_DATA_DIR` privado guarda datasets tipados e a composição por cliente; a rota exige autenticação, membership, papel de administrador para escrita, origem válida e revisão otimista. Não inserir nomes, telefones, e-mails ou respostas linha a linha de pessoas nos datasets manuais desta prévia: campos de texto livres podem armazenar dados pessoais, mesmo quando a interface os chama de categorias. Antes de dados reais, definir política de retenção, revisão de acesso e importação/consentimento apropriados. Fonte e período manuais são explícitos e não seguem automaticamente os filtros Meta. Não há junção entre datasets e campanhas, nem atribuição de resultados comerciais.

## Acesso da prévia com dados de API (2026-09-26)

A prévia de revisão em `dash.yorus.top` usa Cloudflare Access com uma política **Sócios Yorus** de três e-mails individuais, copiada da política já usada em `hermes.yorus.top` após autorização de Leo. Ela chega ao serviço Node por um **Cloudflare Tunnel dedicado**, sem rota Traefik no IP público; o serviço escuta apenas `127.0.0.1`. O app mantém seu próprio login por senha e isolamento por cliente. Credenciais e dados do tunnel ficam fora do repositório, em arquivos privados. Não é a publicação definitiva em `yorus.ag`.

Verificação observada: aplicação/política lidas de volta pela API Cloudflare; túnel saudável, DNS CNAME proxyado; requisições anônimas para `/`, `/api/session` e `/api/dashboard` na URL pública redirecionam para Access; acesso direto ao IP de origem com Host `dash.yorus.top` não alcança a aplicação (404). Localmente, com headers de proxy e login próprio, `/api/session`, o construtor e `/api/dashboard` retornam 200; a rota Meta devolveu cinco campanhas no período testado, e widgets configurados persistiram sem armazenar valores da API. **O caminho público após o código enviado por e-mail do Access ainda depende de login real de um sócio; não foi automatizado nem declarado verificado.** A URL antiga de demonstração continua separada e sintética.

## Camadas de acesso

1. Autenticação de borda: Cloudflare Access no host `dash.yorus.top`, com política restrita e login por código no e-mail para os sócios Yorus; app e CNAME explícito verificados por leitura de volta.
2. Sessão própria do app (usuário/senha forte com scrypt, cookie HttpOnly, assinatura e expiração). O usuário vê apenas os clientes a que está vinculado.
3. Para receber clientes externos, substituir ou complementar o acesso da borda por uma política que inclua identidades específicas e mantenha a verificação por cliente no app. Não compartilhar senha administrativa entre clientes.

A política privada “Sócios Yorus” de `hermes.yorus.top` foi usada como referência e copiada para o app Access desta prévia após Leo escolher expressamente esse público. Um proxy sem Access e apenas senha compartilhada não é implantação aprovada. A checagem de `Origin` aceita `X-Forwarded-Proto: https` apenas para casar o mesmo host HTTPS com o listener Node HTTP; esse header precisa vir de um proxy confiável, e o listener permanece privado/loopback.

## Integrações

Meta Ads: campanhas/conjuntos/anúncios. `clicks` da API = todos os cliques. Sem leads e CRM não apresentar qualificação, CPL ou vendas. GA4 só após obter a propriedade autorizada e conceder acesso de Leitor à service account; não usar o token Google Workspace atual sem escopo Analytics.
