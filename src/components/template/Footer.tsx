import React from "react";
import { BackendStatus } from "../BackendStatus";
import LangToggle from "../LangToggle";
import ToggleTheme from "../ToggleTheme";

export default function Footer() {
  return (
    <footer className="text-muted-foreground flex flex-row justify-between border px-1 text-[0.7rem]">
      {/* Se dejan div vacios, se puede cambiar por componentes reales en el futuro */}
      <div></div>
      <div></div>
      <div className="flex flex-row items-center gap-2">
        <LangToggle />
        <ToggleTheme />
        <BackendStatus />
      </div>
    </footer>
  );
}
