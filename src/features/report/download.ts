import { toCsv, type Table } from '../../domain/report';

/** Gera o arquivo no navegador; nada passa por servidor. */
export function downloadCsv(table: Table, fileBase: string) {
  const blob = new Blob([toCsv(table.rows)], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${fileBase} - ${table.name}.csv`.replace(/[\\/:*?"<>|]/g, '-');
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
