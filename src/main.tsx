import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Handles for scripted checks in development (see README); not in production builds.
if (import.meta.env.DEV) {
  Promise.all([import('./store/layoutStore'), import('./store/uiStore'), import('./store/actions')]).then(([layout, ui, actions]) => {
    Object.assign(window, { __planner: { layout: layout.useLayoutStore, ui: ui.useUiStore, actions, analysis: () => layout.analysisFor(layout.getActiveLayout()) } });
  });
}
