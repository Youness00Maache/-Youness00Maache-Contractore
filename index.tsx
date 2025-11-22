import React from 'react';
import ReactDOM from 'react-dom/client';
// FIX: Added .tsx extension to the import path to resolve the module error.
import App from './App.tsx';
import { BrowserRouter } from 'react-router-dom';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 20, fontFamily: 'sans-serif', color: '#333', maxWidth: '800px', margin: '0 auto' }}>
          <h1 style={{ color: '#e11d48' }}>Something went wrong.</h1>
          <p>The application encountered an unexpected error.</p>
          <div style={{ backgroundColor: '#f1f5f9', padding: '15px', borderRadius: '8px', overflowX: 'auto', marginTop: '20px' }}>
            <pre style={{ margin: 0, color: '#be185d' }}>{this.state.error?.toString()}</pre>
          </div>
          <button onClick={() => window.location.reload()} style={{ marginTop: '20px', padding: '10px 20px', cursor: 'pointer', backgroundColor: '#0000bb', color: 'white', border: 'none', borderRadius: '6px' }}>
            Reload Application
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
