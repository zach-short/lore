import { DataError } from "@/components/data-state";
import { View } from "@/tw";

import type { ErrorBoundaryProps } from "expo-router";

/** Per-route render-error boundary (thrown errors; query failures render
    DataError inline instead). Mounted per route, never on the root layout. */
export function RouteError({ error, retry }: ErrorBoundaryProps) {
  return (
    <View className="flex-1 bg-bg">
      <DataError message={error.message} onRetry={() => void retry()} />
    </View>
  );
}
