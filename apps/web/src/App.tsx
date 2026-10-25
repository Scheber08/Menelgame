import { useTranslation } from 'react-i18next';
import { Icon, Logo, type IconName } from './components/Icon';
import { HotSeatPage } from './pages/HotSeatPage';
import { Home } from './pages/Home';
import { MyPacksPage } from './pages/MyPacksPage';
import { PackEditorPage } from './pages/PackEditorPage';
import { RoomPage } from './pages/RoomPage';
import { SharedPackPage } from './pages/SharedPackPage';
import { StatsPage } from './pages/StatsPage';
import { navigate, usePath } from './router';

function NavLink({
  to,
  icon,
  active,
  children,
}: {
  to: string;
  icon: IconName;
  active: boolean;
  children: string;
}) {
  return (
    <a
      href={to}
      className={active ? 'active' : undefined}
      aria-current={active ? 'page' : undefined}
      onClick={(e) => {
        e.preventDefault();
        navigate(to);
      }}
    >
      <Icon name={icon} size={18} />
      <span>{children}</span>
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
  else if (path.startsWith('/statistik')) page = <StatsPage />;
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
          <Logo className="logo" />
          <div>
            <div className="brand-name">
              Menel<span>game</span>
            </div>
            <div className="muted small brand-tagline">{t('app.tagline')}</div>
          </div>
        </a>
        <nav className="header-nav">
          {room && <span className="header-code">{room[1]!.toUpperCase()}</span>}
          <NavLink to="/statistik" icon="trophy" active={path.startsWith('/statistik')}>
            {t('nav.stats')}
          </NavLink>
          <NavLink to="/packs" icon="layers" active={path.startsWith('/packs')}>
            {t('nav.packs')}
          </NavLink>
        </nav>
      </header>
      {page}
      {!room && <footer className="app-footer">{t('app.footer')}</footer>}
    </div>
  );
}
