# Assembly DFM Checker

`assembly-dfm-checker` is a deterministic design-for-manufacturing gate for PCB assembly data. It evaluates placement geometry, assembly markings, process constraints, stencil ratios, and fiducial coverage, then produces machine-readable findings and review reports.

## Checks

- Assembly input structure and unique reference designators
- Rotated courtyard-to-board edge clearance
- Same-side courtyard collisions with process spacing
- Placement rotation increments
- Polarity and pin-one marking requirements
- Top- and bottom-side component height limits
- Bottom-side component-type restrictions
- Fine-pitch process warnings
- Per-pad paste-to-copper ratios
- Thermal-pad windowpane recommendations
- Two-terminal paste imbalance and tombstone risk
- Global fiducial availability by populated side
- DNP-aware fitted counts and geometry
- Audit regression comparison
- Sorted, quoted centroid CSV export

## Quick start

```bash
npm install
npm test
node src/cli.js validate examples/board.json
node src/cli.js analyze examples/board.json --rules examples/rules.json --output audit.json --markdown audit.md
node src/cli.js centroid examples/board.json --output centroid.csv
node src/cli.js compare previous-audit.json audit.json
```

After global installation, replace `node src/cli.js` with `assembly-dfm-checker`.

## Library API

```js
import { analyzeAssembly, centroidCsv, compareAudits } from '@opencircuitlabs/assembly-dfm-checker';

const audit = analyzeAssembly(board, {
  edgeClearance: 0.5,
  componentClearance: 0.25,
  rotationIncrement: 45,
  maxTopHeight: 4,
  maxBottomHeight: 2,
  forbiddenBottomTypes: ['connector'],
  warningsAsErrors: true
});
```

Coordinates, dimensions, pitch, and height use one caller-selected unit, normally millimetres. Component coordinates identify package centers. Courtyard dimensions are rotated for 90/270-degree placements and used for board-edge and same-side collision checks.

## Process policy

The default rules are intentionally general. Configure them for the assembler, stencil, placement line, soldering process, and product mechanical envelope. Warning-to-error promotion supports strict release gates without hiding the difference between a structural failure and a process-review item.

This tool does not replace solder-joint geometry analysis, stencil design, thermal simulation, machine-program review, AOI programming, or an assembler's DFM review. Validate source footprints, paste layers, polarity conventions, and production outputs before fabrication.

## License

MIT. See [LICENSE](LICENSE).
