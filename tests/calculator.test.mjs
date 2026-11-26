process.env.TZ = "Europe/Madrid";

import assert from "node:assert/strict";

const {
  addBusinessDays,
  calculateSchedule,
  getCalendarDays,
  academicCalendars,
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
  assert.equal(eventById(schedule, "campaign_electoral").pdfValue, "25/11/25 al 27/11/25");
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
    electionDatesInput: ["02/03/2026"],
    academicYear: "2025-2026",
    calculationMode: "maximum",
    excludedDatesInput: [],
  });

  assert.equal(schedule.valid, true);
  assert.equal(asInput(eventById(schedule, "provisional_census_publication").startDate), "05/12/2025");
  assert.deepEqual(eventById(schedule, "candidacy_submission_period").pdfValue, ["07/01/26", "26/01/26 al 03/02/26"]);
  assert.equal(asInput(eventById(schedule, "definitive_candidatures_proclamation").startDate), "23/02/2026");
  assert.equal(eventById(schedule, "campaign_electoral").pdfValue, "23/02/26 al 27/02/26");
  assert.equal(eventById(schedule, "early_voting").pdfValue, "25/02/26 al 27/02/26");
  assert.equal(asInput(eventById(schedule, "mesa_appointment").startDate), "24/02/2026");
  assert.equal(asInput(eventById(schedule, "provisional_elected_proclamation").startDate), "03/03/2026");
  assert.equal(eventById(schedule, "results_claim_period").pdfValue, "04/03/26 al 06/03/26");
  assert.equal(asInput(eventById(schedule, "final_elected_proclamation").startDate), "10/03/2026");
});

