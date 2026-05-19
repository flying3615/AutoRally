import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter, Navigate, Routes, Route, useParams } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Players } from './pages/Players';
import { Sessions } from './pages/Sessions';
import { MatchPanel } from './pages/MatchPanel';
import { Checkin } from './pages/Checkin';
import { Payments } from './pages/Payments';
import { Settings } from './pages/Settings';
import { Report } from './pages/Report';
import { Tournaments } from './pages/Tournaments';
import { TournamentDetail } from './pages/TournamentDetail';
import './index.css';

function LegacyTournamentRoute() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/tournaments/${id ?? ''}`} replace />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
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
          <Route path="tournament/:id" element={<LegacyTournamentRoute />} />
        </Route>
      </Routes>
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
