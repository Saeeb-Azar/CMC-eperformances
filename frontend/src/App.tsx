import { BrowserRouter, Routes, Route } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import DashboardPage from './pages/DashboardPage';
import LiveMonitorPage from './pages/LiveMonitorPage';
import OrdersPage from './pages/OrdersPage';
import MachinesPage from './pages/MachinesPage';
import AnalyticsPage from './pages/AnalyticsPage';
import AuditPage from './pages/AuditPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/live" element={<LiveMonitorPage />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/machines" element={<MachinesPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/audit" element={<AuditPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
