# 0005 · Fase 5: relatórios, exportação, monitoramento e importação manual

Situação: validada (PR #4 incorporado em 2026-11-05). Nada desta fase depende de contas reais conectadas.

## Relatório (`/relatorio`, todos os papéis)

- Usa os mesmos filtros do painel (período, redes, formato). Compara sempre com o período anterior de
  mesma duração.
- Seções: capa, resultados do período (com variação), desempenho por rede, ranking das 10 mais
  visualizadas e das 10 com maior taxa de engajamento, notas sobre os dados.
- Variação da taxa de engajamento em **pontos percentuais**; demais em %. Sem base no período anterior
  = “sem base”, nunca 0%.
- Notas automáticas: cliente de demonstração, dado manual presente, conta expirada/desconectada,
  métricas que cada rede não fornece, fórmula da taxa.
- O cálculo fica em `src/domain/report.ts` e alimenta tela, PDF, CSV e Google Sheets: os quatro
  formatos mostram os mesmos números.

## Exportação

- **PDF**: impressão do navegador com folha de estilo própria (A4 paisagem, uma seção por página).
  Sem servidor de PDF: nada sai do navegador.
- **CSV** (Resumo, Redes, Publicações, Série diária): padrão brasileiro (`;`, vírgula decimal, BOM).
  Célula vazia = sem dado. Texto que começaria com `= + - @` recebe apóstrofo (evita fórmula).
- **Google Sheets** (`sheets-export`): cada pessoa conecta a **própria** conta Google com o escopo
  `drive.file` (o app só enxerga as planilhas que ele mesmo cria; escopo não sensível). Token no Vault
  (`user_integrations`). A planilha nova é criada no Drive de quem exportou, com valores gravados
  em modo `RAW` (nada vira fórmula). As tabelas vêm do navegador: são os mesmos dados que a pessoa
  já vê, já recortados pela RLS. O Sheets é só destino de exportação, nunca fonte de dados.

## Monitoramento (`/monitoramento`, agência)

- Todas as contas dos clientes que a pessoa acompanha (RLS), com situação: em dia, atrasada
  (próxima coleta vencida há mais de 45 min), falhando, acesso expirado, coleta desligada.
- Totais de coletas e erros das últimas 24 h e falhas dos últimos 7 dias. Aviso quando há contas
  atrasadas (indício de agendador desligado).

## Importação manual (`/importacao`, quem opera o cliente)

- Escopo aprovado na Fase 1: só para o que a API não entrega. Nesta versão, **série diária da conta**
  (seguidores, alcance, impressões, visualizações, visitas ao perfil), ex.: histórico de seguidores
  antes da conexão.
- Regras no banco (`import_daily_metrics`): só admin ou analista atribuído; nunca altera dia que veio
  da API; reimportar substitui o lançamento manual; data futura, negativo, data repetida ou linha
  vazia recusam o arquivo inteiro; até 1000 linhas; cada importação vai para a auditoria.
- `delete_manual_daily` desfaz lançamentos manuais de um intervalo (dado da API não é tocado).
- Tudo aparece com o selo “Dado manual” no painel e no relatório.
- **Fora desta versão:** importação de métricas por publicação. Uma métrica manual por post exigiria
  separar, no mesmo post, o que veio da API do que foi digitado; fica como melhoria se houver uso real.
