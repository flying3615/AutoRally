import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Players } from './pages/Players';
import { Sessions } from './pages/Sessions';
import { Checkin } from './pages/Checkin';
import { MatchPanel } from './pages/MatchPanel';
import { Payments } from './pages/Payments';
import { History } from './pages/History';
import { Settings } from './pages/Settings';
import './index.css';

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
          <Route path="history" element={<History />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </HashRouter>
  </React.StrictMode>,
);
