# Handover — Yorus Dash

> Fotografia técnica e operacional em **2026-10-03 (UTC)**. Documento para a pessoa ou agente que assumir desenvolvimento e operação. Não contém credenciais. Não é declaração de prontidão para produção pública.

## 1. Resumo executivo

O **Yorus Dash** é um sistema independente de BI multi-cliente. A Yorus configura painéis com dados Meta Ads e conjuntos manuais; cada usuário consulta somente os clientes autorizados. O diferencial solicitado é um **construtor moldável**, com galeria de visuais, campos configuráveis e canvas arrastável/redimensionável — não um painel fixo nem uma réplica completa de Power BI.

- **Repositório:** https://github.com/LeostegYorus/yorus-dash
- **PR de entrega:** https://github.com/LeostegYorus/yorus-dash/pull/1
- **Branch de entrega:** `feat/dashboard-builder-meta-gallery` → `main`.
- **Revisão de código validada:** `0b590b91c67fa9dc847e5e7431985af117808cf6`.
- **Prévia com dados reais, acesso restrito:** https://dash.yorus.top/
- **Cliente-piloto:** eConfor, conta Meta explicitamente autorizada.
- **Estado do PR na consulta:** aberto, sem conflitos; sem checks de CI reportados.
- **Entrega anterior ao documento:** 27 commits de implementação/documentação, 55 arquivos alterados. O commit deste handover é adicional a esse lote.
- **Merge e deploy não foram executados nesta entrega.** O código foi publicado na branch; não confundir upload com atualização da `main` ou do serviço.

**Não confundir produtos:** Data Hub é a prévia institucional da oferta; Yorus Dash é o sistema de dashboards. `yorus.top` é ambiente de sandbox; publicação definitiva em `yorus.ag` depende de decisão própria.

## 2. Requisitos e decisões que devem ser preservados

1. Painel configurável por cliente, não cartões fixos com métricas pré-escolhidas.
2. Galeria por ícones: escolher visual, ligar campos e trocar o formato sem reconstruir a fonte.
3. Mover e redimensionar o gráfico diretamente no canvas; manter também ajuste preciso no inspetor.
4. Usar API real para declarar integração real. Não apresentar fixtures ou exemplos como métricas de clientes.
5. HTML Basilar/Casa Parque Cerâmica é referência visual e estrutural; seus números não são dados de outros clientes.
6. Satoshi em títulos/botões, Inter no corpo; identidade Yorus, grafite e laranja, interface responsiva.
7. Meta somente leitura e com allowlist explícita. Acesso técnico a uma conta não equivale a autorização de uso.
8. Origem, período e limitações dos dados precisam permanecer claros. Ausência não vira zero.
9. Agregados manuais não permitem atribuição por campanha. Não chamar cliques de leads, leads de vendas ou CPL de CAC.
10. Não publicar dados comerciais em URL aberta e não inserir PII nesta prévia.

Fontes: [README](../README.md), [produto](../PRODUCT.md), [segurança](security.md), [referência de formulário](form-template-reference.md).

## 3. O que está implementado

### Acesso e separação de clientes

- Login próprio com senha verificada por scrypt.
- Sessão assinada com HMAC, cookie `dash_session`, validade de oito horas, `HttpOnly` e `SameSite=Strict`; `Secure` condicionado a `NODE_ENV=production` no código.
- O servidor resolve o slug do cliente para a conta Meta autorizada. O browser não fornece um ID de conta como autoridade.
- Leitura exige vínculo ao cliente. Escrita exige `role=admin`; os demais papéis ficam somente leitura.
- Respostas JSON usam `Cache-Control: no-store`.
- Escritas verificam origem e revisão do documento.

### Construtor

- Conjuntos manuais com campos tipados, linhas, fonte e período próprios.
- Fontes Meta por campanha, conjunto e anúncio.
- Visuais: métrica, barras horizontais, colunas, linhas, área, pizza, rosca e tabela; texto independente.
- Galeria para criação e troca de visual, configuração de dimensão/medida e formatação.
- Canvas em grade de 12 colunas, com arraste, redimensionamento, posição e altura persistidos por cliente.
- Leitores veem os visuais sem os controles de edição.

### Métricas Meta e tabelas

