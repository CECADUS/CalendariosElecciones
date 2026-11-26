"""Prepare the reviewed general undergraduate calendar from the PDFs listed by the US."""
import hashlib
import json
import re
import subprocess
from datetime import date
from html.parser import HTMLParser
from pathlib import Path
from tempfile import NamedTemporaryFile
from urllib.parse import urljoin, urlsplit
from urllib.request import Request, urlopen

INDEX = "https://www.us.es/calendario-academico"
CATALOG = Path(__file__).resolve().parents[1] / "front" / "academic-calendars.json"
MONTHS = "enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre".split()
MONTH = "(?:" + "|".join(MONTHS) + ")"
DAY = r"(\d{1,2})\s*\([lmxjvsd]\)"
PERIOD = re.compile(
    rf"\bdel\s+{DAY}(?:\s+de\s+({MONTH})(?:\s+(?:de\s+)?(\d{{4}}))?)?"
    rf"\s+al\s+{DAY}\s+de\s+({MONTH})\s+(?:de\s+)?(\d{{4}})", re.I,
)


def official_url(value):
    url = urlsplit(value)
    if url.scheme != "https" or url.hostname not in {"us.es", "www.us.es"}:
        raise ValueError(f"Fuente ajena al índice oficial: {value}")
    return value


class CalendarIndex(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = {}
        self.href = None
        self.label = ""

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            self.href = dict(attrs).get("href")
            self.label = ""

    def handle_data(self, data):
        if self.href:
            self.label += data

    def handle_endtag(self, tag):
        if tag != "a" or not self.href:
            return
        match = re.fullmatch(r"Calendario\s+Académico\s+(?:curso\s+)?(\d{4})\s*[-/–]\s*(\d{4}|\d{2})",
                             self.label.strip(), re.I)
        if match:
            last = str(int(match[1]) + 1)
            year = f"{match[1]}-{last}"
            target = official_url(urljoin(INDEX, self.href))
            if match[2] not in {last, last[-2:]} or not urlsplit(target).path.lower().endswith(".pdf"):
                raise ValueError(f"Enlace inesperado para {year}: {target}")
            if self.links.setdefault(year, target) != target:
                raise ValueError(f"Más de una publicación para {year}")
        self.href = None


def download(url):
    request = Request(official_url(url), headers={"User-Agent": "CalendariosElecciones/1.0"})
    with urlopen(request, timeout=40) as response:
        official_url(response.geturl())
        return response.read()


def periods(text, known=()):
    results = []
    for d1, m1, y1, d2, m2, y2 in PERIOD.findall(text.lower()):
        end = date(int(y2), MONTHS.index(m2) + 1, int(d2))
        start = date(int(y1 or y2), MONTHS.index(m1 or m2) + 1, int(d1))
        if not m1 and start > end:
            # La tabla 2025-2026 abrevia el mes en una fila repetida de la segunda convocatoria.
            matches = {a for a, b in known if b == end.isoformat() and int(a[-2:]) == int(d1)}
            if len(matches) == 1:
                start = date.fromisoformat(matches.pop())
        if start > end:
            raise ValueError(f"Intervalo invertido: {text}")
        results.append([start.isoformat(), end.isoformat()])
    return results


def exam_periods(text):
    # pdftotext -layout preserves the three printed columns. In the second
    # session the first two columns are merged into a single undergraduate cell.
    section = re.split(r"caso excepcional\s*\(\d+\)", text, flags=re.I)[1]
    section = re.split(r"(?im)^\s*(?:previa comunicación|\(1\)\s+los centros)", section)[0]
    lines = section.splitlines()
    first = next(line for line in lines if len(re.findall(r"\bDel ", line, re.I)) == 3)
    degree, exceptional, master = [m.start() for m in re.finditer(r"\bDel ", first, re.I)]
    rows = []
    for line in lines:
        if line[degree:master].lstrip().lower().startswith("del "):
            rows.append([])
        if rows:
            limit = exceptional if len(rows) <= 3 else master
            rows[-1].append(line[degree:limit].strip())
    if len(rows) != 6:
        raise ValueError("Ha cambiado la tabla de convocatorias de grado.")
    dates = []
    for row in rows:
        known = [period for parsed in dates for period in parsed]
        dates.append(periods(" ".join(" ".join(row).split()), known))
    if [len(row) for row in dates] != [1, 1, 1, 1, 2, 1]:
        raise ValueError("No se han reconocido todos los intervalos generales de examen.")
    return [list(pair) for pair in sorted({tuple(pair) for row in dates for pair in row})]


def extract_calendar(pdf, year):
    text = subprocess.run(
        ["pdftotext", "-layout", "-enc", "UTF-8", "-", "-"], input=pdf,
        stdout=subprocess.PIPE, check=True,
    ).stdout.decode("utf-8")
    if not re.search(r"curso\s+" + year.replace("-", r"\s*[-/]\s*"), text, re.I):
        raise ValueError(f"El documento no identifica el curso {year}.")
    exam_page = next(p for p in text.split("\f") if "CASO EXCEPCIONAL" in p.upper()
                     and "TERCERA" in p.upper() and "SEGUNDA" in p.upper() and "PRIMERA" in p.upper())
    vacation_page = next(p for p in text.split("\f") if "CALENDARIO DE FIESTAS" in p.upper() and "Navidad:" in p)
    vacations = []
    for label in ["Navidad", "Semana Santa", "Feria de Sevilla", "Periodo estival"]:
        line = re.search(re.escape(label) + r"\s*:\s*(.+)", vacation_page, re.I)
        if not line or len(ranges := periods(line[1])) != 1:
            raise ValueError(f"No se reconoce el periodo de {label}.")
        vacations.extend(ranges)
    holidays = []
    for line in vacation_page.splitlines():
        if not re.search(r"[+•]\s*\d", line):
            continue
        match = re.search(rf"[+•]\s*(\d+) de ({MONTH}) de (\d{{4}})\s*\([LMXJVSD]\)", line, re.I)
        if not match:
            raise ValueError(f"Festivo sin interpretar: {line.strip()}")
        holidays.append(date(int(match[3]), MONTHS.index(match[2].lower()) + 1, int(match[1])).isoformat())
    exams = exam_periods(exam_page)
    first_year, last_year = year.split("-")
    all_dates = holidays + [d for pair in vacations + exams for d in pair]
    if not holidays or any(not first_year + "-09-01" <= day <= last_year + "-08-31" for day in all_dates):
        raise ValueError(f"Fechas no válidas para {year}.")
    return {"holidays": holidays, "vacations": vacations, "exams": exams}


def main():
    index = CalendarIndex()
    index.feed(download(INDEX).decode("utf-8"))
    if not index.links:
        raise ValueError("No se han encontrado calendarios en el índice oficial.")
    original = CATALOG.read_text(encoding="utf-8")
    catalog = json.loads(original)
    for year, url in index.links.items():
        pdf = download(url)
        digest = hashlib.sha256(pdf).hexdigest()
        previous = catalog.get(year, {})
        source = previous.get("source", url) if previous.get("sha256") == digest else url
        catalog[year] = {"source": source, "pdf": url, "sha256": digest, **extract_calendar(pdf, year)}
    # Write only after all listed courses have been parsed and validated.
    updated = json.dumps(dict(sorted(catalog.items())), ensure_ascii=False, indent=2) + "\n"
    if updated == original:
        return
    with NamedTemporaryFile(dir=CATALOG.parent, delete=False) as output:
        temporary = Path(output.name)
    try:
        temporary.write_bytes(updated.encode("utf-8"))
        temporary.replace(CATALOG)
    finally:
        temporary.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
