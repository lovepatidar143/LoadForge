import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import TestForm from './components/TestForm';
import TestHistory from './components/TestHistory';
import TestDetail from './components/TestDetail';
import WorkerStatus from './components/WorkerStatus';

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/new-test" element={<TestForm />} />
          <Route path="/history" element={<TestHistory />} />
          <Route path="/history/:testId" element={<TestDetail />} />
          <Route path="/workers" element={<WorkerStatus />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
