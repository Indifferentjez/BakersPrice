import { NavLink, Route, Routes } from 'react-router-dom';
import RecipeList from './pages/RecipeList.jsx';
import PriceList from './pages/PriceList.jsx';
import Defaults from './pages/Defaults.jsx';
import Quotes from './pages/Quotes.jsx';
import Wizard from './wizard/Wizard.jsx';
import CustomerPage from './pages/CustomerPage.jsx';

function Shell({ children }) {
  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">Bakers<span>Price</span></div>
        <nav className="nav">
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>Recipes</NavLink>
          <NavLink to="/quotes" className={({ isActive }) => (isActive ? 'active' : '')}>Quotes</NavLink>
          <NavLink to="/prices" className={({ isActive }) => (isActive ? 'active' : '')}>Price list</NavLink>
          <NavLink to="/defaults" className={({ isActive }) => (isActive ? 'active' : '')}>Defaults</NavLink>
        </nav>
      </div>
      {children}
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/q/:id" element={<CustomerPage />} />
      <Route path="/" element={<Shell><RecipeList /></Shell>} />
      <Route path="/prices" element={<Shell><PriceList /></Shell>} />
      <Route path="/defaults" element={<Shell><Defaults /></Shell>} />
      <Route path="/quotes" element={<Shell><Quotes /></Shell>} />
      <Route path="/new" element={<Shell><Wizard /></Shell>} />
      <Route path="/recipe/:id" element={<Shell><Wizard /></Shell>} />
    </Routes>
  );
}
