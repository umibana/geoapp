# Geo API 

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
// Es lo de pandas describe como type
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

### SendFile
Procesa el archivo completo e inserta **dataset en proyecto**.

> **Fuente del archivo**: Se usa `file_path` (app local). Más adelante se puede soportar `bytes`.

**Enums cortos**
- `dataset_type`: `"SAMPLE" | "DRILL_HOLE" | "BLOCK"`
- `column_types` (map): `"CATEGORICAL" | "NUMERIC" | "SKIP"`

**Datos Opcionales**
-  Se considerara los datos opcionales cuando estos NO sean nulos o arreglos/string vacios. Se manejara la lógica desde el backend con su función respectiva
**Request**
```json
{
  // Archivo y tipo
  "file_path": "string",                // o "file_bytes": "bytes"
  "file_name": "string",
  "file_type": "string",                // "text/csv" 
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
  // Es para casos donde vienen incompletos
  "replace_data": [
    { "from": "-000000", "to": "0" },
    { "from": "NULL",     "to": "null" }
  ],

  // Extras: DRILL_HOLE
  "composite_data": true,               //
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

---

## 3) Proyectos (CRUD)

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

## 4) Archivos y Datasets

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
- El tipo de dataset tiene id ya que uso UUID, file_id es la metadata del archivo (tabla)
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

- **UpdateFile**
  Req: `{ "file_id":"string", "name":"string" }`
  Res: `{ "file": File, "success": bool, "error_message":"string" }`

- **RenameFileColumn**
  Renombrar una o más columnas del archivo
  Req: `{ "file_id":"string", "column_renames": { "old_name":"new_name", "col2":"renamed_col2" } }`
  Res: `{ "renamed_columns":["new_name","renamed_col2"], "success": bool, "error_message":"string" }`

### Manipulación de datos del archivo

- **SearchFileData**
  Buscar/filtrar datos en el archivo
  Req: `{ "file_id":"string", "query":"string", "limit": int32, "offset": int32 }`
  Res:
  ```json
  {
    "file_id":"string",
    "total_rows": int32,
    "current_page": int32,
    "data": [{ "fields": { "col":"value" } }],
    "success": bool, "error_message":"string"
  }
  ```

- **ReplaceFileData**
  Reemplazar valores masivamente (e.g., "null" → NaN, 0 → -1)
  Req:
  ```json
  {
    "file_id":"string",
    "replacements": [
      { "from_value":"null", "to_value":"NaN" },
      { "from_value":"0", "to_value":"-1" }
    ],
    "columns": ["string"]  // opcional: columnas específicas
  }
  ```
  Res: `{ "rows_affected": int32, "success": bool, "error_message":"string" }`

- **AddFileColumns**
  Agregar nuevas columnas al archivo
  Req:
  ```json
  {
    "file_id":"string",
    "new_columns": [
      { "column_name":"new_col_A", "values":["0","2","4"] },
      { "column_name":"new_col_B", "values":["1","3","5"] }
    ]
  }
  ```
  Res: `{ "added_columns":["string"], "success": bool, "error_message":"string" }`

- **DuplicateFileColumns**
  Duplicar columnas existentes
  Req: `{ "file_id":"string", "column_names":["col1","col2"] }`
  Res: `{ "duplicated_columns":["col1_copy","col2_copy"], "success": bool, "error_message":"string" }`

- **FilterFileData**
  Filtrar dataset por condiciones (puede crear archivo nuevo)
  Req:
  ```json
  {
    "file_id":"string",
    "column":"col2",
    "operation":"=|!=|>|<|>=|<=|LIKE",
    "value":"1",
    "create_new_file": bool,
    "new_file_name":"string"  // si create_new_file=true
  }
  ```
  Res: `{ "file_id":"string", "total_rows": int32, "success": bool, "error_message":"string" }`

- **DeleteFilePoints**
  Eliminar puntos/filas específicas
  Req: `{ "file_id":"string", "row_indices":[0,5,10] }`
  Res: `{ "rows_deleted": int32, "rows_remaining": int32, "success": bool, "error_message":"string" }`

- **GetFileStatistics**
  Obtener estadísticas globales del archivo
  Req: `{ "file_id":"string", "columns":["string"] }`  // opcional: columnas específicas
  Res:
  ```json
  {
    "statistics": [
      {
        "column_name":"string",
        "data_type":"string",
        "count": int32, "null_count": int32, "unique_count": int32,
        // Para columnas numéricas:
        "mean": double, "std": double, "min": double,
        "q25": double, "q50": double, "q75": double, "max": double,
        // Para columnas categóricas:
        "top_values":["string"], "top_counts":[int32]
      }
    ],
    "success": bool, "error_message":"string"
  }
  ```

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
```json
  Req: `{ "file_id":"string", "column_mappings":[ColumnMapping] }`  
  Res: `{ "dataset": Dataset, "success": bool, "error_message":"string", "processed_rows": int32 }`

