// Importação de Excel: mesma conversão usada no navegador (xlsx 0.18.5).
// Rodar: npm install && node --test tests/excel.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const Importer = require('../public/painel/lib/importer.js');
let XLSX = null;
try { XLSX = require('xlsx'); } catch (e) { /* dependência opcional */ }

test('Excel com células de data e números vira CSV válido', { skip: !XLSX && 'xlsx não instalado' }, () => {
  const ws = XLSX.utils.aoa_to_sheet([
    ['Plataforma', 'ID do post', 'Data', 'Formato', 'Views', 'Curtidas'],
    ['Instagram', 'x1', new Date(Date.UTC(2026, 8, 5)), 'Reels', 12000, 300],
    ['TikTok', 'x2', '06/09/2026', 'Vídeo', '8,5k', 200],
  ], { cellDates: true });
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Plan1');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  // mesmas opções de app.js → readFile()
  const wb2 = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true, dateNF: 'yyyy-mm-dd' });
  const csv = XLSX.utils.sheet_to_csv(wb2.Sheets[wb2.SheetNames[0]], { FS: ';', dateNF: 'yyyy-mm-dd' });
  const parsed = Importer.parseCSV(csv);
  const r = Importer.validate(parsed, Importer.suggestMapping(parsed.header), { posts: [], today: '2026-09-29' });
  assert.equal(r.errors.length, 0, JSON.stringify(r.errors));
  assert.deepEqual(r.valid.map((v) => v.published_at), ['2026-09-05', '2026-09-06']);
  assert.deepEqual(r.valid.map((v) => v.metrics.views), [12000, 8500]);
});
