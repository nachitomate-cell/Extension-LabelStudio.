const { test } = require('node:test');
const assert = require('node:assert/strict');
const { computeDesiredState, AWP_CATEGORIES } = require('../src/rules.js');

test('No relevante sin categorías → awp vacío', () => {
  const r = computeDesiredState({ relevancia: 'No relevante', aplicabilidad: 'No aplica', awp: [] });
  assert.deepEqual(r.awp, []);
});

test('categorías del catálogo se devuelven tal cual', () => {
  const awp = ['CWA', 'CWP', 'IWP', 'WFP'];
  const r = computeDesiredState({ relevancia: 'Alta', aplicabilidad: 'Práctico', awp });
  assert.deepEqual(r.awp, awp);
});

test('catálogo con todas las categorías', () => {
  const r = computeDesiredState({ relevancia: 'Media', aplicabilidad: 'Teórico', awp: [...AWP_CATEGORIES] });
  assert.deepEqual(r.awp, AWP_CATEGORIES);
});

test('awp undefined se normaliza a array vacío', () => {
  const r = computeDesiredState({ relevancia: 'Baja', aplicabilidad: 'Práctico', awp: undefined });
  assert.deepEqual(r.awp, []);
});

test('awp null se normaliza a array vacío', () => {
  const r = computeDesiredState({ relevancia: 'Media', aplicabilidad: 'Práctico', awp: null });
  assert.deepEqual(r.awp, []);
});

test('relevancia y aplicabilidad se pasan sin modificar', () => {
  const r = computeDesiredState({ relevancia: 'Alta', aplicabilidad: 'Práctico', awp: ['EWP'] });
  assert.equal(r.relevancia, 'Alta');
  assert.equal(r.aplicabilidad, 'Práctico');
});

test('caso real: CWA, CWP, IWP, WFP del catálogo', () => {
  const r = computeDesiredState({ relevancia: 'Media', aplicabilidad: 'Práctico', awp: ['CWA', 'CWP', 'IWP', 'WFP'] });
  assert.deepEqual(r.awp, ['CWA', 'CWP', 'IWP', 'WFP']);
});

test('caso real: solo WFP del catálogo (sin forzar IWP)', () => {
  const r = computeDesiredState({ relevancia: 'Baja', aplicabilidad: 'Teórico', awp: ['WFP'] });
  assert.deepEqual(r.awp, ['WFP']);
});
