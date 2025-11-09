import React from "react";
import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import langs from "@/localization/langs";
import { useTranslation } from "react-i18next";
import { setAppLanguage } from "@/helpers/language_helpers";

export default function LangToggle() {
  const { i18n } = useTranslation();
  const currentLang = i18n.language;

  function handleClick() {
    const currentIndex = langs.findIndex((lang) => lang.key === currentLang);
    const nextIndex = (currentIndex + 1) % langs.length;
    const nextLang = langs[nextIndex];
    setAppLanguage(nextLang.key, i18n);
  }

  return (
    <Button variant="ghost" onClick={handleClick} size="icon" className="h-6 w-6">
      <Languages size={16} />
    </Button>
  );
}
