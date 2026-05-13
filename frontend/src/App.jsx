import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Sidebar from './components/Sidebar';
import Navbar from './components/Navbar';

// Page imports
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Customers from './pages/Customers';
import Subscriptions from './pages/Subscriptions';
import Billing from './pages/Billing';
import Infrastructure from './pages/Infrastructure';
import Tickets from './pages/Tickets';
import Assets from './pages/Assets';
import UsersPage from './pages/Users';
import BranchesPage from './pages/Branches';
import PackagesPage from './pages/Packages';
import NasPage from './pages/Nas';
import Regions from './pages/Regions';
import VpnChr from './pages/VpnChr';

// App css reset (remove default vite boilerplate css if active)
import './index.css';

// Protected Route wrapper
const ProtectedLayout = ({ children }) => {
  const { isLoggedIn, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <div className="h-10 w-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-bold text-slate-400 tracking-wider">Verifying Session...</span>
        </div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-slate-950">
      {/* Sidebar navigation */}
      <Sidebar />
      
      {/* Core main content panel */}
      <div className="flex-1 flex flex-col min-h-screen overflow-x-hidden">
        {/* Top bar header */}
        <Navbar />
        
        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
};

// Public Route wrapper (prevents logged in users from seeing login again)
const PublicRoute = ({ children }) => {
  const { isLoggedIn, loading } = useAuth();

  if (loading) return null;

  if (isLoggedIn) {
    return <Navigate to="/" replace />;
  }

  return children;
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* Public Login Route */}
          <Route 
            path="/login" 
            element={
              <PublicRoute>
                <Login />
              </PublicRoute>
            } 
          />

          {/* Protected Area Layout */}
          <Route 
            path="/" 
            element={
              <ProtectedLayout>
                <Dashboard />
              </ProtectedLayout>
            } 
          />

          <Route 
            path="/customers" 
            element={
              <ProtectedLayout>
                <Customers />
              </ProtectedLayout>
            } 
          />

          <Route 
            path="/subscriptions" 
            element={
              <ProtectedLayout>
                <Subscriptions />
              </ProtectedLayout>
            } 
          />

          <Route 
            path="/billing" 
            element={
              <ProtectedLayout>
                <Billing />
              </ProtectedLayout>
            } 
          />

          <Route 
            path="/infrastructure" 
            element={
              <ProtectedLayout>
                <Infrastructure />
              </ProtectedLayout>
            } 
          />

          <Route 
            path="/tickets" 
            element={
              <ProtectedLayout>
                <Tickets />
              </ProtectedLayout>
            } 
          />

          <Route 
            path="/assets" 
            element={
              <ProtectedLayout>
                <Assets />
              </ProtectedLayout>
            } 
          />

          <Route 
            path="/users" 
            element={
              <ProtectedLayout>
                <UsersPage />
              </ProtectedLayout>
            } 
          />

          <Route 
            path="/branches" 
            element={
              <ProtectedLayout>
                <BranchesPage />
              </ProtectedLayout>
            } 
          />

          <Route 
            path="/packages" 
            element={
              <ProtectedLayout>
                <PackagesPage />
              </ProtectedLayout>
            } 
          />

          <Route 
            path="/nas" 
            element={
              <ProtectedLayout>
                <NasPage />
              </ProtectedLayout>
            } 
          />

          <Route 
            path="/regions" 
            element={
              <ProtectedLayout>
                <Regions />
              </ProtectedLayout>
            } 
          />

          <Route 
            path="/vpn-chr" 
            element={
              <ProtectedLayout>
                <VpnChr />
              </ProtectedLayout>
            } 
          />

          {/* Fallback Catch-All */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
