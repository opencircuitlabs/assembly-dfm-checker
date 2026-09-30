const severityOrder = { error: 2, warning: 1, info: 0 };
const issue = (severity, code, reference, message, details = {}) => ({ severity, code, reference, message, ...details });
const effectiveSize = (component) => {
  const quarterTurn = Math.abs(Math.round((component.rotation ?? 0) / 90)) % 2 === 1;
  const width = (component.courtyard?.width ?? component.width ?? 0);
  const height = (component.courtyard?.height ?? component.height ?? 0);
  return quarterTurn ? { width: height, height: width } : { width, height };
};
const bounds = (component, expansion = 0) => { const size = effectiveSize(component); return { left: component.x - size.width / 2 - expansion, right: component.x + size.width / 2 + expansion, bottom: component.y - size.height / 2 - expansion, top: component.y + size.height / 2 + expansion }; };
const overlaps = (left, right) => left.left < right.right && left.right > right.left && left.bottom < right.top && left.top > right.bottom;

export function validateAssembly(board) {
  const issues = [];
  if (!(board?.width > 0) || !(board?.height > 0)) issues.push({ path: 'board', message: 'positive width and height are required' });
  if (!Array.isArray(board?.components)) issues.push({ path: 'components', message: 'must be an array' });
  const references = new Set();
  for (const [index, component] of (board?.components ?? []).entries()) {
    if (!component.reference) issues.push({ path: `components.${index}.reference`, message: 'is required' });
    if (references.has(component.reference)) issues.push({ path: `components.${index}.reference`, message: 'is duplicated' });
    references.add(component.reference);
    if (!Number.isFinite(component.x) || !Number.isFinite(component.y) || !Number.isFinite(component.rotation)) issues.push({ path: `components.${index}`, message: 'x, y, and rotation must be finite' });
    if (!['top', 'bottom'].includes(component.side)) issues.push({ path: `components.${index}.side`, message: 'must be top or bottom' });
    if (!component.dnp && (!(component.width > 0) || !(component.height > 0))) issues.push({ path: `components.${index}`, message: 'positive package width and height are required' });
  }
  return { valid: issues.length === 0, issues };
}

function componentChecks(board, component, rules, issues) {
  if (component.dnp) return;
  const box = bounds(component);
  const edge = rules.edgeClearance ?? 0.5;
  if (box.left < edge || box.bottom < edge || box.right > board.width - edge || box.top > board.height - edge) issues.push(issue('error', 'edge-clearance', component.reference, `courtyard violates ${edge} edge clearance`, { bounds: box }));
  const increment = rules.rotationIncrement ?? 1;
  const normalized = ((component.rotation % 360) + 360) % 360;
  if (Math.abs(normalized / increment - Math.round(normalized / increment)) > 1e-9) issues.push(issue('warning', 'rotation-grid', component.reference, `rotation is not a multiple of ${increment}`));
  if (component.polarized && !component.polarityMarking) issues.push(issue('error', 'missing-polarity-marking', component.reference, 'polarized component has no assembly polarity marking'));
  if (component.pin1Required && !component.pin1Marking) issues.push(issue('error', 'missing-pin1-marking', component.reference, 'pin 1 marking is required'));
  const maxHeight = component.side === 'top' ? rules.maxTopHeight : rules.maxBottomHeight;
  if (maxHeight != null && (component.heightZ ?? 0) > maxHeight) issues.push(issue('error', 'height-limit', component.reference, `${component.heightZ} exceeds ${component.side} limit ${maxHeight}`));
  if (component.side === 'bottom' && (rules.forbiddenBottomTypes ?? []).includes(component.type)) issues.push(issue('error', 'bottom-process-restriction', component.reference, `${component.type} is not allowed on bottom side`));
  if ((component.pitch ?? Infinity) < (rules.minPitch ?? 0.4)) issues.push(issue('warning', 'fine-pitch', component.reference, `pitch ${component.pitch} is below ${rules.minPitch ?? 0.4}`));
  const pads = component.pads ?? [];
  for (const [index, pad] of pads.entries()) {
    const copperArea = pad.area ?? ((pad.width ?? 0) * (pad.height ?? 0));
    const pasteArea = pad.pasteArea ?? copperArea;
    if (copperArea <= 0) { issues.push(issue('error', 'invalid-pad-area', component.reference, `pad ${index + 1} has no positive copper area`)); continue; }
    const ratio = pasteArea / copperArea;
    if (ratio < (rules.minPasteRatio ?? 0.5)) issues.push(issue('warning', 'low-paste-ratio', component.reference, `pad ${index + 1} paste ratio ${ratio.toFixed(3)} is low`));
    if (ratio > (rules.maxPasteRatio ?? 1)) issues.push(issue('warning', 'high-paste-ratio', component.reference, `pad ${index + 1} paste ratio ${ratio.toFixed(3)} is high`));
    if (pad.thermal && copperArea >= (rules.windowpaneAreaThreshold ?? 4) && !pad.windowpane) issues.push(issue('warning', 'thermal-pad-windowpane', component.reference, `pad ${index + 1} should use windowpane paste`));
  }
  if (pads.length === 2 && component.type === 'passive') {
    const areas = pads.map((pad) => pad.pasteArea ?? pad.area ?? ((pad.width ?? 0) * (pad.height ?? 0)));
    const mismatch = Math.abs(areas[0] - areas[1]) / Math.max(areas[0], areas[1], Number.EPSILON);
    if (mismatch > (rules.maxTwoPadPasteMismatch ?? 0.15)) issues.push(issue('warning', 'tombstone-risk', component.reference, `two-pad paste mismatch is ${(mismatch * 100).toFixed(1)}%`));
  }
}