- Catálogo versionado com campos escalares e ações/eventos; descoberta conforme os dados retornados pela conta/período.
- Busca por rótulo ou identificador, com sugestões clicáveis próximas ao campo.
- Buscar `lead` prioriza `actions:lead`; não confundir quantidade com custo/valor ou outro evento.
- Tabelas Meta permitem até 20 métricas lado a lado.
- Em tabela Meta já salva, adicionar/remover coluna salva sua configuração e atualiza os dados; não salva rascunhos não relacionados, como título.
- Tabela nova e outros tipos de visual mantêm salvamento explícito.
- Confirmação de sucesso depende da resposta da API; a coluna adicionada é trazida para a área visível.
- Campos ausentes ficam nulos, com avisos. Totais não aditivos dependem de `summary` da API, sem soma de alcance nem média ingênua de taxas.

### Funcionalidades anteriores preservadas

- Abas analíticas de visão geral, campanhas, conjuntos, anúncios, perfil, custos e metodologia.
- Blocos legados de investimento, perguntas com contagens agregadas e notas, separados do documento do construtor.
- Exportação CSV de mídia no painel analítico existente; não confundir com exportação completa do projeto do construtor.

Fontes: [componentes](../app/components/), [tipos/validação do construtor](../lib/builder-types.ts), [resultado da galeria](briefs/visual-gallery.RESULT.md), [resultado das métricas](briefs/meta-metrics.RESULT.md), [correção do seletor](briefs/lead-picker-fix.RESULT.md).

## 4. Limitações reais e não implementado

- **GA4 não está conectado ao produto.** Existe módulo `lib/integrations/ga4.ts` e testes, mas o cliente público retorna `gaConnected: false` e a rota de dados atual usa Meta. Existência do módulo não comprova integração operacional.
- CRM, vendas, qualificação, respostas de formulário linha a linha e cruzamentos mídia × perfil × receita não estão conectados.
- Sem chave conciliável, não existe atribuição comercial comprovada, CAC ou retorno de vendas.
- Linhas/áreas seguem as categorias retornadas; não são automaticamente séries diárias. Segmentações adicionais Meta não foram implementadas.
- Percentual manual não está disponível sem contrato de denominador; tabela manual não tem o mesmo contrato multimedida da tabela Meta.
- Persistência por arquivo, sem banco transacional, compartilhamento seguro entre processos ou histórico completo de auditoria.
- Sem workflow de CI versionado no snapshot inspecionado; nenhum check reportado no PR no momento da consulta.
- Não houve nova validação de login público autenticado por sócio nesta entrega.
- Não foi comprovada a revisão exata do bundle atualmente servido. `HEAD` do diretório do serviço não prova qual revisão gerou `dist`.
- Login não contém rate limiting próprio na rota inspecionada; política de limitação na borda precisa ser avaliada antes de ampliar o público. Isso é uma recomendação de hardening, não uma afirmação de falha atual da borda.

### Limites impostos pelo código

| Item | Limite/contrato |
|---|---|
| Documento do construtor | 65.536 bytes, incluindo datasets e widgets |
| Datasets por cliente | Até 8 |
| Campos por dataset | De 1 a 12 |
| Linhas por dataset | Até 200 |
| Widgets por cliente | Até 50 |
| Largura de widget | De 1 a 12 colunas |
| Altura de widget posicionada | De 2 a 24 linhas |
| Métricas por tabela Meta | Até 20 |
| Consulta Meta do construtor | Diferença entre início e fim de até 92 dias |
| Coleta Meta do construtor | Até 5 páginas por grupo; limite global de 40 requisições e prazo de 30 s |

Um documento pode atingir o limite de bytes antes de atingir o limite de linhas ou widgets. Avisos de paginação/campos indisponíveis precisam ser preservados na interface.

Fontes: [builder-types](../lib/builder-types.ts), [meta-builder](../lib/integrations/meta-builder.ts), [GA4](../lib/integrations/ga4.ts), [clientes](../lib/clients.ts), [login](../app/api/login/route.ts).

## 5. Arquitetura e mapa do código

```text
Browser
  └─ Cloudflare Access (prévia real)
      └─ Cloudflare Tunnel
          └─ Node / vinext (listener privado)
              ├─ UI React: painel, construtor, galeria, tabelas e gráficos
              ├─ Auth + vínculo usuário → cliente → conta autorizada
              ├─ GET /api/dashboard → Meta Insights somente leitura
              └─ GET/PUT /api/clients/:client/{builder,blocks}
                  └─ DASH_DATA_DIR privado, documentos JSON por cliente
```

