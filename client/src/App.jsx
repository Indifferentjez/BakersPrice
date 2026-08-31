import { useEffect, useState } from 'react';
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import RecipeList from './pages/RecipeList.jsx';
import MasterIngredients from './pages/MasterIngredients.jsx';
import Defaults from './pages/Defaults.jsx';
import Quotes from './pages/Quotes.jsx';
import Wizard from './wizard/Wizard.jsx';
import CustomerPage from './pages/CustomerPage.jsx';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';

function Shell({ children }) {
  const { user, logout } = useAuth();
  const loc = useLocation();
  const nav = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the mobile menu on navigation and on Escape.
  useEffect(() => { setMenuOpen(false); }, [loc.pathname]);
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const onLogout = async () => {
    await logout();
    nav('/');
  };

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">Bakers<span>Price</span></div>
        <button
          type="button"
          className="nav-toggle"
          aria-expanded={menuOpen}
          aria-controls="site-nav"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          onClick={() => setMenuOpen((o) => !o)}
        >
          {menuOpen ? '✕' : '☰'}
        </button>
        <div className={`site-nav${menuOpen ? ' open' : ''}`} id="site-nav">
          <nav className="nav">
            <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>Recipes</NavLink>
            <NavLink to="/quotes" className={({ isActive }) => (isActive ? 'active' : '')}>Quotes</NavLink>
            <NavLink to="/ingredients" className={({ isActive }) => (isActive ? 'active' : '')}>Ingredients</NavLink>
            <NavLink to="/defaults" className={({ isActive }) => (isActive ? 'active' : '')}>Defaults</NavLink>
          </nav>
          <div className="nav-session">
            {user ? (
              <>
                <span className="muted" title={user.email}>{user.email}</span>
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
      <Route path="/" element={<Shell><RecipeList /></Shell>} />
      <Route path="/ingredients" element={<Shell><MasterIngredients /></Shell>} />
      <Route path="/prices" element={<Shell><MasterIngredients /></Shell>} />
      <Route path="/defaults" element={<Shell><Defaults /></Shell>} />
      <Route path="/quotes" element={<Shell><Quotes /></Shell>} />
      <Route path="/new" element={<Shell><Wizard /></Shell>} />
      <Route path="/recipe/:id" element={<Shell><Wizard /></Shell>} />
    </Routes>
  );
}
