# CalendariosElecciones

Aplicación web estática para calcular calendarios electorales de Delegación de Grupo, de Curso y de Consejo de Departamento, mostrar las fechas en pantalla y descargar las plantillas PDF ya rellenadas.

## Estructura

- `front/`: aplicación web lista para publicarse en GitHub Pages.
- `front/templates/`: plantillas PDF simples y ampliadas para Curso y Grupo, además de la plantilla de Consejo de Departamento.
- `front/assets/`: recursos visuales, incluido el logotipo de CECADUS.
- `front/fonts/`: tipografías incrustadas para el relleno del PDF.
- `.github/workflows/deploy-pages.yml`: flujo CI/CD para validación y despliegue.

## Funcionalidad

- Elección entre calendario de Delegación de Grupo, de Curso y de Consejo de Departamento.
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

## Calendario general de grado de la US

La fecha de convocatoria selecciona automáticamente el curso. Las fechas proceden de la columna «Caso general» de grado y de la relación de festivos y vacaciones de la Universidad de Sevilla. El formulario enlaza la publicación utilizada. Los días adicionales introducidos por la delegación se aplican a todos los trámites.

Navidad, Semana Santa, Feria y verano se excluyen por completo. En los periodos generales de examen de primera y segunda convocatoria se pueden publicar censos, candidaturas y resultados, y resolver reclamaciones. Las presentaciones, el plazo para reclamar, la campaña y el voto cuentan días hábiles electorales. La tercera convocatoria sigue el régimen ordinario.

En Consejo de Departamento, la campaña mínima se cierra al tercer día hábil. En máximos se amplía dentro del tramo disponible hasta quince días naturales. El voto anticipado tiene sus propios plazos. El formulario y el PDF indican los tramos efectivos cuando los exámenes o las vacaciones interrumpen la participación.

### Actualización anual

El catálogo revisado se guarda en [front/academic-calendars.json](front/academic-calendars.json). Cada lunes, el [flujo de actualización](.github/workflows/academic-calendars.yml) consulta el [índice oficial](https://www.us.es/calendario-academico), descarga los PDF anunciados y compara sus fechas y huellas SHA-256. Conserva los cursos históricos. Si hay cambios, prepara una solicitud de incorporación con los datos extraídos. La aprobación y fusión publica la actualización mediante el despliegue habitual. Para que el flujo pueda abrir esa solicitud, GitHub debe permitir que Actions cree pull requests en el repositorio.

El cálculo usa la copia incluida en la web. Si falta un curso necesario, incluso para resolver reclamaciones después de la votación, se indica «Calendario oficial pendiente» y se espera a incorporar la publicación. Si la US modifica el formato del PDF y el importador no puede interpretar las tablas, el flujo señala el error y conserva la última copia revisada.

El flujo también se puede lanzar desde Actions. Para ejecutar el importador en local se necesita Python 3.10 o posterior y `pdftotext` de Poppler en el PATH.

```bash
python scripts/update_academic_calendars.py
```

## Referencias normativas

- [RGREUS](https://www.us.es/sites/default/files/2019-05/rgreus_0.pdf)
- [REOREUS](https://www.us.es/sites/default/files/secretaria-general/consulta-us/2022_05_Reglamento_Elecciones_Organos_Representacion_Estudiantil_US.pdf)

## Licencia

Este repositorio distribuye el código bajo la licencia indicada en [`LICENSE`](LICENSE).

