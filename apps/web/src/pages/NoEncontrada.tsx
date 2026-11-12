import { Link } from 'react-router';

export function NoEncontrada() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 px-4 py-12">
      <h1 className="text-2xl font-semibold text-fg">No encontramos esta página</h1>
      <Link className="text-brand underline" to="/">
        Volver al inicio
      </Link>
    </main>
  );
}
