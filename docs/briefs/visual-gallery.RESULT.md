# Galeria de visuais — resultado verificado

## Pedido e escopo

Referência do usuário: paleta de tipos de gráfico do Power BI. O construtor passa a oferecer oito presets por ícones: métrica, barras, colunas, linhas, área, pizza, rosca e tabela; texto continua separado. Não é uma reprodução de todos os visuais ou capacidades do Power BI.

- Presets usam campos efetivos de Meta autorizado ou dataset manual e abrem a edição de fonte/dimensão/medida/agregação/formato.
- Sem fonte compatível, abre rascunho com aviso, sem fabricar linhas ou métricas.
- Galeria do inspetor troca o tipo mantendo campos e geometria, incluindo widgets legados sem posição explícita. No formulário, o tipo faz parte do rascunho e requer salvar.
- Contrato estrito ampliado sem alterar autenticação, vínculos de contas, isolamento por cliente ou rotas.
- Renderização SVG sem novas dependências. Linhas/áreas conservam lacunas e valores negativos; são categorias na ordem da fonte, não histórico diário. Pizza/rosca recusam proporções com ausências, negativos ou soma zero.
- Eixos podem abreviar categorias longas; títulos SVG, legendas e tabela Ver dados preservam categorias e valores completos. Muitos pontos usam rolagem interna.

## TDD observado

- Galeria: falhou por ausência do grupo Criar visual; passou após inclusão.
- Cinco novos presets: falharam por título genérico Tabela e editor não aberto; passaram com títulos e campos correspondentes.
- Troca de tipo: falhou por ausência do seletor de ícones; passou preservando dados e geometria.
- Widgets legados: falhas de altura/posição via galeria e via formulário; corrigidas com materialização da geometria efetiva apenas no alvo.
- Contrato: 20 falhas esperadas de aceitação dos tipos novos antes da implementação, 68 testes do parser passando depois.
- Renderização integrada: cinco falhas por ausência de SVG dos tipos esperados; cinco passaram após integração.
- Longos rótulos: largura desnecessária de 98.020 px reproduzida; eixos compactados sem remover categorias/valores completos.

## Verificação final

- `pnpm test`: **250 testes, 18 arquivos, todos passando**.
- `pnpm lint`, `pnpm exec tsc --noEmit`, `git diff --check`: exit 0.
- `pnpm build`: exit 0. Avisos preexistentes de Node `module.register()` e classificação estática de rotas do vinext permanecem.
- Revisão independente somente leitura: nenhum achado crítico/alto no escopo. Relatório operacional `/tmp/yorus-gallery-review.md`.
- Detector visual: apenas alertas de Inter; mantida a tipografia exigida pela identidade Yorus.

## Navegador e prévia

- Prévia protegida `https://dash.yorus.top/`, mesma origem privada e controles de acesso.
- Script privado `verify-visual-gallery.cjs`: oito tipos criados/trocados via UI, persistência e reload; valores conferidos contra resposta efetiva da API Meta autorizada, com cinco categorias retornadas.
- Desktop 1600/1440 e mobile 390 sem overflow horizontal da página. Capturas conferidas. No mobile, mantém empilhamento e ausência das alças de edição de layout.
- Evidência exclusiva: `/root/.local/share/yorus-dash-live-qa/gallery-HNkPXR/` (arquivos privados; não versionados).
- Visual temporário de QA removido com leitura de volta; preservados widgets/datasets existentes. Não se alterou a composição do cliente para semear um painel pronto.
- Primeira rodada de QA passou nos cinco tipos novos e barras, mas o harness comparou a tabela antes da resposta Meta após reload. Ajustada a espera pelo conteúdo pronto; segunda rodada passou nos oito. Não houve substituição por dados fictícios.
- Origem HTTP 200, público anônimo 302 para Access, serviços ativos. O percurso público com código recebido por e-mail segue não automatizado.
- Prévia sintética antiga, em build independente, continuou hidratando e carregando assets/canvas. Não foi atualizada para esta galeria.
- Sem push ou publicação definitiva em yorus.ag.
