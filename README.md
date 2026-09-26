# Yorus Dash

Sistema independente de dashboards para clientes da Yorus. **Não é o site institucional Data Hub.** A interface se inspira no BI Basilar entregue como referência visual, sem reutilizar seus dados comerciais.

## Primeiro recorte

- **Meu painel (construtor):** o administrador cria conjuntos manuais com campos tipados e linhas, escolhe medidas e dimensões, insere widgets de métrica, barras, tabela ou texto e configura agregação e formato. O canvas usa uma grade de 12 colunas: clique em um gráfico para selecioná-lo, arraste pelo controle **Arrastar** para mudar de lugar e puxe a alça no canto para redimensionar largura e altura. O inspetor permite definir medidas exatas em colunas/linhas; a disposição fica salva por cliente. Leitores veem sem editar. Veja `docs/briefs/dashboard-builder.md` para limites e critérios.
- **Fontes:** catálogo Meta Ads em leitura, com investimento, impressões, cliques e dimensões de campanha/conjunto/anúncio, somente para a conta autorizada no servidor. Se não estiver conectada, não há métricas inventadas. Datas Meta não alteram valores de conjuntos manuais; estes têm fonte e período próprios. Percentuais sem denominador validado não são oferecidos como formatação.
- As abas analíticas anteriores (Visão geral, campanhas, conjuntos, anúncios, perfil, custos e metodologia) permanecem disponíveis, inclusive o editor legado de blocos. **O construtor é um primeiro recorte funcional, não equivalência completa com Data Studio ou Power BI.**
- Cliente-piloto configurável: eConfor, conta Meta Ads expressamente autorizada. A demonstração temporária anterior usa somente clientes e dados fictícios; a prévia separada em `dash.yorus.top` consulta a API Meta de verdade, sob Cloudflare Access.
- **Blocos legados por cliente:** investimento Meta/manual, pergunta com alternativas/contagens e nota de leitura, armazenados separadamente em `DASH_DATA_DIR`. Perguntas sem contagens exibem apenas a estrutura; contagens manuais exigem fonte e período, não mudam com filtros de mídia e não permitem atribuição por campanha. Veja `docs/briefs/modular-blocks.md`.
- Meta Ads Insights em leitura somente. `clicks` significa **todos os cliques**, não cliques no link. Gastos na moeda configurada para a conta.
- GA4, respostas linha a linha, CRM, qualificação e vendas **não estão conectados**. Não inferir CPL, CAC, retorno ou qualidade de leads dessas métricas isoladas.
- Um usuário só pode consultar clientes de sua lista no servidor. O browser nunca escolhe o ID da conta Meta como autoridade.

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

As variáveis privadas estão descritas em `.env.example`; **não coloque valores no repositório**. Sem usuários/segredo de sessão configurados, os dados permanecem inacessíveis. `DASH_DATA_DIR` deve ser um caminho absoluto privado e persistente, fora do repo, com modo `0700`. Num contêiner com `USER node`, o volume deve ser gravável pelo UID 1000. Não use múltiplas réplicas com o armazenamento em arquivo: migre para banco transacional antes de escalar. Configuração de clientes e usuários é externa ao build; para adicionar outro cliente, associe sua conta Meta autorizada à configuração de servidor e conceda permissão explicitamente aos usuários destinados a vê-lo. Nenhum cliente fictício é enviado como exemplo de dados reais. Fluxo detalhado: `docs/onboarding.md`.

## Segurança e publicação

Dados de clientes não devem ser publicados numa URL aberta. A prévia de revisão em `dash.yorus.top` está atrás de Cloudflare Access (política Sócios Yorus) e de login próprio, com origem privada acessada somente pelo túnel; detalhes e limites de verificação em `docs/security.md`. Isso não é publicação definitiva nem dispensa controle de acesso individual e validação do login de um sócio no caminho público.
