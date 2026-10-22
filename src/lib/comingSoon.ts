import { solutionMakeup, type Category } from "./schema";

/** Placeholder cards shown at the end of the community gallery for solutions that are on their way. */
export const COMING_SOON: ReadonlyArray<{ name: string; makeup: string; category: Category; description: string }> = [
  {
    name: "Accounting Files Compiler",
    makeup: solutionMakeup(1, 1),
    category: "Finance",
    description: "Gathers invoices, receipts, and ledger exports from SharePoint and email, then compiles them into one reconciled, audit-ready file for month-end close.",
  },
  {
    name: "Spreadsheet Insights Analyser",
    makeup: solutionMakeup(1, 1),
    category: "Productivity & knowledge",
    description: "Reads Excel workbooks as they land, spots trends and outliers, and sends a plain-language summary with suggested next steps to Teams.",
  },
];