### Stack do snapshot

- TypeScript, React 19.2.6 e Next 16.2.6, executados via **vinext 1.0.0-beta.3 / Vite 8.0.13**.
- Tailwind 4 e CSS próprio; Vitest 4, Testing Library, ESLint 9.
- Node mínimo declarado: `>=22.13.0`; Dockerfile fixa imagem Node 24 por digest.
- Gerenciador: pnpm com lockfile. Na validação desta entrega foi usado pnpm 11.25.0.
- A configuração Vite inclui plugin Cloudflare, mas a prévia observada roda como serviço Node via systemd. Não assumir deploy em Workers.

| Área | Arquivos principais |
|---|---|
| Entrada e layout | `app/page.tsx`, `app/layout.tsx` |
| Painel, sessão e CSV | `app/components/dashboard.tsx` |
| Estado/UI do construtor | `app/components/dashboard-builder.tsx` |
| Gráficos e galeria | `builder-chart.tsx`, `builder-visuals.tsx` em `app/components/` |
| Geometria do canvas | `app/components/builder-layout.ts` |
| Seletor Meta | `app/components/meta-metric-picker.tsx` |
| Blocos anteriores | `app/components/block-editor.tsx` |
| Tema e layout | `app/globals.css`, `app/builder.css`, `app/builder-charts.css` |
| Sessão e autorização | `lib/auth.ts`, `lib/clients.ts` |
| Schema e storage | `lib/builder-types.ts`, `lib/builder-store.ts`, `lib/block-types.ts`, `lib/block-store.ts` |
| Meta legado/construtor | `lib/integrations/meta.ts`, `lib/integrations/meta-builder.ts` |
| Catálogo de métricas | `lib/meta-metrics.ts`, `lib/meta-insights-fields.json` |
| Conector GA4 isolado | `lib/integrations/ga4.ts` |
| Testes | `app/__tests__/`, `app/components/__tests__/`, `lib/__tests__/`, `lib/integrations/__tests__/` |

### Contratos HTTP

| Método e rota | Uso |
|---|---|
| `POST /api/login` | Autenticar usuário; JSON com email e senha |
| `POST /api/logout` | Encerrar cookie de sessão |
| `GET /api/session` | Recuperar sessão e clientes disponíveis |
| `GET /api/dashboard` | Dados Meta: `client`, `start`, `end`, `level`; opcionais `metrics` e `catalog=1` |
| `GET /api/clients/:client/builder` | Ler documento do construtor |
| `PUT /api/clients/:client/builder` | Salvar documento completo com `version` atual, somente admin |
| `GET /api/clients/:client/blocks` | Ler documento dos blocos legados |
| `PUT /api/clients/:client/blocks` | Salvar blocos legados, somente admin |

Em conflito de revisão, a API retorna `409`. Não reenviar cegamente o documento antigo: reler, reconciliar e preservar o trabalho mais recente.

## 6. Configuração e segredos

Os nomes estão em [.env.example](../.env.example). Não copiar valores para Git, PR, logs, documentação ou prompts.

| Variável | Finalidade |
|---|---|
| `DASH_CLIENTS_JSON` | Slug, nome, moeda e `metaAccountId` explicitamente autorizado; contas não podem se repetir entre slugs |
| `DASH_USERS_JSON` | Email, hash scrypt, papel e lista de slugs permitidos |
| `DASH_SESSION_SECRET` | Segredo de pelo menos 32 bytes; rotação invalida sessões |
| `DASH_DATA_DIR` | Caminho absoluto privado e persistente, fora do checkout |
| `META_SYSTEM_USER_TOKEN` | Token Meta somente no servidor, com acesso mínimo necessário de leitura |
| `GA4_SERVICE_ACCOUNT_JSON` | Reserva de configuração futura; não basta defini-la para ativar GA4 no produto |

Sem configuração de autenticação válida, o sistema falha fechado. `metaConnected` indica presença do token na configuração, não uma checagem ativa de validade/permissão da API.

### Armazenamento

