import React from "react";
import { BackendStatus } from "../BackendStatus";

export default function Footer() {
  return (
    <footer className="flex flex-row justify-between px-1 border text-[0.7rem] text-muted-foreground">
      {/* Se dejan div vacios, se puede cambiar por componentes reales en el futuro */}
      <div/>
      <div/>
      <BackendStatus/>
    </footer>
  );
}
