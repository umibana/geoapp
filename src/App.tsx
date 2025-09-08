import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { syncThemeWithLocal } from "./helpers/theme_helpers";
import { useTranslation } from "react-i18next";
import "./localization/i18n";
import { updateAppLanguage } from "./helpers/language_helpers";
import { router } from "./routes/router";
import { RouterProvider } from "@tanstack/react-router";
// import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from 'sonner';

export default function App() {
  const { i18n } = useTranslation();

  useEffect(() => {
    syncThemeWithLocal();
    updateAppLanguage(i18n);
  }, [i18n]);

  return (
    <>
      <RouterProvider router={router} />
      <Toaster position="top-right" />
    </>
  );
}

// const queryClient = new QueryClient();

const root = createRoot(document.getElementById("app")!);
root.render(
  // StrictMode desactivado ya que quería un benchmark sobre las requests
  // <React.StrictMode>
  // Tanstack query venía con el template,
  // Se deja en caso que se necesite, aunque todas las requests deberian ser por IPC y no por renderer
    // <QueryClientProvider client={queryClient}>
      <App />
    // </QueryClientProvider>
  // </React.StrictMode>,
);
