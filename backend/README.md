# Geo API 

> **Objetivo:** Alinear entradas/salidas y tipos a alto nivel (sin `.proto`).  
> **Tipos base:** `string`, `int32`, `int64`, `double`, `bool`, `bytes`, `map`, `repeated`.  
> **Tiempos:** Unix **ms** (`int64`).  
> **Convención binaria:** buffers en **row-major** y `Float32` por defecto.

---

## 0) Salud

### HealthCheck
**Request**
```json
{}
```
**Response**
```json
{ "healthy": true, "version": "string", "status": { "any": "string" } }
```

---

## 1) Análisis & envío de archivos (CSV/XLSX)

### Modelos de apoyo

**ColumnStats** (numéricas)
```json
{ "count": double, "mean": double, "std": double, "min": double,
  "q25": double, "q50": double, "q75": double, "max": double,
  "null_count": int32, "unique_count": int32 }
```

**ColumnInfo**
```json
{ "name": "string", "type": "string",           // "number" | "string"
  "is_required": bool,                          // true si es ID/X/Y/Z
  "stats": ColumnStats,                         // solo si numérica
  "sample_values": ["string"] }
```

### AnalyzeCsv
Analiza primeras filas y detecta columnas.
**Request**
```json
{ "file_path": "string", "file_name": "string" }
```
**Response**
```json
{
  "columns": [ColumnInfo],
  "auto_detected_mapping": { "id":"ID_COLUMN", "x":"X_COL", "y":"Y_COL", "z":"Z_COL" },
  "success": bool, "error_message": "string",
  "total_rows": int32, "total_columns": int32,
  "file_size_mb": double, "encoding": "string",
  "numeric_columns": ["string"], "categorical_columns": ["string"]
}
```

### SendFile
Procesa el archivo completo e inserta **dataset en proyecto**.

> **Fuente del archivo**: hoy usamos `file_path` (app local). Más adelante se puede soportar `bytes`.

**Enums cortos**
- `dataset_type`: `"SAMPLE" | "DRILL_HOLE" | "BLOCK"`
- `column_types` (map): `"CATEGORICAL" | "NUMERIC" | "SKIP"`

**Request**
```json
{
  // Archivo y tipo
  "file_path": "string",                // ó "file_bytes": "bytes"
  "file_name": "string",
  "file_type": "string",                // "text/csv" | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  "dataset_type": "SAMPLE|DRILL_HOLE|BLOCK",
  "dataset_name": "string",

  // Lectura / parsing
  "skipRows": 0,                        // default 0
  "skipColumns": ["string"],            // opcional
  "column_types": { "Header":"CATEGORICAL|NUMERIC|SKIP" },

  // Mapeo de coordenadas / ID
  "x_variable": "string",
  "y_variable": "string",
  "z_variable": "string",               // opcional
  "id_variable": "string",              // opcional
  "depth_variable": "string",           // opcional (drill)

  // Normalización / reemplazos (e.g. "-000000" -> "0", "NULL" -> null)
  "replace_data": [
    { "from": "-000000", "to": "0" },
    { "from": "NULL",     "to": "null" }
  ],

  // Extras: DRILL_HOLE
  "composite_data": true,               // aplicar compositado
  "composite_distance": 2,              // metros
  "collar": [                           // opcional
    { "id":"string", "x":0.0, "y":0.0, "z":0.0, "depth":120.0 }
  ],
  "survey": [                           // opcional
    { "id":"string", "at":10.0, "az":180.0, "dip":-60.0 }
  ],

  // Extras: BLOCK
  "block_settings": { "x":10.0, "y":10.0, "z":5.0 } // tamaño/step de celda
}
```
**Response**
```json
{
  "total_rows_processed": int32,
  "valid_rows": int32,
  "invalid_rows": int32,
  "errors": ["string"],
  "success": bool,
  "processing_time": "string"
}
```

> **Notas**  
> • `replace_data.to = "null"` implica nulos reales.  
> • `SKIP` descarta la columna al ingerir.  
> • Para **DRILL_HOLE**, `collar` y `survey` son opcionales; si no vienen, se infieren del archivo si es posible.  
> • Para **BLOCK**, confirmar si `block_settings` son **tamaños de voxel** o **paso de grilla** (por ahora “tamaño”).

