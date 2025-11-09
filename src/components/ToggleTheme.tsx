import { Moon } from "lucide-react";
import React from "react";
import { Button } from "@/components/ui/button";
import { toggleTheme } from "@/helpers/theme_helpers";

export default function ToggleTheme() {
  return (
    <Button variant="ghost" onClick={toggleTheme} size="icon" className="h-6 w-6 ">
      <Moon size={16} />
    </Button>
  );
}
