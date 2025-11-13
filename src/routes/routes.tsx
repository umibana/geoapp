import { createRoute } from "@tanstack/react-router";
import { RootRoute } from "./__root";
import SecondPage from "@/pages/SecondPage";
import ProjectWorkflow from "@/components/ProjectWorkflow";
import { ChartMosaicExample } from "@/components/mosaic";
import { GeoVizViewer } from "@/components/geo-viz/GeovizView";

// TODO: Steps to add a new route:
// 1. Create a new page component in the '../pages/' directory (e.g., NewPage.tsx)
// 2. Import the new page component at the top of this file
// 3. Define a new route for the page using createRoute()
// 4. Add the new route to the routeTree in RootRoute.addChildren([...])
// 5. Add a new Link in the navigation section of RootRoute if needed

// Example of adding a new route:
// 1. Create '../pages/NewPage.tsx'
// 2. Import: import NewPage from '../pages/NewPage';
// 3. Define route:
//    const NewRoute = createRoute({
//      getParentRoute: () => RootRoute,
//      path: '/new',
//      component: NewPage,
//    });
// 4. Add to routeTree: RootRoute.addChildren([HomeRoute, NewRoute, ...])
// 5. Add Link: <Link to="/new">New Page</Link>

export const HomeRoute = createRoute({
  getParentRoute: () => RootRoute,
  path: "/",
  component:ProjectWorkflow, 
});

export const SecondPageRoute = createRoute({
  getParentRoute: () => RootRoute,
  path: "/second-page",
  component: SecondPage,
});

export const ProjectsRoute = createRoute({
  getParentRoute: () => RootRoute,
  path: "/projects",
  component: ProjectWorkflow,
});

export const ChartMosaicExampleRoute = createRoute({
  getParentRoute: () => RootRoute,
  path: "/chart-mosaic-example",
  component: ChartMosaicExample,
});

export const EDA3DRoute = createRoute({
  getParentRoute: () => RootRoute,
  path: "/3d-eda",
  component: GeoVizViewer,
});
export const rootTree = RootRoute.addChildren([HomeRoute, SecondPageRoute, ProjectsRoute, ChartMosaicExampleRoute, EDA3DRoute]);
