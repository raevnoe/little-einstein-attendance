import { useState } from 'react';
import StudentList from '../components/students/StudentList.jsx';
import StudentDetail from '../components/students/StudentDetail.jsx';
import StudentForm from '../components/students/StudentForm.jsx';
import SectionsPanel from '../components/students/SectionsPanel.jsx';

/**
 * Students section for staff. `canManage` (admins) shows add/edit/deactivate controls.
 * It only changes what is SHOWN: the API independently rejects non-admin changes.
 */
export default function StudentsPage({ canManage }) {
  // { name: 'list' } | { name: 'detail', studentId, notice? } | { name: 'create' } | { name: 'edit', student }
  const [view, setView] = useState({ name: 'list' });

  const showList = () => setView({ name: 'list' });
  const showDetail = (studentId, notice) => setView({ name: 'detail', studentId, notice });
  const handleSaved = (student, notice) => showDetail(student.studentId, notice);

  switch (view.name) {
    case 'detail':
      return (
        <StudentDetail
          key={`${view.studentId}-${view.notice ?? ''}`}
          studentId={view.studentId}
          notice={view.notice}
          canManage={canManage}
          onBack={showList}
          onEdit={(student) => setView({ name: 'edit', student })}
        />
      );
    case 'create':
      return canManage && <StudentForm onSaved={handleSaved} onCancel={showList} />;
    case 'edit':
      return (
        canManage && (
          <StudentForm student={view.student} onSaved={handleSaved} onCancel={() => showDetail(view.student.studentId)} />
        )
      );
    default:
      return (
        <div className="space-y-5">
          {/* Admins manage the section list here (used by student records and teacher assignments). */}
          {canManage && <SectionsPanel />}
          <StudentList canManage={canManage} onView={(id) => showDetail(id)} onAdd={() => setView({ name: 'create' })} />
        </div>
      );
  }
}
