import { useEffect, useState, useCallback } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { useMeasureStore } from './stores/measureStore';
import { useComponentLibraryStore } from './stores/componentLibraryStore';
import { useImportQueueStore } from './stores/importQueueStore';
import { Sidebar } from './components/layout/Sidebar';
import { MeasureLibrary } from './components/measure/MeasureLibrary';
import { UMSEditor } from './components/measure/UMSEditor';
import { ValidationTraceViewer } from './components/validation/ValidationTraceViewer';
import { CodeGeneration } from './components/measure/CodeGeneration';
import { ValueSetManager } from './components/valueset/ValueSetManager';
import { SettingsPage } from './components/settings/SettingsPage';
import { LibraryBrowser } from './components/library/LibraryBrowser';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { DraggableFAB } from './components/copilot/DraggableFAB';
import { ToastContainer } from './components/notifications/ToastContainer';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { PasswordGate } from './components/shared/PasswordGate';

// Map routes to tab names
const ROUTE_TO_TAB = {
  '/': 'library',
  '/library': 'library',
  '/editor': 'editor',
  '/valuesets': 'valuesets',
  '/validation': 'validation',
  '/codegen': 'codegen',
  '/components': 'components',
  '/settings': 'settings',
};

const _TAB_TO_ROUTE = {
  library: '/library',
  editor: '/editor',
  valuesets: '/valuesets',
  validation: '/validation',
  codegen: '/codegen',
  components: '/components',
  settings: '/settings',
};

// Inner app component that has access to router hooks
function AppContent() {
  const location = useLocation();

  const { setActiveTab, measures, loadFromApi: loadMeasures, isLoadingFromApi: measuresLoading, apiError: measuresError } = useMeasureStore();
  const { loadFromApi: loadComponents, rebuildUsageIndex, initializeWithSampleData, isLoadingFromApi: componentsLoading, apiError: componentsError } = useComponentLibraryStore();
  const [isRetrying, setIsRetrying] = useState(false);
  const [demoMode, setDemoMode] = useState(false);

  // Sync URL to store on location change (one-way: URL -> store)
  useEffect(() => {
    const tabFromRoute = ROUTE_TO_TAB[location.pathname] || 'library';
    setActiveTab(tabFromRoute);
  }, [location.pathname, setActiveTab]);

  // Reset import queue store on fresh page load (imports don't survive refresh)
  useEffect(() => {
    useImportQueueStore.getState().reset();
  }, []);

  // Load measures and components on mount
  const initializeStores = useCallback(async () => {
    await Promise.all([loadMeasures(), loadComponents()]);
  }, [loadMeasures, loadComponents]);

  useEffect(() => {
    initializeStores();
  }, [initializeStores]);

  // Rebuild usage index after both stores are loaded
  useEffect(() => {
    if (!measuresLoading && !componentsLoading && measures.length > 0) {
      rebuildUsageIndex(measures);
    }
  }, [measuresLoading, componentsLoading, measures, rebuildUsageIndex]);

  const isLoading = measuresLoading || componentsLoading;
  const hasError = !isLoading && !demoMode && (measuresError || componentsError);
  const errorMessage = measuresError || componentsError;

  const handleRetry = async () => {
    setIsRetrying(true);
    await initializeStores();
    setIsRetrying(false);
  };

  const handleDemoMode = () => {
    // Initialize component library with built-in sample data
    initializeWithSampleData();
    // Clear error state so the app renders
    useMeasureStore.setState({ apiError: null });
    useComponentLibraryStore.setState({ apiError: null });
    setDemoMode(true);
  };

  return (
    <div className="h-screen flex flex-col">
      <div className="flex-1 flex overflow-hidden">
        <Sidebar />
        {isLoading && (
          <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-xl">
              <div className="flex items-center gap-3">
                <div className="animate-spin h-5 w-5 border-2 border-emerald-500 border-t-transparent rounded-full"></div>
                <span className="text-gray-700 dark:text-gray-300">Loading from backend...</span>
              </div>
            </div>
          </div>
        )}
        {hasError && (
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-xl max-w-md mx-4">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                    Unable to Connect to Backend
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    {errorMessage || 'The backend server is not responding. Please ensure the backend is running on port 8000.'}
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={handleRetry}
                      disabled={isRetrying}
                      className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-md text-sm font-medium transition-colors"
                    >
                      <RefreshCw className={`w-4 h-4 ${isRetrying ? 'animate-spin' : ''}`} />
                      {isRetrying ? 'Retrying...' : 'Retry Connection'}
                    </button>
                    <button
                      onClick={handleDemoMode}
                      className="flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-md text-sm font-medium transition-colors"
                    >
                      Continue in Demo Mode
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-4">
                    Demo mode uses sample data stored in-browser. Import measures or connect a backend for full functionality.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
        <main className="flex-1 flex flex-col overflow-hidden">
          {demoMode && (
            <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-1.5 flex items-center justify-between text-xs">
              <span className="text-amber-600 dark:text-amber-400">
                <AlertTriangle className="w-3 h-3 inline mr-1.5" />
                Demo Mode — data is stored in-browser only. Connect a backend for persistence.
              </span>
              <button
                onClick={() => { setDemoMode(false); initializeStores(); }}
                className="text-amber-600 dark:text-amber-400 hover:underline font-medium"
              >
                Reconnect
              </button>
            </div>
          )}
          <Routes>
            <Route path="/" element={<MeasureLibrary />} />
            <Route path="/library" element={<MeasureLibrary />} />
            <Route path="/editor" element={
              <ErrorBoundary fallbackName="Measure Editor">
                <UMSEditor />
              </ErrorBoundary>
            } />
            <Route path="/valuesets" element={
              <ErrorBoundary fallbackName="Value Set Manager">
                <ValueSetManager />
              </ErrorBoundary>
            } />
            <Route path="/validation" element={
              <ErrorBoundary fallbackName="Validation Viewer">
                <ValidationTraceViewer />
              </ErrorBoundary>
            } />
            <Route path="/codegen" element={
              <ErrorBoundary fallbackName="Code Generation">
                <CodeGeneration />
              </ErrorBoundary>
            } />
            <Route path="/components" element={
              <ErrorBoundary fallbackName="Component Library">
                <LibraryBrowser />
              </ErrorBoundary>
            } />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
      </div>
      <DraggableFAB />
      <ToastContainer />
    </div>
  );
}

function App() {
  return (
    <PasswordGate>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </PasswordGate>
  );
}

export default App;
