import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'react-loading-skeleton/dist/skeleton.css';
// Our CSS comes AFTER Bootstrap and the skeleton CSS so our design tokens override theirs
import './index.css';
import './styles/admin.css';
import './styles/member.css';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';

// Interactive Bootstrap pieces (modals, dropdowns, tooltips, toasts) come from react-bootstrap,
// so Bootstrap's own JavaScript bundle is not needed.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
