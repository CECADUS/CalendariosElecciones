# CalendariosElecciones

Aplicación web estática para calcular calendarios electorales de delegación de grupo, de curso y de Consejo de Departamento, mostrar las fechas en pantalla y descargar las plantillas PDF ya rellenadas.

## Estructura

- `front/`: aplicación web lista para publicarse en GitHub Pages.
- `front/templates/`: plantillas PDF simples y ampliadas para curso y grupo, además de la plantilla de Consejo de Departamento.
- `front/assets/`: recursos visuales, incluido el logotipo de CECADUS.
- `front/fonts/`: tipografías incrustadas para el relleno del PDF.
- `.github/workflows/deploy-pages.yml`: flujo CI/CD para validación y despliegue.

## Funcionalidad

- Elección entre calendario de delegación de grupo, de curso y de Consejo de Departamento.
- Cálculo con plazos mínimos o máximos.
- Soporte para entre 1 y 5 fechas de votación.
- Autorrelleno de nuevas fechas de votación con la fecha mínima legal y, en jornadas adicionales, con los días hábiles posteriores.
- Gestión de días inhábiles adicionales mediante fechas sueltas y rangos.
- Validación específica para Consejo de Departamento: una única jornada de votación y plantilla PDF propia.
- Visualización del calendario solo después de pulsar `Calcular`.
- Generación del PDF rellenado con la plantilla adecuada según haya una o varias votaciones.

## Desarrollo local

La aplicación es completamente estática. Para probarla en local conviene servir `front/` con cualquier servidor HTTP sencillo, ya que la carga de PDFs, fuentes y módulos JS no está pensada para abrirse directamente como archivo local.

Para ejecutar las pruebas de cálculo:

```bash
node --experimental-default-type=module tests/calculator.test.mjs
```

## Despliegue en GitHub Pages

El repositorio incluye el workflow [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml), con este comportamiento:

1. En cada pull request hacia `main` o `master`, ejecuta la validación de los scripts del frontend.
2. Cuando esa pull request se mergea, GitHub genera un `push` sobre `main` o `master`.
3. Ese `push` vuelve a validar el frontend, empaqueta `front/` y publica la web en GitHub Pages.

Además, `front/.nojekyll` fuerza a GitHub Pages a tratar el contenido como sitio estático puro.

Para activarlo en GitHub:

1. Sube el repositorio con la carpeta `front/`, el archivo `front/.nojekyll` y el workflow.
2. En `Settings > Pages`, selecciona `GitHub Actions` como fuente de despliegue.
3. Si GitHub sigue intentando construir `docs/` con Jekyll, la configuración antigua de Pages sigue activa y hay que cambiarla manualmente a `GitHub Actions`.

## Días inhábiles del calendario académico

La aplicación sigue calculando días inhábiles a partir de sábados, domingos y de los rangos que se introduzcan manualmente en la interfaz. Si se quieren precargar periodos no lectivos por curso académico, la extensión prevista está encapsulada en `front/calculator.js` dentro de `ACADEMIC_NON_TEACHING_PERIODS`.

## Referencias normativas

- [RGREUS](https://www.us.es/sites/default/files/2019-05/rgreus_0.pdf)
- [REOREUS](https://www.us.es/sites/default/files/secretaria-general/consulta-us/2022_05_Reglamento_Elecciones_Organos_Representacion_Estudiantil_US.pdf)

## Licencia

Este repositorio distribuye el código bajo la licencia indicada en [`LICENSE`](LICENSE).

