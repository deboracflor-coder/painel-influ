# Roteiro de homologação

Duas partes: o que os testes automáticos já garantem em cada PR, e o que só dá para conferir
com contas reais, no projeto de **desenvolvimento** publicado, antes de liberar para clientes.

## Parte A · Coberto automaticamente (CI em cada PR)

| Área | Como é testado | Onde |
|---|---|---|
| Autenticação | login, senha errada, rota protegida, volta para a tela pedida, sair, recuperar senha sem revelar e-mail, sem cadastro aberto | `tests/e2e/autenticacao.spec.ts` |
| Permissões | cada papel (cliente, analista, administração) só abre o que pode, inclusive digitando o endereço; o banco recusa o que a tela esconde | `tests/e2e/permissoes.spec.ts`, `supabase/tests/01_privilegios.test.sql` |
| Isolamento entre clientes | cliente pedindo outro pela URL; API chamada com a sessão da pessoa; analista sem atribuição; pgTAP tabela a tabela | `tests/e2e/permissoes.spec.ts`, `tests/api/isolamento.test.ts`, `supabase/tests/02_*` |
| Integrações | OAuth Meta e Google completos, estado de uso único, token só no Vault, desconectar revoga, Google Sheets | `tests/api/integracoes.test.ts` (servidor simulado das redes) |
| Coleta de dados | coletores de cada rede, idempotência, nulo não apaga dado, erros classificados, novas tentativas, token expirado | `tests/unit/collect.test.ts`, `tests/api/integracoes.test.ts`, `supabase/tests/03_integracoes.test.sql` |
| Histórico | coletas e erros por cliente, monitoramento com conta expirada | `tests/e2e/relatorio-historico.spec.ts` |
| Responsividade | todas as telas em 360, 768 e 1366 px sem rolagem lateral; menu no celular | `tests/e2e/responsividade-desempenho.spec.ts` |
| Desempenho | visão executiva com 120 dias abre em menos de 3 s; telas carregadas sob demanda; orçamento de tamanho (200 KB na primeira visita); atualização da tela a cada 60 s | idem, `scripts/check-bundle.mjs` |
| Segurança | cabeçalhos (CSP etc.) ativos e sem violação em nenhuma tela; nenhum segredo no navegador nem no pacote; dependências sem vulnerabilidade alta; nenhuma credencial versionada; advisor de segurança do Supabase sem alertas | e2e, CI, `npx supabase db advisors` |
| Exportação | CSV (padrão brasileiro, BOM, sem fórmulas), PDF (uma seção por página, sem menu), importação manual com prévia e desfazer | `tests/e2e/relatorio-historico.spec.ts`, `tests/e2e/importacao.spec.ts`, `tests/unit/report.test.ts` |

## Parte B · Conferir com contas reais (depende da configuração externa)

Pré-requisitos: Supabase de desenvolvimento, site publicado na Vercel (Preview ou domínio de teste),
app da Meta e projeto Google configurados (`docs/runbooks/`). Use um cliente **real de teste** ou a
própria conta da agência.

| # | Passo | Resultado esperado | OK? |
|---|---|---|---|
| 1 | Entrar como administrador no site publicado | visão executiva vazia, sem erro | |
| 2 | Criar o cliente e convidar uma pessoa dele (Pessoas) | e-mail de convite chega; ela cria a senha e só vê esse cliente | |
| 3 | Conectar Instagram e Facebook (Contas conectadas) | contas aparecem como Conectadas | |
| 4 | Conectar YouTube | canal aparece como Conectado | |
| 5 | Coletar agora em cada conta | Histórico de coleta mostra “Concluída”; publicações aparecem | |
| 6 | Comparar 3 publicações de cada rede com o Insights do Instagram/Meta Business Suite e o YouTube Studio | mesmos números (pequena diferença é normal se a coleta foi horas antes) | |
| 7 | Conferir que alcance e salvamentos do YouTube e salvamentos do Facebook aparecem como Indisponível | nunca como 0 | |
| 8 | Esperar 6 h (ou mudar a frequência para 1 h) | nova coleta automática no histórico | |
| 9 | Exportar o relatório para o Google Sheets | planilha nova no Drive, quatro abas | |
| 10 | Salvar o relatório em PDF e baixar os CSV | arquivos abrem no Excel/Google Planilhas com acentos | |
| 11 | Abrir o site no celular com a pessoa do cliente | menu, gráficos e relatório legíveis | |
| 12 | Desconectar uma conta | some da coleta; histórico continua | |

Critério de aceite: todos os passos OK. Divergência no passo 6 vira ajuste antes de produção.
