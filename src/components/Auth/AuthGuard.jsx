import { Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

export default function AuthGuard({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="flex gap-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-2.5 h-2.5 rounded-full bg-indigo-500"
              style={{ animation: `bounce-dot 1.4s ease-in-out ${i * 0.16}s infinite both` }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
