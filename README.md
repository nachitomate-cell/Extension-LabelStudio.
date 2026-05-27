# Label Studio Auto-Fill (AWP)

Extensión de Chrome que rellena automáticamente el formulario de clasificación
de Label Studio (Relevancia, Aplicabilidad, Categorías AWP) a partir de un
catálogo de documentos pre-clasificados (`Relevancia_Documentos.xlsx`).

## Flujo

1. El script `scripts/xlsx-to-json.js` convierte el `.xlsx` en
   `data/relevancia.json` con el formato:
   ```json
   { "documents": { "CII-FR-391_2023.pdf": { "relevancia": "...", "aplicabilidad": "..." } } }
   ```
2. El content script (`src/content.js`) corre en las páginas de Label Studio,
   detecta el nombre del PDF de la tarea actual (`Fuente: <archivo>.pdf`),
   busca su entrada en el catálogo y aplica el motor de reglas (`src/rules.js`)
   para decidir qué casillas marcar.
3. Las Categorías AWP no vienen del Excel — se infieren del texto del PDF
   visible en el panel izquierdo según estas reglas:
   - `relevancia == "No relevante"` → ninguna categoría
   - Sin menciones de EWP/PWP/CWA/CWP/SWP/IWP/WFP → todas las 7
   - Con menciones → solo las mencionadas; si aparece IWP o WFP, se marcan ambas

## Desarrollo

```bash
npm install
npm run build:data   # regenera data/relevancia.json desde el .xlsx
npm test             # tests del motor de reglas
```

## Instalación local en Chrome

1. `npm install && npm run build:data`
2. Chrome → `chrome://extensions` → activar "Modo desarrollador"
3. "Cargar descomprimida" → seleccionar este directorio
4. Abrir una tarea en Label Studio (`*.run.app/projects/.../data?labeling=1`)
5. El popup permite activar/desactivar y elegir si hacer Submit automático

## Actualizar el catálogo

Reemplazar `Relevancia_Documentos.xlsx` y volver a correr `npm run build:data`,
después recargar la extensión en `chrome://extensions`.
