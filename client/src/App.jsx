import { useEffect, useRef, useState } from 'react';
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import { IconMenu, IconClose } from './icons.jsx';
import RecipeList from './pages/RecipeList.jsx';
import MasterIngredients from './pages/MasterIngredients.jsx';
import Defaults from './pages/Defaults.jsx';
import Quotes from './pages/Quotes.jsx';
import Wizard from './wizard/Wizard.jsx';
import CustomerPage from './pages/CustomerPage.jsx';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import Landing from './pages/Landing.jsx';
import Pricing from './pages/Pricing.jsx';
import Account from './pages/Account.jsx';
import Privacy from './pages/Privacy.jsx';
import Terms from './pages/Terms.jsx';

function Home() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <RecipeList /> : <Landing />;
}

function Shell({ children }) {
  const { user, logout } = useAuth();
  const loc = useLocation();
  const nav = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const topbarRef = useRef(null);

  // Close the mobile menu on navigation, on Escape, and on an outside tap.
  useEffect(() => { setMenuOpen(false); }, [loc.pathname]);
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
    const onDown = (e) => { if (topbarRef.current && !topbarRef.current.contains(e.target)) setMenuOpen(false); };
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [menuOpen]);

  const onLogout = async () => {
    await logout();
    nav('/');
  };

  return (
    <div className="app">
      <div className="topbar" ref={topbarRef}>
        <div className="brand">Bakers<span>Price</span></div>
        <button
          type="button"
          className="nav-toggle"
          aria-expanded={menuOpen}
          aria-controls="site-nav"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          onClick={() => setMenuOpen((o) => !o)}
        >
          {menuOpen ? <IconClose size={22} /> : <IconMenu size={22} />}
        </button>
        <div className={`site-nav${menuOpen ? ' open' : ''}`} id="site-nav">
          <nav className="nav">
            {user ? (
              <>
                <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>Recipes</NavLink>
                <NavLink to="/quotes" className={({ isActive }) => (isActive ? 'active' : '')}>Quotes</NavLink>
                <NavLink to="/ingredients" className={({ isActive }) => (isActive ? 'active' : '')}>Ingredients</NavLink>
                <NavLink to="/defaults" className={({ isActive }) => (isActive ? 'active' : '')}>Defaults</NavLink>
              </>
            ) : (
              <>
                <NavLink to="/new" className={({ isActive }) => (isActive ? 'active' : '')}>Try it</NavLink>
                <NavLink to="/pricing" className={({ isActive }) => (isActive ? 'active' : '')}>Pricing</NavLink>
              </>
            )}
          </nav>
          <div className="nav-session">
            {user ? (
              <>
                <NavLink to="/account" className={({ isActive }) => (isActive ? 'active' : '')} title={user.email}>{user.email}</NavLink>
                <button className="subtle sm" type="button" onClick={onLogout}>Log out</button>
              </>
            ) : (
              <NavLink to={`/login?next=${encodeURIComponent(loc.pathname === '/login' || loc.pathname === '/signup' ? '/' : loc.pathname)}`} className={({ isActive }) => (isActive ? 'active' : '')}>Log in</NavLink>
            )}
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/q/:id" element={<CustomerPage />} />
      <Route path="/login" element={<Shell><Login /></Shell>} />
      <Route path="/signup" element={<Shell><Signup /></Shell>} />
      <Route path="/forgot" element={<Shell><ForgotPassword /></Shell>} />
      <Route path="/reset" element={<Shell><ResetPassword /></Shell>} />
      <Route path="/" element={<Shell><Home /></Shell>} />
      <Route path="/pricing" element={<Shell><Pricing /></Shell>} />
      <Route path="/account" element={<Shell><Account /></Shell>} />
      <Route path="/privacy" element={<Shell><Privacy /></Shell>} />
      <Route path="/terms" element={<Shell><Terms /></Shell>} />
      <Route path="/ingredients" element={<Shell><MasterIngredients /></Shell>} />
      <Route path="/prices" element={<Shell><MasterIngredients /></Shell>} />
      <Route path="/defaults" element={<Shell><Defaults /></Shell>} />
      <Route path="/quotes" element={<Shell><Quotes /></Shell>} />
      <Route path="/new" element={<Shell><Wizard /></Shell>} />
      <Route path="/recipe/:id" element={<Shell><Wizard /></Shell>} />
    </Routes>
  );
}
