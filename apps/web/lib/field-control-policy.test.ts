import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  findFieldControlViolations,
  formatFieldControlViolations,
  FIELD_CONTROL_EXEMPTIONS,
} from "./field-control-policy.ts";

const webRoot = resolve(import.meta.dirname, "..");

function componentSources(): readonly string[] {
  return ["components", "app"].flatMap((directory) =>
    readdirSync(resolve(webRoot, directory), { recursive: true, encoding: "utf8" })
      .filter((entry) => entry.endsWith(".tsx"))
      .map((entry) => `${directory}/${entry}`));
}

test("accepts a field whose control is a design-system primitive", () => {
  // Arrange
  const source = `export const A = () => <Field label="Age"><Input name="age" /></Field>;`;

  // Act / Assert
  assert.deepEqual(findFieldControlViolations(source, "a.tsx"), []);
});

test("accepts the control wherever it sits in the field, which is the whole point", () => {
  // Arrange — the three shapes the old positional contract broke on: wrapped in a layout
  // div, preceded by another child, and preceded by a conditional.
  const wrapped = `export const A = () => <Field label="Load"><div className="flex"><Input /></div></Field>;`;
  const second = `export const A = () => <Field label="Load"><p>Hint</p><Select /></Field>;`;
  const guarded = `export const A = ({ busy }) => <Field label="Load">{busy ? <Spinner /> : null}<Textarea /></Field>;`;

  // Act / Assert
  for (const source of [wrapped, second, guarded]) {
    assert.deepEqual(findFieldControlViolations(source, "a.tsx"), []);
  }
});

test("accepts a non-primitive control that claims the wiring explicitly", () => {
  // Arrange — a file picker is not one of the three primitives, so it spreads the hook's
  // props itself. That is the escape hatch, and it is visible at the call site.
  const source = `export const A = () => {
    const control = useFieldControl();
    return <Field label="Choose image"><input type="file" {...control} /></Field>;
  };`;

  // Act / Assert
  assert.deepEqual(findFieldControlViolations(source, "a.tsx"), []);
});

test("traces the claim into a control component declared in the same file", () => {
  // Arrange — the hook can only be called below the provider, so a control that is not a
  // primitive has to be its own component. The claim is still visible in the file, which is
  // what the guard reads.
  const declared = `
    function ImagePicker() {
      const control = useFieldControl();
      return <input type="file" {...control} />;
    }
    export const A = () => <Field label="Choose image"><ImagePicker /></Field>;`;
  const inlineCall = `
    const ImagePicker = () => <input type="file" {...useFieldControl()} />;
    export const A = () => <Field label="Choose image"><ImagePicker /></Field>;`;

  // Act / Assert
  for (const source of [declared, inlineCall]) {
    assert.deepEqual(findFieldControlViolations(source, "a.tsx"), []);
  }
});

test("traces the props-splitting form of the claim too", () => {
  // Arrange — `useFieldControlProps` is the shape the three primitives use, and a custom control
  // could reasonably reach for it; the wiring is the pair's first element. Untraced, this would
  // read as no claim and flag working code.
  const source = `
    function RangePicker(props) {
      const [field, rest] = useFieldControlProps(props);
      return <input type="range" {...field} {...rest} />;
    }
    export const A = () => <Field label="Effort"><RangePicker /></Field>;`;

  // Act / Assert
  assert.deepEqual(findFieldControlViolations(source, "a.tsx"), []);
});

test("the leftovers half of that pair is not the claim", () => {
  // Arrange — `rest` is explicitly everything the field does *not* supply, so spreading only it
  // claims nothing.
  const source = `
    function RangePicker(props) {
      const [field, rest] = useFieldControlProps(props);
      return <input type="range" {...rest} />;
    }
    export const A = () => <Field label="Effort"><RangePicker /></Field>;`;

  // Act / Assert
  assert.deepEqual(findFieldControlViolations(source, "a.tsx").map(({ problem }) => problem),
    ["unclaimed"]);
});

