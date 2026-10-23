import { useState } from 'react';
import RfidCardList from '../components/rfid/RfidCardList.jsx';
import RfidCardDetail from '../components/rfid/RfidCardDetail.jsx';
import RfidCardRegister from '../components/rfid/RfidCardRegister.jsx';

/**
 * RFID Cards section for staff. `canManage` (admins) shows register/assign/deactivate
 * controls; teachers get a read-only view. The API enforces this independently.
 */
export default function RfidCardsPage({ canManage }) {
  // { name: 'list' } | { name: 'detail', uid, notice? } | { name: 'create' }
  const [view, setView] = useState({ name: 'list' });
  const showList = () => setView({ name: 'list' });

  if (view.name === 'detail') {
    return <RfidCardDetail key={view.uid} uid={view.uid} notice={view.notice} canManage={canManage} onBack={showList} />;
  }
  if (view.name === 'create' && canManage) {
    return <RfidCardRegister onView={(uid) => setView({ name: 'detail', uid })} onBack={showList} />;
  }
  return (
    <RfidCardList
      canManage={canManage}
      onView={(uid) => setView({ name: 'detail', uid })}
      onAdd={() => setView({ name: 'create' })}
    />
  );
}
