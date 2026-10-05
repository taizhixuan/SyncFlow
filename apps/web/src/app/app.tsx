import { AppErrorBoundary } from './error-boundary';
import { AppProviders } from './providers';
import { AppRouter } from './router';

export function App(): JSX.Element {
  return (
    <AppErrorBoundary>
      <AppProviders>
        <AppRouter />
      </AppProviders>
    </AppErrorBoundary>
  );
}