```
### Datos del dataset

- **GetDatasetData**  
```json
  Req: `{ "dataset_id":"string", "columns":["string"] ,
  "shape": "string",            // e.g. "circle" | "rect" | "triangle" | ...
  "color": "string",            // nombre de color (o hex)
  "function": "string",         // e.g. "IDW" | "NONE" | "log", por defecto, none
  "bounding_box": [x1, x2, y1, y2]  // filtro opcional, si empty o no viene, no se utiliza. Deberia revisar según size array (.length de 4 implica plano  2d, 6 implica 3D)
  }`  
  Res:
  ```json
  {
    "binary_data":"bytes", //Devuelve el arreglo como bytes, para simplificar transformaciones en front
    "total_count": int32, // Cantidad total de putnos
    "column_count": int32, // cantidad de puntos/datos por columna
  
    "data_boundaries":[
      { "column_name":"string","min_value":double,"max_value":double}
    ] // Los valores min/max de cada columna
  }
  ```

- **GetProjectDatasets**  
  Req: `{ "project_id":"string" }`  
  Res: `{ "datasets":[DatasetInfo] }`  
  **DatasetInfo**
  ```json
  { "id":"string","file_id":"string","file_name":"string","dataset_type":"string",
    "original_filename":"string","total_rows": int32,"created_at": int64,
    "column_mappings":[ColumnMapping] }
  ```

- **DeleteDataset**  
  Req: `{ "dataset_id":"string" }`  
  Res: `{ "success": bool, "error_message":"string", "rows_deleted": int32, "delete_time": double }`

---

## 5) Grid/Block Model

### CreateGridFromDimensions
Crear grid/modelo de bloques desde dimensiones especificadas
**Request**
```json
{
  "project_id":"string",
  "base_dataset_id":"string",  // opcional: dataset base para referencia
  "output_file_name":"string",
  "dimensions": {
    "origin": { "x": double, "y": double, "z": double },
    "blocks": { "x": int32, "y": int32, "z": int32 },       // cantidad de bloques
    "block_size": { "x": double, "y": double, "z": double }  // tamaño de cada bloque
  }
}
```
**Response**
```json
{
  "grid_id":"string",         // ID del archivo de grid creado
  "project_id":"string",
  "status":"created",
  "details":"string",
  "dimensions": {
    "origin": { "x": double, "y": double, "z": double },
    "blocks": { "x": int32, "y": int32, "z": int32 },
    "block_size": { "x": double, "y": double, "z": double }
  },
  "total_blocks": int32,
  "success": bool,
  "error_message":"string"
}
```

### CreateGridFromTemplate
Crear grid desde archivo template
**Request**
```json
{
  "project_id":"string",
  "template_file_content":"bytes",  // Archivo template (CSV/etc)
  "template_file_name":"string",
  "output_file_name":"string",
  "block_size": { "x": double, "y": double, "z": double }  // tamaño de bloques a aplicar
}
```
**Response**
```json
{
  "grid_id":"string",              // ID del archivo de grid creado
  "project_id":"string",
  "creation_method":"fromFileTemplate",
  "template_file_id":"string",     // ID del archivo template guardado
  "status":"success",
  "message":"string",
  "total_blocks": int32,
  "success": bool,
  "error_message":"string"
}
```

---

## 6) Merge de datasets

> Unión por **filas** o por **columnas** entre **dos datasets**.

#### Dejar con nombres más realista, para ver que es cada cosa!
### MergeDatasets
**Request**
```json
{
  "first_dataset_id": "string",
  "second_dataset_id": "string",
  "mode": "BY_ROWS | BY_COLUMNS",

  // Solo si BY_COLUMNS:
  "exclude_columns_first": ["string"],     // opcional: columnas  a excluir de primer dataset
  "exclude_columns_second": ["string"],     // opcional: columnas  a excluir de segundo dataset
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

**Grid desde dimensiones**
```json
{
  "project_id":"proj_123",
  "output_file_name":"grid_modelo_bloques",
  "dimensions": {
    "origin": {"x": 1000.0, "y": 2000.0, "z": 0.0},
    "blocks": {"x": 100, "y": 100, "z": 50},
    "block_size": {"x": 10.0, "y": 10.0, "z": 5.0}
  }
}
```

**Reemplazar valores en archivo**
```json
{
  "file_id":"file_abc",
  "replacements":[
    {"from_value":"null","to_value":"NaN"},
    {"from_value":"-999","to_value":"0"}
  ],
  "columns":["Au_ppm","Cu_ppm"]
}
```

**Filtrar datos y crear nuevo archivo**
```json
{
  "file_id":"file_abc",
  "column":"Au_ppm",
  "operation":">",
  "value":"0.5",
  "create_new_file": true,
  "new_file_name":"high_grade_samples"
}
```

**Agregar columnas calculadas**
```json
{
  "file_id":"file_abc",
  "new_columns":[
    {"column_name":"Au_grade_category","values":["low","high","low","high"]},
    {"column_name":"sample_id","values":["S001","S002","S003","S004"]}
  ]
}
```
