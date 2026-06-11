import { Navigate, Outlet, useLocation } from 'react-router-dom';

export default function RequireAuth() {
  const location = useLocation();
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
  if (!token) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  // Backfill für Bestands-Sessions, die noch keinen Login-Zeitstempel haben.
  if (typeof window !== 'undefined' && !localStorage.getItem('cmc.loginAt')) {
    localStorage.setItem('cmc.loginAt', String(Date.now()));
  }
  return <Outlet />;
}
