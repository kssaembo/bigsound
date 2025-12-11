import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Basic Service Worker Registration Logic
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // In a real build environment, this would point to a generated sw.js
    // For this example, we verify the browser supports it.
    // We can't generate a separate physical sw.js file in this specific runner easily,
    // but this code block prepares the app for PWA status.
    navigator.serviceWorker.register('/service-worker.js').then(registration => {
      console.log('SW registered: ', registration);
    }).catch(registrationError => {
      console.log('SW registration failed: ', registrationError);
    });
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
