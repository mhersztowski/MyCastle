import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { PodcastsPage } from './pages/PodcastsPage';
import { QueuePage } from './pages/QueuePage';
import { NotesPage } from './pages/NotesPage';

export function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/podcasts" replace />} />
        <Route path="/podcasts" element={<PodcastsPage />} />
        <Route path="/queue" element={<QueuePage />} />
        <Route path="/notes" element={<NotesPage />} />
        {/* Nieznany adres wraca na stronę główną zamiast pokazywać pustkę. */}
        <Route path="*" element={<Navigate to="/podcasts" replace />} />
      </Routes>
    </Layout>
  );
}
