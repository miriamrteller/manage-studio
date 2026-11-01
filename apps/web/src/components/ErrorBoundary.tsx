import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { isMonitoringEnabled, reportError } from '@/lib/monitoring';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

function AppCrashFallback({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <main className="mx-auto max-w-xl space-y-4 p-8 text-center" role="alert">
      <h1 className="text-2xl font-bold text-foreground">{t('errors.app_crashed_title')}</h1>
      <p className="text-muted-foreground">{t('errors.app_crashed_description')}</p>
      {isMonitoringEnabled() && (
        <p className="text-sm text-muted-foreground">{t('errors.app_crashed_reported')}</p>
      )}
      <div className="flex justify-center gap-2">
        <Button type="button" variant="primary" onClick={onRetry}>
          {t('common.try_again')}
        </Button>
        <Button type="button" variant="outline" onClick={() => window.location.reload()}>
          {t('errors.reload_page')}
        </Button>
      </div>
    </main>
  );
}

/** Last-resort boundary around the whole app. Page-level crashes are caught by RouteErrorFallback first. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
    reportError(error, { boundary: 'app' });
  }

  render() {
    if (this.state.hasError) {
      return <AppCrashFallback onRetry={() => this.setState({ hasError: false })} />;
    }
    return this.props.children;
  }
}
