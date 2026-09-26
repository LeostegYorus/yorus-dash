# Blocos modulares por cliente - Yorus Dash

## Direção
O usuário corrigiu que o painel Meta pré-fixado não basta. O produto é um BI configurável, inspirado no HTML Basilar (Visão geral, Segmentações, Peças, Perfil dos leads, Custos e decisão, Metodologia). O PDF Basilar contém perguntas de finalidade, momento, barreira e renda; são referência de estrutura e **não são respostas da eConfor**. Manter visual grafite/laranja, Satoshi/Inter, tela cheia e abas funcionais.

## Primeiro catálogo
Documento `BlockDocument = {version:number, blocks:Block[]}` por slug de cliente. IDs de blocos UUID. Ordem = posição no array. Todos têm `id`, `kind`, `tab` (`overview|profile|costs`), `title` e `updatedAt` ISO gerado no servidor. Max 50 blocos por cliente; validação estrita de campos, tamanhos, datas, valores e IDs no servidor.

1. `investment`: `source:'meta'|'manual'`. Meta usa total de campanhas para cliente/período selecionados, sinaliza consulta parcial e **não duplica nem soma** com investimento manual. Manual exige `amountCents` inteiro não negativo, `periodStart`, `periodEnd`, `sourceLabel`; `note?`. Mostrar claramente “Valor informado” e o período próprio, mesmo se diferente do filtro Meta.
2. `question`: `question` texto, `options:[{label,count:null|integer}]` 2-12, `sourceLabel?`, `periodStart?`, `periodEnd?`. Todas as contagens null = perguntas configuradas, sem respostas; todas inteiras >=0 = distribuição manual, exige fonte e período; mistura null/número é inválida. Soma zero = “Sem respostas registradas”. Percentuais só com total >0, sobre o conjunto agregado informado. Sem cruzamento por campanha ou PII.
3. `note`: `body`, `evidenceType:'fact'|'hypothesis'|'decision'`, `sourceLabel?`; se fato, exige fonte. Texto puro, sem HTML arbitrário.

Admin pode adicionar, editar, mover para cima/baixo e excluir (confirmação visível). Viewer vê somente conteúdo; nenhuma escrita. Blocos são independentes da consulta Meta: perguntas/notas aparecem mesmo se token Meta estiver indisponível. GET/PUT full-document com controle de versão otimista; conflito 409 força recarregar, sem sobrescrever trabalho alheio.

## API e persistência
- `GET /api/clients/<slug>/blocks` → `{version,blocks}`; 401/403 conforme sessão e membership; sem dados de outros clientes; `Cache-Control:no-store`.
- `PUT /api/clients/<slug>/blocks` body `{version,blocks}`; apenas `role==='admin'`, valida Origin se presente, Content-Type JSON e corpo <=64 KiB; 400 inválido, 401/403 permissão, 409 revisão antiga, 503 storage ausente/corrompido.
- `DASH_DATA_DIR` obrigatório; diretório privado fora do repo, um JSON por slug validado, escrita atômica com arquivo temporário e rename, serialização em processo por cliente. Uma réplica Node apenas; migrar a DB transacional antes de escalar horizontalmente. Nenhum segredo, resposta individual ou PII no arquivo. Se não existir documento, devolver vazio version 0; se estiver inválido, falhar fechado, nunca resetar.
- `GET` e `PUT` sempre revalidam sessão e acesso ao slug. Não aceitar `metaAccountId` em payload. Arquivos só por slug normalizado, sem path traversal/symlink para leitura fora do diretório.

## UI
- Preservar abas de mídia existentes. Acrescentar `Perfil dos leads` e `Custos e decisão`, ambos compostos por blocos; na Visão geral, blocos aparecem após KPIs/tabela Meta. Cada aba oferece “Adicionar bloco” para admin e estado vazio útil; editor inline, sem dados pré-carregados da Basilar.
- Leitura dos blocos por cliente aborta/ignora resposta atrasada ao trocar cliente; seleção de outro cliente zera blocos anteriores antes de refetch. Falha de blocos não bloqueia Meta; falha Meta não bloqueia notas/perguntas.
- Todo bloco mostra fonte e período quando há dado, rótulo “Informado manualmente” quando pertinente. Aviso visível nas seções de perfil/custos: **os filtros de mídia não recalculam dados informados manualmente**. Percentuais de perguntas só têm como denominador as respostas agregadas informadas para aquela pergunta, não “leads únicos” nem respostas cruzadas. Formulário com labels, validação visível e teclado. Metodologia diferencia Meta, agregados manuais e dados não conciliados. Mobile em coluna, editor sem overflow.
- Nenhum número ilustrativo em produção. Exportação CSV Meta existente mantém semântica; exportação de blocos pode vir depois.

## Testes obrigatórios
RED→GREEN para: segregação A/B; viewer não escreve; admin cria bloco e lê após novo request; reinicialização de store lê disco; versão stale 409 não modifica documento; erro em JSON corrompido não reseta; payload inválido/contagens parciais rejeitado; origem cruzada rejeitada; path traversal; Meta indisponível não esconde pergunta; troca rápida de cliente não mostra blocos antigos; editor cria/edita/reordena/exclui; render de pergunta sem contagem não mostra percentual; totais manuais não se misturam ao gasto Meta.

## Fora deste recorte
Importação de respostas linha a linha/CSV, conciliação por IDs de campanha/conjunto/anúncio, GA4 real, CRM e acesso público. Uma pergunta ao usuário sobre origem dos dados expirou; este primeiro recorte manual é uma **inferência operacional**, não uma decisão confirmada de longo prazo.
