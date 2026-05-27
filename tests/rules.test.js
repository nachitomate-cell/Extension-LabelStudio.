const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  computeAwpCategories,
  findMentionedCategories,
} = require('../src/rules.js');

test('No relevante → ninguna categoría', () => {
  assert.deepEqual(computeAwpCategories('No relevante', 'EWP PWP CWA'), []);
});

test('sin menciones → todas las categorías', () => {
  assert.deepEqual(
    computeAwpCategories('Alta', 'Lorem ipsum sin códigos'),
    ['EWP', 'PWP', 'CWA', 'CWP', 'SWP', 'IWP', 'WFP'],
  );
});

test('menciona EWP y PWP → solo esas', () => {
  assert.deepEqual(
    computeAwpCategories('Alta', 'El EWP y el PWP son…'),
    ['EWP', 'PWP'],
  );
});

test('menciona IWP → fuerza también WFP', () => {
  assert.deepEqual(
    computeAwpCategories('Media', 'Solo se menciona IWP aquí'),
    ['IWP', 'WFP'],
  );
});

test('menciona WFP → fuerza también IWP', () => {
  assert.deepEqual(
    computeAwpCategories('Media', 'Solo WFP aparece'),
    ['IWP', 'WFP'],
  );
});

test('menciona EWP + IWP → EWP, IWP, WFP', () => {
  assert.deepEqual(
    computeAwpCategories('Alta', 'EWP… más tarde IWP'),
    ['EWP', 'IWP', 'WFP'],
  );
});

test('match es por palabra completa, no substring', () => {
  // "PEWP" no debe contar como EWP
  assert.deepEqual(findMentionedCategories('PEWPXX y NWFP'), []);
});

test('texto vacío → sin menciones', () => {
  assert.deepEqual(findMentionedCategories(''), []);
  assert.deepEqual(findMentionedCategories(null), []);
});
