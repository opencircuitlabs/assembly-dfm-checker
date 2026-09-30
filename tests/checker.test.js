import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeAssembly, centroidCsv, compareAudits, reportMarkdown, validateAssembly } from '../src/index.js';

const part = (reference, x, extras = {}) => ({ reference, value: '10k', package: '0603', type: 'passive', x, y: 5, rotation: 0, side: 'top', width: 1.6, height: 0.8, heightZ: 0.5, pads: [{ area: 0.5, pasteArea: 0.45 }, { area: 0.5, pasteArea: 0.45 }], ...extras });
const board = (...components) => ({ width: 20, height: 10, fiducials: [{ x: 1, y: 1 }, { x: 19, y: 1 }, { x: 19, y: 9 }], components: components.length ? components : [part('R1', 5), part('R2', 10)] });

test('validates a complete assembly model', () => assert.equal(validateAssembly(board()).valid, true));
test('rejects duplicate references and malformed placement fields', () => {
  const value = board(part('R1', 5), part('R1', NaN, { side: 'left', rotation: NaN, width: 0 }));
  assert.equal(validateAssembly(value).issues.length, 4);
});
test('accepts a clean assembly', () => {
  const result = analyzeAssembly(board()); assert.equal(result.valid, true); assert.equal(result.errors, 0); assert.equal(result.warnings, 0);
});
test('detects board-edge clearance violations', () => {
  const result = analyzeAssembly(board(part('R1', 0.7)), { edgeClearance: 0.5 }); assert.ok(result.issues.some((entry) => entry.code === 'edge-clearance'));
});
test('detects same-side courtyard collisions', () => {
  const result = analyzeAssembly(board(part('R1', 5), part('R2', 6)), { componentClearance: 0.25 }); assert.ok(result.issues.some((entry) => entry.code === 'courtyard-overlap'));
});
test('allows overlapping coordinates on opposite sides', () => {
  const result = analyzeAssembly(board(part('R1', 5), part('R2', 5, { side: 'bottom' }))); assert.ok(!result.issues.some((entry) => entry.code === 'courtyard-overlap'));
});
test('honors rotated courtyard dimensions', () => {
  const value = part('J1', 1, { width: 4, height: 1, rotation: 90, type: 'connector' }); const result = analyzeAssembly(board(value), { edgeClearance: 0.4 }); assert.equal(result.errors, 0);
});
test('checks rotation manufacturing grid', () => {
  const result = analyzeAssembly(board(part('R1', 5, { rotation: 12 })), { rotationIncrement: 5 }); assert.ok(result.issues.some((entry) => entry.code === 'rotation-grid'));
});
test('requires polarity and pin-one markings', () => {
  const value = part('U1', 5, { type: 'ic', polarized: true, pin1Required: true }); const codes = analyzeAssembly(board(value)).issues.map((entry) => entry.code);
  assert.ok(codes.includes('missing-polarity-marking')); assert.ok(codes.includes('missing-pin1-marking'));
});
test('checks top and bottom height limits', () => {
  const value = board(part('J1', 5, { heightZ: 6 }), part('J2', 10, { side: 'bottom', heightZ: 3 })); const result = analyzeAssembly(value, { maxTopHeight: 5, maxBottomHeight: 2 });
  assert.equal(result.issues.filter((entry) => entry.code === 'height-limit').length, 2);
});
test('enforces bottom-side process restrictions', () => {
  const result = analyzeAssembly(board(part('J1', 5, { type: 'connector', side: 'bottom' })), { forbiddenBottomTypes: ['connector'] }); assert.ok(result.issues.some((entry) => entry.code === 'bottom-process-restriction'));
});
test('flags fine-pitch components', () => {
  const result = analyzeAssembly(board(part('U1', 5, { pitch: 0.3, type: 'ic' })), { minPitch: 0.4 }); assert.ok(result.issues.some((entry) => entry.code === 'fine-pitch'));
});
test('checks paste ratios and invalid pad area', () => {
  const value = part('U1', 5, { pads: [{ area: 1, pasteArea: 0.2 }, { area: 1, pasteArea: 1.2 }, { area: 0 }] }); const codes = analyzeAssembly(board(value)).issues.map((entry) => entry.code);
  assert.ok(codes.includes('low-paste-ratio')); assert.ok(codes.includes('high-paste-ratio')); assert.ok(codes.includes('invalid-pad-area'));
});
test('flags large thermal pads without windowpane paste', () => {
  const value = part('U1', 5, { type: 'ic', pads: [{ area: 9, pasteArea: 6, thermal: true }] }); assert.ok(analyzeAssembly(board(value)).issues.some((entry) => entry.code === 'thermal-pad-windowpane'));
});
test('detects two-terminal paste imbalance tombstone risk', () => {
  const value = part('R1', 5, { pads: [{ area: 1, pasteArea: 1 }, { area: 1, pasteArea: 0.5 }] }); assert.ok(analyzeAssembly(board(value)).issues.some((entry) => entry.code === 'tombstone-risk'));
});
test('reports insufficient global fiducials per populated side', () => {
  const value = board(); value.fiducials = [{ x: 1, y: 1, side: 'top' }]; assert.ok(analyzeAssembly(value).issues.some((entry) => entry.code === 'insufficient-fiducials'));
});
test('excludes DNP components from geometry and fitted counts', () => {
  const result = analyzeAssembly(board(part('R1', 0, { dnp: true }))); assert.equal(result.fittedCount, 0); assert.equal(result.dnpCount, 1); assert.equal(result.errors, 0);
});
test('strict mode fails an otherwise warning-only audit', () => {
  const result = analyzeAssembly(board(part('U1', 5, { pitch: 0.3, type: 'ic' })), { minPitch: 0.4, warningsAsErrors: true }); assert.equal(result.valid, false); assert.equal(result.errors, 0);
});
test('exports sorted centroid CSV with quoted values', () => {
  const csv = centroidCsv(board(part('R10', 10), part('R2', 5, { value: '1k, 1%' }))); assert.match(csv, /^Reference,Value/); assert.ok(csv.indexOf('R2') < csv.indexOf('R10')); assert.match(csv, /"1k, 1%"/);
});
test('compares introduced and resolved audit issues', () => {
  const clean = analyzeAssembly(board()); const bad = analyzeAssembly(board(part('D1', 5, { polarized: true })));
  assert.equal(compareAudits(clean, bad).regressed, true); assert.equal(compareAudits(bad, clean).improved, true); assert.ok(compareAudits(bad, clean).resolved.length > 0);
});
test('renders a Markdown issue report', () => {
  const audit = analyzeAssembly(board(part('D1', 5, { polarized: true }))); const markdown = reportMarkdown(audit); assert.match(markdown, /Assembly DFM report/); assert.match(markdown, /missing-polarity-marking/);
});
