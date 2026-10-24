import { useTranslation } from 'react-i18next';
import { HotSeatPage } from './pages/HotSeatPage';
import { Home } from './pages/Home';
import { MyPacksPage } from './pages/MyPacksPage';
import { PackEditorPage } from './pages/PackEditorPage';
import { RoomPage } from './pages/RoomPage';
import { SharedPackPage } from './pages/SharedPackPage';
import { navigate, usePath } from './router';

function NavLink({ to, children }: { to: string; children: string }) {
  return (
    <a
      href={to}
      onClick={(e) => {
        e.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}

export function App() {
  const { t } = useTranslation();
  const path = usePath();
  const room = path.match(/^\/r\/([A-Za-z0-9]{6})\/?$/);
  const editor = path.match(/^\/packs\/([a-z0-9]{16})\/?$/);
  const shared = path.match(/^\/pack\/([a-z0-9]{16})\/?$/);

  let page;
  if (room) page = <RoomPage key={room[1]} code={room[1]!.toUpperCase()} />;
  else if (editor) page = <PackEditorPage key={editor[1]} id={editor[1]!} />;
  else if (shared) page = <SharedPackPage key={shared[1]} id={shared[1]!} />;
  else if (path.startsWith('/packs')) page = <MyPacksPage />;
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
        <nav className="header-nav">
          {room && <span className="header-code">{room[1]!.toUpperCase()}</span>}
          <NavLink to="/packs">{t('nav.packs')}</NavLink>
        </nav>
      </header>
      {page}
    </div>
  );
}
