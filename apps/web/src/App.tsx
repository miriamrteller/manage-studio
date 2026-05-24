import { QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { RouterProvider } from "react-router-dom";
import { useThemeInjection } from "./hooks/useThemeInjection";
import i18n from "./i18n/i18n";
import queryClient from "./lib/query-client";
import router from "./router";

function ThemeInjector() {
  useThemeInjection();
  return null;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <ErrorBoundary>
          <ThemeInjector />
          <RouterProvider router={router} />
        </ErrorBoundary>
      </I18nextProvider>
    </QueryClientProvider>
  );
}
