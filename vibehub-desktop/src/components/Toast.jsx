import React from 'react';
import { useStore } from '../store';

export default function Toast() {
  const { toasts, removeToast } = useStore();
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-3 right-3 z-50 flex flex-col gap-1.5 max-w-56">
      {toasts.map(t => (
        <div key={t.id}
          className="glass-card px-3 py-2 text-xs cursor-pointer toast-enter shadow-lg"
          onClick={() => removeToast(t.id)}
          style={{ borderLeft: `3px solid ${
            t.type === 'success' ? '#34C759' : t.type === 'error' ? '#FF3B30' : t.type === 'warning' ? '#FF9500' : '#007AFF'
          }` }}>
          {t.message}
        </div>
      ))}
    </div>
  );
}
