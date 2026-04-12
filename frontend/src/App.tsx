import { BrowserRouter, Routes, Route } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import LiveFlowPage from './pages/LiveFlowPage';
import DashboardPage from './pages/DashboardPage';
import OrdersPage from './pages/OrdersPage';
import MachinesPage from './pages/MachinesPage';
import AnalyticsPage from './pages/AnalyticsPage';
import AuditPage from './pages/AuditPage';

// Settings (Tenant Admin)
import SettingsCompanyPage from './pages/settings/SettingsCompanyPage';
import SettingsTeamPage from './pages/settings/SettingsTeamPage';
import SettingsRolesPage from './pages/settings/SettingsRolesPage';

// Control Panel (Owner)
import ControlTenantsPage from './pages/control/ControlTenantsPage';
import ControlUsersPage from './pages/control/ControlUsersPage';
import ControlMachinesPage from './pages/control/ControlMachinesPage';
import ControlSystemPage from './pages/control/ControlSystemPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          {/* Main pages */}
          <Route path="/" element={<LiveFlowPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/machines" element={<MachinesPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/audit" element={<AuditPage />} />

          {/* Settings (Tenant Admin) */}
          <Route path="/settings/company" element={<SettingsCompanyPage />} />
          <Route path="/settings/team" element={<SettingsTeamPage />} />
          <Route path="/settings/roles" element={<SettingsRolesPage />} />

          {/* Control Panel (Owner) */}
          <Route path="/control/tenants" element={<ControlTenantsPage />} />
          <Route path="/control/users" element={<ControlUsersPage />} />
          <Route path="/control/machines" element={<ControlMachinesPage />} />
          <Route path="/control/system" element={<ControlSystemPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
