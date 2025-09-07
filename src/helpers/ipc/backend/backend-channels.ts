export const BACKEND_CHANNELS = {
  GET_BACKEND_URL: 'backend:get-url',
  HEALTH_CHECK: 'backend:health-check',
  RESTART_BACKEND: 'backend:restart',
  
  // REST API calls through IPC for fair performance comparison
  REST_HEALTH_CHECK: 'backend:rest-health-check',
  REST_HELLO_WORLD: 'backend:rest-hello-world', 
  REST_ECHO_PARAMETER: 'backend:rest-echo-parameter',
  REST_GET_COLUMNAR_DATA: 'backend:rest-get-columnar-data',
  REST_GET_COLUMNAR_DATA_MSGPACK: 'backend:rest-get-columnar-data-msgpack',
  REST_GET_PROJECTS: 'backend:rest-get-projects',
  REST_CREATE_PROJECT: 'backend:rest-create-project',
  REST_GET_PROJECT: 'backend:rest-get-project',
  REST_UPDATE_PROJECT: 'backend:rest-update-project',
  REST_DELETE_PROJECT: 'backend:rest-delete-project',
} as const; 