- Construtor: `${DASH_DATA_DIR}/${client}.builder.json`.
- Blocos legados: `${DASH_DATA_DIR}/${client}.json`.
- Diretório do construtor exige modo `0700`; arquivos, `0600`; caminhos/symlinks são validados.
- Escrita usa arquivo temporário, sincronização e rename, com controle otimista por `version`.
- **A fila de escrita é local ao processo. Usar uma única instância Node por diretório de dados.** Dois processos compartilhando esse diretório podem perder atualizações.
- Valores consultados da Meta não são persistidos como parte do documento do construtor; ficam salvas configuração dos widgets e bases manuais.
- Backup deve abranger os dois tipos de JSON e a configuração privada, com acesso restrito. Não versionar nenhum deles no repositório.

Fontes: [auth](../lib/auth.ts), [clientes](../lib/clients.ts), [builder-store](../lib/builder-store.ts), [block-store](../lib/block-store.ts), [onboarding](onboarding.md).

## 7. Inventário operacional observado

Os caminhos abaixo são referências do servidor inspecionado, não instruções para publicar seu conteúdo.

| Recurso | Local/estado observado |
|---|---|
| Checkout original | `/root/work/yorus-dash`, branch local `main`, revisão `0b590b9` |
| Checkout de entrega | `/root/work/yorus-dash-pr-delivery`, branch do PR |
| Serviço da prévia real | `yorus-dash-preview.service`, `active/running` |
| WorkingDirectory do serviço | `/root/work/yorus-dash` |
| Listener da aplicação | `127.0.0.1:3463` |
| Serviço de túnel | `yorus-dash-tunnel.service`, `active/running` |
| Configuração privada carregada pelo serviço | `/root/.local/share/yorus-dash-live-qa/meta.env` — valores não lidos para este handover |
| Dados da prévia real | `/root/.local/share/yorus-dash-live-qa/data` |
| Worktree da demonstração sintética | `/root/.local/share/yorus-dash-preview/app`, detached em `26966f0` na consulta |
| Evidências anteriores do seletor | `/root/.local/share/yorus-dash-live-qa/lead-click-5FeSAA/`, privadas; existência/conteúdo não revalidados nesta rodada |

**Git local vs. remoto:** a `main` local original contém os 27 commits que foram enviados à branch do PR. A `main` remota ainda não recebeu merge. Antes de qualquer `pull`, checkout ou deploy, conferir divergência e preservar esse histórico; não usar reset destrutivo para “sincronizar”.

**Separação de prévias:** demonstração sintética e prévia real precisam de worktree, build e dados próprios. Compartilhar `dist` já causou referência a chunks removidos. Porta diferente, sozinha, não isola build nem persistência.

### Checagens externas desta rodada

- `/`, `/api/session` e `/api/dashboard` retornaram `302` para `yorus-ag.cloudflareaccess.com` em requisições anônimas com User-Agent de navegador.
- A primeira tentativa com User-Agent padrão da biblioteca recebeu `403`; a repetição com `Mozilla/5.0` confirmou o redirecionamento. A causa do `403` não foi investigada.
- Isso comprova o bloqueio/redirecionamento anônimo observado, **não** login público completo, membership após login, saúde da API Meta ou revisão do bundle.
- A política nominativa de Access e o acesso direto ao IP não foram reconsultados nesta rodada; o desenho e as evidências anteriores estão em [segurança](security.md).

## 8. Desenvolvimento, validação e publicação segura

### Ambiente de desenvolvimento isolado

```bash
git clone https://github.com/LeostegYorus/yorus-dash.git
cd yorus-dash
git fetch origin
git switch --track origin/feat/dashboard-builder-meta-gallery
pnpm install --frozen-lockfile
pnpm test
pnpm lint
pnpm exec tsc --noEmit
pnpm build
```

Para executar o app, provisionar as variáveis privadas no ambiente do processo e um `DASH_DATA_DIR` isolado, fora do checkout e com as permissões exigidas. `pnpm dev` inicia desenvolvimento; não copiar credenciais reais para uma prévia aberta. Depois do merge, usar a revisão aprovada da `main` em vez de presumir que a branch do PR continuará existindo.

### Verificação executada nesta entrega

No checkout isolado de `0b590b91c67fa9dc847e5e7431985af117808cf6`:

