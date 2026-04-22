import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Mail, Lock, Loader2, ArrowRight, Package } from 'lucide-react';
import { api } from '../services/api';
import CartonWrapAnimation from '../components/auth/CartonWrapAnimation';

export default function LoginPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Already logged in? Skip the page.
  if (typeof window !== 'undefined' && localStorage.getItem('access_token')) {
    return <Navigate to="/" replace />;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email || !password) {
      setError(t('auth.missingFields'));
      return;
    }
    setLoading(true);
    try {
      const res = await api.login(email, password);
      localStorage.setItem('access_token', res.access_token);
      localStorage.setItem('refresh_token', res.refresh_token);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.loginFailed'));
    } finally {
      setLoading(false);
    }
  };

  const useDevCreds = () => {
    setEmail('admin@default.local');
    setPassword('admin123');
  };

  return (
    <div className="flex min-h-screen w-full bg-white">
      {/* Left: animated CartonWrap machine illustration */}
      <div className="hidden md:flex md:w-1/2 bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 relative overflow-hidden">
        <CartonWrapAnimation />
        <div className="absolute top-8 left-8 flex items-center gap-2 text-white">
          <Package size={20} />
          <span className="text-sm font-semibold tracking-wide">ePerformances</span>
        </div>
        <div className="absolute bottom-10 left-8 right-8 text-white">
          <h3 className="text-2xl font-semibold leading-tight mb-2">{t('auth.heroTitle')}</h3>
          <p className="text-sm text-white/70 leading-relaxed max-w-md">{t('auth.heroSubtitle')}</p>
        </div>
      </div>

      {/* Right: sign-in form */}
      <div className="flex w-full md:w-1/2 items-center justify-center px-6 py-12">
        <form onSubmit={handleLogin} className="w-full max-w-sm flex flex-col">
          <h2 className="text-3xl font-semibold text-gray-900">{t('auth.signIn')}</h2>
          <p className="text-sm text-gray-500 mt-2">{t('auth.welcomeBack')}</p>

          {error && (
            <div className="mt-5 p-3 rounded-lg bg-red-50 border border-red-100 text-red-600 text-sm">
              {error}
            </div>
          )}

          {/* Email */}
          <label className="text-xs font-medium text-gray-500 mt-6 mb-1.5">{t('auth.email')}</label>
          <div className="flex items-center bg-white border border-gray-300/70 h-11 rounded-lg px-3 gap-2 focus-within:border-indigo-500 transition-colors">
            <Mail size={15} className="text-gray-400" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@default.local"
              autoComplete="email"
              className="bg-transparent outline-none text-sm w-full h-full text-gray-800 placeholder:text-gray-400"
              required
            />
          </div>

          {/* Password */}
          <label className="text-xs font-medium text-gray-500 mt-4 mb-1.5">{t('auth.password')}</label>
          <div className="flex items-center bg-white border border-gray-300/70 h-11 rounded-lg px-3 gap-2 focus-within:border-indigo-500 transition-colors">
            <Lock size={15} className="text-gray-400" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              className="bg-transparent outline-none text-sm w-full h-full text-gray-800 placeholder:text-gray-400"
              required
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="mt-8 h-11 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />}
            {loading ? t('auth.signingIn') : t('auth.signIn')}
          </button>

          {/* Dev credentials hint */}
          <div className="mt-6 p-3 rounded-lg bg-indigo-50/60 border border-indigo-100 text-xs text-indigo-900 leading-relaxed">
            <span className="font-semibold">{t('auth.devCredsLabel')}:</span>{' '}
            <code className="font-mono">admin@default.local</code>{' / '}
            <code className="font-mono">admin123</code>{' '}
            <button
              type="button"
              onClick={useDevCreds}
              className="ml-1 underline text-indigo-600 hover:text-indigo-700"
            >
              {t('auth.useDevCreds')}
            </button>
          </div>

          <p className="text-center text-xs text-gray-400 mt-8">
            &copy; 2026 ePerformances
          </p>
        </form>
      </div>
    </div>
  );
}
