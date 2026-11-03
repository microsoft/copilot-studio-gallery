import { appSetupSchema, managedAppSchema, type AppSetup, type ManagedAppRecord } from "./schema";
import { publicAssetPath, SITE_ORIGIN } from "./site";

export function appInstallScript(templateValue: string, setup: AppSetup): string {
  const template = managedAppSchema.shape.template.parse(templateValue);
  const app = appSetupSchema.parse(setup);
  const slug = template.split("/")[3];
  const bindings = app.connectors.map((binding) => {
    let command = `app add data-source --connector ${binding.connector} --as ${binding.mode}`;
    if (binding.connector === "shared_commondataserviceforapps" && binding.mode === "table") {
      if (!binding.table || !/^[A-Za-z][A-Za-z0-9_]{0,99}$/.test(binding.table)) {
        throw new Error("Dataverse table bindings require a logical table name, not a display label.");
      }
      command += ` --table ${binding.table}`;
    }
    return `run(ms + ${JSON.stringify(command)});`;
  }).join("\n");
  return `import { spawnSync } from "node:child_process";

function run(command, allowed = [0]) {
  console.log("\\n> " + command);
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
run(ms + ${JSON.stringify(`app create ./${slug} --repo native --template ${template}`)});
process.chdir(${JSON.stringify(`./${slug}`)});
${bindings}
run("npm install");
run(ms + "app pack");
run("git add --all");
if (run("git diff --cached --quiet", [0, 1]) === 1) {
  run('git commit -m "Configure gallery app" -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"');
}
run("git push --set-upstream origin HEAD");
run(ms + "app build");
console.log("\\nOpen preview with the same account and tenant shown by ms auth status. If your default browser uses another profile, open the printed preview URL in the matching profile.");
run(ms + "app play --mode preview");
`;
}

export function appInstallCommand(app: Pick<ManagedAppRecord, "installScript">): string {
  const path = managedAppSchema.shape.installScript.parse(app.installScript);
  const url = `${SITE_ORIGIN}${publicAssetPath(path)}`;
  return `node --input-type=module -e "const r=await fetch('${url}');if(r.ok===false)throw new Error('Setup download failed: '+r.status);await import('data:text/javascript,'+encodeURIComponent(await r.text()));"`;
}
