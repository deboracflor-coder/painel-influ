/** Explicação de cada indicador (mesmos textos do protótipo, adaptados). */
export const TIPS = {
  followers: 'Soma dos seguidores das contas selecionadas no último dia do período com dado coletado.',
  growth: 'Seguidores no fim do período menos seguidores na véspera do início. Só conta contas com dado nas duas datas.',
  reach: 'Soma do alcance das publicações do período (contas únicas alcançadas, segundo a rede). YouTube não fornece alcance.',
  views: 'Soma das visualizações das publicações do período, segundo a última coleta.',
  engagement: 'Curtidas + comentários + compartilhamentos + salvamentos, com os componentes que a rede fornece.',
  er: 'Engajamentos ÷ base da rede × 100. Base: alcance (Instagram, Facebook), visualizações (YouTube, TikTok), impressões (X). Ponderada pelo volume, não é média de taxas.',
  likes: 'Curtidas (no Facebook, reações).',
  comments: 'Comentários nas publicações do período.',
  shares: 'Compartilhamentos das publicações do período.',
  saves: 'Salvamentos, quando a rede fornece.',
  posts: 'Quantidade de publicações feitas no período.',
  avgViews: 'Visualizações ÷ publicações que têm visualização disponível.',
  avgEng: 'Engajamentos ÷ publicações que têm engajamento disponível.',
  clicks: 'Cliques em links, quando a rede fornece.',
  watch: 'Tempo total assistido, em horas.',
} as const;
