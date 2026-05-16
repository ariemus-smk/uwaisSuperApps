import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Lock, User, RefreshCw, AlertCircle, ShieldCheck } from 'lucide-react';

const Login = () => {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username || !password) {
      setError('Please fill in all fields');
      return;
    }
    setError('');
    setLoading(true);
    
    const result = await login(username, password);
    setLoading(false);
    if (!result.success) {
      setError(result.message || 'Invalid username or password');
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center px-4 relative">
      {/* Background radial blobs */}
      <div className="absolute top-1/4 left-1/4 h-80 w-80 rounded-full bg-brand-500/10 filter blur-3xl pulse-glow pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 h-80 w-80 rounded-full bg-indigo-500/5 filter blur-3xl pulse-glow pointer-events-none" style={{ animationDelay: '2s' }} />

      <div className="w-full max-w-md z-10">
        
        {/* Logo/Branding Header */}
        <div className="text-center mb-8">
          <img src="/logo.png" alt="UwaisSuperApps Logo" className="h-16 w-16 mx-auto mb-3 object-contain drop-shadow-2xl" />
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-100 m-0">
            <span className="gradient-text-primary">UwaisSuperApps</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1.5 font-medium">ISP Billing & Integrated Infrastructure Panel</p>
        </div>

        {/* Login Box */}
        <div className="glass-panel p-8 shadow-2xl border-slate-800/80">
          <h2 className="text-xl font-bold text-slate-200 mb-6 text-center">Account Sign In</h2>

          {error && (
            <div className="bg-rose-500/15 border border-rose-500/20 text-rose-400 p-3.5 rounded-xl text-xs font-semibold mb-5 flex items-center space-x-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Username</label>
              <div className="relative">
                <User className="absolute left-3 top-3 h-5 w-5 text-slate-500" />
                <input 
                  type="text" 
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter username" 
                  className="w-full input-field pl-10"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-5 w-5 text-slate-500" />
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••" 
                  className="w-full input-field pl-10"
                />
              </div>
            </div>

            {/* Submit button */}
            <button 
              type="submit" 
              disabled={loading}
              className="w-full glow-btn-primary py-3 flex items-center justify-center space-x-2 mt-2"
            >
              {loading ? (
                <RefreshCw className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <ShieldCheck className="h-5 w-5" />
                  <span>Authenticate Access</span>
                </>
              )}
            </button>
          </form>
        </div>

      </div>
    </div>
  );
};

export default Login;
