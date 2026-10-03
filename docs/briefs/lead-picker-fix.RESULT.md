# Correção do fluxo de busca e inclusão de métricas

## Sintoma e reprodução

Usuário digitou `lead`, não encontrou uma opção clicável e não percebeu atualização da tabela. Reprodução no navegador real, sem alterar seus gráficos: no viewport de 1440×900, o campo estava em y=875–909; as opções estáticas começavam em y=1210. Não havia combobox/listbox e digitar não fazia PUT. A tabela temporária criada para reproduzir foi removida com leitura de volta.

## Correção

- Busca virou combobox com sugestões em portal, posicionadas junto ao campo e acima quando falta espaço abaixo. A opção `actions:lead` é priorizada na busca exata por lead, sem confundir quantidade com custo/valor/conversões de outro tipo.
- Opções clicáveis, seleção por setas/Enter, fechamento por Escape/Tab/clique externo; Enter não envia o formulário acidentalmente.
- Em tabelas Meta já persistidas, clicar adiciona/remove a coluna, salva sua configuração e atualiza os dados. Alterações não relacionadas no rascunho (ex.: título) não são salvas por essa ação.
- Em rascunhos novos sem tabela persistida e em outros tipos de visual, o formulário mantém salvamento explícito.
- Confirmação `Tabela atualizada. Colunas salvas.` aparece apenas após resposta de sucesso. Em 409/503, seleção anterior é preservada, erro exibido e sucesso não é anunciado.
- Coluna adicionada é exposta por rolagem horizontal após os dados carregarem; botão `Ver tabela atualizada` leva ao cartão, útil no celular.

## Verificação

- RED observado para ausência de combobox/sugestões, seleção por teclado, ausência de salvamento direto e coluna nova fora da área horizontal visível; GREEN depois das correções.
- **403 testes em 23 arquivos**, lint, TypeScript, build e diff-check passaram após a última alteração de código. Avisos de build preexistentes de Node/vinext permanecem.
- QA autenticado com Meta real nos viewports 1440 e 390: digitar `lead`, opção visível sem procurar outra seção, clicar, PUT bem-sucedido, coluna e valores/ausências iguais à resposta API nas cinco campanhas, confirmação e persistência após reload. Testados remoção e reinclusão no mobile.
- A verificação horizontal expôs uma corrida ao remover e reincluir a mesma coluna antes de a consulta terminar: a tabela desaparecia durante o carregamento e o registro anterior de colunas não mudava; quando os dados voltavam, a rolagem podia ser omitida. A hipótese foi reproduzida em teste com respostas pendentes (scrollLeft 0 em vez de 900). Corrigido com rolagem pendente mantida até a tabela remontar. O harness aguarda a condição de visibilidade e verifica remoção/reinclusão, não apenas presença do cabeçalho no DOM.
- Evidência de confirmação: `/root/.local/share/yorus-dash-live-qa/lead-click-5FeSAA/` (privada). As capturas foram conferidas visualmente. O teste também verifica preservação dos gráficos/datasets ao remover sua tabela temporária.
- Sem alteração do conector, autenticação ou política de acesso. Prévia em `https://dash.yorus.top/`; commits locais, sem push.
