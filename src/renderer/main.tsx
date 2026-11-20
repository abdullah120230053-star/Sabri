import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/manrope';
import '@fontsource-variable/noto-sans-arabic';
import './i18n';
import './styles.css';
import App from './App';

createRoot(document.getElementById('root')!).render(<App/>);
