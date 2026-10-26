import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {App} from './App.tsx';
const container = document.getElementById('root');
if (!container) throw new Error('Missing application root');
export function mountSimulator(container: Element) {const root = createRoot(container); root.render(<StrictMode><App/></StrictMode>); return root;}
export const application = mountSimulator(container);
if (import.meta.hot) import.meta.hot.dispose(() => application.unmount());
