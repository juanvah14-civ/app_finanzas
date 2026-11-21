# Mis Finanzas (versión 0.1)

App web instalable que funciona sin internet. No usa servidores: los datos se guardan en cada dispositivo.

## Qué hace
- Saldo inicial y saldo actual que se actualiza con cada ingreso o egreso.
- 16 categorías predefinidas (editables) y las que quieras crear.
- Límite mensual por categoría, con aviso al llegar al 80 % (configurable) y al pasarte. El formulario te avisa antes de guardar.
- Gráficos: gasto por categoría con su límite, ingresos y egresos de los últimos 6 meses, evolución del saldo.
- Respaldo: descargar / cargar (une los datos, gana el registro más reciente) y exportar CSV para Excel.

## Archivos
index.html, styles.css, app.js (lógica), charts.js (gráficos), db.js (almacenamiento), sw.js (modo sin internet), manifest.webmanifest, icons/.

## Para probarla en la computadora
En esta carpeta: `python3 -m http.server 8000` y abrir http://localhost:8000

## En el iPhone
Debe estar publicada en una dirección https (por ejemplo GitHub Pages). Abrirla en Safari → Compartir → "Agregar a pantalla de inicio".
