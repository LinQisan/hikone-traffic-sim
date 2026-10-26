import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {EditorApp} from '../components/editor/EditorApp.tsx';
const container = document.getElementById('root');
if (!container) throw new Error('Missing editor root');
export function mountEditor(container: Element) {const root = createRoot(container); root.render(<StrictMode><EditorApp/></StrictMode>); return root;}
export const application = mountEditor(container);
if (import.meta.hot) import.meta.hot.dispose(() => application.unmount());