runTest("publica censos provisionales de Departamento al siguiente habil en minimos y maximos", () => {
  const minimum = calculateSchedule({
    type: "department",
    convocationDate: "04/12/2025",
    electionDatesInput: ["09/02/2026"],
    academicYear: "2025-2026",
    calculationMode: "minimum",
    excludedDatesInput: [],
  });
  const maximum = calculateSchedule({
    type: "department",
    convocationDate: "04/12/2025",
    electionDatesInput: ["02/03/2026"],
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

runTest("cierra la campaña antes de Semana Santa y mantiene el voto anticipado por tramos", () => {
  const schedule = calculateSchedule({
    type: "department",
    convocationDate: "20/02/2026",
    electionDatesInput: ["08/04/2026"],
    academicYear: "2025-2026",
    calculationMode: "minimum",
    excludedDatesInput: [],
  });

  assert.equal(schedule.valid, true);
  assert.equal(eventById(schedule, "campaign_electoral").pdfValue, "16/03/26 al 18/03/26");
  assert.deepEqual(eventById(schedule, "early_voting").pdfValue, ["18/03/26 al 27/03/26", "06/04/26 al 07/04/26"]);
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

runTest("Corpus Christi bloquea también publicaciones y resoluciones", () => {
  assert.ok(getCalendarDays().administrative.has("2026-06-04"));
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

runTest("incorpora la corrección oficial del lunes de Feria de 2026", () => {
  const suggested = suggestNextVotingDate({
    type: "course",
    convocationDate: "17/04/2026",
    academicYear: "2025-2026",
    excludedDatesInput: [],
  });

  assert.equal(asInput(suggested), "27/04/2026");
});

runTest("no sugiere una votación para una convocatoria en vacaciones", () => {
  const suggested = suggestNextVotingDate({
    type: "course",
    convocationDate: "20/04/2026",
    academicYear: "2025-2026",
    excludedDatesInput: [],
  });

  assert.equal(suggested, null);
});

runTest("usa las fechas publicadas aunque la Feria empiece en mayo", () => {
  const suggested = suggestNextVotingDate({
    type: "course",
    convocationDate: "02/05/2025",
    academicYear: "2024-2025",
    excludedDatesInput: [],
  });

  assert.equal(asInput(suggested), "12/05/2025");
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

const resultsClaimScenarios = [
  {
    name: "una votacion entre semana",
    votingDates: ["23/11/2026"],
    excludedDates: [],
    periods: [["24/11/2026", "26/11/2026"]],
    finalMinimum: ["27/11/2026"],
    finalMaximum: ["30/11/2026"],
  },
  {
    name: "una votacion antes del fin de semana",
    votingDates: ["20/11/2026"],
    excludedDates: [],
    periods: [["23/11/2026", "25/11/2026"]],
    finalMinimum: ["26/11/2026"],
    finalMaximum: ["27/11/2026"],
  },
  {
    name: "un dia inhabil dentro del plazo",
    votingDates: ["23/11/2026"],
    excludedDates: [{ kind: "single", start: "25/11/2026" }],
    periods: [["24/11/2026", "27/11/2026"]],
    finalMinimum: ["30/11/2026"],
    finalMaximum: ["01/12/2026"],
  },
  {
    name: "un rango inhabil al inicio del plazo",
    votingDates: ["23/11/2026"],
    excludedDates: [{ kind: "range", start: "24/11/2026", end: "25/11/2026" }],
    periods: [["26/11/2026", "30/11/2026"]],
    finalMinimum: ["01/12/2026"],
    finalMaximum: ["02/12/2026"],
  },
  {
    name: "varias votaciones con plazos independientes",
    votingDates: ["20/11/2026", "23/11/2026"],
    excludedDates: [],
    periods: [["23/11/2026", "25/11/2026"], ["24/11/2026", "26/11/2026"]],
    finalMinimum: ["26/11/2026", "27/11/2026"],
    finalMaximum: ["27/11/2026", "30/11/2026"],
  },
  {
    name: "varias votaciones con un rango inhabil",
    votingDates: ["20/11/2026", "23/11/2026"],
    excludedDates: [{ kind: "range", start: "24/11/2026", end: "25/11/2026" }],
    periods: [["23/11/2026", "27/11/2026"], ["26/11/2026", "30/11/2026"]],
    finalMinimum: ["30/11/2026", "01/12/2026"],
    finalMaximum: ["01/12/2026", "02/12/2026"],
  },
];

for (const type of ["course", "group"]) {
  for (const calculationMode of ["minimum", "maximum"]) {
    for (const scenario of resultsClaimScenarios) {
      runTest(`reclamaciones de ${type} en ${calculationMode}: ${scenario.name}`, () => {
        const schedule = calculateSchedule({
          type,
          convocationDate: "03/11/2026",
          electionDatesInput: scenario.votingDates,
          academicYear: "2026-2027",
          calculationMode,
          excludedDatesInput: scenario.excludedDates,
        });

        assert.equal(schedule.valid, true, schedule.errors?.join(" "));
        const claims = eventById(schedule, "results_claim_period");
        const final = eventById(schedule, "final_proclamation");
        const multiple = scenario.votingDates.length > 1;
        assert.equal(claims.kind, multiple ? "multi-range" : "range");
        assert.equal(final.kind, multiple ? "multi-single" : "single");
        const entries = multiple ? claims.entries : [claims];
        const finalDates = multiple ? final.entries.map((entry) => entry.date) : [final.startDate];
        const disabledDates = parseExcludedDates(scenario.excludedDates).set;

        assert.deepEqual(
          entries.map((entry) => [asInput(entry.startDate), asInput(entry.endDate)]),
          scenario.periods,
        );
        for (const [index, entry] of entries.entries()) {
          assert.equal(countBusinessDaysInclusive(entry.startDate, entry.endDate, disabledDates), 3);
          assert.ok(entry.startDate > parseDateInput(scenario.votingDates[index]));
          const [start, end] = scenario.periods[index];
          assert.equal(entry.pdfValue, `${start.slice(0, -4)}${start.slice(-2)} al ${end.slice(0, -4)}${end.slice(-2)}`);
          if (multiple) {
            assert.equal(asInput(entry.anchorDate), scenario.votingDates[index]);
            assert.equal(asInput(final.entries[index].anchorDate), scenario.votingDates[index]);
            assert.equal(claims.pdfBlocks[index].primary, entry.pdfValue);
          }
        }
        assert.deepEqual(
          finalDates.map(asInput),
          calculationMode === "minimum" ? scenario.finalMinimum : scenario.finalMaximum,
        );
      });
    }
  }
}

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

runTest("convocatoria del 27 de noviembre: calcula todos los trámites y explica el 26 de enero", () => {
  const input = { type: "department", convocationDate: "27/11/2026", calculationMode: "minimum" };
  assert.equal(asInput(suggestNextVotingDate(input)), "02/02/2027");
  const invalid = calculateSchedule({ ...input, electionDate: "26/01/2027" });
  assert.equal(invalid.valid, false);
  assert.match(invalid.errors.join(" "), /campaña puede comenzar el 26\/01\/2027.*02\/02\/2027/);
  const schedule = calculateSchedule({ ...input, electionDate: "02/02/2027" });
  assert.equal(schedule.valid, true);
  assert.equal(eventById(schedule, "candidacy_claims_resolution").pdfValue, "08/01/27");
  assert.equal(eventById(schedule, "definitive_candidatures_proclamation").pdfValue, "11/01/27");
  const campaign = eventById(schedule, "campaign_electoral");
  assert.equal(campaign.pdfValue, "26/01/27 al 29/01/27");
  assert.equal(campaign.segments, undefined);
  assert.equal(countBusinessDaysInclusive(campaign.startDate, campaign.endDate, getCalendarDays().electoral), 3);
  assert.equal(eventById(schedule, "mesa_appointment").pdfValue, "26/01/27");
});

runTest("el máximo de quince naturales limita la campaña aunque la votación sea posterior", () => {
  const schedule = calculateSchedule({ type: "department", convocationDate: "03/11/2025",
    electionDate: "12/02/2026", calculationMode: "maximum" });
  assert.equal(schedule.valid, true);
  const campaign = eventById(schedule, "campaign_electoral");
  const days = (campaign.endDate - campaign.startDate) / 86400000 + 1;
  assert.ok(days >= 3 && days <= 15);
  assert.ok(campaign.endDate < eventById(schedule, "early_voting").endDate);
});

runTest("Navidad, exámenes y tercera convocatoria usan los días que corresponden a cada trámite", () => {
  const days = getCalendarDays();
  for (const date of ["2026-12-21", "2027-01-06", "2027-04-12"]) assert.ok(days.administrative.has(date));
  for (const date of ["2027-01-08", "2027-01-25", "2027-05-25", "2027-07-09"]) {
    assert.equal(days.administrative.has(date), false);
    assert.ok(days.electoral.has(date));
  }
  assert.equal(days.electoral.has("2026-10-15"), false);
  assert.equal(days.electoral.has("2027-01-07"), false);
});

runTest("requiere cobertura oficial de todo el proceso, incluida la proclamación final", () => {
  const lastYear = Number(Object.keys(academicCalendars).sort().at(-1).slice(5));
  const unknown = { type: "course", convocationDate: `03/11/${lastYear}`, electionDate: `12/11/${lastYear}` };
  assert.match(calculateSchedule(unknown).errors.join(" "), /Calendario oficial pendiente/);
  assert.equal(suggestNextVotingDate(unknown), null);
  const { electoral } = getCalendarDays();
  const lastVotingDay = addBusinessDays(parseDateInput(`01/09/${lastYear}`), -1, electoral);
  const convocationDate = asInput(addBusinessDays(lastVotingDay, -2, electoral));
  const cross = { type: "course", convocationDate, electionDate: `15/09/${lastYear}` };
  assert.match(calculateSchedule(cross).errors.join(" "), /Calendario oficial pendiente/);
  const lateVote = { ...cross, electionDate: asInput(lastVotingDay) };
  assert.match(calculateSchedule(lateVote).errors.join(" "), /Calendario oficial pendiente/);
});

if (failures > 0) {
  process.exit(1);
}
