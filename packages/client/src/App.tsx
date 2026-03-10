import { BrowserRouter, Routes, Route } from 'react-router-dom';
import CraftsPage from '@/pages/CraftsPage';

const App = () => (
    <BrowserRouter>
        <Routes>
            <Route path="/" />
            <Route path="/crafts" element={<CraftsPage />} />
        </Routes>
    </BrowserRouter>
);

export default App;
