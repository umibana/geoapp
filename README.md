# Geospatial Desktop App (Electron + React + gRPC Python)

This repository contains an example of an application with the purpose of handling high data throughput and visualizing the data.


## Tech stack

Due to having to handle big data fetching, the architecture and technologies used in this app differ from the common JSON + REST pattern we see frequently used in webapps.

### [Protocol Buffers](https://protobuf.dev/)

Instead of using JSON for this application we decide to use Protocol Buffers, a serialization protocol developed by Google. (will be referenced as protobufs from now on)
The decision here is mainly made due to protobuf's binary serialization, which can reduce our data that is being transferred over the network almost 3 times and decrease the time spent parsing the data. (**See test runs**)

Of course, using protobufs has its advantages and disavantages:

1. **Schema definition** We need to define the schema in .proto files, for example, for a simple helloWorld function it would look like this:
```proto
syntax = "proto3";

message HelloWorldRequest {
  string message = 1;
}

message HelloWorldResponse {
  string message = 1;
}
service HelloWorldService {
  rpc HelloWorld(HelloWorldRequest) returns (HelloWorldResponse);
  #
  # Other rpc methods...
  #
}
```
In this case, the request and response specifies what is being sent and received, in this case a string.

2. **Code generation** Protocol buffers need to be compiled so we can use it on our code (In this case, we use ```protoc``` but there are alternatives, like ```buf```)
For example, after compiling the above schema using the following command to compile for typescript ``` protoc --plugin=protoc-gen-ts_proto=./node_modules/.bin/protoc-gen-ts_proto --ts_proto_out="./" --ts_proto_opt=lowerCaseServiceMethods=true,snakeToCamel=false --proto_path= ./protos/myproto.proto ``` will generate a file that the language can use to decode and encode the data.


### [gRPC](https://grpc.io/docs/what-is-grpc/introduction/)

To make use of the protocol buffers we use gRPC in this project. This allows to call functions directly from the server as long as we have connection to it.
The current implementation in this project allows us to call functions defined in grpc_server.py from the frontend like this.
```
const response = await window.autoGrpc.deleteProject({ project_id: projectId });

```
In this case, we have a grpc client which we can access using window.autoGrpc -- followed by the method we want to use. Since the protocol buffers requires strict typing, we have access to all the methods defined using intellisense and which parameters it accepts.

### Electron.

Since we need to able to build this application for all Operating Systems and we're looking for quick iteration development, we use Electron (with React) in this application.

The usage of it is very similar to a common web application built with React, with a few changes.

#### IPC

Electron has two processes, the renderer (The React window, where the UI gets displayes) and "main" (Node.JS proccess). To communicate between both processes we have to use inter-process communication. (see preload.ts). Since generating code for each different RPC we want to use, we auto-generate generic IPC calls (check generate-full-stack-optimized.js) which allows us to easily use gRPC.

## Project structure

Both backend and frontend are managed in the same repository, since we need the have both codebases to build the final application. Due to this, we have the following structure (Only the main files/folders will be listed in this structure): 

geoapp/
├── tsconfig.json
├── components.json                    # shadcn/ui configuration
├── forge.config.ts                    # Electron Forge packaging config
│
├── protos/                            # Protobuf definitions
│   ├── main_service.proto             # Main GeospatialService definition
│   └── ****.proto                     # Various other protos
│
├── scripts/                            # Build and generation scripts 
│   └── generate-full-stack-optimized.js # Main script for back/front protobuf generation
│
├── backend/                           # Python gRPC backend
│   ├── grpc_server.py                 # Main server
│   ├── ****.py                        # Various others python functions
│   └── generated/                     # Auto-generated code (from protobuf)
│
└── src/                                # Frontend TypeScript/React code
    ├── App.tsx
    ├── main.ts                        # Electron main process
    ├── preload.ts                     # Electron preload script
    ├── assets/                        # Various assets (fonts,images,etc)
    │
    ├── components/                    #  React components, separated by usage
    │   ├── ****.tsx                   # Main, self-built components
    │   │
    │   ├── template/                  # Components used in the general layout of the app
    │   │   ├── AppSidebar.tsx         # Sidebar that's always visible, add routing from routes.tsx here.
    │   │   ├── Footer.tsx
    │   │   └── NavigationMenu.tsx
    │   │
    │   └── ui/                        # shadcn/ui components (check shadcn docs)
    │
    ├── contexts/                      # React contexts (Only used for window management for now)
    │   └── WindowContext.tsx
    │
    ├── generated/                     # Auto-generated TypeScript protobuf files
    │   ├── ****.ts
    │
    ├── grpc-auto/                     # Auto-generated gRPC system
    │   ├── ****-grpc-client.ts        
    │
    ├── helpers/                       # Pure function utilities (no JSX)
    │   ├── backend_helpers.ts         # Backend process management
    │   ├── theme_helpers.ts           # Theme utilities (provided by shadcn)
    │   ├── language_helpers.ts        # Language utilities (i18n)
    │   ├── window_helpers.ts          # Window utilities (from window management)
    │   │
    │   └── ipc/                       # Electron IPC system (In case we need custom functionality)
    │
    ├── hooks/                         # React hooks 
    │
    ├── localization/                  # Translation using i18n
    │
    ├── pages/                         # App Pages 
    │   ├── HomePage.tsx
    │   └── SecondPage.tsx
    │  
    ├── routes/                        # Tanstack Router routing and config
    │   ├── ****.tsx                   # Various config files
    │   └── routes.tsx                 # Define routes here
    │  
    ├── stores/                        # Zustand state stores
    │
    ├── styles/                        # Global styles (We use Tailwind, so this doesn't get used a lot)
    │   └── global.css
    │
    ├── tests/                         # Test files (TODO)
    │
    ├── types/                         # TypeScript type definitions (for functions,components)
    │   ├── grpc-bytes.d.ts
    │   └── theme-mode.ts
    │
    └── utils/                         # Utility for shadcn (Auto-generated -- should be moved to helpers)
        └── tailwind.ts