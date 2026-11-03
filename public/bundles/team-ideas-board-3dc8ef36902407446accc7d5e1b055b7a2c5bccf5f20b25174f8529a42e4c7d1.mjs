import { spawnSync } from "node:child_process";

function run(command, allowed = [0]) {
  console.log("\n> " + command);
  const result = spawnSync(command, { shell: true, stdio: "inherit" });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (!allowed.includes(result.status)) {
    console.error("Setup stopped. Any created app folder is preserved. Resolve the native error before resuming; see the gallery setup guide.");
    process.exit(result.status ?? 1);
  }
  return result.status;
}

const ms = "npx --yes --package=@microsoft/managed-apps-cli -- ms ";
run(ms + "auth login");
run(ms + "auth status");
run(ms + "app create ./team-ideas-board --repo native --template github:microsoft/copilot-studio-gallery/submissions/team-ideas-board/app#main");
process.chdir("./team-ideas-board");
run(ms + "app add data-source --connector shared_sharepointonline --as table");
run("npm install");
run(ms + "app pack");
run("git add --all");
if (run("git diff --cached --quiet", [0, 1]) === 1) {
  run('git commit -m "Configure gallery app" -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"');
}
run("git push --set-upstream origin HEAD");
run(ms + "app build");
console.log("\nOpen preview with the same account and tenant shown by ms auth status. If your default browser uses another profile, open the printed preview URL in the matching profile.");
run(ms + "app play --mode preview");
