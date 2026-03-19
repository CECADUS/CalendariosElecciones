import assert from "node:assert/strict";

import {
  addBusinessDays,
  calculateSchedule,
  countBusinessDaysInclusive,
  formatDateInput,
  parseDateInput,
  parseExcludedDates,
  suggestNextVotingDate,
} from "../front/calculator.js";
import { buildDownloadFilename } from "../front/pdf-generator.js";

process.env.TZ = "Europe/Madrid";

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
  assert.equal(eventById(schedule, "results_claim_period").pdfValue, "04/12/25 al 08/12/25");
  assert.equal(asInput(eventById(schedule, "final_elected_proclamation").startDate), "09/12/2025");
});

runTest("calcula el calendario maximo de Consejo de Departamento", () => {
  const schedule = calculateSchedule({
    type: "department",
    convocationDate: "04/12/2025",
    electionDatesInput: ["23/01/2026"],
    academicYear: "2025-2026",
    calculationMode: "maximum",
    excludedDatesInput: [],
  });

  assert.equal(schedule.valid, true);
  assert.equal(asInput(eventById(schedule, "provisional_census_publication").startDate), "05/12/2025");
  assert.equal(eventById(schedule, "candidacy_submission_period").pdfValue, "19/12/25 al 29/12/25");
  assert.equal(asInput(eventById(schedule, "definitive_candidatures_proclamation").startDate), "16/01/2026");
  assert.equal(eventById(schedule, "campaign_electoral").pdfValue, "16/01/26 al 22/01/26");
  assert.equal(eventById(schedule, "early_voting").pdfValue, "20/01/26 al 22/01/26");
  assert.equal(asInput(eventById(schedule, "mesa_appointment").startDate), "19/01/2026");
  assert.equal(asInput(eventById(schedule, "provisional_elected_proclamation").startDate), "26/01/2026");
  assert.equal(eventById(schedule, "results_claim_period").pdfValue, "27/01/26 al 29/01/26");
  assert.equal(asInput(eventById(schedule, "final_elected_proclamation").startDate), "02/02/2026");
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
    electionDatesInput: ["01/04/2026"],
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
