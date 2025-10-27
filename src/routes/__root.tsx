import React from "react";
import BaseLayout from "@/layouts/BaseLayout";
import { Outlet, createRootRoute } from "@tanstack/react-router";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

export const RootRoute = createRootRoute({
  component: Root,
});

function Root() {
  return (
    <DndProvider backend={HTML5Backend}>
      <BaseLayout>
        <Outlet />
      </BaseLayout>
    </DndProvider>
  );
}
