import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './mf-assets.js';
import './styles.css';
import { connect } from './store';
import { initAuth } from './auth';

connect();
initAuth();
createRoot(document.getElementById('root')!).render(<App />);
