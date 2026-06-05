// AWP category rules engine. Pure functions, no DOM access.
const AWP_CATEGORIES = ['EWP', 'PWP', 'CWA', 'CWP', 'SWP', 'IWP', 'WFP'];

// Returns the full set of fields that should end up set in the form.
// awp comes directly from the catalog (Categoría AWP column in the Excel).
function computeDesiredState({ relevancia, aplicabilidad, awp }) {
  return { relevancia, aplicabilidad, awp: awp || [] };
}

const LSRules = {
  AWP_CATEGORIES,
  computeDesiredState,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = LSRules;
} else if (typeof globalThis !== 'undefined') {
  globalThis.LSRules = LSRules;
}
