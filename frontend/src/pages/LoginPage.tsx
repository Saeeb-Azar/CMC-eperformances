import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Mail, Lock, Loader2 } from 'lucide-react';
import { api } from '../services/api';
import CartonWrapAnimation from '../components/auth/CartonWrapAnimation';

export default function LoginPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
    setEmail('admin@eperformances.de');
    setPassword('admin123');
  };

  return (
    <div className="min-h-screen w-full flex bg-white text-slate-900 font-[-apple-system,BlinkMacSystemFont,'SF_Pro_Display','SF_Pro_Text',system-ui,Segoe_UI,Roboto,Helvetica,Arial,sans-serif]">
      {/* Left: full-bleed machine scene — 60% of viewport */}
      <div className="hidden lg:block relative lg:w-[60%] overflow-hidden">
        <CartonWrapAnimation />
      </div>

      {/* Right: sign-in form — 40% of viewport, content centered */}
      <div className="w-full lg:w-[40%] flex items-center justify-center px-8 lg:px-14 py-12">
        <form
          onSubmit={handleLogin}
          className="w-full max-w-[400px] flex flex-col"
        >
          <h1
            className="text-[40px] lg:text-[48px] leading-[1.05] font-semibold tracking-[-0.03em] text-slate-900"
          >
            {t('auth.signIn')}
          </h1>
          <p className="mt-3 text-[15px] text-slate-500 leading-relaxed">
            {t('auth.welcomeBack')}
          </p>

          {error && (
            <div className="mt-6 px-4 py-3 rounded-2xl bg-red-50 border border-red-100 text-red-700 text-[13px] leading-relaxed break-words">
              {error}
            </div>
          )}

          {/* Email */}
          <div className="mt-9">
            <label
              htmlFor="email"
              className="block text-[13px] font-medium text-slate-600 mb-2"
            >
              {t('auth.email')}
            </label>
            <div className="group flex items-center h-14 rounded-2xl bg-slate-100/80 border border-transparent px-4 gap-3 transition-all focus-within:bg-white focus-within:border-slate-900/10 focus-within:shadow-[0_0_0_4px_rgba(15,23,42,0.06)]">
              <Mail size={18} className="text-slate-400 shrink-0" />
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@eperformances.de"
                autoComplete="email"
                className="bg-transparent outline-none text-[16px] w-full h-full text-slate-900 placeholder:text-slate-400"
                required
              />
            </div>
          </div>

          {/* Password */}
          <div className="mt-5">
            <label
              htmlFor="password"
              className="block text-[13px] font-medium text-slate-600 mb-2"
            >
              {t('auth.password')}
            </label>
            <div className="group flex items-center h-14 rounded-2xl bg-slate-100/80 border border-transparent px-4 gap-3 transition-all focus-within:bg-white focus-within:border-slate-900/10 focus-within:shadow-[0_0_0_4px_rgba(15,23,42,0.06)]">
              <Lock size={18} className="text-slate-400 shrink-0" />
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="bg-transparent outline-none text-[16px] w-full h-full text-slate-900 placeholder:text-slate-400"
                required
              />
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="mt-9 h-14 rounded-2xl bg-slate-900 hover:bg-slate-800 active:scale-[0.99] text-white text-[16px] font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed shadow-[0_8px_30px_rgba(15,23,42,0.18)]"
          >
            {loading && <Loader2 size={18} className="animate-spin" />}
            {loading ? t('auth.signingIn') : t('auth.signIn')}
          </button>

          {/* Dev credentials callout */}
          <div className="mt-7 rounded-2xl bg-slate-50 border border-slate-100 px-4 py-3 text-[13px] text-slate-600 leading-relaxed">
            <div className="font-medium text-slate-700 mb-1">
              {t('auth.devCredsLabel')}
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <code className="font-mono text-[12.5px] text-slate-700">
                admin@eperformances.de
              </code>
              <span className="text-slate-300">·</span>
              <code className="font-mono text-[12.5px] text-slate-700">admin123</code>
              <button
                type="button"
                onClick={useDevCreds}
                className="ml-auto text-[12.5px] font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
              >
                {t('auth.useDevCreds')} →
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
