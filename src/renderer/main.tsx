import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter, Navigate, Routes, Route, useParams } from 'react-router-dom';
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';
import { Layout } from './components/Layout';
import './index.css';

ModuleRegistry.registerModules([AllCommunityModule]);

const Dashboard = lazy(() => import('./pages/Dashboard').then(module => ({ default: module.Dashboard })));
const Players = lazy(() => import('./pages/Players').then(module => ({ default: module.Players })));
const Sessions = lazy(() => import('./pages/Sessions').then(module => ({ default: module.Sessions })));
const MatchPanel = lazy(() => import('./pages/MatchPanel').then(module => ({ default: module.MatchPanel })));
const Checkin = lazy(() => import('./pages/Checkin').then(module => ({ default: module.Checkin })));
const Payments = lazy(() => import('./pages/Payments').then(module => ({ default: module.Payments })));
const Settings = lazy(() => import('./pages/Settings').then(module => ({ default: module.Settings })));
const Report = lazy(() => import('./pages/Report').then(module => ({ default: module.Report })));
const Tournaments = lazy(() => import('./pages/Tournaments').then(module => ({ default: module.Tournaments })));
const TournamentDetail = lazy(() => import('./pages/TournamentDetail').then(module => ({ default: module.TournamentDetail })));
const TournamentLivePanel = lazy(() => import('./pages/TournamentLivePanel').then(module => ({ default: module.TournamentLivePanel })));

function LegacyTournamentRoute() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/tournaments/${id ?? ''}`} replace />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <Suspense fallback={<div className="p-6 text-sm text-zinc-400">Loading...</div>}>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="players" element={<Players />} />
            <Route path="sessions" element={<Sessions />} />
            <Route path="checkin/:sessionId" element={<Checkin />} />
            <Route path="match/:sessionId" element={<MatchPanel />} />
            <Route path="payments" element={<Payments />} />
            <Route path="settings" element={<Settings />} />
            <Route path="report/:sessionId" element={<Report />} />
            <Route path="tournaments" element={<Tournaments />} />
            <Route path="tournaments/:id" element={<TournamentDetail />} />
            <Route path="tournaments/:id/live" element={<TournamentLivePanel />} />
            <Route path="tournament/:id" element={<LegacyTournamentRoute />} />
          </Route>
        </Routes>
      </Suspense>
    </HashRouter>
  </React.StrictMode>,
);

// Listen for global keyboard shortcuts from main process
if (window.shortcuts) {
  window.shortcuts.onNewSession(() => {
    window.dispatchEvent(new CustomEvent('shortcut:new-session'));
  });
  window.shortcuts.onEndSession(() => {
    window.dispatchEvent(new CustomEvent('shortcut:end-session'));
  });
  window.shortcuts.onExport(() => {
    window.api.exportCSV();
  });
  window.shortcuts.onAddPlayer(() => {
    window.dispatchEvent(new CustomEvent('menu:add-player'));
  });
  window.shortcuts.onSearchPlayer(() => {
    window.dispatchEvent(new CustomEvent('menu:search-player'));
  });
  window.shortcuts.onSettings(() => {
    window.dispatchEvent(new CustomEvent('shortcut:settings'));
  });
}
