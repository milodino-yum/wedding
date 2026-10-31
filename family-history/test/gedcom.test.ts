import { describe, expect, it } from "vitest";
import { parseGedcom, parseLines, yearOf } from "../public/gedcom.js";
import { yearOf as serverYearOf } from "../src/importer";
import { FIXTURE_GEDCOM } from "./fixture-gedcom";

const parsed = parseGedcom(FIXTURE_GEDCOM, { currentYear: 2026 });
const person = (xref: string) => parsed.people.find((p) => p.xref === xref)!;

describe("GEDCOM parser", () => {
  it("reads the header, people and families", () => {
    expect(parsed.source).toBe("Ancestry.com Family Trees");
    expect(parsed.treeName).toBe("Hartwell Family Tree");
    expect(parsed.stats.people).toBe(6);
    expect(parsed.stats.families).toBe(2);
    expect(parsed.warnings).toEqual([]);
  });

  it("reads names, alternate names and suffixes", () => {
    expect(person("@I1@")).toMatchObject({ given: "Josef", surname: "Hartwell", suffix: null, sex: "M", altNames: ["Józef Hartwelski"] });
    expect(person("@I2@").altNames).toEqual(["Anna Hartwell"]);
    expect(person("@I3@")).toMatchObject({ given: "Walter", surname: "Hartwell", suffix: "Sr." });
    expect(person("@I5@").suffix).toBe("Jr.");
  });

  it("reads births, deaths and life events", () => {
    const josef = person("@I1@");
    expect(josef).toMatchObject({ birthDate: "abt 1871", birthPlace: "Kraków, Poland", deathDate: "Bef. 9 May 1941" });
    const kinds = josef.events.map((e) => `${e.kind}:${e.label}`);
    expect(kinds).toEqual(["BIRT:Born", "EVEN:Arrival", "RESI:Lived in", "_MILT:Military service", "DEAT:Died", "BURI:Buried", "MARR:Married Anna Kowal"]);
    expect(josef.events.find((e) => e.kind === "EVEN")).toMatchObject({ date: "14 MAR 1893", place: "New York, New York, USA" });
  });

  it("joins continued lines", () => {
    expect(person("@I2@").events.find((e) => e.kind === "RESI")?.details).toBe("Ran a boarding house\nfor railway workers");
    expect(person("@I2@").events.find((e) => e.kind === "RESI")?.place).toBe("Scranton, Lackawanna, Pennsylvania, USA");
    const roots = parseLines(FIXTURE_GEDCOM);
    const find = (n: { children: typeof roots }, tag: string) => n.children.find((c) => c.tag === tag)!;
    const page = find(find(find(roots.find((r) => r.xref === "@I1@")!, "RESI"), "SOUR"), "PAGE");
    expect(page.value).toBe("Year: 1910; Census Place: Scranton Ward 4, Lackawanna, Pennsylvania; Roll: T624_1351; Page: 7B");
  });

  it("puts marriages on both partners once, naming the spouse", () => {
    const josefMarriages = person("@I1@").events.filter((e) => e.kind === "MARR");
    expect(josefMarriages).toEqual([{ kind: "MARR", label: "Married Anna Kowal", date: "1896", place: "Scranton, Pennsylvania", details: null }]);
    expect(person("@I2@").events.filter((e) => e.kind === "MARR").map((e) => e.label)).toEqual(["Married Josef Hartwell"]);
  });

  it("reads families and drops links to people not in the file", () => {
    expect(parsed.families).toEqual([
      { xref: "@F1@", partner1: "@I1@", partner2: "@I2@", children: ["@I3@"], marriageDate: "1896", marriagePlace: "Scranton, Pennsylvania" },
      { xref: "@F2@", partner1: "@I3@", partner2: "@I4@", children: ["@I5@"], marriageDate: "1924", marriagePlace: null },
    ]);
  });

  it("guesses who may be living, erring on the private side", () => {
    expect(person("@I1@").isLiving).toBe(false); // has a death record
    expect(person("@I2@").isLiving).toBe(false); // born 1875
    expect(person("@I3@").isLiving).toBe(false); // born 1899, no death record
    expect(person("@I4@").isLiving).toBe(false); // no birth date, but married in 1924
    expect(person("@I5@").isLiving).toBe(true); // born 1962
    expect(person("@I6@").isLiving).toBe(true); // nothing known
    expect(person("@I6@").birthDate).toBeNull(); // "UNKNOWN" isn't a date
  });

  it("finds years in hand-typed dates, the same way on both sides", () => {
    const cases: [string, number | null][] = [
      ["1910", 1910], ["abt 1871", 1871], ["Bef. 9 May 1941", 1941], ["03/14/1875", 1875],
      ["Sep 5, 1899", 1899], ["1890-1895", 1890], ["UNKNOWN", null], ["12345", null],
    ];
    for (const [date, year] of cases) {
      expect(yearOf(date), date).toBe(year);
      expect(serverYearOf(date), date).toBe(year);
    }
  });
});
