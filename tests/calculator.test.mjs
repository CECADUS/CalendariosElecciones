process.env.TZ = "Europe/Madrid";

import assert from "node:assert/strict";

const {
  addBusinessDays,
  calculateSchedule,
  countBusinessDaysInclusive,
  formatDateInput,
  parseDateInput,
  parseExcludedDates,
  suggestNextVotingDate,
} = await import("../front/calculator.js");
const { buildDownloadFilename } = await import("../front/pdf-generator.js");

function eventById(schedule, id) {
  const event = schedule.events.find((candidate) => candidate.id === id);
  assert.ok(event, `No se ha encontrado el evento ${id}.`);
  return event;
}

function asInput(date) {
  return formatDateInput(date);
}

let failures = 0;

function runTest(name, callback) {
  try {
    callback();
    console.log(`ok - ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`not ok - ${name}`);
    console.error(error);
  }
}

runTest("addBusinessDays respeta rangos inhabiles manuales", () => {
  const excluded = parseExcludedDates([
    { kind: "range", start: "24/12/2025", end: "06/01/2026" },
  ]);
  const fromDate = parseDateInput("23/12/2025");
  const nextBusiness = addBusinessDays(fromDate, 1, excluded.set);

  assert.equal(asInput(nextBusiness), "07/01/2026");
  assert.equal(
    countBusinessDaysInclusive(parseDateInput("23/12/2025"), parseDateInput("07/01/2026"), excluded.set),
    2,
  );
});

runTest("calcula el calendario minimo de Consejo de Departamento", () => {
  const schedule = calculateSchedule({
    type: "department",
    convocationDate: "03/11/2025",
    electionDatesInput: ["02/12/2025"],
    academicYear: "2025-2026",
    calculationMode: "minimum",
    excludedDatesInput: [],
  });

  assert.equal(schedule.valid, true);
  assert.equal(asInput(eventById(schedule, "provisional_census_publication").startDate), "04/11/2025");
  assert.equal(eventById(schedule, "candidacy_submission_period").pdfValue, "14/11/25 al 18/11/25");
  assert.equal(asInput(eventById(schedule, "definitive_candidatures_proclamation").startDate), "25/11/2025");
  assert.equal(eventById(schedule, "campaign_electoral").pdfValue, "25/11/25 al 01/12/25");
  assert.equal(eventById(schedule, "early_voting").pdfValue, "27/11/25 al 01/12/25");
  assert.equal(asInput(eventById(schedule, "mesa_appointment").startDate), "26/11/2025");
  assert.equal(asInput(eventById(schedule, "provisional_elected_proclamation").startDate), "03/12/2025");
  assert.equal(eventById(schedule, "results_claim_period").pdfValue, "04/12/25 al 09/12/25");
  assert.equal(asInput(eventById(schedule, "final_elected_proclamation").startDate), "10/12/2025");
});

runTest("calcula el calendario maximo de Consejo de Departamento", () => {
  const schedule = calculateSchedule({
    type: "department",
    convocationDate: "04/12/2025",
    electionDatesInput: ["30/01/2026"],
    academicYear: "2025-2026",
    calculationMode: "maximum",
    excludedDatesInput: [],
  });

  assert.equal(schedule.valid, true);
  assert.equal(asInput(eventById(schedule, "provisional_census_publication").startDate), "05/12/2025");
  assert.equal(eventById(schedule, "candidacy_submission_period").pdfValue, "22/12/25 al 30/12/25");
  assert.equal(asInput(eventById(schedule, "definitive_candidatures_proclamation").startDate), "19/01/2026");
  assert.equal(eventById(schedule, "campaign_electoral").pdfValue, "19/01/26 al 29/01/26");
  assert.equal(eventById(schedule, "early_voting").pdfValue, "21/01/26 al 29/01/26");
  assert.equal(asInput(eventById(schedule, "mesa_appointment").startDate), "23/01/2026");
  assert.equal(asInput(eventById(schedule, "provisional_elected_proclamation").startDate), "02/02/2026");
  assert.equal(eventById(schedule, "results_claim_period").pdfValue, "03/02/26 al 05/02/26");
  assert.equal(asInput(eventById(schedule, "final_elected_proclamation").startDate), "09/02/2026");
});

runTest("publica censos provisionales de Departamento al siguiente habil en minimos y maximos", () => {
  const minimum = calculateSchedule({
    type: "department",
    convocationDate: "04/12/2025",
    electionDatesInput: ["09/01/2026"],
    academicYear: "2025-2026",
    calculationMode: "minimum",
    excludedDatesInput: [],
  });
  const maximum = calculateSchedule({
    type: "department",
    convocationDate: "04/12/2025",
    electionDatesInput: ["30/01/2026"],
    academicYear: "2025-2026",
    calculationMode: "maximum",
    excludedDatesInput: [],
  });

  assert.equal(asInput(eventById(minimum, "provisional_census_publication").startDate), "05/12/2025");
  assert.equal(asInput(eventById(maximum, "provisional_census_publication").startDate), "05/12/2025");
});

runTest("limita Consejo de Departamento a una unica votacion", () => {
  const schedule = calculateSchedule({
    type: "department",
    convocationDate: "03/11/2025",
    electionDatesInput: ["28/11/2025", "01/12/2025"],
    academicYear: "2025-2026",
    calculationMode: "minimum",
    excludedDatesInput: [],
  });

  assert.equal(schedule.valid, false);
  assert.match(schedule.errors.join(" "), /exactamente una fecha de votaci.n/i);
});

runTest("rechaza una votacion sin margen minimo de campana", () => {
  const schedule = calculateSchedule({
    type: "department",
    convocationDate: "03/11/2025",
    electionDatesInput: ["26/11/2025"],
    academicYear: "2025-2026",
    calculationMode: "minimum",
    excludedDatesInput: [],
  });

  assert.equal(schedule.valid, false);
  assert.match(schedule.errors.join(" "), /3 d.as h.biles de campa.a electoral/i);
});

runTest("limita la campana a 15 dias naturales incluso con cambio horario", () => {
  const schedule = calculateSchedule({
    type: "department",
    convocationDate: "20/02/2026",
    electionDatesInput: ["08/04/2026"],
    academicYear: "2025-2026",
    calculationMode: "minimum",
    excludedDatesInput: [],
  });

  assert.equal(schedule.valid, false);
  assert.match(schedule.errors.join(" "), /no puede superar 15 d.as naturales/i);
});

runTest("sugiere la fecha minima de votacion para delegacion de curso", () => {
  const suggested = suggestNextVotingDate({
    type: "course",
    convocationDate: "03/11/2025",
    academicYear: "2025-2026",
    excludedDatesInput: [],
  });

  assert.equal(asInput(suggested), "04/11/2025");
});

runTest("traslada al lunes laborable cuando una fiesta cae en domingo", () => {
  const suggested = suggestNextVotingDate({
    type: "course",
    convocationDate: "10/10/2025",
    academicYear: "2025-2026",
    excludedDatesInput: [],
  });

  assert.equal(asInput(suggested), "14/10/2025");
});

runTest("considera Corpus Christi como no lectivo en el curso", () => {
  const suggested = suggestNextVotingDate({
    type: "course",
    convocationDate: "03/06/2026",
    academicYear: "2025-2026",
    excludedDatesInput: [],
  });

  assert.equal(asInput(suggested), "05/06/2026");
});

runTest("considera Semana Santa como semana no lectiva completa", () => {
  const suggested = suggestNextVotingDate({
    type: "course",
    convocationDate: "27/03/2026",
    academicYear: "2025-2026",
    excludedDatesInput: [],
  });

  assert.equal(asInput(suggested), "06/04/2026");
});

runTest("mantiene el lunes del pescaíto como lectivo", () => {
  const suggested = suggestNextVotingDate({
    type: "course",
    convocationDate: "17/04/2026",
    academicYear: "2025-2026",
    excludedDatesInput: [],
  });

  assert.equal(asInput(suggested), "20/04/2026");
});

runTest("considera la Feria de Abril de Sevilla como no lectiva de martes a domingo", () => {
  const suggested = suggestNextVotingDate({
    type: "course",
    convocationDate: "20/04/2026",
    academicYear: "2025-2026",
    excludedDatesInput: [],
  });

  assert.equal(asInput(suggested), "27/04/2026");
});

runTest("adelanta la Feria si la regla tradicional la deja integramente en mayo", () => {
  const suggested = suggestNextVotingDate({
    type: "course",
    convocationDate: "28/04/2025",
    academicYear: "2024-2025",
    excludedDatesInput: [],
  });

  assert.equal(asInput(suggested), "05/05/2025");
});

runTest("desplaza la sugerencia de curso si la fecha minima es inhabil", () => {
  const suggested = suggestNextVotingDate({
    type: "course",
    convocationDate: "03/11/2025",
    academicYear: "2025-2026",
    excludedDatesInput: [{ kind: "single", start: "04/11/2025" }],
  });

  assert.equal(asInput(suggested), "05/11/2025");
});

runTest("sugiere la fecha minima de votacion para delegacion de grupo", () => {
  const suggested = suggestNextVotingDate({
    type: "group",
    convocationDate: "03/11/2025",
    calculationMode: "minimum",
    academicYear: "2025-2026",
    excludedDatesInput: [],
  });

  assert.equal(asInput(suggested), "17/11/2025");
});

runTest("sugiere la fecha minima de votacion para delegacion de grupo en plazos maximos", () => {
  const suggested = suggestNextVotingDate({
    type: "group",
    convocationDate: "03/11/2025",
    calculationMode: "maximum",
    academicYear: "2025-2026",
    excludedDatesInput: [],
  });

  assert.equal(asInput(suggested), "19/11/2025");
});

runTest("sugiere la fecha minima de votacion para Consejo de Departamento", () => {
  const suggested = suggestNextVotingDate({
    type: "department",
    convocationDate: "03/11/2025",
    academicYear: "2025-2026",
    excludedDatesInput: [],
  });

  assert.equal(asInput(suggested), "02/12/2025");
});

runTest("sugiere jornadas posteriores al anadir mas votaciones", () => {
  const suggested = suggestNextVotingDate({
    type: "course",
    convocationDate: "06/11/2025",
    electionDatesInput: ["07/11/2025"],
    academicYear: "2025-2026",
    excludedDatesInput: [],
  });

  assert.equal(asInput(suggested), "10/11/2025");
});

runTest("refleja en las asunciones de curso y grupo los no lectivos precargados", () => {
  const course = calculateSchedule({
    type: "course",
    convocationDate: "03/11/2025",
    electionDatesInput: ["04/11/2025"],
    academicYear: "2025-2026",
    calculationMode: "minimum",
    excludedDatesInput: [],
  });
  const group = calculateSchedule({
    type: "group",
    convocationDate: "03/11/2025",
    electionDatesInput: ["20/11/2025"],
    academicYear: "2025-2026",
    calculationMode: "minimum",
    excludedDatesInput: [],
  });

  assert.equal(course.valid, true);
  assert.equal(group.valid, true);
  assert.ok(course.assumptions.some((line) => line.includes("periodos no lectivos precargados")));
  assert.ok(group.assumptions.some((line) => line.includes("periodos no lectivos precargados")));
  assert.ok(!course.assumptions.some((line) => line.includes("deben añadirse manualmente")));
  assert.ok(!group.assumptions.some((line) => line.includes("deben añadirse manualmente")));
});

runTest("mantiene el comportamiento existente de delegacion de grupo", () => {
  const schedule = calculateSchedule({
    type: "group",
    convocationDate: "03/11/2025",
    electionDatesInput: ["20/11/2025"],
    academicYear: "2025-2026",
    calculationMode: "minimum",
    excludedDatesInput: [],
  });

  assert.equal(schedule.valid, true);
  assert.equal(asInput(eventById(schedule, "provisional_census_publication").startDate), "04/11/2025");
  assert.equal(eventById(schedule, "census_publication_period").pdfValue, "04/11/25 al 10/11/25");
  assert.equal(asInput(eventById(schedule, "definitive_census_publication").startDate), "14/11/2025");
});

runTest("rechaza una primera votacion de grupo el mismo dia del censo definitivo", () => {
  const schedule = calculateSchedule({
    type: "group",
    convocationDate: "03/11/2025",
    electionDatesInput: ["14/11/2025"],
    academicYear: "2025-2026",
    calculationMode: "minimum",
    excludedDatesInput: [],
  });

  assert.equal(schedule.valid, false);
  assert.match(schedule.errors.join(" "), /un d.a h.bil despu.s de la resoluci.n de reclamaciones/i);
  assert.match(schedule.errors.join(" "), /17\/11\/2025/);
});

runTest("rechaza una primera votacion de grupo en plazos maximos el mismo dia del censo definitivo", () => {
  const schedule = calculateSchedule({
    type: "group",
    convocationDate: "03/11/2025",
    electionDatesInput: ["18/11/2025"],
    academicYear: "2025-2026",
    calculationMode: "maximum",
    excludedDatesInput: [],
  });

  assert.equal(schedule.valid, false);
  assert.match(schedule.errors.join(" "), /19\/11\/2025/);
});

runTest("rechaza una primera votacion de curso el mismo dia de la convocatoria", () => {
  const schedule = calculateSchedule({
    type: "course",
    convocationDate: "03/11/2025",
    electionDatesInput: ["03/11/2025"],
    academicYear: "2025-2026",
    calculationMode: "minimum",
    excludedDatesInput: [],
  });

  assert.equal(schedule.valid, false);
  assert.match(schedule.errors.join(" "), /un d.a h.bil despu.s de la convocatoria/i);
  assert.match(schedule.errors.join(" "), /04\/11\/2025/);
});

runTest("genera nombres de descarga en espanol", () => {
  assert.equal(
    buildDownloadFilename({ type: "group", academicYear: "2025-2026" }),
    "calendario-electoral-grupo-2025-2026.pdf",
  );
  assert.equal(
    buildDownloadFilename({ type: "course", academicYear: "2025-2026" }),
    "calendario-electoral-curso-2025-2026.pdf",
  );
  assert.equal(
    buildDownloadFilename({ type: "department", academicYear: "2025-2026" }),
    "calendario-electoral-departamento-2025-2026.pdf",
  );
});

if (failures > 0) {
  process.exit(1);
}
