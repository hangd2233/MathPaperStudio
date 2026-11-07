import React from 'react';import ReactDOM from 'react-dom/client';
import {PrismIpadConnection} from './components/prism-ipad-connection';
import {installIpadViewport} from './lib/backend/ipad-viewport';
import './styles/globals.css';import './styles/ipad-host.css';
installIpadViewport();
const root=document.getElementById('root');if(!root)throw Error('Missing Prism root');document.getElementById('loading-screen')?.remove();ReactDOM.createRoot(root).render(<React.StrictMode><PrismIpadConnection/></React.StrictMode>);
