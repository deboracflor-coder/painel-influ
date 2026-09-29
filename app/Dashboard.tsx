'use client';
import { useEffect } from 'react';
import { SHELL_HTML } from '@/lib/shell';

// Mesmos scripts do protótipo, na mesma ordem. app.js lê window.__PAINEL__ no modo produção.
const SCRIPTS = ['vendor/xlsx.full.min.js', 'lib/calc.js', 'lib/query.js', 'lib/insights.js', 'lib/importer.js', 'data/demo-data.js', 'lib/charts.js', 'app.js'];

export default function Dashboard({ payload }: { payload: unknown }) {
  useEffect(() => {
    const w = window as unknown as { __PAINEL__?: unknown; __painelLoaded?: boolean };
    if (w.__painelLoaded) return; // evita carregar duas vezes em desenvolvimento (StrictMode)
    w.__painelLoaded = true;
    if (payload) w.__PAINEL__ = payload;
    for (const src of SCRIPTS) {
      const s = document.createElement('script');
      s.src = `/painel/${src}`;
      s.async = false; // mantém a ordem de execução
      document.body.appendChild(s);
    }
  }, [payload]);
  return <div dangerouslySetInnerHTML={{ __html: SHELL_HTML }} />;
}
