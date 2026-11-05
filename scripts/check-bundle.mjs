// Orçamento de tamanho do app publicado (rode depois de `npm run build`).
// Mede, comprimido com gzip, o JavaScript que o navegador baixa na primeira visita
// (script de entrada + modulepreload do index.html) e o maior pedaço carregado sob demanda.
import { readdirSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const LIMITE_INICIAL_KB = 200;
const LIMITE_PEDACO_KB = 100;

const html = readFileSync('dist/index.html', 'utf8');
const inicial = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.js)"/g)].map((m) => m[1]);
const kb = (file) => gzipSync(readFileSync(`dist/${file}`)).length / 1024;

const totalInicial = inicial.reduce((s, f) => s + kb(f), 0);
const todos = readdirSync('dist/assets').filter((f) => f.endsWith('.js')).map((f) => `assets/${f}`);
const maior = todos.map((f) => ({ f, kb: kb(f) })).sort((a, b) => b.kb - a.kb)[0];

console.log(`Primeira visita: ${totalInicial.toFixed(1)} KB (gzip) em ${inicial.length} arquivos · limite ${LIMITE_INICIAL_KB} KB`);
console.log(`Maior arquivo: ${maior.f} ${maior.kb.toFixed(1)} KB (gzip) · limite ${LIMITE_PEDACO_KB} KB`);
if (!inicial.length) throw new Error('index.html sem scripts: o build rodou?');
if (totalInicial > LIMITE_INICIAL_KB || maior.kb > LIMITE_PEDACO_KB) {
  console.error('Acima do orçamento de tamanho.');
  process.exit(1);
}
