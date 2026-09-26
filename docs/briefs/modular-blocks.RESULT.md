# Resultado do primeiro módulo configurável — Yorus Dash

## Entregue em código
- Três tipos de bloco por cliente: investimento (Meta automático ou valor manual com fonte/período próprios), pergunta com alternativas e contagens agregadas opcionais, nota classificada como fato/hipótese/decisão.
- Administração no painel: criar, editar, mover de seção, reordenar e excluir com confirmação. Usuário sem papel `admin` consulta, mas não altera.
- Seções **Visão geral**, **Perfil dos leads** e **Custos e decisão**; blocos persistem por cliente no servidor. Blocos aparecem quando a Meta falha. Datas de mídia não alteram valores manuais. Distribuições só apresentam percentual com total de respostas conhecido; nenhuma atribuição por campanha é inferida de contagens agregadas.
- API `GET/PUT /api/clients/<slug>/blocks` autenticada, membership por cliente, escrita só para admin, validação estrita/limite do corpo, controle de versão `409` e arquivos privados em `DASH_DATA_DIR` com escrita atômica em uma única instância Node.

## Evidência executada
- Ciclos RED→GREEN observados para overflow da revisão, aviso de filtro manual na Visão geral, investimento Meta em Perfil dos leads, soma insegura de contagens e limpeza do editor ao trocar de seção.
- `pnpm test`: **93 testes em 10 arquivos aprovados** depois das correções. `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build` e `git diff --check`: aprovados. O build mantém aviso não fatal de `module.register()` e de classificação estática das rotas pelo vinext.
- Ensaio HTTP no build de produção em loopback com **dois clientes sintéticos e sem token Meta**: login, três tipos de bloco, leitura por viewer, escrita vetada a viewer, isolamento A/B, conflito `409`, leitura de volta e persistência após reinício; passou. No navegador real, um admin criou uma nota no Perfil, recarregou a página e viu o bloco persistido; abriu o editor, trocou para Custos e confirmou que o editor anterior foi fechado e “Adicionar bloco” voltou; foi confirmada ausência de overflow horizontal no mobile. Capturas desktop e mobile da Visão geral e do Perfil foram inspecionadas, mantidas fora do repositório com acesso restrito.
- Verificação por padrões de segredos nos arquivos alterados: nenhuma correspondência para tokens Meta/OpenAI/GitHub ou chave privada. Isso é uma checagem pontual, não auditoria completa.

## Limites sem disfarce
- **Não há importação de respostas individuais, conciliação por IDs de anúncio, cruzamentos renda × momento ou atribuição de qualidade por mídia.** Contagens digitadas manualmente não são leads ligados à Meta. Para esses cruzamentos é preciso export autorizado ou acesso de leitura aos formulários e decisão sobre PII.
- GA4, CRM, vendas e propriedade GA4 real não estão conectados a este produto nesta etapa. O conector Meta existente já fora testado com a conta eConfor antes deste módulo, mas este ensaio novo não fez chamada real ao provedor.
- Ainda não há URL pública do Yorus Dash. Antes de publicar dados de clientes, decidir quem pode acessar e validar MFA/Access ou OIDC; a autenticação local sozinha não é autorização para abrir na internet.
