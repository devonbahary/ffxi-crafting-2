import { BrowserRouter, Routes, Route, Navigate, NavLink } from 'react-router-dom';
import CraftsPage from '@/pages/CraftsPage';
import ItemsPage from '@/pages/ItemsPage';
import SynthesisPage from '@/pages/SynthesisPage';

const navClass = ({ isActive }: { isActive: boolean }) =>
    isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground';

const Nav = () => (
    <nav className="border-b px-6 py-3 flex gap-6 text-sm font-medium">
        <NavLink to="/items" className={navClass}>
            Items
        </NavLink>
        <NavLink to="/synthesis" className={navClass}>
            Synthesis
        </NavLink>
        <NavLink to="/crafts" className={navClass}>
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
            <Route path="/synthesis" element={<SynthesisPage />} />
        </Routes>
    </BrowserRouter>
);

export default App;
