# Resultado da primeira entrega - Yorus Dash

## Entregue
- Repositório privado independente `LeostegYorus/yorus-dash`, sem alterar o Data Hub institucional.
- UI responsiva escura com login, seleção de cliente, período, visão geral, campanhas, conjuntos, anúncios, metodologia, tabela e exportação CSV.
- Registro de clientes/usuários configurado no servidor, com autenticação assinada e vínculo explícito usuário -> cliente -> conta Meta; contas repetidas entre clientes são rejeitadas.
- API Meta Ads somente no servidor. GA4 e CRM não conectados.

## Evidências observadas
- `pnpm install --frozen-lockfile`, `pnpm test` (53/53 em 6 arquivos), `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build` e `git diff --check` concluíram com sucesso em 26/09/2026 UTC.
- Teste de rota real, em `127.0.0.1` e sem abrir porta pública: login 200, sessão restrita à eConfor, outro cliente 403, anônimo 401. Consulta Meta eConfor retornou 5 campanhas, 10 conjuntos e 39 anúncios; `Cache-Control: no-store`.
- Interface capturada em Chromium a 1440 px e 390 px com dados autorizados, sem imagens ou números de demonstração. Screenshots ficam fora do repositório porque contêm dados comerciais.
- Teste RED de conta Meta duplicada entre clientes falhou como esperado antes da correção; GREEN e suíte completa passaram após o bloqueio.

## Limites
- Não publicado em `dash.yorus.top`. A escolha de quem pode acessar a prévia com dados reais pelo Cloudflare Access não foi recebida; não se deve abrir o painel apenas com senha local.
- Adição de clientes é feita por configuração de servidor (`DASH_CLIENTS_JSON`, `DASH_USERS_JSON`), não há tela administrativa de cadastro ainda.
- GA4 exige propriedade e conta de serviço autorizadas. Leads, vendas e CAC não são inferidos a partir de cliques e gasto Meta.
- Build vinext exibiu aviso não bloqueante de classificação estática de rotas; concluiu normalmente.
