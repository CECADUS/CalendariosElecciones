export const CALENDAR_TYPES = {
  course: {
    id: "course",
    label: "Delegación de curso",
  },
  department: {
    id: "department",
    label: "Consejo de Departamento",
  },
  group: {
    id: "group",
    label: "Delegación de grupo",
  },
};

export const CALCULATION_MODES = {
  minimum: {
    id: "minimum",
    label: "Plazos mínimos",
  },
  maximum: {
    id: "maximum",
    label: "Plazos máximos",
  },
};

export const MAX_VOTING_DATES = 5;
const DEPARTMENT_VOTING_DATES = 1;

import academicCalendars from "./academic-calendars.json" with { type: "json" };
export { academicCalendars };

export const UNITARY_ACT_ITEMS = [
  "Presentación de candidaturas",
  "Publicación de candidaturas provisionales",
  "Plazo de reclamación a las candidaturas presentadas",
  "Resolución de reclamaciones a candidaturas",
  "Proclamación definitiva de candidaturas",
  "Campaña electoral",
  "Votación",
  "Escrutinio",
  "Publicación provisional de candidaturas electas",
];

function cloneDate(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
}

export function isoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDateInput(date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());
  return `${day}/${month}/${year}`;
}

export function formatDateDayMonth(date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}`;
}

export function parseDateInput(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return cloneDate(value);
  }

  const normalized = String(value).trim();
  let year;
  let month;
  let day;

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    [year, month, day] = normalized.split("-").map(Number);
  } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(normalized)) {
    [day, month, year] = normalized.split("/").map(Number);
  } else {
    return null;
  }

  const candidate = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (
    candidate.getFullYear() !== year ||
    candidate.getMonth() !== month - 1 ||
    candidate.getDate() !== day
  ) {
    return null;
  }

  return candidate;
}

export function suggestAcademicYear(date) {
  const year = date.getFullYear();
  return date.getMonth() >= 8 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

function expandDateRange(startDate, endDate, set) {
  const current = cloneDate(startDate);
  while (current <= endDate) {
    set.add(isoDate(current));
    current.setDate(current.getDate() + 1);
  }
}

export function parseExcludedDates(rawValue) {
  const set = new Set();
  const invalid = [];

  if (!rawValue) {
    return { set, invalid };
  }

  if (Array.isArray(rawValue)) {
    for (const entry of rawValue) {
      if (!entry) {
        continue;
      }

      if (entry.kind === "single") {
        const date = parseDateInput(entry.start ?? entry.value ?? entry.date ?? "");
        if (!date) {
          invalid.push(entry.start ?? entry.value ?? entry.date ?? "fecha vacía");
          continue;
        }
        set.add(isoDate(date));
        continue;
      }

      if (entry.kind === "range") {
        const startDate = parseDateInput(entry.start ?? "");
        const endDate = parseDateInput(entry.end ?? "");
        if (!startDate || !endDate) {
          invalid.push(`${entry.start ?? ""} - ${entry.end ?? ""}`.trim());
          continue;
        }
        if (endDate < startDate) {
          invalid.push(`${formatDateInput(startDate)} - ${formatDateInput(endDate)}`);
          continue;
        }
        expandDateRange(startDate, endDate, set);
      }
    }

    return { set, invalid };
  }

  for (const token of String(rawValue).split(/[\s,;]+/).map((item) => item.trim()).filter(Boolean)) {
    const parsed = parseDateInput(token);
    if (!parsed) {
      invalid.push(token);
      continue;
    }
    set.add(isoDate(parsed));
  }

  return { set, invalid };
}

const holidays = new Set();
const vacations = new Set();
const exams = new Set();
for (const calendar of Object.values(academicCalendars)) {
  for (const date of calendar.holidays) holidays.add(date);
  for (const [start, end] of calendar.vacations) expandDateRange(parseDateInput(start), parseDateInput(end), vacations);
  for (const [start, end] of calendar.exams) expandDateRange(parseDateInput(start), parseDateInput(end), exams);
}

export function getCalendarDays(excludedDatesInput = []) {
  const { set, invalid } = parseExcludedDates(excludedDatesInput);
  const administrative = new Set([...holidays, ...vacations, ...set]);
  return { administrative, electoral: new Set([...administrative, ...exams]), invalid };
}

function missingAcademicYear(start, end) {
  const first = Number(suggestAcademicYear(start).slice(0, 4));
  const last = Number(suggestAcademicYear(end).slice(0, 4));
  for (let year = first; year <= last; year++) {
    const key = `${year}-${year + 1}`;
    if (!academicCalendars[key]) return key;
  }
  return null;
}

function orderAndDeduplicateDates(dates) {
  return [...dates]
    .sort((left, right) => left.getTime() - right.getTime())
    .filter((date, index, list) => index === 0 || isoDate(date) !== isoDate(list[index - 1]));
}

export function parseVotingDates(rawValue) {
  const values = Array.isArray(rawValue) ? rawValue : [rawValue];
  const invalid = [];
  const parsedDates = [];
  let providedCount = 0;

  for (const value of values) {
    const normalized = String(value ?? "").trim();
    if (!normalized) {
      continue;
    }

    providedCount += 1;
    const date = parseDateInput(normalized);
    if (!date) {
      invalid.push(normalized);
      continue;
    }

    parsedDates.push(date);
  }

  const dates = orderAndDeduplicateDates(parsedDates);
  return {
    dates,
    invalid,
    duplicatesRemoved: dates.length !== parsedDates.length,
    providedCount,
  };
}

export function isBusinessDay(date, extraDisabledDates) {
  const weekday = date.getDay();
  return weekday !== 0 && weekday !== 6 && !extraDisabledDates.has(isoDate(date));
}

export function addBusinessDays(date, amount, extraDisabledDates) {
  if (amount === 0) {
    return cloneDate(date);
  }

  const result = cloneDate(date);
  const step = amount > 0 ? 1 : -1;
  let remaining = Math.abs(amount);

  while (remaining > 0) {
    result.setDate(result.getDate() + step);
    if (isBusinessDay(result, extraDisabledDates)) {
      remaining -= 1;
    }
  }

  return result;
}

export function countBusinessDaysInclusive(startDate, endDate, extraDisabledDates) {
  if (endDate < startDate) {
    return 0;
  }

  const current = cloneDate(startDate);
  let total = 0;
  while (current <= endDate) {
    if (isBusinessDay(current, extraDisabledDates)) {
      total += 1;
    }
    current.setDate(current.getDate() + 1);
  }
  return total;
}

function nextBusinessDayOnOrAfter(date, disabled) {
  return isBusinessDay(date, disabled) ? cloneDate(date) : addBusinessDays(date, 1, disabled);
}

function censusDeadlines(convocation, days, mode) {
  const provisionalCensus = addBusinessDays(convocation, 1, days.administrative);
  const censusClaimStart = nextBusinessDayOnOrAfter(provisionalCensus, days.electoral);
  // La publicación puede adelantarse a los cinco días efectivos de exposición con derecho a reclamar.
  const censusPublicationEnd = addBusinessDays(censusClaimStart, 4, days.electoral);
  const censusClaimEnd = addBusinessDays(censusPublicationEnd, 3, days.electoral);
  const definitiveCensus = addBusinessDays(censusClaimEnd, mode === "minimum" ? 1 : 3, days.administrative);
  return { provisionalCensus, censusClaimStart, censusPublicationEnd, censusClaimEnd, definitiveCensus };
}

function dayAfter(date) {
  const next = cloneDate(date);
  next.setDate(next.getDate() + 1);
  return next;
}

function campaignWindow(proclamation, electoral) {
  let start = nextBusinessDayOnOrAfter(proclamation, electoral);
  while (true) {
    let minimumEnd = null;
    let maximumEnd = start;
    let eligible = 0;
    let date = start;
    for (let elapsed = 0; elapsed < 15; elapsed++, date = dayAfter(date)) {
      const key = isoDate(date);
      if (vacations.has(key) || exams.has(key)) break;
      if (isBusinessDay(date, electoral)) {
        maximumEnd = date;
        if (++eligible === 3) minimumEnd = date;
      }
    }
    if (minimumEnd) return { start, minimumEnd, maximumEnd };
    // Tras una interrupción oficial, buscar un tramo completo al reabrir.
    const interrupted = vacations.has(isoDate(date)) || exams.has(isoDate(date));
    start = nextBusinessDayOnOrAfter(interrupted ? date : dayAfter(start), electoral);
  }
}

function departmentDeadlines(census, days, mode) {
  const minimum = mode === "minimum";
  const candidacySubmissionStart = nextBusinessDayOnOrAfter(census.definitiveCensus, days.electoral);
  const candidacySubmissionEnd = addBusinessDays(candidacySubmissionStart, minimum ? 2 : 6, days.electoral);
  const provisionalCandidatures = addBusinessDays(candidacySubmissionEnd, minimum ? 1 : 3, days.administrative);
  const candidacyClaimStart = nextBusinessDayOnOrAfter(provisionalCandidatures, days.electoral);
  const candidacyClaimEnd = addBusinessDays(candidacyClaimStart, minimum ? 2 : 6, days.electoral);
  const candidacyClaimsResolution = addBusinessDays(candidacyClaimEnd, minimum ? 1 : 2, days.administrative);
  const definitiveCandidatures = addBusinessDays(candidacyClaimsResolution, minimum ? 1 : 3, days.administrative);
  const campaign = campaignWindow(definitiveCandidatures, days.electoral);
  return { candidacySubmissionStart, candidacySubmissionEnd, provisionalCandidatures, candidacyClaimStart,
    candidacyClaimEnd, candidacyClaimsResolution, definitiveCandidatures, campaign };
}

function prepareElection(type, convocation, days, mode) {
  if (type === "course") return { firstVote: addBusinessDays(convocation, 1, days.electoral) };
  const census = censusDeadlines(convocation, days, mode);
  if (type === "group") return { ...census, firstVote: addBusinessDays(census.definitiveCensus, 1, days.electoral) };
  const department = departmentDeadlines(census, days, mode);
  const afterAppointments = addBusinessDays(department.definitiveCandidatures, 5, days.electoral);
  const afterCampaign = addBusinessDays(department.campaign.minimumEnd, 1, days.electoral);
  const firstVote = afterCampaign > afterAppointments ? afterCampaign : afterAppointments;
  return { ...census, ...department, firstVote };
}

function resultDeadlines(type, votingDate, days, mode) {
  const provisional = type === "department" ? addBusinessDays(votingDate, 1, days.administrative) : votingDate;
  const start = addBusinessDays(provisional, 1, days.electoral);
  const end = addBusinessDays(provisional, 3, days.electoral);
  return { provisional, start, end, final: addBusinessDays(end, mode === "minimum" ? 1 : 2, days.administrative) };
}

function formatFirstValidVotingDateMessage(date) {
  return ` La primera fecha válida es el ${formatDateInput(date)}.`;
}

export function suggestNextVotingDate({
  type, convocationDate: input, electionDatesInput = [], calculationMode = "minimum", excludedDatesInput = [],
}) {
  const convocation = parseDateInput(input);
  if (!convocation || !CALENDAR_TYPES[type] || !academicCalendars[suggestAcademicYear(convocation)]) return null;
  const days = getCalendarDays(excludedDatesInput);
  if (days.invalid.length || !isBusinessDay(convocation, days.electoral)) return null;
  const { firstVote } = prepareElection(type, convocation, days, calculationMode);
  const last = parseVotingDates(electionDatesInput).dates.at(-1);
  const vote = last && last >= firstVote ? addBusinessDays(last, 1, days.electoral) : firstVote;
  const { final } = resultDeadlines(type, vote, days, calculationMode);
  return missingAcademicYear(convocation, final) ? null : vote;
}

export function formatDateLong(date) {
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function formatDateCompact(date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
}

export function formatRangeLong(startDate, endDate, collapseSameDay = true) {
  if (collapseSameDay && isoDate(startDate) === isoDate(endDate)) {
    return formatDateLong(startDate);
  }

  return `Del ${formatDateLong(startDate)} al ${formatDateLong(endDate)}`;
}

export function formatRangeCompact(startDate, endDate, collapseSameDay = true) {
  if (collapseSameDay && isoDate(startDate) === isoDate(endDate)) {
    return formatDateCompact(startDate);
  }

  return `${formatDateCompact(startDate)} al ${formatDateCompact(endDate)}`;
}

function singleDayEvent(id, label, date, reference, category) {
  return {
    id,
    kind: "single",
    label,
    category,
    reference,
    startDate: date,
    endDate: date,
    webValue: formatDateLong(date),
    pdfValue: formatDateCompact(date),
  };
}

function rangeEvent(id, label, startDate, endDate, reference, category, options = {}) {
  const collapseSameDay = options.collapseSameDay ?? true;
  return {
    id,
    kind: "range",
    label,
    category,
    reference,
    startDate,
    endDate,
    collapsed: collapseSameDay && isoDate(startDate) === isoDate(endDate),
    webValue: formatRangeLong(startDate, endDate, collapseSameDay),
    pdfValue: formatRangeCompact(startDate, endDate, collapseSameDay),
  };
}

function buildVotingReference(anchorDate) {
  return `(Votación del ${formatDateDayMonth(anchorDate)})`;
}

function multiRangeEvent(id, label, entries, reference, category) {
  const normalizedEntries = entries.map((entry) => ({
    ...entry,
    referenceLabel: buildVotingReference(entry.anchorDate),
    webValue: formatRangeLong(entry.startDate, entry.endDate),
    pdfValue: formatRangeCompact(entry.startDate, entry.endDate),
  }));

  return {
    id,
    kind: "multi-range",
    label,
    category,
    reference,
    startDate: normalizedEntries[0].startDate,
    endDate: normalizedEntries.at(-1).endDate,
    entries: normalizedEntries,
    webValue: `${normalizedEntries.length} plazos vinculados a las votaciones`,
    pdfValue: normalizedEntries.map((entry) => `${entry.pdfValue} ${entry.referenceLabel}`),
    pdfBlocks: normalizedEntries.map((entry) => ({
      primary: entry.pdfValue,
      secondary: entry.referenceLabel,
    })),
  };
}

function multiSingleEvent(id, label, entries, reference, category) {
  const normalizedEntries = entries.map((entry) => ({
    ...entry,
    referenceLabel: buildVotingReference(entry.anchorDate),
    webValue: formatDateLong(entry.date),
    pdfValue: formatDateCompact(entry.date),
  }));

  return {
    id,
    kind: "multi-single",
    label,
    category,
    reference,
    startDate: normalizedEntries[0].date,
    endDate: normalizedEntries.at(-1).date,
    entries: normalizedEntries,
    webValue: `${normalizedEntries.length} proclamaciones vinculadas a las votaciones`,
    pdfValue: normalizedEntries.map((entry) => `${entry.pdfValue} ${entry.referenceLabel}`),
    pdfBlocks: normalizedEntries.map((entry) => ({
      primary: entry.pdfValue,
      secondary: entry.referenceLabel,
    })),
  };
}

function unitaryActEvent(dates) {
  const orderedDates = orderAndDeduplicateDates(dates);
  const firstDate = orderedDates[0];
  const lastDate = orderedDates.at(-1);
  const multipleDates = orderedDates.length > 1;

  return {
    id: "unitary_act",
    kind: multipleDates ? "multiple" : "single",
    label: "Unidad de acto",
    category: "Unidad de acto",
    reference: multipleDates
      ? "Proceso concentrado en varias jornadas lectivas dentro de una misma unidad de acto."
      : "Proceso concentrado en una única jornada lectiva.",
    startDate: firstDate,
    endDate: lastDate,
    dates: orderedDates,
    dateLabels: orderedDates.map((date) => formatDateLong(date)),
    webValue: multipleDates ? `${orderedDates.length} jornadas de votación` : formatDateLong(firstDate),
    pdfValue: multipleDates ? orderedDates.map((date) => formatDateCompact(date)) : formatDateCompact(firstDate),
    items: UNITARY_ACT_ITEMS,
  };
}

function buildResultsClaimEvent(entries) {
  if (entries.length === 1) {
    return rangeEvent(
      "results_claim_period",
      "Plazo de reclamación de los resultados electorales provisionales",
      entries[0].startDate,
      entries[0].endDate,
      "Periodo de impugnación de resultados provisionales.",
      "Resultados",
    );
  }

  return multiRangeEvent(
    "results_claim_period",
    "Plazo de reclamación de los resultados electorales provisionales",
    entries,
    "Se genera un plazo independiente de reclamación por cada jornada de votación.",
    "Resultados",
  );
}

function buildFinalProclamationEvent(entries) {
  if (entries.length === 1) {
    return singleDayEvent(
      "final_proclamation",
      "Resolución de reclamaciones y proclamación definitiva de candidatos electos",
      entries[0].date,
      "Cierre definitivo del proceso.",
      "Resultados",
    );
  }

  return multiSingleEvent(
    "final_proclamation",
    "Resolución de reclamaciones y proclamación definitiva de candidatos electos",
    entries,
    "Se genera una proclamación definitiva independiente por cada plazo de reclamación vinculado a una votación.",
    "Resultados",
  );
}

function buildAssumptions({ calculationMode, multipleVotingDates = false, duplicatesRemoved = false }) {
  const assumptions = [
    calculationMode === "minimum" ? "Se aplican los plazos mínimos." : "Se aplican los plazos máximos.",
    "Se aplican los periodos no lectivos precargados del calendario general de grado, los festivos, los fines de semana y los inhábiles adicionales.",
    "Durante los exámenes de primera y segunda convocatoria solo se programan publicaciones y resoluciones de reclamaciones. Los plazos de participación cuentan días hábiles electorales.",
  ];
  if (multipleVotingDates) assumptions.push("Cada votación tiene su propio plazo de reclamación y proclamación definitiva.");
  if (duplicatesRemoved) assumptions.push("Se han unificado las fechas de votación repetidas.");
  return assumptions;
}

function studentElectionResults(type, votingDates, days, mode) {
  const claims = [];
  const proclamations = [];
  for (const anchorDate of votingDates) {
    const { start, end, final } = resultDeadlines(type, anchorDate, days, mode);
    claims.push({ anchorDate, startDate: start, endDate: end });
    proclamations.push({ anchorDate, date: final });
  }
  return [buildResultsClaimEvent(claims), buildFinalProclamationEvent(proclamations)];
}

function buildCourseSchedule({ convocationDate, votingDates, academicYear, days, calculationMode, duplicatesRemoved }) {
  return {
    valid: true,
    type: "course",
    academicYear,
    calculationMode,
    assumptions: buildAssumptions({
      calculationMode,
      multipleVotingDates: votingDates.length > 1,
      duplicatesRemoved,
    }),
    events: [
      singleDayEvent(
        "convocation",
        "Convocatoria, publicación de esta y del calendario electoral",
        convocationDate,
        "Convocatoria del proceso.",
        "Preparación",
      ),
      unitaryActEvent(votingDates),
      ...studentElectionResults("course", votingDates, days, calculationMode),
    ],
  };
}

function buildGroupSchedule({ convocationDate, votingDates, academicYear, days, calculationMode, duplicatesRemoved, plan }) {
  const { provisionalCensus, censusClaimStart, censusPublicationEnd, censusClaimEnd, definitiveCensus } = plan;
  return {
    valid: true,
    type: "group",
    academicYear,
    calculationMode,
    assumptions: buildAssumptions({
      calculationMode,
      multipleVotingDates: votingDates.length > 1,
      duplicatesRemoved,
    }),
    events: [
      singleDayEvent(
        "convocation",
        "Convocatoria, publicación de esta y del calendario electoral",
        convocationDate,
        "Convocatoria del proceso.",
        "Preparación",
      ),
      singleDayEvent(
        "provisional_census_publication",
        "Publicación de los censos electorales provisionales",
        provisionalCensus,
        "Apertura del trámite de censo.",
        "Censo",
      ),
      rangeEvent(
        "census_publication_period",
        "Plazo en el que se mantendrán publicados los censos electorales",
        provisionalCensus,
        censusPublicationEnd,
        "Periodo de exposición del censo.",
        "Censo",
      ),
      rangeEvent(
        "census_claim_period",
        "Plazo de reclamaciones de los censos provisionales",
        censusClaimStart,
        censusClaimEnd,
        "Periodo de reclamación al censo.",
        "Censo",
      ),
      singleDayEvent(
        "definitive_census_publication",
        "Resolución de reclamaciones y publicación del censo definitivo",
        definitiveCensus,
        "Cierre del trámite de censo.",
        "Censo",
      ),
      unitaryActEvent(votingDates),
      ...studentElectionResults("group", votingDates, days, calculationMode),
    ],
  };
}

function buildDepartmentSchedule({ convocationDate, votingDates, academicYear, days, calculationMode, duplicatesRemoved, plan }) {
  const { provisionalCensus, censusPublicationEnd, censusClaimStart, censusClaimEnd, definitiveCensus,
    candidacySubmissionStart, candidacySubmissionEnd, provisionalCandidatures, candidacyClaimStart,
    candidacyClaimEnd, candidacyClaimsResolution, definitiveCandidatures, campaign } = plan;
  const votingDate = votingDates[0];
  const earlyVotingEnd = addBusinessDays(votingDate, -1, days.electoral);
  const earlyVotingStart = addBusinessDays(definitiveCandidatures, 2, days.electoral);
  const appointment = addBusinessDays(votingDate, -4, days.electoral);
  const preferredEnd = calculationMode === "minimum" ? campaign.minimumEnd : campaign.maximumEnd;
  const campaignEnd = preferredEnd < earlyVotingEnd ? preferredEnd : earlyVotingEnd;
  const { provisional: provisionalElected, start: resultsClaimStart, end: resultsClaimEnd,
    final: finalElectedProclamation } = resultDeadlines("department", votingDate, days, calculationMode);

  return {
    valid: true,
    type: "department",
    academicYear,
    calculationMode,
    assumptions: buildAssumptions({
      calculationMode,
      duplicatesRemoved,
    }),
    events: [
      singleDayEvent(
        "convocation",
        "Convocatoria, publicación de esta y del calendario electoral",
        convocationDate,
        "Convocatoria del proceso electoral del departamento.",
        "Preparación",
      ),
      singleDayEvent(
        "provisional_census_publication",
        "Publicación de los censos provisionales",
        provisionalCensus,
        "Apertura del trámite de censo.",
        "Censo",
      ),
      rangeEvent(
        "census_publication_period",
        "Plazo en el que se mantendrán publicados los censos provisionales",
        provisionalCensus,
        censusPublicationEnd,
        "Exposición mínima del censo provisional.",
        "Censo",
      ),
      rangeEvent(
        "census_claim_period",
        "Plazo de reclamación a los censos provisionales",
        censusClaimStart,
        censusClaimEnd,
        "Incluye la publicación del censo y los tres días hábiles posteriores.",
        "Censo",
      ),
      singleDayEvent(
        "definitive_census_publication",
        "Resolución de reclamaciones y publicación del censo definitivo",
        definitiveCensus,
        "Cierre del trámite de censo.",
        "Censo",
      ),
      rangeEvent(
        "candidacy_submission_period",
        "Presentación de candidaturas",
        candidacySubmissionStart,
        candidacySubmissionEnd,
        "Plazo abierto tras la publicación del censo definitivo.",
        "Candidaturas",
      ),
      singleDayEvent(
        "provisional_candidatures_publication",
        "Publicación de candidaturas provisionales",
        provisionalCandidatures,
        "Publicación de candidaturas presentadas.",
        "Candidaturas",
      ),
      rangeEvent(
        "candidacy_claim_period",
        "Plazo en que se mantendrán publicadas las candidaturas presentadas y de reclamación a las mismas",
        candidacyClaimStart,
        candidacyClaimEnd,
        "Periodo conjunto de publicación y reclamación a candidaturas.",
        "Candidaturas",
      ),
      singleDayEvent(
        "candidacy_claims_resolution",
        "Resolución de reclamaciones a candidaturas",
        candidacyClaimsResolution,
        "Resolución de rectificaciones o reclamaciones a las candidaturas.",
        "Candidaturas",
      ),
      singleDayEvent(
        "definitive_candidatures_proclamation",
        "Proclamación definitiva de candidaturas",
        definitiveCandidatures,
        "Cierre del trámite de candidaturas.",
        "Candidaturas",
      ),
      rangeEvent(
        "campaign_electoral",
        "Campaña electoral",
        campaign.start,
        campaignEnd,
        "Periodo de campaña previo a la votación.",
        "Campaña",
      ),
      rangeEvent(
        "early_voting",
        "Voto anticipado",
        earlyVotingStart,
        earlyVotingEnd,
        "Puede emitirse desde el segundo día hábil posterior a la proclamación definitiva de candidaturas hasta el día hábil anterior a la votación.",
        "Campaña",
      ),
      singleDayEvent(
        "mesa_appointment",
        "Nombramiento de la Mesa Electoral",
        appointment,
        "Nombramiento por sorteo al menos 4 días hábiles antes de la votación.",
        "Preparación de votación",
      ),
      singleDayEvent(
        "interventors_appointment",
        "Nombramiento de Interventores",
        appointment,
        "Fecha límite para la solicitud de interventores con 4 días hábiles de antelación.",
        "Preparación de votación",
      ),
      singleDayEvent(
        "voting_and_scrutiny",
        "Votación y escrutinio",
        votingDate,
        "Jornada de votación y escrutinio posterior.",
        "Votación",
      ),
      singleDayEvent(
        "provisional_elected_proclamation",
        "Proclamación provisional de candidatos electos",
        provisionalElected,
        "La mesa publica la relación provisional de candidatos electos a continuación del escrutinio.",
        "Resultados",
      ),
      rangeEvent(
        "results_claim_period",
        "Plazo de reclamación de los resultados electorales",
        resultsClaimStart,
        resultsClaimEnd,
        "Periodo de reclamación e impugnación frente a los resultados provisionales.",
        "Resultados",
      ),
      singleDayEvent(
        "final_elected_proclamation",
        "Resolución de reclamaciones y proclamación de candidatos electos",
        finalElectedProclamation,
        "Cierre definitivo del proceso electoral.",
        "Resultados",
      ),
    ],
  };
}

// Las plantillas PDF y la web deben mostrar cuándo se reanuda cada plazo de participación.
function showInterruptedPeriods(schedule, days) {
  const participantRanges = new Set(["census_claim_period", "candidacy_submission_period", "candidacy_claim_period",
    "early_voting", "results_claim_period"]);
  for (const event of schedule.events) {
    if (!participantRanges.has(event.id)) continue;
    for (const entry of event.entries ?? [event]) {
      const blocks = [];
      let active = null;
      for (let date = entry.startDate; date <= entry.endDate; date = dayAfter(date)) {
        const key = isoDate(date);
        if (vacations.has(key) || exams.has(key)) {
          active = null;
        } else if (isBusinessDay(date, days.electoral)) {
          if (!active) {
            active = { start: date, end: date };
            blocks.push(active);
          }
          active.end = date;
        }
      }
      if (blocks.length < 2) continue;
      entry.segments = blocks;
      entry.webValue = blocks.map(({start, end}) => formatRangeLong(start, end)).join(" · ");
      const labels = blocks.map(({start, end}) => formatRangeCompact(start, end));
      entry.pdfValue = event.entries ? labels.join(" / ") : labels;
    }
    if (event.entries) {
      event.pdfBlocks = event.entries.map(entry => ({ primary: entry.pdfValue, secondary: entry.referenceLabel }));
      event.pdfValue = event.pdfBlocks.map(block => `${block.primary} ${block.secondary}`);
    }
  }
  return schedule;
}

export function calculateSchedule({
  type,
  convocationDate: convocationInput,
  electionDate: legacyElectionInput,
  electionDatesInput = [],
  calculationMode = "maximum",
  excludedDatesInput = [],
}) {
  const errors = [];
  const convocationDate = parseDateInput(convocationInput);
  const rawVotingInputs = Array.isArray(electionDatesInput) && electionDatesInput.length > 0
    ? electionDatesInput
    : [legacyElectionInput];
  const votingDates = parseVotingDates(rawVotingInputs);
  const normalizedCalculationMode = CALCULATION_MODES[calculationMode] ? calculationMode : "minimum";

  if (!CALENDAR_TYPES[type]) {
    errors.push("Selecciona un tipo de calendario válido.");
  }

  if (!CALCULATION_MODES[calculationMode]) {
    errors.push("Selecciona un criterio de cálculo válido.");
  }

  if (!convocationDate) {
    errors.push("Introduce una fecha de convocatoria válida en formato dd/mm/aaaa.");
  }

  if (votingDates.providedCount === 0) {
    errors.push("Introduce al menos una fecha de votación válida en formato dd/mm/aaaa.");
  }

  if (votingDates.providedCount > MAX_VOTING_DATES) {
    errors.push(`Solo puedes introducir hasta ${MAX_VOTING_DATES} fechas de votación.`);
  }

  if (votingDates.invalid.length > 0) {
    errors.push(`Hay fechas de votación no válidas: ${votingDates.invalid.join(", ")}.`);
  }

  if (type === "department" && votingDates.dates.length > DEPARTMENT_VOTING_DATES) {
    errors.push("Las elecciones a Consejo de Departamento requieren exactamente una fecha de votación.");
  }
  const days = getCalendarDays(excludedDatesInput);
  if (days.invalid.length) errors.push(`Hay fechas inhábiles adicionales no válidas: ${days.invalid.join(", ")}.`);
  if (convocationDate) {
    const year = suggestAcademicYear(convocationDate);
    if (!academicCalendars[year]) {
      errors.push(`Calendario oficial pendiente para el curso ${year}.`);
    } else if (!isBusinessDay(convocationDate, days.electoral)) {
      errors.push("La convocatoria debe situarse en un día hábil electoral fuera de exámenes y vacaciones.");
    }
  }
  if (errors.length) return { valid: false, errors };

  const academicYear = suggestAcademicYear(convocationDate);
  const pending = (year) => ({ valid: false, errors: [`Calendario oficial pendiente para el curso ${year}.`] });
  const latest = votingDates.dates.at(-1);
  const missing = missingAcademicYear(convocationDate, latest > convocationDate ? latest : convocationDate);
  if (missing) return pending(missing);

  const plan = prepareElection(type, convocationDate, days, normalizedCalculationMode);
  for (const vote of votingDates.dates) {
    const candidate = vote < plan.firstVote ? plan.firstVote : nextBusinessDayOnOrAfter(vote, days.electoral);
    const { final } = resultDeadlines(type, candidate, days, normalizedCalculationMode);
    const uncovered = missingAcademicYear(convocationDate, final);
    if (uncovered) return pending(uncovered);
    const help = formatFirstValidVotingDateMessage(candidate);
    if (!isBusinessDay(vote, days.electoral)) {
      const reason = exams.has(isoDate(vote)) ? "coincide con el periodo oficial de exámenes" : "es inhábil";
      errors.push(`La votación del ${formatDateInput(vote)} ${reason}.${help}`);
    } else if (vote < plan.firstVote) {
      if (type === "department") {
        errors.push(`La campaña puede comenzar el ${formatDateInput(plan.campaign.start)}. Deben caber 3 días hábiles de campaña electoral y el nombramiento de la mesa e interventores con 4 días hábiles de antelación.${help}`);
      } else {
        const previous = type === "group" ? "la resolución de reclamaciones y publicación del censo definitivo" : "la convocatoria";
        errors.push(`La primera votación debe celebrarse al menos un día hábil después de ${previous}.${help}`);
      }
    }
  }
  if (errors.length) return { valid: false, errors };
  const options = { convocationDate, votingDates: votingDates.dates, academicYear, days, calculationMode,
    duplicatesRemoved: votingDates.duplicatesRemoved, plan };
  const builders = { course: buildCourseSchedule, group: buildGroupSchedule, department: buildDepartmentSchedule };
  return showInterruptedPeriods(builders[type](options), days);
}
