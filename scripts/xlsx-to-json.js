#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('xlsx');

const [, , inputArg, outputArg] = process.argv;
if (!inputArg || !outputArg) {
  console.error('usage: xlsx-to-json.js <input.xlsx> <output.json>');
  process.exit(1);
}

const inputPath = path.resolve(inputArg);
const outputPath = path.resolve(outputArg);

const RELEVANCIA = new Set(['Alta', 'Media', 'Baja', 'No relevante']);
const APLICABILIDAD = new Set(['Práctico', 'Teórico', 'No aplica']);

const wb = XLSX.readFile(inputPath);
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { defval: null });

const documents = {};
const issues = [];

for (const row of rows) {
  const name = (row.documentos || '').trim();
  if (!name) continue;
  const relevancia = (row.relevancia || '').trim();
  const aplicabilidad = (row.Aplicabilidad || '').trim();

  if (!RELEVANCIA.has(relevancia)) {
    issues.push(`${name}: relevancia inválida "${relevancia}"`);
    continue;
  }
  if (!APLICABILIDAD.has(aplicabilidad)) {
    issues.push(`${name}: aplicabilidad inválida "${aplicabilidad}"`);
    continue;
  }
  documents[name] = { relevancia, aplicabilidad };
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(
  outputPath,
  JSON.stringify({ generatedAt: new Date().toISOString(), documents }, null, 2),
);

console.log(`wrote ${Object.keys(documents).length} documents → ${outputPath}`);
if (issues.length) {
  console.warn(`${issues.length} filas omitidas:`);
  for (const i of issues) console.warn('  - ' + i);
}
