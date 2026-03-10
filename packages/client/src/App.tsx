import { BrowserRouter, Routes, Route, Navigate, NavLink } from 'react-router-dom';
import CraftsPage from '@/pages/CraftsPage';
import ItemsPage from '@/pages/ItemsPage';

const Nav = () => (
    <nav className="border-b px-6 py-3 flex gap-6 text-sm font-medium">
        <NavLink to="/items" className={({ isActive }) => isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}>
            Items
        </NavLink>
        <NavLink to="/crafts" className={({ isActive }) => isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}>
            Crafts
        </NavLink>
    </nav>
);

const App = () => (
    <BrowserRouter>
        <Nav />
        <Routes>
            <Route path="/" element={<Navigate to="/items" replace />} />
            <Route path="/crafts" element={<CraftsPage />} />
            <Route path="/items" element={<ItemsPage />} />
        </Routes>
    </BrowserRouter>
);

export default App;
