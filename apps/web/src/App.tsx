import { useTranslation } from 'react-i18next';
import { HotSeatPage } from './pages/HotSeatPage';
import { Home } from './pages/Home';
import { RoomPage } from './pages/RoomPage';
import { navigate, usePath } from './router';

export function App() {
  const { t } = useTranslation();
  const path = usePath();
  const room = path.match(/^\/r\/([A-Za-z0-9]{6})\/?$/);

  let page;
  if (room) page = <RoomPage key={room[1]} code={room[1]!.toUpperCase()} />;
  else if (path.startsWith('/lokal')) page = <HotSeatPage />;
  else page = <Home />;

  return (
    <div className="app">
      <header className="app-header">
        <a
          className="brand"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigate('/');
          }}
        >
          <span className="logo" aria-hidden="true">
            M
          </span>
          <div>
            <div className="brand-name">{t('app.title')}</div>
            <div className="muted small">{t('app.tagline')}</div>
          </div>
        </a>
        {room && <span className="header-code">{room[1]!.toUpperCase()}</span>}
      </header>
      {page}
    </div>
  );
}
