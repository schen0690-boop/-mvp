import { createRoot } from 'react-dom/client';
import {StrictMode} from 'react';
import { App } from './App.js';
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
