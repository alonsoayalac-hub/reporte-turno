# Integración Excel ABB TIS → Reporte de Turno

## Estado de esta primera entrega

Esta rama agrega una **importación local de JSON** a la vista Reporte de la aplicación. La importación:
- Lee un archivo JSON generado desde una copia del Excel ABB.
- Valida esquema, intervalo del turno, marcas de tiempo, duplicados y valores.
- Calcula promedio, mínimo, máximo, último valor y cantidad de valores válidos por variable.
- Muestra los resultados en el navegador.
- **No envía ni guarda los datos ABB en Supabase**. El contenido importado se mantiene únicamente en memoria de la pestaña y desaparece al recargar o cerrar la aplicación.

El archivo original `reporte turno TIS 3.xlsm` no se modifica.

## Estructura verificada en el libro

La hoja `DATOS TIS` de la copia examinada utiliza:
- `A5`: inicio de consulta.
- `A6`: término de consulta.
- `C9:C...`: marcas de tiempo de los registros.
- `D5:...`: códigos RIC.
- `D7:...`: descripciones.
- `D8:...`: unidades.
- `D9:...`: valores de proceso.

La macro de exportación incluida en `excel/ABB_Exportar_JSON.bas` usa esas posiciones. Como las plantillas pueden cambiar, validar la estructura en una copia del libro antes de utilizarla.

## Primera prueba: exportación manual

1. En el PC corporativo, abrir una **copia** del libro habilitado para macros.
2. Actualizar las conexiones ABB TIS mediante el procedimiento habitual que ya funciona.
3. Ejecutar la macro existente para el turno correspondiente y comprobar que la consulta terminó.
4. En el editor VBA, importar el módulo `excel/ABB_Exportar_JSON.bas` a esa copia del libro.
5. Ejecutar `ExportarDatosABB_JSON`.
6. Guardar el JSON en una ubicación autorizada por Polpaico.
7. Abrir Reporte de Turno → Reporte → Datos de proceso ABB TIS y seleccionar el JSON.

No habilitar macros ni importar módulos en el archivo original sin seguir el procedimiento de seguridad de la empresa.

## Contrato JSON

El importador espera el esquema `reporte-turno.abb.v1`:

```json
{
  "schema": "reporte-turno.abb.v1",
  "source": "Excel ABB TIS",
  "exportedAt": "2026-11-10T20:05:00",
  "dataSheet": "DATOS TIS",
  "shift": {
    "date": "2026-11-10",
    "type": "dia",
    "start": "2026-11-10T08:00:00",
    "end": "2026-11-10T20:00:00",
    "timezone": "America/Santiago"
  },
  "variables": [
    {
      "ricode": "431_EC1_I1_PV_AVG",
      "description": "Corriente Elevador Nueva",
      "unit": "A"
    }
  ],
  "records": [
    {
      "timestamp": "2026-11-10T08:00:00",
      "values": [52.54]
    }
  ],
  "recordCount": 1
}
```

El arreglo `values` mantiene el mismo orden que `variables`. Se usa un arreglo en lugar de un objeto indexado por RIC para no perder columnas si un libro contiene códigos RIC repetidos. Los valores faltantes se representan como `null`, nunca como cero.

Los intervalos se interpretan como `[inicio, término)`: incluye la hora inicial y excluye la hora final, evitando duplicar el registro de las 08:00 o 20:00 entre turnos consecutivos.

## Decisiones y validaciones pendientes

- Confirmar que `A5`, `A6`, `C9`, filas 5/7/8 y columnas de datos mantienen la misma disposición después de actualizar TIS.
- Probar el módulo VBA en una copia del libro con un turno diurno y otro nocturno.
- Comparar el conteo de registros y estadísticas de una variable con Excel.
- Confirmar con Informática si los datos operacionales pueden almacenarse o transmitirse a Supabase. Hasta recibir autorización, mantener la importación local.
- Determinar si las estadísticas deben calcularse desde todos los valores minuto a minuto o si deben respetar el cálculo/resolución del complemento ABB. La importación de esta primera etapa calcula estadísticas sobre los registros exportados; no vuelve a consultar ni re-muestrea TIS.

## Archivos

- `abb-import.js`: validación y presentación local del JSON.
- `excel/ABB_Exportar_JSON.bas`: macro opcional de exportación para una copia del libro.
- `index.html`: panel de importación dentro de la vista Reporte.
