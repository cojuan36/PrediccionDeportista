# Estimación del rendimiento deportivo con Ritmo

**Analítica de Datos · Unidad 3 · 18 de noviembre de 2026**

Ritmo estima el resultado individual del próximo evento a partir del historial del deportista y las condiciones conocidas antes de competir. La aplicación funciona en Windows en localhost y admite fútbol, baloncesto, tenis, atletismo, powerlifting y deportes personalizados. El historial se registra o importa por CSV y se conserva en el navegador.

## Método y validación temporal

La variable objetivo es una métrica en su unidad original, como tiros por partido o segundos en 100 m libre. El punto de partida es el promedio ponderado de hasta cinco resultados recientes de la misma prueba, posición o categoría. Con suficientes antecedentes, se comparan las condiciones del próximo evento con las de eventos pasados. Ese método se elige cuando reduce el error absoluto medio en pruebas comparables.

Cada prueba histórica usa solo resultados de fechas anteriores. La aplicación requiere tres resultados comparables para estimar y 20 errores históricos para construir el rango. El rango se obtiene con el percentil 80 del error absoluto y se ajusta a los límites de la métrica. [Validación temporal con orígenes móviles](https://otexts.com/fpp3/toolbox.html#tscv)

## Resultados de la prueba

En fútbol, con 30 partidos sintéticos, la estimación pasó de 2 a 5.4 tiros al cambiar de 54 a 87 minutos previstos. En 20 pruebas comparables, el error fue de 0.39 tiros con condiciones similares y 1.59 con el promedio reciente. Al simular el procedimiento completo en 27 eventos, el error medio fue de 0.84 tiros. Para 87 minutos, el rango fue de 3.8 a 7 tiros. En natación se importaron 30 registros sintéticos y se verificó el cálculo en segundos, la persistencia del historial y el cambio de la estimación al modificar el volumen semanal.

Como referencia externa, StatsBomb aporta 1,430 tiros sin penalti del Mundial masculino 2022, con un promedio de 0.0964 xG por tiro en 64 partidos. Esa muestra contextualiza el xG del torneo. El pronóstico se calcula con el historial del perfil. [StatsBomb Open Data](https://github.com/hudl/open-data)

## Relación con la guía de regresión múltiple

En el ejercicio de mínimos cuadrados ordinarios que plantea la guía, agregar predictores puede subir el R² aunque el ajuste adicional sea pequeño. En un ejemplo ilustrativo con 30 observaciones, un modelo con un predictor y R² de 0.78 obtiene R² ajustado de 0.772. Con tres predictores y R² de 0.79, el R² ajustado baja a 0.766. La penalización refleja el costo de añadir dos variables por una mejora reducida en el ajuste.

En Ritmo, la utilidad de las variables se decide por el error en fechas posteriores a las usadas para estimar. Las cifras de la demostración describen el comportamiento del método con datos sintéticos. Para conocer su precisión con un deportista real se necesita su propio historial.
