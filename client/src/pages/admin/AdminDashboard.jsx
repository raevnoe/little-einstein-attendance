import { useState } from 'react';
import AppShell from '../../components/AppShell.jsx';
import { useAuth } from '../../auth/useAuth.js';
import ServerAccessCheck from '../../components/ServerAccessCheck.jsx';
import StudentsPage from '../StudentsPage.jsx';
import RfidCardsPage from '../RfidCardsPage.jsx';
import AttendancePage from '../AttendancePage.jsx';
import PerformancePage from '../PerformancePage.jsx';
import DismissalPage from '../DismissalPage.jsx';
import ReportsPage from '../ReportsPage.jsx';
import SettingsPage from '../SettingsPage.jsx';
import { AdminOverview, StaffWelcome, TodaySummary } from '../../components/reports/DashboardSummaries.jsx';
import FetchersAdminPage from './FetchersAdminPage.jsx';
import AuditLogPage from './AuditLogPage.jsx';
import AccountsPage from './AccountsPage.jsx';
import { AttendanceIcon, AuditIcon, DismissalIcon, FetcherIcon, HomeIcon, ReportsIcon, RfidCardIcon, StarIcon, StudentsIcon, UserIcon, SettingsIcon } from '../../components/ui/icons.jsx';

const NAV = [
  { key: 'dashboard', label: 'Dashboard', icon: HomeIcon },
  { key: 'attendance', label: 'Attendance', icon: AttendanceIcon },
  { key: 'performance', label: 'Performance', icon: StarIcon },
  { key: 'dismissal', label: 'Dismissal', icon: DismissalIcon },
  { key: 'reports', label: 'Reports', icon: ReportsIcon },
  { key: 'students', label: 'Students', icon: StudentsIcon },
  { key: 'rfid', label: 'RFID Cards', icon: RfidCardIcon },
  { key: 'fetchers', label: 'Fetchers', icon: FetcherIcon },
  { key: 'accounts', label: 'Accounts', icon: UserIcon },
  { key: 'audit', label: 'Audit Log', icon: AuditIcon },
  { key: 'settings', label: 'Settings', icon: SettingsIcon },
];
const TITLES = { attendance: 'Daily Attendance', performance: 'Performance Evaluation', dismissal: 'Dismissal Verification', reports: 'Reports', fetchers: 'Fetchers', accounts: 'Accounts', audit: 'Audit Log', students: 'Students', rfid: 'RFID Cards', settings: 'Settings' };

export default function AdminDashboard({ section, onSectionChange }) {
  const { account } = useAuth();
  // Bumped on every tab click so re-clicking Students returns to the list. The section itself
  // comes from the address (App.jsx + lib/routes.js); Back/Forward change it too.
  const [visit, setVisit] = useState(0);
  const navigate = (key) => {
    onSectionChange(key);
    setVisit((n) => n + 1);
  };

  return (
    <AppShell
      // The home tab's heading is the welcome hero (one h1 per screen).
      title={TITLES[section]}
      nav={NAV}
      activeKey={section}
      onNavigate={navigate}
      layout="sidebar"
    >
      {section === 'attendance' ? (
        <AttendancePage key={visit} />
      ) : section === 'performance' ? (
        <PerformancePage key={visit} />
      ) : section === 'dismissal' ? (
        <DismissalPage key={visit} allowDate />
      ) : section === 'fetchers' ? (
        <FetchersAdminPage key={visit} />
      ) : section === 'accounts' ? (
        <AccountsPage key={visit} />
      ) : section === 'audit' ? (
        <AuditLogPage key={visit} />
      ) : section === 'reports' ? (
        <ReportsPage key={visit} />
      ) : section === 'students' ? (
        <StudentsPage key={visit} canManage />
      ) : section === 'settings' ? (
        <SettingsPage key={visit} />
      ) : section === 'rfid' ? (
        <RfidCardsPage key={visit} canManage />
      ) : (
        <div className="space-y-6">
          <StaffWelcome account={account} roleLabel="Admin" onNavigate={navigate} />
          <TodaySummary onNavigate={navigate} />
          <AdminOverview onNavigate={navigate} />
          {/* Development only: shows what the SERVER decided about this account's role. */}
          {import.meta.env.DEV && <ServerAccessCheck endpoint="/admin/test" />}
        </div>
      )}
    </AppShell>
  );
}
