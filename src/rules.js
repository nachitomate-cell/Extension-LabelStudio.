// AWP category rules engine. Pure functions, no DOM access.
const AWP_CATEGORIES = ['EWP', 'PWP', 'CWA', 'CWP', 'SWP', 'IWP', 'WFP'];

function findMentionedCategories(pdfText) {
  if (!pdfText) return [];
  const found = new Set();
  for (const code of AWP_CATEGORIES) {
    const re = new RegExp(`\\b${code}\\b`);
    if (re.test(pdfText)) found.add(code);
  }
  return [...found];
}

// Returns the list of AWP category codes that should be checked.
//   - relevancia "No relevante" → []
//   - no mentions found → all 7
//   - any mentions → those mentioned; if IWP or WFP is mentioned, force both
function computeAwpCategories(relevancia, pdfText) {
  if (relevancia === 'No relevante') return [];

  const mentioned = findMentionedCategories(pdfText);
  if (mentioned.length === 0) return [...AWP_CATEGORIES];

  const result = new Set(mentioned);
  if (result.has('IWP') || result.has('WFP')) {
    result.add('IWP');
    result.add('WFP');
  }
  return AWP_CATEGORIES.filter((c) => result.has(c));
}

// Builds the full set of checkboxes (by name attribute) that should end up checked.
function computeDesiredState({ relevancia, aplicabilidad, pdfText }) {
  return {
    relevancia,
    aplicabilidad,
    awp: computeAwpCategories(relevancia, pdfText),
  };
}

const LSRules = {
  AWP_CATEGORIES,
  findMentionedCategories,
  computeAwpCategories,
  computeDesiredState,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = LSRules;
} else if (typeof globalThis !== 'undefined') {
  globalThis.LSRules = LSRules;
}
