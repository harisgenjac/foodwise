import { toCsv } from "../src/utils/csv.js";

describe("toCsv", () => {
  it("starts with a BOM, separates columns with ; and ends lines with CRLF", () => {
    expect(toCsv(["a", "b"], [["x", "y"]])).toBe("﻿a;b\r\nx;y\r\n");
  });

  it("writes integers as they are and decimals with two places and a comma", () => {
    expect(toCsv(["n"], [[3], [2.5], [0.125], [-1.5]])).toBe("﻿n\r\n3\r\n2,50\r\n0,13\r\n-1,50\r\n");
  });

  it("leaves null cells empty", () => {
    expect(toCsv(["a", "b", "c"], [[null, "x", null]])).toBe("﻿a;b;c\r\n;x;\r\n");
  });

  it("quotes text with a delimiter, a quote or a line break", () => {
    expect(toCsv(["t"], [["a;b"], ['say "hi"'], ["two\nlines"]])).toBe(
      '﻿t\r\n"a;b"\r\n"say ""hi"""\r\n"two\nlines"\r\n',
    );
  });

  it("keeps text that looks like a formula from running in a spreadsheet", () => {
    expect(toCsv(["t"], [["=1+1"], ["+38761"], ["-x"], ["@SUM(A1)"], ["ok=1"]])).toBe(
      "﻿t\r\n'=1+1\r\n'+38761\r\n'-x\r\n'@SUM(A1)\r\nok=1\r\n",
    );
  });
});