export function analyzeAssembly(board, rules = {}) {
  const validation = validateAssembly(board);
  if (!validation.valid) throw new Error(`Invalid assembly: ${validation.issues.map((entry) => `${entry.path} ${entry.message}`).join('; ')}`);
  const issues = [];
  const fitted = board.components.filter((component) => !component.dnp);
  for (const component of fitted) componentChecks(board, component, rules, issues);
  const clearance = rules.componentClearance ?? 0.25;
  for (let leftIndex = 0; leftIndex < fitted.length; leftIndex += 1) for (let rightIndex = leftIndex + 1; rightIndex < fitted.length; rightIndex += 1) {
    const left = fitted[leftIndex]; const right = fitted[rightIndex];
    if (left.side === right.side && overlaps(bounds(left, clearance / 2), bounds(right, clearance / 2))) issues.push(issue('error', 'courtyard-overlap', `${left.reference},${right.reference}`, `same-side courtyards violate ${clearance} clearance`));
  }
  const sides = [...new Set(fitted.map((component) => component.side))];
  for (const side of sides) {
    const count = (board.fiducials ?? []).filter((fiducial) => !fiducial.side || fiducial.side === side).length;
    if (count < (rules.minGlobalFiducials ?? 3)) issues.push(issue('warning', 'insufficient-fiducials', side, `${count} usable global fiducials; ${(rules.minGlobalFiducials ?? 3)} required`));
  }
  issues.sort((left, right) => severityOrder[right.severity] - severityOrder[left.severity] || left.reference.localeCompare(right.reference) || left.code.localeCompare(right.code));
  const errors = issues.filter((entry) => entry.severity === 'error').length;
  const warnings = issues.filter((entry) => entry.severity === 'warning').length;
  const byCode = Object.fromEntries([...new Set(issues.map((entry) => entry.code))].sort().map((code) => [code, issues.filter((entry) => entry.code === code).length]));
  return { valid: errors === 0 && (!rules.warningsAsErrors || warnings === 0), errors, warnings, componentCount: board.components.length, fittedCount: fitted.length, dnpCount: board.components.length - fitted.length, issues, byCode };
}

export function centroidCsv(board) {
  const escape = (value) => /[",\n]/.test(String(value)) ? `"${String(value).replaceAll('"', '""')}"` : String(value);
  const rows = ['Reference,Value,Package,X,Y,Rotation,Side,DNP'];
  for (const component of [...board.components].sort((left, right) => left.reference.localeCompare(right.reference, undefined, { numeric: true }))) rows.push([component.reference, component.value ?? '', component.package ?? '', component.x, component.y, component.rotation, component.side, component.dnp ? 'yes' : ''].map(escape).join(','));
  return `${rows.join('\n')}\n`;
}

export function compareAudits(before, after) {
  const signature = (entry) => `${entry.severity}|${entry.code}|${entry.reference}|${entry.message}`;
  const oldIssues = new Map(before.issues.map((entry) => [signature(entry), entry]));
  const introduced = []; const resolved = [];
  for (const entry of after.issues) { const key = signature(entry); if (!oldIssues.has(key)) introduced.push(entry); oldIssues.delete(key); }
  resolved.push(...oldIssues.values());
  return { improved: after.errors < before.errors || (after.errors === before.errors && after.warnings < before.warnings), regressed: introduced.some((entry) => entry.severity === 'error'), introduced, resolved };
}

export function reportMarkdown(audit) {
  const lines = ['# Assembly DFM report', '', `Valid: ${audit.valid} | Errors: ${audit.errors} | Warnings: ${audit.warnings} | Fitted: ${audit.fittedCount} | DNP: ${audit.dnpCount}`, '', '| Severity | Code | Reference | Message |', '| --- | --- | --- | --- |'];
  for (const entry of audit.issues) lines.push(`| ${entry.severity} | ${entry.code} | ${entry.reference} | ${entry.message} |`);
  return `${lines.join('\n')}\n`;
}
