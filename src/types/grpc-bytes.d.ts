// Como usamos la mayoria de los tipos generados por protoc, aqui se dejan los tipos para los typed array que se generan en el main process
declare module '../generated/projects.ts' {
    interface GetDatasetDataResponse {
      binary_data_f32?: Float32Array;
    }
}

declare module '../generated/geospatial.ts' { 
    interface GetColumnarDataResponse {
      binary_data_f32?: Float32Array;
    }
  }
  
  export {};