- `pnpm install --frozen-lockfile`: concluído.
- `pnpm test`: **403 testes em 23 arquivos, todos aprovados**.
- `pnpm lint`: aprovado.
- `pnpm exec tsc --noEmit`: aprovado.
- `pnpm build`: concluído.
- `git diff --check origin/main...HEAD`: aprovado.
- `HEAD` e árvore Git permaneceram estáveis; checkout limpo após os comandos.
- Busca de padrões de credenciais nos blobs dos 27 commits: sem ocorrências; não substitui auditoria de segurança.
- Branch remota lida de volta e SHA confirmado; PR aberto, sem conflitos, sem CI reportado.

Avisos de build: depreciação de `module.register()` em Node e limitação de classificação estática de rotas do vinext. Não impediram o build.

Os testes acima não equivalem a teste end-to-end público. A documentação histórica relata QA autenticado com Meta real em desktop/mobile; essa rodada **não repetiu** esse acesso.

### Runbook para a próxima publicação (não executado aqui)

1. Confirmar revisão aprovada, diff, testes e estado do PR; não presumir merge autorizado por este documento.
2. Inventariar serviço, config privada, dono/permissões do diretório e revisão atualmente implantada.
3. Fazer backup restrito e consistente de configuração/dados, interrompendo ou controlando escritas; registrar como restaurar. Não colocar o backup no checkout.
4. Construir em diretório de release isolado, sem trocar o `dist` sob um processo ainda servindo a versão anterior.
5. Manter apenas uma instância escrevendo no diretório real. Smoke tests de escrita usam dados isolados até a troca controlada.
6. Fazer a troca pelo mecanismo operacional aprovado, preservando Access, túnel e listener privado. Não criar exposição pública direta nem rota alternativa sem a borda.
7. Confirmar serviços e assets; completar login de um sócio pela URL pública. Autenticação deve ser feita pelo responsável autorizado, sem compartilhar segredo/código no PR.
8. Validar cliente permitido, bloqueio de outro cliente, leitor sem edição, Meta no período escolhido, criar/mover/redimensionar/salvar/recarregar visual e selecionar `lead` com coluna visível.
9. Verificar falha/conflito sem mensagem falsa de sucesso e ausência de token no browser. Limpar apenas os dados de teste identificados, preservando o painel existente.
10. Registrar SHA realmente servido, resultados e evidências privadas. Rollback precisa de release anterior e backup compatível; não restaurar dados indiscriminadamente sobre edições novas.

Comandos somente de diagnóstico:

```bash
systemctl is-active yorus-dash-preview.service yorus-dash-tunnel.service
systemctl show yorus-dash-preview.service -p WorkingDirectory -p EnvironmentFiles
curl -sS -o /dev/null -w '%{http_code}\n' -A 'Mozilla/5.0' https://dash.yorus.top/
```

O `Dockerfile` é uma alternativa de empacotamento, não o mecanismo live comprovado. Build de imagem Docker, restauração de backup e rollback operacional não foram exercitados nesta entrega.

## 9. Onboarding de outro cliente

1. Obter autorização explícita para a conta Meta e identificar slug único, nome e moeda.
2. Atualizar configuração privada de clientes; a mesma conta não pode ser duplicada entre slugs.
3. Criar usuário individual com hash scrypt e apenas os vínculos necessários. Não distribuir credencial administrativa compartilhada.
4. Definir quem passa pelo Access. A política interna atual não deve ser aberta amplamente para acomodar clientes externos.
5. Garantir storage persistente e backup. Não semear dados comerciais fictícios como se fossem reais.
6. Entrar como admin, montar o painel, declarar fonte/período dos dados manuais.
7. Entrar como leitor e provar bloqueio de escrita e de outro cliente, inclusive por requisição direta à API.
8. Conferir conta/moeda/período e valores com a resposta Meta; dados faltantes permanecem indisponíveis.
9. Não importar nome, telefone, email ou respostas identificáveis de leads sem política e projeto próprios de tratamento.

Ver [guia de onboarding](onboarding.md).

## 10. Troubleshooting rápido