test("a control component from another file claims nothing this guard can see", () => {
  // Arrange — fail closed: an imported component may or may not call the hook, and the guard
  // reads one file. Rendering a primitive, or declaring the claimant here, is the way out.
  const source = `import { ImagePicker } from "./picker";
    export const A = () => <Field label="Choose image"><ImagePicker /></Field>;`;

  // Act / Assert
  assert.deepEqual(findFieldControlViolations(source, "a.tsx").map(({ problem }) => problem),
    ["unclaimed"]);
});

test("reports a field no control claims, because its label then points at nothing", () => {
  // Arrange — the failure the context contract introduces in place of the positional one,
  // and the reason it is mechanized: a raw control inside a `Field` reads as wired.
  const source = `export const A = () => <Field label="Choose image" hint="2 MB max."><input type="file" /></Field>;`;

  // Act
  const violations = findFieldControlViolations(source, "a.tsx");

  // Assert
  assert.deepEqual(violations, [
    { file: "a.tsx", line: 1, element: "Field", problem: "unclaimed", controls: 0 },
  ]);
  assert.match(formatFieldControlViolations(violations), /a\.tsx:1 — <Field>.*no control claims.*useFieldControl/);
});

test("reports a bare control naming its own id, the one shape that used to work", () => {
  // Arrange — the field used to *read* this id and clone the wiring onto the child, so this
  // call site was wired before and is wired to nothing now. It is the only way this change can
  // make an existing call site worse, so it is reported rather than left to be discovered.
  const source = `export const A = () => <Field label="Load" hint="Kilograms."><input id="load" /></Field>;`;

  // Act / Assert — unclaimed, not `competing-id`: nothing is claiming for the id to compete
  // with, which is exactly the problem.
  assert.deepEqual(findFieldControlViolations(source, "a.tsx").map(({ problem }) => problem),
    ["unclaimed"]);
});

test("reports two controls in one field, which would claim the same id", () => {
  // Arrange — the old contract silently wired the first and left the second unlabelled;
  // under the context both take the id, so the ambiguity is the finding.
  const source = `export const A = () => <Field label="Range"><Input name="low" /><Input name="high" /></Field>;`;

  // Act
  const violations = findFieldControlViolations(source, "a.tsx");

  // Assert
  assert.deepEqual(violations.map(({ problem, controls }) => ({ problem, controls })),
    [{ problem: "ambiguous", controls: 2 }]);
  assert.match(formatFieldControlViolations(violations), /two controls|2 controls/);
});

test("an auxiliary button beside the control is not a control", () => {
  // Arrange — `EquipmentField`'s preset button: a child of the field, and it must claim
  // none of the wiring.
  const source = `export const A = () => <Field label="Equipment"><Input name="equipment" /><Button>Preset</Button></Field>;`;

  // Act / Assert
  assert.deepEqual(findFieldControlViolations(source, "a.tsx"), []);
});

test("reports a control that names its own id, which the label does not point at", () => {
  // Arrange — the field owns the id, because its `<label for>` is what points at it. A
  // control naming a second one is the old silent break wearing different clothes.
  const source = `export const A = () => <Field label="Name"><Input id="exercise-name" /></Field>;`;

  // Act
  const violations = findFieldControlViolations(source, "a.tsx");

  // Assert
  assert.deepEqual(violations.map(({ problem }) => problem), ["competing-id"]);
  assert.match(formatFieldControlViolations(violations), /name the id once, as htmlFor/);
});

test("naming the id on the field is how a call site picks one", () => {
  // Arrange — `htmlFor` reaches the label and the control from one place.
  const source = `export const A = () => <Field label="Name" htmlFor="exercise-name"><Input /></Field>;`;

  // Act / Assert
  assert.deepEqual(findFieldControlViolations(source, "a.tsx"), []);
});

test("a control inside a grouped FieldLabel may name itself, since no label points at it", () => {
  // Arrange — a fieldset's controls carry their own names, so an id there competes with
  // nothing.
  const source = `export const A = () => <FieldLabel group label="Distance"><Input id="low" /></FieldLabel>;`;

  // Act / Assert
  assert.deepEqual(findFieldControlViolations(source, "a.tsx"), []);
});

