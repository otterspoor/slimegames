import * as App from './app/index.js';

window.onload = () => {
  const link = document.createElement('link');
  link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap';
  link.rel = 'stylesheet';
  document.head.appendChild(link);
  (window as any).gameInstance = new App.Game();
};


