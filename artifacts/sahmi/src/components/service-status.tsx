import { useHealthCheck } from '@workspace/api-client-react';

export function ServiceStatus() {
  const { data, isLoading, isError } = useHealthCheck();
  const ok = !isError && data?.status === 'ok';
  const label = isLoading ? 'جاري فحص الخادم' : ok ? 'الخادم شغّال' : 'الخادم ما يرد';
  const dot = isLoading ? 'bg-muted-foreground/50' : ok ? 'bg-primary' : 'bg-destructive';
  return (
    <span role="status" aria-live="polite" data-testid="status-service" className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground">
      <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden="true" />
      {label}
    </span>
  );
}
