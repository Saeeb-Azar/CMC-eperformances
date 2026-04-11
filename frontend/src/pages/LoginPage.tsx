import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // Demo mode: accept any credentials
    if (email && password) {
      localStorage.setItem('access_token', 'demo-token');
      navigate('/');
    } else {
      setError('Please enter email and password');
    }
  };

  return (
    <div className="min-h-screen bg-sidebar flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-white">ePerformances</h1>
          <p className="text-text-on-dark-muted text-sm mt-1">CMC CartonWrap Dashboard</p>
        </div>

        <form
          onSubmit={handleLogin}
          className="bg-surface rounded-2xl p-8 shadow-lg"
        >
          <h2 className="text-lg font-semibold text-text-primary mb-6">Sign In</h2>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 text-danger text-sm">{error}</div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-text-secondary mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@company.de"
                className="w-full px-4 py-2.5 rounded-lg border border-border bg-surface text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-sidebar focus:ring-1 focus:ring-sidebar"
              />
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="********"
                className="w-full px-4 py-2.5 rounded-lg border border-border bg-surface text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-sidebar focus:ring-1 focus:ring-sidebar"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full mt-6 py-2.5 rounded-lg bg-sidebar text-white text-sm font-medium hover:bg-sidebar-hover transition-colors"
          >
            Sign In
          </button>

          <p className="text-center text-xs text-text-muted mt-4">
            &copy; 2026, ePerformances
          </p>
        </form>
      </div>
    </div>
  );
}