---

## 2) Acceso “chunked” a datos cargados

**CsvDataRow**
```json
{
  "x": double, "y": double, "z": double,
  "id": "string",
  "metrics": { "key": double }, // numéricas
  "attrs":   { "key": "string" } // categóricas
}
```

### GetLoadedDataChunk
**Request**
```json
{ "offset": int32, "limit": int32 }
```
**Response**
```json
{
  "rows": [CsvDataRow],
  "total_rows": int32,
  "is_complete": bool,
  "next_offset": int32,
  "available_metric_keys": ["string"]
}
```

---

## 3) Visualización (columnar / Float32Array)

**Bounds**
```json
{ "max_value": double, "min_value": double }
```

### GetColumnarData
> Extrae 3/4/5 columnas; soporta **shape/color** para categóricas, **function** (ej. IDW) y **bounding_box**.

**Request**
```json
{
  "data_types": ["string"],     // columnas a extraer (orden en buffer)
  "max_points": int32,          // límite de puntos

  // Visual / semántica
  "shape": "string",            // e.g. "circle" | "rect" | "triangle" | ...
  "color": "string",            // nombre de columna categórica para color (o palette id)
  "function": "string",         // e.g. "IDW" | "NONE" | "log" | ...

  // Recorte 2D opcional
  "bounding_box": [x1, x2, y1, y2]
}
```
**Response**
```json
{
  "binary_data": "bytes",       // Float32Array crudo (row-major)
  "data_length": int32,         // elementos del array
  "total_count": int32,         // puntos totales previos al límite
  "generated_at": double,       // timestamp
  "bounds": { "col": { "max_value": double, "min_value": double } }
}
```

---

## 4) Proyectos (CRUD)

**Project**
```json
{ "id":"string", "name":"string", "description":"string",
  "created_at": int64, "updated_at": int64 }
```

- **CreateProject**  
  Req: `{ "name":"string", "description":"string" }`  
  Res: `{ "project": Project, "success": bool, "error_message":"string" }`

- **GetProjects**  
  Req: `{ "limit": int32, "offset": int32 }`  
  Res: `{ "projects": [Project], "total_count": int32 }`

- **GetProject**  
  Req: `{ "project_id":"string" }`  
  Res: `{ "project": Project, "success": bool, "error_message":"string" }`

- **UpdateProject**  
  Req: `{ "project_id":"string", "name":"string", "description":"string" }`  
  Res: `{ "project": Project, "success": bool, "error_message":"string" }`

- **DeleteProject**  
  Req: `{ "project_id":"string" }`  
  Res: `{ "success": bool, "error_message":"string" }`

---

## 5) Archivos y Datasets

**Enums**
- `DatasetType`: `UNSPECIFIED | SAMPLE | DRILL_HOLE | BLOCK`
- `ColumnType`: `UNSPECIFIED | NUMERIC | CATEGORICAL | SKIP`

**File**
```json
{ "id":"string","project_id":"string","name":"string",
  "dataset_type":"enum","original_filename":"string",
  "file_size": int64, "created_at": int64 }
```

**ColumnMapping**
```json
{ "column_name":"string", "column_type":"enum",
  "mapped_field":"string", "is_coordinate": bool } // "x"|"y"|"z" o custom
```

**Dataset**
```json
{ "id":"string","file_id":"string","total_rows": int32,"current_page": int32,
  "column_mappings":[ColumnMapping],"created_at": int64 }
```

### Archivos
- **CreateFile**  
  Req: `{ "project_id":"string","name":"string","dataset_type":"enum","original_filename":"string","file_content":"bytes" }`  
  Res: `{ "file": File, "success": bool, "error_message":"string" }`

- **GetProjectFiles**  
  Req: `{ "project_id":"string" }`  
  Res: `{ "files":[File] }`

- **DeleteFile**  
  Req: `{ "file_id":"string" }`  
  Res: `{ "success": bool, "error_message":"string" }`

