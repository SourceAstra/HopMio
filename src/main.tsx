import React from 'react';
import ReactDOM from 'react-dom/client';
import { StudioProvider } from './state/StudioContext';
import { App } from './App';
import './styles/tokens.css';
import './styles/layout.css';
import './styles/workbench.css';
import './styles/pages.css';
import './styles/usagi.css';
ReactDOM.createRoot(document.getElementById('root')!).render(
  <StudioProvider>
    <App />
  </StudioProvider>,
);
