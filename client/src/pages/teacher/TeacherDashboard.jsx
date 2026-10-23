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
import { StaffWelcome, TodaySummary } from '../../components/reports/DashboardSummaries.jsx';
import { AttendanceIcon, DismissalIcon, HomeIcon, ReportsIcon, RfidCardIcon, StarIcon, StudentsIcon } from '../../components/ui/icons.jsx';

const NAV = [
  { key: 'dashboard', label: 'Dashboard', icon: HomeIcon },
  { key: 'attendance', label: 'Attendance', icon: AttendanceIcon },
  { key: 'performance', label: 'Performance', icon: StarIcon },
  { key: 'dismissal', label: 'Dismissal', icon: DismissalIcon },
  { key: 'reports', label: 'Reports', icon: ReportsIcon },
  { key: 'students', label: 'Students', icon: StudentsIcon },
  { key: 'rfid', label: 'RFID Cards', icon: RfidCardIcon },
];
const TITLES = { attendance: 'Daily Attendance', performance: 'Performance Evaluation', dismissal: 'Dismissal Verification', reports: 'Reports', students: 'Students', rfid: 'RFID Cards' };

// Teachers monitor Daily Attendance, record Performance Evaluations, and view students (read-only).
export default function TeacherDashboard({ section, onSectionChange }) {
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
        <DismissalPage key={visit} />
      ) : section === 'reports' ? (
        <ReportsPage key={visit} />
      ) : section === 'students' ? (
        <StudentsPage key={visit} canManage={false} />
      ) : section === 'rfid' ? (
        <RfidCardsPage key={visit} canManage={false} />
      ) : (
        <div className="space-y-6">
          <StaffWelcome account={account} roleLabel="Teacher" onNavigate={navigate} />
          <TodaySummary onNavigate={navigate} />
          {/* Development only: shows what the SERVER decided about this account's role. */}
          {import.meta.env.DEV && <ServerAccessCheck endpoint="/teacher/test" />}
        </div>
      )}
    </AppShell>
  );
}