test("the compact FieldLabel is held to the same contract", () => {
  // Arrange — it renders a `Field`, so its subtree needs a claimant too.
  const source = `export const A = () => <FieldLabel label="Sets"><Input type="number" /></FieldLabel>;`;
  const bare = `export const A = () => <FieldLabel label="Sets"><Slider /></FieldLabel>;`;

  // Act / Assert
  assert.deepEqual(findFieldControlViolations(source, "a.tsx"), []);
  assert.deepEqual(findFieldControlViolations(bare, "a.tsx").map(({ element }) => element), ["FieldLabel"]);
});

test("a grouped FieldLabel is a fieldset and legend, so it has no id to claim", () => {
  // Arrange — the `group` branch renders no `Field` and no `<label htmlFor>`: each control
  // inside carries its own accessible name, and two of them is the normal case (ADR-0032's
  // distance-and-time pair).
  const source = `export const A = () => <FieldLabel group label="Set 1 distance (km)">
    <FieldRow><Input aria-label="Set 1 distance" /><Input aria-label="Set 1 time" /></FieldRow>
  </FieldLabel>;`;

  // Act / Assert
  assert.deepEqual(findFieldControlViolations(source, "a.tsx"), []);
});

test("fails closed on a group flag it cannot read", () => {
  // Arrange — `group={composite}` is both call sites at once: a fieldset wanting two
  // controls, or a field wanting exactly one. The guard cannot pick, so it asks.
  const source = `export const A = ({ composite }) => <FieldLabel group={composite} label="Load"><Input /></FieldLabel>;`;

  // Act / Assert
  assert.deepEqual(findFieldControlViolations(source, "a.tsx").map(({ problem }) => problem),
    ["undecidable-group"]);
});

test("a nested field owns its own control rather than lending it to the outer one", () => {
  // Arrange — the inner field is wired, the outer one is not, and counting the inner's
  // control twice would hide exactly that.
  const source = `export const A = () => <Field label="Outer"><FieldLabel label="Inner"><Input /></FieldLabel></Field>;`;

  // Act / Assert
  assert.deepEqual(findFieldControlViolations(source, "a.tsx").map(({ element, problem }) =>
    ({ element, problem })), [{ element: "Field", problem: "unclaimed" }]);
});

test("a spread the guard cannot trace to the hook claims nothing", () => {
  // Arrange — `{...props}` may or may not carry the wiring, which is the same reason
  // `form-input-policy` refuses to read one as a declaration.
  const source = `export const A = (props) => <Field label="Load"><input {...props} /></Field>;`;

  // Act / Assert
  assert.deepEqual(findFieldControlViolations(source, "a.tsx").map(({ problem }) => problem),
    ["unclaimed"]);
});

test("every field in the component tree has exactly one claimant", () => {
  // Arrange
  const files = componentSources();

  // Act
  const violations = files.flatMap((file) =>
    findFieldControlViolations(readFileSync(resolve(webRoot, file), "utf8"), file));

  // Assert
  assert.equal(violations.length, 0, `\n${formatFieldControlViolations(violations)}\n`);
  assert.ok(files.length > 100, `expected the sweep to cover the component tree, saw ${files.length} files`);
});

test("the sweep reaches the fields that are actually there", () => {
  // Arrange — a guard that silently matched nothing would report a clean tree forever. The
  // two forms with the most fields are the floor.
  for (const file of ["components/ProfileForm.tsx", "components/prescription/PrescriptionFieldStack.tsx"]) {
    const source = readFileSync(resolve(webRoot, file), "utf8");

    // Act — break every claim in the file and count what the guard then finds.
    const broken = source.replace(/<(Input|Select|Textarea)\b/g, "<Slider");

    // Assert
    assert.ok(findFieldControlViolations(broken, file).length > 5,
      `${file}: the sweep found no fields to hold`);
  }
});

test("every field-control exemption carries a reason a reviewer can weigh", () => {
  // Arrange & Act & Assert: the registry ships empty; an entry must justify itself.
  for (const exemption of FIELD_CONTROL_EXEMPTIONS) {
    assert.ok(exemption.reason.trim().length > 0, `${exemption.file}: has no reason`);
    assert.ok(componentSources().includes(exemption.file), `${exemption.file} is not a component source`);
  }
});
