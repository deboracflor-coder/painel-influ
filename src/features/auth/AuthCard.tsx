import type { ReactNode } from 'react';

export function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="auth-page">
      <section className="auth-card panel" aria-labelledby="auth-title">
        <div className="brandmark">
          <span className="brandmark-star" aria-hidden="true">✦</span>
          <div>
            <div className="brandmark-name">Painel Influ</div>
            <div className="brandmark-sub">Social Media Intelligence</div>
          </div>
        </div>
        <h1 id="auth-title">{title}</h1>
        {children}
      </section>
    </main>
  );
}
