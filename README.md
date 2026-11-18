# Ritmo · Estimador deportivo

Aplicación en español para estimar el próximo resultado individual en fútbol, baloncesto, tenis, atletismo, powerlifting y deportes personalizados.

## Iniciar en Windows

Abre PowerShell en esta carpeta y ejecuta el siguiente comando con Python 3 instalado.

```powershell
py -3 iniciar.py
```

Abre [Ritmo en localhost](http://127.0.0.1:8765/) y mantén el servidor activo mientras uses la aplicación. Para detener el servidor iniciado desde PowerShell, presiona **Ctrl+C** en esa ventana. El servidor escucha en el equipo local. Los formularios, la gráfica y las estimaciones funcionan sin conexión a internet.

## Registrar y estimar

1. Selecciona **Nuevo deportista** e indica alias, deporte y métrica inicial. Con **Crear deporte** puedes definir una métrica, unidad, límites, segmento y hasta diez variables numéricas. Por ejemplo, para natación puedes usar «Tiempo en 100 m libre», unidad «s», segmento «Estilo y distancia» y variables «Volumen semanal» y «Días de descanso».
2. En **Historial**, usa **Registrar resultado** o descarga **Plantilla CSV**. Captura solo condiciones que conocías antes de cada evento. Guarda los valores desconocidos como celdas vacías y escribe `0` cuando sea el valor observado.
3. En **Próximo evento**, elige fecha, segmento y las condiciones que conozcas. Se requieren tres resultados de la misma métrica y segmento con fechas anteriores. El pronóstico muestra los antecedentes utilizados, la gráfica, el error cuando hay pruebas históricas y, a partir de 20 pruebas, un rango empírico.
4. Para probar el flujo, elige un deporte inicial y pulsa **Cargar ejemplo**. Cada ejemplo se guarda en un perfil identificado como sintético.

## Historial, CSV y respaldo

Los perfiles, deportes personalizados y resultados se guardan en el almacenamiento local del navegador (`localStorage`, clave `ritmo.1`, origen `http://127.0.0.1:8765`). Usa la misma dirección y el mismo perfil del navegador para volver a verlos. Borrar los datos del sitio elimina ese historial.

Pulsa **Exportar** en el perfil seleccionado para descargar todos sus eventos y métricas. Para restaurarlos en otro navegador, crea el perfil para el mismo deporte y usa **Importar CSV**. En un deporte personalizado, vuelve a crear primero la métrica y las variables en el mismo orden. Conserva aparte las definiciones de tus deportes personalizados.

La plantilla se descarga en UTF-8, separada por punto y coma. La importación también acepta CSV separado por comas y decimales con punto o coma dentro de una celda. Conserva fechas `AAAA-MM-DD` y revisa **Cómo llenar la plantilla CSV** para ver el formato del segmento y las variables. Puedes distinguir varios eventos del mismo día con nombres distintos. Al reimportar, los duplicados exactos se omiten y los conflictos se indican antes de guardar.

## Fuentes

La sección **Fuentes y metodología** incluye cobertura, uso y atribución. Las estimaciones usan resultados personales. La aplicación incorpora un resumen de los 64 partidos del Mundial masculino 2022 con 1,430 tiros sin penalti, 0.0964 xG medio y 0.0529 xG mediano por tiro. El archivo corresponde a la revisión `4b73468fc5b0f1950f9f66fada70ad3a4f9327cb`. Para regenerar el resumen y obtener el logotipo de la fuente, ejecuta `py -3 actualizar_fuente.py` con conexión. [StatsBomb Open Data](https://github.com/hudl/open-data)

Las pruebas temporales siguen el enfoque de orígenes móviles. Los eventos de una misma fecha disponen únicamente de resultados de fechas anteriores. [Forecasting: Principles and Practice, evaluación temporal](https://otexts.com/fpp3/toolbox.html#tscv)

Si tienes Node.js, puedes correr las pruebas de pronóstico y CSV con `node --test pruebas.mjs`.