| Sintoma | Verificação inicial / conduta |
|---|---|
| URL redireciona para Access | Esperado sem autenticação; usar identidade autorizada, não remover a borda |
| Cliente HTTP recebe `403` antes do app | Comparar User-Agent/borda; nesta rodada o navegador simulado recebeu `302`; não confundir com falha do login próprio |
| API retorna `401` | Sessão ausente/expirada, credencial inválida ou segredo rotacionado |
| API retorna `403` | Membership, papel admin, slug/conta autorizada ou origem da escrita |
| API retorna `409` ao salvar | Documento ficou desatualizado; reler e reconciliar, não sobrescrever cegamente |
| Builder retorna `503` | Validar config, caminho absoluto fora do repo, `0700`/`0600`, proprietário, JSON e capacidade de armazenamento |
| Meta retorna `400` | Validar parâmetros, nível, datas, lista e compatibilidade de métricas |
| Meta retorna `429`, `502` ou resposta parcial | Verificar limite, token/permissão, transporte, campos e orçamento da coleta; manter avisos e não inventar zeros |
| Campo não aparece com valor | Catálogo não garante disponibilidade na conta/período; consultar avisos, evento e `summary` |
| Busca `lead` sem efeito | Conferir sugestões próximas do campo, tipo tabela Meta e se já foi salva; título usa salvamento separado |
| Gráfico/tabela desaparece após rebuild | Conferir isolamento de `dist`, assets referenciados e processo antigo; não reconstruir outra prévia sobre o mesmo output |
| Totais de dados manuais não mudam com filtro Meta | Comportamento esperado; têm fonte e período próprios |

## 11. Próximos passos propostos e critérios de aceite

Não são tarefas executadas nem prazos assumidos. Responsáveis nominais e datas ainda não foram definidos.

| Prioridade | Ação proposta | Dependência | Aceite |
|---|---|---|---|
| Alta | Revisar e decidir merge do PR #1 | Responsável pelo repositório | Revisão de código concluída e decisão registrada; merge verificado se autorizado |
| Alta | Concluir QA público autenticado | Sócio com acesso e eventual código de email | Login público, cliente correto, API, salvamento e recarga validados desktop/mobile |
| Alta | Associar deploy a uma revisão e documentar rollback | Operação do serviço | SHA de release, backup e restauração testada em ambiente isolado |
| Alta, antes de ampliar público | Revisar autenticação, Access, rate limiting, acesso e retenção | Decisões de segurança/negócio | Usuários individuais, testes de negação e política de dados explícita |
| Média | Adicionar CI no GitHub | Configuração de Actions | Instalação lockfile, testes, lint, tsc e build automáticos no PR, sem secrets de cliente |
| Antes de múltiplas instâncias | Migrar storage para banco transacional | Escolha de banco/modelo/migração | Concorrência entre processos sem perda, backup/restauração e migração testados |
| Evolução | Conectar GA4 de ponta a ponta | Propriedade autorizada e service account com leitura | Config por cliente, rota/UI integradas e comparação com dados reais |
| Evolução | Integrar respostas/CRM/vendas e atribuição | Fonte, chaves conciliáveis e política de PII | Cruzamentos auditáveis e métricas com denominador/fonte verificáveis |
| Evolução | Séries diárias e outras segmentações Meta | Contrato de consulta e visualização | Datas/segmentos reais no eixo, cobertura de totais não aditivos |

## 12. Roteiro para quem assumir

1. Ler este documento, README, segurança e os resultados de implementação.
2. Conferir o estado atual do PR/Git; esta fotografia envelhece.
3. Não tocar no ambiente real antes de reproduzir testes e build em checkout isolado.
4. Não ler/copiar valores do arquivo de secrets para contexto de agente, issues ou commits; usar o mecanismo privado do ambiente.
5. Escolher uma pendência pequena com aceite claro e testes; preservar gráficos/datasets existentes.
6. Entregar com evidência do que realmente foi executado, distinguindo local, público anônimo, público autenticado e API real.

### Ordem de leitura sugerida

- [README](../README.md) — comportamento atual e comandos.
- [Segurança](security.md) — borda, isolamento e restrições.
- [Onboarding](onboarding.md) — configuração por cliente.
- [Resultado do construtor](briefs/dashboard-builder.RESULT.md).
- [Resultado da galeria](briefs/visual-gallery.RESULT.md).
- [Resultado das métricas](briefs/meta-metrics.RESULT.md).
- [Resultado do seletor de leads](briefs/lead-picker-fix.RESULT.md).

Os arquivos `.RESULT.md` descrevem as rodadas em que foram escritos. Menções históricas a “sem push”, canvas vazio ou contagens de campanhas não representam necessariamente o estado atual; para Git, prevalece a leitura atual do GitHub, e para dados, o estado autorizado da aplicação.
