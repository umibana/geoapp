import i18n from "i18next";
import { initReactI18next } from "react-i18next";

i18n.use(initReactI18next).init({
  fallbackLng: "en",
  resources: {
    en: {
      translation: {
        appName: "Geospatial Application",
        titleHomePage: "Home Page",
        titleSecondPage: "Second Page",
      },
    },
    es: {
      translation: {
        appName: "Aplicación Geoespacial",
        titleHomePage: "Página Inicial",
        titleSecondPage: "Segunda Página",
      },
    },
  },
});