### Análisis y procesamiento ligados a proyecto
- **AnalyzeCsvForProject**  
  Req: `{ "file_id":"string" }`  
  Res:
  ```json
  {
    "headers":["string"],
    "preview_rows":[{"values":["string"]}],
    "suggested_types":["enum"],
    "suggested_mappings": { "col":"x|y|z|id|..." },
    "total_rows": int32, "success": bool, "error_message":"string"
  }
  ```

- **ProcessDataset**  
  Req: `{ "file_id":"string", "column_mappings":[ColumnMapping] }`  
  Res: `{ "dataset": Dataset, "success": bool, "error_message":"string", "processed_rows": int32 }`

### Datos del dataset
- **GetDatasetData**  
  Req: `{ "dataset_id":"string", "columns":["string"] }`  
  Res:
  ```json
  {
    "binary_data":"bytes",
    "data_length": int32,
    "total_count": int32,
    "data_boundaries":[
      { "column_name":"string","min_value":double,"max_value":double,"valid_count":int32 }
    ]
  }
  ```

- **GetProjectDatasets**  
  Req: `{ "project_id":"string" }`  
  Res: `{ "datasets":[DatasetInfo] }`  
  **DatasetInfo**
  ```json
  { "id":"string","file_id":"string","file_name":"string","dataset_type": int32,
    "original_filename":"string","total_rows": int32,"created_at": int64,
    "column_mappings":[ColumnMapping] }
  ```

- **DeleteDataset**  
  Req: `{ "dataset_id":"string" }`  
  Res: `{ "success": bool, "error_message":"string", "rows_deleted": int32, "delete_time": double }`

---

## 6) Merge de datasets

> Unión por **filas** o por **columnas** entre **dos datasets**.

#### Dejar con nombres más realista, para ver que es cada cosa!
### MergeDatasets
**Request**
```json
{
  "left_dataset_id":number,
  "right_dataset_id": "string",
  "mode": "BY_ROWS | BY_COLUMNS",

  // Solo si BY_COLUMNS:
  "exclude_columns": ["string"],     // opcional: columnas del RIGHT a excluir
  "output_file": "string"            // opcional: nombre/alias de salida
}
```
**Response**
```json
{
  "dataset_id": "string",            // id del dataset resultante (si se persiste)
  "rows_merged": int32,
  "columns_merged": int32,
  "warnings": ["string"]
}
```
---
> Inserción de columnar
### Dejar definida, por ahora project_id,column_name, data (array)

## 7) Ejemplos rápidos

**SendFile (DRILL_HOLE con compositado)**
```json
{
  "file_path":"./uploads/sondeos.xlsx",
  "file_name":"sondeos.xlsx",
  "file_type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "dataset_type":"DRILL_HOLE",
  "dataset_name":"Campaña DH-2025",
  "skipRows": 1,
  "column_types": { "Litho":"CATEGORICAL", "Au_ppm":"NUMERIC", "tmp":"SKIP" },
  "x_variable":"Easting", "y_variable":"Northing", "z_variable":"RL",
  "id_variable":"HoleID", "depth_variable":"Depth",
  "replace_data":[{"from":"-000000","to":"0"},{"from":"NULL","to":"null"}],
  "composite_data": true,
  "composite_distance": 2,
  "collar":[{"id":"DH1","x":1,"y":2,"z":3,"depth":120}],
  "survey":[{"id":"DH1","at":10,"az":180,"dip":-60}]
}
```

**Merge por columnas (excluyendo algunas)**
```json
{
  "left_dataset_id":"d_left",
  "right_dataset_id":"d_right",
  "mode":"BY_COLUMNS",
  "exclude_columns":["tmp","debug_flag"],
  "output_file":"left_plus_right_clean"
}
```

**GetColumnarData con corte & estilo**
```json
{
  "data_types":["X","Y","Au_ppm","Litho"],
  "max_points": 200000,
  "shape":"circle",
  "color":"Litho",
  "function":"IDW",
  "bounding_box":[300000,305000,6410000,6415000]
}
```
