# Yorus Dash

Sistema independente de dashboards para clientes da Yorus. **Não é o site institucional Data Hub.** A interface se inspira no BI Basilar entregue como referência visual, sem reutilizar seus dados comerciais.

## Primeiro recorte

- Cliente-piloto: eConfor, conta Meta Ads expressamente autorizada.
- Navegação: visão geral, campanhas, conjuntos, anúncios e metodologia; seleção de cliente e período.
- Meta Ads Insights em leitura somente. `clicks` significa **todos os cliques**, não cliques no link. Gastos na moeda configurada para a conta.
- GA4, leads, CRM, qualificação e vendas **não estão conectados**. Não inferir CPL, CAC, retorno ou qualidade de leads dessas métricas isoladas.
- Um usuário só pode consultar clientes de sua lista no servidor. O browser nunca escolhe nem recebe o ID da conta Meta como autoridade.

## Ambiente local

Use Node 22.13+ e pnpm.

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm lint
pnpm exec tsc --noEmit
pnpm build
pnpm dev
```

As variáveis privadas estão descritas em `.env.example`; **não coloque valores no repositório**. Sem usuários/segredo de sessão configurados, os dados permanecem inacessíveis. Configuração de clientes e usuários é externa ao build; para adicionar outro cliente, associe sua conta Meta autorizada à configuração de servidor e conceda permissão explicitamente aos usuários destinados a vê-lo. Nenhum cliente fictício é enviado como exemplo de dados reais.

## Segurança e publicação

Dados de clientes não devem ser publicados numa URL aberta. A autenticação local de administração é apenas para validação técnica; antes de disponibilizar o painel de produção na internet, usar autenticação adequada com MFA (OIDC/Access) e verificar acesso permitido e isolamento entre clientes. O subdomínio sandbox proposto é `dash.yorus.top`, ainda não publicado por este projeto.
